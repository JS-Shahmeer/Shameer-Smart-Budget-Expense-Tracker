import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";

export type Settings = Pick<
  ProfileRow,
  "display_name" | "currency" | "timezone" | "month_start_day" | "payday_day" | "budget_warning_percent"
>;

const DEFAULT_SETTINGS: Settings = {
  display_name: null,
  currency: "PKR",
  timezone: "Asia/Karachi",
  month_start_day: 1,
  payday_day: 1,
  budget_warning_percent: 80,
};

/** The signed-in user's settings. Falls back to defaults if the profile row is missing. */
export async function getSettings(): Promise<Settings> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, currency, timezone, month_start_day, payday_day, budget_warning_percent")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return data ?? DEFAULT_SETTINGS;
}
