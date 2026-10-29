import "server-only";

import { requireUser } from "@/lib/auth";
import { addMonths, budgetPeriodForMonth, parseIsoDate, toIsoDate, type BudgetPeriod } from "@/lib/dates";
import { budgetStatus, type BudgetStatus } from "@/lib/finance/summary";
import { createClient } from "@/lib/supabase/server";
import type { CategoryRow } from "@/lib/supabase/database.types";

export type BudgetLine = Pick<CategoryRow, "id" | "name" | "color" | "is_archived"> & {
  limitMinor: number | null;
  spentMinor: number;
  percent: number;
  status: BudgetStatus | null;
};

export type BudgetMonth = {
  period: BudgetPeriod;
  previousMonth: string;
  lines: BudgetLine[];
  budgetedMinor: number;
  spentInBudgetsMinor: number;
  unbudgetedSpentMinor: number;
  previousMonthHasBudgets: boolean;
};

export async function getBudgetMonth(month: string, monthStartDay: number, warningPercent: number): Promise<BudgetMonth> {
  const user = await requireUser();
  const supabase = await createClient();
  const period = budgetPeriodForMonth(month, monthStartDay);
  const { year, month: m } = parseIsoDate(period.month);
  const prev = addMonths(year, m, -1);
  const previousMonth = toIsoDate(prev.year, prev.month, 1);

  const [categories, budgets, previous, spending] = await Promise.all([
    supabase.from("categories").select("id, name, color, is_archived").eq("user_id", user.id).eq("kind", "expense").order("name"),
    supabase.from("budgets").select("category_id, amount_minor").eq("user_id", user.id).eq("month", period.month),
    supabase.from("budgets").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("month", previousMonth),
    expensesByCategory(supabase, user.id, period),
  ]);
  if (categories.error) throw new Error(`Could not load categories: ${categories.error.message}`);
  if (budgets.error) throw new Error(`Could not load budgets: ${budgets.error.message}`);
  if (previous.error) throw new Error(`Could not load budgets: ${previous.error.message}`);

  const limitByCategory = new Map(budgets.data.map((b) => [b.category_id, b.amount_minor]));
  const lines: BudgetLine[] = categories.data
    .filter((c) => !c.is_archived || limitByCategory.has(c.id) || spending.has(c.id))
    .map((c) => {
      const limitMinor = limitByCategory.get(c.id) ?? null;
      const spentMinor = spending.get(c.id) ?? 0;
      return {
        ...c,
        limitMinor,
        spentMinor,
        percent: limitMinor ? (spentMinor / limitMinor) * 100 : 0,
        status: limitMinor ? budgetStatus(spentMinor, limitMinor, warningPercent) : null,
      };
    });

  const budgeted = lines.filter((l) => l.limitMinor !== null);
  return {
    period,
    previousMonth,
    lines,
    budgetedMinor: budgeted.reduce((sum, l) => sum + (l.limitMinor ?? 0), 0),
    spentInBudgetsMinor: budgeted.reduce((sum, l) => sum + l.spentMinor, 0),
    unbudgetedSpentMinor: lines.filter((l) => l.limitMinor === null).reduce((sum, l) => sum + l.spentMinor, 0),
    previousMonthHasBudgets: (previous.count ?? 0) > 0,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Expense totals per category in the period, reading past the 1000-row response cap. */
async function expensesByCategory(supabase: Client, userId: string, period: BudgetPeriod) {
  const totals = new Map<string, number>();
  const CHUNK = 1000;
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .select("category_id, amount_minor")
      .eq("user_id", userId)
      .eq("kind", "expense")
      .gte("occurred_on", period.start)
      .lt("occurred_on", period.end)
      .order("id")
      .range(start, start + CHUNK - 1);
    if (error) throw new Error(`Could not load spending: ${error.message}`);
    for (const t of data) {
      if (t.category_id) totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount_minor);
    }
    if (data.length < CHUNK) return totals;
  }
}
