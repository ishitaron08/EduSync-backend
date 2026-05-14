import { model, Schema, Types } from "mongoose";

const answerSchema = new Schema(
  {
    questionIndex: { type: Number, required: true },
    selectedOptionIndex: { type: Number },
    textAnswer: { type: String },
    fileUrl: { type: String }, // For uploaded image answers
    marksAwarded: { type: Number } // For manual teacher grading
  },
  { _id: false }
);

const assessmentAttemptSchema = new Schema(
  {
    assessment: { type: Types.ObjectId, ref: "Assessment", required: true },
    student: { type: Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["in_progress", "submitted", "graded"], default: "in_progress" },
    startedAt: { type: Date, required: true },
    submittedAt: { type: Date },
    score: { type: Number, default: 0, min: 0 },
    maxScore: { type: Number, default: 0, min: 0 },
    answers: { type: [answerSchema], default: [] }
  },
  { timestamps: true, collection: "assessmentAttempts" }
);

assessmentAttemptSchema.index({ assessment: 1, student: 1 }, { unique: true });
assessmentAttemptSchema.index({ student: 1, createdAt: -1 });

export const AssessmentAttempt = model("AssessmentAttempt", assessmentAttemptSchema);
