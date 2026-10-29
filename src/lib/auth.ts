import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user, verified from the session JWT. Redirects to /login when
 * there is none. Call this in every server action before touching data; RLS is
 * the final guard, this is the first.
 */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
