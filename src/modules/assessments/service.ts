import { Assessment } from "../../models/Assessment";
import { AssessmentAttempt } from "../../models/AssessmentAttempt";
import { Enrollment } from "../../models/Enrollment";
import { Section } from "../../models/Section";
import { Timetable } from "../../models/Timetable";
import { AppError } from "../common/common.utiles";

type AnswerInput = Array<{ questionIndex: number; selectedOptionIndex?: number; textAnswer?: string; fileUrl?: string }>;

function maxScoreFor(assessment: any): number {
  return (assessment.questions ?? []).reduce((sum: number, question: any) => sum + Number(question.marks ?? 0), 0);
}

function stripAnswerKeysFromAssessment(assessment: any) {
  const plain = typeof assessment.toObject === "function" ? assessment.toObject() : { ...assessment };
  plain.questions = (plain.questions ?? []).map((question: any) => {
    const { correctOptionIndex: _correctOptionIndex, ...safeQuestion } = question;
    return safeQuestion;
  });
  return plain;
}

function assertAssessmentWindow(assessment: any, now = new Date()) {
  if (now < new Date(assessment.startTime) || now > new Date(assessment.endTime)) {
    throw new AppError("Assessment is not open", now > new Date(assessment.endTime) ? 410 : 400);
  }
}

function validatePublishableAssessment(assessment: any) {
  const now = new Date();
  if (new Date(assessment.endTime) <= now) {
    throw new AppError("Assessment end time has already passed", 400);
  }
  if (new Date(assessment.endTime) <= new Date(assessment.startTime)) {
    throw new AppError("Assessment end time must be after start time", 400);
  }
  if (assessment.type === "mcq") {
    if (!assessment.questions?.length) {
      throw new AppError("MCQ assessment must have at least one question", 400);
    }
    assessment.questions.forEach((question: any, index: number) => {
      if (typeof question.correctOptionIndex !== "number") {
        throw new AppError(`MCQ question ${index + 1} is missing a correct answer`, 400);
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new AppError(`MCQ question ${index + 1} needs at least two options`, 400);
      }
      if (question.correctOptionIndex >= question.options.length) {
        throw new AppError(`MCQ question ${index + 1} correct answer is outside the option list`, 400);
      }
      if (Number(question.marks ?? 0) <= 0) {
        throw new AppError(`MCQ question ${index + 1} marks must be greater than zero`, 400);
      }
    });
  }
  if (assessment.type === "written") {
    const hasQuestionPaper = Boolean(assessment.fileUrl?.trim());
    const hasWrittenQuestions = Array.isArray(assessment.questions) && assessment.questions.length > 0;
    if (!hasQuestionPaper && !hasWrittenQuestions) {
      throw new AppError("Written assessment requires at least one typed question or an uploaded question paper", 400);
    }
    if (!assessment.rubric?.trim()) {
      throw new AppError("Written assessment requires a grading rubric", 400);
    }
    assessment.questions?.forEach((question: any, index: number) => {
      if (!question.prompt?.trim()) {
        throw new AppError(`Written question ${index + 1} is missing a prompt`, 400);
      }
      if (Number(question.marks ?? 0) <= 0) {
        throw new AppError(`Written question ${index + 1} marks must be greater than zero`, 400);
      }
    });
  }
}

function computeMcqScore(assessment: any, answers: AnswerInput) {
  let score = 0;
  let maxScore = 0;
  for (const [index, question] of (assessment.questions ?? []).entries()) {
    const marks = Number(question.marks ?? 1);
    maxScore += marks;
    if (typeof question.correctOptionIndex !== "number") {
      console.warn(`assessment.missing_correct_answer assessment=${assessment._id} question=${index}`);
      continue;
    }
    const submitted = answers.find((answer) => answer.questionIndex === index);
    if (typeof submitted?.selectedOptionIndex === "number" && submitted.selectedOptionIndex === question.correctOptionIndex) {
      score += marks;
    }
  }
  return { score, maxScore };
}

