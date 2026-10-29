import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { DueList } from "@/components/recurring/recurring-views";
import { AddTransactionButton } from "@/components/transactions/transaction-dialogs";
import { ButtonLink } from "@/components/ui/button";
import { getDashboardData, type RecentTransaction } from "@/lib/data/dashboard";
import { billReminders, getRecurringRules } from "@/lib/data/recurring";
import { getAccounts, getCategories, getGoalOptions } from "@/lib/data/reference";
import { formatDay, formatPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const [{ settings, today, period, summary, recent, hasAnyTransactions }, accounts, categories, rules] = await Promise.all([
    getDashboardData(),
    getAccounts(),
    getCategories(),
    getRecurringRules(),
  ]);
  const bills = billReminders(rules, today);
  const money = (minor: number) => formatMoney(minor, settings.currency);
  const overBudget = summary.budgets.filter((b) => b.status === "over");
  const nearBudget = summary.budgets.filter((b) => b.status === "warning");

  return (
    <>
      <PageHeader
        title={settings.display_name ? `Hello, ${settings.display_name}` : "Dashboard"}
        description={`Budget month: ${formatPeriod(period)}`}
        actions={<AddTransactionButton accounts={accounts} categories={categories} today={today} />}
      />

      {bills.length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Bills due soon</CardTitle>
            <Link href="/recurring" className="text-sm text-accent hover:underline">
              All recurring
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            <DueList items={bills} currency={settings.currency} compact />
          </CardContent>
        </Card>
      ) : null}

      {overBudget.length > 0 ? (
        <Alert tone="error" title="Over budget" className="mb-4">
          {overBudget.map((b) => `${b.name} by ${money(b.spentMinor - b.limitMinor)}`).join(", ")}.
        </Alert>
      ) : null}
      {nearBudget.length > 0 ? (
        <Alert tone="warning" title="Close to the limit" className="mb-4">
          {nearBudget.map((b) => `${b.name} (${Math.round(b.percent)}%)`).join(", ")}.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income this month" value={money(summary.incomeMinor)} icon={ArrowDownLeft} tone="positive" />
        <StatCard
          label="Spent this month"
          value={money(summary.expensesMinor)}
          icon={ArrowUpRight}
          detail={`Net cash flow ${money(summary.netCashFlowMinor)}`}
        />
        <StatCard
          label="Available balance"
          value={money(summary.availableBalanceMinor)}
          icon={Wallet}
          tone={summary.availableBalanceMinor < 0 ? "negative" : "neutral"}
          detail="Cash, bank, wallets and cards. Savings excluded."
        />
        <StatCard
          label="Saved this month"
          value={money(summary.savedMinor)}
          icon={PiggyBank}
          tone={summary.savedMinor < 0 ? "negative" : "positive"}
          detail={`${money(summary.savingsBalanceMinor)} in savings accounts`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Budget utilisation</CardTitle>
            {summary.budgetedMinor > 0 ? (
              <span className="tabular text-sm text-muted">
                {money(summary.budgetSpentMinor)} of {money(summary.budgetedMinor)}
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            {summary.budgets.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No budgets for this month"
                description="Set monthly limits for categories like food and transport to see how much of each is used."
                action={
                  <ButtonLink href="/budgets" variant="secondary" size="sm">
                    Set budgets
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-4">
                {summary.budgets.map((b) => (
                  <li key={b.categoryId}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                      <span className={cn("tabular", b.status === "over" ? "text-negative" : "text-muted")}>
                        {money(b.spentMinor)} / {money(b.limitMinor)}
                      </span>
                    </div>
                    <Progress value={b.percent} tone={b.status} label={`${b.name} budget used`} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {hasAnyTransactions ? (
              <ul className="divide-y divide-line">
                {recent.map((t) => (
                  <RecentRow key={t.id} transaction={t} money={money} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ArrowLeftRight}
                title="No transactions yet"
                description="Income, expenses and transfers you record will show up here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RecentRow({ transaction: t, money }: { transaction: RecentTransaction; money: (minor: number) => string }) {
  const label = t.description || t.categoryName || (t.kind === "transfer" ? "Transfer" : "Transaction");
  const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate text-fg">{label}</p>
        <p className="text-xs text-subtle">
          {formatDay(t.occurred_on)}
          {t.categoryName && t.description ? ` · ${t.categoryName}` : null}
        </p>
      </div>
      <span className={cn("tabular shrink-0", t.kind === "income" ? "text-positive" : t.kind === "expense" ? "text-fg" : "text-muted")}>
        {sign}
        {money(t.amount_minor)}
      </span>
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Skeleton className="h-64 rounded-xl lg:col-span-3" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
