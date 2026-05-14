import { model, Schema, Types } from "mongoose";
import { dayValues, termValues } from "./schemaV2Enums";

const sectionScheduleSchema = new Schema(
  {
    day: { type: String, enum: dayValues, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    course: { type: Types.ObjectId, ref: "Course", required: true },
    term: { type: String, enum: termValues, required: true },
    year: { type: Number, required: true },
    sectionCode: { type: String, required: true, trim: true, uppercase: true },
    schedule: { type: [sectionScheduleSchema], default: [] },
    capacity: { type: Number, min: 1, default: 60 }
  },
  { timestamps: true, collection: "sections" }
);

sectionSchema.index({ course: 1, term: 1, year: 1, sectionCode: 1 }, { unique: true });

export const Section = model("Section", sectionSchema);
