import { model, Schema, Types } from "mongoose";
import { attendanceStatusValues } from "./schemaV2Enums";

const attendanceRecordSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    sessionDate: { type: Date, required: true },
    slotKey: { type: String, required: true, trim: true },
    status: { type: String, enum: attendanceStatusValues, required: true },
    // V3
    qrSession: { type: Types.ObjectId, ref: "QrSession", default: null }
  },
  { timestamps: true, collection: "attendanceRecords" }
);

attendanceRecordSchema.index({ student: 1, section: 1, sessionDate: 1, slotKey: 1 }, { unique: true });
attendanceRecordSchema.index({ teacher: 1 });
attendanceRecordSchema.index({ sessionDate: 1 });

export const AttendanceRecord = model("AttendanceRecord", attendanceRecordSchema);
