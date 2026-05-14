import { z } from "zod";
import { objectIdSchema } from "../common/validation";

export const issueAttendanceTokenSchema = z.object({
  student: objectIdSchema,
  section: objectIdSchema,
  slotKey: z.string().min(1),
  sessionDate: z.coerce.date()
});

export const consumeAttendanceTokenSchema = z.object({
  token: z.string().min(8)
});
