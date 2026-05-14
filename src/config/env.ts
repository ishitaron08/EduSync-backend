import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });
const isTest = process.env.NODE_ENV === "test";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: isTest ? z.string().default("mongodb://localhost:27017/test") : z.string().min(1),
  JWT_ACCESS_SECRET: isTest ? z.string().default("test-access-secret-key-123456") : z.string().min(16),
  JWT_REFRESH_SECRET: isTest ? z.string().default("test-refresh-secret-key-123456") : z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  REDIS_URL: isTest ? z.string().default("redis://localhost:6379") : z.string().min(1),
  ACCESS_COOKIE_NAME: z.string().default("edusync_access"),
  REFRESH_COOKIE_NAME: z.string().default("edusync_refresh"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  AI_SYLLABUS_PROVIDER: z.enum(["auto", "gemini", "openrouter"]).default("auto"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_SITE_URL: z.string().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().default("EduSync"),
  LOG_LEVEL: z.enum(["silent", "error", "warn", "info"]).default("error"),
  CONSOLE_STARTUP_BANNER: z.coerce.boolean().default(true)
});

export const env = envSchema.parse(process.env);
