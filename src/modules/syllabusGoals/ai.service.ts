import { env } from "../../config/env";
import { GeneratedSyllabus, SyllabusSubtopic, SyllabusTask, SyllabusTopic } from "./types";

const MAX_GOAL_CHARS = 120;
const MAX_DETAILS_CHARS = 180;
const TOPIC_LIMIT = 12;
const MIN_TOPICS = 9;
const SUBTOPIC_LIMIT = 7;
const MIN_SUBTOPICS = 4;
const TASK_LIMIT = 3;
const MIN_TASKS = 2;
const TASK_TYPES = ["read", "practice", "build", "revise", "assess"] as const;
type TaskType = (typeof TASK_TYPES)[number];

function compactInput(value: string | undefined, fallback = "") {
  return (value || fallback).replace(/\s+/g, " ").trim().slice(0, value ? MAX_DETAILS_CHARS : fallback.length);
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function taskType(value: unknown, index: number): TaskType {
  if (typeof value === "string" && TASK_TYPES.includes(value as TaskType)) return value as TaskType;
  return (["read", "practice", "build"] as const)[index % 3];
}

function levelForIndex(index: number, total = MIN_TOPICS): SyllabusTopic["level"] {
  const third = Math.ceil(total / 3);
  if (index < third) return "basic";
  if (index < third * 2) return "intermediate";
  return "advanced";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function fallbackTask(subtopicTitle: string, taskIndex: number): SyllabusTask {
  const templates = [
    {
      title: `Study the core idea of ${subtopicTitle}`,
      description: "Read notes or a trusted reference, then write a short summary in your own words.",
      type: "read" as const,
      estimatedMinutes: 30,
      resourceHint: "Textbook chapter, class notes, or official documentation"
    },
    {
      title: `Practice ${subtopicTitle} problems`,
      description: "Solve a small set of examples and mark the parts that still feel unclear.",
      type: "practice" as const,
      estimatedMinutes: 40,
      resourceHint: "Worksheet, previous questions, or coding/problem platform"
    },
    {
      title: `Apply ${subtopicTitle} in a mini task`,
      description: "Create a tiny example, diagram, explanation, or implementation that proves you can use it.",
      type: "build" as const,
      estimatedMinutes: 45,
      resourceHint: "Notebook, IDE, lab exercise, or project file"
    }
  ];
  const template = templates[taskIndex % templates.length];
  return {
    ...template,
    key: slugify(template.title, `task-${taskIndex + 1}`),
    completed: false,
    pointsAwarded: 0
  };
}

function fallbackSubtopic(topicTitle: string, subtopicIndex: number): SyllabusSubtopic {
  const templates = [
    {
      title: `${topicTitle} fundamentals`,
      description: `Understand the terms, purpose, and core ideas behind ${topicTitle}.`
    },
    {
      title: `${topicTitle} worked examples`,
      description: `Study examples that show how ${topicTitle} is used in real questions or projects.`
    },
    {
      title: `${topicTitle} practice set`,
      description: `Solve focused exercises until the common patterns become clear.`
    },
    {
      title: `${topicTitle} application task`,
      description: `Apply ${topicTitle} in a short explanation, implementation, lab, or exam-style response.`
    }
  ];
  const template = templates[subtopicIndex % templates.length];
  return {
    key: slugify(template.title, `subtopic-${subtopicIndex + 1}`),
    title: template.title,
    description: template.description,
    order: subtopicIndex + 1,
    estimatedHours: subtopicIndex === 0 ? 1 : 2,
    progressPercent: 0,
    bonusAwarded: false,
    tasks: [fallbackTask(template.title, 0), fallbackTask(template.title, 1)]
  };
}

function fallbackTopic(goalTitle: string, topicIndex: number, total = MIN_TOPICS): SyllabusTopic {
  const cleanGoal = titleCase(goalTitle || "Learning Goal");
  const level = levelForIndex(topicIndex, total);
  const topicTemplates: Record<SyllabusTopic["level"], string[]> = {
    basic: [
      `${cleanGoal} orientation`,
      `${cleanGoal} foundations`,
      `${cleanGoal} core concepts`
    ],
    intermediate: [
      `${cleanGoal} applied practice`,
      `${cleanGoal} problem solving`,
      `${cleanGoal} integrated skills`
    ],
    advanced: [
      `${cleanGoal} advanced applications`,
      `${cleanGoal} assessment readiness`,
      `${cleanGoal} mastery project`
    ]
  };
  const title = topicTemplates[level][topicIndex % topicTemplates[level].length];
  return {
    key: slugify(title, `topic-${topicIndex + 1}`),
    title,
    description: `Structured ${level} work for ${cleanGoal}.`,
    level,
    order: topicIndex + 1,
    subtopics: Array.from({ length: MIN_SUBTOPICS }, (_, index) => fallbackSubtopic(title, index))
  };
}

function ensureUniqueKeys(topics: SyllabusTopic[]) {
  const topicKeys = new Map<string, number>();
  return topics.map((topic, topicIndex) => {
    const baseTopicKey = topic.key || `topic-${topicIndex + 1}`;
    const topicSeen = topicKeys.get(baseTopicKey) ?? 0;
    topicKeys.set(baseTopicKey, topicSeen + 1);
    const topicKey = topicSeen ? `${baseTopicKey}-${topicSeen + 1}` : baseTopicKey;

    const subtopicKeys = new Map<string, number>();
    return {
      ...topic,
      key: topicKey,
      subtopics: topic.subtopics.map((subtopic, subtopicIndex) => {
        const baseSubtopicKey = subtopic.key || `${topicKey}-subtopic-${subtopicIndex + 1}`;
        const subtopicSeen = subtopicKeys.get(baseSubtopicKey) ?? 0;
        subtopicKeys.set(baseSubtopicKey, subtopicSeen + 1);
        const subtopicKey = subtopicSeen ? `${baseSubtopicKey}-${subtopicSeen + 1}` : baseSubtopicKey;
        const taskKeys = new Map<string, number>();
        return {
          ...subtopic,
          key: subtopicKey,
          tasks: subtopic.tasks.map((task, taskIndex) => {
            const baseTaskKey = task.key || slugify(task.title, `${subtopicKey}-task-${taskIndex + 1}`);
            const taskSeen = taskKeys.get(baseTaskKey) ?? 0;
            taskKeys.set(baseTaskKey, taskSeen + 1);
            return {
              ...task,
              key: taskSeen ? `${baseTaskKey}-${taskSeen + 1}` : baseTaskKey
            };
          })
        };
      })
    };
  });
}

function sanitizeTopics(rawTopics: unknown, providerName = "AI provider", goalTitle = "Learning Goal"): SyllabusTopic[] {
  const rawTopicList = Array.isArray(rawTopics) ? rawTopics : [];
  const usableRawTopics = rawTopicList.length > 0 ? rawTopicList : [];

  if (!Array.isArray(rawTopics)) {
    console.warn(`${providerName} response did not include a topics array. Falling back to generated roadmap.`);
  }

  const topics: SyllabusTopic[] = usableRawTopics.slice(0, TOPIC_LIMIT).flatMap((topic, topicIndex): SyllabusTopic[] => {
    const topicRecord = topic as Record<string, unknown>;
    const title = String(topicRecord.title ?? "").trim();
    if (!title) return [];

    const subtopicsRaw = Array.isArray(topicRecord.subtopics) ? topicRecord.subtopics : [];
    const subtopics: SyllabusSubtopic[] = subtopicsRaw.slice(0, SUBTOPIC_LIMIT).flatMap((subtopic, subtopicIndex): SyllabusSubtopic[] => {
      const subtopicRecord = subtopic as Record<string, unknown>;
      const subtopicTitle = String(subtopicRecord.title ?? "").trim();
      if (!subtopicTitle) return [];

      const tasksRaw = Array.isArray(subtopicRecord.tasks) ? subtopicRecord.tasks : [];
      const tasks: SyllabusTask[] = tasksRaw.slice(0, TASK_LIMIT).flatMap((task, taskIndex): SyllabusTask[] => {
        const taskRecord = task as Record<string, unknown>;
        const taskTitle = String(taskRecord.title ?? "").trim();
        if (!taskTitle) return [];
        return [{
          key: slugify(String(taskRecord.key ?? taskTitle), `task-${topicIndex + 1}-${subtopicIndex + 1}-${taskIndex + 1}`),
          title: taskTitle,
          description: String(taskRecord.description ?? "").trim(),
          type: taskType(taskRecord.type, taskIndex),
          estimatedMinutes: numberInRange(taskRecord.estimatedMinutes, 30 + taskIndex * 10, 5, 240),
          resourceHint: String(taskRecord.resourceHint ?? "").trim(),
          completed: false,
          pointsAwarded: 0
        }];
      });

      while (tasks.length < MIN_TASKS) {
        tasks.push(fallbackTask(subtopicTitle, tasks.length));
      }

      return [{
        key: slugify(String(subtopicRecord.key ?? subtopicTitle), `subtopic-${topicIndex + 1}-${subtopicIndex + 1}`),
        title: subtopicTitle,
        description: String(subtopicRecord.description ?? "").trim(),
        order: numberInRange(subtopicRecord.order, subtopicIndex + 1, 1, SUBTOPIC_LIMIT),
        estimatedHours: numberInRange(subtopicRecord.estimatedHours, 2, 1, 80),
        progressPercent: 0,
        bonusAwarded: false,
        tasks
      }];
    });

    while (subtopics.length < MIN_SUBTOPICS) {
      const fallback = fallbackSubtopic(title, subtopics.length);
      subtopics.push({
        ...fallback,
        key: slugify(`${title}-${fallback.title}`, `subtopic-${topicIndex + 1}-${subtopics.length + 1}`)
      });
    }

    const levelRaw = String(topicRecord.level ?? "").toLowerCase();
    const level: SyllabusTopic["level"] =
      levelRaw === "basic" || levelRaw === "intermediate" || levelRaw === "advanced"
        ? levelRaw
        : levelForIndex(topicIndex, MIN_TOPICS);

    return [{
      key: slugify(String(topicRecord.key ?? title), `topic-${topicIndex + 1}`),
      title,
      description: String(topicRecord.description ?? "").trim(),
      level,
      order: numberInRange(topicRecord.order, topicIndex + 1, 1, TOPIC_LIMIT),
      subtopics
    }];
  });

  while (topics.length < MIN_TOPICS) {
    topics.push(fallbackTopic(goalTitle, topics.length, MIN_TOPICS));
  }

  const normalizedTopics = topics
    .slice(0, TOPIC_LIMIT)
    .sort((a, b) => a.order - b.order)
    .map((topic, index) => ({
      ...topic,
      level: levelForIndex(index, Math.max(topics.length, MIN_TOPICS)),
      order: index + 1,
      subtopics: topic.subtopics
        .slice(0, SUBTOPIC_LIMIT)
        .map((subtopic, subtopicIndex) => ({
          ...subtopic,
          order: subtopicIndex + 1,
          progressPercent: numberInRange(subtopic.progressPercent, 0, 0, 100),
          bonusAwarded: Boolean(subtopic.bonusAwarded),
          tasks: subtopic.tasks.slice(0, TASK_LIMIT)
        }))
    }));

  return ensureUniqueKeys(normalizedTopics);
}

function extractRetrySeconds(errorText: string) {
  const retryInfoMatch = errorText.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (retryInfoMatch) return Number(retryInfoMatch[1]);

  const retryTextMatch = errorText.match(/retry in\s+([\d.]+)s/i);
  if (retryTextMatch) return Math.ceil(Number(retryTextMatch[1]));

  return null;
}

function normalizeGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const retrySeconds = extractRetrySeconds(message);
  const isQuotaError =
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("quota") ||
    message.includes("\"code\":429") ||
    message.includes("429");

  if (isQuotaError) {
    const retryText = retrySeconds ? ` Retry after about ${retrySeconds} seconds.` : "";
    return `Gemini quota is exhausted for ${env.GEMINI_MODEL}.${retryText} Use a Gemini API key/project with available quota or try again later.`;
  }

  return message.length > 300 ? "Gemini syllabus generation failed. Please try again." : message;
}

function syllabusPrompt(goalTitle: string, goalDescription?: string) {
  return [
    "Return only compact JSON. No markdown.",
    "Create a full syllabus roadmap from basic foundations to advanced mastery.",
    "Coverage must be broad enough for a student to know exactly what to finish.",
    "Order topics from basic -> intermediate -> advanced. Use level values: basic, intermediate, advanced.",
    "Each topic needs 4-7 proper subtopics. Each subtopic needs 2-3 relevant tasks.",
    "Tasks must be actionable, not vague. Include type, estimatedMinutes, and resourceHint.",
    'Shape: {"topics":[{"order":1,"level":"basic","title":"","description":"","subtopics":[{"order":1,"title":"","description":"","estimatedHours":2,"tasks":[{"type":"read","title":"","description":"","estimatedMinutes":30,"resourceHint":""}]}]}]}',
    "Limits: 9-12 topics total, 4-7 subtopics/topic, 2-3 tasks/subtopic.",
    "Keep text concise. Avoid markdown. Avoid duplicate topics or generic filler.",
    `Goal: ${compactInput(goalTitle).slice(0, MAX_GOAL_CHARS)}`,
    `Details: ${compactInput(goalDescription, "none")}`
  ].join("\n");
}

function parseJsonObject(text: string, providerName: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as { topics?: unknown };
  } catch {
    throw new Error(`${providerName} returned invalid JSON`);
  }
}

