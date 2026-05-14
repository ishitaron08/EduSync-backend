import { model, Schema, Types } from "mongoose";
import { difficultyValues, goalTypeValues } from "./schemaV2Enums";

const studentGoalSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goalType: { type: String, enum: goalTypeValues, required: true },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    presetKey: { type: String, trim: true, default: null },
    isCustom: { type: Boolean, default: false },
    isSelected: { type: Boolean, default: false },
    targetDate: { type: Date, required: true },
    difficultyPreference: { type: String, enum: difficultyValues, default: "medium" },
    progress: { type: Number, default: 0, min: 0, max: 100 }
  },
  { timestamps: true, collection: "studentGoals" }
);

studentGoalSchema.index({ student: 1, targetDate: 1 });
studentGoalSchema.index({ student: 1, isSelected: 1 });

export const StudentGoal = model("StudentGoal", studentGoalSchema);
