"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTransaction, updateTransaction } from "@/app/(app)/transactions/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, fieldAria } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { AccountOption, CategoryOption, GoalOption } from "@/lib/data/reference";
import { ACCOUNT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { PAYMENT_METHODS, transactionSchema, type TransactionInput } from "@/lib/validation/finance";

export type TransactionFormProps = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  goals?: GoalOption[];
  /** Present when editing. */
  transactionId?: string;
  defaults: TransactionInput;
  onDone: () => void;
};

export function TransactionForm({ accounts, categories, goals = [], transactionId, defaults, onDone }: TransactionFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<TransactionInput>({ resolver: zodResolver(transactionSchema), defaultValues: defaults });

  const kind = useWatch({ control, name: "kind" });
  const accountId = useWatch({ control, name: "accountId" });
  const categoryId = useWatch({ control, name: "categoryId" });

  // Archived options stay visible only when the transaction already uses them.
  const usableAccounts = accounts.filter((a) => !a.is_archived || a.id === defaults.accountId || a.id === defaults.toAccountId);
  const usableCategories = categories.filter(
    (c) => (kind === "transfer" ? false : c.kind === kind) && (!c.is_archived || c.id === defaults.categoryId),
  );

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = transactionId ? await updateTransaction(transactionId, values) : await createTransaction(values);
      if (result.ok) {
        onDone();
        return;
      }
      setFormError(result.error);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof TransactionInput, { message });
      }
    });
  });

  const err = (field: keyof TransactionInput) => errors[field]?.message;

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <Segmented
        name="kind"
        label="Type"
        value={kind}
        onChange={(value) => {
          setValue("kind", value);
          // A category from the other kind would fail validation, so clear it.
          if (categories.find((c) => c.id === categoryId)?.kind !== value) setValue("categoryId", "");
        }}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
          { value: "transfer", label: "Transfer" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field id="tx-amount" label="Amount" error={err("amount")}>
          <Input inputMode="decimal" autoComplete="off" placeholder="0" {...fieldAria("tx-amount", err("amount"))} {...register("amount")} />
        </Field>
        <Field id="tx-date" label="Date" error={err("occurredOn")}>
          <Input type="date" {...fieldAria("tx-date", err("occurredOn"))} {...register("occurredOn")} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="tx-account" label={kind === "income" ? "Into account" : "From account"} error={err("accountId")}>
          <Select {...fieldAria("tx-account", err("accountId"))} {...register("accountId")}>
            {usableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
              </option>
            ))}
          </Select>
        </Field>

        {kind === "transfer" ? (
          <Field id="tx-to" label="To account" error={err("toAccountId")}>
            <Select {...fieldAria("tx-to", err("toAccountId"))} {...register("toAccountId")}>
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
          <Field id="tx-category" label="Category" error={err("categoryId")}>
            <Select {...fieldAria("tx-category", err("categoryId"))} {...register("categoryId")}>
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

      {kind === "transfer" && goals.some((g) => g.status === "active" || g.id === defaults.savingsGoalId) ? (
        <Field id="tx-goal" label="Savings goal (optional)" error={err("savingsGoalId")}>
          <Select {...fieldAria("tx-goal", err("savingsGoalId"))} {...register("savingsGoalId")}>
            <option value="">None</option>
            {goals
              .filter((g) => g.status === "active" || g.id === defaults.savingsGoalId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : null}

      {kind === "transfer" ? (
        <p className="text-xs text-subtle">
          Transfers move money between your own accounts. They are not counted as income or spending. Moving money into a
          savings account counts as saving.
        </p>
      ) : null}

      {kind === "expense" ? (
        <Field id="tx-method" label="Payment method" error={err("paymentMethod")}>
          <Select {...fieldAria("tx-method", err("paymentMethod"))} {...register("paymentMethod")}>
            <option value="">Not specified</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id="tx-description" label="Description (optional)" error={err("description")}>
        <Input
          autoComplete="off"
          placeholder={kind === "income" ? "e.g. October salary" : "e.g. Groceries at Imtiaz"}
          {...fieldAria("tx-description", err("description"))}
          {...register("description")}
        />
      </Field>

      <Field id="tx-note" label="Note (optional)" error={err("note")}>
        <Textarea rows={2} {...fieldAria("tx-note", err("note"))} {...register("note")} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {transactionId ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}
