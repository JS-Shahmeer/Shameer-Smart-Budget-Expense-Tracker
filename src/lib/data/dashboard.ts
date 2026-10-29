import "server-only";

import { requireUser } from "@/lib/auth";
import { budgetPeriodFor, todayIn, type BudgetPeriod } from "@/lib/dates";
import { summarizeMonth, type MonthSummary } from "@/lib/finance/summary";
import { createClient } from "@/lib/supabase/server";
import type { CategoryRow, TransactionRow } from "@/lib/supabase/database.types";
import { getSettings, type Settings } from "./profile";

export type RecentTransaction = Pick<
  TransactionRow,
  "id" | "kind" | "amount_minor" | "occurred_on" | "description"
> & { categoryName: string | null; categoryColor: string | null };

export type DashboardData = {
  settings: Settings;
  today: string;
  period: BudgetPeriod;
  summary: MonthSummary;
  recent: RecentTransaction[];
  hasAnyTransactions: boolean;
};

export async function getDashboardData(): Promise<DashboardData> {
  const user = await requireUser();
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const period = budgetPeriodFor(today, settings.month_start_day);
  const supabase = await createClient();

  // RLS limits every query to this user; the explicit user_id filter keeps the
  // intent obvious and lets Postgres use the user_id indexes.
  const [transactions, balances, budgets, categories, recent] = await Promise.all([
    supabase
      .from("transactions")
      .select("kind, amount_minor, account_id, to_account_id, category_id, savings_goal_id")
      .eq("user_id", user.id)
      .gte("occurred_on", period.start)
      .lt("occurred_on", period.end),
    supabase.from("account_balances").select("account_id, type, is_archived, balance_minor").eq("user_id", user.id),
    supabase.from("budgets").select("category_id, amount_minor").eq("user_id", user.id).eq("month", period.month),
    supabase.from("categories").select("id, name, color").eq("user_id", user.id),
    supabase
      .from("transactions")
      .select("id, kind, amount_minor, occurred_on, description, category_id")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  for (const result of [transactions, balances, budgets, categories, recent]) {
    if (result.error) throw new Error(`Could not load the dashboard: ${result.error.message}`);
  }

  const categoryList: Pick<CategoryRow, "id" | "name" | "color">[] = categories.data ?? [];
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));

  return {
    settings,
    today,
    period,
    summary: summarizeMonth({
      transactions: transactions.data ?? [],
      balances: balances.data ?? [],
      budgets: budgets.data ?? [],
      categories: categoryList,
      warningPercent: settings.budget_warning_percent,
    }),
    recent: (recent.data ?? []).map(({ category_id, ...t }) => {
      const category = category_id ? categoryById.get(category_id) : undefined;
      return { ...t, categoryName: category?.name ?? null, categoryColor: category?.color ?? null };
    }),
    hasAnyTransactions: (recent.data ?? []).length > 0,
  };
}
