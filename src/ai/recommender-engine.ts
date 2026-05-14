import { buildFeatures } from "./feature-builder";
import { buildTaskCatalog } from "./task-catalog";
import { PredictV2Input, PredictV2Output } from "./types";

function chooseRecommendation(input: PredictV2Input): { recommendation: string; confidence: number; explanations: string[] } {
  const features = buildFeatures(input);
  if (features.isLowMomentum) {
    return {
      recommendation: "quick_win",
      confidence: 0.89,
      explanations: ["Recent completion trend is low, so shorter wins will rebuild consistency."]
    };
  }
  if (features.freeMinutesToday < 30) {
    return {
      recommendation: "micro_task",
      confidence: 0.82,
      explanations: ["Available free time is limited; concise tasks are more likely to complete."]
    };
  }
  if (features.isDeepWorkCandidate) {
    return {
      recommendation: "deep_focus",
      confidence: 0.84,
      explanations: ["Longer free window and hard difficulty preference support deep work sessions."]
    };
  }
  return {
    recommendation: features.dominantCategory,
    confidence: 0.76,
    explanations: ["Recommendation aligns with your active goal and current progress profile."]
  };
}

export function runRecommender(input: PredictV2Input, startedAtMs = Date.now()): PredictV2Output {
  const picked = chooseRecommendation(input);
  const tasks = buildTaskCatalog({
    category: picked.recommendation,
    difficulty: input.goalContext.difficultyPreference,
    freeMinutes: input.availabilityContext.freeMinutesToday
  });

  return {
    recommendation: picked.recommendation,
    confidence: picked.confidence,
    suggestedTasks: tasks,
    roadmap: [
      { order: 1, phase: "warmup", recommendation: "Start with a low-friction task to establish momentum." },
      { order: 2, phase: "core", recommendation: `Spend the largest block on ${picked.recommendation}.` },
      { order: 3, phase: "reinforce", recommendation: "Close with recap and one measurable checkpoint." }
    ],
    explanations: picked.explanations,
    meta: {
      modelVersion: "inprocess-ai-v2",
      engineVersion: "ts-rule-engine-v2",
      latencyMs: Math.max(1, Date.now() - startedAtMs)
    }
  };
}
