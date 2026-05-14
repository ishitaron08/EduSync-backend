import { model, Schema, Types } from "mongoose";
import { dayValues } from "./schemaV2Enums";

const timetableSlotSchema = new Schema(
  {
    day: { type: String, enum: dayValues, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    section: { type: Types.ObjectId, ref: "Section" },
    className: { type: String, required: true, trim: true },
    room: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true }
  },
  { _id: false }
);

const studentTimetableSchema = new Schema(
  {
    year: { type: Number, required: true },
    // V3
    term: { 
      type: String, 
      enum: {
        values: ["spring", "summer", "fall", "winter"],
        message: '{VALUE} is not a valid value for term'
      },
      required: [true, 'term is required'] 
    },
    student: { type: Types.ObjectId, ref: "User", required: true },
    slots: { type: [timetableSlotSchema], default: [] }
  },
  { timestamps: true, collection: "studentTimetables" }
);

// V3
studentTimetableSchema.index({ student: 1, term: 1, year: 1 }, { unique: true });
studentTimetableSchema.index({ "slots.teacher": 1 });

export const StudentTimetable = model("StudentTimetable", studentTimetableSchema);
