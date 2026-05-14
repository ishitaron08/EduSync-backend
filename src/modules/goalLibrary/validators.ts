import { z } from "zod";

/**
 * Validates the body for POST /student/goal-library.
 * The regex allows letters, numbers, spaces, and common punctuation
 * while blocking HTML/script injection characters.
 */
export const selectGoalSchema = z.object({
  title: z
    .string("title is required")
    .trim()
    .min(3, "Goal must be at least 3 characters")
    .max(80, "Goal must be 80 characters or fewer")
    .regex(
      /^[a-zA-Z0-9 ,.\-()&/]+$/,
      "Goal contains invalid characters. Use letters, numbers, spaces, and basic punctuation."
    )
});
