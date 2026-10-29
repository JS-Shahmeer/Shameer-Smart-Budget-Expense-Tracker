import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, parseIsoDate } from "@/lib/dates";

function monthParam(month: string, delta: number) {
  const { year, month: m } = parseIsoDate(month);
  const next = addMonths(year, m, delta);
  return `${next.year}-${String(next.month).padStart(2, "0")}`;
}

/** Previous / next month links that set ?month=YYYY-MM on `basePath`. */
export function MonthNav({ basePath, month, label, isCurrent }: { basePath: string; month: string; label: string; isCurrent: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={`${basePath}?month=${monthParam(month, -1)}`}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Previous month"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
        <span className="min-w-36 text-center text-sm font-medium">{label}</span>
        <Link
          href={`${basePath}?month=${monthParam(month, 1)}`}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Next month"
        >
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      {isCurrent ? null : (
        <Link href={basePath} className="text-sm text-accent hover:underline">
          This month
        </Link>
      )}
    </div>
  );
}
