// Types for the schema in supabase/migrations. Written by hand in the shape
// `supabase gen types typescript` produces; regenerate with that command once a
// Supabase project is linked, and keep this file in sync with every migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type AccountType = "cash" | "bank" | "mobile_wallet" | "credit_card" | "savings";
export type CategoryKind = "income" | "expense";
export type TransactionKind = "income" | "expense" | "transfer";
export type PaymentMethod = "cash" | "debit_card" | "credit_card" | "bank_transfer" | "mobile_wallet" | "other";
export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "archived";

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string | null;
  currency: string;
  timezone: string;
  month_start_day: number;
  payday_day: number;
  budget_warning_percent: number;
};

export type AccountRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  opening_balance_minor: number;
  is_archived: boolean;
};

export type CategoryRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  is_archived: boolean;
};

export type SavingsGoalRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  target_minor: number;
  starting_minor: number;
  target_date: string | null;
  monthly_contribution_minor: number | null;
  account_id: string | null;
  status: GoalStatus;
};

export type RecurringRuleRow = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  kind: TransactionKind;
  amount_minor: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  savings_goal_id: string | null;
  payment_method: PaymentMethod | null;
  frequency: RecurrenceFrequency;
  interval_count: number;
  start_on: string;
  end_on: string | null;
  next_due_on: string;
  is_bill: boolean;
  remind_days_before: number;
  is_active: boolean;
};

export type TransactionRow = Timestamps & {
  id: string;
  user_id: string;
  kind: TransactionKind;
  amount_minor: number;
  occurred_on: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  savings_goal_id: string | null;
  payment_method: PaymentMethod | null;
  description: string | null;
  note: string | null;
  recurring_rule_id: string | null;
  recurrence_date: string | null;
};

export type BudgetRow = Timestamps & {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  amount_minor: number;
};

export type AccountBalanceRow = {
  account_id: string;
  user_id: string;
  name: string;
  type: AccountType;
  is_archived: boolean;
  balance_minor: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      accounts: Table<AccountRow, "name" | "type">;
      categories: Table<CategoryRow, "name" | "kind">;
      savings_goals: Table<SavingsGoalRow, "name" | "target_minor">;
      recurring_rules: Table<RecurringRuleRow, "name" | "kind" | "amount_minor" | "account_id" | "start_on" | "next_due_on">;
      transactions: Table<TransactionRow, "kind" | "amount_minor" | "occurred_on" | "account_id">;
      budgets: Table<BudgetRow, "category_id" | "month" | "amount_minor">;
    };
    Views: {
      account_balances: { Row: AccountBalanceRow; Relationships: [] };
    };
    Functions: Record<never, never>;
    Enums: {
      account_type: AccountType;
      category_kind: CategoryKind;
      transaction_kind: TransactionKind;
      payment_method: PaymentMethod;
      recurrence_frequency: RecurrenceFrequency;
      goal_status: GoalStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
