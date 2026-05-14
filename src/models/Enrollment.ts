import { model, Schema, Types } from "mongoose";

const enrollmentSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    enrolledAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: "enrollments" }
);

enrollmentSchema.index({ student: 1 }, { unique: true });
enrollmentSchema.index({ section: 1 });

export const Enrollment = model("Enrollment", enrollmentSchema);
