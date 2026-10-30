"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, INVALID_ID, isId, type ActionResult } from "@/lib/action-result";
import { statementRefs } from "@/lib/import/refs";
import { createClient } from "@/lib/supabase/server";
import { importCheckSchema, importCommitSchema } from "@/lib/validation/finance";

export type RowStatus = "new" | "imported" | "possible-duplicate";

export type CheckResult = { ok: true; statuses: RowStatus[] } | { ok: false; error: string };
export type CommitResult = { ok: true; imported: number; alreadyThere: number } | { ok: false; error: string };

/** The message of a failed ActionResult, for the result types below. */
const failed = (result: ActionResult) => ({ ok: false as const, error: result.ok ? "Something went wrong." : result.error });

const IN_CHUNK = 200;
const INSERT_CHUNK = 500;

/**
 * Marks each statement row as new, already imported (same row of an earlier
 * import), or a possible duplicate of a transaction entered by hand on the
 * same day for the same amount.
 */
export async function checkImport(accountId: string, input: unknown): Promise<CheckResult> {
  const user = await requireUser();
  if (!isId(accountId)) return INVALID_ID;
  const parsed = importCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The file could not be read." };
  const rows = parsed.data;
  const refs = statementRefs(accountId, rows);
  const supabase = await createClient();

  const imported = new Set<string>();
  for (let i = 0; i < refs.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .select("import_ref")
      .eq("user_id", user.id)
      .in("import_ref", refs.slice(i, i + IN_CHUNK));
    if (error) return failed(databaseFailure(error, "check for earlier imports"));
    for (const r of data) if (r.import_ref) imported.add(r.import_ref);
  }

  const dates = rows.map((r) => r.date).sort();
  const { data: manual, error } = await supabase
    .from("transactions")
    .select("occurred_on, kind, amount_minor")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .is("import_ref", null)
    .gte("occurred_on", dates[0])
    .lte("occurred_on", dates[dates.length - 1])
    .limit(5000);
  if (error) return failed(databaseFailure(error, "check for duplicates"));
  const manualKeys = new Set(manual.map((t) => `${t.occurred_on}|${t.kind}|${t.amount_minor}`));

  return {
    ok: true,
    statuses: rows.map((row, i) =>
      imported.has(refs[i]) ? "imported" : manualKeys.has(`${row.date}|${row.kind}|${row.amountMinor}`) ? "possible-duplicate" : "new",
    ),
  };
}

/**
 * Saves rows of a statement to `accountId`. `input` is every parsed row of the
 * file and `selected` the indexes to save: import keys number repeated rows by
 * their position in the whole file, so they must be worked out over all rows.
 * Rows imported before are skipped by the database.
 */
export async function commitImport(accountId: string, input: unknown, selected: number[]): Promise<CommitResult> {
  const user = await requireUser();
  if (!isId(accountId)) return INVALID_ID;
  const parsed = importCommitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Some rows are not valid." };
  const rows = parsed.data;
  if (!Array.isArray(selected) || !selected.every((i) => Number.isInteger(i) && i >= 0 && i < rows.length)) {
    return { ok: false, error: "Choose at least one row to import." };
  }
  const chosen = [...new Set(selected)];
  if (chosen.length === 0) return { ok: false, error: "Choose at least one row to import." };

  const refs = statementRefs(accountId, rows);
  const inserts = [];
  for (const i of chosen) {
    const row = rows[i];
    const base = { user_id: user.id, amount_minor: row.amountMinor, occurred_on: row.date, description: row.description || null, import_ref: refs[i] };
    if (row.transferAccountId) {
      if (row.transferAccountId === accountId) return { ok: false, error: `Row ${i + 1}: a transfer needs a different account.` };
      // Money out of the statement account goes to the other account, money in comes from it.
      inserts.push({
        ...base,
        kind: "transfer" as const,
        account_id: row.kind === "expense" ? accountId : row.transferAccountId,
        to_account_id: row.kind === "expense" ? row.transferAccountId : accountId,
        category_id: null,
      });
    } else {
      if (!row.categoryId) return { ok: false, error: `Row ${i + 1}: choose a category.` };
      inserts.push({ ...base, kind: row.kind, account_id: accountId, to_account_id: null, category_id: row.categoryId });
    }
  }

  const supabase = await createClient();
  let imported = 0;
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(inserts.slice(i, i + INSERT_CHUNK), { onConflict: "user_id,import_ref", ignoreDuplicates: true })
      .select("id");
    if (error) {
      const { error: message } = failed(databaseFailure(error, "import the transactions"));
      return { ok: false, error: imported > 0 ? `${imported} rows were saved before an error: ${message}` : message };
    }
    imported += data.length;
  }
  refresh();
  return { ok: true, imported, alreadyThere: inserts.length - imported };
}
