import { PredictV2Input } from "./types";

/**
 * Goal buckets — each free-text goal is classified into one of these
 * before the catalog is consulted. The order here is meaningful: the
 * first matching keyword group wins, so place specific buckets first.
 */
export type GoalBucket =
  | "placement_prep"
  | "coding_practice"
  | "skill_building"
  | "academic"
  | "research"
  | "project_work"
  | "general_study";

const BUCKET_KEYWORDS: Array<{ bucket: GoalBucket; keywords: string[] }> = [
  { bucket: "coding_practice", keywords: ["dsa", "algorithm", "leetcode", "competitive", "coding", "programming"] },
  { bucket: "placement_prep", keywords: ["placement", "interview", "aptitude", "hr", "recruitment", "job"] },
  { bucket: "research", keywords: ["research", "paper", "thesis", "publication", "literature"] },
  { bucket: "project_work", keywords: ["project", "build", "implementation", "portfolio"] },
  { bucket: "skill_building", keywords: ["skill", "learn", "framework", "tech", "tool", "language"] },
  { bucket: "academic", keywords: ["academic", "exam", "semester", "grade", "subject", "syllabus", "improvement"] }
];

export type BuiltFeatures = {
  bucket: GoalBucket;
  /** Legacy field kept for backward compatibility with existing consumers. */
  dominantCategory: string;
  normalizedCompletionRate: number;
  freeMinutesToday: number;
  isLowMomentum: boolean;
  isDeepWorkCandidate: boolean;
};

/**
 * Classifies a free-text goal into a structured feature set the
 * recommender and catalog can consume.
 */
export function buildFeatures(input: PredictV2Input): BuiltFeatures {
  const goal = input.goalContext.goalType.toLowerCase();

  let bucket: GoalBucket = "general_study";
  for (const group of BUCKET_KEYWORDS) {
    if (group.keywords.some((kw) => goal.includes(kw))) {
      bucket = group.bucket;
      break;
    }
  }

  const normalizedCompletionRate = Math.max(0, Math.min(1, input.progressContext.completionRate));
  const freeMinutesToday = Math.max(0, input.availabilityContext.freeMinutesToday);

  return {
    bucket,
    dominantCategory: bucket,
    normalizedCompletionRate,
    freeMinutesToday,
    isLowMomentum: normalizedCompletionRate < 0.35,
    isDeepWorkCandidate:
      input.goalContext.difficultyPreference === "hard" && freeMinutesToday >= 90
  };
}
