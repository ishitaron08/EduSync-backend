import { RewardTransaction } from "../../models/RewardTransaction";
import { usersRepository } from "../users/users.queries";

function scopeStartDate(scope: "weekly" | "monthly") {
  const now = new Date();
  if (scope === "weekly") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const leaderboardService = {
  async getLeaderboard(scope: "all_time" | "weekly" | "monthly") {
    if (scope !== "all_time") {
      const startDate = scopeStartDate(scope);
      const rows = await RewardTransaction.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: "$student", rewardPoints: { $sum: "$points" } } },
        { $sort: { rewardPoints: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "student"
          }
        },
        { $unwind: "$student" },
        { $match: { "student.role": "student" } },
        {
          $project: {
            studentId: { $toString: "$student._id" },
            name: "$student.name",
            email: "$student.email",
            rewardPoints: 1
          }
        }
      ]);

      return {
        scope,
        generatedAt: new Date().toISOString(),
        periodStart: startDate.toISOString(),
        rows: rows.map((student: any, index: number) => ({
          rank: index + 1,
          studentId: student.studentId,
          name: student.name,
          email: student.email,
          rewardPoints: Number(student.rewardPoints ?? 0)
        }))
      };
    }

    const students = await usersRepository.getTopStudents();
    return {
      scope,
      generatedAt: new Date().toISOString(),
      periodStart: null,
      rows: students.map((student: any, index: number) => ({
        rank: index + 1,
        studentId: String(student._id),
        name: student.name,
        email: student.email,
        rewardPoints: Number(student.rewardPoints ?? 0)
      }))
    };
  }
};
