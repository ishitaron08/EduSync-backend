import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { scanQrAttendanceSession } from "./session.service";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { Enrollment } from "../../models/Enrollment";
import { Section } from "../../models/Section";
import { Timetable } from "../../models/Timetable";

export const scanQrAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user?.id;
  const { token } = req.body;

  if (!token) {
    return void res.status(400).json({ message: "QR Token is required" });
  }

  const result = await scanQrAttendanceSession({
    studentId: String(studentId),
    token: String(token)
  });

  res.json({
    message: result.message,
    alreadyMarked: result.alreadyMarked,
    attendance: result.record,
    session: {
      _id: result.session._id,
      section: result.session.section,
      slotKey: result.session.slotKey,
      status: result.session.status,
      expiresAt: result.session.expiresAt
    }
  });
});

/**
 * GET /student/attendance/history
 * Returns paginated attendance records for the logged-in student.
 * Query params: sectionId?, from?, to?, page?, limit?
 */
export const getStudentAttendanceHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = String(req.user!.id);
  const { sectionId, from, to, page = "1", limit = "20" } = req.query;

  const filter: Record<string, unknown> = { student: studentId };

  if (sectionId && typeof sectionId === "string") {
    filter.section = sectionId;
  }

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from && typeof from === "string") dateFilter.$gte = new Date(from);
    if (to && typeof to === "string") dateFilter.$lte = new Date(to);
    if (Object.keys(dateFilter).length) filter.sessionDate = dateFilter;
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [records, total] = await Promise.all([
    AttendanceRecord.find(filter)
      .sort({ sessionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: "section",
        select: "sectionCode course",
        populate: { path: "course", select: "name code" }
      })
      .populate("teacher", "name")
      .lean(),
    AttendanceRecord.countDocuments(filter)
  ]);

  res.json({
    records,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * GET /student/attendance/stats
 * Returns attendance statistics for the logged-in student:
 * - overall percentage
 * - per-section breakdown
 * - weekly trend (last 4 weeks)
 */
export const getStudentAttendanceStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = String(req.user!.id);

  // Get all attendance records for this student
  const allRecords = await AttendanceRecord.find({ student: studentId })
    .select("section slotKey status sessionDate")
    .lean();

  const totalSessions = allRecords.length;
  const presentCount = allRecords.filter((r: any) => r.status === "present").length;
  const overallPercentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

  // Per-section breakdown
  const sectionMap = new Map<string, { total: number; present: number }>();
  for (const record of allRecords) {
    const secId = String((record as any).section);
    if (!sectionMap.has(secId)) sectionMap.set(secId, { total: 0, present: 0 });
    const entry = sectionMap.get(secId)!;
    entry.total++;
    if ((record as any).status === "present") entry.present++;
  }

  // Enrich section data with course info
  const enrollment = await Enrollment.findOne({ student: studentId })
    .populate({
      path: "section",
      select: "sectionCode course",
      populate: { path: "course", select: "name code" }
    })
    .lean();

  // Get all sections the student has attendance in
  const sectionIds = Array.from(sectionMap.keys());

  // Fetch section details for all sections with records
  const sections = await Section.find({ _id: { $in: sectionIds } })
    .populate("course", "name code")
    .select("sectionCode course")
    .lean();

  const sectionLookup = new Map(sections.map((s: any) => [String(s._id), s]));

  const perSection = Array.from(sectionMap.entries()).map(([secId, data]) => {
    const sec = sectionLookup.get(secId) as any;
    return {
      sectionId: secId,
      sectionCode: sec?.sectionCode || "Unknown",
      courseName: sec?.course?.name || "Unknown",
      courseCode: sec?.course?.code || "",
      total: data.total,
      present: data.present,
      percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
    };
  });

  // Weekly trend (last 4 weeks)
  const now = new Date();
  const weeklyTrend: { weekStart: string; weekEnd: string; total: number; present: number; percentage: number }[] = [];

  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7 + now.getDay()));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekRecords = allRecords.filter((r: any) => {
      const d = new Date(r.sessionDate);
      return d >= weekStart && d <= weekEnd;
    });

    const weekPresent = weekRecords.filter((r: any) => r.status === "present").length;

    weeklyTrend.push({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      total: weekRecords.length,
      present: weekPresent,
      percentage: weekRecords.length > 0 ? Math.round((weekPresent / weekRecords.length) * 100) : 0
    });
  }

  // Count total expected sessions (from timetable slots)
  // This gives a more accurate picture if the student missed entire days
  let totalExpectedSessions: number | null = null;
  if (enrollment) {
    const sectionId = String((enrollment as any).section?._id || (enrollment as any).section);
    const timetable = await Timetable.findOne({ section: sectionId }).select("slots").lean();
    if (timetable && (timetable as any).slots) {
      // Each slot represents one session per week
      totalExpectedSessions = (timetable as any).slots.length;
    }
  }

  res.json({
    overall: {
      totalRecorded: totalSessions,
      present: presentCount,
      absent: totalSessions - presentCount,
      percentage: overallPercentage,
      totalExpectedPerWeek: totalExpectedSessions
    },
    perSection,
    weeklyTrend
  });
});
