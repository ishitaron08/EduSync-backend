import { model, Schema, Types } from "mongoose";
import { taskStatusValues } from "./schemaV2Enums";

const studentTaskSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goal: { type: Types.ObjectId, ref: "StudentGoal", required: false },
    section: { type: Types.ObjectId, ref: "Section" },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    status: { type: String, enum: taskStatusValues, default: "pending" },
    durationMinutes: { type: Number, required: true, min: 1 },
    scheduledFor: { type: Date },
    basePoints: { type: Number, default: 20 },
    pointsAwarded: { type: Number, default: 0 },
    completedAt: { type: Date },
    // V3
    libraryTask: { type: Types.ObjectId, ref: "TaskLibrary", default: null },
    mlScore: { type: Number, min: [0, 'mlScore cannot be negative'], max: [1, 'mlScore cannot exceed 1'] },
    timelinessFactor: { type: Number, min: [0, 'timelinessFactor cannot be negative'], default: 1.0 }
  },
  { timestamps: true, collection: "studentTasks" }
);
studentTaskSchema.index({ student: 1, status: 1 });
studentTaskSchema.index({ goal: 1 });
studentTaskSchema.index({ section: 1 });
studentTaskSchema.index({ scheduledFor: 1 });

// V3
studentTaskSchema.index({ libraryTask: 1, status: 1 });
studentTaskSchema.index({ student: 1, scheduledFor: 1 });

export const StudentTask = model("StudentTask", studentTaskSchema);
