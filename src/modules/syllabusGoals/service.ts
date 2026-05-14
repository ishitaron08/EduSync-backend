import { Types } from "mongoose";
import { StudentGoal } from "../../models/StudentGoal";
import { SyllabusPlan } from "../../models/SyllabusPlan";
import { User } from "../../models/User";
import { AppError } from "../common/common.utiles";
import { getSyllabusAiModelLabel, getSyllabusAiProviderStatus, syllabusAiService } from "./ai.service";
import { presetGoalOptions } from "./types";

const DEFAULT_TARGET_DAYS = 90;
const MIN_ROADMAP_TOPICS = 9;
const MIN_ROADMAP_SUBTOPICS = 4;
const MIN_ROADMAP_TASKS = 2;
const TASK_POINTS = 10;
const SUBTOPIC_BONUS_POINTS = 20;

function targetDate() {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_TARGET_DAYS);
  return date;
}

function presetFromKey(key: string) {
  return presetGoalOptions.find((goal) => goal.key === key);
}

function presetFromTitle(title: string) {
  return presetGoalOptions.find((goal) => goal.title === title);
}

async function markOnlySelected(studentId: string, goalId: Types.ObjectId) {
  await StudentGoal.updateMany({ student: studentId, _id: { $ne: goalId } }, { $set: { isSelected: false } });
  await StudentGoal.findOneAndUpdate({ _id: goalId, student: studentId }, { $set: { isSelected: true } });
}

