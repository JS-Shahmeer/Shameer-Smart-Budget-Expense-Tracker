"use client";

import { cn } from "@/lib/cn";

/** A small radio group drawn as joined buttons. */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
              checked ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
