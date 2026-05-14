import { model, Schema, Types } from "mongoose";

const taskLibrarySchema = new Schema(
  {
    title: { type: String, required: [true, 'title is required'], trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: [true, 'category is required'], trim: true },
    goalType: {
      type: String,
      enum: {
        values: ["placement", "academic", "skill_development"],
        message: '{VALUE} is not a valid value for goalType'
      },
      required: [true, 'goalType is required']
    },
    difficulty: {
      type: String,
      enum: {
        values: ["Easy", "Medium", "Hard"],
        message: '{VALUE} is not a valid value for difficulty'
      },
      required: [true, 'difficulty is required']
    },
    durationMinutes: { type: Number, required: [true, 'durationMinutes is required'], min: [1, 'durationMinutes cannot be less than 1'] },
    basePoints: { type: Number, required: [true, 'basePoints is required'], min: [1, 'basePoints cannot be less than 1'] },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    completionRate: { type: Number, default: 0, min: [0, 'completionRate cannot be negative'], max: [1, 'completionRate cannot exceed 1'] },
    totalAssigned: { type: Number, default: 0, min: [0, 'totalAssigned cannot be negative'] },
    totalCompleted: { type: Number, default: 0, min: [0, 'totalCompleted cannot be negative'] },
    createdBy: { type: Types.ObjectId, ref: "User", required: [true, 'createdBy is required'] }
  },
  { timestamps: true, collection: "taskLibrary" }
);

// V3
taskLibrarySchema.index({ goalType: 1, difficulty: 1, isActive: 1 });
taskLibrarySchema.index({ tags: 1 });
taskLibrarySchema.index({ completionRate: -1 });
taskLibrarySchema.index({ category: 1, isActive: 1 });

export default model("TaskLibrary", taskLibrarySchema);
