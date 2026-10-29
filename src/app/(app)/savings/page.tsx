import type { Metadata } from "next";
import { PiggyBank } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Savings goals" };

export default function Page() {
  return <ComingSoon title="Savings goals" description="Targets, deadlines and monthly contribution plans." icon={PiggyBank} step={3} />;
}
