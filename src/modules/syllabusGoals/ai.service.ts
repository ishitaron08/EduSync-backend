import { env } from "../../config/env";
import { GeneratedSyllabus, SyllabusTopic } from "./types";

const MAX_GOAL_CHARS = 120;
const MAX_DETAILS_CHARS = 180;

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

function sanitizeTopics(rawTopics: unknown, providerName = "AI provider"): SyllabusTopic[] {
  if (!Array.isArray(rawTopics)) {
    throw new Error(`${providerName} response did not include a topics array`);
  }

  const topics = rawTopics.slice(0, 8).map((topic, topicIndex) => {
    const topicRecord = topic as Record<string, unknown>;
    const title = String(topicRecord.title ?? "").trim();
    if (!title) throw new Error(`Topic ${topicIndex + 1} is missing a title`);

    const subtopicsRaw = Array.isArray(topicRecord.subtopics) ? topicRecord.subtopics : [];
    const subtopics = subtopicsRaw.slice(0, 8).map((subtopic, subtopicIndex) => {
      const subtopicRecord = subtopic as Record<string, unknown>;
      const subtopicTitle = String(subtopicRecord.title ?? "").trim();
      if (!subtopicTitle) throw new Error(`Subtopic ${subtopicIndex + 1} is missing a title`);

      const tasksRaw = Array.isArray(subtopicRecord.tasks) ? subtopicRecord.tasks : [];
      const tasks = tasksRaw.slice(0, 6).map((task, taskIndex) => {
        const taskRecord = task as Record<string, unknown>;
        const taskTitle = String(taskRecord.title ?? "").trim();
        if (!taskTitle) throw new Error(`Task ${taskIndex + 1} is missing a title`);
        return {
          title: taskTitle,
          description: String(taskRecord.description ?? "").trim()
        };
      });

      return {
        key: slugify(String(subtopicRecord.key ?? subtopicTitle), `subtopic-${topicIndex + 1}-${subtopicIndex + 1}`),
        title: subtopicTitle,
        description: String(subtopicRecord.description ?? "").trim(),
        progressPercent: 0,
        tasks
      };
    });

    return {
      key: slugify(String(topicRecord.key ?? title), `topic-${topicIndex + 1}`),
      title,
      description: String(topicRecord.description ?? "").trim(),
      subtopics
    };
  });

  if (topics.length === 0) {
    throw new Error(`${providerName} response produced no syllabus topics`);
  }
  return topics;
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
    'Shape: {"topics":[{"title":"","subtopics":[{"title":"","tasks":[{"title":""}]}]}]}',
    "Limits: 4 topics, 3 subtopics/topic, 2 short tasks/subtopic.",
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
        maxOutputTokens: 1200
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
  return { topics: sanitizeTopics(parsed.topics, "Gemini") };
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
      max_tokens: 1200,
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
  return { topics: sanitizeTopics(parsedContent.topics, "OpenRouter") };
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
