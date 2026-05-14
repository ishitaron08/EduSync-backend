import { model, Schema, Types } from "mongoose";

const syllabusTaskSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    type: {
      type: String,
      enum: ["read", "practice", "build", "revise", "assess"],
      default: "practice"
    },
    estimatedMinutes: { type: Number, default: 30, min: 5, max: 240 },
    resourceHint: { type: String, trim: true, default: "" },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    pointsAwarded: { type: Number, default: 0, min: 0 },
    checklistCompleted: { type: [Number], default: [] },
    studyNote: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const syllabusSubtopicSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    order: { type: Number, required: true, min: 1 },
    estimatedHours: { type: Number, default: 2, min: 1, max: 80 },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    bonusAwarded: { type: Boolean, default: false },
    bonusAwardedAt: { type: Date },
    tasks: { type: [syllabusTaskSchema], default: [] }
  },
  { _id: false }
);

const syllabusTopicSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    level: {
      type: String,
      enum: ["basic", "intermediate", "advanced"],
      required: true
    },
    order: { type: Number, required: true, min: 1 },
    completedAt: { type: Date },
    acknowledgedAt: { type: Date },
    subtopics: { type: [syllabusSubtopicSchema], default: [] }
  },
  { _id: false }
);

const syllabusPlanSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goal: { type: Types.ObjectId, ref: "StudentGoal", required: true },
    goalTitle: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["generating", "ready", "failed"],
      default: "generating"
    },
    geminiModel: { type: String, trim: true, default: "" },
    errorMessage: { type: String, trim: true, default: "" },
    topics: { type: [syllabusTopicSchema], default: [] },
    generatedAt: { type: Date }
  },
  { timestamps: true, collection: "syllabusPlans" }
);

syllabusPlanSchema.index({ student: 1, goal: 1 }, { unique: true });
syllabusPlanSchema.index({ student: 1, status: 1 });

export const SyllabusPlan = model("SyllabusPlan", syllabusPlanSchema);
