import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Track spending, budgets and savings in one place.</p>
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
