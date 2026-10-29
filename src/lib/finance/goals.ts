import { budgetPeriodFor, parseIsoDate, type IsoDate } from "@/lib/dates";
import type { AccountType, SavingsGoalRow, TransactionRow } from "@/lib/supabase/database.types";

export type GoalInput = Pick<
  SavingsGoalRow,
  "id" | "name" | "target_minor" | "starting_minor" | "target_date" | "monthly_contribution_minor" | "account_id" | "status"
>;

export type GoalTransfer = Pick<TransactionRow, "amount_minor" | "occurred_on" | "account_id" | "to_account_id" | "savings_goal_id">;

export type GoalProgress = {
  savedMinor: number;
  remainingMinor: number;
  percent: number;
  reached: boolean;
  contributedThisMonthMinor: number;
  /** Budget months left including the current one, or null without a target date. */
  monthsLeft: number | null;
  /** What has to go in each remaining month to hit the target on time. */
  requiredMonthlyMinor: number | null;
  /** Plan still to put aside this month: the planned or required amount minus what went in already. */
  dueThisMonthMinor: number;
  pace: "reached" | "on-track" | "behind" | "overdue" | "no-plan";
};

/**
 * Signed effect of a transfer on a goal. Money moving out of the goal's
 * account (or out of any savings account, for goals without one) is a
 * withdrawal; anything else tagged with the goal is a contribution.
 */
export function goalTransferAmount(
  goal: Pick<GoalInput, "account_id">,
  t: Pick<GoalTransfer, "amount_minor" | "account_id" | "to_account_id">,
  accountType: (id: string) => AccountType | undefined,
): number {
  const withdrawal = goal.account_id
    ? t.account_id === goal.account_id && t.to_account_id !== goal.account_id
    : accountType(t.account_id) === "savings" && accountType(t.to_account_id ?? "") !== "savings";
  return withdrawal ? -t.amount_minor : t.amount_minor;
}

/** Whole budget months from the one containing `today` to the one containing `targetDate`, inclusive. */
export function monthsUntil(today: IsoDate, targetDate: IsoDate, monthStartDay: number): number {
  const from = parseIsoDate(budgetPeriodFor(today, monthStartDay).month);
  const to = parseIsoDate(budgetPeriodFor(targetDate, monthStartDay).month);
  return (to.year - from.year) * 12 + (to.month - from.month) + 1;
}

export function goalProgress(
  goal: GoalInput,
  transfers: GoalTransfer[],
  today: IsoDate,
  monthStartDay: number,
  accountType: (id: string) => AccountType | undefined,
): GoalProgress {
  const period = budgetPeriodFor(today, monthStartDay);
  let savedMinor = goal.starting_minor;
  let contributedThisMonthMinor = 0;
  for (const t of transfers) {
    if (t.savings_goal_id !== goal.id) continue;
    const amount = goalTransferAmount(goal, t, accountType);
    savedMinor += amount;
    if (t.occurred_on >= period.start && t.occurred_on < period.end) contributedThisMonthMinor += amount;
  }

  const remainingMinor = Math.max(0, goal.target_minor - savedMinor);
  const reached = remainingMinor === 0;
  const monthsLeft = goal.target_date ? monthsUntil(today, goal.target_date, monthStartDay) : null;
  const overdue = monthsLeft !== null && goal.target_date! < today && !reached;

  // Required monthly counts this month's contributions as already in, so the
  // plan for the current month doesn't move as money goes in.
  let requiredMonthlyMinor: number | null = null;
  if (monthsLeft !== null && !reached) {
    const remainingAtMonthStart = Math.max(0, goal.target_minor - (savedMinor - contributedThisMonthMinor));
    requiredMonthlyMinor = Math.ceil(remainingAtMonthStart / Math.max(1, monthsLeft));
  }

  const plannedMonthly = Math.max(goal.monthly_contribution_minor ?? 0, requiredMonthlyMinor ?? 0);
  const dueThisMonthMinor =
    reached || goal.status !== "active" ? 0 : Math.min(remainingMinor, Math.max(0, plannedMonthly - contributedThisMonthMinor));

  let pace: GoalProgress["pace"];
  if (reached) pace = "reached";
  else if (overdue) pace = "overdue";
  else if (requiredMonthlyMinor === null) pace = goal.monthly_contribution_minor ? "on-track" : "no-plan";
  else pace = (goal.monthly_contribution_minor ?? 0) >= requiredMonthlyMinor || contributedThisMonthMinor >= requiredMonthlyMinor ? "on-track" : "behind";

  return {
    savedMinor,
    remainingMinor,
    percent: goal.target_minor > 0 ? Math.min(100, (savedMinor / goal.target_minor) * 100) : 0,
    reached,
    contributedThisMonthMinor,
    monthsLeft,
    requiredMonthlyMinor,
    dueThisMonthMinor,
    pace,
  };
}
