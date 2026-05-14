import { model, Schema } from "mongoose";

export const courseModerationStatusValues = ["pending", "approved", "rejected"] as const;
export type CourseModerationStatus = (typeof courseModerationStatusValues)[number];

const courseSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    moderationStatus: {
      type: String,
      enum: courseModerationStatusValues,
      default: "pending",
      required: true
    }
  },
  { timestamps: true, collection: "courses" }
);

courseSchema.index({ code: 1 }, { unique: true });
courseSchema.index({ moderationStatus: 1, createdAt: -1 });

export const Course = model("Course", courseSchema);
