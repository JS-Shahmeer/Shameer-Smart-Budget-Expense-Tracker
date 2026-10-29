import { describe, expect, it } from "vitest";
import { budgetStatus, summarizeMonth, type SummaryTransaction } from "./summary";

const balances = [
  { account_id: "cash", type: "cash" as const, is_archived: false, balance_minor: 500000 },
  { account_id: "bank", type: "bank" as const, is_archived: false, balance_minor: 8000000 },
  { account_id: "card", type: "credit_card" as const, is_archived: false, balance_minor: -1200000 },
  { account_id: "save", type: "savings" as const, is_archived: false, balance_minor: 3000000 },
];
const categories = [
  { id: "food", name: "Food", color: "#f97316" },
  { id: "rent", name: "Rent", color: "#a855f7" },
];

function tx(partial: Partial<SummaryTransaction> & Pick<SummaryTransaction, "kind" | "amount_minor">): SummaryTransaction {
  return { account_id: "bank", to_account_id: null, category_id: null, savings_goal_id: null, ...partial };
}

describe("summarizeMonth", () => {
  const summary = summarizeMonth({
    transactions: [
      tx({ kind: "income", amount_minor: 15000000, category_id: "salary" }),
      tx({ kind: "expense", amount_minor: 4500000, category_id: "rent" }),
      tx({ kind: "expense", amount_minor: 2700000, category_id: "food", account_id: "cash" }),
      // Moving money between everyday accounts: not income, not spending, not saving.
      tx({ kind: "transfer", amount_minor: 1000000, to_account_id: "cash" }),
      // Saving: everyday account to savings account.
      tx({ kind: "transfer", amount_minor: 2000000, to_account_id: "save" }),
      // Withdrawing from savings reduces what was saved.
      tx({ kind: "transfer", amount_minor: 500000, account_id: "save", to_account_id: "bank" }),
    ],
    balances,
    budgets: [
      { category_id: "food", amount_minor: 3000000 },
      { category_id: "rent", amount_minor: 4000000 },
    ],
    categories,
    warningPercent: 80,
  });

  it("excludes transfers from income and expenses", () => {
    expect(summary.incomeMinor).toBe(15000000);
    expect(summary.expensesMinor).toBe(7200000);
    expect(summary.netCashFlowMinor).toBe(7800000);
  });

  it("counts savings transfers as saving, not spending", () => {
    expect(summary.savedMinor).toBe(1500000);
  });

  it("separates spendable money from savings", () => {
    expect(summary.availableBalanceMinor).toBe(7300000);
    expect(summary.savingsBalanceMinor).toBe(3000000);
  });

  it("flags budgets near and over their limit", () => {
    const byName = Object.fromEntries(summary.budgets.map((b) => [b.name, b]));
    expect(byName.Rent.status).toBe("over");
    expect(byName.Food.status).toBe("warning");
    expect(summary.budgets[0].name).toBe("Rent");
    expect(summary.budgetedMinor).toBe(7000000);
    expect(summary.budgetSpentMinor).toBe(7200000);
  });

  it("returns zeros for an empty month", () => {
    const empty = summarizeMonth({ transactions: [], balances: [], budgets: [], categories: [], warningPercent: 80 });
    expect(empty).toMatchObject({ incomeMinor: 0, expensesMinor: 0, savedMinor: 0, budgetPercent: 0, budgets: [] });
  });
});

describe("budgetStatus", () => {
  it("treats exactly the limit as a warning, not over", () => {
    expect(budgetStatus(100, 100, 80)).toBe("warning");
    expect(budgetStatus(101, 100, 80)).toBe("over");
    expect(budgetStatus(79, 100, 80)).toBe("ok");
  });
});
