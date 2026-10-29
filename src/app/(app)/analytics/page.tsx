import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <ComingSoon title="Analytics" description="Category breakdowns, monthly comparisons and trends." icon={BarChart3} step={4} />;
}
