import { model, Schema, Types } from "mongoose";

const attendanceSessionTokenSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    student: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    slotKey: { type: String, required: true, trim: true },
    sessionDate: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date }
  },
  { timestamps: true, collection: "attendanceSessionTokens" }
);

attendanceSessionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AttendanceSessionToken = model("AttendanceSessionToken", attendanceSessionTokenSchema);
