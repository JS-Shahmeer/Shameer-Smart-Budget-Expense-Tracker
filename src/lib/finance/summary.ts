import type {
  AccountBalanceRow,
  AccountType,
  BudgetRow,
  CategoryRow,
  TransactionRow,
} from "@/lib/supabase/database.types";

export type SummaryTransaction = Pick<
  TransactionRow,
  "kind" | "amount_minor" | "account_id" | "to_account_id" | "category_id" | "savings_goal_id"
>;

export type BudgetStatus = "ok" | "warning" | "over";

export type BudgetUsage = {
  categoryId: string;
  name: string;
  color: string;
  limitMinor: number;
  spentMinor: number;
  percent: number;
  status: BudgetStatus;
};

export type MonthSummary = {
  incomeMinor: number;
  expensesMinor: number;
  /** Income minus expenses for the period. Transfers are excluded. */
  netCashFlowMinor: number;
  /** Net money moved into savings this period: contributions minus withdrawals. */
  savedMinor: number;
  /** Spendable money across everyday accounts (everything except savings). */
  availableBalanceMinor: number;
  /** Money held in savings accounts. */
  savingsBalanceMinor: number;
  budgets: BudgetUsage[];
  budgetedMinor: number;
  budgetSpentMinor: number;
  budgetPercent: number;
};

export function budgetStatus(spentMinor: number, limitMinor: number, warningPercent: number): BudgetStatus {
  if (spentMinor > limitMinor) return "over";
  if (limitMinor > 0 && (spentMinor / limitMinor) * 100 >= warningPercent) return "warning";
  return "ok";
}

/**
 * How a transfer changes money held as savings: +amount when it moves from an
 * everyday account into savings (or is tagged with a goal), -amount when it
 * moves out of savings, 0 for moves between two accounts of the same sort.
 */
export function savingsEffect(
  t: Pick<TransactionRow, "kind" | "amount_minor" | "account_id" | "to_account_id" | "savings_goal_id">,
  isSavings: (accountId: string | null) => boolean,
): number {
  if (t.kind !== "transfer") return 0;
  const fromSavings = isSavings(t.account_id);
  const toSavings = isSavings(t.to_account_id);
  if (!fromSavings && (toSavings || t.savings_goal_id)) return t.amount_minor;
  if (fromSavings && !toSavings) return -t.amount_minor;
  return 0;
}

/**
 * Summarises one budget period.
 *
 * Transfers between the user's own accounts never count as income or spending.
 * A transfer counts as saving when it moves money from an everyday account into
 * a savings account, or is tagged with a savings goal.
 */
export function summarizeMonth(input: {
  transactions: SummaryTransaction[];
  balances: Pick<AccountBalanceRow, "account_id" | "type" | "is_archived" | "balance_minor">[];
  budgets: Pick<BudgetRow, "category_id" | "amount_minor">[];
  categories: Pick<CategoryRow, "id" | "name" | "color">[];
  warningPercent: number;
}): MonthSummary {
  const accountType = new Map<string, AccountType>(input.balances.map((b) => [b.account_id, b.type]));
  const isSavings = (id: string | null) => id !== null && accountType.get(id) === "savings";

  let incomeMinor = 0;
  let expensesMinor = 0;
  let savedMinor = 0;
  const spentByCategory = new Map<string, number>();

  for (const t of input.transactions) {
    if (t.kind === "income") {
      incomeMinor += t.amount_minor;
    } else if (t.kind === "expense") {
      expensesMinor += t.amount_minor;
      if (t.category_id) {
        spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + t.amount_minor);
      }
    } else {
      savedMinor += savingsEffect(t, isSavings);
    }
  }

  let availableBalanceMinor = 0;
  let savingsBalanceMinor = 0;
  for (const b of input.balances) {
    if (b.type === "savings") savingsBalanceMinor += b.balance_minor;
    else if (!b.is_archived) availableBalanceMinor += b.balance_minor;
  }

  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const budgets: BudgetUsage[] = input.budgets
    .map((b) => {
      const category = categoryById.get(b.category_id);
      const spentMinor = spentByCategory.get(b.category_id) ?? 0;
      return {
        categoryId: b.category_id,
        name: category?.name ?? "Unknown category",
        color: category?.color ?? "#64748b",
        limitMinor: b.amount_minor,
        spentMinor,
        percent: b.amount_minor > 0 ? (spentMinor / b.amount_minor) * 100 : 0,
        status: budgetStatus(spentMinor, b.amount_minor, input.warningPercent),
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const budgetedMinor = budgets.reduce((sum, b) => sum + b.limitMinor, 0);
  const budgetSpentMinor = budgets.reduce((sum, b) => sum + b.spentMinor, 0);

  return {
    incomeMinor,
    expensesMinor,
    netCashFlowMinor: incomeMinor - expensesMinor,
    savedMinor,
    availableBalanceMinor,
    savingsBalanceMinor,
    budgets,
    budgetedMinor,
    budgetSpentMinor,
    budgetPercent: budgetedMinor > 0 ? (budgetSpentMinor / budgetedMinor) * 100 : 0,
  };
}
