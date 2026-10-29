import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Budgets" };

export default function Page() {
  return <ComingSoon title="Budgets" description="Monthly limits for each spending category." icon={Wallet} step={2} />;
}
