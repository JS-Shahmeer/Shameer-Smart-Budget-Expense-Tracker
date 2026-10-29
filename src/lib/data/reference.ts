import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AccountBalanceRow, AccountRow, CategoryRow } from "@/lib/supabase/database.types";

export type AccountOption = Pick<AccountRow, "id" | "name" | "type" | "is_archived" | "opening_balance_minor"> & {
  balance_minor: number;
};
export type CategoryOption = Pick<CategoryRow, "id" | "name" | "kind" | "color" | "icon" | "is_archived">;

/** The user's accounts with current balances, active ones first. */
export async function getAccounts(): Promise<AccountOption[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const [accounts, balances] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, is_archived, opening_balance_minor")
      .eq("user_id", user.id)
      .order("is_archived")
      .order("created_at"),
    supabase.from("account_balances").select("account_id, balance_minor").eq("user_id", user.id),
  ]);
  if (accounts.error) throw new Error(`Could not load accounts: ${accounts.error.message}`);
  if (balances.error) throw new Error(`Could not load balances: ${balances.error.message}`);
  const balanceById = new Map(
    (balances.data as Pick<AccountBalanceRow, "account_id" | "balance_minor">[]).map((b) => [b.account_id, b.balance_minor]),
  );
  return accounts.data.map((a) => ({ ...a, balance_minor: balanceById.get(a.id) ?? a.opening_balance_minor }));
}

/** The user's categories, sorted by kind then name. */
export async function getCategories(): Promise<CategoryOption[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, color, icon, is_archived")
    .eq("user_id", user.id)
    .order("kind")
    .order("name");
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return data;
}
