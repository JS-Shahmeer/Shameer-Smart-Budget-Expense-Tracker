import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <ComingSoon title="Settings" description="Currency, month start, payday and account." icon={Settings} step={4} />;
}
