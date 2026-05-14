export type MlRecommendationInput = {
  student_year: number;
  goal_type: string;
  free_time_duration: number;
  completion_rate: number;
  difficulty_preference: "easy" | "medium" | "hard";
};

export type MlRecommendationResponse = {
  recommended_task_category: string;
  source?: "ml_service" | "fallback_rules";
  model_version?: string;
};
