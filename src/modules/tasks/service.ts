import { AppError } from "../common/common.utiles";
import { goalsService } from "../goals/goals.service";
import { usersRepository } from "../users/users.queries";
import { tasksRepository } from "./tasks.queries";
import { runRecommender } from "../../ai/recommender-engine";
import { timetableService } from "../timetable/service";

export const tasksService = {
  async createTask(payload: Record<string, unknown>, studentId: string) {
    const goalId = String(payload.goal);
    const goal = await goalsService.getOwnedGoal(goalId, studentId);
    if (!goal) {
      throw new AppError("Goal does not belong to student", 403);
    }
    return tasksRepository.create({ 
      ...payload, 
      student: studentId,
      libraryTask: payload.libraryTask || null,
      mlScore: payload.mlScore || null,
      timelinessFactor: payload.timelinessFactor || 1.0
    });
  },
  listTasks(studentId: string) {
    return tasksRepository.listByStudent(studentId);
  },
  updateTask(taskId: string, studentId: string, payload: Record<string, unknown>) {
    return tasksRepository.updateTask(taskId, studentId, payload);
  },
  async completeTask(taskId: string, studentId: string) {
    const task = await tasksRepository.completeTask(taskId, studentId);
    if (!task) {
      return null;
    }
    // Calculate final points: basePoints (default 20) + small random bonus for timeliness/streak
    const earnedPoints = (task.basePoints || 20) + Math.floor(Math.random() * 10);
    task.pointsAwarded = earnedPoints;
    await task.save();

    await usersRepository.incrementRewardPoints(studentId, earnedPoints);
    return task;
  },
  async getTaskRecommendations(studentId: string, durationMinutes: number) {
    const user = await usersRepository.findById(studentId);
    const goal = user?.learningGoal || "placement";
    
    let freeMinutesToday = durationMinutes;
    try {
      // @ts-ignore
      const freeSlots = await timetableService.getStudentFreeSlots(studentId);
      if (freeSlots && freeSlots.length > 0) {
        freeMinutesToday = freeSlots.reduce((acc: number, slot: any) => acc + slot.duration, 0);
      }
    } catch(e) {
      // Ignored if no timetable exists
    }

    const input = {
      studentContext: { academicYear: 3 },
      goalContext: { goalType: String(goal), difficultyPreference: "medium" as any },
      availabilityContext: { freeMinutesToday, freeSlotCountToday: 2 },
      progressContext: { completionRate: 0.6, completedTasks: 10, totalTasks: 20 }
    };

    const output = runRecommender(input);
    
    return output.suggestedTasks.map(task => ({
      title: task.title,
      category: task.category,
      difficulty: "Medium",
      durationMinutes: Math.min(task.durationMinutes, durationMinutes),
      basePoints: 20,
      probability: output.confidence
    })).filter(r => r.durationMinutes <= durationMinutes);
  }
};
