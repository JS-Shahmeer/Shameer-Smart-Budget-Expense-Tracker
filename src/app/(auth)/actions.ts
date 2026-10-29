"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";

export type AuthResult = { error?: string; message?: string };

export async function signIn(input: unknown, next?: string): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: "Check your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error:
        error.code === "email_not_confirmed"
          ? "Confirm your email first. Check your inbox for the link."
          : "That email and password do not match.",
    };
  }
  redirect(safeNextPath(next));
}

export async function signUp(input: unknown): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { display_name: parsed.data.displayName || null },
    },
  });
  if (error) {
    return { error: error.code === "weak_password" ? "Choose a stronger password." : "Could not create the account. Try again." };
  }

  // With email confirmation on, there is no session until the link is clicked.
  if (!data.session) {
    return { message: "Check your email for a confirmation link, then sign in." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
