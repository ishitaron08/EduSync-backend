export type SyllabusTask = {
  title: string;
  description?: string;
};

export type SyllabusSubtopic = {
  key: string;
  title: string;
  description?: string;
  progressPercent: number;
  tasks: SyllabusTask[];
};

export type SyllabusTopic = {
  key: string;
  title: string;
  description?: string;
  subtopics: SyllabusSubtopic[];
};

export type GeneratedSyllabus = {
  topics: SyllabusTopic[];
};

export const presetGoalOptions = [
  {
    key: "academic_improvement",
    title: "Academic Improvement",
    goalType: "exam",
    description: "Improve grades in current subjects with structured revision, practice, and assessment readiness."
  },
  {
    key: "placement_preparation",
    title: "Placement Preparation",
    goalType: "placement",
    description: "Prepare for campus placements with aptitude, coding, interview, and communication practice."
  },
  {
    key: "skill_development",
    title: "Skill Development",
    goalType: "skill_development",
    description: "Build practical technical skills through concepts, tools, projects, and portfolio tasks."
  }
] as const;

export type PresetGoalTitle = (typeof presetGoalOptions)[number]["title"];
