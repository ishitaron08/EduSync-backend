import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "teacher", "student"]).default("student")
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  portalRole: z.enum(["admin", "teacher", "student"])
});

export const refreshSchema = z.object({});
export const logoutSchema = z.object({});

const passwordPolicy = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Phone contains invalid characters")
    .optional()
    .nullable()
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: passwordPolicy,
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirm password must match",
    path: ["confirmPassword"]
  });
