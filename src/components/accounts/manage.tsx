"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import {
  archiveAccount,
  archiveCategory,
  deleteAccount,
  deleteCategory,
  saveAccount,
  saveCategory,
} from "@/app/(app)/accounts/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, fieldAria } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import type { AccountOption, CategoryOption } from "@/lib/data/reference";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { formatMoney, minorToInputValue } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  ACCOUNT_TYPES,
  accountSchema,
  categorySchema,
  type AccountInput,
  type CategoryInput,
} from "@/lib/validation/finance";

const COLOURS = ["#f97316", "#3b82f6", "#a855f7", "#eab308", "#ec4899", "#06b6d4", "#ef4444", "#22c55e", "#14b8a6", "#84cc16", "#64748b"];

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<ActionResult>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.error);
    });
  };
  return { pending, error, setError, run };
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("rounded-lg p-2 text-subtle hover:bg-surface-2", danger ? "hover:text-negative" : "hover:text-fg")}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function AccountsManager({ accounts, currency }: { accounts: AccountOption[]; currency: string }) {
  const [editing, setEditing] = useState<AccountOption | "new" | null>(null);
  const [deleting, setDeleting] = useState<AccountOption | null>(null);
  const { pending, error, run } = useAction();

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Accounts</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus aria-hidden className="size-4" />
          Add account
        </Button>
      </div>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {accounts.map((a) => (
          <li key={a.id} className={cn("flex items-center gap-3 px-4 py-3", a.is_archived && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {a.name}
                {a.is_archived ? <span className="ml-2 text-xs text-subtle">Archived</span> : null}
              </p>
              <p className="text-xs text-subtle">{ACCOUNT_TYPE_LABELS[a.type]}</p>
            </div>
            <span className={cn("tabular text-sm", a.balance_minor < 0 && "text-negative")}>
              {formatMoney(a.balance_minor, currency)}
            </span>
            <div className="flex">
              <IconButton label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                <Pencil aria-hidden className="size-4" />
              </IconButton>
              <IconButton
                label={a.is_archived ? `Restore ${a.name}` : `Archive ${a.name}`}
                onClick={() => run(() => archiveAccount(a.id, !a.is_archived))}
              >
                {a.is_archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
              </IconButton>
              <IconButton label={`Delete ${a.name}`} danger onClick={() => setDeleting(a)}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add account" : "Edit account"}>
        {editing ? (
          <AccountForm
            key={editing === "new" ? "new" : editing.id}
            account={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "account"}?`}
        description="Only accounts without transactions can be deleted. Archive an account to hide it while keeping its history."
        confirmLabel="Delete"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteAccount(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}

function AccountForm({ account, onDone }: { account: AccountOption | null; onDone: () => void }) {
  const { pending, error, run } = useAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "bank",
      openingBalance: account ? minorToInputValue(account.opening_balance_minor) : "",
    },
  });

  return (
    <form method="post" noValidate className="space-y-4" onSubmit={handleSubmit((values) => run(() => saveAccount(account?.id ?? null, values), onDone))}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field id="acc-name" label="Name" error={errors.name?.message}>
        <Input placeholder="e.g. Meezan Bank, JazzCash" {...fieldAria("acc-name", errors.name?.message)} {...register("name")} />
      </Field>
      <Field id="acc-type" label="Type" hint="Savings accounts are left out of your available balance." error={errors.type?.message}>
        <Select {...fieldAria("acc-type", errors.type?.message, "hint")} {...register("type")}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="acc-opening"
        label="Opening balance"
        hint="What the account held before your first recorded transaction. Use a minus sign for card debt."
        error={errors.openingBalance?.message}
      >
        <Input inputMode="decimal" placeholder="0" {...fieldAria("acc-opening", errors.openingBalance?.message, "hint")} {...register("openingBalance")} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function CategoriesManager({ categories }: { categories: CategoryOption[] }) {
  const [editing, setEditing] = useState<CategoryOption | "income" | "expense" | null>(null);
  const [deleting, setDeleting] = useState<CategoryOption | null>(null);
  const { pending, error, run } = useAction();

  return (
    <>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="grid gap-6 md:grid-cols-2">
        {(["expense", "income"] as const).map((kind) => (
          <section key={kind} aria-label={kind === "expense" ? "Expense categories" : "Income categories"}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{kind === "expense" ? "Expense categories" : "Income sources"}</h2>
              <Button size="sm" variant="secondary" onClick={() => setEditing(kind)}>
                <Plus aria-hidden className="size-4" />
                Add
              </Button>
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", c.is_archived && "opacity-60")}>
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c.name}
                      {c.is_archived ? <span className="ml-2 text-xs text-subtle">Archived</span> : null}
                    </span>
                    <div className="flex">
                      <IconButton label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton
                        label={c.is_archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                        onClick={() => run(() => archiveCategory(c.id, !c.is_archived))}
                      >
                        {c.is_archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
                      </IconButton>
                      <IconButton label={`Delete ${c.name}`} danger onClick={() => setDeleting(c)}>
                        <Trash2 aria-hidden className="size-4" />
                      </IconButton>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={typeof editing === "string" ? (editing === "income" ? "Add income source" : "Add expense category") : "Edit category"}
      >
        {editing ? (
          <CategoryForm
            key={typeof editing === "string" ? editing : editing.id}
            category={typeof editing === "string" ? null : editing}
            kind={typeof editing === "string" ? editing : editing.kind}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "category"}?`}
        description="Its budgets are removed too. Categories used by transactions can't be deleted; archive them instead."
        confirmLabel="Delete"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteCategory(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}

function CategoryForm({ category, kind, onDone }: { category: CategoryOption | null; kind: "income" | "expense"; onDone: () => void }) {
  const { pending, error, run } = useAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? "", kind, color: category?.color ?? COLOURS[0] },
  });

  return (
    <form method="post" noValidate className="space-y-4" onSubmit={handleSubmit((values) => run(() => saveCategory(category?.id ?? null, values), onDone))}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field id="cat-name" label="Name" error={errors.name?.message}>
        <Input {...fieldAria("cat-name", errors.name?.message)} {...register("name")} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLOURS.map((colour) => (
            <label key={colour} className="cursor-pointer">
              <input type="radio" value={colour} className="peer sr-only" {...register("color")} />
              <span
                className="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                style={{ backgroundColor: colour }}
              />
              <span className="sr-only">{colour}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
