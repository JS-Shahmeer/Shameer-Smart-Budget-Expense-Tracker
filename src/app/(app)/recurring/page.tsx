import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";
import { DueList, RecurringManager } from "@/components/recurring/recurring-views";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/data/profile";
import { getRecurringRules, upcoming } from "@/lib/data/recurring";
import { getAccounts, getCategories } from "@/lib/data/reference";
import { todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Recurring & bills" };

export default function RecurringPage() {
  return (
    <>
      <PageHeader
        title="Recurring & bills"
        description="Salary, rent, utilities and subscriptions. Mark each one when it happens so it's recorded exactly once."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Recurring />
      </Suspense>
    </>
  );
}

async function Recurring() {
  const [settings, rules, accounts, categories] = await Promise.all([getSettings(), getRecurringRules(), getAccounts(), getCategories()]);
  const today = todayIn(settings.timezone);
  const next30 = upcoming(rules, today, 30);
  const billsDue = next30.filter((i) => i.rule.kind !== "income").reduce((sum, i) => sum + i.rule.amount_minor, 0);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Due and coming up (next 30 days)</CardTitle>
          {next30.length > 0 ? (
            <span className="tabular text-sm text-muted">{formatMoney(billsDue, settings.currency)} going out</span>
          ) : null}
        </CardHeader>
        <CardContent className="pt-1">
          {next30.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Nothing due in the next 30 days" />
          ) : (
            <DueList items={next30} currency={settings.currency} />
          )}
        </CardContent>
      </Card>

      <section>
        <RecurringManager rules={rules} accounts={accounts} categories={categories} today={today} currency={settings.currency} />
      </section>
    </div>
  );
}
