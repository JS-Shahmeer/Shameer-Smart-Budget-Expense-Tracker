"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn, signUp } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldAria } from "@/components/ui/input";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "@/lib/validation/auth";

export function SignInForm() {
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "link" ? "That link is invalid or has expired. Sign in or request a new one." : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signIn(values, searchParams.get("next") ?? undefined);
      if (result?.error) setError(result.error);
    });
  });

  // method="post" keeps credentials out of the URL if the form is submitted before hydration.
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...fieldAria("email", errors.email?.message)} {...register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input
          type="password"
          autoComplete="current-password"
          {...fieldAria("password", errors.password?.message)}
          {...register("password")}
        />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (result?.error) setError(result.error);
      if (result?.message) setMessage(result.message);
    });
  });

  if (message) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Almost there">
          {message}
        </Alert>
        <Link href="/login" className="block text-center text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  // method="post" keeps credentials out of the URL if the form is submitted before hydration.
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field id="displayName" label="Name (optional)" error={errors.displayName?.message}>
        <Input autoComplete="name" {...fieldAria("displayName", errors.displayName?.message)} {...register("displayName")} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...fieldAria("email", errors.email?.message)} {...register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters" error={errors.password?.message}>
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria("password", errors.password?.message, "At least 8 characters")}
          {...register("password")}
        />
      </Field>
      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
          {...register("confirmPassword")}
        />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
