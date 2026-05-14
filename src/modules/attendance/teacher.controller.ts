import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { Enrollment } from "../../models/Enrollment";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import {
  authorizeTeacherForAttendanceSlot,
  findAttendanceSessionForStatus,
  generateQrAttendanceSession,
  getAttendanceDayRange
} from "./session.service";

export const generateQrAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const teacherId = String(req.user!.id);
  const { sectionId, slotKey } = req.body;

  if (!sectionId || !slotKey) {
    return void res.status(400).json({ message: "sectionId and slotKey are required" });
  }

  const session = await generateQrAttendanceSession({
    teacherId,
    sectionId: String(sectionId),
    slotKey: String(slotKey)
  });

  res.json(session);
});

export const getAttendanceStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const teacherId = String(req.user!.id);
  const { sectionId, slotKey } = req.query;

  if (!sectionId || typeof sectionId !== "string") {
    return void res.status(400).json({ message: "sectionId is required" });
  }
  if (!slotKey || typeof slotKey !== "string") {
    return void res.status(400).json({ message: "slotKey is required" });
  }

  await authorizeTeacherForAttendanceSlot({ teacherId, sectionId, slotKey });

  const enrollments = await Enrollment.find({ section: sectionId })
    .populate("student", "name email")
    .sort({ enrolledAt: 1 })
    .lean();

  res.json({
    students: enrollments
      .map((enrollment: any) => enrollment.student)
      .filter(Boolean)
  });
});

export const getLiveAttendanceStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sectionId, slotKey, sessionDate } = req.query;
  
  if (!sectionId || typeof sectionId !== "string" || !slotKey || typeof slotKey !== "string" || !sessionDate || typeof sessionDate !== "string") {
    return void res.status(400).json({ message: "Missing required query parameters" });
  }

  const teacherId = String(req.user!.id);
  await authorizeTeacherForAttendanceSlot({ teacherId, sectionId, slotKey });

  const { start, end } = getAttendanceDayRange(sessionDate);

  const records = await AttendanceRecord.find({
    section: sectionId,
    slotKey,
    sessionDate: { $gte: start, $lte: end }
  }).populate("student", "name email");

  const session = await findAttendanceSessionForStatus({
    teacherId,
    sectionId,
    slotKey,
    sessionDate: start
  });

  const scannedStudents = records.map((r: any) => ({
    _id: r.student._id,
    name: r.student.name,
    email: r.student.email,
    status: r.status,
    timestamp: r.createdAt
  }));

  res.json({
    session: session
      ? {
          _id: session._id,
          mode: session.mode,
          status: session.status,
          expiresAt: session.expiresAt
        }
      : null,
    scannedStudents,
    records: scannedStudents
  });
});
