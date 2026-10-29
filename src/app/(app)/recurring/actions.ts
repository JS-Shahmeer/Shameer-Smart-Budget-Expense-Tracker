"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, validationFailure, type ActionResult } from "@/lib/action-result";
import { parseAmountToMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { nullIfEmpty, recurringSchema } from "@/lib/validation/finance";

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveRecurringRule(id: string | null, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const isTransfer = v.kind === "transfer";
  const row = {
    name: v.name,
    kind: v.kind,
    amount_minor: parseAmountToMinor(v.amount)!,
    account_id: v.accountId,
    to_account_id: isTransfer ? nullIfEmpty(v.toAccountId) : null,
    category_id: isTransfer ? null : nullIfEmpty(v.categoryId),
    payment_method: v.kind === "expense" && v.paymentMethod ? v.paymentMethod : null,
    frequency: v.frequency,
    interval_count: v.intervalCount,
    start_on: v.startOn,
    next_due_on: id ? v.nextDueOn : v.startOn,
    end_on: nullIfEmpty(v.endOn),
    is_bill: v.isBill,
    remind_days_before: v.remindDaysBefore,
  };
  // A rule whose next date is past its end has nothing left to post.
  const isActive = !row.end_on || row.next_due_on <= row.end_on;

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("recurring_rules").update({ ...row, is_active: isActive }).eq("id", id).eq("user_id", user.id)
    : await supabase.from("recurring_rules").insert({ ...row, is_active: isActive, user_id: user.id });
  if (error) return databaseFailure(error, "save the recurring item");
  refresh();
  return { ok: true };
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return databaseFailure(error, "update the recurring item");
  if (data.length === 0) return { ok: false, error: "That recurring item no longer exists." };
  refresh();
  return { ok: true };
}

/** Deletes the rule. Transactions it already posted stay, unlinked. */
export async function deleteRecurringRule(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("recurring_rules").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) return databaseFailure(error, "delete the recurring item");
  if (data.length === 0) return { ok: false, error: "That recurring item no longer exists." };
  refresh();
  return { ok: true };
}

/**
 * Records (or skips) the rule's next due occurrence. The database function
 * does it in one transaction and ignores an occurrence that is already posted,
 * so a double click can't record a bill twice.
 */
export async function postOccurrence(ruleId: string, skip: boolean): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(ruleId)) return { ok: false, error: "Invalid recurring item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_recurring_occurrence", { rule_id: ruleId, skip });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "That recurring item no longer exists." };
    return databaseFailure(error, skip ? "skip this occurrence" : "record this occurrence");
  }
  refresh();
  return { ok: true };
}
