import { model, Schema, Types } from "mongoose";

const goalProgressHistorySchema = new Schema(
  {
    goal: { type: Types.ObjectId, ref: "StudentGoal", required: [true, 'goal is required'] },
    student: { type: Types.ObjectId, ref: "User", required: [true, 'student is required'] },
    recordedAt: { type: Date, required: [true, 'recordedAt is required'], default: Date.now },
    progress: { type: Number, required: [true, 'progress is required'], min: [0, 'progress cannot be negative'], max: [100, 'progress cannot exceed 100'] },
    tasksCompleted: { type: Number, required: [true, 'tasksCompleted is required'], min: [0, 'tasksCompleted cannot be negative'] },
    pointsEarned: { type: Number, required: [true, 'pointsEarned is required'], min: [0, 'pointsEarned cannot be negative'] }
  },
  { timestamps: false, collection: "goalProgressHistory" }
);

// V3
goalProgressHistorySchema.index({ goal: 1, recordedAt: -1 });
goalProgressHistorySchema.index({ student: 1, recordedAt: -1 });
goalProgressHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 15552000 }); // TTL index - 180 days

export default model("GoalProgressHistory", goalProgressHistorySchema);
