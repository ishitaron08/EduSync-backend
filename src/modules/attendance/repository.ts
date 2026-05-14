import { AttendanceRecord } from "../../models/AttendanceRecord";

export const attendanceRepository = {
  create(payload: Record<string, unknown>) {
    return AttendanceRecord.create(payload as any);
  },

  async upsertForDaySlot(payload: Record<string, unknown>) {
    const dayEnd = payload.dayEnd;
    const update = { ...payload };
    delete update.dayEnd;

    const existing = await (AttendanceRecord as any).findOne({
      student: update.student,
      section: update.section,
      slotKey: update.slotKey,
      sessionDate: {
        $gte: update.sessionDate,
        $lte: dayEnd
      }
    });

    if (existing) {
      existing.set(update);
      return existing.save();
    }

    return AttendanceRecord.create(update as any);
  }
};
