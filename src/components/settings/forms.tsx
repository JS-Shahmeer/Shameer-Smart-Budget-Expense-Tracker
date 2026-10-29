"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePassword, saveSettings } from "@/app/(app)/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldAria } from "@/components/ui/input";
import type { Settings } from "@/lib/data/profile";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import { CURRENCIES, settingsSchema, type SettingsInput } from "@/lib/validation/finance";

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

const HINTS = {
  currency: "Amounts are not converted. Only the symbol changes.",
  timezone: "Decides when a new day and month begin.",
  monthStartDay: "1 to 28. Use your payday if you budget from salary to salary.",
  paydayDay: "Used by the Planner. 31 means the last day of short months.",
  password: "At least 8 characters.",
};

export function PreferencesForm({ settings, timeZones }: { settings: Settings; timeZones: string[] }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      displayName: settings.display_name ?? "",
      currency: settings.currency as SettingsInput["currency"],
      timezone: settings.timezone,
      monthStartDay: String(settings.month_start_day),
      paydayDay: String(settings.payday_day),
      budgetWarningPercent: String(settings.budget_warning_percent),
    },
  });
  const currency = useWatch({ control, name: "currency" });
  const currencyHint = currency !== settings.currency ? HINTS.currency : undefined;
  // Keep a saved zone selectable even if this browser's list doesn't include it.
  const zones = timeZones.includes(settings.timezone) ? timeZones : [settings.timezone, ...timeZones];

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        startTransition(async () => {
          setStatus(null);
          const result = await saveSettings(values);
          if (result.ok) return setStatus({ tone: "success", text: "Settings saved." });
          setStatus({ tone: "error", text: result.error });
          for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof SettingsInput, { message });
        }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="displayName" label="Your name" error={errors.displayName?.message}>
          <Input autoComplete="name" {...fieldAria("displayName", errors.displayName?.message)} {...register("displayName")} />
        </Field>
        <Field
          id="currency"
          label="Currency"
          error={errors.currency?.message}
          hint={currencyHint}
        >
          <Select
            {...fieldAria("currency", errors.currency?.message, currencyHint)}
            {...register("currency")}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code} · {currencyNames.of(code)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="timezone" label="Time zone" error={errors.timezone?.message} hint={HINTS.timezone}>
          <Select {...fieldAria("timezone", errors.timezone?.message, HINTS.timezone)} {...register("timezone")}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="budgetWarningPercent"
          label="Warn me when a budget reaches (%)"
          error={errors.budgetWarningPercent?.message}
        >
          <Input inputMode="numeric" {...fieldAria("budgetWarningPercent", errors.budgetWarningPercent?.message)} {...register("budgetWarningPercent")} />
        </Field>
        <Field
          id="monthStartDay"
          label="Budget month starts on day"
          error={errors.monthStartDay?.message}
          hint={HINTS.monthStartDay}
        >
          <Input inputMode="numeric" {...fieldAria("monthStartDay", errors.monthStartDay?.message, HINTS.monthStartDay)} {...register("monthStartDay")} />
        </Field>
        <Field
          id="paydayDay"
          label="Payday (day of the month)"
          error={errors.paydayDay?.message}
          hint={HINTS.paydayDay}
        >
          <Input inputMode="numeric" {...fieldAria("paydayDay", errors.paydayDay?.message, HINTS.paydayDay)} {...register("paydayDay")} />
        </Field>
      </div>
      {status ? (
        <Alert tone={status.tone}>{status.text}</Alert>
      ) : null}
      <Button type="submit" loading={pending}>
        Save settings
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        startTransition(async () => {
          setStatus(null);
          const result = await changePassword(values);
          if (result.ok) {
            reset();
            return setStatus({ tone: "success", text: "Password changed." });
          }
          setStatus({ tone: "error", text: result.error });
          for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as keyof ChangePasswordInput, { message });
        }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="password" label="New password" error={errors.password?.message} hint={HINTS.password}>
          <Input type="password" autoComplete="new-password" {...fieldAria("password", errors.password?.message, HINTS.password)} {...register("password")} />
        </Field>
        <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
            {...register("confirmPassword")}
          />
        </Field>
      </div>
      {status ? (
        <Alert tone={status.tone}>{status.text}</Alert>
      ) : null}
      <Button type="submit" variant="secondary" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
