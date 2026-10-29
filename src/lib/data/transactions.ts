import "server-only";

import { requireUser } from "@/lib/auth";
import { budgetPeriodForMonth, type BudgetPeriod } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { TransactionRow } from "@/lib/supabase/database.types";
import { PAGE_SIZE, type TransactionFilters } from "@/lib/transaction-filters";

export { PAGE_SIZE, parseFilters, type TransactionFilters } from "@/lib/transaction-filters";

export type TransactionListItem = Pick<
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
  | "note"
  | "recurring_rule_id"
>;

export type TransactionList = {
  items: TransactionListItem[];
  total: number;
  incomeMinor: number;
  expensesMinor: number;
  period: BudgetPeriod | null;
};

const COLUMNS =
  "id, kind, amount_minor, occurred_on, account_id, to_account_id, category_id, savings_goal_id, payment_method, description, note, recurring_rule_id";

export async function listTransactions(
  filters: TransactionFilters,
  monthStartDay: number,
  matchingCategoryIds: string[],
): Promise<TransactionList> {
  const user = await requireUser();
  const supabase = await createClient();
  const period = filters.month === "all" ? null : budgetPeriodForMonth(filters.month, monthStartDay);

  // Built twice: once for the page of rows, once for the totals of every match.
  const build = <Q extends { eq: (c: string, v: string) => Q; gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q; or: (f: string) => Q }>(
    query: Q,
  ) => {
    let q = query.eq("user_id", user.id);
    if (period) q = q.gte("occurred_on", period.start).lt("occurred_on", period.end);
    if (filters.kind) q = q.eq("kind", filters.kind);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.accountId) q = q.or(`account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`);
    if (filters.q) {
      const like = `*${filters.q}*`;
      const parts = [`description.ilike.${like}`, `note.ilike.${like}`];
      if (matchingCategoryIds.length > 0) parts.push(`category_id.in.(${matchingCategoryIds.join(",")})`);
      q = q.or(parts.join(","));
    }
    return q;
  };

  const from = (filters.page - 1) * PAGE_SIZE;
  const [rows, totals] = await Promise.all([
    build(supabase.from("transactions").select(COLUMNS, { count: "exact" }))
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    sumAll((start, end) => build(supabase.from("transactions").select("kind, amount_minor")).order("id").range(start, end)),
  ]);
  if (rows.error) throw new Error(`Could not load transactions: ${rows.error.message}`);
  const { incomeMinor, expensesMinor } = totals;

  return { items: rows.data, total: rows.count ?? rows.data.length, incomeMinor, expensesMinor, period };
}

type TotalsPage = PromiseLike<{
  data: Pick<TransactionRow, "kind" | "amount_minor">[] | null;
  error: { message: string } | null;
}>;

/**
 * Sums income and expenses over every matching row. Supabase caps a response
 * at 1000 rows, so this reads in chunks until a short page comes back.
 */
async function sumAll(fetchPage: (start: number, end: number) => TotalsPage) {
  const CHUNK = 1000;
  let incomeMinor = 0;
  let expensesMinor = 0;
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await fetchPage(start, start + CHUNK - 1);
    if (error) throw new Error(`Could not load totals: ${error.message}`);
    for (const t of data ?? []) {
      if (t.kind === "income") incomeMinor += t.amount_minor;
      else if (t.kind === "expense") expensesMinor += t.amount_minor;
    }
    if (!data || data.length < CHUNK) return { incomeMinor, expensesMinor };
  }
}
