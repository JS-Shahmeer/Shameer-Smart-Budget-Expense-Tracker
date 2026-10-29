"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A modal on the native <dialog> element, which provides focus trapping,
 * Escape to close and an inert background. On phones it opens as a bottom sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={cn(
        "mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-line bg-surface p-0 text-fg backdrop:bg-black/60",
        "sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-xl",
        className,
      )}
    >
      {open ? (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
