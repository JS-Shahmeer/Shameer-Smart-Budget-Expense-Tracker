"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, validationFailure, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/auth";
import { nullIfEmpty, settingsSchema } from "@/lib/validation/finance";

export async function saveSettings(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: nullIfEmpty(values.displayName),
      currency: values.currency,
      timezone: values.timezone,
      month_start_day: Number(values.monthStartDay),
      payday_day: Number(values.paydayDay),
      budget_warning_percent: Number(values.budgetWarningPercent),
    })
    .eq("id", user.id)
    .select("id");
  if (error) return databaseFailure(error, "save your settings");
  if (data.length === 0) return { ok: false, error: "Your profile is missing. Sign out and back in, then try again." };
  refresh();
  return { ok: true };
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    switch (error.code) {
      case "same_password":
        return { ok: false, error: "That is already your password. Choose a new one." };
      case "weak_password":
        return { ok: false, error: "That password is too easy to guess. Try a longer one." };
      case "reauthentication_needed":
        return { ok: false, error: "For your security, sign out and sign back in, then change your password." };
      default:
        console.error("Could not change password:", error);
        return { ok: false, error: "Could not change your password. Try again." };
    }
  }
  return { ok: true };
}
