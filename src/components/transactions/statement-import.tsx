"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw } from "lucide-react";
import { checkImport, commitImport, removeImported, type CommitResult, type RowStatus } from "@/app/(app)/transactions/import/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { CategorizedDescription } from "@/lib/data/imports";
import type { AccountOption, CategoryOption } from "@/lib/data/reference";
import { formatDay } from "@/lib/dates";
import { learnFromHistory, suggestCategory, suggestTransferAccount } from "@/lib/import/categorize";
import {
  detectDateOrder,
  extractRows,
  findHeaderRow,
  guessMapping,
  parseCsv,
  sheetFromCells,
  statementBalances,
  type DateOrder,
  type Mapping,
  type Sheet,
  type StatementRow,
} from "@/lib/import/statement";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { MAX_IMPORT_ROWS } from "@/lib/validation/finance";

type Props = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  history: CategorizedDescription[];
  /** Imported transactions per account id. */
  importedCounts: Record<string, number>;
  currency: string;
};

type Parsed = { fileName: string; sheet: Sheet; headerRow: number; mapping: Mapping; order: DateOrder };
type ReviewRow = StatementRow & { status: RowStatus; include: boolean; target: string };

const DATE_ORDERS: { value: DateOrder; label: string }[] = [
  { value: "dmy", label: "Day first (31/10/2026)" },
  { value: "mdy", label: "Month first (10/31/2026)" },
  { value: "ymd", label: "Year first (2026/10/31)" },
];

const STATUS = {
  new: null,
  imported: { label: "Already imported", className: "bg-surface-3 text-muted" },
  "possible-duplicate": { label: "Maybe entered already", className: "bg-warning/15 text-warning" },
} as const;

async function readStatement(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return sheetFromCells(await readSheet(file));
  }
  if (name.endsWith(".pdf")) {
    throw new Error("PDF statements can't be read yet. Download the statement as Excel or CSV if UBL Digital offers it.");
  }
  if (name.endsWith(".xls")) throw new Error("Old .xls files can't be read. Open it in Excel or Google Sheets and save it as .xlsx or CSV.");
  throw new Error("Choose a CSV or Excel (.xlsx) file.");
}

