import { z } from "zod";
import { difficultySchema, goalTypeSchema } from "../common/validation";

export const createGoalSchema = z.object({
  goalType: goalTypeSchema,
  targetDate: z.coerce.date(),
  difficultyPreference: difficultySchema.default("medium")
});

export const updateGoalSchema = z.object({
  targetDate: z.coerce.date().optional(),
  difficultyPreference: difficultySchema.optional(),
  progress: z.number().min(0).max(100).optional()
});
