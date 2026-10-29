"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/button";
import { addMonths, parseIsoDate } from "@/lib/dates";
import type { AccountOption, CategoryOption } from "@/lib/data/reference";

/** Search, filters and month navigation, all kept in the URL so views can be shared and reloaded. */
export function TransactionFilters({
  accounts,
  categories,
  month,
  monthLabel,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  /** "2026-10-01" or "all". */
  month: string;
  monthLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if (query === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q: query.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function shiftMonth(delta: number) {
    const { year, month: m } = parseIsoDate(month);
    const next = addMonths(year, m, delta);
    update({ month: `${next.year}-${String(next.month).padStart(2, "0")}` });
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {month === "all" ? (
          <button type="button" onClick={() => update({ month: "" })} className="text-sm text-accent hover:underline">
            Back to this month
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Previous month"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Next month"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        )}
        {month !== "all" ? (
          <button type="button" onClick={() => update({ month: "all" })} className="text-sm text-muted hover:text-fg">
            All time
          </button>
        ) : null}
        {pending ? <Spinner className="ml-auto text-muted" /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_repeat(3,minmax(0,10rem))]">
        <div className="relative col-span-2 md:col-span-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            aria-label="Search transactions"
            placeholder="Search description, note or category"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select aria-label="Type" value={params.get("kind") ?? ""} onChange={(e) => update({ kind: e.target.value })}>
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </Select>
        <Select aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.kind === "income" ? " (income)" : ""}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Account"
          value={params.get("account") ?? ""}
          onChange={(e) => update({ account: e.target.value })}
          className="col-span-2 md:col-span-1"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      {params.get("q") || params.get("kind") || params.get("category") || params.get("account") ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            update({ q: "", kind: "", category: "", account: "" });
          }}
          className="flex items-center gap-1 text-sm text-muted hover:text-fg"
        >
          <X aria-hidden className="size-3.5" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