export function StatementImport({ accounts, categories, history, importedCounts, currency }: Props) {
  const usable = accounts.filter((a) => !a.is_archived);
  const [accountId, setAccountId] = useState(() => (usable.find((a) => a.type === "bank") ?? usable[0])?.id ?? "");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [result, setResult] = useState<(Extract<CommitResult, { ok: true }> & { closingMinor: number | null; accountName: string }) | null>(null);
  const [tracksCash, setTracksCash] = useState(false);
  const [setOpening, setSetOpening] = useState(true);
  const [removing, setRemoving] = useState<AccountOption | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileId = useId();
  const learned = useMemo(() => learnFromHistory(history), [history]);
  const money = (minor: number) => formatMoney(minor, currency);

  const extracted = useMemo(
    () => (parsed ? extractRows(parsed.sheet, parsed.headerRow, parsed.mapping, parsed.order) : null),
    [parsed],
  );
  const balances = useMemo(() => (extracted ? statementBalances(extracted.rows) : null), [extracted]);

  async function onFile(file: File | undefined) {
    setError(null);
    setParsed(null);
    setReview(null);
    setResult(null);
    setRemoved(null);
    if (!file) return;
    try {
      const sheet = await readStatement(file);
      if (sheet.length < 2) throw new Error("That file has no rows to import.");
      const headerRow = findHeaderRow(sheet);
      const mapping = guessMapping(sheet[headerRow]);
      const samples = sheet.slice(headerRow + 1, headerRow + 40).map((r) => r[mapping.date] ?? "");
      setParsed({ fileName: file.name, sheet, headerRow, mapping, order: detectDateOrder(samples) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    }
  }

  function toReview() {
    if (!extracted || extracted.rows.length === 0) return;
    if (extracted.rows.length > MAX_IMPORT_ROWS) {
      setError(`This file has ${extracted.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);
      return;
    }
    setError(null);
    const rows = extracted.rows;
    startTransition(async () => {
      const check = await checkImport(
        accountId,
        rows.map(({ date, description, amountMinor, kind }) => ({ date, description, amountMinor, kind })),
      );
      if (!check.ok) return setError(check.error);
      setReview(
        rows.map((row, i) => {
          const transfer = tracksCash ? suggestTransferAccount(row.description, row.kind, usable, accountId) : null;
          const category = suggestCategory(row.description, row.kind, categories, learned);
          const target = transfer ? `acc:${transfer}` : category ? `cat:${category}` : "";
          return { ...row, status: check.statuses[i], include: check.statuses[i] === "new", target };
        }),
      );
    });
  }

  function save() {
    if (!review) return;
    const missing = review.findIndex((r) => r.include && !r.target);
    if (missing >= 0) return setError(`Choose a category for "${review[missing].description || formatDay(review[missing].date)}".`);
    setError(null);
    const from = review.reduce((min, r) => (r.date < min ? r.date : min), review[0].date);
    const opening = balances && setOpening ? { openingBalanceMinor: balances.openingMinor, from } : null;
    const accountName = usable.find((a) => a.id === accountId)?.name ?? "The account";
    startTransition(async () => {
      const outcome = await commitImport(
        accountId,
        review.map((r) => ({
          date: r.date,
          description: r.description,
          amountMinor: r.amountMinor,
          kind: r.kind,
          categoryId: r.target.startsWith("cat:") ? r.target.slice(4) : null,
          transferAccountId: r.target.startsWith("acc:") ? r.target.slice(4) : null,
        })),
        review.flatMap((r, i) => (r.include ? [i] : [])),
        opening,
      );
      if (!outcome.ok) return setError(outcome.error);
      setResult({ ...outcome, closingMinor: balances?.closingMinor ?? null, accountName });
      setReview(null);
      setParsed(null);
    });
  }

  const update = (index: number, patch: Partial<ReviewRow>) =>
    setReview((rows) => rows && rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  if (result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 aria-hidden className="size-8 text-positive" />
          <p className="text-sm font-medium text-fg">
            Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}
          </p>
          {result.alreadyThere > 0 ? <p className="text-sm text-muted">{result.alreadyThere} were already in the app and were skipped.</p> : null}
          {result.opening === "set" ? (
            <p className="text-sm text-muted">{result.accountName}&apos;s starting balance was set from the statement.</p>
          ) : null}
          {result.opening === "earlier-transactions" ? (
            <p className="max-w-md text-sm text-muted">
              {result.accountName} has transactions from before this statement, so its starting balance was left as it was.
            </p>
          ) : null}
          {result.balanceMinor !== null && result.closingMinor !== null ? (
            result.balanceMinor === result.closingMinor ? (
              <p className="text-sm text-positive">
                {result.accountName} now shows {money(result.balanceMinor)}, the same as the statement.
              </p>
            ) : (
              <p className="flex max-w-md items-start gap-2 text-left text-sm text-warning">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {result.accountName} shows {money(result.balanceMinor)} but the statement ends at {money(result.closingMinor)}. Check its
                  starting balance under Accounts &amp; categories, and any rows you left out.
                </span>
              </p>
            )
          ) : null}
          <div className="flex gap-2">
            <ButtonLink href="/transactions">See transactions</ButtonLink>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const header = parsed?.sheet[parsed.headerRow] ?? [];
  const columnOptions = header.map((name, i) => ({ value: String(i), label: name || `Column ${i + 1}` }));
  const setMapping = (patch: Partial<Mapping>) => setParsed((p) => p && { ...p, mapping: { ...p.mapping, ...patch } });

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Choose the statement</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="import-account" label="Account it belongs to" hint="Rows are added to this account.">
            <Select
              id="import-account"
              aria-describedby="import-account-hint"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setReview(null);
              }}
            >
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={fileId} label="Statement file" hint="CSV or Excel (.xlsx). The file is read in your browser and never uploaded.">
            <Input
              id={fileId}
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-describedby={`${fileId}-hint`}
              className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-sm file:text-fg"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </Field>
        </CardContent>
      </Card>

      {parsed && !review ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Check the columns</CardTitle>
            <span className="truncate text-xs text-subtle">{parsed.fileName}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="map-date" label="Date column">
                <ColumnSelect id="map-date" value={parsed.mapping.date} options={columnOptions} onChange={(date) => setMapping({ date })} />
              </Field>
              <Field id="map-order" label="Date format">
                <Select
                  id="map-order"
                  value={parsed.order}
                  onChange={(e) => setParsed({ ...parsed, order: e.target.value as DateOrder })}
                >
                  {DATE_ORDERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="map-description" label="Description column">
                <ColumnSelect
                  id="map-description"
                  value={parsed.mapping.description}
                  options={columnOptions}
                  optional
                  onChange={(description) => setMapping({ description })}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">Amounts are in</span>
                <Segmented
                  name="amount-mode"
                  label="Amounts are in"
                  value={parsed.mapping.amount >= 0 ? "one" : "two"}
                  options={[
                    { value: "two", label: "Debit and credit" },
                    { value: "one", label: "One column" },
                  ]}
                  onChange={(mode) => {
                    const guess = guessMapping(header);
                    setMapping(
                      mode === "one"
                        ? { amount: parsed.mapping.amount >= 0 ? parsed.mapping.amount : Math.max(guess.amount, 0), debit: -1, credit: -1 }
                        : { amount: -1, debit: Math.max(guess.debit, 0), credit: Math.max(guess.credit, 0) },
                    );
                  }}
                />
              </div>
              <Field id="map-balance" label="Balance column" hint="Optional. Used to set the account's balance to match the bank.">
                <ColumnSelect
                  id="map-balance"
                  value={parsed.mapping.balance}
                  options={columnOptions}
                  optional
                  onChange={(balance) => setMapping({ balance })}
                />
              </Field>
              {parsed.mapping.amount >= 0 ? (
                <Field id="map-amount" label="Amount column" hint="Negative amounts are money out.">
                  <ColumnSelect id="map-amount" value={parsed.mapping.amount} options={columnOptions} onChange={(amount) => setMapping({ amount })} />
                </Field>
              ) : (
                <>
                  <Field id="map-debit" label="Money out (debit) column">
                    <ColumnSelect id="map-debit" value={parsed.mapping.debit} options={columnOptions} onChange={(debit) => setMapping({ debit })} />
                  </Field>
                  <Field id="map-credit" label="Money in (credit) column">
                    <ColumnSelect id="map-credit" value={parsed.mapping.credit} options={columnOptions} onChange={(credit) => setMapping({ credit })} />
                  </Field>
                </>
              )}
            </div>

            {extracted ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  Found <strong className="text-fg">{extracted.rows.length}</strong> transaction{extracted.rows.length === 1 ? "" : "s"}
                  {extracted.skipped.length > 0
                    ? `. ${extracted.skipped.length} row${extracted.skipped.length === 1 ? " was" : "s were"} skipped (no date or amount, like opening balances and totals).`
                    : "."}
                </p>
                {extracted.rows.length > 0 ? (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {extracted.rows.slice(0, 4).map((row) => (
                      <li key={row.line} className="flex justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 truncate">
                          <span className="text-subtle">{formatDay(row.date)} · </span>
                          {row.description || "No description"}
                        </span>
                        <span className={cn("tabular shrink-0", row.kind === "income" ? "text-positive" : "text-fg")}>
                          {row.kind === "income" ? "+" : "−"}
                          {money(row.amountMinor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-warning">No rows matched. Check the date column and date format above.</p>
                )}
              </div>
            ) : null}

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={tracksCash}
                onChange={(e) => setTracksCash(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span>
                <span className="font-medium text-fg">I also record what I spend from cash in this app</span>
                <span className="block text-muted">
                  Then cash withdrawals are moved to your Cash account. Leave this off and they count as spending, so your Cash
                  account doesn&apos;t fill up with money you have already spent.
                </span>
              </span>
            </label>

            <Button onClick={toReview} loading={pending} disabled={!extracted || extracted.rows.length === 0 || !accountId}>
              Continue to review
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {review ? (
        <ReviewTable
          rows={review}
          accountId={accountId}
          accounts={usable}
          categories={categories}
          money={money}
          balances={balances}
          accountName={usable.find((a) => a.id === accountId)?.name ?? "the account"}
          setOpening={setOpening}
          onSetOpening={setSetOpening}
          pending={pending}
          onChange={update}
          onSetAll={(include) => setReview(review.map((r) => ({ ...r, include: include && r.status !== "imported" })))}
          onBack={() => setReview(null)}
          onSave={save}
        />
      ) : null}

      {removed ? <Alert tone="success">{removed}</Alert> : null}

      {!parsed && !review && usable.some((a) => (importedCounts[a.id] ?? 0) > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>Start an import again</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              Imported with the wrong choices? Remove that account&apos;s imported transactions and import the file again.
              Transactions you entered yourself are kept.
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {usable
                .filter((a) => (importedCounts[a.id] ?? 0) > 0)
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-fg">
                      {a.name} <span className="text-subtle">· {importedCounts[a.id]} imported</span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setRemoving(a)}>
                      <RotateCcw aria-hidden className="size-4" /> Remove
                    </Button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing ? importedCounts[removing.id] : 0} imported transactions?`}
        description={`Every imported transaction involving ${removing?.name ?? "this account"} is deleted, including transfers to and from it. This can't be undone, but you can import the statement again.`}
        confirmLabel="Remove"
        pending={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          startTransition(async () => {
            const outcome = await removeImported(removing.id);
            setRemoving(null);
            if (!outcome.ok) return setError(outcome.error);
            setError(null);
            setRemoved(`Removed ${outcome.removed} imported transaction${outcome.removed === 1 ? "" : "s"} from ${removing.name}.`);
          })
        }
      />

      {!parsed && !review ? (
        <Card>
          <CardContent className="space-y-2 text-sm text-muted">
            <p className="flex items-center gap-2 font-medium text-fg">
              <FileUp aria-hidden className="size-4" /> Getting a UBL statement
            </p>
            <p>
              Download an account statement for the dates you want from UBL Digital (the app or internet banking). Excel or
              CSV works best. Importing an overlapping period again is safe: rows already imported are skipped.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ColumnSelect({
  id,
  value,
  options,
  optional,
  onChange,
}: {
  id: string;
  value: number;
  options: { value: string; label: string }[];
  optional?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Select id={id} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
      <option value="-1">{optional ? "None" : "Choose a column"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function ReviewTable({
  rows,
  accountId,
  accounts,
  categories,
  money,
  balances,
  accountName,
  setOpening,
  onSetOpening,
  pending,
  onChange,
  onSetAll,
  onBack,
  onSave,
}: {
  rows: ReviewRow[];
  accountId: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  money: (minor: number) => string;
  balances: { openingMinor: number; closingMinor: number } | null;
  accountName: string;
  setOpening: boolean;
  onSetOpening: (value: boolean) => void;
  pending: boolean;
  onChange: (index: number, patch: Partial<ReviewRow>) => void;
  onSetAll: (include: boolean) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const others = accounts.filter((a) => a.id !== accountId);
  const chosen = rows.filter((r) => r.include);
  const inMinor = chosen.filter((r) => r.kind === "income").reduce((s, r) => s + r.amountMinor, 0);
  const outMinor = chosen.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amountMinor, 0);
  const counts = {
    imported: rows.filter((r) => r.status === "imported").length,
    duplicate: rows.filter((r) => r.status === "possible-duplicate").length,
  };

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>3. Review and import</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onSetAll(true)}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSetAll(false)}>
            Select none
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {counts.imported + counts.duplicate > 0 ? (
          <Alert tone="info">
            {counts.imported > 0 ? `${counts.imported} row${counts.imported === 1 ? " is" : "s are"} already imported and will be skipped. ` : ""}
            {counts.duplicate > 0
              ? `${counts.duplicate} look${counts.duplicate === 1 ? "s" : ""} like ${counts.duplicate === 1 ? "a transaction" : "transactions"} you entered by hand (same day and amount), so ${counts.duplicate === 1 ? "it is" : "they are"} unticked. Tick any that are really new.`
              : ""}
          </Alert>
        ) : null}

        {balances ? (
          <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={setOpening}
              onChange={(e) => onSetOpening(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span>
              <span className="font-medium text-fg">
                Set {accountName}&apos;s starting balance to {money(balances.openingMinor)}
              </span>
              <span className="block text-muted">
                That is the balance before this statement&apos;s first row, so after the import {accountName} shows{" "}
                {money(balances.closingMinor)}, the same as the bank. It is left alone if the account has older transactions.
              </span>
            </span>
          </label>
        ) : null}

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
          <table className="w-full min-w-2xl text-left text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-subtle">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 font-medium">
                  <span className="sr-only">Import</span>
                </th>
                <th scope="col" className="px-2 py-2 font-medium">Date</th>
                <th scope="col" className="px-2 py-2 font-medium">Description</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, i) => {
                const status = STATUS[row.status];
                const kindCategories = categories.filter((c) => c.kind === row.kind && !c.is_archived);
                return (
                  <tr key={row.line} className={cn(!row.include && "opacity-60")}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Import ${row.description || "row"} on ${formatDay(row.date)}`}
                        checked={row.include}
                        disabled={row.status === "imported"}
                        onChange={(e) => onChange(i, { include: e.target.checked })}
                        className="size-4 accent-accent"
                      />
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-2 text-muted">{formatDay(row.date)}</td>
                    <td className="max-w-64 px-2 py-2">
                      <span className="block truncate text-fg" title={row.description}>
                        {row.description || "No description"}
                      </span>
                      {status ? <span className={cn("mt-0.5 inline-block rounded px-1.5 text-xs", status.className)}>{status.label}</span> : null}
                    </td>
                    <td className={cn("tabular whitespace-nowrap px-2 py-2 text-right", row.kind === "income" ? "text-positive" : "text-fg")}>
                      {row.kind === "income" ? "+" : "−"}
                      {money(row.amountMinor)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        aria-label={`Category for ${row.description || "row"}`}
                        value={row.target}
                        disabled={row.status === "imported"}
                        onChange={(e) => onChange(i, { target: e.target.value, include: row.status !== "imported" })}
                        className="h-9 min-w-44"
                      >
                        <option value="">Choose…</option>
                        <optgroup label={row.kind === "income" ? "Income" : "Spending"}>
                          {kindCategories.map((c) => (
                            <option key={c.id} value={`cat:${c.id}`}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                        {others.length > 0 ? (
                          <optgroup label={row.kind === "income" ? "Transfer from my account" : "Transfer to my account"}>
                            {others.map((a) => (
                              <option key={a.id} value={`acc:${a.id}`}>
                                {a.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            <strong className="text-fg">{chosen.length}</strong> selected · in <span className="tabular text-fg">{money(inMinor)}</span> · out{" "}
            <span className="tabular text-fg">{money(outMinor)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onBack} disabled={pending}>
              Back
            </Button>
            <Button onClick={onSave} loading={pending} disabled={chosen.length === 0}>
              Import {chosen.length} transaction{chosen.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-subtle">
          Choose &ldquo;Transfer to my account&rdquo; for money moved to your own savings, wallet or card so it isn&apos;t counted as
          spending. Add &ldquo;Cash spending&rdquo; and &ldquo;Bank fees&rdquo; categories and cash withdrawals and bank charges are
          sorted into them.
        </p>
      </CardContent>
    </Card>
  );
}
