import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseConfig } from "@/lib/env";
import type { Database } from "./database.types";

// Create a new client per request. Reusing one across requests would leak
// session cookies between users.
export async function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the
          // session on every request, so a skipped write here is harmless.
        }
      },
    },
  });
}
