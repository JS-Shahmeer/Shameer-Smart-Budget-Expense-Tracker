import { describe, expect, it } from "vitest";
import { learnFromHistory, suggestCategory, suggestTransferAccount } from "./categorize";

const categories = [
  { id: "salary", name: "Salary", kind: "income" as const, is_archived: false },
  { id: "other-income", name: "Other income", kind: "income" as const, is_archived: false },
  { id: "food", name: "Food", kind: "expense" as const, is_archived: false },
  { id: "transport", name: "Transport", kind: "expense" as const, is_archived: false },
  { id: "utilities", name: "Utilities", kind: "expense" as const, is_archived: false },
  { id: "groceries", name: "Groceries", kind: "expense" as const, is_archived: false },
  { id: "misc", name: "Miscellaneous", kind: "expense" as const, is_archived: false },
];

describe("suggestCategory", () => {
  const none = new Map<string, string>();

  it("matches common merchants and billers", () => {
    expect(suggestCategory("POS 123456 FOODPANDA KARACHI", "expense", categories, none)).toBe("food");
    expect(suggestCategory("CAREEM RIDE 8899", "expense", categories, none)).toBe("transport");
    expect(suggestCategory("K-ELECTRIC BILL PAYMENT", "expense", categories, none)).toBe("utilities");
    expect(suggestCategory("SALARY OCT ACME", "income", categories, none)).toBe("salary");
  });

  it("only suggests categories of the row's kind", () => {
    expect(suggestCategory("SALARY REVERSAL", "expense", categories, none)).toBe("misc");
  });

  it("falls back to the catch-all category", () => {
    expect(suggestCategory("IBFT 0300XXXX", "expense", categories, none)).toBe("misc");
    expect(suggestCategory("RAAST P2P IN", "income", categories, none)).toBe("other-income");
  });

  it("repeats what you chose before, newest choice first", () => {
    const learned = learnFromHistory([
      { description: "POS 777777 IMTIAZ SUPER MARKET", category_id: "groceries" },
      { description: "POS 111111 IMTIAZ SUPER MARKET", category_id: "food" },
    ]);
    expect(suggestCategory("POS 999999 IMTIAZ SUPER MARKET", "expense", categories, learned)).toBe("groceries");
  });

  it("ignores a learned category that is archived", () => {
    const learned = learnFromHistory([{ description: "Shop", category_id: "food" }]);
    const archived = categories.map((c) => (c.id === "food" ? { ...c, is_archived: true } : c));
    expect(suggestCategory("Shop", "expense", archived, learned)).toBe("misc");
  });
});

describe("suggestTransferAccount", () => {
  const accounts = [
    { id: "bank", type: "bank", is_archived: false },
    { id: "cash", type: "cash", is_archived: false },
  ];

  it("treats ATM withdrawals as moving money to cash", () => {
    expect(suggestTransferAccount("ATM CASH WITHDRAWAL 7788", "expense", accounts, "bank")).toBe("cash");
    expect(suggestTransferAccount("Cash withdrawal branch", "expense", accounts, "bank")).toBe("cash");
  });

  it("leaves other rows, deposits and statements of the cash account alone", () => {
    expect(suggestTransferAccount("FOODPANDA", "expense", accounts, "bank")).toBeNull();
    expect(suggestTransferAccount("ATM DEPOSIT", "income", accounts, "bank")).toBeNull();
    expect(suggestTransferAccount("ATM CASH WITHDRAWAL", "expense", [accounts[1]], "cash")).toBeNull();
  });
});