async function assertStudentCanAccessAssessment(assessment: any, studentId: string) {
  const enrollment = await Enrollment.findOne({ student: studentId, section: assessment.section }).lean();
  if (!enrollment) {
    throw new AppError("Assessment not available for this student", 403);
  }
}

export const assessmentsService = {
  async create(payload: Record<string, unknown>, teacherId: string) {
    const sectionId = String(payload.section ?? "");
    const section = await Section.findById(sectionId).lean();
    if (!section) {
      throw new AppError("Section not found", 404);
    }
    const teachesSection = await Timetable.exists({ section: sectionId, "slots.teacher": teacherId });
    if (!teachesSection) {
      throw new AppError("Teacher is not assigned to this section timetable", 403);
    }
    return Assessment.create({ ...payload, section: sectionId, teacher: teacherId, status: "draft" });
  },

  listByTeacher(teacherId: string) {
    return Assessment.find({ teacher: teacherId }).sort({ createdAt: -1 });
  },

  async updateDraft(assessmentId: string, teacherId: string, payload: Record<string, unknown>) {
    const assessment = await Assessment.findOne({ _id: assessmentId, teacher: teacherId });
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    if (assessment.status !== "draft") {
      throw new AppError("Only draft assessments can be updated", 409);
    }
    if (payload.section) {
      const teachesSection = await Timetable.exists({ section: String(payload.section), "slots.teacher": teacherId });
      if (!teachesSection) {
        throw new AppError("Teacher is not assigned to this section timetable", 403);
      }
    }
    assessment.set(payload);
    return assessment.save();
  },

  async deleteDraft(assessmentId: string, teacherId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, teacher: teacherId });
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    if (assessment.status !== "draft") {
      throw new AppError("Only draft assessments can be deleted", 409);
    }
    const attempts = await AssessmentAttempt.countDocuments({ assessment: assessmentId });
    if (attempts > 0) {
      throw new AppError("Assessment has attempts and cannot be deleted", 409);
    }
    await Assessment.deleteOne({ _id: assessmentId });
    return { success: true };
  },

  async listPublishedForStudent(studentId: string) {
    const enrollments = await Enrollment.find({ student: studentId }).select("section").lean();
    const sectionIds = enrollments.map((enrollment) => enrollment.section);
    return Assessment.find({
      section: { $in: sectionIds },
      status: "published"
    })
      .select("-questions.correctOptionIndex")
      .sort({ startTime: 1 })
      .lean();
  },

  async publish(assessmentId: string, teacherId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, teacher: teacherId });
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    validatePublishableAssessment(assessment);
    assessment.status = "published";
    await assessment.save();
    return Assessment.findById(assessment._id);
  },

  async startAttempt(assessmentId: string, studentId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, status: "published" });
    if (!assessment) {
      throw new AppError("Assessment not available", 404);
    }
    await assertStudentCanAccessAssessment(assessment, studentId);
    assertAssessmentWindow(assessment);

    const existing = await AssessmentAttempt.findOne({ assessment: assessmentId, student: studentId });
    if (existing) {
      if (existing.status !== "in_progress") {
        throw new AppError("Assessment attempt has already been submitted", 409);
      }
      return existing;
    }
    return AssessmentAttempt.create({
      assessment: assessmentId,
      student: studentId,
      startedAt: new Date(),
      status: "in_progress",
      maxScore: maxScoreFor(assessment)
    });
  },

  async getTakePayload(assessmentId: string, studentId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, status: "published" });
    if (!assessment) {
      throw new AppError("Assessment not available", 404);
    }
    await assertStudentCanAccessAssessment(assessment, studentId);
    assertAssessmentWindow(assessment);

    const attempt = await AssessmentAttempt.findOne({ assessment: assessmentId, student: studentId, status: "in_progress" });
    if (!attempt) {
      throw new AppError("No active attempt. Start the test first.", 409);
    }
    const now = Date.now();
    const durationEnd = new Date(attempt.startedAt).getTime() + Number(assessment.durationMinutes) * 60 * 1000;
    const hardEnd = new Date(assessment.endTime).getTime();
    const endsAt = new Date(Math.min(durationEnd, hardEnd));
    return {
      assessment: stripAnswerKeysFromAssessment(assessment),
      attempt: {
        id: String(attempt._id),
        status: attempt.status,
        startedAt: attempt.startedAt,
        endsAt,
        timeRemainingSeconds: Math.max(0, Math.floor((endsAt.getTime() - now) / 1000))
      }
    };
  },

  async submitAttempt(assessmentId: string, studentId: string, answers: AnswerInput) {
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    await assertStudentCanAccessAssessment(assessment, studentId);
    if (new Date() > new Date(assessment.endTime)) {
      throw new AppError("Assessment window has closed", 410);
    }

    const attempt = await AssessmentAttempt.findOne({ assessment: assessmentId, student: studentId, status: "in_progress" });
    if (!attempt) {
      throw new AppError("No active attempt. Start the test first.", 409);
    }

    const scoreMeta = assessment.type === "mcq"
      ? computeMcqScore(assessment, answers)
      : { score: 0, maxScore: maxScoreFor(assessment) };

    attempt.set({
      status: assessment.type === "mcq" ? "graded" : "submitted",
      submittedAt: new Date(),
      answers,
      score: scoreMeta.score,
      maxScore: scoreMeta.maxScore
    });
    return attempt.save();
  },

  listResults(studentId: string) {
    return AssessmentAttempt.find({ student: studentId })
      .populate({ path: "assessment", select: "-questions.correctOptionIndex" })
      .sort({ updatedAt: -1 });
  },

  async teacherAnalytics(assessmentId: string, teacherId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, teacher: teacherId });
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    const attempts = await AssessmentAttempt.find({ assessment: assessmentId, status: { $in: ["submitted", "graded"] } })
      .populate("student", "name email")
      .lean();
    const scores = attempts.map((attempt) => Number(attempt.score ?? 0));
    const maxScores = attempts.map((attempt) => Number(attempt.maxScore ?? 0)).filter(Boolean);
    const attemptsMaxScore = maxScores.length ? maxScores.reduce((acc, value) => acc + value, 0) / maxScores.length : maxScoreFor(assessment);
    const max = scores.length ? Math.max(...scores) : 0;
    const min = scores.length ? Math.min(...scores) : 0;
    const avg = scores.length ? scores.reduce((acc, val) => acc + val, 0) / scores.length : 0;
    const variance = scores.length ? scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / scores.length : 0;
    const stdDev = Math.sqrt(variance);

    const questionAccuracy = [];
    if (assessment.type === "mcq" && assessment.questions) {
      for (const [index, question] of assessment.questions.entries()) {
        let correctCount = 0;
        let totalAttempted = 0;
        attempts.forEach(attempt => {
          const ans = attempt.answers?.find((a: any) => a.questionIndex === index);
          if (ans) {
            totalAttempted++;
            if (ans.selectedOptionIndex === question.correctOptionIndex) correctCount++;
          }
        });
        questionAccuracy.push({
          questionIndex: index,
          prompt: question.prompt,
          accuracy: totalAttempted ? (correctCount / totalAttempted) * 100 : 0
        });
      }
    }

    const enrollments = await Enrollment.find({ section: assessment.section })
      .populate("student", "name email")
      .lean();
    const attemptsByStudent = new Map<string, any>();
    for (const attempt of attempts) {
      const student = attempt.student as any;
      if (student?._id) {
        attemptsByStudent.set(String(student._id), attempt);
      }
    }

    const assessmentMaxScore = maxScoreFor(assessment);
    const studentResults = enrollments
      .map((enrollment: any) => {
        const student = enrollment.student;
        const attempt = student?._id ? attemptsByStudent.get(String(student._id)) : null;
        const score = Number(attempt?.score ?? 0);
        const maxScore = Number(attempt?.maxScore ?? assessmentMaxScore);
        const questionBreakdown = (assessment.questions ?? []).map((question: any, index: number) => {
          const answer = attempt?.answers?.find((item: any) => item.questionIndex === index);
          const questionMax = Number(question.marks ?? 0);
          const marksAwarded =
            assessment.type === "mcq"
              ? answer?.selectedOptionIndex === question.correctOptionIndex ? questionMax : 0
              : Number(answer?.marksAwarded ?? 0);
          return {
            questionIndex: index,
            prompt: question.prompt,
            marksAwarded,
            maxMarks: questionMax
          };
        });

        return {
          studentId: String(student?._id ?? enrollment.student),
          name: student?.name ?? "Unknown student",
          email: student?.email ?? "",
          status: attempt?.status ?? "not_started",
          score,
          maxScore,
          percent: maxScore ? (score / maxScore) * 100 : 0,
          submittedAt: attempt?.submittedAt ?? null,
          questionBreakdown
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const teacherAssessments = await Assessment.find({ teacher: teacherId })
      .select("title type startTime")
      .sort({ startTime: 1 })
      .lean();
    const attemptAverages = await AssessmentAttempt.aggregate([
      { $match: { assessment: { $in: teacherAssessments.map((item) => item._id) }, status: { $in: ["submitted", "graded"] } } },
      {
        $group: {
          _id: "$assessment",
          avg: { $avg: "$score" },
          avgMaxScore: { $avg: "$maxScore" },
          attempts: { $sum: 1 }
        }
      }
    ]);
    const averagesByAssessment = new Map(attemptAverages.map((item: any) => [String(item._id), item]));
    const testAverages = teacherAssessments.map((item: any) => {
      const average = averagesByAssessment.get(String(item._id));
      const avgScore = Number(average?.avg ?? 0);
      const avgMaxScore = Number(average?.avgMaxScore ?? maxScoreFor(item));
      return {
        assessmentId: String(item._id),
        title: item.title,
        type: item.type,
        startTime: item.startTime,
        attempts: Number(average?.attempts ?? 0),
        avgScore,
        avgMaxScore,
        avgPercent: avgMaxScore ? (avgScore / avgMaxScore) * 100 : 0
      };
    });

    return {
      totalAttempts: attempts.length,
      max,
      min,
      avg,
      avgPercent: attemptsMaxScore ? (avg / attemptsMaxScore) * 100 : 0,
      attemptsMaxScore,
      stdDev,
      questionAccuracy,
      studentResults,
      testAverages
    };
  },

  async teacherExportCsv(assessmentId: string, teacherId: string) {
    const assessment = await Assessment.findOne({ _id: assessmentId, teacher: teacherId });
    if (!assessment) {
      throw new AppError("Assessment not found", 404);
    }
    const attempts = await AssessmentAttempt.find({ assessment: assessmentId }).populate("student", "name email");
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      const escaped = text.replace(/"/g, '""');
      return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    };
    const header = ["studentName", "studentEmail", "status", "score", "maxScore", "submittedAt"].map(escapeCsv).join(",");
    const rows = attempts.map((attempt: any) => [
      attempt.student?.name ?? "",
      attempt.student?.email ?? "",
      attempt.status,
      attempt.score ?? 0,
      attempt.maxScore ?? 0,
      attempt.submittedAt?.toISOString() ?? ""
    ].map(escapeCsv).join(","));
    return [header, ...rows].join("\r\n");
  },

  async listAllForAdmin(page = 1, limit = 25) {
    const normalizedPage = Math.max(1, Number(page));
    const normalizedLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (normalizedPage - 1) * normalizedLimit;
    const [assessments, total, attempts] = await Promise.all([
      Assessment.find().sort({ createdAt: -1 }).skip(skip).limit(normalizedLimit).lean(),
      Assessment.countDocuments(),
      AssessmentAttempt.aggregate([{ $group: { _id: "$assessment", attemptsCount: { $sum: 1 } } }])
    ]);
    const attemptMap = new Map<string, number>();
    for (const entry of attempts) {
      attemptMap.set(String(entry._id), Number(entry.attemptsCount ?? 0));
    }

    return {
      assessments: assessments.map((assessment: any) => ({
        ...assessment,
        attemptsCount: attemptMap.get(String(assessment._id)) ?? 0
      })),
      total,
      page: normalizedPage,
      limit: normalizedLimit
    };
  }
};
