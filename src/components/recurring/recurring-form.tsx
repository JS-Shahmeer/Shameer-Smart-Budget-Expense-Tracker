"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveRecurringRule } from "@/app/(app)/recurring/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldAria } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { AccountOption, CategoryOption } from "@/lib/data/reference";
import type { RecurringRule } from "@/lib/data/recurring";
import { ACCOUNT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { minorToInputValue } from "@/lib/money";
import { PAYMENT_METHODS, recurringSchema, type RecurringInput } from "@/lib/validation/finance";
import type { z } from "zod";

type Output = z.output<typeof recurringSchema>;

export function RecurringForm({
  rule,
  accounts,
  categories,
  today,
  onDone,
}: {
  rule: RecurringRule | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const defaultAccount = accounts.find((a) => !a.is_archived && a.type === "bank") ?? accounts.find((a) => !a.is_archived);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RecurringInput, unknown, Output>({
    resolver: zodResolver(recurringSchema),
    defaultValues: rule
      ? {
          name: rule.name,
          kind: rule.kind,
          amount: minorToInputValue(rule.amount_minor),
          accountId: rule.account_id,
          toAccountId: rule.to_account_id ?? "",
          categoryId: rule.category_id ?? "",
          paymentMethod: rule.payment_method ?? "",
          frequency: rule.frequency,
          intervalCount: String(rule.interval_count),
          startOn: rule.start_on,
          nextDueOn: rule.next_due_on,
          endOn: rule.end_on ?? "",
          isBill: rule.is_bill,
          remindDaysBefore: String(rule.remind_days_before),
        }
      : {
          name: "",
          kind: "expense",
          amount: "",
          accountId: defaultAccount?.id ?? "",
          toAccountId: "",
          categoryId: "",
          paymentMethod: "",
          frequency: "monthly",
          intervalCount: "1",
          startOn: today,
          nextDueOn: today,
          endOn: "",
          isBill: true,
          remindDaysBefore: "3",
        },
  });

  const kind = useWatch({ control, name: "kind" });
  const accountId = useWatch({ control, name: "accountId" });
  const startOn = useWatch({ control, name: "startOn" });
  const usableAccounts = accounts.filter((a) => !a.is_archived || a.id === rule?.account_id || a.id === rule?.to_account_id);
  const usableCategories = categories.filter((c) => c.kind === kind && (!c.is_archived || c.id === rule?.category_id));
  const err = (field: keyof RecurringInput) => errors[field]?.message;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    // New rules start counting from the start date.
    const input = rule ? values : { ...values, nextDueOn: values.startOn };
    startTransition(async () => {
      const result = await saveRecurringRule(rule?.id ?? null, {
        ...input,
        intervalCount: String(input.intervalCount),
        remindDaysBefore: String(input.remindDaysBefore),
      });
      if (result.ok) return onDone();
      setFormError(result.error);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof RecurringInput, { message });
    });
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <Segmented
        name="kind"
        label="Type"
        value={kind}
        onChange={(value) => {
          setValue("kind", value);
          setValue("categoryId", "");
          setValue("isBill", value !== "income");
        }}
        options={[
          { value: "expense", label: "Bill / expense" },
          { value: "income", label: "Income" },
          { value: "transfer", label: "Transfer" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field id="rr-name" label="Name" error={err("name")}>
          <Input placeholder={kind === "income" ? "Salary" : "Rent, Netflix…"} {...fieldAria("rr-name", err("name"))} {...register("name")} />
        </Field>
        <Field id="rr-amount" label="Amount" error={err("amount")}>
          <Input inputMode="decimal" placeholder="0" {...fieldAria("rr-amount", err("amount"))} {...register("amount")} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="rr-account" label={kind === "income" ? "Into account" : "From account"} error={err("accountId")}>
          <Select {...fieldAria("rr-account", err("accountId"))} {...register("accountId")}>
            {usableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
              </option>
            ))}
          </Select>
        </Field>
        {kind === "transfer" ? (
          <Field id="rr-to" label="To account" error={err("toAccountId")}>
            <Select {...fieldAria("rr-to", err("toAccountId"))} {...register("toAccountId")}>
              <option value="">Choose…</option>
              {usableAccounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field id="rr-category" label="Category" error={err("categoryId")}>
            <Select {...fieldAria("rr-category", err("categoryId"))} {...register("categoryId")}>
              <option value="">Choose…</option>
              {usableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {kind === "expense" ? (
        <Field id="rr-method" label="Payment method" error={err("paymentMethod")}>
          <Select {...fieldAria("rr-method", err("paymentMethod"))} {...register("paymentMethod")}>
            <option value="">Not specified</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field id="rr-interval" label="Every" error={err("intervalCount")}>
          <Input type="number" min={1} max={12} inputMode="numeric" {...fieldAria("rr-interval", err("intervalCount"))} {...register("intervalCount")} />
        </Field>
        <Field id="rr-frequency" label="Period" error={err("frequency")}>
          <Select {...fieldAria("rr-frequency", err("frequency"))} {...register("frequency")}>
            <option value="weekly">Week(s)</option>
            <option value="monthly">Month(s)</option>
            <option value="yearly">Year(s)</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="rr-start"
          label={rule ? "Started on" : "First date"}
          hint="Monthly items repeat on this day, or the month's last day if shorter."
          error={err("startOn")}
        >
          <Input type="date" {...fieldAria("rr-start", err("startOn"), "hint")} {...register("startOn")} />
        </Field>
        <Field id="rr-end" label="Ends on (optional)" error={err("endOn")}>
          <Input type="date" min={startOn} {...fieldAria("rr-end", err("endOn"))} {...register("endOn")} />
        </Field>
      </div>

      {rule ? (
        <Field id="rr-next" label="Next due" hint="Change this to move or skip ahead." error={err("nextDueOn")}>
          <Input type="date" min={startOn} {...fieldAria("rr-next", err("nextDueOn"), "hint")} {...register("nextDueOn")} />
        </Field>
      ) : null}

      {kind !== "income" ? (
        <div className="grid grid-cols-2 items-end gap-3">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-accent)]" {...register("isBill")} />
            Remind me as a bill
          </label>
          <Field id="rr-remind" label="Days before" error={err("remindDaysBefore")}>
            <Input type="number" min={0} max={30} inputMode="numeric" {...fieldAria("rr-remind", err("remindDaysBefore"))} {...register("remindDaysBefore")} />
          </Field>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {rule ? "Save changes" : "Add recurring item"}
        </Button>
      </div>
    </form>
  );
}
