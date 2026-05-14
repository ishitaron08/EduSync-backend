import { model, Schema, Types } from "mongoose";

const attendanceSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    className: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ["present", "absent"], required: true }
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

export const Attendance = model("Attendance", attendanceSchema);
