import { Types } from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler, AppError } from "../common/common.utiles";
import { Timetable } from "../../models/Timetable";
import { Section } from "../../models/Section";
import { User } from "../../models/User";

const VALID_TERMS = new Set(["spring", "summer", "fall", "winter"]);

function normalizeTerm(value: unknown): string {
  return typeof value === "string" && VALID_TERMS.has(value) ? value : "fall";
}

function objectIdFrom(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as { _id?: unknown; id?: unknown };
    if (typeof record._id === "string") return record._id;
    if (typeof record.id === "string") return record.id;
  }
  return "";
}

function normalizeSlots(slots: unknown[]) {
  return slots.map((slot) => {
    const record = slot as Record<string, unknown>;
    return {
      day: String(record.day ?? ""),
      startTime: String(record.startTime ?? ""),
      endTime: String(record.endTime ?? ""),
      className: String(record.className ?? ""),
      room: String(record.room ?? ""),
      subject: String(record.subject ?? ""),
      teacher: objectIdFrom(record.teacher)
    };
  });
}

function toMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function hasInternalConflicts(slots: Array<{ day: string; startTime: string; endTime: string }>): boolean {
  const grouped = new Map<string, Array<{ startTime: string; endTime: string }>>();
  for (const slot of slots) {
    const daySlots = grouped.get(slot.day) ?? [];
    daySlots.push(slot);
    grouped.set(slot.day, daySlots);
  }

  for (const daySlots of grouped.values()) {
    const sorted = daySlots.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      if (toMinutes(sorted[i - 1].endTime) > toMinutes(sorted[i].startTime)) {
        return true;
      }
    }
  }
  return false;
}

export const getMasterTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sectionId, term = "fall", year = new Date().getFullYear() } = req.query;
  if (!sectionId || typeof sectionId !== "string") {
    return void res.status(400).json({ message: "sectionId is required" });
  }
  const section = await Section.findById(sectionId).lean();
  if (!section) {
    throw new AppError("Section not found", 404);
  }
  const normalizedTerm = normalizeTerm(term);

  const timetable = await Timetable.findOne({
    section: new Types.ObjectId(sectionId),
    term: normalizedTerm,
    year: Number(year)
  }).populate("slots.teacher", "name email");

  if (!timetable) {
    return void res.json({ sectionId, slots: [] });
  }

  // Attach sectionId as a top-level string field so the frontend type contract
  // is unambiguous — the raw document only has `section` (ObjectId ref).
  const doc = timetable.toObject() as Record<string, unknown>;
  doc.sectionId = sectionId;
  res.json(doc);
});

export const updateMasterTimetable = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sectionId, term = "fall", slots, year = new Date().getFullYear() } = req.body;
  if (!sectionId || !slots || !Array.isArray(slots)) {
    return void res.status(400).json({ message: "sectionId and slots array are required" });
  }
  const normalizedSectionId = objectIdFrom(sectionId);
  if (!Types.ObjectId.isValid(normalizedSectionId)) {
    throw new AppError("sectionId must reference a section", 400);
  }

  const normalizedSlots = normalizeSlots(slots);
  const missingRequiredSlotFields = normalizedSlots.some((slot) =>
    !slot.day || !slot.startTime || !slot.endTime || !slot.className || !slot.room || !slot.subject || !slot.teacher
  );
  if (missingRequiredSlotFields) {
    throw new AppError("All timetable slots must include day, startTime, endTime, className, room, subject, and teacher", 400);
  }

  const section = await Section.findById(normalizedSectionId).lean();
  if (!section) {
    throw new AppError("Section not found", 404);
  }
  const normalizedTerm = normalizeTerm(term);
  const normalizedYear = Number(year);
  const teacherIds = Array.from(new Set(normalizedSlots.map((slot) => slot.teacher).filter(Boolean)));
  if (teacherIds.some((teacherId) => !Types.ObjectId.isValid(teacherId))) {
    throw new AppError("All timetable slots must reference teacher accounts", 400);
  }
  const teacherCount = await User.countDocuments({ _id: { $in: teacherIds }, role: "teacher" });
  if (teacherCount !== teacherIds.length) {
    throw new AppError("All timetable slots must reference teacher accounts", 400);
  }
  if (hasInternalConflicts(normalizedSlots)) {
    throw new AppError("Timetable has overlapping slots", 409);
  }

  // Conflict Detection
  for (const slot of normalizedSlots) {
    // Check Teacher Conflict
    const teacherConflict = await Timetable.findOne({
      section: { $ne: normalizedSectionId },
      term: normalizedTerm,
      year: normalizedYear,
      slots: {
        $elemMatch: {
          day: slot.day,
          startTime: { $lt: slot.endTime },
          endTime: { $gt: slot.startTime },
          teacher: slot.teacher
        }
      }
    });
    if (teacherConflict) {
      throw new AppError(`Teacher double booking detected on ${slot.day} at ${slot.startTime}`, 409);
    }

    // Check Room Conflict
    const roomConflict = await Timetable.findOne({
      section: { $ne: normalizedSectionId },
      term: normalizedTerm,
      year: normalizedYear,
      slots: {
        $elemMatch: {
          day: slot.day,
          startTime: { $lt: slot.endTime },
          endTime: { $gt: slot.startTime },
          room: slot.room
        }
      }
    });
    if (roomConflict) {
      throw new AppError(`Room ${slot.room} is already booked on ${slot.day} at ${slot.startTime}`, 409);
    }
  }

  let timetable = await Timetable.findOne({ section: normalizedSectionId, term: normalizedTerm, year: normalizedYear });
  if (!timetable) {
    timetable = new Timetable({ section: normalizedSectionId, term: normalizedTerm, year: normalizedYear });
  }
  
  timetable.set("slots", normalizedSlots);
  await timetable.save();

  // Return with populated teacher info
  const populatedTimetable = await Timetable.findById(timetable._id)
    .populate("slots.teacher", "name email");
  
  res.json(populatedTimetable);
});

export const listMasterTimetables = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timetables = await Timetable.find({ section: { $exists: true, $ne: null } })
    .populate({
      path: "section",
      select: "sectionCode course term year",
      populate: { path: "course", select: "code name" }
    })
    .populate("slots.teacher", "name email")
    .lean();
  const result = timetables.map(t => {
    const firstClassSlot = t.slots?.find(s => s.className);
    const section = t.section as any;
    const sectionId = section?._id ? String(section._id) : String(t.section);
    return {
      _id: t._id,
      sectionId,
      section,
      className: firstClassSlot ? firstClassSlot.className : section?.sectionCode ?? sectionId,
      term: t.term,
      year: t.year
    };
  });
  res.json(result);
});
