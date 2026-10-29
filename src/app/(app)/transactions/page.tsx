import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <ComingSoon title="Transactions" description="Income, expenses and transfers with search and filters." icon={ArrowLeftRight} step={2} />;
}
