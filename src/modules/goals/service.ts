import { goalsRepository } from "./goals.queries";

export const goalsService = {
  createGoal(payload: Record<string, unknown>, studentId: string) {
    return goalsRepository.create({ ...payload, student: studentId });
  },
  listGoals(studentId: string) {
    return goalsRepository.listByStudent(studentId);
  },
  updateGoal(goalId: string, studentId: string, payload: Record<string, unknown>) {
    return goalsRepository.updateOwnedGoal(goalId, studentId, payload);
  },
  deleteGoal(goalId: string, studentId: string) {
    return goalsRepository.deleteOwnedGoal(goalId, studentId);
  },
  getOwnedGoal(goalId: string, studentId: string) {
    return goalsRepository.getOwnedGoal(goalId, studentId);
  }
};
