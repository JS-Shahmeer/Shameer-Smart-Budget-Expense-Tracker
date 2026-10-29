import { Landmark } from "lucide-react";
import { SetupNotice } from "@/components/setup-notice";
import { getSupabaseConfig } from "@/lib/env";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Landmark aria-hidden className="size-6 text-accent" />
          <span className="text-lg font-semibold">Smart Budget</span>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          {getSupabaseConfig() ? children : <SetupNotice />}
        </div>
      </div>
    </main>
  );
}
