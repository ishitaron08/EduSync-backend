import { AppError } from "../common/common.utiles";
import { goalsService } from "../goals/goals.service";
import { tasksRepository } from "./tasks.queries";
import { StudentGoal } from "../../models/StudentGoal";
import { SyllabusPlan } from "../../models/SyllabusPlan";
import { rewardsService } from "../rewards/service";

const RECOMMENDATION_LIMIT = 5;
const TASK_TYPE_DIFFICULTY: Record<string, "Easy" | "Medium" | "Hard"> = {
  read: "Easy",
  revise: "Easy",
  practice: "Medium",
  assess: "Medium",
  build: "Hard"
};
const TASK_POINTS_BY_DIFFICULTY: Record<"Easy" | "Medium" | "Hard", number> = {
  Easy: 10,
  Medium: 15,
  Hard: 20
};

function syllabusTaskDifficulty(task: any, topic: any): "Easy" | "Medium" | "Hard" {
  const type = String(task?.type ?? "practice");
  const level = String(topic?.level ?? "basic");

  if (type === "build") return "Hard";
  if (level === "advanced" && (type === "practice" || type === "assess")) return "Hard";
  if (type === "practice" || type === "assess" || level === "intermediate") return "Medium";
  return "Easy";
}

export const tasksService = {
  async createTask(payload: Record<string, unknown>, studentId: string) {
    const goalId = payload.goal ? String(payload.goal) : null;
    if (goalId) {
      const goal = await goalsService.getOwnedGoal(goalId, studentId);
      if (!goal) {
        throw new AppError("Goal does not belong to student", 403);
      }
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
  /**
   * Returns the student's completed tasks, newest first.
   * Used by the History tab on the learning page.
   */
  listTaskHistory(studentId: string, limit = 50) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    return this.listCombinedTaskHistory(studentId, safeLimit);
  },
  async listCombinedTaskHistory(studentId: string, limit = 50) {
    const [studentTasks, syllabusPlans] = await Promise.all([
      tasksRepository.listCompletedByStudent(studentId, limit),
      SyllabusPlan.find({ student: studentId, status: "ready" }).lean()
    ]);

    const syllabusTasks = syllabusPlans.flatMap((plan: any) =>
      (plan.topics ?? []).flatMap((topic: any) =>
        (topic.subtopics ?? []).flatMap((subtopic: any) =>
          (subtopic.tasks ?? [])
            .filter((task: any) => task.completed)
            .map((task: any) => ({
              _id: `${plan._id}:${topic.key}:${subtopic.key}:${task.key}`,
              title: task.title,
              category: subtopic.title,
              difficulty: syllabusTaskDifficulty(task, topic),
              durationMinutes: task.estimatedMinutes ?? 30,
              basePoints: TASK_POINTS_BY_DIFFICULTY[syllabusTaskDifficulty(task, topic)],
              pointsAwarded: task.pointsAwarded ?? TASK_POINTS_BY_DIFFICULTY[syllabusTaskDifficulty(task, topic)],
              completedAt: task.completedAt,
              createdAt: task.completedAt,
              studyNote: task.studyNote ?? "",
              checklistCompleted: task.checklistCompleted ?? [],
              source: "syllabus",
              topicTitle: topic.title,
              subtopicTitle: subtopic.title
            }))
        )
      )
    );

    return [...studentTasks, ...syllabusTasks]
      .sort((a: any, b: any) => {
        const aTime = new Date(a.completedAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.completedAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);
  },
  updateTask(taskId: string, studentId: string, payload: Record<string, unknown>) {
    return tasksRepository.updateTask(taskId, studentId, payload);
  },
  async completeTask(taskId: string, studentId: string) {
    const task = await tasksRepository.completeTask(taskId, studentId);
    if (!task) {
      return null;
    }
    const difficulty = task.difficulty === "Easy" || task.difficulty === "Medium" || task.difficulty === "Hard" ? task.difficulty : "Medium";
    const earnedPoints = TASK_POINTS_BY_DIFFICULTY[difficulty];
    task.pointsAwarded = earnedPoints;
    await task.save();

    await rewardsService.awardPoints(studentId, {
      points: earnedPoints,
      source: "student_task",
      difficulty,
      description: task.title,
      referenceType: "StudentTask",
      referenceId: String(task._id),
      metadata: {
        category: task.category,
        durationMinutes: task.durationMinutes
      }
    });
    return task;
  },
  /**
   * Recommends the next tasks to work on, drawn from the student's active
   * SyllabusPlan. Tasks are ranked by topic.order → subtopic.order → task position
   * and only incomplete syllabus tasks are returned.
   *
   * The `_durationMinutes` parameter is accepted for API compatibility but is
   * intentionally ignored — recommendations follow the syllabus structure, not
   * timetable slot length.
   */
  async getTaskRecommendations(studentId: string, _durationMinutes: number) {
    // Locate the student's active goal
    const selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true })
      .select("_id title")
      .lean();

    if (!selectedGoal) {
      // No goal selected → no recommendations to surface
      return [];
    }

    // Pull the AI-generated syllabus plan tied to that goal
    const plan = await SyllabusPlan.findOne({ student: studentId, goal: selectedGoal._id }).lean();

    if (!plan || plan.status !== "ready") {
      // Plan still generating or failed → nothing to recommend yet
      return [];
    }

    // Dedupe against tasks the student has already accepted into their queue
    // (active or completed) — a completed StudentTask shouldn't reappear as a
    // recommendation just because the parallel SyllabusPlan task is still open.
    type Candidate = {
      title: string;
      topicOrder: number;
      subtopicOrder: number;
      taskOrder: number;
      topicLevel: string;
      topicTitle: string;
      subtopicTitle: string;
      taskKey: string;
      topicKey: string;
      subtopicKey: string;
      type: string;
      estimatedMinutes: number;
      bonusAwarded: boolean;
      difficulty: "Easy" | "Medium" | "Hard";
      points: number;
      locked: boolean;
    };

    // Flatten the topic → subtopic → task hierarchy into a ranked candidate list
    const candidates: Candidate[] = [];
    const topics = [...((plan.topics ?? []) as any[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const topic of topics) {
      const subtopics = [...((topic.subtopics ?? []) as any[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const subtopic of subtopics) {
        const tasks = (subtopic.tasks ?? []) as any[];
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          if (task.completed) continue; // skip already-completed syllabus tasks
          const difficulty = syllabusTaskDifficulty(task, topic);
          candidates.push({
            title: task.title,
            topicOrder: topic.order ?? 0,
            subtopicOrder: subtopic.order ?? 0,
            taskOrder: i,
            topicLevel: topic.level ?? "basic",
            topicTitle: topic.title,
            subtopicTitle: subtopic.title,
            taskKey: task.key,
            topicKey: topic.key,
            subtopicKey: subtopic.key,
            type: task.type ?? "practice",
            estimatedMinutes: task.estimatedMinutes ?? 30,
            bonusAwarded: Boolean(subtopic.bonusAwarded),
            difficulty,
            points: TASK_POINTS_BY_DIFFICULTY[difficulty],
            locked: candidates.length > 0
          });
        }
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    // Sort by topic order → subtopic order → task position
    candidates.sort((a, b) => {
      if (a.topicOrder !== b.topicOrder) return a.topicOrder - b.topicOrder;
      if (a.subtopicOrder !== b.subtopicOrder) return a.subtopicOrder - b.subtopicOrder;
      return a.taskOrder - b.taskOrder;
    });

    // Confidence drops gradually as we move deeper in the syllabus —
    // first task = 95%, decays slowly so the 6th still reads as a strong match.
    const top = candidates.slice(0, RECOMMENDATION_LIMIT);
    return top.map((candidate, index) => {
      const probability = Math.max(0.55, 0.95 - index * 0.06);
      return {
        title: candidate.title,
        category: candidate.subtopicTitle,
        topicTitle: candidate.topicTitle,
        subtopicTitle: candidate.subtopicTitle,
        topicLevel: candidate.topicLevel,
        taskType: candidate.type,
        difficulty: candidate.difficulty,
        durationMinutes: candidate.estimatedMinutes,
        basePoints: candidate.points,
        locked: candidate.locked,
        probability,
        // Identifiers so the frontend can complete it via syllabus-goals API
        topicKey: candidate.topicKey,
        subtopicKey: candidate.subtopicKey,
        taskKey: candidate.taskKey
      };
    });
  }
};
