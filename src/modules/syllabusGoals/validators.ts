import { z } from "zod";
import { objectIdSchema } from "../common/validation";

export const selectSyllabusGoalSchema = z.object({
  presetKey: z.enum(["academic_improvement", "placement_preparation", "skill_development"]).optional(),
  customGoalId: objectIdSchema.optional()
}).superRefine((value, ctx) => {
  if (!value.presetKey && !value.customGoalId) {
    ctx.addIssue({ code: "custom", message: "presetKey or customGoalId is required" });
  }
  if (value.presetKey && value.customGoalId) {
    ctx.addIssue({ code: "custom", message: "Choose either presetKey or customGoalId, not both" });
  }
});

export const createCustomSyllabusGoalSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  select: z.boolean().optional()
});

export const updateSyllabusProgressSchema = z.object({
  topicKey: z.string().trim().min(1),
  subtopicKey: z.string().trim().min(1),
  progressPercent: z.number().min(0).max(100)
});

export const completeSyllabusTaskSchema = z.object({
  topicKey: z.string().trim().min(1),
  subtopicKey: z.string().trim().min(1),
  taskKey: z.string().trim().min(1),
  checklistCompleted: z.array(z.number().int().min(0).max(12)).max(20).optional(),
  studyNote: z.string().max(5000).optional()
});

export const updateSyllabusTaskStudySchema = z.object({
  topicKey: z.string().trim().min(1),
  subtopicKey: z.string().trim().min(1),
  taskKey: z.string().trim().min(1),
  checklistCompleted: z.array(z.number().int().min(0).max(12)).max(20).optional(),
  studyNote: z.string().max(5000).optional()
});
