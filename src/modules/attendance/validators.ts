import { z } from "zod";
import { objectIdSchema } from "../common/validation";

export const attendanceSchema = z.object({
  student: objectIdSchema,
  section: objectIdSchema,
  sessionDate: z.coerce.date(),
  slotKey: z.string().min(1),
  className: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  status: z.enum(["present", "absent", "late", "excused"])
});
