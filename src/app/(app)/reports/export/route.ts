import { toCsv } from "@/lib/csv";
import { getExportRows } from "@/lib/data/insights";
import { getSettings } from "@/lib/data/profile";
import { budgetPeriodForMonth, isValidIsoDate, todayIn } from "@/lib/dates";
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";

/**
 * Downloads transactions as CSV: ?month=YYYY-MM for one budget month, or
 * ?month=all for everything. Reads go through the signed-in user's session,
 * so RLS limits the file to their own data.
 */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const settings = await getSettings();

  let period = null;
  let name: string;
  if (month === "all") {
    name = `transactions-all-${todayIn(settings.timezone)}`;
  } else if (/^\d{4}-\d{2}$/.test(month) && isValidIsoDate(`${month}-01`)) {
    period = budgetPeriodForMonth(`${month}-01`, settings.month_start_day);
    name = `transactions-${month}`;
  } else {
    return new Response("Choose a month as YYYY-MM, or all.", { status: 400 });
  }

  const rows = await getExportRows(period);
  const csv = toCsv([
    ["Date", "Type", "Description", "Category", "Account", "To account", "Savings goal", "Payment method", "Amount", "Currency", "Note"],
    ...rows.map((r) => [
      r.occurred_on,
      KIND_LABELS[r.kind],
      r.description,
      r.category,
      r.account,
      r.toAccount,
      r.goal,
      r.payment_method ? PAYMENT_METHOD_LABELS[r.payment_method] : null,
      r.amount_minor / 100,
      settings.currency,
      r.note,
    ]),
  ]);

  // The byte order mark tells Excel the file is UTF-8, so names like "Café" survive.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
