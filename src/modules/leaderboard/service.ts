import { PipelineStage } from "mongoose";
import { RewardTransaction } from "../../models/RewardTransaction";
import { User } from "../../models/User";

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  async getLeaderboard(scope: "all_time" | "weekly" | "monthly", options: { limit?: number; q?: string } = {}) {
    const limit = Math.min(1000, Math.max(1, Number(options.limit ?? 20)));
    const q = options.q?.trim();
    const searchMatch = q
      ? {
          $or: [
            { "student.name": new RegExp(escapeRegex(q), "i") },
            { "student.email": new RegExp(escapeRegex(q), "i") }
          ]
        }
      : null;

    if (scope !== "all_time") {
      const startDate = scopeStartDate(scope);
      const pipeline: PipelineStage[] = [
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: "$student", rewardPoints: { $sum: "$points" } } },
        { $sort: { rewardPoints: -1 } },
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
      ];
      if (searchMatch) pipeline.push({ $match: searchMatch });
      pipeline.push(
        { $limit: limit },
        {
          $project: {
            studentId: { $toString: "$student._id" },
            name: "$student.name",
            email: "$student.email",
            rewardPoints: 1
          }
        }
      );

      const rows = await RewardTransaction.aggregate(pipeline);

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

    const userQuery: Record<string, unknown> = { role: "student" };
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      userQuery.$or = [{ name: rx }, { email: rx }];
    }
    const students = await User.find(userQuery)
      .select("name email rewardPoints")
      .sort({ rewardPoints: -1, name: 1 })
      .limit(limit)
      .lean();

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
