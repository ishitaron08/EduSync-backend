import { GoalBucket } from "./feature-builder";
import { SuggestedTask } from "./types";

type Difficulty = "Easy" | "Medium" | "Hard";

type CatalogTemplate = {
  title: string;
  category: string;
  baseDuration: number; // minutes
  difficulty: Difficulty;
  basePoints: number;
  /** 0..1 — base relevance for this bucket, before fit adjustments. */
  weight: number;
  reason: string;
};

type CatalogInput = {
  bucket: GoalBucket;
  goalText: string;
  difficultyPreference: "easy" | "medium" | "hard";
  freeMinutes: number;
  isLowMomentum: boolean;
  /** Maximum number of tasks to return after ranking. */
  limit?: number;
};

// ---------------------------------------------------------------------------
// Per-bucket task templates. Each bucket carries 7+ candidate templates
// covering Easy/Medium/Hard difficulty so the ranker has room to choose.
// ---------------------------------------------------------------------------

const TEMPLATES: Record<GoalBucket, CatalogTemplate[]> = {
  placement_prep: [
    { title: "Aptitude practice — quantitative", category: "aptitude", baseDuration: 30, difficulty: "Medium", basePoints: 25, weight: 0.92, reason: "Core aptitude topics show up in nearly every placement test." },
    { title: "Logical reasoning drill", category: "aptitude", baseDuration: 25, difficulty: "Medium", basePoints: 22, weight: 0.85, reason: "Sharpens pattern recognition needed in early rounds." },
    { title: "Mock HR interview reflection", category: "interview", baseDuration: 25, difficulty: "Medium", basePoints: 20, weight: 0.82, reason: "Practising soft answers reduces interview anxiety." },
    { title: "Resume polish — one section", category: "career", baseDuration: 20, difficulty: "Easy", basePoints: 15, weight: 0.78, reason: "Small resume wins compound over the placement window." },
    { title: "Company research deep-dive", category: "career", baseDuration: 35, difficulty: "Easy", basePoints: 18, weight: 0.74, reason: "Knowing the firm helps tailor answers in interviews." },
    { title: "Technical interview question set", category: "interview", baseDuration: 45, difficulty: "Hard", basePoints: 35, weight: 0.90, reason: "Timed practice builds stamina for live rounds." },
    { title: "Group discussion topic prep", category: "interview", baseDuration: 30, difficulty: "Medium", basePoints: 22, weight: 0.72, reason: "GD rounds are often elimination rounds." },
    { title: "Verbal ability — RC passage", category: "aptitude", baseDuration: 20, difficulty: "Easy", basePoints: 15, weight: 0.68, reason: "Quick wins improve verbal section accuracy." }
  ],

  coding_practice: [
    { title: "DSA pattern: sliding window", category: "coding", baseDuration: 45, difficulty: "Hard", basePoints: 35, weight: 0.92, reason: "High-yield pattern in interview problems." },
    { title: "Two-pointer practice set", category: "coding", baseDuration: 40, difficulty: "Medium", basePoints: 28, weight: 0.88, reason: "Foundational technique that unlocks many problems." },
    { title: "Recursion and backtracking", category: "coding", baseDuration: 50, difficulty: "Hard", basePoints: 38, weight: 0.86, reason: "Builds the muscle for harder problem categories." },
    { title: "Easy array problems — 3 questions", category: "coding", baseDuration: 30, difficulty: "Easy", basePoints: 20, weight: 0.80, reason: "Warm-up sets keep daily streaks alive." },
    { title: "Hash map / set practice", category: "coding", baseDuration: 35, difficulty: "Medium", basePoints: 25, weight: 0.82, reason: "Indispensable data structure for optimization." },
    { title: "Binary search variations", category: "coding", baseDuration: 40, difficulty: "Hard", basePoints: 32, weight: 0.84, reason: "Variations are common but trip up most candidates." },
    { title: "Daily contest problem", category: "coding", baseDuration: 25, difficulty: "Medium", basePoints: 22, weight: 0.76, reason: "Time pressure simulates real contest conditions." },
    { title: "Concept review: graphs basics", category: "coding", baseDuration: 30, difficulty: "Easy", basePoints: 18, weight: 0.70, reason: "Refreshing fundamentals pays back on harder problems." }
  ],

  skill_building: [
    { title: "Tutorial walkthrough — one chapter", category: "learning", baseDuration: 45, difficulty: "Medium", basePoints: 25, weight: 0.88, reason: "Structured material accelerates new-skill ramp-up." },
    { title: "Hands-on coding exercise", category: "practice", baseDuration: 40, difficulty: "Medium", basePoints: 28, weight: 0.86, reason: "Doing beats reading for retention." },
    { title: "Video lecture — focused block", category: "learning", baseDuration: 30, difficulty: "Easy", basePoints: 18, weight: 0.74, reason: "Short focused viewing beats passive marathons." },
    { title: "Documentation deep-read", category: "reading", baseDuration: 25, difficulty: "Easy", basePoints: 15, weight: 0.68, reason: "Primary docs build a stronger mental model than tutorials alone." },
    { title: "Build a tiny demo project", category: "project", baseDuration: 60, difficulty: "Hard", basePoints: 40, weight: 0.92, reason: "End-to-end shipping cements every concept." },
    { title: "Pair-program a feature", category: "practice", baseDuration: 50, difficulty: "Medium", basePoints: 30, weight: 0.78, reason: "External feedback loop catches blind spots faster." },
    { title: "Concept flashcards review", category: "review", baseDuration: 15, difficulty: "Easy", basePoints: 12, weight: 0.62, reason: "Spaced recall is the cheapest retention boost." }
  ],

  academic: [
    { title: "Subject revision — focused chapter", category: "revision", baseDuration: 45, difficulty: "Medium", basePoints: 25, weight: 0.90, reason: "Aligned with current syllabus topics." },
    { title: "Practice problems — applied", category: "practice", baseDuration: 35, difficulty: "Medium", basePoints: 22, weight: 0.86, reason: "Application builds exam readiness." },
    { title: "Past paper question — single", category: "exam-prep", baseDuration: 25, difficulty: "Hard", basePoints: 28, weight: 0.84, reason: "Past patterns predict future ones." },
    { title: "Notes consolidation", category: "review", baseDuration: 30, difficulty: "Easy", basePoints: 18, weight: 0.76, reason: "Cleaner notes shorten future revision time." },
    { title: "Concept map for one topic", category: "review", baseDuration: 25, difficulty: "Easy", basePoints: 18, weight: 0.70, reason: "Visual links improve recall under pressure." },
    { title: "Tough problem — solo solve", category: "practice", baseDuration: 50, difficulty: "Hard", basePoints: 35, weight: 0.82, reason: "Stretch problems uncover real understanding." },
    { title: "Self-quiz — 10 questions", category: "exam-prep", baseDuration: 20, difficulty: "Medium", basePoints: 18, weight: 0.74, reason: "Active recall outperforms passive re-reading." }
  ],

  research: [
    { title: "Literature scan — one paper", category: "reading", baseDuration: 45, difficulty: "Medium", basePoints: 28, weight: 0.92, reason: "Steady reading builds the paper's foundation." },
    { title: "Annotate key paper", category: "reading", baseDuration: 35, difficulty: "Medium", basePoints: 25, weight: 0.86, reason: "Active annotation improves later citation flow." },
    { title: "Methodology notes draft", category: "writing", baseDuration: 40, difficulty: "Medium", basePoints: 28, weight: 0.84, reason: "Drafting early prevents late-stage rewrites." },
    { title: "Hypothesis brainstorm", category: "thinking", baseDuration: 25, difficulty: "Easy", basePoints: 18, weight: 0.74, reason: "Fresh framing unlocks new directions." },
    { title: "Outline — one section", category: "writing", baseDuration: 30, difficulty: "Easy", basePoints: 20, weight: 0.78, reason: "Section outlines reduce blank-page paralysis." },
    { title: "Citation cleanup", category: "admin", baseDuration: 20, difficulty: "Easy", basePoints: 12, weight: 0.62, reason: "Small admin wins keep the manuscript healthy." },
    { title: "Deep paper critique", category: "reading", baseDuration: 60, difficulty: "Hard", basePoints: 40, weight: 0.84, reason: "Critical reading sharpens your own arguments." }
  ],

  project_work: [
    { title: "Feature implementation block", category: "project", baseDuration: 60, difficulty: "Hard", basePoints: 40, weight: 0.92, reason: "Concentrated build time moves the needle most." },
    { title: "Bug fix — one issue", category: "project", baseDuration: 30, difficulty: "Medium", basePoints: 22, weight: 0.82, reason: "Small wins keep momentum and the codebase healthy." },
    { title: "Refactor — one module", category: "project", baseDuration: 45, difficulty: "Medium", basePoints: 28, weight: 0.78, reason: "Steady refactors prevent big rewrites." },
    { title: "Write README section", category: "docs", baseDuration: 25, difficulty: "Easy", basePoints: 18, weight: 0.70, reason: "Docs are how others find your project." },
    { title: "Add tests for one feature", category: "testing", baseDuration: 35, difficulty: "Medium", basePoints: 25, weight: 0.76, reason: "Tests double as living documentation." },
    { title: "Deploy / release prep", category: "ops", baseDuration: 40, difficulty: "Hard", basePoints: 30, weight: 0.74, reason: "Shipping closes the loop on real user feedback." },
    { title: "Code review — your own PR", category: "review", baseDuration: 20, difficulty: "Easy", basePoints: 15, weight: 0.66, reason: "Self-review catches half of preventable bugs." }
  ],

  general_study: [
    { title: "Focused study block", category: "study", baseDuration: 45, difficulty: "Medium", basePoints: 25, weight: 0.86, reason: "Aligned with your active goal." },
    { title: "Concept revision sprint", category: "review", baseDuration: 30, difficulty: "Easy", basePoints: 18, weight: 0.78, reason: "Short revision keeps recall warm." },
    { title: "Practice problem set", category: "practice", baseDuration: 35, difficulty: "Medium", basePoints: 22, weight: 0.80, reason: "Balanced application reinforces learning." },
    { title: "Reflection and recap", category: "review", baseDuration: 15, difficulty: "Easy", basePoints: 12, weight: 0.60, reason: "Closes the day with a measurable checkpoint." },
    { title: "Deep dive on one topic", category: "study", baseDuration: 60, difficulty: "Hard", basePoints: 35, weight: 0.84, reason: "Depth beats breadth for retention." },
    { title: "Quick reading — 10 pages", category: "reading", baseDuration: 20, difficulty: "Easy", basePoints: 14, weight: 0.66, reason: "Daily reading habit compounds." },
    { title: "Self-quiz — 10 questions", category: "exam-prep", baseDuration: 20, difficulty: "Medium", basePoints: 18, weight: 0.72, reason: "Active recall outperforms re-reading." }
  ]
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const DIFFICULTY_RANK: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 3 };
const PREF_RANK: Record<"easy" | "medium" | "hard", number> = { easy: 1, medium: 2, hard: 3 };

