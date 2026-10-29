import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftRight, SearchX } from "lucide-react";
import { AddTransactionButton, TransactionRows } from "@/components/transactions/transaction-dialogs";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/data/profile";
import { getAccounts, getCategories, getGoalOptions } from "@/lib/data/reference";
import { PAGE_SIZE, listTransactions, parseFilters } from "@/lib/data/transactions";
import { formatPeriod, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  return (
    <Suspense fallback={<TransactionsSkeleton />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/transactions">["searchParams"] }) {
  const [params, settings, accounts, categories, goals] = await Promise.all([
    searchParams,
    getSettings(),
    getAccounts(),
    getCategories(),
    getGoalOptions(),
  ]);
  const today = todayIn(settings.timezone);
  const filters = parseFilters(params, today, settings.month_start_day);
  const needle = filters.q.toLowerCase();
  const matchingCategoryIds = needle ? categories.filter((c) => c.name.toLowerCase().includes(needle)).map((c) => c.id) : [];
  const list = await listTransactions(filters, settings.month_start_day, matchingCategoryIds);
  const money = (minor: number) => formatMoney(minor, settings.currency);
  const filtered = Boolean(filters.q || filters.kind || filters.categoryId || filters.accountId);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "page") next.set(key, value);
    if (page > 1) next.set("page", String(page));
    return `/transactions?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Income, expenses and transfers between your accounts."
        actions={<AddTransactionButton accounts={accounts} categories={categories} goals={goals} today={today} />}
      />

      <TransactionFilters
        accounts={accounts}
        categories={categories}
        month={filters.month}
        monthLabel={list.period ? formatPeriod(list.period) : "All time"}
      />

      <dl className="mb-5 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-subtle">Income</dt>
          <dd className="tabular text-positive">{money(list.incomeMinor)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-subtle">Expenses</dt>
          <dd className="tabular">{money(list.expensesMinor)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-subtle">Net</dt>
          <dd className={list.incomeMinor - list.expensesMinor < 0 ? "tabular text-negative" : "tabular"}>
            {money(list.incomeMinor - list.expensesMinor)}
          </dd>
        </div>
      </dl>

      {list.items.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={SearchX} title="Nothing matches these filters" description="Try another search or clear the filters." />
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions in this period"
              description="Add income, expenses or transfers and they will appear here."
              action={<AddTransactionButton accounts={accounts} categories={categories} goals={goals} today={today} label="Add the first one" />}
            />
          )}
        </Card>
      ) : (
        <>
          <TransactionRows items={list.items} accounts={accounts} categories={categories} goals={goals} currency={settings.currency} />
          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-between text-sm">
              {filters.page > 1 ? (
                <Link href={pageHref(filters.page - 1)} className="text-accent hover:underline">
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Page {filters.page} of {pages} · {list.total} transactions
              </span>
              {filters.page < pages ? (
                <Link href={pageHref(filters.page + 1)} className="text-accent hover:underline">
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading transactions">
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-3 h-10 w-full" />
      <Skeleton className="mb-5 h-14 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="mb-2 h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
