import { PredictV2Input } from "./types";

const CATEGORY_KEYWORDS: Record<string, string> = {
  placement: "aptitude",
  exam: "revision",
  skill: "practice",
  project: "project_work",
  research: "reading"
};

export type BuiltFeatures = {
  dominantCategory: string;
  normalizedCompletionRate: number;
  freeMinutesToday: number;
  isLowMomentum: boolean;
  isDeepWorkCandidate: boolean;
};

export function buildFeatures(input: PredictV2Input): BuiltFeatures {
  const goal = input.goalContext.goalType.toLowerCase();
  let dominantCategory = "general_study";
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (goal.includes(keyword)) {
      dominantCategory = category;
      break;
    }
  }
  const normalizedCompletionRate = Math.max(0, Math.min(1, input.progressContext.completionRate));
  const freeMinutesToday = Math.max(0, input.availabilityContext.freeMinutesToday);
  return {
    dominantCategory,
    normalizedCompletionRate,
    freeMinutesToday,
    isLowMomentum: normalizedCompletionRate < 0.35,
    isDeepWorkCandidate: input.goalContext.difficultyPreference === "hard" && freeMinutesToday >= 90
  };
}
