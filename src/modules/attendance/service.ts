import { attendanceRepository } from "./attendance.queries";
import { Enrollment } from "../../models/Enrollment";
import { AppError } from "../common/common.utiles";
import {
  authorizeTeacherForAttendanceSlot,
  createOrReuseAttendanceSession,
  getAttendanceDayRange
} from "./session.service";

export const attendanceService = {
  async markAttendance(payload: Record<string, unknown>, teacherId: string) {
    const studentId = String(payload.student ?? "");
    const sectionId = String(payload.section ?? "");
    const slotKey = String(payload.slotKey ?? "");
    const { start, end } = getAttendanceDayRange(payload.sessionDate instanceof Date || typeof payload.sessionDate === "string" ? payload.sessionDate : new Date());

    await authorizeTeacherForAttendanceSlot({ teacherId, sectionId, slotKey });

    const enrollment = await Enrollment.findOne({ student: studentId, section: sectionId }).lean();
    if (!enrollment) {
      throw new AppError("Student is not enrolled in this section", 403);
    }

    const session = await createOrReuseAttendanceSession({
      teacherId,
      sectionId,
      slotKey,
      mode: "manual"
    });

    const record = await attendanceRepository.upsertForDaySlot({
      ...payload, 
      teacher: teacherId,
      student: studentId,
      section: sectionId,
      slotKey,
      sessionDate: start,
      dayEnd: end,
      qrSession: session._id
    });

    return {
      ...(typeof (record as any).toObject === "function" ? (record as any).toObject() : record),
      session: {
        _id: session._id,
        mode: session.mode,
        status: session.status,
        expiresAt: session.expiresAt
      }
    };
  }
};
