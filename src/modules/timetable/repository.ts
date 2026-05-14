import { Types } from "mongoose";
import { Timetable } from "../../models/Timetable";
import { Enrollment } from "../../models/Enrollment";

export const timetableRepository = {
  upsertSectionTimetable(payload: Record<string, unknown>) {
    const section = payload.section ?? payload.sectionId;
    const term = payload.term ?? "fall";
    const year = payload.year;
    return Timetable.findOneAndUpdate(
      { section, term, year } as any,
      { $set: { ...payload, section, term }, $unset: { sectionId: "", student: "" } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
  },

  /**
   * Returns all timetable documents that contain at least one slot assigned
   * to this teacher. Each document's slots array is filtered to only the
   * teacher's own slots so the caller never sees other teachers' classes.
   */
  async findByTeacher(teacherId: string) {
    const teacherOid = new Types.ObjectId(teacherId);

    const timetables = await Timetable.find({ "slots.teacher": teacherOid })
      .populate({
        path: "section",
        select: "sectionCode term year course",
        populate: { path: "course", select: "code name" }
      })
      .populate("slots.teacher", "name email")
      .sort({ year: -1 })
      .lean();

    // Keep only the slots that belong to this teacher
    return timetables.map((tt) => ({
      ...tt,
      slots: tt.slots.filter(
        (s) => String((s.teacher as any)?._id ?? s.teacher) === teacherId
      )
    }));
  },

  addExtraSession(timetableId: string, slot: Record<string, unknown>) {
    return Timetable.findByIdAndUpdate(
      timetableId,
      { $push: { slots: slot } },
      { returnDocument: "after" }
    );
  },

  // ── Student helpers ──────────────────────────────────────────────────────

  async findStudentEnrollment(studentId: string) {
    return Enrollment.findOne({ student: studentId })
      .populate({
        path: "section",
        // term + year are required so findMasterTimetableBySection can filter
        // to the correct semester instead of returning a stale one.
        select: "sectionCode term year course",
        populate: { path: "course", select: "code name" }
      })
      .sort({ enrolledAt: -1 })
      .lean();
  },

  /**
   * Looks up the master timetable for a section.
   * term + year are passed from the enrolled section so we always return
   * the correct semester — without them MongoDB would return whichever
   * document it finds first (natural order), which could be a stale semester.
   */
  async findMasterTimetableBySection(sectionId: string, term?: string, year?: number) {
    const filter: Record<string, unknown> = { section: new Types.ObjectId(sectionId) };
    if (term) filter.term = term;
    if (year) filter.year = year;
    return Timetable.findOne(filter)
      .populate("slots.teacher", "name email")
      .lean();
  }
};
