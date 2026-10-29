import type { CategoryAmount } from "@/lib/finance/insights";
import { formatMoney } from "@/lib/money";

/**
 * Horizontal bars for amounts per category, largest first. Each bar is scaled
 * to the largest row and drawn in the series colour for its kind; the swatch
 * beside the name is the category's own colour.
 */
export function CategoryBars({
  rows,
  currency,
  label,
  kind = "expense",
}: {
  rows: CategoryAmount[];
  currency: string;
  label: string;
  kind?: "income" | "expense";
}) {
  const max = Math.max(...rows.map((r) => r.amountMinor), 1);
  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
              <span className="truncate text-fg">{row.name}</span>
            </span>
            <span className="tabular shrink-0 text-fg">
              {formatMoney(row.amountMinor, currency)}
              <span className="ml-2 inline-block w-10 text-right text-xs text-subtle">{Math.round(row.share)}%</span>
            </span>
          </div>
          <div aria-hidden className="h-2 rounded-full bg-surface-2">
            <div
              className={kind === "income" ? "h-2 rounded-full bg-series-1" : "h-2 rounded-full bg-series-2"}
              style={{ width: `${Math.max((row.amountMinor / max) * 100, 1)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
