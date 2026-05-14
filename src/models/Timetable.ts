import { model, Schema, Types } from "mongoose";

const slotSchema = new Schema(
  {
    day: {
      type: String,
      enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      required: true
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    className: { type: String, required: true },
    room: { type: String, required: true },
    subject: { type: String, required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true }
  },
  { _id: false }
);

const timetableSchema = new Schema(
  {
    section: { type: Types.ObjectId, ref: "Section", required: true },
    term: {
      type: String,
      enum: ["spring", "summer", "fall", "winter"],
      required: true,
      default: "fall"
    },
    year: { type: Number, required: true },
    slots: { type: [slotSchema], default: [] }
  },
  { timestamps: true, collection: "timetables" }
);

timetableSchema.index({ section: 1, term: 1, year: 1 }, { unique: true });
timetableSchema.index({ "slots.teacher": 1 });

export const Timetable = model("Timetable", timetableSchema);
