export type DifficultyPreference = "easy" | "medium" | "hard";

export type PredictV2Input = {
  studentContext: {
    academicYear: number;
  };
  goalContext: {
    goalType: string;
    difficultyPreference: DifficultyPreference;
  };
  availabilityContext: {
    freeMinutesToday: number;
    freeSlotCountToday: number;
  };
  progressContext: {
    completionRate: number;
    completedTasks: number;
    totalTasks: number;
  };
  preferences?: {
    preferredSessionMinutes?: number;
    focusAreas?: string[];
  };
};

export type SuggestedTask = {
  title: string;
  category: string;
  durationMinutes: number;
  reason: string;
};

export type RoadmapItem = {
  order: number;
  phase: "warmup" | "core" | "reinforce";
  recommendation: string;
};

export type PredictV2Output = {
  recommendation: string;
  confidence: number;
  suggestedTasks: SuggestedTask[];
  roadmap: RoadmapItem[];
  explanations: string[];
  meta: {
    modelVersion: string;
    engineVersion: string;
    latencyMs: number;
  };
};
