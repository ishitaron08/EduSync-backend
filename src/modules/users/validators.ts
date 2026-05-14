import { z } from "zod";
import { daySchema, timeSchema } from "../common/validation";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "teacher", "student"]).default("student")
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["admin", "teacher", "student"]).optional(),
  availability: z.array(z.object({
    day: daySchema,
    startTime: timeSchema,
    endTime: timeSchema
  })).optional(),
  rewardPoints: z.number().int().min(0).optional()
});

export const availabilitySchema = z.object({
  availability: z.array(z.object({
    day: daySchema,
    startTime: timeSchema,
    endTime: timeSchema
  })).default([])
});
