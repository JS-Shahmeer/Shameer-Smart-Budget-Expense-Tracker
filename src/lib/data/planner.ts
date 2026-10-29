import "server-only";

import { requireUser } from "@/lib/auth";
import { budgetPeriodFor } from "@/lib/dates";
import { dailyPlan, nextPayday, type Commitment, type DailyPlan } from "@/lib/finance/planner";
import { occurrencesBefore } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/server";
import { getBudgetMonth, type BudgetLine } from "./budgets";
import { getGoals } from "./goals";
import type { Settings } from "./profile";
import { getRecurringRules } from "./recurring";
import { getAccounts } from "./reference";

export type PlannerSnapshot = {
  plan: DailyPlan;
  /** Planned monthly saving across active goals, used to estimate how far a purchase would push them back. */
  monthlySavingsMinor: number;
  budgets: Pick<BudgetLine, "id" | "name" | "limitMinor" | "spentMinor">[];
};

/**
 * Everything the daily limit needs: spendable balances, what was already spent
 * today, and every bill and savings commitment due before the next payday.
 */
export async function getPlannerSnapshot(settings: Settings, today: string): Promise<PlannerSnapshot> {
  const user = await requireUser();
  const supabase = await createClient();
  const payday = nextPayday(today, settings.payday_day);
  const period = budgetPeriodFor(today, settings.month_start_day);

  const [accounts, rules, goals, spentToday, budgetMonth] = await Promise.all([
    getAccounts(),
    getRecurringRules(),
    getGoals(today, settings.month_start_day),
    supabase
      .from("transactions")
      .select("amount_minor, account_id")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .eq("occurred_on", today),
    getBudgetMonth(period.month, settings.month_start_day, settings.budget_warning_percent),
  ]);
  if (spentToday.error) throw new Error(`Could not load today's spending: ${spentToday.error.message}`);

  const typeById = new Map(accounts.map((a) => [a.id, a.type]));
  const isSavings = (id: string | null) => id !== null && typeById.get(id) === "savings";
  const everyday = accounts.filter((a) => a.type !== "savings" && !a.is_archived);
  const everydayIds = new Set(everyday.map((a) => a.id));

  const commitments: Commitment[] = [];
  const scheduledForGoal = new Map<string, number>();
  // Unposted recurring items due before payday, including overdue ones.
  for (const { rule, date } of occurrencesBefore(rules, payday)) {
    if (rule.kind === "expense") {
      commitments.push({ name: rule.name, date, amountMinor: rule.amount_minor, type: "bill" });
    } else if (rule.kind === "transfer" && !isSavings(rule.account_id) && isSavings(rule.to_account_id)) {
      commitments.push({ name: rule.name, date, amountMinor: rule.amount_minor, type: "savings" });
      if (rule.savings_goal_id) {
        scheduledForGoal.set(rule.savings_goal_id, (scheduledForGoal.get(rule.savings_goal_id) ?? 0) + rule.amount_minor);
      }
    }
  }
  // Goal plans not already covered by a scheduled savings transfer.
  for (const goal of goals) {
    if (goal.status !== "active" || goal.progress.dueThisMonthMinor <= 0) continue;
    const scheduled = scheduledForGoal.get(goal.id) ?? 0;
    const remaining = goal.progress.dueThisMonthMinor - scheduled;
    if (remaining > 0) commitments.push({ name: `${goal.name} (savings goal)`, date: today, amountMinor: remaining, type: "savings" });
  }

  const plan = dailyPlan({
    today,
    paydayDay: settings.payday_day,
    availableMinor: everyday.reduce((sum, a) => sum + a.balance_minor, 0),
    spentTodayMinor: spentToday.data.filter((t) => everydayIds.has(t.account_id)).reduce((sum, t) => sum + t.amount_minor, 0),
    commitments,
  });

  return {
    plan,
    monthlySavingsMinor: goals
      .filter((g) => g.status === "active" && !g.progress.reached)
      .reduce((sum, g) => sum + Math.max(g.monthly_contribution_minor ?? 0, g.progress.requiredMonthlyMinor ?? 0), 0),
    budgets: budgetMonth.lines.map(({ id, name, limitMinor, spentMinor }) => ({ id, name, limitMinor, spentMinor })),
  };
}
