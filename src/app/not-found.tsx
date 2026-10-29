import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted">That page does not exist.</p>
      <ButtonLink href="/" variant="secondary">
        Go to dashboard
      </ButtonLink>
    </main>
  );
}
