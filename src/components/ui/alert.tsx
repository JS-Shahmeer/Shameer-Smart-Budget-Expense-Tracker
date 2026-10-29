import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  info: { icon: Info, className: "border-accent/30 bg-accent/10 text-fg" },
  warning: { icon: AlertTriangle, className: "border-warning/30 bg-warning/10 text-fg" },
  error: { icon: CircleAlert, className: "border-negative/30 bg-negative/10 text-fg" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", toneClass, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
      </div>
    </div>
  );
}
