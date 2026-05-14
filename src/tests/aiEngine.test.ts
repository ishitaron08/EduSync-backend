import assert from "node:assert/strict";
import test from "node:test";
import { buildFeatures } from "../ai/feature-builder";
import { runRecommender } from "../ai/recommender-engine";

test("buildFeatures identifies low momentum students", () => {
  const features = buildFeatures({
    studentContext: { academicYear: 3 },
    goalContext: { goalType: "placement", difficultyPreference: "medium" },
    availabilityContext: { freeMinutesToday: 45, freeSlotCountToday: 2 },
    progressContext: { completionRate: 0.2, completedTasks: 2, totalTasks: 10 }
  });
  assert.equal(features.isLowMomentum, true);
  assert.equal(features.bucket, "placement_prep");
});

test("runRecommender returns v2 shaped recommendation payload", () => {
  const response = runRecommender({
    studentContext: { academicYear: 2 },
    goalContext: { goalType: "exam improvement", difficultyPreference: "hard" },
    availabilityContext: { freeMinutesToday: 120, freeSlotCountToday: 3 },
    progressContext: { completionRate: 0.7, completedTasks: 7, totalTasks: 10 }
  });

  assert.equal(typeof response.recommendation, "string");
  assert.equal(Array.isArray(response.suggestedTasks), true);
  assert.equal(Array.isArray(response.roadmap), true);
  assert.equal(response.meta.modelVersion, "inprocess-ai-v2");
});
