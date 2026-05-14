import { z } from "zod";

export const recommendationInputSchema = z.object({
  student_year: z.number().int().min(1).max(8),
  goal_type: z.string(),
  free_time_duration: z.number().min(15),
  completion_rate: z.number().min(0).max(1),
  difficulty_preference: z.enum(["easy", "medium", "hard"])
});

export const recommendationV2InputSchema = z.object({
  studentContext: z.object({
    academicYear: z.number().int().min(1).max(8)
  }),
  goalContext: z.object({
    goalType: z.string().min(1),
    difficultyPreference: z.enum(["easy", "medium", "hard"])
  }),
  availabilityContext: z.object({
    freeMinutesToday: z.number().min(0),
    freeSlotCountToday: z.number().int().min(0)
  }),
  progressContext: z.object({
    completionRate: z.number().min(0).max(1),
    completedTasks: z.number().int().min(0),
    totalTasks: z.number().int().min(0)
  }),
  preferences: z.object({
    preferredSessionMinutes: z.number().int().min(10).max(240).optional(),
    focusAreas: z.array(z.string().min(1)).optional()
  }).optional()
});
