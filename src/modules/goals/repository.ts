import { StudentGoal } from "../../models/StudentGoal";

export const goalsRepository = {
  create(payload: Record<string, unknown>) {
    return StudentGoal.create(payload as any);
  },
  listByStudent(studentId: string) {
    return StudentGoal.find({ student: studentId });
  },
  updateOwnedGoal(goalId: string, studentId: string, payload: Record<string, unknown>) {
    return StudentGoal.findOneAndUpdate({ _id: goalId, student: studentId }, { $set: payload }, { returnDocument: "after" });
  },
  deleteOwnedGoal(goalId: string, studentId: string) {
    return StudentGoal.findOneAndDelete({ _id: goalId, student: studentId });
  },
  getOwnedGoal(goalId: string, studentId: string) {
    return StudentGoal.findOne({ _id: goalId, student: studentId });
  }
};
