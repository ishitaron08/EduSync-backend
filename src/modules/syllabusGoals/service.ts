import { Types } from "mongoose";
import { StudentGoal } from "../../models/StudentGoal";
import { SyllabusPlan } from "../../models/SyllabusPlan";
import { User } from "../../models/User";
import { AppError } from "../common/common.utiles";
import { getSyllabusAiModelLabel, getSyllabusAiProviderStatus, syllabusAiService } from "./ai.service";
import { presetGoalOptions } from "./types";

const DEFAULT_TARGET_DAYS = 90;

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

  async regenerate(studentId: string) {
    const selectedGoal = await StudentGoal.findOne({ student: studentId, isSelected: true });
    if (!selectedGoal) throw new AppError("Select a goal before generating syllabus", 400);
    const existing = await SyllabusPlan.findOne({ student: studentId, goal: selectedGoal._id });
    if (existing && existing.status === "ready") {
      throw new AppError("Syllabus is already generated", 409);
    }
    await generatePlanForGoal(studentId, selectedGoal);
    return this.getDashboard(studentId);
  }
};
