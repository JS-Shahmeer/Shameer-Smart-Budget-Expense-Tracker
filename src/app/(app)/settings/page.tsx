import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, Landmark } from "lucide-react";
import { PasswordForm, PreferencesForm } from "@/components/settings/forms";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Currency, months, payday and your sign-in." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <SettingsSections />
      </Suspense>
    </>
  );
}

async function SettingsSections() {
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  const timeZones = Intl.supportedValuesOf("timeZone");

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm settings={settings} timeZones={timeZones} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in and security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Signed in as <span className="text-fg">{user.email ?? "unknown email"}</span>
          </p>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Download every transaction as a CSV file that opens in Excel or Google Sheets, or manage the accounts and categories
            you record them against.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/reports/export?month=all" download className={buttonClasses("secondary")}>
              <Download aria-hidden className="size-4" />
              Export all transactions
            </a>
            <ButtonLink href="/accounts" variant="secondary">
              <Landmark aria-hidden className="size-4" />
              Accounts and categories
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
