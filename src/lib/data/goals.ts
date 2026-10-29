import "server-only";

import { requireUser } from "@/lib/auth";
import { goalProgress, type GoalInput, type GoalProgress, type GoalTransfer } from "@/lib/finance/goals";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/lib/supabase/database.types";

export type GoalWithProgress = GoalInput & { progress: GoalProgress };

/** Every goal with its progress, active ones first. */
export async function getGoals(today: string, monthStartDay: number): Promise<GoalWithProgress[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const [goals, accounts, transfers] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("id, name, target_minor, starting_minor, target_date, monthly_contribution_minor, account_id, status")
      .eq("user_id", user.id)
      .order("status")
      .order("created_at"),
    supabase.from("accounts").select("id, type").eq("user_id", user.id),
    goalTransfers(supabase, user.id),
  ]);
  if (goals.error) throw new Error(`Could not load savings goals: ${goals.error.message}`);
  if (accounts.error) throw new Error(`Could not load accounts: ${accounts.error.message}`);

  const typeById = new Map<string, AccountType>(accounts.data.map((a) => [a.id, a.type]));
  const accountType = (id: string) => typeById.get(id);
  return goals.data.map((goal) => ({ ...goal, progress: goalProgress(goal, transfers, today, monthStartDay, accountType) }));
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** All transfers tagged with a goal, reading past the 1000-row response cap. */
async function goalTransfers(supabase: Client, userId: string): Promise<GoalTransfer[]> {
  const rows: GoalTransfer[] = [];
  const CHUNK = 1000;
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount_minor, occurred_on, account_id, to_account_id, savings_goal_id")
      .eq("user_id", userId)
      .eq("kind", "transfer")
      .not("savings_goal_id", "is", null)
      .order("id")
      .range(start, start + CHUNK - 1);
    if (error) throw new Error(`Could not load goal contributions: ${error.message}`);
    rows.push(...data);
    if (data.length < CHUNK) return rows;
  }
}
