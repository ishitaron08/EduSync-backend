import { z } from "zod";
import { objectIdSchema, taskStatusSchema } from "../common/validation";

export const createTaskSchema = z.object({
  goal: objectIdSchema.optional(),
  section: objectIdSchema.optional(),
  title: z.string().min(1),
  category: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  basePoints: z.number().int().min(1).optional(),
  status: taskStatusSchema.optional(),
  durationMinutes: z.number().int().min(1),
  scheduledFor: z.coerce.date().optional()
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  scheduledFor: z.coerce.date().optional(),
  status: taskStatusSchema.optional()
});