async function generateWithGemini(goalTitle: string, goalDescription?: string): Promise<GeneratedSyllabus> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: syllabusPrompt(goalTitle, goalDescription),
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 8000
      }
    });
  } catch (error) {
    throw new Error(normalizeGeminiError(error));
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const parsed = parseJsonObject(text, "Gemini");
  return { topics: sanitizeTopics(parsed.topics, "Gemini", goalTitle) };
}

function normalizeOpenRouterError(status: number, text: string) {
  let message = text;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: number | string } };
    message = parsed.error?.message || text;
  } catch {
    // Keep raw text below if OpenRouter did not return JSON.
  }

  if (status === 401) return "OpenRouter API key is invalid or missing.";
  if (status === 402) return "OpenRouter account has insufficient credits for syllabus generation.";
  if (status === 429) return "OpenRouter rate limit reached. Please try again shortly.";

  return message.length > 300 ? `OpenRouter request failed with status ${status}.` : message;
}

async function generateWithOpenRouter(goalTitle: string, goalDescription?: string): Promise<GeneratedSyllabus> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.OPENROUTER_SITE_URL,
      "X-Title": env.OPENROUTER_APP_NAME
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: "You create concise student syllabus plans and return valid JSON only."
        },
        {
          role: "user",
          content: syllabusPrompt(goalTitle, goalDescription)
        }
      ],
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(normalizeOpenRouterError(response.status, responseText));
  }

  let content = "";
  try {
    const parsed = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = parsed.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new Error("OpenRouter returned an invalid API response");
  }

  if (!content) {
    throw new Error("OpenRouter returned an empty response");
  }

  const parsedContent = parseJsonObject(content, "OpenRouter");
  return { topics: sanitizeTopics(parsedContent.topics, "OpenRouter", goalTitle) };
}

