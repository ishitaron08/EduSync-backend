import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { redisClient } from "../../config/redis";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { Enrollment } from "../../models/Enrollment";
import { QrSession } from "../../models/QrSession";
import { Section } from "../../models/Section";
import { Timetable } from "../../models/Timetable";
import { AppError } from "../common/common.utiles";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const QR_TTL_SECONDS = 300;

export type AttendanceSessionMode = "qr" | "manual";

export function buildSlotKey(slot: { day: string; startTime: string; endTime: string }): string {
  return `${slot.day}:${slot.startTime}-${slot.endTime}`;
}

export function startOfDay(value: Date | string): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date | string): Date {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function redisSessionKey(qrSessionId: string): string {
  return `attendance:session:${qrSessionId}`;
}

function assertRedisAvailable() {
  if (redisClient.status !== "ready" && redisClient.status !== "connecting") {
    throw new AppError("Redis connection unavailable", 500);
  }
}

export async function authorizeTeacherForAttendanceSlot(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
}) {
  const section = await Section.findById(params.sectionId).lean();
  if (!section) {
    throw new AppError("Section not found", 404);
  }

  const timetable = await Timetable.findOne({ section: params.sectionId, "slots.teacher": params.teacherId })
    .select("slots")
    .lean();

  if (!timetable) {
    throw new AppError("No timetable slot is assigned to this teacher for the selected section", 403);
  }

  const slot = timetable.slots?.find((entry: any) => {
    const slotTeacher = String(entry.teacher?._id ?? entry.teacher);
    return slotTeacher === params.teacherId && buildSlotKey(entry) === params.slotKey;
  });

  if (!slot) {
    throw new AppError("Teacher is not assigned to this section timetable slot", 403);
  }

  return slot;
}

async function expireOldSessions(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
  mode?: AttendanceSessionMode;
  now: Date;
}) {
  const query: Record<string, unknown> = {
    teacher: params.teacherId,
    section: params.sectionId,
    slotKey: params.slotKey,
    status: "active",
    expiresAt: { $lte: params.now }
  };
  if (params.mode) query.mode = params.mode;
  await QrSession.updateMany(query, { $set: { status: "expired" } });
}

async function findReusableSession(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
  mode: AttendanceSessionMode;
  now: Date;
}) {
  return QrSession.findOne({
    teacher: params.teacherId,
    section: params.sectionId,
    slotKey: params.slotKey,
    mode: params.mode,
    status: "active",
    expiresAt: { $gt: params.now }
  }).sort({ generatedAt: -1 });
}

export async function createOrReuseAttendanceSession(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
  mode: AttendanceSessionMode;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  await expireOldSessions({ ...params, now });

  const existing = await findReusableSession({ ...params, now });
  if (existing) {
    if (params.mode === "qr") {
      existing.set({
        generatedAt: now,
        expiresAt: new Date(now.getTime() + QR_TTL_SECONDS * 1000),
        status: "active"
      });
      return existing.save();
    }
    return existing;
  }

  const expiresAt = params.mode === "qr"
    ? new Date(now.getTime() + QR_TTL_SECONDS * 1000)
    : endOfDay(now);

  return QrSession.create({
    teacher: params.teacherId,
    section: params.sectionId,
    slotKey: params.slotKey,
    mode: params.mode,
    generatedAt: now,
    expiresAt,
    status: "active",
    scannedBy: []
  });
}

export async function generateQrAttendanceSession(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
}) {
  const slot = await authorizeTeacherForAttendanceSlot(params);
  const qrSession = await createOrReuseAttendanceSession({ ...params, mode: "qr" });
  const qrSessionId = String(qrSession._id);
  const sessionDate = startOfDay(new Date()).toISOString();

  const payload = {
    qrSessionId,
    teacherId: params.teacherId,
    sectionId: params.sectionId,
    slotKey: params.slotKey,
    sessionDate,
    className: slot.className,
    subject: slot.subject,
    type: "class_attendance"
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });

  assertRedisAvailable();
  await redisClient.setex(redisSessionKey(qrSessionId), QR_TTL_SECONDS, token);

  return {
    token,
    qrSessionId,
    sectionId: params.sectionId,
    slotKey: params.slotKey,
    expiresAt: qrSession.expiresAt
  };
}

export async function scanQrAttendanceSession(params: {
  studentId: string;
  token: string;
}) {
  let payload: any;
  try {
    payload = jwt.verify(params.token, JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired QR code", 400);
  }

  const { qrSessionId, teacherId, sectionId, slotKey, sessionDate } = payload;
  if (!qrSessionId || !teacherId || !sectionId || !slotKey || !sessionDate) {
    throw new AppError("QR code payload is incomplete", 400);
  }

  assertRedisAvailable();
  const activeToken = await redisClient.get(redisSessionKey(String(qrSessionId)));
  if (!activeToken || activeToken !== params.token) {
    throw new AppError("QR Session has expired or is no longer active", 400);
  }

  const qrSession = await QrSession.findById(qrSessionId);
  if (!qrSession || qrSession.status !== "active" || qrSession.mode !== "qr" || qrSession.expiresAt.getTime() <= Date.now()) {
    throw new AppError("QR Session has expired or is no longer active", 400);
  }

  if (String(qrSession.teacher) !== String(teacherId) || String(qrSession.section) !== String(sectionId) || qrSession.slotKey !== String(slotKey)) {
    throw new AppError("QR code does not match the active attendance session", 400);
  }

  const enrollment = await Enrollment.findOne({ student: params.studentId, section: sectionId }).lean();
  if (!enrollment) {
    throw new AppError("You are not enrolled in this section", 403);
  }

  await authorizeTeacherForAttendanceSlot({
    teacherId: String(teacherId),
    sectionId: String(sectionId),
    slotKey: String(slotKey)
  });

  const sessionDay = startOfDay(String(sessionDate));
  const existingRecord = await AttendanceRecord.findOne({
    student: params.studentId,
    section: sectionId,
    slotKey,
    sessionDate: {
      $gte: sessionDay,
      $lte: endOfDay(sessionDay)
    }
  });

  if (existingRecord) {
    return {
      alreadyMarked: true,
      message: "Attendance already recorded for this session.",
      record: existingRecord,
      session: qrSession
    };
  }

  const record = await AttendanceRecord.create({
    student: params.studentId,
    teacher: teacherId,
    section: sectionId,
    sessionDate: sessionDay,
    slotKey,
    status: "present",
    qrSession: qrSession._id
  });

  await QrSession.updateOne(
    { _id: qrSession._id, "scannedBy.student": { $ne: new Types.ObjectId(params.studentId) } },
    { $push: { scannedBy: { student: params.studentId, scannedAt: new Date() } } }
  );

  return {
    alreadyMarked: false,
    message: "Attendance successfully recorded!",
    record,
    session: qrSession
  };
}

export async function findAttendanceSessionForStatus(params: {
  teacherId: string;
  sectionId: string;
  slotKey: string;
  sessionDate: Date;
}) {
  await expireOldSessions({ ...params, now: new Date() });
  return QrSession.findOne({
    teacher: params.teacherId,
    section: params.sectionId,
    slotKey: params.slotKey,
    status: "active",
    generatedAt: {
      $gte: startOfDay(params.sessionDate),
      $lte: endOfDay(params.sessionDate)
    }
  }).sort({ generatedAt: -1 }).lean();
}

export function getAttendanceDayRange(value: Date | string) {
  return {
    start: startOfDay(value),
    end: endOfDay(value)
  };
}
