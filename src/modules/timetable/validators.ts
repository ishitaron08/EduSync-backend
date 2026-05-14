import { z } from "zod";
import { daySchema, objectIdSchema, timeSchema } from "../common/validation";

export const adminCreateTimetableSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  term: z.enum(["spring", "summer", "fall", "winter"]).default("fall"),
  section: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
  slots: z.array(z.object({
    day: daySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    className: z.string().min(1),
    room: z.string().min(1),
    subject: z.string().min(1),
    teacher: objectIdSchema,
    section: objectIdSchema.optional()
  })).default([])
}).refine((value) => Boolean(value.section || value.sectionId), {
  message: "section or sectionId is required",
  path: ["section"]
});

export const extraSessionSchema = z.object({
  timetableId: objectIdSchema,
  slot: z.object({
    day: daySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    className: z.string().min(1),
    room: z.string().min(1),
    subject: z.string().min(1),
    section: objectIdSchema.optional()
  })
});
