import { StudentTask } from "../../models/StudentTask";

export const tasksRepository = {
  create(payload: Record<string, unknown>) {
    return StudentTask.create(payload as any);
  },
  listByStudent(studentId: string) {
    return StudentTask.find({ student: studentId });
  },
  /**
   * Lists active (non-completed) tasks for a student.
   * Used by the recommender to deduplicate against in-flight work.
   */
  listActiveByStudent(studentId: string) {
    return StudentTask.find({ student: studentId, status: { $ne: "completed" } })
      .select("title")
      .lean();
  },
  /**
   * Lists titles of all tasks the student has ever accepted (active or completed).
   * Used by the recommender so an already-handled task doesn't reappear.
   */
  listAllTitlesByStudent(studentId: string) {
    return StudentTask.find({ student: studentId })
      .select("title")
      .lean();
  },
  /**
   * Lists completed tasks for the student's history view.
   * Sorted by most-recently-completed first.
   */
  listCompletedByStudent(studentId: string, limit = 50) {
    return StudentTask.find({ student: studentId, status: "completed" })
      .sort({ completedAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
  },
  updateTask(taskId: string, studentId: string, payload: Record<string, unknown>) {
    return StudentTask.findOneAndUpdate(
      { _id: taskId, student: studentId },
      { $set: payload },
      { returnDocument: "after" }
    );
  },
  completeTask(taskId: string, studentId: string) {
    return StudentTask.findOneAndUpdate(
      { _id: taskId, student: studentId, status: { $ne: "completed" } },
      { status: "completed", completedAt: new Date(), pointsAwarded: 10 },
      { returnDocument: "after" }
    );
  }
};
