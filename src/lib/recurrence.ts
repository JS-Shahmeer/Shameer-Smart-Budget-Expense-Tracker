import { addDays, addMonths, daysInMonth, parseIsoDate, toIsoDate, type IsoDate } from "./dates";
import type { RecurrenceFrequency, RecurringRuleRow } from "./supabase/database.types";

/**
 * The occurrence after `currentDue`. Mirrors public.next_occurrence in the
 * database, which is the source of truth when posting.
 */
export function nextOccurrence(
  currentDue: IsoDate,
  startOn: IsoDate,
  frequency: RecurrenceFrequency,
  intervalCount: number,
): IsoDate {
  if (frequency === "weekly") return addDays(currentDue, 7 * intervalCount);
  const months = frequency === "yearly" ? 12 * intervalCount : intervalCount;
  const { year, month } = parseIsoDate(currentDue);
  const target = addMonths(year, month, months);
  const anchor = parseIsoDate(startOn).day;
  return toIsoDate(target.year, target.month, Math.min(anchor, daysInMonth(target.year, target.month)));
}

export type Occurrence<R> = { rule: R; date: IsoDate };

type ProjectableRule = Pick<
  RecurringRuleRow,
  "next_due_on" | "start_on" | "end_on" | "frequency" | "interval_count" | "is_active"
>;

/** Occurrences of active rules due before `until` (exclusive), oldest first. */
export function occurrencesBefore<R extends ProjectableRule>(rules: R[], until: IsoDate, limitPerRule = 60): Occurrence<R>[] {
  const result: Occurrence<R>[] = [];
  for (const rule of rules) {
    if (!rule.is_active) continue;
    let date = rule.next_due_on;
    for (let i = 0; i < limitPerRule && date < until; i++) {
      if (rule.end_on && date > rule.end_on) break;
      result.push({ rule, date });
      date = nextOccurrence(date, rule.start_on, rule.frequency, rule.interval_count);
    }
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const UNIT: Record<RecurrenceFrequency, [string, string]> = {
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

/** "Every month", "Every 2 weeks". */
export function describeFrequency(frequency: RecurrenceFrequency, intervalCount: number): string {
  const [one, many] = UNIT[frequency];
  return intervalCount === 1 ? `Every ${one}` : `Every ${intervalCount} ${many}`;
}
