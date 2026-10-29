import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsManager } from "@/components/savings/goals";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getGoals } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/profile";
import { getAccounts } from "@/lib/data/reference";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Savings goals" };

export default function SavingsPage() {
  return (
    <>
      <PageHeader title="Savings goals" description="Targets, deadlines and how much to put aside each month." />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Goals />
      </Suspense>
    </>
  );
}

async function Goals() {
  const [settings, accounts] = await Promise.all([getSettings(), getAccounts()]);
  const today = todayIn(settings.timezone);
  const goals = await getGoals(today, settings.month_start_day);
  return <GoalsManager goals={goals} accounts={accounts} currency={settings.currency} today={today} />;
}
