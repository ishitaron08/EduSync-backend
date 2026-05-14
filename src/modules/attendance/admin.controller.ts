import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { AttendanceRecord } from "../../models/AttendanceRecord";
import { User } from "../../models/User";

export const getAttendanceStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Class-wise Overall Percentage
  const classStats = await AttendanceRecord.aggregate([
    {
      $group: {
        _id: "$section",
        totalRecords: { $sum: 1 },
        presentRecords: {
          $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        sectionId: "$_id",
        percentage: {
          $cond: [
            { $eq: ["$totalRecords", 0] },
            0,
            { $multiply: [{ $divide: ["$presentRecords", "$totalRecords"] }, 100] }
          ]
        }
      }
    }
  ]);

  // At-Risk Students (<75%)
  const studentStats = await AttendanceRecord.aggregate([
    {
      $group: {
        _id: "$student",
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } }
      }
    },
    {
      $project: {
        studentId: "$_id",
        percentage: {
          $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$present", "$total"] }, 100] }]
        }
      }
    },
    {
      $match: {
        percentage: { $lt: 75 }
      }
    }
  ]);

  const atRiskStudentIds = studentStats.map(s => s.studentId);
  const atRiskUsers = await User.find({ _id: { $in: atRiskStudentIds } }, "name email");
  const atRiskStudents = atRiskUsers.map(user => {
    const stat = studentStats.find(s => String(s.studentId) === String(user._id));
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      attendancePercentage: stat?.percentage || 0
    };
  });

  // Daily Trends
  const dailyTrends = await AttendanceRecord.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$sessionDate" } },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: "$_id",
        rate: { $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$present", "$total"] }, 100] }] }
      }
    }
  ]);

  res.json({
    classStats,
    atRiskStudents,
    dailyTrends
  });
});
