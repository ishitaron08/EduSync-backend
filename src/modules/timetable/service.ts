import { Types } from "mongoose";
import { AppError } from "../common/common.utiles";
import { timetableRepository } from "./timetable.queries";
import { Slot } from "./timetable.types";

function toMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function toTime(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

const SCHOOL_START = "08:00";
const SCHOOL_END  = "16:00";
const WEEK_DAYS   = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

export function detectFreeSlots(slots: Slot[], dayStart = SCHOOL_START, dayEnd = SCHOOL_END) {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const daySlots = grouped.get(slot.day) ?? [];
    daySlots.push(slot);
    grouped.set(slot.day, daySlots);
  }

  const freeSlots: Array<Slot & { duration: number }> = [];
  for (const [day, daySlots] of grouped.entries()) {
    const sorted = [...daySlots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    let cursor = toMinutes(dayStart);
    const end   = toMinutes(dayEnd);

    for (const slot of sorted) {
      const start   = toMinutes(slot.startTime);
      const slotEnd = toMinutes(slot.endTime);
      if (start > cursor) {
        freeSlots.push({ day, startTime: toTime(cursor), endTime: toTime(start), duration: start - cursor });
      }
      cursor = Math.max(cursor, slotEnd);
    }
    if (cursor < end) {
      freeSlots.push({ day, startTime: toTime(cursor), endTime: toTime(end), duration: end - cursor });
    }
  }
  return freeSlots;
}

/** Build a full Mon–Fri grid merging booked slots with "Free Period" gaps. */
function mergeWithFreeSlots(scheduledSlots: any[]): any[] {
  const result: any[] = [];

  for (const day of WEEK_DAYS) {
    const daySlots = scheduledSlots
      .filter((s) => s.day === day)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    let cursor    = toMinutes(SCHOOL_START);
    const endOfDay = toMinutes(SCHOOL_END);

    for (const slot of daySlots) {
      const slotStart = toMinutes(slot.startTime);
      const slotEnd   = toMinutes(slot.endTime);

      if (slotStart > cursor) {
        result.push({
          day,
          startTime: toTime(cursor),
          endTime: toTime(slotStart),
          subject: "Free Period",
          className: "",
          room: "",
          isFreePeriod: true,
          durationMinutes: slotStart - cursor
        });
      }

      result.push({ ...slot, isFreePeriod: false });
      cursor = Math.max(cursor, slotEnd);
    }

    if (cursor < endOfDay) {
      result.push({
        day,
        startTime: toTime(cursor),
        endTime: toTime(endOfDay),
        subject: "Free Period",
        className: "",
        room: "",
        isFreePeriod: true,
        durationMinutes: endOfDay - cursor
      });
    }
  }

  return result;
}

/** All-free grid returned when a student has no section or no timetable. */
function generateFreePeriodSlots(): Slot[] {
  return WEEK_DAYS.map((day) => ({
    day,
    startTime: SCHOOL_START,
    endTime: SCHOOL_END,
    subject: "Free Period",
    className: "",
    room: ""
  } as Slot));
}

export const timetableService = {
  // ── Admin ────────────────────────────────────────────────────────────────

  async createTimetable(payload: Record<string, unknown>) {
    if (!payload.term) payload.term = "fall";
    payload.section = payload.section ?? payload.sectionId;
    const slots = (payload.slots as Slot[] | undefined) ?? [];
    if (this.hasInternalConflicts(slots)) {
      throw new AppError("Timetable has overlapping slots", 409);
    }
    return timetableRepository.upsertSectionTimetable(payload);
  },

  // ── Teacher ──────────────────────────────────────────────────────────────

  /**
   * Returns one schedule entry per timetable document the teacher is assigned
   * to. Each entry contains a full Mon–Fri grid with the teacher's booked
   * slots merged with "Free Period" gaps.
   */
  async getTeacherSchedule(teacherId: string) {
    const timetables = await timetableRepository.findByTeacher(teacherId);

    if (!timetables || timetables.length === 0) {
      return { schedules: [] };
    }

    const schedules = timetables.map((tt) => {
      const section = tt.section as any;
      // `term` is a required field on the Timetable schema so it is always
      // present. The previous `(tt as any).term` cast hid this from TypeScript
      // and the "—" fallback would have produced ugly "— 2024" display strings.
      const term = (tt as { term?: string }).term ?? "fall";
      return {
        timetableId: String(tt._id),
        sectionCode: section?.sectionCode ?? "—",
        courseName:  section?.course?.name ?? section?.course?.code ?? "—",
        term,
        year:        tt.year,
        slots:       mergeWithFreeSlots(tt.slots)
      };
    });

    return { schedules };
  },

  /** Legacy — kept for backward compat; delegates to getTeacherSchedule. */
  getTeacherTimetable(teacherId: string) {
    return this.getTeacherSchedule(teacherId);
  },

  // ── Student ──────────────────────────────────────────────────────────────

  async getStudentTimetable(studentId: string) {
    const enrollment = await timetableRepository.findStudentEnrollment(studentId);

    if (!enrollment || !enrollment.section) {
      return {
        slots: generateFreePeriodSlots(),
        hasSection: false,
        message: "You are not enrolled in any section. All time slots are free periods."
      };
    }

    const sectionId = (enrollment.section as any)._id ?? enrollment.section;
    // Pass term + year from the enrolled section so we always fetch the
    // correct semester's timetable, not just whichever MongoDB finds first.
    const sectionTerm: string | undefined = (enrollment.section as any).term;
    const sectionYear: number | undefined = (enrollment.section as any).year;
    const masterTimetable = await timetableRepository.findMasterTimetableBySection(
      String(sectionId),
      sectionTerm,
      sectionYear
    );

    if (!masterTimetable || !masterTimetable.slots?.length) {
      return {
        slots: generateFreePeriodSlots(),
        hasSection: true,
        sectionInfo: {
          sectionCode: (enrollment.section as any).sectionCode,
          course:      (enrollment.section as any).course
        },
        message: "No timetable configured for your section. All time slots are free periods."
      };
    }

    return {
      slots: mergeWithFreeSlots(masterTimetable.slots),
      hasSection: true,
      sectionInfo: {
        sectionCode: (enrollment.section as any).sectionCode,
        course:      (enrollment.section as any).course
      },
      year: masterTimetable.year
    };
  },

  async getStudentFreeSlots(studentId: string) {
    const timetable = await this.getStudentTimetable(studentId);
    return timetable.slots.filter((s: any) => s.isFreePeriod);
  },

  // ── Shared ───────────────────────────────────────────────────────────────

  addExtraSession(timetableId: string, slot: Record<string, unknown>, teacherId: string) {
    return timetableRepository.addExtraSession(timetableId, { ...slot, teacher: teacherId });
  },

  hasInternalConflicts(slots: Slot[]) {
    const grouped = new Map<string, Slot[]>();
    for (const slot of slots) {
      const daySlots = grouped.get(slot.day) ?? [];
      daySlots.push(slot);
      grouped.set(slot.day, daySlots);
    }
    for (const daySlots of grouped.values()) {
      const sorted = [...daySlots].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (toMinutes(sorted[i - 1].endTime) > toMinutes(sorted[i].startTime)) return true;
      }
    }
    return false;
  }
};
