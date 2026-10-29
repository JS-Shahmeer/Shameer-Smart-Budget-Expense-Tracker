"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatMoney } from "@/lib/money";

// Chart colours and greys come from the theme tokens in globals.css, so the
// charts match the rest of the app. Values stay in minor units until display.

const SERIES = {
  income: "var(--color-series-1)",
  spending: "var(--color-series-2)",
  saved: "var(--color-series-3)",
};

const AXIS = { fill: "var(--color-subtle)", fontSize: 12 };
const compact = new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 1 });
const compactMinor = (minor: number) => compact.format(minor / 100);

export type MonthPoint = { label: string; incomeMinor: number; expensesMinor: number; savedMinor: number };

type Row = { name: string; value: number; color: string };

function ChartTooltip({ active, payload, label, currency }: TooltipContentProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null;
  const rows: Row[] = payload.map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color) }));
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{label}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-muted">
          <span aria-hidden className="size-2 rounded-full" style={{ background: row.color }} />
          {row.name}
          <span className="tabular ml-auto pl-3 text-fg">{formatMoney(row.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Income and spending side by side for each month. */
export function IncomeSpendingChart({ data, currency }: { data: MonthPoint[]; currency: string }) {
  return (
    <div>
      <div className="mb-3 flex gap-4">
        <LegendKey color={SERIES.income} label="Income" />
        <LegendKey color={SERIES.spending} label="Spending" />
      </div>
      {/* The table under the chart carries the same numbers for screen readers. */}
      <div aria-hidden className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="25%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line-strong)" }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactMinor} width={44} />
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)" }}
              content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} />}
            />
            <Bar dataKey="incomeMinor" name="Income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expensesMinor" name="Spending" fill={SERIES.spending} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Net money moved into savings each month. Withdrawals show below the line. */
export function SavedChart({ data, currency }: { data: MonthPoint[]; currency: string }) {
  return (
    <div aria-hidden className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactMinor} width={44} />
          <ReferenceLine y={0} stroke="var(--color-line-strong)" />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)" }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} />}
          />
          <Bar dataKey="savedMinor" name="Saved" fill={SERIES.saved} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
