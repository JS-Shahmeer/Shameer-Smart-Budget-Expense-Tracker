import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, BarChart3, PiggyBank } from "lucide-react";
import { CategoryBars } from "@/components/analytics/category-bars";
import { IncomeSpendingChart, SavedChart, type MonthPoint } from "@/components/analytics/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { getAnalytics } from "@/lib/data/insights";
import { getSettings } from "@/lib/data/profile";
import { formatMonth, formatMonthShort, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [3, 6, 12] as const;

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="How your income, spending and saving have moved month by month." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Analytics searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  const [params, settings] = await Promise.all([searchParams, getSettings()]);
  const range = RANGES.find((r) => String(r) === params.range) ?? 6;
  const data = await getAnalytics(settings, todayIn(settings.timezone), range);
  const money = (minor: number) => formatMoney(minor, settings.currency);

  const points: MonthPoint[] = data.months.map((m) => ({
    label: formatMonthShort(m.month),
    incomeMinor: m.incomeMinor,
    expensesMinor: m.expensesMinor,
    savedMinor: m.savedMinor,
  }));
  // Averages skip months with nothing recorded, so a new account isn't diluted by empty months.
  const months = Math.max(data.activeMonths, 1);
  const { rangeTotals } = data;

  return (
    <div className="space-y-6">
      <nav aria-label="Time range" className="flex w-fit gap-1 rounded-lg bg-surface-2 p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/analytics?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
              r === range ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {r} months
          </Link>
        ))}
      </nav>

      {data.activeMonths === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Nothing to chart yet"
            description={`Add income and expenses and they will show up here. This view covers the last ${range} months.`}
            action={<ButtonLink href="/transactions">Go to transactions</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Average monthly income" value={money(Math.round(rangeTotals.incomeMinor / months))} icon={ArrowDownLeft} />
            <StatCard
              label="Average monthly spending"
              value={money(Math.round(rangeTotals.expensesMinor / months))}
              icon={ArrowUpRight}
            />
            <StatCard
              label="Savings rate"
              value={rangeTotals.savingsRate === null ? "—" : `${Math.round(rangeTotals.savingsRate)}%`}
              detail={`${money(rangeTotals.savedMinor)} saved of ${money(rangeTotals.incomeMinor)} income`}
              icon={PiggyBank}
              tone={rangeTotals.savedMinor < 0 ? "negative" : "neutral"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Income and spending</CardTitle>
            </CardHeader>
            <CardContent>
              <IncomeSpendingChart data={points} currency={settings.currency} />
              <MonthTable months={data.months} money={money} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Saved each month</CardTitle>
              </CardHeader>
              <CardContent>
                <SavedChart data={points} currency={settings.currency} />
                <p className="mt-3 text-xs text-subtle">
                  Money moved into savings accounts or goals, minus withdrawals. Bars below the line mean you took more out than
                  you put in.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where your money went</CardTitle>
                <span className="text-xs text-subtle">Last {range} months</span>
              </CardHeader>
              <CardContent>
                {data.spendingByCategory.length > 0 ? (
                  <CategoryBars rows={data.spendingByCategory} currency={settings.currency} label="Spending by category" />
                ) : (
                  <p className="text-sm text-muted">No spending in this range.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MonthTable({ months, money }: { months: Awaited<ReturnType<typeof getAnalytics>>["months"]; money: (m: number) => string }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-md text-left">
          <thead className="text-xs text-subtle">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Month</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Income</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Spending</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Net</th>
              <th scope="col" className="py-2 text-right font-medium">Saved</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row" className="py-2 pr-3 font-normal text-fg">{formatMonth(m.month)}</th>
                <td className="py-2 pr-3 text-right">{money(m.incomeMinor)}</td>
                <td className="py-2 pr-3 text-right">{money(m.expensesMinor)}</td>
                <td className={cn("py-2 pr-3 text-right", m.netMinor < 0 && "text-negative")}>{money(m.netMinor)}</td>
                <td className="py-2 text-right">{money(m.savedMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
