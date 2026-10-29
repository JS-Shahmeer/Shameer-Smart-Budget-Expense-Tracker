"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert tone="error" title="Something went wrong loading this page">
        Your data is safe. Try again, and if it keeps happening, check your connection.
        {digest ? ` Reference: ${digest}.` : null}
      </Alert>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
