import { randomBytes } from "crypto";
import { AttendanceSessionToken } from "../../models/AttendanceSessionToken";
import { attendanceRepository } from "./attendance.queries";
import { AppError } from "../common/common.utiles";

const TOKEN_TTL_MS = 5 * 60 * 1000;

export const attendanceTokenService = {
  async issueToken(payload: {
    teacher: string;
    student: string;
    section: string;
    slotKey: string;
    sessionDate: Date;
  }) {
    const token = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const record = await AttendanceSessionToken.create({
      ...payload,
      token,
      expiresAt
    });
    return {
      token: record.token,
      expiresAt: record.expiresAt
    };
  },
  async consumeToken(payload: { token: string; studentId: string }) {
    const tokenDoc = await AttendanceSessionToken.findOne({
      token: payload.token,
      student: payload.studentId,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() }
    });
    if (!tokenDoc) {
      throw new AppError("Invalid or expired attendance token", 400);
    }
    tokenDoc.consumedAt = new Date();
    await tokenDoc.save();
    return attendanceRepository.create({
      student: tokenDoc.student,
      teacher: tokenDoc.teacher,
      section: tokenDoc.section,
      sessionDate: tokenDoc.sessionDate,
      slotKey: tokenDoc.slotKey,
      status: "present"
    });
  }
};
