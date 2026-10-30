import { isValidIsoDate, toIsoDate, type IsoDate } from "@/lib/dates";
import { MAX_AMOUNT_MINOR } from "@/lib/money";

// Turns a bank statement exported as CSV or Excel into transactions. Banks lay
// statements out differently, so the columns are guessed from the header and
// the user can correct the guess before anything is saved.

export type Cell = string;
export type Sheet = Cell[][];

/** Parses CSV text (RFC 4180 quoting). The delimiter is detected from the first lines: comma, semicolon or tab. */
export function parseCsv(text: string): Sheet {
  const body = text.replace(/^﻿/, "");
  const sample = body.split(/\r?\n/, 5).join("\n");
  const delimiter = [",", ";", "\t"].reduce((best, d) => (count(sample, d) > count(sample, best) ? d : best), ",");

  const rows: Sheet = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

function count(text: string, ch: string) {
  return text.split(ch).length - 1;
}

/** Excel cells arrive as strings, numbers, booleans or Dates; the rest of the import works on text. */
export function sheetFromCells(rows: unknown[][]): Sheet {
  return rows
    .map((r) =>
      r.map((value) => {
        if (value === null || value === undefined) return "";
        if (value instanceof Date) {
          return Number.isNaN(value.getTime())
            ? ""
            : toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
        }
        return String(value).trim();
      }),
    )
    .filter((r) => r.some((c) => c !== ""));
}

export type Mapping = {
  date: number;
  description: number;
  /** One column of signed amounts (negative = money out). */
  amount: number;
  /** Separate columns for money out and money in. Used when `amount` is -1. */
  debit: number;
  credit: number;
};

const HEADERS = {
  date: ["transaction date", "txn date", "trans date", "posting date", "booking date", "value date", "date"],
  description: ["description", "narration", "particulars", "details", "transaction details", "remarks", "narrative", "memo"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "paid out", "dr"],
  credit: ["credit", "deposit", "deposits", "money in", "paid in", "cr"],
  amount: ["amount", "transaction amount", "amount (pkr)"],
};

const clean = (text: string) => text.toLowerCase().replace(/[^a-z ()]/g, " ").replace(/\s+/g, " ").trim();

function findColumn(header: Cell[], names: string[], taken: Set<number>): number {
  // Exact names first, in order of preference, then a header that contains one.
  for (const name of names) {
    const index = header.findIndex((h, i) => !taken.has(i) && clean(h) === name);
    if (index >= 0) return index;
  }
  for (const name of names) {
    if (name.length <= 2) continue;
    const index = header.findIndex((h, i) => !taken.has(i) && clean(h).includes(name));
    if (index >= 0) return index;
  }
  return -1;
}

/** Statements often start with a few lines about the account; the header is the first row that names a date column. */
export function findHeaderRow(sheet: Sheet): number {
  const limit = Math.min(sheet.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = sheet[i];
    if (row.filter((c) => c !== "").length < 3) continue;
    const taken = new Set<number>();
    if (findColumn(row, HEADERS.date, taken) >= 0 && findColumn(row, [...HEADERS.debit, ...HEADERS.credit, ...HEADERS.amount], taken) >= 0) {
      return i;
    }
  }
  return 0;
}

export function guessMapping(header: Cell[]): Mapping {
  const taken = new Set<number>();
  const take = (names: string[]) => {
    const index = findColumn(header, names, taken);
    if (index >= 0) taken.add(index);
    return index;
  };
  const date = take(HEADERS.date);
  const debit = take(HEADERS.debit);
  const credit = take(HEADERS.credit);
  const amount = debit >= 0 && credit >= 0 ? -1 : take(HEADERS.amount);
  const description = take(HEADERS.description);
  return { date, description, amount, debit: amount >= 0 ? -1 : debit, credit: amount >= 0 ? -1 : credit };
}

export type DateOrder = "dmy" | "mdy" | "ymd";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Reads a statement date. Numeric dates follow `order`; dates with a month
 * name ("05-Oct-2026", "Oct 5, 2026") or in ISO form are read whatever the order.
 */
export function parseStatementDate(text: string, order: DateOrder): IsoDate | null {
  const value = text.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i, "");
  let year: number, month: number, day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const named = /^(\d{1,2})[\s\-/.]+([a-z]{3,9})[\s\-/.,]+(\d{2,4})$/i.exec(value);
  const namedFirst = /^([a-z]{3,9})[\s\-/.]+(\d{1,2}),?[\s\-/.]+(\d{2,4})$/i.exec(value);
  const numeric = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/.exec(value);

  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (named || namedFirst) {
    const [d, m, y] = named ? [named[1], named[2], named[3]] : [namedFirst![2], namedFirst![1], namedFirst![3]];
    month = MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1;
    if (month === 0) return null;
    day = Number(d);
    year = Number(y);
  } else if (numeric) {
    const [a, b, c] = [numeric[1], numeric[2], numeric[3]].map(Number);
    if (numeric[1].length === 4 || order === "ymd") [year, month, day] = [a, b, c];
    else if (order === "mdy") [month, day, year] = [a, b, c];
    else [day, month, year] = [a, b, c];
  } else {
    return null;
  }
  if (year < 100) year += 2000;
  const date = toIsoDate(year, month, day);
  return isValidIsoDate(date) ? date : null;
}

