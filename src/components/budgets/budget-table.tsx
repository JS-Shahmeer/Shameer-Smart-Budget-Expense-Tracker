"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { copyBudgets, setBudget } from "@/app/(app)/budgets/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { BudgetLine } from "@/lib/data/budgets";
import { formatMoney, minorToInputValue, parseAmountToMinor } from "@/lib/money";
import { cn } from "@/lib/cn";

export function CopyBudgetsButton({ fromMonth, toMonth }: { fromMonth: string; toMonth: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await copyBudgets(fromMonth, toMonth);
            setError(result.ok ? null : result.error);
          })
        }
      >
        <Copy aria-hidden className="size-4" />
        Copy last month&apos;s budgets
      </Button>
      {error ? <p role="alert" className="text-xs text-negative">{error}</p> : null}
    </div>
  );
}

export function BudgetRow({ line, month, currency }: { line: BudgetLine; month: string; currency: string }) {
  const initial = line.limitMinor ? minorToInputValue(line.limitMinor) : "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputId = `budget-${line.id}`;
  const changed = value.trim() !== initial;

  function save() {
    const amount = value.trim();
    if (!changed) return;
    if (amount !== "" && parseAmountToMinor(amount) === null) {
      setError("Enter a positive amount, or leave empty for no budget");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setBudget({ categoryId: line.id, month, amount });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        setError(result.fieldErrors?.amount ?? result.error);
      }
    });
  }

  const remaining = line.limitMinor !== null ? line.limitMinor - line.spentMinor : null;

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
      <div className="min-w-0">
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
          <span className="truncate">{line.name}</span>
          {line.is_archived ? <span className="text-xs text-subtle">Archived</span> : null}
        </label>
        <p className="mt-0.5 text-xs text-subtle">
          Spent <span className="tabular">{formatMoney(line.spentMinor, currency)}</span>
          {remaining !== null ? (
            <>
              {" · "}
              <span className={cn("tabular", remaining < 0 && "text-negative")}>
                {remaining < 0 ? `${formatMoney(-remaining, currency)} over` : `${formatMoney(remaining, currency)} left`}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <form
        className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input
          id={inputId}
          inputMode="decimal"
          placeholder="No budget"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-9 text-right"
        />
      </form>

      <div className="col-span-2 sm:col-span-1">
        {line.limitMinor !== null && line.status ? (
          <div className="flex items-center gap-2">
            <Progress value={line.percent} tone={line.status} label={`${line.name} budget used`} className="flex-1" />
            <span className={cn("tabular w-10 text-right text-xs", line.status === "over" ? "text-negative" : line.status === "warning" ? "text-warning" : "text-muted")}>
              {Math.round(line.percent)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-subtle">{pending ? "Saving…" : saved ? "Saved" : ""}</span>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="col-span-2 text-xs text-negative sm:col-span-3">
          {error}
        </p>
      ) : saved && line.limitMinor !== null ? (
        <p role="status" className="col-span-2 text-xs text-positive sm:col-span-3">Saved</p>
      ) : null}
    </li>
  );
}

export function BudgetHelp() {
  return (
    <Alert tone="info">
      Type a monthly limit and press Enter or leave the field to save. Clear a field to remove that budget. Transfers and
      savings never count as spending.
    </Alert>
  );
}
