import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
