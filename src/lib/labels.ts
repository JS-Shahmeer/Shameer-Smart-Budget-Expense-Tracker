import type { AccountType, PaymentMethod, TransactionKind } from "@/lib/supabase/database.types";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  debit_card: "Debit card",
  credit_card: "Credit card",
  bank_transfer: "Bank transfer",
  mobile_wallet: "Mobile wallet",
  other: "Other",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank account",
  mobile_wallet: "Mobile wallet",
  credit_card: "Credit card",
  savings: "Savings",
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};
