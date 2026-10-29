// Public Supabase settings. These are safe in the browser: the anon (publishable)
// key can only do what Row Level Security allows. The service-role key must never
// be read here or anywhere under src/.
export type SupabaseConfig = { url: string; anonKey: string };

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return config;
}
