"use client";

import { useId, useState } from "react";
import { CheckCircle2, CircleAlert, CircleX, TriangleAlert } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import type { PlannerSnapshot } from "@/lib/data/planner";
import { formatDay } from "@/lib/dates";
import { assessPurchase, type PurchaseVerdict } from "@/lib/finance/planner";
import { formatMoney, parseAmountToMinor } from "@/lib/money";
import { cn } from "@/lib/cn";

const VERDICTS: Record<PurchaseVerdict, { title: string; icon: typeof CheckCircle2; className: string }> = {
  comfortable: { title: "You can afford this", icon: CheckCircle2, className: "border-positive/30 bg-positive/10 text-positive" },
  tight: { title: "Affordable, but it will be tight", icon: TriangleAlert, className: "border-warning/30 bg-warning/10 text-warning" },
  "uses-commitments": {
    title: "Only by using money set aside for bills or savings",
    icon: CircleAlert,
    className: "border-negative/30 bg-negative/10 text-negative",
  },
  cannot: { title: "You don't have enough for this right now", icon: CircleX, className: "border-negative/30 bg-negative/10 text-negative" },
};

/** Works out, in the browser, how a purchase today changes the plan. Nothing is saved. */
export function AffordabilityCalculator({ snapshot, currency }: { snapshot: PlannerSnapshot; currency: string }) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const amountId = useId();
  const money = (minor: number) => formatMoney(minor, currency);
  const amountMinor = amount.trim() ? parseAmountToMinor(amount) : null;
  const invalid = amount.trim() !== "" && amountMinor === null;
  const budgetLine = snapshot.budgets.find((b) => b.id === categoryId);
  const { plan } = snapshot;

  const result =
    amountMinor !== null
      ? assessPurchase(plan, {
          amountMinor,
          budget: budgetLine?.limitMinor ? { limitMinor: budgetLine.limitMinor, spentMinor: budgetLine.spentMinor } : null,
          monthlySavingsMinor: snapshot.monthlySavingsMinor,
        })
      : null;
  const verdict = result ? VERDICTS[result.verdict] : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={amountId} label="Price" error={invalid ? "Enter a positive amount with at most 2 decimals" : undefined}>
          <Input
            id={amountId}
            inputMode="decimal"
            placeholder="e.g. 15000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${amountId}-error` : undefined}
          />
        </Field>
        <Field id="afford-category" label="Category (optional)">
          <Select id="afford-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {snapshot.budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.limitMinor ? ` (${money(Math.max(0, b.limitMinor - b.spentMinor))} left)` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {result && verdict ? (
        <div aria-live="polite" className="space-y-3">
          <div className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm font-medium", verdict.className)}>
            <verdict.icon aria-hidden className="size-4 shrink-0" />
            {verdict.title}
          </div>
          <dl className="divide-y divide-line rounded-lg border border-line text-sm">
            <Row label="Daily limit until payday">
              {money(plan.dailyLimitMinor)} → <strong className="text-fg">{money(result.newDailyLimitMinor)}</strong>
            </Row>
            <Row label="Money in everyday accounts after">{money(result.balanceAfterMinor)}</Row>
            <Row label={`Free to spend until ${formatDay(plan.payday)} after`}>
              <span className={result.freeAfterMinor < 0 ? "text-negative" : undefined}>{money(result.freeAfterMinor)}</span>
            </Row>
            {result.verdict === "cannot" ? (
              <Row label="Short by">
                <span className="text-negative">{money(-result.balanceAfterMinor)}</span>
              </Row>
            ) : null}
            {result.fromCommitmentsMinor > 0 && result.verdict !== "cannot" ? (
              <Row label="Taken from bill or savings money">
                <span className="text-negative">{money(result.fromCommitmentsMinor)}</span>
              </Row>
            ) : null}
            {result.savingsDelayMonths && result.verdict !== "cannot" ? (
              <Row label="Savings goals pushed back by">
                about {result.savingsDelayMonths} month{result.savingsDelayMonths === 1 ? "" : "s"}
              </Row>
            ) : null}
            {result.budget ? (
              <Row label={`${budgetLine?.name} budget after`}>
                <span className={result.budget.over ? "text-negative" : undefined}>
                  {result.budget.over
                    ? `${money(-result.budget.remainingAfterMinor)} over`
                    : `${money(result.budget.remainingAfterMinor)} left`}
                </span>
              </Row>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-subtle">Enter a price to see how it affects your daily limit, bills, budget and savings.</p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-right">{children}</dd>
    </div>
  );
}
