"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { deleteTransaction } from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import type { AccountOption, CategoryOption, GoalOption } from "@/lib/data/reference";
import type { TransactionListItem } from "@/lib/data/transactions";
import { formatDay } from "@/lib/dates";
import { formatMoney, minorToInputValue } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { cn } from "@/lib/cn";
import type { TransactionInput } from "@/lib/validation/finance";
import { TransactionForm } from "./transaction-form";

type Reference = { accounts: AccountOption[]; categories: CategoryOption[]; goals?: GoalOption[] };

/** Sensible starting values: today, an everyday account, expense. */
export function newTransactionDefaults(accounts: AccountOption[], today: string): TransactionInput {
  const account = accounts.find((a) => !a.is_archived && a.type !== "savings") ?? accounts.find((a) => !a.is_archived);
  return {
    kind: "expense",
    amount: "",
    occurredOn: today,
    accountId: account?.id ?? "",
    toAccountId: "",
    categoryId: "",
    savingsGoalId: "",
    paymentMethod: "",
    description: "",
    note: "",
  };
}

export function AddTransactionButton({ accounts, categories, goals, today, label = "Add transaction" }: Reference & { today: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={accounts.length === 0}>
        <Plus aria-hidden className="size-4" />
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add transaction">
        <TransactionForm
          accounts={accounts}
          categories={categories}
          goals={goals}
          defaults={newTransactionDefaults(accounts, today)}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

export function TransactionRows({
  items,
  accounts,
  categories,
  goals,
  currency,
}: Reference & { items: TransactionListItem[]; currency: string }) {
  const [editing, setEditing] = useState<TransactionListItem | null>(null);
  const [deleting, setDeleting] = useState<TransactionListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const goalById = new Map((goals ?? []).map((g) => [g.id, g]));

  // Group by day, newest first (the list already arrives in that order).
  const groups: { date: string; items: TransactionListItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.date === item.occurred_on) last.items.push(item);
    else groups.push({ date: item.occurred_on, items: [item] });
  }

  return (
    <>
      {deleteError ? (
        <p role="alert" className="mb-3 text-sm text-negative">
          {deleteError}
        </p>
      ) : null}
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.date} aria-label={formatDay(group.date)}>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-subtle uppercase">{formatDay(group.date)}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {group.items.map((t) => {
                const category = t.category_id ? categoryById.get(t.category_id) : undefined;
                const from = accountById.get(t.account_id);
                const to = t.to_account_id ? accountById.get(t.to_account_id) : undefined;
                const title =
                  t.description || category?.name || (t.kind === "transfer" ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : "Transaction");
                const meta = [
                  t.kind === "transfer" ? (t.description ? `${from?.name} → ${to?.name}` : "Transfer") : category?.name,
                  t.kind !== "transfer" ? from?.name : null,
                  t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : null,
                  t.savings_goal_id ? `Goal: ${goalById.get(t.savings_goal_id)?.name ?? "removed"}` : null,
                ].filter((part) => part && part !== title);

                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category?.color ?? (t.kind === "transfer" ? "#9aa3b5" : "#64748b") }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm text-fg">
                        {title}
                        {t.recurring_rule_id ? <Repeat aria-label="Recurring" className="size-3 shrink-0 text-subtle" /> : null}
                      </p>
                      <p className="truncate text-xs text-subtle">{meta.join(" · ")}</p>
                    </div>
                    <span
                      className={cn(
                        "tabular shrink-0 text-sm",
                        t.kind === "income" ? "text-positive" : t.kind === "expense" ? "text-fg" : "text-muted",
                      )}
                    >
                      {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
                      {formatMoney(t.amount_minor, currency)}
                    </span>
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"
                        aria-label={`Edit ${title}`}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(t);
                        }}
                        className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-negative"
                        aria-label={`Delete ${title}`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit transaction">
        {editing ? (
          <TransactionForm
            key={editing.id}
            accounts={accounts}
            categories={categories}
            goals={goals}
            transactionId={editing.id}
            defaults={{
              kind: editing.kind,
              amount: minorToInputValue(editing.amount_minor),
              occurredOn: editing.occurred_on,
              accountId: editing.account_id,
              toAccountId: editing.to_account_id ?? "",
              categoryId: editing.category_id ?? "",
              savingsGoalId: editing.savings_goal_id ?? "",
              paymentMethod: editing.payment_method ?? "",
              description: editing.description ?? "",
              note: editing.note ?? "",
            }}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this transaction?"
        description={
          deleting
            ? `${formatMoney(deleting.amount_minor, currency)} on ${formatDay(deleting.occurred_on)} will be removed and balances updated. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const result = await deleteTransaction(deleting.id);
            if (!result.ok) setDeleteError(result.error);
            setDeleting(null);
          })
        }
      />
    </>
  );
}
