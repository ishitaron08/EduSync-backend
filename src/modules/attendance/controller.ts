import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { attendanceService } from "./attendance.service";
import { attendanceTokenService } from "./attendance-token.service";

export const markAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const attendance = await attendanceService.markAttendance(req.body as Record<string, unknown>, String(req.user!.id));
  res.status(201).json(attendance);
});

export const issueAttendanceToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = req.body as { student: string; section: string; slotKey: string; sessionDate: Date };
  const token = await attendanceTokenService.issueToken({
    teacher: String(req.user!.id),
    student: payload.student,
    section: payload.section,
    slotKey: payload.slotKey,
    sessionDate: payload.sessionDate
  });
  res.status(201).json(token);
});

export const consumeAttendanceToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await attendanceTokenService.consumeToken({
    token: String((req.body as { token: string }).token),
    studentId: String(req.user!.id)
  });
  res.status(201).json(result);
});
