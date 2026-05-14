import { CourseModerationStatus } from "../../models/Course";
import { AppError } from "../common/common.utiles";
import { User } from "../../models/User";
import { Course } from "../../models/Course";
import { Assessment } from "../../models/Assessment";
import { StudentGoal } from "../../models/StudentGoal";
import { StudentTask } from "../../models/StudentTask";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { Section } from "../../models/Section";

const ROLES = ["admin", "teacher", "student"] as const;
type Role = (typeof ROLES)[number];

type DashboardMetrics = {
  users: {
    total: number;
    admin: number;
    teacher: number;
    student: number;
    activeThisWeek: number;
  };
  courses: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    active: number;
  };
  engagement: {
    taskCompletionRate: number;
    averageAttendanceRate: number;
    activeGoals: number;
    studentsWithGoals: number;
  };
  actionable: {
    pendingCourses: Array<{ _id: string; code: string; name: string; createdAt: Date }>;
    atRiskStudents: Array<{ _id: string; name: string; email: string; attendancePercentage: number }>;
    upcomingAssessments: Array<{ _id: string; title: string; startTime: Date; sectionName: string }>;
  };
  leaderboard: Array<{ studentId: string; name: string; email: string; rewardPoints: number }>;
  generatedAt: string;
};

export const dashboardService = {
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Run all aggregations in parallel
    const [
      userCounts,
      courseCounts,
      activeCourses,
      activeUsersThisWeek,
      taskStats,
      attendanceStats,
      goalStats,
      pendingCourses,
      atRiskStudents,
      upcomingAssessments,
      topStudents
    ] = await Promise.all([
      // User counts by role
      User.aggregate<{ _id: Role; count: number }>([
        { $group: { _id: "$role", count: { $sum: 1 } } }
      ]),

      // Course counts by moderation status
      Course.aggregate<{ _id: CourseModerationStatus | null; count: number }>([
        { $group: { _id: "$moderationStatus", count: { $sum: 1 } } }
      ]),

      // Active courses count
      Course.countDocuments({ isActive: true }),

      // Users active in last 7 days (based on updatedAt as proxy)
      User.countDocuments({ updatedAt: { $gte: oneWeekAgo } }),

      // Task completion stats
      StudentTask.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: oneWeekAgo } } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),

      // Attendance stats
      AttendanceRecord.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),

      // Goal stats
      Promise.all([
        StudentGoal.countDocuments({ progress: { $lt: 100 } }),
        StudentGoal.distinct("student", { progress: { $lt: 100 } })
      ]),

      // Pending courses (limit 5)
      Course.find({ moderationStatus: "pending" })
        .select("code name createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // At-risk students (attendance < 75%)
      AttendanceRecord.aggregate<{ _id: string; name: string; email: string; attendancePercentage: number }>([
        {
          $group: {
            _id: "$student",
            total: { $sum: 1 },
            present: {
              $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
            }
          }
        },
        {
          $addFields: {
            attendancePercentage: { $multiply: [{ $divide: ["$present", "$total"] }, 100] }
          }
        },
        { $match: { attendancePercentage: { $lt: 75 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user"
          }
        },
        { $unwind: "$user" },
        {
          $project: {
            _id: 1,
            name: "$user.name",
            email: "$user.email",
            attendancePercentage: 1
          }
        },
        { $limit: 5 }
      ]),

      // Upcoming assessments (next 7 days)
      Assessment.find({
        status: "published",
        startTime: { $gte: now, $lte: in7Days }
      })
        .populate("section", "sectionCode")
        .select("title startTime section")
        .sort({ startTime: 1 })
        .limit(5)
        .lean(),

      // All students by reward points. The overview card handles scrolling
      // and search, so the API should not hide lower-ranked students.
      User.find({ role: "student" })
        .select("name email rewardPoints")
        .sort({ rewardPoints: -1 })
        .lean()
    ]);

    // Process user counts
    const users = {
      total: 0,
      admin: 0,
      teacher: 0,
      student: 0,
      activeThisWeek: activeUsersThisWeek
    };
    for (const row of userCounts) {
      if (row._id) {
        users[row._id] = row.count;
        users.total += row.count;
      }
    }

    // Process course counts
    const courses = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      active: activeCourses
    };
    for (const row of courseCounts) {
      if (row._id) {
        courses[row._id] = row.count;
        courses.total += row.count;
      }
    }

    // Calculate task completion rate
    let taskCompletionRate = 0;
    const totalTasks = taskStats.reduce((sum, r) => sum + r.count, 0);
    const completedTasks = taskStats.find(r => r._id === "completed")?.count || 0;
    if (totalTasks > 0) {
      taskCompletionRate = Math.round((completedTasks / totalTasks) * 100);
    }

    // Calculate average attendance rate
    let averageAttendanceRate = 0;
    const totalAttendance = attendanceStats.reduce((sum, r) => sum + r.count, 0);
    const presentCount = attendanceStats.find(r => r._id === "present")?.count || 0;
    if (totalAttendance > 0) {
      averageAttendanceRate = Math.round((presentCount / totalAttendance) * 100);
    }

    // Process goal stats
    const [activeGoals, studentsWithGoalsArr] = goalStats;

    // Process upcoming assessments
    const upcomingAssessmentsProcessed = upcomingAssessments.map((a: any) => ({
      _id: String(a._id),
      title: a.title,
      startTime: a.startTime,
      sectionName: (a.section as any)?.sectionCode || "Unknown"
    }));

    // Process leaderboard
    const leaderboard = topStudents.map((s: any, index: number) => ({
      studentId: String(s._id),
      name: s.name,
      email: s.email,
      rewardPoints: s.rewardPoints || 0
    }));

    return {
      users,
      courses,
      engagement: {
        taskCompletionRate,
        averageAttendanceRate,
        activeGoals,
        studentsWithGoals: studentsWithGoalsArr.length
      },
      actionable: {
        pendingCourses: pendingCourses.map(c => ({
          _id: String(c._id),
          code: c.code,
          name: c.name,
          createdAt: c.createdAt
        })),
        atRiskStudents: atRiskStudents.map(s => ({
          _id: String(s._id),
          name: s.name,
          email: s.email,
          attendancePercentage: Math.round(s.attendancePercentage * 10) / 10
        })),
        upcomingAssessments: upcomingAssessmentsProcessed
      },
      leaderboard,
      generatedAt: new Date().toISOString()
    };
  }
};
