// Calendar dates are handled as "YYYY-MM-DD" strings, never as Date objects in
// local time, so month boundaries do not shift with the server's timezone.

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return { year, month, day };
}

export function isValidIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds whole months, keeping the year in step. month is 1-12. */
export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function addDays(date: IsoDate, count: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + count));
  return toIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** Today's date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type BudgetPeriod = {
  /** First day of the calendar month the period starts in, the key budgets use. */
  month: IsoDate;
  /** First day of the period, inclusive. */
  start: IsoDate;
  /** First day of the next period, exclusive. */
  end: IsoDate;
};

/**
 * The budget month containing `date` when months start on `startDay` (1-28).
 * With startDay 25, 2026-10-24 belongs to the period 2026-09-25 to 2026-10-24.
 */
export function budgetPeriodFor(date: IsoDate, startDay: number): BudgetPeriod {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
    throw new Error(`Month start day must be 1-28, got ${startDay}`);
  }
  const { year, month, day } = parseIsoDate(date);
  const startMonth = day >= startDay ? { year, month } : addMonths(year, month, -1);
  return budgetPeriodForMonth(toIsoDate(startMonth.year, startMonth.month, 1), startDay);
}

/** The budget period keyed by `month` (any date in that calendar month). */
export function budgetPeriodForMonth(month: IsoDate, startDay: number): BudgetPeriod {
  const { year, month: m } = parseIsoDate(month);
  const next = addMonths(year, m, 1);
  return {
    month: toIsoDate(year, m, 1),
    start: toIsoDate(year, m, startDay),
    end: toIsoDate(next.year, next.month, startDay),
  };
}

/** The `count` budget periods ending with the one that contains `today`, oldest first. */
export function recentPeriods(today: IsoDate, monthStartDay: number, count: number): BudgetPeriod[] {
  const current = parseIsoDate(budgetPeriodFor(today, monthStartDay).month);
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(current.year, current.month, i - count + 1);
    return budgetPeriodForMonth(toIsoDate(m.year, m.month, 1), monthStartDay);
  });
}

const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatMonth(date: IsoDate): string {
  const { year, month } = parseIsoDate(date);
  return monthLabel.format(new Date(Date.UTC(year, month - 1, 1)));
}

const shortMonthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** "Oct 26", for chart axes. */
export function formatMonthShort(date: IsoDate): string {
  const { year, month } = parseIsoDate(date);
  return shortMonthLabel.format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatDay(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return dayLabel.format(new Date(Date.UTC(year, month - 1, day)));
}

/** "October 2026", or "25 Sept – 24 Oct" when months do not start on the 1st. */
export function formatPeriod(period: BudgetPeriod): string {
  if (period.start === period.month) return formatMonth(period.month);
  return `${formatDay(period.start)} – ${formatDay(addDays(period.end, -1))}`;
}
