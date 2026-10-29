import { Alert } from "@/components/ui/alert";

/** Shown instead of the app when the Supabase environment variables are missing. */
export function SetupNotice() {
  return (
    <Alert tone="warning" title="Supabase is not connected yet">
      Add <code className="text-fg">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="text-fg">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment (see{" "}
      <code className="text-fg">.env.example</code>), apply the migrations in <code className="text-fg">supabase/migrations</code>,
      then restart the app.
    </Alert>
  );
}
