import { daysBetween, daysInMonth, addMonths, parseIsoDate, toIsoDate, type IsoDate } from "@/lib/dates";

/** The next payday strictly after today. If today is payday, the next one is next month's. */
export function nextPayday(today: IsoDate, paydayDay: number): IsoDate {
  const { year, month, day } = parseIsoDate(today);
  const clamp = (y: number, m: number) => Math.min(paydayDay, daysInMonth(y, m));
  if (day < clamp(year, month)) return toIsoDate(year, month, clamp(year, month));
  const next = addMonths(year, month, 1);
  return toIsoDate(next.year, next.month, clamp(next.year, next.month));
}

export type Commitment = { name: string; date: IsoDate; amountMinor: number; type: "bill" | "savings" };

export type DailyPlan = {
  today: IsoDate;
  payday: IsoDate;
  /** Days from today up to (not including) payday. Always at least 1. */
  daysLeft: number;
  /** Spendable money at the start of today: everyday balances plus anything already spent today. */
  startOfDayMinor: number;
  billsMinor: number;
  savingsMinor: number;
  commitments: Commitment[];
  /** Start-of-day money minus bills and savings commitments due before payday. */
  freeMinor: number;
  dailyLimitMinor: number;
  spentTodayMinor: number;
  leftTodayMinor: number;
  /** How much the commitments exceed the money available, if they do. */
  shortfallMinor: number;
};

/**
 * How much can be spent per day until payday without touching money that is
 * already committed to bills or savings.
 *
 * The limit is worked out from the balance at the start of today, so spending
 * during the day lowers "left today" rather than shrinking the limit itself.
 */
export function dailyPlan(input: {
  today: IsoDate;
  paydayDay: number;
  availableMinor: number;
  spentTodayMinor: number;
  commitments: Commitment[];
}): DailyPlan {
  const payday = nextPayday(input.today, input.paydayDay);
  const daysLeft = Math.max(1, daysBetween(input.today, payday));
  const startOfDayMinor = input.availableMinor + input.spentTodayMinor;
  const billsMinor = sum(input.commitments.filter((c) => c.type === "bill"));
  const savingsMinor = sum(input.commitments.filter((c) => c.type === "savings"));
  const freeMinor = startOfDayMinor - billsMinor - savingsMinor;
  // Whole rupees, rounded down, so the limit never overstates what is safe.
  const dailyLimitMinor = freeMinor > 0 ? Math.floor(freeMinor / daysLeft / 100) * 100 : 0;

  return {
    today: input.today,
    payday,
    daysLeft,
    startOfDayMinor,
    billsMinor,
    savingsMinor,
    commitments: [...input.commitments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    freeMinor,
    dailyLimitMinor,
    spentTodayMinor: input.spentTodayMinor,
    leftTodayMinor: dailyLimitMinor - input.spentTodayMinor,
    shortfallMinor: Math.max(0, -freeMinor),
  };
}

function sum(items: { amountMinor: number }[]) {
  return items.reduce((total, item) => total + item.amountMinor, 0);
}

export type PurchaseVerdict = "comfortable" | "tight" | "uses-commitments" | "cannot";

export type PurchaseAssessment = {
  verdict: PurchaseVerdict;
  /** Money left after the purchase, before commitments. */
  balanceAfterMinor: number;
  /** Free money left after the purchase and all commitments. */
  freeAfterMinor: number;
  newDailyLimitMinor: number;
  /** Change in the daily limit until payday. */
  dailyLimitDropMinor: number;
  /** Part of the price that would have to come out of bill or savings money. */
  fromCommitmentsMinor: number;
  /** Months the savings plan would slip if that part came out of savings. */
  savingsDelayMonths: number | null;
  budget: { limitMinor: number; spentAfterMinor: number; remainingAfterMinor: number; over: boolean } | null;
};

/** How a one-off purchase today would affect the daily limit, commitments, budget and savings. */
export function assessPurchase(
  plan: DailyPlan,
  purchase: {
    amountMinor: number;
    budget?: { limitMinor: number; spentMinor: number } | null;
    monthlySavingsMinor: number;
  },
): PurchaseAssessment {
  const balanceAfterMinor = plan.startOfDayMinor - plan.spentTodayMinor - purchase.amountMinor;
  // Today's spending already counts against today's share, so it is taken
  // out of the free money before the purchase is.
  const freeAfterMinor = plan.freeMinor - plan.spentTodayMinor - purchase.amountMinor;
  const newDailyLimitMinor = freeAfterMinor > 0 ? Math.floor(freeAfterMinor / plan.daysLeft / 100) * 100 : 0;
  const fromCommitmentsMinor = Math.max(0, -freeAfterMinor) - Math.max(0, -(plan.freeMinor - plan.spentTodayMinor));

  let verdict: PurchaseVerdict;
  if (balanceAfterMinor < 0) verdict = "cannot";
  else if (fromCommitmentsMinor > 0) verdict = "uses-commitments";
  else if (newDailyLimitMinor < plan.dailyLimitMinor / 2) verdict = "tight";
  else verdict = "comfortable";

  const budget = purchase.budget
    ? {
        limitMinor: purchase.budget.limitMinor,
        spentAfterMinor: purchase.budget.spentMinor + purchase.amountMinor,
        remainingAfterMinor: purchase.budget.limitMinor - purchase.budget.spentMinor - purchase.amountMinor,
        over: purchase.budget.spentMinor + purchase.amountMinor > purchase.budget.limitMinor,
      }
    : null;
  if (verdict === "comfortable" && budget?.over) verdict = "tight";

  return {
    verdict,
    balanceAfterMinor,
    freeAfterMinor,
    newDailyLimitMinor,
    dailyLimitDropMinor: plan.dailyLimitMinor - newDailyLimitMinor,
    fromCommitmentsMinor,
    savingsDelayMonths:
      fromCommitmentsMinor > 0 && purchase.monthlySavingsMinor > 0
        ? Math.ceil(fromCommitmentsMinor / purchase.monthlySavingsMinor)
        : null,
    budget,
  };
}
