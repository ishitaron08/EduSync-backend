import { model, Schema, Types } from "mongoose";

const taskSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goal: { type: Types.ObjectId, ref: "Goal", required: false },
    title: { type: String, required: true },
    category: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium"
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending"
    },
    durationMinutes: { type: Number, required: true },
    basePoints: { type: Number, default: 20 },
    pointsAwarded: { type: Number, default: 0 },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

taskSchema.index({ student: 1, status: 1 });

export const Task = model("Task", taskSchema);
