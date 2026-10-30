import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CategorizedDescription = { description: string | null; category_id: string | null };

/** Recent descriptions you have categorised, newest first, so imports can repeat your choices. */
export async function getCategorizedDescriptions(limit = 1000): Promise<CategorizedDescription[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("description, category_id")
    .eq("user_id", user.id)
    .not("description", "is", null)
    .not("category_id", "is", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load past categories: ${error.message}`);
  return data;
}

/** How many imported transactions touch each account, for removing an import. */
export async function getImportedCounts(accountIds: string[]): Promise<Record<string, number>> {
  const user = await requireUser();
  const supabase = await createClient();
  const counts = await Promise.all(
    accountIds.map(async (id) => {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("import_ref", "is", null)
        .or(`account_id.eq.${id},to_account_id.eq.${id}`);
      if (error) throw new Error(`Could not count imported transactions: ${error.message}`);
      return [id, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}