type SyllabusAiProvider = "gemini" | "openrouter";

function selectedProvider(): SyllabusAiProvider {
  if (env.AI_SYLLABUS_PROVIDER === "openrouter") return "openrouter";
  if (env.AI_SYLLABUS_PROVIDER === "gemini") return "gemini";
  return env.OPENROUTER_API_KEY ? "openrouter" : "gemini";
}

export function getSyllabusAiModelLabel() {
  return selectedProvider() === "openrouter" ? `openrouter:${env.OPENROUTER_MODEL}` : `gemini:${env.GEMINI_MODEL}`;
}

export function getSyllabusAiProviderStatus() {
  const provider = selectedProvider();
  return {
    provider,
    model: provider === "openrouter" ? env.OPENROUTER_MODEL : env.GEMINI_MODEL,
    modelLabel: getSyllabusAiModelLabel(),
    configuredMode: env.AI_SYLLABUS_PROVIDER,
    hasOpenRouterKey: Boolean(env.OPENROUTER_API_KEY),
    hasGeminiKey: Boolean(env.GEMINI_API_KEY)
  };
}

export const syllabusAiService = {
  async generateSyllabus(goalTitle: string, goalDescription?: string): Promise<GeneratedSyllabus> {
    const provider = selectedProvider();
    if (provider === "openrouter") {
      try {
        return await generateWithOpenRouter(goalTitle, goalDescription);
      } catch (error) {
        if (env.AI_SYLLABUS_PROVIDER === "auto" && env.GEMINI_API_KEY) {
          return generateWithGemini(goalTitle, goalDescription);
        }
        throw error;
      }
    }

    return generateWithGemini(goalTitle, goalDescription);
  }
};
