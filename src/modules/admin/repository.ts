import { Types } from "mongoose";
import { User } from "../../models/User";
import { Course, CourseModerationStatus } from "../../models/Course";
import { Assessment } from "../../models/Assessment";
import { AuditLog } from "../../models/AuditLog";
import { StudentGoal } from "../../models/StudentGoal";
import { StudentTask } from "../../models/StudentTask";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { Enrollment } from "../../models/Enrollment";

type Role = "admin" | "teacher" | "student";

type UserListFilter = {
  role?: Role;
  q?: string;
};

type CourseListFilter = {
  status?: CourseModerationStatus;
  q?: string;
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const adminRepository = {
  countUsersByRole() {
    return User.aggregate<{ _id: Role; count: number }>([
      { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);
  },

  countCourses() {
    return Course.aggregate<{ _id: CourseModerationStatus; count: number }>([
      { $group: { _id: "$moderationStatus", count: { $sum: 1 } } }
    ]);
  },

  countActiveCourses() {
    return Course.countDocuments({ isActive: true });
  },

  countAssessmentsByStatus() {
    return Assessment.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
  },

  countAuditLogsSince(since: Date) {
    return AuditLog.countDocuments({ createdAt: { $gte: since } });
  },

  listUsers(filter: UserListFilter, skip: number, limit: number) {
    const query: Record<string, unknown> = {};
    if (filter.role) {
      query.role = filter.role;
    }
    if (filter.q && filter.q.length > 0) {
      const rx = new RegExp(escapeRegex(filter.q), "i");
      query.$or = [{ name: rx }, { email: rx }];
    }

    return Promise.all([
      User.find(query)
        .select("name email role availability rewardPoints createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);
  },

  listCourses(filter: CourseListFilter, skip: number, limit: number) {
    const query: Record<string, unknown> = {};
    if (filter.status) {
      query.moderationStatus = filter.status;
    }
    if (filter.q && filter.q.length > 0) {
      const rx = new RegExp(escapeRegex(filter.q), "i");
      query.$or = [{ code: rx }, { name: rx }, { description: rx }];
    }

    return Promise.all([
      Course.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Course.countDocuments(query)
    ]);
  },

  findCourseById(id: string) {
    return Course.findById(id);
  },

  setCourseModerationStatus(id: string, status: CourseModerationStatus) {
    return Course.findByIdAndUpdate(
      id,
      { $set: { moderationStatus: status } },
      { returnDocument: "after" }
    );
  },

  findStudent(id: string) {
    return User.findOne({ _id: new Types.ObjectId(id), role: "student" }).select(
      "name email role rewardPoints createdAt updatedAt"
    );
  },

  countStudentsByIds(ids: string[]) {
    return User.countDocuments({ _id: { $in: ids }, role: "student" });
  },

  studentGoals(studentId: string) {
    return StudentGoal.find({ student: studentId }).sort({ targetDate: 1 });
  },

  studentTaskCounts(studentId: string) {
    return StudentTask.aggregate<{ _id: string; count: number }>([
      { $match: { student: new Types.ObjectId(studentId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
  },

  studentAttendanceCounts(studentId: string) {
    return AttendanceRecord.aggregate<{ _id: string; count: number }>([
      { $match: { student: new Types.ObjectId(studentId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
  },

  studentEnrollmentCount(studentId: string) {
    return Enrollment.countDocuments({ student: studentId });
  },

  // Section enrollment management
  findEnrollmentsBySection(sectionId: string, skip: number = 0, limit: number = 25) {
    return Enrollment.find({ section: sectionId })
      .populate("student", "name email role")
      .sort({ enrolledAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  countEnrollmentsBySection(sectionId: string) {
    return Enrollment.countDocuments({ section: sectionId });
  },

  findExistingEnrollments(sectionId: string, studentIds: string[]) {
    return Enrollment.find({
      section: sectionId,
      student: { $in: studentIds }
    }).select("student");
  },

  findStudentEnrollments(studentIds: string[]) {
    return Enrollment.find({ student: { $in: studentIds } })
      .select("student section")
      .populate("section", "sectionCode term year course")
      .populate({
        path: "section",
        populate: { path: "course", select: "code name" }
      });
  },

  createEnrollments(enrollments: Array<{ student: string; section: string }>) {
    return Enrollment.insertMany(enrollments, { ordered: false });
  },

  deleteEnrollment(sectionId: string, studentId: string) {
    return Enrollment.findOneAndDelete({ section: sectionId, student: studentId });
  },

  deleteEnrollmentsBySection(sectionId: string) {
    return Enrollment.deleteMany({ section: sectionId });
  },

  // Find students for dropdown
  listStudentsForEnrollment(filter: { q?: string }, skip: number, limit: number) {
    const query: Record<string, unknown> = { role: "student" };
    if (filter.q && filter.q.length > 0) {
      const rx = new RegExp(escapeRegex(filter.q), "i");
      query.$or = [{ name: rx }, { email: rx }];
    }

    return User.find(query)
        .select("name email role")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .then(async (students) => {
          const total = await User.countDocuments(query);
          const studentIds = students.map((student) => String(student._id));
          const enrollments = await Enrollment.find({ student: { $in: studentIds } })
            .populate({
              path: "section",
              select: "sectionCode term year course",
              populate: { path: "course", select: "code name" }
            })
            .lean();
          const enrollmentByStudent = new Map(enrollments.map((enrollment: any) => [
            String(enrollment.student),
            enrollment
          ]));

          return [
            students.map((student: any) => ({
              ...student.toObject(),
              enrollment: enrollmentByStudent.get(String(student._id)) ?? null
            })),
            total
          ] as const;
        });
  }
};
