import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function validationFailure(error: ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}

/** Turns a database error into a message that is safe and useful to show. */
export function databaseFailure(error: PostgrestError, action: string): ActionResult {
  switch (error.code) {
    case "23505":
      return { ok: false, error: "That already exists. Use a different name." };
    case "23503":
      return {
        ok: false,
        error: error.message.includes("delete")
          ? "It is still used by transactions or recurring items. Archive it instead."
          : "An account or category you chose no longer exists. Refresh and try again.",
      };
    case "23514":
      return { ok: false, error: "Some values are not allowed. Check the amounts, dates and category." };
    case "42501":
      return { ok: false, error: "You don't have access to that." };
    default:
      console.error(`Could not ${action}:`, error);
      return { ok: false, error: `Could not ${action}. Try again.` };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from the browser like any other input, so check their shape before querying. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export const INVALID_ID: ActionResult = { ok: false, error: "That item no longer exists. Refresh and try again." };
