import type { BudgetPeriod, IsoDate } from "@/lib/dates";
import type { BudgetRow, CategoryRow, PaymentMethod, TransactionRow } from "@/lib/supabase/database.types";
import { savingsEffect } from "./summary";

// Pure calculations behind the analytics and reports pages. Like the month
// summary, transfers are never income or spending: they only move savings.

export type InsightTransaction = Pick<
  TransactionRow,
  | "id"
  | "kind"
  | "amount_minor"
  | "occurred_on"
  | "account_id"
  | "to_account_id"
  | "category_id"
  | "savings_goal_id"
  | "payment_method"
  | "description"
>;

type IsSavings = (accountId: string | null) => boolean;

export type PeriodTotals = {
  incomeMinor: number;
  expensesMinor: number;
  /** Net money moved into savings: contributions minus withdrawals. */
  savedMinor: number;
  /** Income minus expenses. */
  netMinor: number;
  /** Saved as a share of income, or null when there was no income. */
  savingsRate: number | null;
};

export type MonthTotals = PeriodTotals & { month: IsoDate };

export function totalsOf(transactions: InsightTransaction[], isSavings: IsSavings): PeriodTotals {
  let incomeMinor = 0;
  let expensesMinor = 0;
  let savedMinor = 0;
  for (const t of transactions) {
    if (t.kind === "income") incomeMinor += t.amount_minor;
    else if (t.kind === "expense") expensesMinor += t.amount_minor;
    else savedMinor += savingsEffect(t, isSavings);
  }
  return {
    incomeMinor,
    expensesMinor,
    savedMinor,
    netMinor: incomeMinor - expensesMinor,
    savingsRate: incomeMinor > 0 ? (savedMinor / incomeMinor) * 100 : null,
  };
}

/**
 * Totals for each period, oldest first. `periods` must be consecutive budget
 * periods; transactions outside all of them are ignored.
 */
export function monthlyTotals(transactions: InsightTransaction[], periods: BudgetPeriod[], isSavings: IsSavings): MonthTotals[] {
  const buckets = periods.map(() => [] as InsightTransaction[]);
  for (const t of transactions) {
    const index = periods.findIndex((p) => t.occurred_on >= p.start && t.occurred_on < p.end);
    if (index >= 0) buckets[index].push(t);
  }
  return periods.map((p, i) => ({ month: p.month, ...totalsOf(buckets[i], isSavings) }));
}

export type CategoryAmount = {
  /** Category id, "uncategorized", or "other" for the folded tail. */
  id: string;
  name: string;
  color: string;
  amountMinor: number;
  /** Share of the kind's total, 0-100. */
  share: number;
};

const NEUTRAL = "#64748b";

/**
 * Totals per category for one kind, largest first. With `limit`, everything
 * after the first `limit - 1` categories folds into a single "Other" row.
 */
export function amountsByCategory(
  transactions: InsightTransaction[],
  kind: "income" | "expense",
  categories: Pick<CategoryRow, "id" | "name" | "color">[],
  limit?: number,
): CategoryAmount[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<string, number>();
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== kind) continue;
    const key = t.category_id ?? "uncategorized";
    sums.set(key, (sums.get(key) ?? 0) + t.amount_minor);
    total += t.amount_minor;
  }

  const rows: CategoryAmount[] = [...sums]
    .map(([id, amountMinor]) => {
      const category = byId.get(id);
      return {
        id,
        name: category?.name ?? "Uncategorized",
        color: category?.color ?? NEUTRAL,
        amountMinor,
        share: total > 0 ? (amountMinor / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name));

  if (limit === undefined || rows.length <= limit) return rows;
  const kept = rows.slice(0, limit - 1);
  const rest = rows.slice(limit - 1);
  const otherMinor = rest.reduce((sum, r) => sum + r.amountMinor, 0);
  kept.push({ id: "other", name: `Other (${rest.length})`, color: NEUTRAL, amountMinor: otherMinor, share: (otherMinor / total) * 100 });
  return kept;
}

export type ReportCategoryLine = CategoryAmount & {
  budgetMinor: number | null;
  previousMinor: number;
};

export type PaymentMethodLine = { method: PaymentMethod | null; amountMinor: number; count: number };

export type MonthReport = {
  totals: PeriodTotals;
  previousTotals: PeriodTotals;
  expensesByCategory: ReportCategoryLine[];
  incomeByCategory: CategoryAmount[];
  expensesByPaymentMethod: PaymentMethodLine[];
  largestExpenses: InsightTransaction[];
  transactionCount: number;
};

/** Everything the monthly report shows, from the period's and the previous period's transactions. */
export function buildMonthReport(input: {
  current: InsightTransaction[];
  previous: InsightTransaction[];
  categories: Pick<CategoryRow, "id" | "name" | "color">[];
  budgets: Pick<BudgetRow, "category_id" | "amount_minor">[];
  isSavings: IsSavings;
}): MonthReport {
  const budgetByCategory = new Map(input.budgets.map((b) => [b.category_id, b.amount_minor]));
  const previousByCategory = new Map(
    amountsByCategory(input.previous, "expense", input.categories).map((c) => [c.id, c.amountMinor]),
  );

  const expensesByCategory: ReportCategoryLine[] = amountsByCategory(input.current, "expense", input.categories).map((c) => ({
    ...c,
    budgetMinor: budgetByCategory.get(c.id) ?? null,
    previousMinor: previousByCategory.get(c.id) ?? 0,
  }));
  // Budgeted categories with no spending still belong in a budget-vs-actual table.
  const names = new Map(input.categories.map((c) => [c.id, c]));
  for (const [categoryId, budgetMinor] of budgetByCategory) {
    if (expensesByCategory.some((l) => l.id === categoryId)) continue;
    const category = names.get(categoryId);
    expensesByCategory.push({
      id: categoryId,
      name: category?.name ?? "Unknown category",
      color: category?.color ?? NEUTRAL,
      amountMinor: 0,
      share: 0,
      budgetMinor,
      previousMinor: previousByCategory.get(categoryId) ?? 0,
    });
  }

  const methods = new Map<PaymentMethod | null, PaymentMethodLine>();
  for (const t of input.current) {
    if (t.kind !== "expense") continue;
    const line = methods.get(t.payment_method) ?? { method: t.payment_method, amountMinor: 0, count: 0 };
    line.amountMinor += t.amount_minor;
    line.count += 1;
    methods.set(t.payment_method, line);
  }

  return {
    totals: totalsOf(input.current, input.isSavings),
    previousTotals: totalsOf(input.previous, input.isSavings),
    expensesByCategory,
    incomeByCategory: amountsByCategory(input.current, "income", input.categories),
    expensesByPaymentMethod: [...methods.values()].sort((a, b) => b.amountMinor - a.amountMinor),
    largestExpenses: input.current
      .filter((t) => t.kind === "expense")
      .sort((a, b) => b.amount_minor - a.amount_minor || b.occurred_on.localeCompare(a.occurred_on))
      .slice(0, 5),
    transactionCount: input.current.length,
  };
}

/** Percentage change from `previous` to `current`, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
