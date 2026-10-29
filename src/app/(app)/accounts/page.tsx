import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsManager, CategoriesManager } from "@/components/accounts/manage";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/data/profile";
import { getAccounts, getCategories } from "@/lib/data/reference";

export const metadata: Metadata = { title: "Accounts & categories" };

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Accounts & categories" description="Where your money is kept, and how you group it." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Manage />
      </Suspense>
    </>
  );
}

async function Manage() {
  const [settings, accounts, categories] = await Promise.all([getSettings(), getAccounts(), getCategories()]);
  return (
    <div className="space-y-10">
      <AccountsManager accounts={accounts} currency={settings.currency} />
      <CategoriesManager categories={categories} />
    </div>
  );
}
