import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { timetableService } from "./timetable.service";
import { createAuditLog } from "../../services/auditService";
import { Section } from "../../models/Section";

export const adminCreateTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const timetable = await timetableService.createTimetable(body);
  
  const sectionId = String(body.section ?? body.sectionId ?? "");
  let sectionCode = "Unknown";
  if (sectionId) {
    const section = await Section.findById(sectionId).select("sectionCode").lean();
    if (section) {
      sectionCode = section.sectionCode;
    }
  }
  
  await createAuditLog({
    actor: String(req.user!.id),
    actorRole: req.user!.role,
    action: "admin.timetable.upsert",
    resource: "Timetable",
    metadata: {
      sectionId,
      sectionCode,
      term: body.term ?? "fall",
      year: body.year
    }
  });
  res.status(201).json(timetable);
});

export const teacherTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await timetableService.getTeacherSchedule(String(req.user!.id));
  res.json(result);
});

export const addExtraSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { timetableId, slot } = req.body as { timetableId: string; slot: Record<string, unknown> };
  const timetable = await timetableService.addExtraSession(timetableId, slot, String(req.user!.id));
  res.json(timetable);
});

export const studentTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timetable = await timetableService.getStudentTimetable(String(req.user!.id));
  res.json(timetable);
});

export const studentFreeSlots = asyncHandler(async (req: AuthRequest, res: Response) => {
  const freeSlots = await timetableService.getStudentFreeSlots(String(req.user!.id));
  res.json(freeSlots);
});
