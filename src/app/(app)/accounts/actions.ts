"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { databaseFailure, INVALID_ID, isId, validationFailure, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { accountSchema, categorySchema, parseSignedAmountToMinor } from "@/lib/validation/finance";

type Table = "accounts" | "categories";

async function setArchived(table: Table, id: string, archived: boolean, label: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isId(id)) return INVALID_ID;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ is_archived: archived })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return databaseFailure(error, `update the ${label}`);
  if (data.length === 0) return { ok: false, error: `That ${label} no longer exists.` };
  refresh();
  return { ok: true };
}

async function remove(table: Table, id: string, label: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isId(id)) return INVALID_ID;
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) {
    if (error.code === "23503") {
      return { ok: false, error: `This ${label} is used by transactions or recurring items. Archive it instead to hide it.` };
    }
    return databaseFailure(error, `delete the ${label}`);
  }
  if (data.length === 0) return { ok: false, error: `That ${label} no longer exists.` };
  refresh();
  return { ok: true };
}

export async function saveAccount(id: string | null, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (id !== null && !isId(id)) return INVALID_ID;
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const row = {
    name: parsed.data.name,
    type: parsed.data.type,
    opening_balance_minor: parsed.data.openingBalance ? (parseSignedAmountToMinor(parsed.data.openingBalance) ?? 0) : 0,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("accounts").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("accounts").insert({ ...row, user_id: user.id });
  if (error) return databaseFailure(error, "save the account");
  refresh();
  return { ok: true };
}

export async function archiveAccount(id: string, archived: boolean) {
  return setArchived("accounts", id, archived, "account");
}

export async function deleteAccount(id: string) {
  return remove("accounts", id, "account");
}

export async function saveCategory(id: string | null, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (id !== null && !isId(id)) return INVALID_ID;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  // The kind can't change once transactions use the category, so it is only set on create.
  const { error } = id
    ? await supabase
        .from("categories")
        .update({ name: parsed.data.name, color: parsed.data.color })
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("categories").insert({ ...parsed.data, user_id: user.id });
  if (error) return databaseFailure(error, "save the category");
  refresh();
  return { ok: true };
}

export async function archiveCategory(id: string, archived: boolean) {
  return setArchived("categories", id, archived, "category");
}

export async function deleteCategory(id: string) {
  return remove("categories", id, "category");
}
