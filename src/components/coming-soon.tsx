import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Placeholder for a section that is scheduled for a later build step. */
export function ComingSoon({
  title,
  description,
  icon,
  step,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  step: number;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState icon={icon} title="Not built yet" description={`This section is planned for step ${step} of the build.`} />
      </Card>
    </>
  );
}
