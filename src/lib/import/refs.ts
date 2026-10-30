import "server-only";

import { createHash } from "node:crypto";
import type { StatementRow } from "./statement";
import { statementKeys } from "./statement";

/** Hashed import keys for a statement batch (see statementKeys). Hashing keeps descriptions out of the index. */
export function statementRefs(accountId: string, rows: Pick<StatementRow, "date" | "kind" | "amountMinor" | "description">[]): string[] {
  return statementKeys(accountId, rows).map((key) => `stmt:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`);
}
