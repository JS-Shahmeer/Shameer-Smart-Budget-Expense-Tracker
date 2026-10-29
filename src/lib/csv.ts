// CSV for spreadsheet apps (RFC 4180 quoting, CRLF line endings).

export type CsvCell = string | number | null | undefined;

// Spreadsheets run a cell starting with one of these as a formula, so a
// description like "=HYPERLINK(...)" could do something when the file is opened.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows to CSV text. Pass amounts as numbers (minor / 100): numbers are written
 * as they are, while text that a spreadsheet would treat as a formula is
 * prefixed with an apostrophe.
 */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

