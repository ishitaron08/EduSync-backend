import { z } from "zod";
import { Types } from "mongoose";
import { courseModerationStatusValues } from "../../models/Course";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid id" });

export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  role: z.enum(["admin", "teacher", "student"]).optional(),
  q: z.string().trim().min(1).max(120).optional()
});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminCourseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(courseModerationStatusValues).optional(),
  q: z.string().trim().min(1).max(120).optional()
});

export type AdminCourseListQuery = z.infer<typeof adminCourseListQuerySchema>;

export const adminCourseStatusBodySchema = z.object({
  status: z.enum(courseModerationStatusValues)
});

export type AdminCourseStatusBody = z.infer<typeof adminCourseStatusBodySchema>;

export const adminCourseStatusEnvelope = z.object({
  body: adminCourseStatusBodySchema,
  params: z.object({ id: objectId }),
  query: z.any()
});

export const adminUserListEnvelope = z.object({
  body: z.any(),
  params: z.any(),
  query: adminUserListQuerySchema
});

export const adminCourseListEnvelope = z.object({
  body: z.any(),
  params: z.any(),
  query: adminCourseListQuerySchema
});

export const adminStudentSnapshotEnvelope = z.object({
  body: z.any(),
  params: z.object({ id: objectId }),
  query: z.any()
});

// Section students enrollment validators
export const adminSectionStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  q: z.string().trim().min(1).max(120).optional()
});

export type AdminSectionStudentsQuery = z.infer<typeof adminSectionStudentsQuerySchema>;

export const adminAddStudentsBodySchema = z.object({
  studentIds: z.array(objectId).min(1).max(100)
});

export type AdminAddStudentsBody = z.infer<typeof adminAddStudentsBodySchema>;

export const adminSectionStudentsEnvelope = z.object({
  body: z.any(),
  params: z.object({ id: objectId }),
  query: adminSectionStudentsQuerySchema
});

export const adminAddStudentsEnvelope = z.object({
  body: adminAddStudentsBodySchema,
  params: z.object({ id: objectId }),
  query: z.any()
});

export const adminRemoveStudentEnvelope = z.object({
  body: z.any(),
  params: z.object({ id: objectId, studentId: objectId }),
  query: z.any()
});

// Section create/update with students
export const adminSectionBodySchema = z.object({
  sectionCode: z.string().trim().min(1).max(50),
  term: z.enum(["fall", "spring", "summer", "winter"]),
  year: z.number().int().min(2000).max(2100),
  capacity: z.number().int().min(1).max(500),
  course: objectId,
  students: z.array(objectId).optional()
});

export type AdminSectionBody = z.infer<typeof adminSectionBodySchema>;

export const adminCreateSectionEnvelope = z.object({
  body: adminSectionBodySchema,
  params: z.any(),
  query: z.any()
});

export const adminUpdateSectionEnvelope = z.object({
  body: adminSectionBodySchema,
  params: z.object({ id: objectId }),
  query: z.any()
});
