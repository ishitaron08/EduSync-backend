import { z } from "zod";
import { objectIdSchema } from "../common/validation";

const questionSchema = z.object({
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).default([]),
  correctOptionIndex: z.number().int().min(0).optional(),
  marks: z.number().positive().default(1)
});

const assessmentBaseSchema = z.object({
  section: objectIdSchema,
  title: z.string().min(1),
  type: z.enum(["mcq", "written"]),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  durationMinutes: z.number().int().min(1),
  questions: z.array(questionSchema).default([]),
  fileUrl: z.string().trim().optional(),
  rubric: z.string().trim().optional()
});

function validateAssessmentPayload(value: z.infer<typeof assessmentBaseSchema>, ctx: z.RefinementCtx) {
  const now = new Date();
  if (value.endTime <= value.startTime) {
    ctx.addIssue({ code: "custom", message: "endTime must be after startTime", path: ["endTime"] });
  }
  if (value.endTime <= now) {
    ctx.addIssue({ code: "custom", message: "endTime must be in the future", path: ["endTime"] });
  }
  if (value.type === "mcq") {
    if (value.questions.length === 0) {
      ctx.addIssue({ code: "custom", message: "MCQ assessments need at least one question", path: ["questions"] });
    }
    value.questions.forEach((question, index) => {
      if (question.options.length < 2) {
        ctx.addIssue({ code: "custom", message: "MCQ questions need at least two options", path: ["questions", index, "options"] });
      }
      if (typeof question.correctOptionIndex !== "number") {
        ctx.addIssue({ code: "custom", message: "Correct option is required for MCQ questions", path: ["questions", index, "correctOptionIndex"] });
      } else if (question.correctOptionIndex >= question.options.length) {
        ctx.addIssue({ code: "custom", message: "Correct option must reference one of the options", path: ["questions", index, "correctOptionIndex"] });
      }
      if (question.marks <= 0) {
        ctx.addIssue({ code: "custom", message: "Question marks must be greater than zero", path: ["questions", index, "marks"] });
      }
    });
  }
  if (value.type === "written") {
    const hasQuestionPaper = Boolean(value.fileUrl?.trim());
    const hasWrittenQuestions = value.questions.length > 0;
    if (!hasQuestionPaper && !hasWrittenQuestions) {
      ctx.addIssue({ code: "custom", message: "Written assessments require at least one typed question or an uploaded question paper", path: ["questions"] });
    }
    if (!value.rubric?.trim()) {
      ctx.addIssue({ code: "custom", message: "Written assessments require a grading rubric", path: ["rubric"] });
    }
    value.questions.forEach((question, index) => {
      if (!question.prompt.trim()) {
        ctx.addIssue({ code: "custom", message: "Written question prompt is required", path: ["questions", index, "prompt"] });
      }
      if (question.marks <= 0) {
        ctx.addIssue({ code: "custom", message: "Question marks must be greater than zero", path: ["questions", index, "marks"] });
      }
    });
  }
}

export const createAssessmentSchema = assessmentBaseSchema.superRefine(validateAssessmentPayload);

export const submitAssessmentSchema = z.object({
  answers: z.array(z.object({
    questionIndex: z.number().int().min(0),
    selectedOptionIndex: z.number().int().min(0).optional(),
    textAnswer: z.string().optional(),
    fileUrl: z.string().optional()
  })).default([])
});

export const updateAssessmentSchema = assessmentBaseSchema.partial().superRefine((value, ctx) => {
  if (
    value.type !== undefined &&
    value.startTime !== undefined &&
    value.endTime !== undefined &&
    value.durationMinutes !== undefined &&
    value.questions !== undefined
  ) {
    validateAssessmentPayload(value as z.infer<typeof assessmentBaseSchema>, ctx);
  }
});
