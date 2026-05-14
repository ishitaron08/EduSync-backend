import { usersRepository } from "../users/users.queries";

export const leaderboardService = {
  async getLeaderboard(scope: "all_time" | "weekly" | "monthly") {
    const students = await usersRepository.getTopStudents();
    return {
      scope,
      generatedAt: new Date().toISOString(),
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
