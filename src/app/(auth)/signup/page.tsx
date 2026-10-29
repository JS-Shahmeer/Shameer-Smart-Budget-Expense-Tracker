import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Your data is private to you and stored in your own Supabase project.</p>
      <SignUpForm />
    </>
  );
}
