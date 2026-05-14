import { MlRecommendationInput, MlRecommendationResponse } from "../modules/ml/ml.types";
import { PredictV2Input } from "./types";

export function mapLegacyInputToV2(input: MlRecommendationInput): PredictV2Input {
  return {
    studentContext: { academicYear: input.student_year },
    goalContext: {
      goalType: input.goal_type,
      difficultyPreference: input.difficulty_preference
    },
    availabilityContext: {
      freeMinutesToday: input.free_time_duration,
      freeSlotCountToday: Math.max(1, Math.round(input.free_time_duration / 30))
    },
    progressContext: {
      completionRate: input.completion_rate,
      completedTasks: Math.round(input.completion_rate * 10),
      totalTasks: 10
    }
  };
}

export function mapV2ToLegacyResponse(recommendation: string): MlRecommendationResponse {
  return {
    recommended_task_category: recommendation,
    source: "fallback_rules",
    model_version: "inprocess-ai-v2"
  };
}
