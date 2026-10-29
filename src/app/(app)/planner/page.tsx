import type { Metadata } from "next";
import { Suspense } from "react";
import { AffordabilityCalculator } from "@/components/planner/affordability";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlannerSnapshot } from "@/lib/data/planner";
import { getSettings } from "@/lib/data/profile";
import { formatDay, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Planner" };

export default function PlannerPage() {
  return (
    <>
      <PageHeader title="Planner" description="What you can safely spend each day until payday, and whether a purchase fits." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Planner />
      </Suspense>
    </>
  );
}

async function Planner() {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const snapshot = await getPlannerSnapshot(settings, today);
  const { plan } = snapshot;
  const money = (minor: number) => formatMoney(minor, settings.currency);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        {plan.shortfallMinor > 0 ? (
          <Alert tone="error" title="Bills and savings are more than you have">
            You are {money(plan.shortfallMinor)} short before payday on {formatDay(plan.payday)}. Consider moving a savings
            contribution or delaying a bill.
          </Alert>
        ) : null}

        <Card>
          <CardContent>
            <p className="text-sm text-muted">Left to spend today</p>
            <p className={cn("tabular mt-1 text-4xl font-semibold tracking-tight", plan.leftTodayMinor < 0 ? "text-negative" : "text-fg")}>
              {money(plan.leftTodayMinor)}
            </p>
            <p className="mt-2 text-sm text-subtle">
              Daily limit <span className="tabular text-fg">{money(plan.dailyLimitMinor)}</span>
              {plan.spentTodayMinor > 0 ? ` · spent ${money(plan.spentTodayMinor)} today` : ""} · {plan.daysLeft} day
              {plan.daysLeft === 1 ? "" : "s"} until payday on {formatDay(plan.payday)}
            </p>
            {plan.leftTodayMinor < 0 ? (
              <p className="mt-2 text-sm text-negative">
                You are over today&apos;s limit. Spending less over the next few days keeps you on track.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How the limit is worked out</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Money in everyday accounts at the start of today" value={money(plan.startOfDayMinor)} />
              <Line label={`Bills due before ${formatDay(plan.payday)}`} value={`− ${money(plan.billsMinor)}`} />
              <Line label="Savings to put aside" value={`− ${money(plan.savingsMinor)}`} />
              <div className="border-t border-line pt-2">
                <Line label="Free to spend until payday" value={money(plan.freeMinor)} strong />
              </div>
              <Line label={`Divided by ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"}, rounded down`} value={`${money(plan.dailyLimitMinor)} a day`} />
            </dl>
            <p className="mt-4 text-xs text-subtle">
              Savings accounts are not counted as spendable. Credit card balances owed reduce what you can spend.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Committed before payday</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {plan.commitments.length === 0 ? (
              <p className="text-sm text-subtle">
                No bills or savings due before payday. Add them under Recurring & bills and Savings goals so they are kept out of
                your daily limit.
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {plan.commitments.map((c, i) => (
                  <li key={`${c.name}-${c.date}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{c.name}</span>
                      <span className="text-xs text-subtle">
                        {c.type === "bill" ? "Bill" : "Savings"} · {c.date < plan.today ? `overdue since ${formatDay(c.date)}` : formatDay(c.date)}
                      </span>
                    </span>
                    <span className="tabular">{money(c.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="lg:sticky lg:top-8">
          <CardHeader>
            <CardTitle>Can I afford it?</CardTitle>
          </CardHeader>
          <CardContent>
            <AffordabilityCalculator snapshot={snapshot} currency={settings.currency} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-medium text-fg" : "text-muted"}>{label}</dt>
      <dd className={cn("tabular shrink-0", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}
