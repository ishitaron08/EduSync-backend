import { model, Schema, Types } from "mongoose";

const rewardTransactionSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true, index: true },
    points: { type: Number, required: true, min: 1 },
    source: {
      type: String,
      enum: ["syllabus_task", "subtopic_bonus", "student_task", "assessment", "manual"],
      required: true
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Bonus", "Standard"],
      default: "Standard"
    },
    description: { type: String, trim: true, default: "" },
    referenceType: { type: String, trim: true, default: "" },
    referenceId: { type: String, trim: true, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: "rewardTransactions" }
);

rewardTransactionSchema.index({ student: 1, createdAt: -1 });
rewardTransactionSchema.index({ source: 1, referenceId: 1 });

export const RewardTransaction = model("RewardTransaction", rewardTransactionSchema);
