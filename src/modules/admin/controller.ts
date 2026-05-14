import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { createAuditLog } from "../../services/auditService";
import { adminService } from "./service";
import { dashboardService } from "./dashboard.service";
import { Section } from "../../models/Section";
import {
  AdminCourseListQuery,
  AdminCourseStatusBody,
  AdminUserListQuery,
  AdminSectionStudentsQuery,
  AdminAddStudentsBody,
  AdminSectionBody
} from "./validators";

export const getOverviewMetrics = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const metrics = await adminService.getOverviewMetrics();
    res.json(metrics);
  }
);

export const getDashboardMetrics = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const metrics = await dashboardService.getDashboardMetrics();
    res.json(metrics);
  }
);

export const listUsersAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const query = req.query as unknown as AdminUserListQuery;
    const result = await adminService.listUsers({
      page: query.page,
      limit: query.limit,
      role: query.role,
      q: query.q
    });
    res.json(result);
  }
);

export const listCoursesAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const query = req.query as unknown as AdminCourseListQuery;
    const result = await adminService.listCourses({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q
    });
    res.json(result);
  }
);

export const setCourseStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = req.user!;
    const courseId = String(req.params.id);
    const body = req.body as AdminCourseStatusBody;
    const course = await adminService.setCourseStatus(courseId, body.status);
    await createAuditLog({
      actor: String(actor.id),
      actorRole: actor.role,
      action: "admin.course.moderate",
      resource: "Course",
      metadata: { courseId, status: body.status }
    });
    res.json(course);
  }
);

export const getStudentSnapshot = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const studentId = String(req.params.id);
    const snapshot = await adminService.getStudentSnapshot(studentId);
    res.json(snapshot);
  }
);

export const listSectionsAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sections = await Section.find()
    .populate("course", "code name")
    .lean();
  
  // Get enrollment counts for each section
  const sectionsWithCounts = await Promise.all(
    sections.map(async (sec) => {
      const count = await adminService.getSectionStudents({ sectionId: String(sec._id), limit: 0 }).then(r => r.total).catch(() => 0);
      return { ...sec, enrolledCount: count };
    })
  );
  
  res.json(sectionsWithCounts);
});

export const createSectionAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const body = req.body as AdminSectionBody;
  
  // Create section
  if (body.students && body.students.length > 0) {
    await adminService.assertStudents(body.students);
  }

  const section = await Section.create({
    sectionCode: body.sectionCode,
    term: body.term,
    year: body.year,
    capacity: body.capacity,
    course: body.course
  });
  
  // Add students if provided
  if (body.students && body.students.length > 0) {
    await adminService.addStudentsToSection(String(section._id), body.students);
  }
  
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.section.create",
    resource: "Section",
    metadata: { sectionId: section._id, studentCount: body.students?.length || 0 }
  });
  
  res.status(201).json(section);
});

export const updateSectionAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const body = req.body as AdminSectionBody;
  const sectionId = String(req.params.id);

  if (body.students && body.students.length > 0) {
    await adminService.assertStudents(body.students);
  }
  
  const section = await Section.findByIdAndUpdate(
    sectionId,
    {
      sectionCode: body.sectionCode,
      term: body.term,
      year: body.year,
      capacity: body.capacity,
      course: body.course
    },
    { returnDocument: "after" }
  );
  
  if (!section) {
    res.status(404).json({ error: "Section not found" });
    return;
  }
  
  // Update students if provided
  if (body.students !== undefined) {
    // Get current enrolled students
    const currentEnrollments = await adminService.getSectionStudents({ sectionId, limit: 1000 });
    const currentStudentIds = currentEnrollments.students.map((e: any) => String(e.student._id));
    
    // Determine students to add and remove
    const toAdd = body.students.filter(id => !currentStudentIds.includes(id));
    const toRemove = currentStudentIds.filter(id => !body.students!.includes(id));
    
    // Add new students
    if (toAdd.length > 0) {
      await adminService.addStudentsToSection(sectionId, toAdd);
    }
    
    // Remove students
    for (const studentId of toRemove) {
      await adminService.removeStudentFromSection(sectionId, studentId);
    }
  }
  
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.section.update",
    resource: "Section",
    metadata: { sectionId }
  });
  
  res.json(section);
});

export const deleteSectionAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const sectionId = String(req.params.id);
  
  // Delete all enrollments first
  await adminService.removeAllStudentsFromSection(sectionId);
  
  // Delete section
  await Section.findByIdAndDelete(sectionId);
  
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.section.delete",
    resource: "Section",
    metadata: { sectionId }
  });
  
  res.status(204).send();
});

// Section student enrollment endpoints
export const getSectionStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query as unknown as AdminSectionStudentsQuery;
  const result = await adminService.getSectionStudents({
    sectionId: String(req.params.id),
    page: query.page,
    limit: query.limit,
    q: query.q
  });
  res.json(result);
});

export const addStudentsToSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const body = req.body as AdminAddStudentsBody;
  const sectionId = String(req.params.id);
  const result = await adminService.addStudentsToSection(sectionId, body.studentIds);
  
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.section.students.add",
    resource: "Section",
    metadata: { sectionId, studentIds: body.studentIds }
  });
  
  res.json(result);
});

export const removeStudentFromSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const sectionId = String(req.params.id);
  const studentId = String(req.params.studentId);
  const result = await adminService.removeStudentFromSection(sectionId, studentId);
  
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.section.students.remove",
    resource: "Section",
    metadata: { sectionId, studentId }
  });
  
  res.json(result);
});

export const listStudentsForSelection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string | undefined;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  
  const result = await adminService.listStudentsForSelection({ q, page, limit });
  res.json(result);
});
