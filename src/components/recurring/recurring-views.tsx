"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { deleteRecurringRule, postOccurrence, setRecurringActive } from "@/app/(app)/recurring/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { AccountOption, CategoryOption } from "@/lib/data/reference";
import type { DueItem, RecurringRule } from "@/lib/data/recurring";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { describeFrequency } from "@/lib/recurrence";
import { cn } from "@/lib/cn";
import { RecurringForm } from "./recurring-form";

type Reference = { accounts: AccountOption[]; categories: CategoryOption[]; today: string };

export function dueLabel(daysUntil: number) {
  if (daysUntil < 0) return daysUntil === -1 ? "1 day overdue" : `${-daysUntil} days overdue`;
  if (daysUntil === 0) return "Due today";
  if (daysUntil === 1) return "Due tomorrow";
  return `In ${daysUntil} days`;
}

/** Due and upcoming occurrences with Record / Skip for the next one of each rule. */
export function DueList({ items, currency, compact }: { items: DueItem[]; currency: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (ruleId: string, skip: boolean) => {
    setError(null);
    setBusy(`${ruleId}:${skip}`);
    startTransition(async () => {
      const result = await postOccurrence(ruleId, skip);
      if (!result.ok) setError(result.error);
      setBusy(null);
    });
  };

  return (
    <>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <ul className="divide-y divide-line">
        {items.map(({ rule, date, daysUntil, isNext }) => {
          // Only the next occurrence can be recorded, and only once it is close.
          const actionable = isNext && daysUntil <= Math.max(rule.remind_days_before, 3);
          return (
            <li key={`${rule.id}-${date}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{rule.name}</p>
                <p className={cn("text-xs", daysUntil < 0 ? "text-negative" : daysUntil <= 1 ? "text-warning" : "text-subtle")}>
                  {formatDay(date)} · {dueLabel(daysUntil)}
                </p>
              </div>
              <span className={cn("tabular text-sm", rule.kind === "income" && "text-positive")}>
                {rule.kind === "income" ? "+" : ""}
                {formatMoney(rule.amount_minor, currency)}
              </span>
              {actionable ? (
                <div className={cn("flex gap-1", compact ? "" : "w-full justify-end sm:w-auto")}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(rule.id, true)}
                    loading={pending && busy === `${rule.id}:true`}
                    disabled={pending}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => act(rule.id, false)}
                    loading={pending && busy === `${rule.id}:false`}
                    disabled={pending}
                  >
                    {rule.kind === "income" ? "Mark received" : rule.kind === "transfer" ? "Mark done" : "Mark paid"}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function RecurringManager({ rules, accounts, categories, today, currency }: Reference & { rules: RecurringRule[]; currency: string }) {
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      after?.();
    });

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">All recurring items</h2>
        <Button size="sm" onClick={() => setEditing("new")} disabled={accounts.length === 0}>
          <Plus aria-hidden className="size-4" />
          Add recurring item
        </Button>
      </div>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icon={CalendarClock}
            title="No recurring items yet"
            description="Add your salary, rent, utilities and subscriptions so you get reminders and never record them twice."
          />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rules.map((r) => {
            const category = r.category_id ? categoryById.get(r.category_id) : undefined;
            const target =
              r.kind === "transfer"
                ? `${accountById.get(r.account_id)?.name ?? "?"} → ${accountById.get(r.to_account_id ?? "")?.name ?? "?"}`
                : category?.name;
            return (
              <li key={r.id} className={cn("flex items-center gap-3 px-4 py-3", !r.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {r.name}
                    {r.is_bill ? <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">Bill</span> : null}
                    {!r.is_active ? <span className="ml-2 text-xs text-subtle">{r.end_on && r.next_due_on > r.end_on ? "Ended" : "Paused"}</span> : null}
                  </p>
                  <p className="truncate text-xs text-subtle">
                    {describeFrequency(r.frequency, r.interval_count)} · {target}
                    {r.is_active ? ` · next ${formatDay(r.next_due_on)}` : ""}
                  </p>
                </div>
                <span className={cn("tabular text-sm", r.kind === "income" && "text-positive")}>{formatMoney(r.amount_minor, currency)}</span>
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    aria-label={`Edit ${r.name}`}
                    className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => setRecurringActive(r.id, !r.is_active))}
                    aria-label={r.is_active ? `Pause ${r.name}` : `Resume ${r.name}`}
                    disabled={pending}
                    className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"
                  >
                    {r.is_active ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(r)}
                    aria-label={`Delete ${r.name}`}
                    className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-negative"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add recurring item" : "Edit recurring item"}>
        {editing ? (
          <RecurringForm
            key={editing === "new" ? "new" : editing.id}
            rule={editing === "new" ? null : editing}
            accounts={accounts}
            categories={categories}
            today={today}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "recurring item"}?`}
        description="Future reminders stop. Transactions it already recorded are kept."
        confirmLabel="Delete"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteRecurringRule(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}
