import { budgetPeriodFor, isValidIsoDate } from "@/lib/dates";
import type { TransactionKind } from "@/lib/supabase/database.types";

export const PAGE_SIZE = 50;

export type TransactionFilters = {
  /** First of a month ("2026-10-01"), or "all". */
  month: string;
  kind: TransactionKind | "";
  categoryId: string;
  accountId: string;
  q: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads filters from the URL, ignoring anything malformed. */
export function parseFilters(params: Params, today: string, monthStartDay: number): TransactionFilters {
  const month = first(params.month);
  const kind = first(params.kind);
  const page = Number.parseInt(first(params.page), 10);
  return {
    month:
      month === "all"
        ? "all"
        : /^\d{4}-\d{2}$/.test(month) && isValidIsoDate(`${month}-01`)
          ? `${month}-01`
          : budgetPeriodFor(today, monthStartDay).month,
    kind: kind === "income" || kind === "expense" || kind === "transfer" ? kind : "",
    categoryId: UUID.test(first(params.category)) ? first(params.category) : "",
    accountId: UUID.test(first(params.account)) ? first(params.account) : "",
    // These characters have meaning in PostgREST filter syntax, so drop them.
    q: first(params.q).replace(/[,()*%\\:."']/g, " ").trim().slice(0, 60),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}