/** Picks the numeric date order that makes every sample valid, preferring day-first as Pakistani banks use. */
export function detectDateOrder(samples: string[]): DateOrder {
  const orders: DateOrder[] = ["dmy", "mdy", "ymd"];
  const values = samples.filter((s) => s.trim() !== "");
  return orders.find((o) => values.every((s) => parseStatementDate(s, o) !== null)) ?? "dmy";
}

/**
 * Reads an amount as signed minor units. Handles thousands separators,
 * currency labels, "(1,000)" and "-1,000" for money out, and "DR"/"CR"
 * suffixes. Returns null for anything that is not an amount, and 0 for an
 * empty or zero cell.
 */
export function parseStatementAmount(text: string): number | null {
  let value = text.trim().toUpperCase().replace(/PKR|RS\.?|\$|,|\s/g, "");
  if (value === "" || value === "-") return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(value)) {
    sign = -1;
    value = value.slice(1, -1);
  }
  if (value.endsWith("DR")) {
    sign = -1;
    value = value.slice(0, -2);
  } else if (value.endsWith("CR")) {
    value = value.slice(0, -2);
  }
  if (value.startsWith("-")) {
    sign = -sign;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor >= MAX_AMOUNT_MINOR) return null;
  return sign * minor;
}

export type StatementRow = {
  /** Row number in the file, counted from 1, for messages. */
  line: number;
  date: IsoDate;
  description: string;
  /** Always positive; `kind` gives the direction. */
  amountMinor: number;
  kind: "income" | "expense";
};

export type Extracted = { rows: StatementRow[]; skipped: number[] };

/**
 * Reads the transactions under the header row. Rows without a valid date or a
 * non-zero amount (opening balances, totals, blank lines) are skipped and
 * their line numbers returned.
 */
export function extractRows(sheet: Sheet, headerRow: number, mapping: Mapping, order: DateOrder): Extracted {
  const rows: StatementRow[] = [];
  const skipped: number[] = [];
  for (let i = headerRow + 1; i < sheet.length; i++) {
    const cells = sheet[i];
    const at = (index: number) => (index >= 0 ? (cells[index] ?? "") : "");
    const date = parseStatementDate(at(mapping.date), order);

    let signed: number | null;
    if (mapping.amount >= 0) {
      signed = parseStatementAmount(at(mapping.amount));
    } else {
      const debit = parseStatementAmount(at(mapping.debit));
      const credit = parseStatementAmount(at(mapping.credit));
      signed = debit === null || credit === null ? null : Math.abs(credit) - Math.abs(debit);
    }

    if (!date || signed === null || signed === 0) {
      skipped.push(i + 1);
      continue;
    }
    rows.push({
      line: i + 1,
      date,
      description: at(mapping.description).replace(/\s+/g, " ").slice(0, 120),
      amountMinor: Math.abs(signed),
      kind: signed > 0 ? "income" : "expense",
    });
  }
  return { rows, skipped };
}

/** Lower-case words without reference numbers, so "POS 123456 KFC DHA" and "POS 998877 KFC DHA" compare equal. */
export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stable key for a statement row, so importing the same or an overlapping
 * statement again skips rows already saved. Identical rows on the same day
 * are told apart by their position among themselves (`occurrence`).
 */
export function statementKey(accountId: string, row: Pick<StatementRow, "date" | "kind" | "amountMinor" | "description">, occurrence: number): string {
  return [accountId, row.date, row.kind, row.amountMinor, normalizeDescription(row.description), occurrence].join("|");
}

/** Keys for a batch in file order, numbering repeats of the same row. */
export function statementKeys(accountId: string, rows: Pick<StatementRow, "date" | "kind" | "amountMinor" | "description">[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = statementKey(accountId, row, 0);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return statementKey(accountId, row, occurrence);
  });
}
