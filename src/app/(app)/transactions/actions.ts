"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, validationFailure, type ActionResult } from "@/lib/action-result";
import { parseAmountToMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { nullIfEmpty, transactionSchema } from "@/lib/validation/finance";

type Row = Omit<TablesInsert, "user_id">;
type TablesInsert = Database["public"]["Tables"]["transactions"]["Insert"];

function toRow(input: unknown): { ok: true; row: Row } | { ok: false; failure: ActionResult } {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, failure: validationFailure(parsed.error) };
  const v = parsed.data;
  const isTransfer = v.kind === "transfer";
  return {
    ok: true,
    row: {
      kind: v.kind,
      amount_minor: parseAmountToMinor(v.amount)!,
      occurred_on: v.occurredOn,
      account_id: v.accountId,
      to_account_id: isTransfer ? nullIfEmpty(v.toAccountId) : null,
      category_id: isTransfer ? null : nullIfEmpty(v.categoryId),
      savings_goal_id: isTransfer ? nullIfEmpty(v.savingsGoalId) : null,
      payment_method: v.kind === "expense" && v.paymentMethod ? v.paymentMethod : null,
      description: nullIfEmpty(v.description),
      note: nullIfEmpty(v.note),
    },
  };
}

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const result = toRow(input);
  if (!result.ok) return result.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...result.row, user_id: user.id })
    .select("id")
    .single();
  if (error) return databaseFailure(error, "save the transaction");
  refresh();
  return { ok: true, id: data.id };
}

export async function updateTransaction(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const result = toRow(input);
  if (!result.ok) return result.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .update(result.row)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return databaseFailure(error, "update the transaction");
  if (data.length === 0) return { ok: false, error: "That transaction no longer exists." };
  refresh();
  return { ok: true, id };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) return databaseFailure(error, "delete the transaction");
  if (data.length === 0) return { ok: false, error: "That transaction no longer exists." };
  refresh();
  return { ok: true };
}
