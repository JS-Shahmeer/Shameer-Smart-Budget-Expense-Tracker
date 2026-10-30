import type { Metadata } from "next";
import { Suspense } from "react";
import { StatementImport } from "@/components/transactions/statement-import";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategorizedDescriptions, getImportedCounts } from "@/lib/data/imports";
import { getSettings } from "@/lib/data/profile";
import { getAccounts, getCategories } from "@/lib/data/reference";

export const metadata: Metadata = { title: "Import statement" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import a bank statement"
        description="Bring in transactions from a CSV or Excel statement. Nothing is saved until you review it."
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <Importer />
      </Suspense>
    </>
  );
}

async function Importer() {
  const [settings, accounts, categories, history] = await Promise.all([
    getSettings(),
    getAccounts(),
    getCategories(),
    getCategorizedDescriptions(),
  ]);
  const importedCounts = await getImportedCounts(accounts.map((a) => a.id));
  return (
    <StatementImport
      accounts={accounts}
      categories={categories}
      history={history}
      importedCounts={importedCounts}
      currency={settings.currency}
    />
  );
}
