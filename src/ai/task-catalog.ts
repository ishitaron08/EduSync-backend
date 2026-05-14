import { SuggestedTask } from "./types";

type CatalogInput = {
  category: string;
  difficulty: "easy" | "medium" | "hard";
  freeMinutes: number;
};

export function buildTaskCatalog(input: CatalogInput): SuggestedTask[] {
  const baseDuration = Math.max(15, Math.min(120, Math.round(input.freeMinutes / 2)));
  const tasks: SuggestedTask[] = [
    {
      title: `Focused ${input.category} block`,
      category: input.category,
      durationMinutes: baseDuration,
      reason: "Matches your main goal and available free time."
    },
    {
      title: input.difficulty === "hard" ? "Timed challenge set" : "Concept revision sprint",
      category: "practice",
      durationMinutes: Math.max(20, Math.min(60, Math.round(baseDuration * 0.7))),
      reason: "Balances consistency with measurable progress."
    },
    {
      title: "Reflection and recap",
      category: "review",
      durationMinutes: 15,
      reason: "Consolidates learning and improves retention."
    }
  ];
  return tasks;
}
