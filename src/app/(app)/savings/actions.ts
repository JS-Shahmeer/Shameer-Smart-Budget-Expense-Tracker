"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, INVALID_ID, isId, validationFailure, type ActionResult } from "@/lib/action-result";
import { parseAmountToMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { GoalStatus } from "@/lib/supabase/database.types";
import { contributionSchema, goalSchema, nullIfEmpty } from "@/lib/validation/finance";

const optionalMinor = (value: string | undefined) => (value ? parseAmountToMinor(value) : null);

export async function saveGoal(id: string | null, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (id !== null && !isId(id)) return INVALID_ID;
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const row = {
    name: v.name,
    target_minor: parseAmountToMinor(v.target)!,
    starting_minor: optionalMinor(v.starting) ?? 0,
    target_date: nullIfEmpty(v.targetDate),
    monthly_contribution_minor: optionalMinor(v.monthlyContribution),
    account_id: nullIfEmpty(v.accountId),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("savings_goals").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("savings_goals").insert({ ...row, user_id: user.id });
  if (error) return databaseFailure(error, "save the goal");
  refresh();
  return { ok: true };
}

export async function setGoalStatus(id: string, status: GoalStatus): Promise<ActionResult> {
  const user = await requireUser();
  if (!isId(id)) return INVALID_ID;
  if (!["active", "completed", "archived"].includes(status)) return { ok: false, error: "Invalid status." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").update({ status }).eq("id", id).eq("user_id", user.id).select("id");
  if (error) return databaseFailure(error, "update the goal");
  if (data.length === 0) return { ok: false, error: "That goal no longer exists." };
  refresh();
  return { ok: true };
}

/** Deletes the goal. Its transfers stay (money really moved), just untagged. */
export async function deleteGoal(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isId(id)) return INVALID_ID;
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_goals").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) return databaseFailure(error, "delete the goal");
  if (data.length === 0) return { ok: false, error: "That goal no longer exists." };
  refresh();
  return { ok: true };
}

/**
 * Adds money to a goal (a transfer from an everyday account into the goal's
 * savings account) or takes it out (the reverse). Either way it is a
 * transfer, so it never shows up as income or spending.
 */
export async function moveGoalMoney(goalId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isId(goalId)) return INVALID_ID;
  const parsed = contributionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, name, account_id")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (goalError) return databaseFailure(goalError, "load the goal");
  if (!goal) return { ok: false, error: "That goal no longer exists." };

  let savingsAccountId = goal.account_id;
  if (!savingsAccountId) {
    const { data: savings, error } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "savings")
      .eq("is_archived", false)
      .order("created_at")
      .limit(1);
    if (error) return databaseFailure(error, "find a savings account");
    savingsAccountId = savings[0]?.id ?? null;
  }
  if (!savingsAccountId) return { ok: false, error: "Add a savings account first, or choose one for this goal." };
  if (savingsAccountId === v.accountId) {
    return { ok: false, error: "Choose a different account from the one the goal is kept in.", fieldErrors: { accountId: "Choose a different account" } };
  }

  const adding = v.direction === "add";
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    kind: "transfer",
    amount_minor: parseAmountToMinor(v.amount)!,
    occurred_on: v.occurredOn,
    account_id: adding ? v.accountId : savingsAccountId,
    to_account_id: adding ? savingsAccountId : v.accountId,
    savings_goal_id: goal.id,
    description: adding ? `Saved for ${goal.name}` : `Withdrawn from ${goal.name}`,
  });
  if (error) return databaseFailure(error, adding ? "add money to the goal" : "withdraw from the goal");
  refresh();
  return { ok: true };
}
