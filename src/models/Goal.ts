import { model, Schema, Types } from "mongoose";

const goalSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goalType: {
      type: String,
      enum: ["placement", "exam", "skill_development"],
      required: true
    },
    targetDate: { type: Date, required: true },
    difficultyPreference: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium"
    },
    progress: { type: Number, default: 0 }
  },
  { timestamps: true }
);

goalSchema.index({ student: 1, goalType: 1 });

export const Goal = model("Goal", goalSchema);
