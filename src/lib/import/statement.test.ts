import { describe, expect, it } from "vitest";
import {
  detectDateOrder,
  extractRows,
  findHeaderRow,
  guessMapping,
  normalizeDescription,
  parseCsv,
  parseStatementAmount,
  parseStatementDate,
  sheetFromCells,
  statementKeys,
} from "./statement";

// Shaped like a typical Pakistani bank export: account details first, then the table.
const STATEMENT = [
  "Account Statement",
  "Account Title:,MUHAMMAD SHAMEER",
  "Period:,01/10/2026 to 31/10/2026",
  "",
  "Transaction Date,Value Date,Description,Cheque No,Debit,Credit,Balance",
  "01/10/2026,01/10/2026,Opening Balance,,,,\"50,000.00\"",
  "01/10/2026,01/10/2026,SALARY OCT ACME PVT LTD,,,\"150,000.00\",\"200,000.00\"",
  "05/10/2026,05/10/2026,\"POS 123456 FOODPANDA, KARACHI\",,\"2,350.50\",,\"197,649.50\"",
  "13/10/2026,13/10/2026,IBFT TO JAZZCASH 0300xxxx,,\"5,000.00\",,\"192,649.50\"",
  ",,Total,,\"7,350.50\",\"150,000.00\",",
].join("\r\n");

describe("parseCsv", () => {
  it("handles quotes, embedded commas and a byte order mark", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("detects semicolons and tabs", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n,\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("reading a statement", () => {
  const sheet = parseCsv(STATEMENT);
  const header = findHeaderRow(sheet);
  const mapping = guessMapping(sheet[header]);

  it("finds the header under the account details", () => {
    expect(sheet[header][0]).toBe("Transaction Date");
  });

  it("guesses date, description and debit/credit columns", () => {
    expect(mapping).toEqual({ date: 0, description: 2, amount: -1, debit: 4, credit: 5 });
  });

  it("reads transactions and skips the opening balance and the total", () => {
    const { rows, skipped } = extractRows(sheet, header, mapping, "dmy");
    expect(rows.map((r) => [r.date, r.kind, r.amountMinor, r.description])).toEqual([
      ["2026-10-01", "income", 15000000, "SALARY OCT ACME PVT LTD"],
      ["2026-10-05", "expense", 235050, "POS 123456 FOODPANDA, KARACHI"],
      ["2026-10-13", "expense", 500000, "IBFT TO JAZZCASH 0300xxxx"],
    ]);
    expect(skipped).toHaveLength(2);
  });

  it("reads a single signed amount column", () => {
    const signed = parseCsv("Date,Narration,Amount\n2026-10-02,Coffee,-450\n2026-10-03,Refund,450");
    const m = guessMapping(signed[0]);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2, debit: -1, credit: -1 });
    expect(extractRows(signed, 0, m, "dmy").rows.map((r) => [r.kind, r.amountMinor])).toEqual([
      ["expense", 45000],
      ["income", 45000],
    ]);
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["31/10/2026", "dmy", "2026-10-31"],
    ["10/31/2026", "mdy", "2026-10-31"],
    ["2026/10/31", "ymd", "2026-10-31"],
    ["2026-10-31", "dmy", "2026-10-31"],
    ["05-Oct-2026", "mdy", "2026-10-05"],
    ["5 October 2026", "dmy", "2026-10-05"],
    ["Oct 5, 2026", "dmy", "2026-10-05"],
    ["05/10/26", "dmy", "2026-10-05"],
    ["05/10/2026 14:32", "dmy", "2026-10-05"],
  ] as const)("%s (%s) → %s", (text, order, expected) => {
    expect(parseStatementDate(text, order)).toBe(expected);
  });

  it("rejects impossible dates and text", () => {
    expect(parseStatementDate("31/02/2026", "dmy")).toBeNull();
    expect(parseStatementDate("Opening Balance", "dmy")).toBeNull();
    expect(parseStatementDate("", "dmy")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("prefers day first, switching only when the dates require it", () => {
    expect(detectDateOrder(["01/02/2026", "03/04/2026"])).toBe("dmy");
    expect(detectDateOrder(["10/31/2026", "11/01/2026"])).toBe("mdy");
    expect(detectDateOrder(["31/10/2026"])).toBe("dmy");
  });
});

describe("parseStatementAmount", () => {
  it.each([
    ["1,234.50", 123450],
    ["-1,234.50", -123450],
    ["(1,234.50)", -123450],
    ["1,234.50 DR", -123450],
    ["1,234.50CR", 123450],
    ["Rs. 500", 50000],
    ["PKR 1,000", 100000],
    ["", 0],
    ["-", 0],
    ["0.00", 0],
  ])("%s → %d", (text, minor) => {
    expect(parseStatementAmount(text)).toBe(minor);
  });

  it("rejects text and more than two decimals", () => {
    expect(parseStatementAmount("abc")).toBeNull();
    expect(parseStatementAmount("1.234")).toBeNull();
  });
});

describe("sheetFromCells", () => {
  it("turns Excel values into text, dates as ISO", () => {
    expect(sheetFromCells([["Date", "Amount"], [new Date(Date.UTC(2026, 9, 5)), -450.5], [null, undefined]])).toEqual([
      ["Date", "Amount"],
      ["2026-10-05", "-450.5"],
    ]);
  });
});

describe("statement keys", () => {
  const row = { date: "2026-10-05", kind: "expense" as const, amountMinor: 50000, description: "POS 111111 KFC" };

  it("ignores reference numbers in descriptions", () => {
    expect(normalizeDescription("POS 111111 KFC, DHA")).toBe(normalizeDescription("POS 999999 KFC DHA"));
  });

  it("numbers identical rows so both are kept, and repeats the same keys for the same file", () => {
    const keys = statementKeys("acc", [row, { ...row, description: "POS 222222 KFC" }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(statementKeys("acc", [row, row])).toEqual(keys);
  });

  it("differ by account", () => {
    expect(statementKeys("a", [row])).not.toEqual(statementKeys("b", [row]));
  });
});
