import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { StudentGoal } from "../../models/StudentGoal";
import { StudentTask } from "../../models/StudentTask";
import { User } from "../../models/User";
import { Enrollment } from "../../models/Enrollment";

export const getLearningAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Goal Distribution
  const goalDistribution = await StudentGoal.aggregate([
    {
      $group: {
        _id: "$goalType",
        count: { $sum: 1 }
      }
    }
  ]);

  // Overall Task Completion Rate
  const taskStats = await StudentTask.aggregate([
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
        }
      }
    }
  ]);

  const completionRate = taskStats.length > 0
    ? (taskStats[0].completedTasks / taskStats[0].totalTasks) * 100
    : 0;

  const studentTaskStats = await StudentTask.aggregate([
    {
      $group: {
        _id: "$student",
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
        pointsAwarded: { $sum: { $ifNull: ["$pointsAwarded", 0] } },
        totalDurationMinutes: { $sum: { $ifNull: ["$durationMinutes", 0] } },
        lastCompletedAt: { $max: "$completedAt" },
        lastTaskAt: { $max: "$updatedAt" }
      }
    },
    {
      $project: {
        studentId: "$_id",
        total: 1,
        completed: 1,
        pending: 1,
        inProgress: 1,
        overdue: 1,
        pointsAwarded: 1,
        totalDurationMinutes: 1,
        lastCompletedAt: 1,
        lastTaskAt: 1,
        rate: { $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$completed", "$total"] }, 100] }] }
      }
    }
  ]);

  const [students, selectedGoals, enrollments] = await Promise.all([
    User.find({ role: "student" }, "name email rewardPoints").sort({ name: 1 }).lean(),
    StudentGoal.find({ isSelected: true }, "student goalType title progress targetDate").lean(),
    Enrollment.find({})
      .populate({
        path: "section",
        select: "sectionCode term year course",
        populate: { path: "course", select: "code name title" }
      })
      .lean()
  ]);

  const statsByStudent = new Map(studentTaskStats.map((stat) => [String(stat.studentId), stat]));
  const goalsByStudent = new Map(selectedGoals.map((goal: any) => [String(goal.student), goal]));
  const enrollmentByStudent = new Map(enrollments.map((enrollment: any) => [String(enrollment.student), enrollment]));

  const studentRows = students.map((student: any) => {
    const stat = statsByStudent.get(String(student._id));
    const goal = goalsByStudent.get(String(student._id));
    const enrollment = enrollmentByStudent.get(String(student._id));
    const section = enrollment?.section;
    const course = section?.course;
    const completionRateForStudent = stat?.rate ?? 0;
    const totalTasks = stat?.total ?? 0;
    const status =
      totalTasks === 0
        ? "No Tasks"
        : completionRateForStudent < 40
          ? "At Risk"
          : completionRateForStudent < 70
            ? "Watch"
            : "Healthy";

    return {
      _id: student._id,
      name: student.name,
      email: student.email,
      rewardPoints: student.rewardPoints ?? 0,
      section: section
        ? {
            _id: section._id,
            sectionCode: section.sectionCode,
            term: section.term,
            year: section.year,
            courseCode: course?.code,
            courseName: course?.name ?? course?.title
          }
        : null,
      activeGoal: goal
        ? {
            goalType: goal.goalType,
            title: goal.title,
            progress: goal.progress ?? 0,
            targetDate: goal.targetDate
          }
        : null,
      totalTasks,
      completedTasks: stat?.completed ?? 0,
      pendingTasks: stat?.pending ?? 0,
      inProgressTasks: stat?.inProgress ?? 0,
      overdueTasks: stat?.overdue ?? 0,
      completionRate: completionRateForStudent,
      pointsAwarded: stat?.pointsAwarded ?? 0,
      totalDurationMinutes: stat?.totalDurationMinutes ?? 0,
      lastCompletedAt: stat?.lastCompletedAt ?? null,
      lastTaskAt: stat?.lastTaskAt ?? null,
      status
    };
  });

  const decliningStudents = studentRows
    .filter((student) => student.totalTasks > 0 && student.completionRate < 40)
    .map(({ _id, name, email, completionRate }) => ({ _id, name, email, completionRate }));

  const completionBuckets = [
    { name: "0-39%", value: studentRows.filter((student) => student.totalTasks > 0 && student.completionRate < 40).length },
    { name: "40-69%", value: studentRows.filter((student) => student.completionRate >= 40 && student.completionRate < 70).length },
    { name: "70-100%", value: studentRows.filter((student) => student.completionRate >= 70).length },
    { name: "No tasks", value: studentRows.filter((student) => student.totalTasks === 0).length }
  ];

  const studentsWithTasks = studentRows.filter((student) => student.totalTasks > 0);
  const averageTasksPerStudent = studentRows.length > 0
    ? studentRows.reduce((sum, student) => sum + student.totalTasks, 0) / studentRows.length
    : 0;

  res.json({
    goalDistribution: goalDistribution.map(g => ({ name: g._id, value: g.count })),
    completionRate,
    decliningStudents,
    studentRows,
    summary: {
      totalStudents: studentRows.length,
      studentsWithTasks: studentsWithTasks.length,
      atRiskStudents: decliningStudents.length,
      noTaskStudents: studentRows.length - studentsWithTasks.length,
      averageTasksPerStudent
    },
    completionBuckets
  });
});
