import type { Metadata } from "next";
import { Suspense } from "react";
import { BudgetHelp, BudgetRow, CopyBudgetsButton } from "@/components/budgets/budget-table";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { MonthNav } from "@/components/ui/month-nav";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudgetMonth } from "@/lib/data/budgets";
import { getSettings } from "@/lib/data/profile";
import { budgetPeriodFor, formatPeriod, isValidIsoDate, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  return (
    <>
      <PageHeader title="Budgets" description="Monthly spending limits for each category." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Budgets searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Budgets({ searchParams }: { searchParams: PageProps<"/budgets">["searchParams"] }) {
  const [params, settings] = await Promise.all([searchParams, getSettings()]);
  const current = budgetPeriodFor(todayIn(settings.timezone), settings.month_start_day).month;
  const requested = typeof params.month === "string" ? `${params.month}-01` : "";
  const month = /^\d{4}-\d{2}-01$/.test(requested) && isValidIsoDate(requested) ? requested : current;
  const data = await getBudgetMonth(month, settings.month_start_day, settings.budget_warning_percent);
  const money = (minor: number) => formatMoney(minor, settings.currency);
  const over = data.lines.filter((l) => l.status === "over");
  const totalPercent = data.budgetedMinor > 0 ? (data.spentInBudgetsMinor / data.budgetedMinor) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/budgets" month={month} label={formatPeriod(data.period)} isCurrent={month === current} />
        {data.budgetedMinor === 0 && data.previousMonthHasBudgets ? (
          <CopyBudgetsButton fromMonth={data.previousMonth} toMonth={month} />
        ) : null}
      </div>

      {over.length > 0 ? (
        <Alert tone="error" title={over.length === 1 ? "1 category is over budget" : `${over.length} categories are over budget`}>
          {over.map((l) => `${l.name}: ${money(l.spentMinor - (l.limitMinor ?? 0))} over`).join(" · ")}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-subtle">Budgeted</p>
            <p className="tabular text-lg font-semibold">{money(data.budgetedMinor)}</p>
          </div>
          <div>
            <p className="text-xs text-subtle">Spent in budgeted categories</p>
            <p className="tabular text-lg font-semibold">{money(data.spentInBudgetsMinor)}</p>
          </div>
          <div>
            <p className="text-xs text-subtle">Spent without a budget</p>
            <p className="tabular text-lg font-semibold">{money(data.unbudgetedSpentMinor)}</p>
          </div>
          {data.budgetedMinor > 0 ? (
            <div className="sm:col-span-3">
              <Progress
                value={totalPercent}
                tone={totalPercent > 100 ? "over" : totalPercent >= settings.budget_warning_percent ? "warning" : "ok"}
                label="Total budget used"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <BudgetHelp />

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {data.lines.map((line) => (
          <BudgetRow key={`${month}-${line.id}-${line.limitMinor}`} line={line} month={month} currency={settings.currency} />
        ))}
      </ul>
    </div>
  );
}