/**
 * Computes a 0..1 score combining catalog weight, duration fit, difficulty fit,
 * and momentum. The result is bounded so frontends can render it as a percentage.
 */
function scoreTemplate(t: CatalogTemplate, input: CatalogInput): number {
  // Duration fit: tasks longer than the available slot are penalized.
  // Tasks well-sized to the slot get the full score.
  const durationRatio = t.baseDuration / Math.max(15, input.freeMinutes);
  let durationFit = 1;
  if (durationRatio > 1) durationFit = Math.max(0.35, 1 - (durationRatio - 1));
  else if (durationRatio < 0.4) durationFit = 0.85; // tiny tasks slightly penalized

  // Difficulty fit: closer to preference is better.
  const diff = Math.abs(DIFFICULTY_RANK[t.difficulty] - PREF_RANK[input.difficultyPreference]);
  const difficultyFit = diff === 0 ? 1 : diff === 1 ? 0.85 : 0.65;

  // Momentum boost: easier tasks get a small lift when momentum is low.
  const momentumBoost = input.isLowMomentum && t.difficulty === "Easy" ? 1.08 : 1;

  // Tiny variance so consecutive calls don't produce identical orderings.
  const jitter = 0.97 + Math.random() * 0.06; // 0.97 .. 1.03

  const raw = t.weight * durationFit * difficultyFit * momentumBoost * jitter;
  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the top-N suggested tasks for a goal bucket, ranked by score.
 * Default cap is 6; pass `limit` to override (5–7 is the recommended range).
 */
export function buildTaskCatalog(input: CatalogInput): SuggestedTask[] {
  const limit = Math.max(1, Math.min(10, input.limit ?? 6));
  const templates = TEMPLATES[input.bucket] ?? TEMPLATES.general_study;

  const scored = templates.map((t) => ({
    template: t,
    score: scoreTemplate(t, input)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ template, score }) => ({
    title: template.title,
    category: template.category,
    durationMinutes: Math.min(template.baseDuration, Math.max(15, input.freeMinutes)),
    difficulty: template.difficulty,
    basePoints: template.basePoints,
    score,
    reason: template.reason
  }));
}
