import { Suspense } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { SetupNotice } from "@/components/setup-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseConfig } from "@/lib/env";

export default function AppLayout({ children }: LayoutProps<"/">) {
  if (!getSupabaseConfig()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <SetupNotice />
      </main>
    );
  }

  // The session is read inside Suspense boundaries, so the navigation shell
  // renders instantly and only the user-specific parts stream in.
  const footer = (
    <Suspense fallback={<Skeleton className="h-8 w-full" />}>
      <UserMenu />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileNav footer={footer} />
    </div>
  );
}
