import { model, Schema, Types } from "mongoose";

const syllabusTaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const syllabusSubtopicSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    tasks: { type: [syllabusTaskSchema], default: [] }
  },
  { _id: false }
);

const syllabusTopicSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
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
