import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Recurring & bills" };

export default function Page() {
  return <ComingSoon title="Recurring & bills" description="Salary, rent, subscriptions and upcoming bill reminders." icon={CalendarClock} step={2} />;
}
