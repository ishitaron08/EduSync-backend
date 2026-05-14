import bcrypt from "bcryptjs";
import { usersRepository } from "./users.queries";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { Enrollment } from "../../models/Enrollment";
import { StudentTask } from "../../models/StudentTask";
import { Timetable } from "../../models/Timetable";
import { syllabusGoalsService } from "../syllabusGoals/service";

export const usersService = {
  async listUsers(page = 1, limit = 25) {
    const normalizedPage = Math.max(1, Number(page));
    const normalizedLimit = Math.min(100, Math.max(1, Number(limit)));
    const skip = (normalizedPage - 1) * normalizedLimit;
    const [users, total] = await usersRepository.listPaginated(skip, normalizedLimit);
    return { users, total, page: normalizedPage, limit: normalizedLimit };
  },
  async createUser(payload: Record<string, unknown>) {
    const userPayload = { ...payload };
    if (typeof userPayload.password === "string") {
      userPayload.password = await bcrypt.hash(userPayload.password, 10);
    }
    return usersRepository.create(userPayload);
  },
  updateUser(id: string, payload: Record<string, unknown>) {
    return usersRepository.updateById(id, payload);
  },
  async deleteUser(id: string) {
    await usersRepository.deleteById(id);
  },
  async getUserById(id: string) {
    return usersRepository.findById(id);
  },
  setAvailability(userId: string, availability: unknown[]) {
    return usersRepository.setAvailability(userId, availability);
  },
  getTopStudents() {
    return usersRepository.getTopStudents();
  },
  getRewardPoints(userId: string) {
    return usersRepository.getRewardPoints(userId);
  },
  async getStudentProgress(teacherId: string) {
    const timetables = await Timetable.find({ "slots.teacher": teacherId }).select("section").lean();
    const sectionIds = Array.from(new Set(timetables.map((timetable) => String(timetable.section))));
    if (sectionIds.length === 0) {
      return [];
    }

    const enrollments = await Enrollment.find({ section: { $in: sectionIds } })
      .populate("student", "name email rewardPoints")
      .lean();

    const uniqueStudents = new Map<string, any>();
    for (const enrollment of enrollments) {
      const student = enrollment.student as any;
      if (student?._id) {
        uniqueStudents.set(String(student._id), student);
      }
    }

    return Promise.all(
      Array.from(uniqueStudents.values()).map(async (student) => {
        const [taskTotal, taskCompleted, attendanceTotal, attendancePresent] = await Promise.all([
          StudentTask.countDocuments({ student: student._id }),
          StudentTask.countDocuments({ student: student._id, status: "completed" }),
          AttendanceRecord.countDocuments({ student: student._id, section: { $in: sectionIds } }),
          AttendanceRecord.countDocuments({ student: student._id, section: { $in: sectionIds }, status: "present" })
        ]);

        const attendancePercent = attendanceTotal === 0 ? 0 : Math.round((attendancePresent / attendanceTotal) * 100);
        const taskCompletionRate = taskTotal === 0 ? 0 : Math.round((taskCompleted / taskTotal) * 100);

        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          rewardPoints: student.rewardPoints || 0,
          attendancePercent,
          taskCompletionRate,
          atRisk: attendanceTotal > 0 && attendancePercent < 75
        };
      })
    );
  },
  async getStudentProfile(userId: string) {
    const user = await usersRepository.findById(userId);
    return user;
  },
  async updateStudentProfile(userId: string, payload: Record<string, unknown>) {
    const safePayload: Record<string, unknown> = {};
    if (typeof payload.name === "string") safePayload.name = payload.name;
    if (typeof payload.learningGoal === "string") safePayload.learningGoal = payload.learningGoal;
    
    if (typeof payload.password === "string" && payload.password.trim() !== "") {
      safePayload.password = await bcrypt.hash(payload.password, 10);
    }
    
    const user = await usersRepository.updateById(userId, safePayload);
    if (typeof payload.learningGoal === "string" && payload.learningGoal.trim() !== "") {
      await syllabusGoalsService.syncSelectedGoalFromProfile(userId, payload.learningGoal.trim());
    }
    return user;
  }
};
