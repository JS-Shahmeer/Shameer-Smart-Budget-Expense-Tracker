import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import { parseAmountToMinor } from "@/lib/money";

// Form schemas shared by the client forms and the server actions. Values stay
// strings, as the inputs produce them; server actions convert with the
// helpers at the bottom after the schema has passed.

const uuid = z.uuid("Choose an option");
const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();

export const amountField = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .refine((value) => parseAmountToMinor(value) !== null, "Enter a positive amount with at most 2 decimals");

const dateField = z
  .string()
  .refine(isValidIsoDate, "Enter a valid date")
  .refine((value) => value >= "2000-01-01" && value <= "2100-12-31", "Choose a date between 2000 and 2100");

const optionalText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`).optional();

export const PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "bank_transfer", "mobile_wallet", "other"] as const;
export const ACCOUNT_TYPES = ["cash", "bank", "mobile_wallet", "credit_card", "savings"] as const;
export const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

export const transactionSchema = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    amount: amountField,
    occurredOn: dateField,
    accountId: uuid,
    toAccountId: optionalUuid,
    categoryId: optionalUuid,
    savingsGoalId: optionalUuid,
    paymentMethod: z.union([z.enum(PAYMENT_METHODS), z.literal("")]).optional(),
    description: optionalText(120),
    note: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "transfer") {
      if (!value.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose where the money goes" });
      else if (value.toAccountId === value.accountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a different account" });
    } else if (!value.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }
  });

export type TransactionInput = z.infer<typeof transactionSchema>;

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  type: z.enum(ACCOUNT_TYPES),
  openingBalance: z
    .string()
    .trim()
    .refine((value) => value === "" || value === "0" || parseSignedAmountToMinor(value) !== null, "Enter a valid amount"),
});

const optionalAmount = z.union([amountField, z.literal("")]).optional();

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
  target: amountField,
  starting: optionalAmount,
  targetDate: z.union([dateField, z.literal("")]).optional(),
  monthlyContribution: optionalAmount,
  accountId: optionalUuid,
});

export type GoalFormInput = z.infer<typeof goalSchema>;

export const contributionSchema = z.object({
  direction: z.enum(["add", "withdraw"]),
  amount: amountField,
  accountId: uuid,
  occurredOn: dateField,
});

export type ContributionInput = z.infer<typeof contributionSchema>;

export type AccountInput = z.infer<typeof accountSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40, "Keep it under 40 characters"),
  kind: z.enum(["income", "expense"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour"),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const budgetSchema = z.object({
  categoryId: uuid,
  month: dateField.refine((value) => value.endsWith("-01"), "Budget month must start on the 1st"),
  // Empty removes the budget.
  amount: z.union([amountField, z.literal("")]),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

export const recurringSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters"),
    kind: z.enum(["income", "expense", "transfer"]),
    amount: amountField,
    accountId: uuid,
    toAccountId: optionalUuid,
    categoryId: optionalUuid,
    paymentMethod: z.union([z.enum(PAYMENT_METHODS), z.literal("")]).optional(),
    frequency: z.enum(FREQUENCIES),
    intervalCount: z.coerce.number<string>().int("Whole numbers only").min(1, "At least 1").max(12, "At most 12"),
    startOn: dateField,
    nextDueOn: dateField,
    endOn: z.union([dateField, z.literal("")]).optional(),
    isBill: z.boolean(),
    remindDaysBefore: z.coerce.number<string>().int().min(0, "0 or more").max(30, "At most 30"),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "transfer") {
      if (!value.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose where the money goes" });
      else if (value.toAccountId === value.accountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a different account" });
    } else if (!value.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }
    if (value.nextDueOn < value.startOn)
      ctx.addIssue({ code: "custom", path: ["nextDueOn"], message: "Can't be before the start date" });
    if (value.endOn && value.endOn < value.startOn)
      ctx.addIssue({ code: "custom", path: ["endOn"], message: "Can't be before the start date" });
  });

export type RecurringInput = z.input<typeof recurringSchema>;

/** Like parseAmountToMinor but allows a leading minus, for opening balances. */
export function parseSignedAmountToMinor(value: string): number | null {
  const text = value.trim();
  const negative = text.startsWith("-");
  const minor = parseAmountToMinor(negative ? text.slice(1) : text);
  if (minor === null) return null;
  return negative ? -minor : minor;
}

export const nullIfEmpty = (value: string | undefined) => (value ? value : null);
