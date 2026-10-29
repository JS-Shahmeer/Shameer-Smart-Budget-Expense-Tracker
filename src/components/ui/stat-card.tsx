import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    neutral: "text-fg",
    positive: "text-positive",
    negative: "text-negative",
    warning: "text-warning",
  }[tone];

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <Icon aria-hidden className="size-4 text-subtle" />
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-subtle">{detail}</p> : null}
    </div>
  );
}
