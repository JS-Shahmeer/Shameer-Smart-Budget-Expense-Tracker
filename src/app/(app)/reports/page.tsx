import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, FileText } from "lucide-react";
import { CategoryBars } from "@/components/analytics/category-bars";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthNav } from "@/components/ui/month-nav";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getMonthReport } from "@/lib/data/insights";
import { getSettings } from "@/lib/data/profile";
import { budgetPeriodFor, formatDay, formatPeriod, isValidIsoDate, todayIn } from "@/lib/dates";
import { percentChange, type PeriodTotals } from "@/lib/finance/insights";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="A month at a glance, compared with the month before, and your transactions as a spreadsheet."
        actions={
          <a href="/reports/export?month=all" download className={buttonClasses("secondary", "sm")}>
            <Download aria-hidden className="size-4" />
            Export all (CSV)
          </a>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const [params, settings] = await Promise.all([searchParams, getSettings()]);
  const current = budgetPeriodFor(todayIn(settings.timezone), settings.month_start_day).month;
  const requested = typeof params.month === "string" ? `${params.month}-01` : "";
  const month = /^\d{4}-\d{2}-01$/.test(requested) && isValidIsoDate(requested) ? requested : current;
  const report = await getMonthReport(month, settings.month_start_day);
  const money = (minor: number) => formatMoney(minor, settings.currency);
  const monthParam = month.slice(0, 7);
  const isEmpty = report.transactionCount === 0 && report.expensesByCategory.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/reports" month={month} label={formatPeriod(report.period)} isCurrent={month === current} />
        <a href={`/reports/export?month=${monthParam}`} download className={buttonClasses("primary", "sm")}>
          <Download aria-hidden className="size-4" />
          Export this month (CSV)
        </a>
      </div>

      {isEmpty ? (
        <Card>
          <EmptyState icon={FileText} title="Nothing recorded this month" description="Pick another month, or add transactions to see a report." />
        </Card>
      ) : (
        <>
          <Totals totals={report.totals} previous={report.previousTotals} money={money} previousLabel={formatPeriod(report.previousPeriod)} />

          <Card>
            <CardHeader>
              <CardTitle>Spending by category</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {report.expensesByCategory.length === 0 ? (
                <p className="text-sm text-muted">No spending this month.</p>
              ) : (
                <table className="w-full min-w-lg text-left text-sm">
                  <thead className="text-xs text-subtle">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Spent</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Budget</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Left</th>
                      <th scope="col" className="py-2 text-right font-medium">Last month</th>
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-line">
                    {report.expensesByCategory.map((line) => {
                      const left = line.budgetMinor === null ? null : line.budgetMinor - line.amountMinor;
                      return (
                        <tr key={line.id}>
                          <th scope="row" className="py-2 pr-3 font-normal text-fg">
                            <span className="flex items-center gap-2">
                              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: line.color }} />
                              {line.name}
                            </span>
                          </th>
                          <td className="py-2 pr-3 text-right text-fg">{money(line.amountMinor)}</td>
                          <td className="py-2 pr-3 text-right text-muted">{line.budgetMinor === null ? "—" : money(line.budgetMinor)}</td>
                          <td className={cn("py-2 pr-3 text-right", left !== null && left < 0 ? "text-negative" : "text-muted")}>
                            {left === null ? "—" : left < 0 ? `${money(-left)} over` : money(left)}
                          </td>
                          <td className="py-2 text-right text-muted">{money(line.previousMinor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Income by category</CardTitle>
              </CardHeader>
              <CardContent>
                {report.incomeByCategory.length > 0 ? (
                  <CategoryBars rows={report.incomeByCategory} currency={settings.currency} label="Income by category" kind="income" />
                ) : (
                  <p className="text-sm text-muted">No income recorded this month.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending by payment method</CardTitle>
              </CardHeader>
              <CardContent>
                {report.expensesByPaymentMethod.length > 0 ? (
                  <ul className="divide-y divide-line text-sm">
                    {report.expensesByPaymentMethod.map((line) => (
                      <li key={line.method ?? "none"} className="flex justify-between gap-3 py-2">
                        <span className="text-fg">
                          {line.method ? PAYMENT_METHOD_LABELS[line.method] : "Not recorded"}
                          <span className="ml-2 text-xs text-subtle">
                            {line.count} payment{line.count === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="tabular text-fg">{money(line.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No spending this month.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {report.largestExpenses.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Largest expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="divide-y divide-line text-sm">
                  {report.largestExpenses.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-fg">{t.description || "Expense"}</span>
                        <span className="text-xs text-subtle">{formatDay(t.occurred_on)}</span>
                      </span>
                      <span className="tabular shrink-0 text-fg">{money(t.amount_minor)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Totals({
  totals,
  previous,
  money,
  previousLabel,
}: {
  totals: PeriodTotals;
  previous: PeriodTotals;
  money: (minor: number) => string;
  previousLabel: string;
}) {
  const items = [
    { label: "Income", value: totals.incomeMinor, before: previous.incomeMinor, upIsGood: true },
    { label: "Spending", value: totals.expensesMinor, before: previous.expensesMinor, upIsGood: false },
    { label: "Net (income − spending)", value: totals.netMinor, before: previous.netMinor, upIsGood: true },
    { label: "Saved", value: totals.savedMinor, before: previous.savedMinor, upIsGood: true },
  ];
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const change = percentChange(item.value, item.before);
            const good = change !== null && (change >= 0) === item.upIsGood;
            return (
              <div key={item.label}>
                <dt className="text-xs text-subtle">{item.label}</dt>
                <dd className={cn("tabular text-lg font-semibold", item.value < 0 ? "text-negative" : "text-fg")}>{money(item.value)}</dd>
                <dd className="text-xs text-subtle">
                  {change === null || Math.round(change) === 0 ? (
                    `${money(item.before)} in ${previousLabel}`
                  ) : (
                    <>
                      <span className={good ? "text-positive" : "text-negative"}>
                        {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}%
                      </span>{" "}
                      vs {previousLabel}
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-4 text-xs text-subtle">
          {totals.savingsRate === null
            ? "No income this month, so there is no savings rate."
            : `You saved ${Math.round(totals.savingsRate)}% of your income.`}{" "}
          Transfers between your own accounts are not counted as income or spending.
        </p>
      </CardContent>
    </Card>
  );
}
