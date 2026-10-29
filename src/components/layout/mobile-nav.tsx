"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "./nav-items";

const primary = NAV_ITEMS.filter((item) => item.mobile);
const secondary = NAV_ITEMS.filter((item) => !item.mobile);

/** Bottom tab bar for small screens, with the remaining pages behind "More". */
export function MobileNav({ footer }: { footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const moreActive = secondary.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px]",
                    active ? "text-fg" : "text-subtle",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", active && "text-accent")} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px]",
                moreActive ? "text-fg" : "text-subtle",
              )}
            >
              <Menu aria-hidden className={cn("size-5", moreActive && "text-accent")} />
              More
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialog}
        aria-label="More pages"
        onClose={() => setOpen(false)}
        className="mt-auto mb-0 w-full max-w-none rounded-t-2xl border border-line bg-surface p-4 text-fg backdrop:bg-black/60 lg:hidden"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">More</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <ul className="space-y-1">
          {secondary.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-3 aria-[current=page]:text-fg"
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-line pt-3">{footer}</div>
      </dialog>
    </>
  );
}
