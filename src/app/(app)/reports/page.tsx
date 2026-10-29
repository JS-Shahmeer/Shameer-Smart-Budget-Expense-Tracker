import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ComingSoon title="Reports" description="Monthly reports with CSV export." icon={FileText} step={4} />;
}
