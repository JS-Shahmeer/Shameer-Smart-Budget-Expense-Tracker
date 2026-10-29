import "server-only";

import { requireUser } from "@/lib/auth";
import { addDays, daysBetween } from "@/lib/dates";
import { occurrencesBefore } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";
import type { RecurringRuleRow } from "@/lib/supabase/database.types";

export type RecurringRule = Pick<
  RecurringRuleRow,
  | "id"
  | "name"
  | "kind"
  | "amount_minor"
  | "account_id"
  | "to_account_id"
  | "category_id"
  | "savings_goal_id"
  | "payment_method"
  | "frequency"
  | "interval_count"
  | "start_on"
  | "end_on"
  | "next_due_on"
  | "is_bill"
  | "remind_days_before"
  | "is_active"
>;

export async function getRecurringRules(): Promise<RecurringRule[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(
      "id, name, kind, amount_minor, account_id, to_account_id, category_id, savings_goal_id, payment_method, frequency, interval_count, start_on, end_on, next_due_on, is_bill, remind_days_before, is_active",
    )
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("next_due_on");
  if (error) throw new Error(`Could not load recurring items: ${error.message}`);
  return data;
}

export type DueItem = { rule: RecurringRule; date: string; daysUntil: number; isNext: boolean };

/**
 * Occurrences from the past up to `days` ahead. Only the first per rule can be
 * recorded (rules post in order), the rest are shown as upcoming.
 */
export function upcoming(rules: RecurringRule[], today: string, days: number): DueItem[] {
  const seen = new Set<string>();
  return occurrencesBefore(rules, addDays(today, days + 1)).map(({ rule, date }) => {
    const isNext = !seen.has(rule.id);
    seen.add(rule.id);
    return { rule, date, daysUntil: daysBetween(today, date), isNext };
  });
}

/** Bills that are overdue or inside their reminder window. */
export function billReminders(rules: RecurringRule[], today: string): DueItem[] {
  return upcoming(
    rules.filter((r) => r.is_bill && r.kind !== "income"),
    today,
    30,
  ).filter((item) => item.isNext && item.daysUntil <= item.rule.remind_days_before);
}
