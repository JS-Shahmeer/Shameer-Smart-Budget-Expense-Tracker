"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { deleteGoal, moveGoalMoney, saveGoal, setGoalStatus } from "@/app/(app)/savings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, fieldAria } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { ActionResult } from "@/lib/action-result";
import type { GoalWithProgress } from "@/lib/data/goals";
import type { AccountOption } from "@/lib/data/reference";
import { formatDay } from "@/lib/dates";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { formatMoney, minorToInputValue } from "@/lib/money";
import { cn } from "@/lib/cn";
import { contributionSchema, goalSchema, type ContributionInput, type GoalFormInput } from "@/lib/validation/finance";

const PACE = {
  reached: { label: "Reached", className: "bg-positive/15 text-positive" },
  "on-track": { label: "On track", className: "bg-accent/15 text-accent-strong" },
  behind: { label: "Behind plan", className: "bg-warning/15 text-warning" },
  overdue: { label: "Past target date", className: "bg-negative/15 text-negative" },
  "no-plan": { label: "No plan", className: "bg-surface-3 text-muted" },
} as const;

type Props = { goals: GoalWithProgress[]; accounts: AccountOption[]; currency: string; today: string };

export function GoalsManager({ goals, accounts, currency, today }: Props) {
  const [editing, setEditing] = useState<GoalWithProgress | "new" | null>(null);
  const [moving, setMoving] = useState<{ goal: GoalWithProgress; direction: "add" | "withdraw" } | null>(null);
  const [deleting, setDeleting] = useState<GoalWithProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const money = (minor: number) => formatMoney(minor, currency);
  const active = goals.filter((g) => g.status === "active");
  const others = goals.filter((g) => g.status !== "active");

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
      after?.();
    });

  const card = (g: GoalWithProgress) => {
    const p = g.progress;
    const pace = PACE[p.pace];
    return (
      <li key={g.id} className={cn("rounded-xl border border-line bg-surface p-5", g.status !== "active" && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{g.name}</h3>
            <p className="mt-0.5 text-xs text-subtle">
              {g.target_date ? `Target ${formatDay(g.target_date)} ${g.target_date.slice(0, 4)}` : "No target date"}
              {g.status !== "active" ? ` · ${g.status === "completed" ? "Completed" : "Archived"}` : ""}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", pace.className)}>{pace.label}</span>
        </div>

        <p className="tabular mt-4 text-xl font-semibold">
          {money(p.savedMinor)} <span className="text-sm font-normal text-subtle">of {money(g.target_minor)}</span>
        </p>
        <Progress value={p.percent} tone={p.reached ? "positive" : "ok"} label={`${g.name} progress`} className="mt-2" />

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-subtle">Still needed</dt>
            <dd className="tabular mt-0.5 text-sm">{money(p.remainingMinor)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Saved this month</dt>
            <dd className="tabular mt-0.5 text-sm">{money(p.contributedThisMonthMinor)}</dd>
          </div>
          {p.requiredMonthlyMinor !== null ? (
            <div>
              <dt className="text-subtle">Needed per month</dt>
              <dd className="tabular mt-0.5 text-sm">
                {money(p.requiredMonthlyMinor)}
                {p.monthsLeft ? <span className="text-subtle"> × {p.monthsLeft}</span> : null}
              </dd>
            </div>
          ) : null}
          {g.monthly_contribution_minor ? (
            <div>
              <dt className="text-subtle">Your plan</dt>
              <dd className="tabular mt-0.5 text-sm">{money(g.monthly_contribution_minor)} / month</dd>
            </div>
          ) : null}
        </dl>

        {p.dueThisMonthMinor > 0 ? (
          <p className="mt-3 text-xs text-muted">
            {money(p.dueThisMonthMinor)} still to put aside this month. The planner keeps this out of your daily limit.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {g.status === "active" ? (
            <>
              <Button size="sm" onClick={() => setMoving({ goal: g, direction: "add" })}>
                <ArrowDownToLine aria-hidden className="size-4" />
                Add money
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMoving({ goal: g, direction: "withdraw" })} disabled={p.savedMinor <= 0}>
                <ArrowUpFromLine aria-hidden className="size-4" />
                Withdraw
              </Button>
            </>
          ) : null}
          <div className="ml-auto flex">
            <button type="button" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg">
              <Pencil aria-hidden className="size-4" />
            </button>
            {g.status === "active" && p.reached ? (
              <button
                type="button"
                onClick={() => run(() => setGoalStatus(g.id, "completed"))}
                aria-label={`Mark ${g.name} completed`}
                className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-positive"
              >
                <CheckCircle2 aria-hidden className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => run(() => setGoalStatus(g.id, g.status === "active" ? "archived" : "active"))}
              aria-label={g.status === "active" ? `Archive ${g.name}` : `Reactivate ${g.name}`}
              className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg"
            >
              {g.status === "active" ? <Archive aria-hidden className="size-4" /> : <ArchiveRestore aria-hidden className="size-4" />}
            </button>
            <button type="button" onClick={() => setDeleting(g)} aria-label={`Delete ${g.name}`} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-negative">
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden className="size-4" />
          New goal
        </Button>
      </div>
      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      {goals.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icon={PiggyBank}
            title="No savings goals yet"
            description="Set a target like an emergency fund or a new laptop. You'll see how much to put aside each month to get there on time."
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">{active.map(card)}</ul>
          {others.length > 0 ? (
            <>
              <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">Completed and archived</h2>
              <ul className="grid gap-4 md:grid-cols-2">{others.map(card)}</ul>
            </>
          ) : null}
        </>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New savings goal" : "Edit goal"}>
        {editing ? (
          <GoalForm key={editing === "new" ? "new" : editing.id} goal={editing === "new" ? null : editing} accounts={accounts} today={today} onDone={() => setEditing(null)} />
        ) : null}
      </Dialog>

      <Dialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={moving?.direction === "withdraw" ? `Withdraw from ${moving.goal.name}` : `Add money to ${moving?.goal.name ?? ""}`}
        description="This is recorded as a transfer between your accounts, so it is not counted as spending or income."
      >
        {moving ? (
          <MoveMoneyForm
            key={`${moving.goal.id}-${moving.direction}`}
            goal={moving.goal}
            direction={moving.direction}
            accounts={accounts}
            today={today}
            currency={currency}
            onDone={() => setMoving(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "goal"}?`}
        description="The goal is removed. Money you moved stays in your accounts and its transfers are kept."
        confirmLabel="Delete"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteGoal(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}

function GoalForm({ goal, accounts, today, onDone }: { goal: GoalWithProgress | null; accounts: AccountOption[]; today: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const savingsAccounts = accounts.filter((a) => (a.type === "savings" && !a.is_archived) || a.id === goal?.account_id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<GoalFormInput>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: goal?.name ?? "",
      target: goal ? minorToInputValue(goal.target_minor) : "",
      starting: goal?.starting_minor ? minorToInputValue(goal.starting_minor) : "",
      targetDate: goal?.target_date ?? "",
      monthlyContribution: goal?.monthly_contribution_minor ? minorToInputValue(goal.monthly_contribution_minor) : "",
      accountId: goal?.account_id ?? savingsAccounts[0]?.id ?? "",
    },
  });
  const err = (f: keyof GoalFormInput) => errors[f]?.message;

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        startTransition(async () => {
          setFormError(null);
          const result = await saveGoal(goal?.id ?? null, values);
          if (result.ok) return onDone();
          setFormError(result.error);
          for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof GoalFormInput, { message });
        }),
      )}
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field id="goal-name" label="Name" error={err("name")}>
        <Input placeholder="Emergency fund, new laptop…" {...fieldAria("goal-name", err("name"))} {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="goal-target" label="Target amount" error={err("target")}>
          <Input inputMode="decimal" placeholder="0" {...fieldAria("goal-target", err("target"))} {...register("target")} />
        </Field>
        <Field id="goal-date" label="Target date (optional)" error={err("targetDate")}>
          <Input type="date" min={today} {...fieldAria("goal-date", err("targetDate"))} {...register("targetDate")} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="goal-monthly" label="Plan per month (optional)" error={err("monthlyContribution")}>
          <Input inputMode="decimal" placeholder="0" {...fieldAria("goal-monthly", err("monthlyContribution"))} {...register("monthlyContribution")} />
        </Field>
        <Field id="goal-starting" label="Already saved" hint="Money saved before you started tracking." error={err("starting")}>
          <Input inputMode="decimal" placeholder="0" {...fieldAria("goal-starting", err("starting"), "hint")} {...register("starting")} />
        </Field>
      </div>
      <Field id="goal-account" label="Kept in" hint="The savings account this goal's money goes into." error={err("accountId")}>
        <Select {...fieldAria("goal-account", err("accountId"), "hint")} {...register("accountId")}>
          <option value="">Any savings account</option>
          {savingsAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {goal ? "Save changes" : "Create goal"}
        </Button>
      </div>
    </form>
  );
}

function MoveMoneyForm({
  goal,
  direction,
  accounts,
  today,
  currency,
  onDone,
}: {
  goal: GoalWithProgress;
  direction: "add" | "withdraw";
  accounts: AccountOption[];
  today: string;
  currency: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const everyday = accounts.filter((a) => !a.is_archived && a.type !== "savings");
  const suggested =
    direction === "add" ? (goal.progress.dueThisMonthMinor || goal.monthly_contribution_minor || 0) : 0;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContributionInput>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      direction,
      amount: suggested ? minorToInputValue(suggested) : "",
      accountId: (everyday.find((a) => a.type === "bank") ?? everyday[0])?.id ?? "",
      occurredOn: today,
    },
  });
  const err = (f: keyof ContributionInput) => errors[f]?.message;

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        startTransition(async () => {
          setFormError(null);
          const result = await moveGoalMoney(goal.id, values);
          if (result.ok) return onDone();
          setFormError(result.error);
          for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof ContributionInput, { message });
        }),
      )}
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="move-amount"
          label="Amount"
          hint={direction === "withdraw" ? `${formatMoney(goal.progress.savedMinor, currency)} saved` : undefined}
          error={err("amount")}
        >
          <Input inputMode="decimal" {...fieldAria("move-amount", err("amount"), direction === "withdraw" ? "hint" : undefined)} {...register("amount")} />
        </Field>
        <Field id="move-date" label="Date" error={err("occurredOn")}>
          <Input type="date" {...fieldAria("move-date", err("occurredOn"))} {...register("occurredOn")} />
        </Field>
      </div>
      <Field id="move-account" label={direction === "add" ? "From account" : "Into account"} error={err("accountId")}>
        <Select {...fieldAria("move-account", err("accountId"))} {...register("accountId")}>
          {everyday.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({ACCOUNT_TYPE_LABELS[a.type]}) · {formatMoney(a.balance_minor, currency)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {direction === "add" ? "Add money" : "Withdraw"}
        </Button>
      </div>
    </form>
  );
}

