import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";

export async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-xs text-muted" title={user.email ?? undefined}>
        {user.email ?? "Signed in"}
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  );
}
