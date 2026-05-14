import { MlRecommendationInput } from "./ml.types";

type RecommendationResult = {
  recommended_task_category: string;
};

const GOAL_CATEGORY_MAP: Record<string, string> = {
  exam: "revision",
  assignment: "deep_work",
  project: "project_work",
  coding: "practice",
  placement: "aptitude",
  interview: "mock_interview",
  research: "reading"
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function categoryFromGoal(goalType: string): string {
  const goal = normalizeText(goalType);
  for (const [keyword, category] of Object.entries(GOAL_CATEGORY_MAP)) {
    if (goal.includes(keyword)) {
      return category;
    }
  }
  return "general_study";
}

export function generateRecommendation(input: MlRecommendationInput): RecommendationResult {
  const goalCategory = categoryFromGoal(input.goal_type);

  if (input.completion_rate < 0.35) {
    return { recommended_task_category: "quick_win" };
  }

  if (input.free_time_duration < 30) {
    return { recommended_task_category: "micro_task" };
  }

  if (input.difficulty_preference === "hard" && input.free_time_duration >= 90) {
    return { recommended_task_category: "deep_focus" };
  }

  if (input.difficulty_preference === "easy") {
    return { recommended_task_category: "light_practice" };
  }

  return { recommended_task_category: goalCategory };
}
