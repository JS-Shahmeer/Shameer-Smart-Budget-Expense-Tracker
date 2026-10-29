import { z } from "zod";

// Trim before checking the format, so a stray space from autofill is not an error.
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

// Shared by the client forms and the server actions, so both sides apply the same rules.

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().max(80, "Keep it under 80 characters").optional(),
    email,
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Only allow redirects back into this app, never to another site. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}
