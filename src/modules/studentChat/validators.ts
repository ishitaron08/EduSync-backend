import { z } from "zod";
import { env } from "../../config/env";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(env.AI_CHAT_MAX_INPUT_CHARS)
});

export const studentChatRequestSchema = z.object({
  body: z.object({
    message: z.string().trim().min(2).max(env.AI_CHAT_MAX_INPUT_CHARS),
    history: z.array(chatMessageSchema).max(env.AI_CHAT_MAX_HISTORY).optional()
  }),
  params: z.any(),
  query: z.any()
});

export type StudentChatRequestBody = z.infer<typeof studentChatRequestSchema>["body"];
