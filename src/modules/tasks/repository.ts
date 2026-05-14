import { StudentTask } from "../../models/StudentTask";

export const tasksRepository = {
  create(payload: Record<string, unknown>) {
    return StudentTask.create(payload as any);
  },
  listByStudent(studentId: string) {
    return StudentTask.find({ student: studentId });
  },
  updateTask(taskId: string, studentId: string, payload: Record<string, unknown>) {
    return StudentTask.findOneAndUpdate({ _id: taskId, student: studentId }, { $set: payload }, { returnDocument: "after" });
  },
  completeTask(taskId: string, studentId: string) {
    return StudentTask.findOneAndUpdate(
      { _id: taskId, student: studentId, status: { $ne: "completed" } },
      { status: "completed", completedAt: new Date(), pointsAwarded: 10 },
      { returnDocument: "after" }
    );
  }
};
