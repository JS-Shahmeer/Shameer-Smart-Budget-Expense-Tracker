"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, validationFailure, type ActionResult } from "@/lib/action-result";
import { isValidIsoDate } from "@/lib/dates";
import { parseAmountToMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { budgetSchema } from "@/lib/validation/finance";

/** Sets a category's limit for a month, or removes it when the amount is empty. */
export async function setBudget(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { categoryId, month, amount } = parsed.data;
  const supabase = await createClient();

  if (amount === "") {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("user_id", user.id)
      .eq("category_id", categoryId)
      .eq("month", month);
    if (error) return databaseFailure(error, "remove the budget");
  } else {
    const { error } = await supabase
      .from("budgets")
      .upsert(
        { user_id: user.id, category_id: categoryId, month, amount_minor: parseAmountToMinor(amount)! },
        { onConflict: "user_id,category_id,month" },
      );
    if (error) return databaseFailure(error, "save the budget");
  }
  refresh();
  return { ok: true };
}

/** Copies last month's limits into a month, keeping any limits it already has. */
export async function copyBudgets(fromMonth: string, toMonth: string): Promise<ActionResult> {
  const user = await requireUser();
  if (![fromMonth, toMonth].every((m) => isValidIsoDate(m) && m.endsWith("-01"))) {
    return { ok: false, error: "Invalid month." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("category_id, amount_minor")
    .eq("user_id", user.id)
    .eq("month", fromMonth);
  if (error) return databaseFailure(error, "copy budgets");
  if (data.length === 0) return { ok: false, error: "There are no budgets in the previous month to copy." };

  const { error: insertError } = await supabase.from("budgets").upsert(
    data.map((b) => ({ user_id: user.id, category_id: b.category_id, month: toMonth, amount_minor: b.amount_minor })),
    { onConflict: "user_id,category_id,month", ignoreDuplicates: true },
  );
  if (insertError) return databaseFailure(insertError, "copy budgets");
  refresh();
  return { ok: true };
}
