import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { StudentGoal } from "../../models/StudentGoal";
import { StudentTask } from "../../models/StudentTask";
import { User } from "../../models/User";

export const getLearningAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Goal Distribution
  const goalDistribution = await StudentGoal.aggregate([
    {
      $group: {
        _id: "$type",
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

  // Declining Students (At Risk)
  // Simplified logic: Check students who have pending tasks but few completions
  const studentTaskStats = await StudentTask.aggregate([
    {
      $group: {
        _id: "$student",
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }
      }
    },
    {
      $project: {
        studentId: "$_id",
        rate: { $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$completed", "$total"] }, 100] }] }
      }
    },
    {
      $match: {
        rate: { $lt: 40 } // At risk if completion rate is below 40%
      }
    }
  ]);

  const decliningStudentIds = studentTaskStats.map(s => s.studentId);
  const decliningUsers = await User.find({ _id: { $in: decliningStudentIds } }, "name email");
  const decliningStudents = decliningUsers.map(user => {
    const stat = studentTaskStats.find(s => String(s.studentId) === String(user._id));
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      completionRate: stat?.rate || 0
    };
  });

  res.json({
    goalDistribution: goalDistribution.map(g => ({ name: g._id, value: g.count })),
    completionRate,
    decliningStudents
  });
});
