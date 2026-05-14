import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { AppError, asyncHandler } from "../common/common.utiles";
import { assessmentsService } from "./service";
import { createAuditLog } from "../../services/auditService";

export const teacherCreateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await assessmentsService.create(req.body as Record<string, unknown>, String(req.user!.id));
  await createAuditLog({
    actor: String(req.user!.id),
    actorRole: req.user!.role,
    action: "teacher.assessment.create",
    resource: "Assessment",
    metadata: { assessmentId: String((assessment as any)._id), title: (assessment as any).title }
  });
  res.status(201).json(assessment);
});

export const teacherListAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessments = await assessmentsService.listByTeacher(String(req.user!.id));
  res.json(assessments);
});

export const teacherPublishAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await assessmentsService.publish(String(req.params.id), String(req.user!.id));
  if (!assessment) {
    throw new AppError("Assessment not found", 404);
  }
  await createAuditLog({
    actor: String(req.user!.id),
    actorRole: req.user!.role,
    action: "teacher.assessment.publish",
    resource: "Assessment",
    metadata: { assessmentId: String(req.params.id) }
  });
  res.json(assessment);
});

export const teacherUpdateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await assessmentsService.updateDraft(String(req.params.id), String(req.user!.id), req.body as Record<string, unknown>);
  await createAuditLog({
    actor: String(req.user!.id),
    actorRole: req.user!.role,
    action: "teacher.assessment.update",
    resource: "Assessment",
    metadata: { assessmentId: String(req.params.id) }
  });
  res.json(assessment);
});

export const teacherDeleteAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await assessmentsService.deleteDraft(String(req.params.id), String(req.user!.id));
  await createAuditLog({
    actor: String(req.user!.id),
    actorRole: req.user!.role,
    action: "teacher.assessment.delete",
    resource: "Assessment",
    metadata: { assessmentId: String(req.params.id) }
  });
  res.json(result);
});

export const teacherAssessmentAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const analytics = await assessmentsService.teacherAnalytics(String(req.params.id), String(req.user!.id));
  res.json(analytics);
});

export const teacherAssessmentExport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const csv = await assessmentsService.teacherExportCsv(String(req.params.id), String(req.user!.id));
  res.setHeader("content-type", "text/csv");
  res.setHeader("content-disposition", `attachment; filename="test_${String(req.params.id)}.csv"`);
  res.send(csv);
});

export const studentListAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessments = await assessmentsService.listPublishedForStudent(String(req.user!.id));
  res.json(assessments);
});

export const studentStartAssessmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const attempt = await assessmentsService.startAttempt(String(req.params.id), String(req.user!.id));
  res.status(201).json(attempt);
});

export const studentTakeAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await assessmentsService.getTakePayload(String(req.params.id), String(req.user!.id));
  res.json(payload);
});

export const studentSubmitAssessmentAttempt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { answers?: Array<{ questionIndex: number; selectedOptionIndex?: number; textAnswer?: string }> };
  const attempt = await assessmentsService.submitAttempt(String(req.params.id), String(req.user!.id), body.answers ?? []);
  res.json(attempt);
});

export const studentAssessmentResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const attempts = await assessmentsService.listResults(String(req.user!.id));
  res.json(attempts);
});

export const adminListAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessments = await assessmentsService.listAllForAdmin(Number(req.query.page ?? 1), Number(req.query.limit ?? 25));
  res.json(assessments);
});
