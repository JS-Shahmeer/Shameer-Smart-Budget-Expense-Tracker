import { cn } from "@/lib/cn";

const tones = { ok: "bg-accent", warning: "bg-warning", over: "bg-negative", positive: "bg-positive" };

/** A horizontal bar. `value` is a percentage and may exceed 100. */
export function Progress({
  value,
  tone = "ok",
  label,
  className,
}: {
  value: number;
  tone?: keyof typeof tones;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={`${Math.round(value)}%`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${clamped}%` }} />
    </div>
  );
}
