import type { Metadata } from "next";
import { Calculator } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Planner" };

export default function Page() {
  return <ComingSoon title="Planner" description="Daily spending limit and purchase affordability." icon={Calculator} step={3} />;
}
