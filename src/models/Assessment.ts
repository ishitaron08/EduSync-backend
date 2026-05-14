import { model, Schema, Types } from "mongoose";

const questionSchema = new Schema(
  {
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    correctOptionIndex: { type: Number },
    marks: { type: Number, default: 1, min: 0 }
  },
  { _id: false }
);

const assessmentSchema = new Schema(
  {
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["mcq", "written"], required: true },
    status: { type: String, enum: ["draft", "published", "closed"], default: "draft" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    questions: { type: [questionSchema], default: [] },
    fileUrl: { type: String }, // For written question papers
    rubric: { type: String } // For manual grading
  },
  { timestamps: true, collection: "assessments" }
);

assessmentSchema.index({ teacher: 1, section: 1, createdAt: -1 });
assessmentSchema.index({ section: 1, status: 1, startTime: 1 });

export const Assessment = model("Assessment", assessmentSchema);
