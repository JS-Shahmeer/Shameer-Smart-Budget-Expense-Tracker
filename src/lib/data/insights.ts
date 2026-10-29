import "server-only";

import { requireUser } from "@/lib/auth";
import { addMonths, budgetPeriodForMonth, parseIsoDate, recentPeriods, toIsoDate, type BudgetPeriod, type IsoDate } from "@/lib/dates";
import {
  amountsByCategory,
  buildMonthReport,
  monthlyTotals,
  totalsOf,
  type CategoryAmount,
  type InsightTransaction,
  type MonthReport,
  type MonthTotals,
  type PeriodTotals,
} from "@/lib/finance/insights";
import { createClient } from "@/lib/supabase/server";
import type { AccountType, TransactionRow } from "@/lib/supabase/database.types";
import type { Settings } from "./profile";
import { readAll } from "./read-all";

type Client = Awaited<ReturnType<typeof createClient>>;

const COLUMNS = "id, kind, amount_minor, occurred_on, account_id, to_account_id, category_id, savings_goal_id, payment_method, description";

async function transactionsBetween(supabase: Client, userId: string, start: IsoDate, end: IsoDate): Promise<InsightTransaction[]> {
  return readAll(
    (from, to) =>
      supabase
        .from("transactions")
        .select(COLUMNS)
        .eq("user_id", userId)
        .gte("occurred_on", start)
        .lt("occurred_on", end)
        .order("id")
        .range(from, to),
    "transactions",
  );
}

async function referenceData(supabase: Client, userId: string) {
  const [accounts, categories] = await Promise.all([
    supabase.from("accounts").select("id, type").eq("user_id", userId),
    supabase.from("categories").select("id, name, color").eq("user_id", userId),
  ]);
  if (accounts.error) throw new Error(`Could not load accounts: ${accounts.error.message}`);
  if (categories.error) throw new Error(`Could not load categories: ${categories.error.message}`);
  const typeById = new Map<string, AccountType>(accounts.data.map((a) => [a.id, a.type]));
  return {
    categories: categories.data,
    isSavings: (id: string | null) => id !== null && typeById.get(id) === "savings",
  };
}

export type Analytics = {
  months: MonthTotals[];
  rangeTotals: PeriodTotals;
  spendingByCategory: CategoryAmount[];
  /** Months in the range that have at least one transaction. */
  activeMonths: number;
};

export async function getAnalytics(settings: Settings, today: IsoDate, monthCount: number): Promise<Analytics> {
  const user = await requireUser();
  const supabase = await createClient();
  const periods = recentPeriods(today, settings.month_start_day, monthCount);
  const [transactions, reference] = await Promise.all([
    transactionsBetween(supabase, user.id, periods[0].start, periods[periods.length - 1].end),
    referenceData(supabase, user.id),
  ]);
  const months = monthlyTotals(transactions, periods, reference.isSavings);
  return {
    months,
    rangeTotals: totalsOf(transactions, reference.isSavings),
    spendingByCategory: amountsByCategory(transactions, "expense", reference.categories, 10),
    activeMonths: months.filter((m) => m.incomeMinor > 0 || m.expensesMinor > 0 || m.savedMinor !== 0).length,
  };
}

export type MonthReportData = MonthReport & { period: BudgetPeriod; previousPeriod: BudgetPeriod };

export async function getMonthReport(month: IsoDate, monthStartDay: number): Promise<MonthReportData> {
  const user = await requireUser();
  const supabase = await createClient();
  const period = budgetPeriodForMonth(month, monthStartDay);
  const { year, month: m } = parseIsoDate(month);
  const before = addMonths(year, m, -1);
  const previousPeriod = budgetPeriodForMonth(toIsoDate(before.year, before.month, 1), monthStartDay);

  const [transactions, reference, budgets] = await Promise.all([
    transactionsBetween(supabase, user.id, previousPeriod.start, period.end),
    referenceData(supabase, user.id),
    supabase.from("budgets").select("category_id, amount_minor").eq("user_id", user.id).eq("month", period.month),
  ]);
  if (budgets.error) throw new Error(`Could not load budgets: ${budgets.error.message}`);

  const report = buildMonthReport({
    current: transactions.filter((t) => t.occurred_on >= period.start),
    previous: transactions.filter((t) => t.occurred_on < period.start),
    categories: reference.categories,
    budgets: budgets.data,
    isSavings: reference.isSavings,
  });
  return { ...report, period, previousPeriod };
}

export type ExportRow = Pick<
  TransactionRow,
  "occurred_on" | "kind" | "description" | "payment_method" | "amount_minor" | "note"
> & { category: string | null; account: string | null; toAccount: string | null; goal: string | null };

/** Every transaction in `period` (or all of them), oldest first, with names instead of ids. */
export async function getExportRows(period: BudgetPeriod | null): Promise<ExportRow[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const [rows, accounts, categories, goals] = await Promise.all([
    readAll((from, to) => {
      let query = supabase
        .from("transactions")
        .select("occurred_on, kind, description, payment_method, amount_minor, note, account_id, to_account_id, category_id, savings_goal_id")
        .eq("user_id", user.id);
      if (period) query = query.gte("occurred_on", period.start).lt("occurred_on", period.end);
      return query.order("occurred_on").order("created_at").order("id").range(from, to);
    }, "transactions"),
    supabase.from("accounts").select("id, name").eq("user_id", user.id),
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    supabase.from("savings_goals").select("id, name").eq("user_id", user.id),
  ]);
  for (const result of [accounts, categories, goals]) {
    if (result.error) throw new Error(`Could not load export data: ${result.error.message}`);
  }
  const name = (list: { id: string; name: string }[] | null) => {
    const byId = new Map((list ?? []).map((r) => [r.id, r.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  };
  const account = name(accounts.data);
  const category = name(categories.data);
  const goal = name(goals.data);

  return rows.map(({ account_id, to_account_id, category_id, savings_goal_id, ...t }) => ({
    ...t,
    account: account(account_id),
    toAccount: account(to_account_id),
    category: category(category_id),
    goal: goal(savings_goal_id),
  }));
}
