import { CourseModerationStatus } from "../../models/Course";
import { AppError } from "../common/common.utiles";
import { adminRepository } from "./repository";
import { Enrollment } from "../../models/Enrollment";
import { Section } from "../../models/Section";

const ROLES = ["admin", "teacher", "student"] as const;
type Role = (typeof ROLES)[number];

const COURSE_STATUSES = ["pending", "approved", "rejected"] as const;

const ASSESSMENT_STATUSES = ["draft", "published", "closed"] as const;

const ATTENDANCE_STATUSES = ["present", "absent", "late"] as const;

const TASK_STATUSES = ["pending", "in_progress", "completed"] as const;

async function assertStudents(studentIds: string[]) {
  const uniqueIds = Array.from(new Set(studentIds));
  const count = await adminRepository.countStudentsByIds(uniqueIds);
  if (count !== uniqueIds.length) {
    throw new AppError("One or more selected users are not student accounts", 400);
  }
  return uniqueIds;
}

function formatSectionLabel(section: any): string {
  if (!section) return "another section";
  const course = section.course;
  const courseLabel = course?.code || course?.name || "Course";
  return `${courseLabel} ${section.sectionCode ?? ""}`.trim();
}

function bucketCounts<K extends string>(
  rows: Array<{ _id: K | null | undefined; count: number }>,
  keys: readonly K[]
): Record<K, number> & { total: number } {
  const result = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  let total = 0;
  for (const row of rows) {
    total += row.count;
    if (row._id && (keys as readonly string[]).includes(row._id)) {
      result[row._id] += row.count;
    }
  }
  return { ...result, total };
}

export const adminService = {
  async getOverviewMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [usersAgg, coursesAgg, activeCourses, assessmentsAgg, auditLogs24h] =
      await Promise.all([
        adminRepository.countUsersByRole(),
        adminRepository.countCourses(),
        adminRepository.countActiveCourses(),
        adminRepository.countAssessmentsByStatus(),
        adminRepository.countAuditLogsSince(since)
      ]);

    return {
      users: bucketCounts<Role>(usersAgg, ROLES),
      courses: {
        ...bucketCounts<CourseModerationStatus>(coursesAgg, COURSE_STATUSES),
        active: activeCourses
      },
      assessments: bucketCounts(assessmentsAgg, ASSESSMENT_STATUSES),
      auditLogs24h,
      generatedAt: new Date().toISOString()
    };
  },

  async listUsers(params: {
    page?: number;
    limit?: number;
    role?: Role;
    q?: string;
  }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)));
    const skip = (page - 1) * limit;

    const [users, total] = await adminRepository.listUsers(
      { role: params.role, q: params.q },
      skip,
      limit
    );

    return { users, total, page, limit };
  },

  async listCourses(params: {
    page?: number;
    limit?: number;
    status?: CourseModerationStatus;
    q?: string;
  }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)));
    const skip = (page - 1) * limit;

    const [courses, total] = await adminRepository.listCourses(
      { status: params.status, q: params.q },
      skip,
      limit
    );

    return { courses, total, page, limit };
  },

  async setCourseStatus(courseId: string, status: CourseModerationStatus) {
    const updated = await adminRepository.setCourseModerationStatus(courseId, status);
    if (!updated) {
      throw new AppError("Course not found", 404);
    }
    return updated;
  },

  async getStudentSnapshot(studentId: string) {
    const student = await adminRepository.findStudent(studentId);
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    const [goals, taskCounts, attendanceCounts, enrollments] = await Promise.all([
      adminRepository.studentGoals(studentId),
      adminRepository.studentTaskCounts(studentId),
      adminRepository.studentAttendanceCounts(studentId),
      adminRepository.studentEnrollmentCount(studentId)
    ]);

    return {
      student,
      enrollments,
      goals,
      tasks: bucketCounts(taskCounts, TASK_STATUSES),
      attendance: bucketCounts(attendanceCounts, ATTENDANCE_STATUSES),
      generatedAt: new Date().toISOString()
    };
  },

  // Section enrollment management
  async getSectionStudents(params: {
    sectionId: string;
    page?: number;
    limit?: number;
    q?: string;
  }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)));
    const skip = (page - 1) * limit;

    // Verify section exists
    const section = await Section.findById(params.sectionId);
    if (!section) {
      throw new AppError("Section not found", 404);
    }

    const [students, total] = await Promise.all([
      adminRepository.findEnrollmentsBySection(params.sectionId, skip, limit),
      adminRepository.countEnrollmentsBySection(params.sectionId)
    ]);

    return { students, total, page, limit, capacity: section.capacity };
  },

  async addStudentsToSection(sectionId: string, studentIds: string[]) {
    // Verify section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      throw new AppError("Section not found", 404);
    }

    const uniqueStudentIds = await assertStudents(studentIds);

    // Check for existing enrollments
    const existing = await adminRepository.findExistingEnrollments(sectionId, uniqueStudentIds);
    const existingIds = existing.map(e => String(e.student));
    const newStudentIds = uniqueStudentIds.filter(id => !existingIds.includes(id));

    const linkedElsewhere = await adminRepository.findStudentEnrollments(newStudentIds);
    const conflicts = linkedElsewhere.filter((enrollment) => String(enrollment.section?._id ?? enrollment.section) !== sectionId);
    if (conflicts.length > 0) {
      const conflictList = conflicts
        .map((enrollment: any) => `${enrollment.student}: ${formatSectionLabel(enrollment.section)}`)
        .join(", ");
      throw new AppError(
        `Student already linked to a section. Remove the student from their current section first: ${conflictList}`,
        409
      );
    }

    // Check capacity against only the net-new students.
    const currentCount = await adminRepository.countEnrollmentsBySection(sectionId);
    if (currentCount + newStudentIds.length > section.capacity) {
      throw new AppError(
        `Exceeds section capacity. Current: ${currentCount}, Adding: ${newStudentIds.length}, Capacity: ${section.capacity}`,
        400
      );
    }

    if (newStudentIds.length === 0) {
      return {
        added: 0,
        skipped: uniqueStudentIds.length,
        message: "All students are already enrolled in this section"
      };
    }

    // Create enrollments
    const enrollments = newStudentIds.map(studentId => ({
      student: studentId,
      section: sectionId
    }));

    try {
      await adminRepository.createEnrollments(enrollments);
    } catch (err: any) {
      // Handle duplicate key errors gracefully
      if (err.code === 11000) {
        throw new AppError("One or more students are already linked to a section", 409);
      }
      throw err;
    }

    return {
      added: newStudentIds.length,
      skipped: existingIds.length,
      message: `Successfully enrolled ${newStudentIds.length} student(s)${existingIds.length > 0 ? `, ${existingIds.length} already enrolled` : ""}`
    };
  },

  async removeStudentFromSection(sectionId: string, studentId: string) {
    const result = await adminRepository.deleteEnrollment(sectionId, studentId);
    if (!result) {
      throw new AppError("Enrollment not found", 404);
    }
    return { success: true, message: "Student removed from section" };
  },

  async listStudentsForSelection(params: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 25)));
    const skip = (page - 1) * limit;

    const [students, total] = await adminRepository.listStudentsForEnrollment(
      { q: params.q },
      skip,
      limit
    );

    return { students, total, page, limit };
  },

  assertStudents,

  async removeAllStudentsFromSection(sectionId: string) {
    await adminRepository.deleteEnrollmentsBySection(sectionId);
  }
};
