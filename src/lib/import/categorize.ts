import type { CategoryKind } from "@/lib/supabase/database.types";
import { normalizeDescription } from "./statement";

// Suggests a category for an imported row. What the user chose before for the
// same description wins; otherwise common Pakistani merchants and billers are
// matched to the default categories by name.

type Category = { id: string; name: string; kind: CategoryKind; is_archived: boolean };

/**
 * Keywords per category. A rule picks the first of its category names you
 * have, so "Bank fees" and "Cash spending" work once you add those categories.
 * Matching is on whole words of the normalised description.
 */
const RULES: { category: string | string[]; kind: CategoryKind; words: string[] }[] = [
  { category: ["Bank fees", "Bank charges", "Fees"], kind: "expense", words: ["withdrawal fee", "fee", "fees", "service charges", "sms charges", "excise duty", "withholding tax", "wht"] },
  { category: ["Cash spending", "Cash"], kind: "expense", words: ["cash withdrawal", "atm withdrawal", "atm"] },
  { category: "Salary", kind: "income", words: ["salary", "payroll", "pay roll"] },
  { category: "Food", kind: "expense", words: ["foodpanda", "kfc", "mcdonalds", "mcdonald", "pizza", "restaurant", "cafe", "bakery", "bakers", "dhaba", "hardees", "subway", "imtiaz", "chase up", "al fatah", "metro", "carrefour", "grocery", "naheed"] },
  { category: "Transport", kind: "expense", words: ["careem", "uber", "indrive", "indriver", "bykea", "yango", "petrol", "fuel", "pso", "shell", "total parco", "attock", "motorway", "m tag", "mtag"] },
  { category: "Utilities", kind: "expense", words: ["k electric", "kelectric", "lesco", "iesco", "mepco", "fesco", "gepco", "pesco", "hesco", "sngpl", "ssgc", "ptcl", "wapda", "electricity", "water board", "gas bill", "nayatel", "stormfiber", "storm fiber"] },
  { category: "Subscriptions", kind: "expense", words: ["netflix", "spotify", "youtube", "apple com", "google", "amazon prime", "chatgpt", "openai", "anthropic", "claude", "canva", "microsoft", "zong", "jazz", "telenor", "ufone", "mobilink"] },
  { category: "Shopping", kind: "expense", words: ["daraz", "amazon", "aliexpress", "temu", "outfitters", "khaadi", "gul ahmed", "sapphire", "mall"] },
  { category: "Health", kind: "expense", words: ["pharmacy", "hospital", "clinic", "medical", "dvago", "servaid", "chughtai", "laboratory", "dawai", "aga khan", "shaukat khanum"] },
  { category: "Rent", kind: "expense", words: ["rent", "landlord"] },
];

export type Learned = Map<string, string>;

/** Builds the "seen before" table from past transactions, newest first so the latest choice wins. */
export function learnFromHistory(history: { description: string | null; category_id: string | null }[]): Learned {
  const learned: Learned = new Map();
  for (const t of history) {
    if (!t.description || !t.category_id) continue;
    const key = normalizeDescription(t.description);
    if (key && !learned.has(key)) learned.set(key, t.category_id);
  }
  return learned;
}

export function suggestCategory(description: string, kind: CategoryKind, categories: Category[], learned: Learned): string | null {
  const usable = categories.filter((c) => c.kind === kind && !c.is_archived);
  const key = normalizeDescription(description);

  const remembered = learned.get(key);
  if (remembered && usable.some((c) => c.id === remembered)) return remembered;

  const padded = ` ${key} `;
  for (const rule of RULES) {
    if (rule.kind !== kind) continue;
    if (!rule.words.some((w) => padded.includes(` ${w} `))) continue;
    const names = [rule.category].flat().map((n) => n.toLowerCase());
    const match = names.map((n) => usable.find((c) => c.name.toLowerCase() === n)).find(Boolean);
    if (match) return match.id;
  }

  // Fall back to a catch-all category when there is one.
  const fallback = usable.find((c) => /^(miscellaneous|other income|other)$/i.test(c.name));
  return fallback?.id ?? null;
}

/**
 * For people who record what they spend from cash: cash taken out at an ATM
 * is then a move from the bank to the wallet, not spending, so it is suggested
 * as a transfer to the cash account. Without that, the cash account would
 * grow by every withdrawal while the spending never shows up.
 */
export function suggestTransferAccount(
  description: string,
  kind: CategoryKind,
  accounts: { id: string; type: string; is_archived: boolean }[],
  statementAccountId: string,
): string | null {
  if (kind !== "expense" || !/\batm\b|cash withdrawal/i.test(description)) return null;
  return accounts.find((a) => a.type === "cash" && !a.is_archived && a.id !== statementAccountId)?.id ?? null;
}
