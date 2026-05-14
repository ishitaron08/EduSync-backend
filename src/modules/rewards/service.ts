import { RewardTransaction } from "../../models/RewardTransaction";
import { usersRepository } from "../users/users.queries";

type RewardDifficulty = "Easy" | "Medium" | "Hard" | "Bonus" | "Standard";
type RewardSource = "syllabus_task" | "subtopic_bonus" | "student_task" | "assessment" | "manual";

export const rewardsService = {
  async awardPoints(
    studentId: string,
    payload: {
      points: number;
      source: RewardSource;
      difficulty?: RewardDifficulty;
      description?: string;
      referenceType?: string;
      referenceId?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const points = Math.max(0, Math.round(Number(payload.points)));
    if (points <= 0) return null;

    const [transaction] = await Promise.all([
      RewardTransaction.create({
        student: studentId,
        points,
        source: payload.source,
        difficulty: payload.difficulty ?? "Standard",
        description: payload.description ?? "",
        referenceType: payload.referenceType ?? "",
        referenceId: payload.referenceId ?? "",
        metadata: payload.metadata ?? {}
      }),
      usersRepository.incrementRewardPoints(studentId, points)
    ]);

    return transaction;
  }
};