async function generatePlanForGoal(studentId: string, goal: any) {
  const plan = await SyllabusPlan.findOneAndUpdate(
    { student: studentId, goal: goal._id },
    {
      $set: {
        goalTitle: goal.title,
        status: "generating",
        geminiModel: getSyllabusAiModelLabel(),
        errorMessage: "",
        topics: []
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  try {
    const generated = await syllabusAiService.generateSyllabus(goal.title, goal.description);
    plan.status = "ready";
    plan.topics = generated.topics as any;
    plan.geminiModel = getSyllabusAiModelLabel();
    plan.errorMessage = "";
    plan.generatedAt = new Date();
    await plan.save();
  } catch (error) {
    plan.status = "failed";
    plan.geminiModel = getSyllabusAiModelLabel();
    plan.errorMessage = error instanceof Error ? error.message : "Failed to generate syllabus";
    plan.generatedAt = undefined;
    await plan.save();
  }

  return plan;
}

function planNeedsRoadmapUpgrade(plan: any) {
  if (!plan || plan.status !== "ready") return false;
  const topics = Array.isArray(plan.topics) ? plan.topics : [];
  if (topics.length < MIN_ROADMAP_TOPICS) return true;

  return topics.some((topic: any) => {
    if (!topic.level || !topic.order) return true;
    const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    if (subtopics.length < MIN_ROADMAP_SUBTOPICS) return true;
    return subtopics.some((subtopic: any) => {
      if (!subtopic.order) return true;
      const tasks = Array.isArray(subtopic.tasks) ? subtopic.tasks : [];
      if (tasks.length < MIN_ROADMAP_TASKS) return true;
      return tasks.some((task: any) => !task.key || !task.type || !task.estimatedMinutes);
    });
  });
}

function recalculateSubtopicProgress(subtopic: any) {
  const tasks = Array.isArray(subtopic.tasks) ? subtopic.tasks : [];
  if (tasks.length === 0) {
    subtopic.progressPercent = 0;
    return { completedCount: 0, totalCount: 0, completed: false };
  }

  const completedCount = tasks.filter((task: any) => Boolean(task.completed)).length;
  subtopic.progressPercent = Math.round((completedCount / tasks.length) * 100);
  return {
    completedCount,
    totalCount: tasks.length,
    completed: completedCount === tasks.length
  };
}

export const syllabusGoalsService = {
  getProviderStatus() {
    return getSyllabusAiProviderStatus();
  },

  async getDashboard(studentId: string) {
    let selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true });
    const user = await User.findById(studentId);

    if (!selectedGoal && user?.learningGoal) {
      selectedGoal = await this.syncSelectedGoalFromProfile(studentId, user.learningGoal);
    }

    let plan = selectedGoal ? await SyllabusPlan.findOne({ student: studentId, goal: selectedGoal._id }) : null;
    if (selectedGoal && !plan) {
      plan = await generatePlanForGoal(studentId, selectedGoal);
    } else if (selectedGoal && planNeedsRoadmapUpgrade(plan)) {
      plan = await generatePlanForGoal(studentId, selectedGoal);
    }

    const customGoals = await StudentGoal.find({ student: studentId, isCustom: true }).sort({ createdAt: -1 });
    return {
      presetGoals: presetGoalOptions,
      selectedGoal,
      customGoals,
      syllabusPlan: plan
    };
  },

  async syncSelectedGoalFromProfile(studentId: string, learningGoal: string) {
    const preset = presetFromTitle(learningGoal);
    const payload = {
      student: studentId,
      title: learningGoal,
      description: preset?.description ?? "",
      presetKey: preset?.key ?? null,
      goalType: preset?.goalType ?? "custom",
      isCustom: !preset,
      isSelected: true,
      targetDate: targetDate(),
      difficultyPreference: "medium"
    };

    let goal = preset
      ? await StudentGoal.findOne({ student: studentId, title: learningGoal })
      : await StudentGoal.findOne({ student: studentId, isSelected: true, isCustom: true });
    if (!goal) {
      goal = await StudentGoal.create(payload);
    } else {
      goal.set(payload);
      await goal.save();
    }
    await markOnlySelected(studentId, goal._id);
    await User.findByIdAndUpdate(studentId, { $set: { learningGoal } });
    await generatePlanForGoal(studentId, goal);
    return goal;
  },

  async selectGoal(studentId: string, payload: { presetKey?: string; customGoalId?: string }) {
    const existingSelected = await StudentGoal.findOne({ student: studentId, isSelected: true });
    const user = await User.findById(studentId);
    if (existingSelected || user?.learningGoal) {
      throw new AppError("Selected goal is locked. Change it from Profile.", 409);
    }

    let goal: any;
    if (payload.presetKey) {
      const preset = presetFromKey(payload.presetKey);
      if (!preset) throw new AppError("Unknown preset goal", 400);
      goal = await StudentGoal.create({
        student: studentId,
        goalType: preset.goalType,
        title: preset.title,
        description: preset.description,
        presetKey: preset.key,
        isCustom: false,
        isSelected: true,
        targetDate: targetDate(),
        difficultyPreference: "medium"
      });
    } else {
      goal = await StudentGoal.findOne({ _id: payload.customGoalId, student: studentId, isCustom: true });
      if (!goal) throw new AppError("Custom goal not found", 404);
      goal.set("isSelected", true);
      await goal.save();
    }

    await markOnlySelected(studentId, goal._id);
    await User.findByIdAndUpdate(studentId, { $set: { learningGoal: goal.title } });
    await generatePlanForGoal(studentId, goal);
    return this.getDashboard(studentId);
  },

  async createCustomGoal(studentId: string, payload: { title: string; description?: string; select?: boolean }) {
    const hasSelected = await StudentGoal.exists({ student: studentId, isSelected: true });
    const user = await User.findById(studentId);
    const shouldSelect = Boolean(payload.select && !hasSelected && !user?.learningGoal);
    if (!shouldSelect) {
      throw new AppError("Custom goals can only be added here before selecting your first goal. Change goals from Profile.", 409);
    }

    const goal = await StudentGoal.create({
      student: studentId,
      goalType: "custom",
      title: payload.title,
      description: payload.description ?? "",
      isCustom: true,
      isSelected: shouldSelect,
      targetDate: targetDate(),
      difficultyPreference: "medium"
    });

    if (shouldSelect) {
      await markOnlySelected(studentId, goal._id);
      await User.findByIdAndUpdate(studentId, { $set: { learningGoal: goal.title } });
      await generatePlanForGoal(studentId, goal);
    }

    return this.getDashboard(studentId);
  },

  async updateProgress(studentId: string, payload: { topicKey: string; subtopicKey: string; progressPercent: number }) {
    const selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true });
    if (!selectedGoal) throw new AppError("Select a goal before updating syllabus progress", 400);
    const plan = await SyllabusPlan.findOne({ student: studentId, goal: selectedGoal._id });
    if (!plan) throw new AppError("Syllabus plan not found", 404);

    let updated = false;
    plan.topics = plan.topics.map((topic: any) => {
      if (topic.key !== payload.topicKey) return topic;
      topic.subtopics = topic.subtopics.map((subtopic: any) => {
        if (subtopic.key !== payload.subtopicKey) return subtopic;
        subtopic.progressPercent = Math.max(0, Math.min(100, payload.progressPercent));
        updated = true;
        return subtopic;
      });
      return topic;
    }) as any;

    if (!updated) throw new AppError("Subtopic not found", 404);
    await plan.save();
    return plan;
  },

  async completeTask(studentId: string, payload: { topicKey: string; subtopicKey: string; taskKey: string }) {
    const selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true });
    if (!selectedGoal) throw new AppError("Select a goal before completing syllabus tasks", 400);
    const plan = await SyllabusPlan.findOne({ student: studentId, goal: selectedGoal._id });
    if (!plan) throw new AppError("Syllabus plan not found", 404);
    if (plan.status !== "ready") throw new AppError("Syllabus plan is not ready", 409);

    const topic = (plan.topics as any[]).find((item) => item.key === payload.topicKey);
    if (!topic) throw new AppError("Topic not found", 404);

    const subtopic = (topic.subtopics as any[]).find((item) => item.key === payload.subtopicKey);
    if (!subtopic) throw new AppError("Subtopic not found", 404);

    const task = (subtopic.tasks as any[]).find((item) => item.key === payload.taskKey);
    if (!task) throw new AppError("Task not found", 404);

    let awardedPoints = 0;
    let taskAwarded = 0;
    let bonusAwarded = 0;
    const now = new Date();

    if (!task.completed) {
      task.completed = true;
      task.completedAt = now;
      task.pointsAwarded = TASK_POINTS;
      taskAwarded = TASK_POINTS;
      awardedPoints += TASK_POINTS;
    }

    const progress = recalculateSubtopicProgress(subtopic);
    if (progress.completed && !subtopic.bonusAwarded) {
      subtopic.bonusAwarded = true;
      subtopic.bonusAwardedAt = now;
      bonusAwarded = SUBTOPIC_BONUS_POINTS;
      awardedPoints += SUBTOPIC_BONUS_POINTS;
    }

    if (awardedPoints > 0) {
      await User.findByIdAndUpdate(studentId, { $inc: { rewardPoints: awardedPoints } });
    }

    plan.markModified("topics");
    await plan.save();

    return {
      syllabusPlan: plan,
      awardedPoints,
      taskAwarded,
      bonusAwarded,
      subtopicCompleted: progress.completed
    };
  },

  async regenerate(studentId: string) {
    const selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true });
    if (!selectedGoal) throw new AppError("Select a goal before generating syllabus", 400);
    await generatePlanForGoal(studentId, selectedGoal);
    return this.getDashboard(studentId);
  }
};
