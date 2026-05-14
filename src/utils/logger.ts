type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

import { env } from "../config/env";

const levelPriority: Record<LogLevel, number> = {
  info: 3,
  warn: 2,
  error: 1
};

function shouldLog(level: LogLevel): boolean {
  if (env.LOG_LEVEL === "silent") {
    return false;
  }
  if (env.LOG_LEVEL === "error") {
    return level === "error";
  }
  if (env.LOG_LEVEL === "warn") {
    return level === "warn" || level === "error";
  }
  return levelPriority[level] <= levelPriority.info;
}

function write(level: LogLevel, message: string, payload: LogPayload = {}): void {
  if (!shouldLog(level)) {
    return;
  }
  const event = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...payload
  };
  const serialized = JSON.stringify(event);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export const logger = {
  info: (message: string, payload?: LogPayload) => write("info", message, payload),
  warn: (message: string, payload?: LogPayload) => write("warn", message, payload),
  error: (message: string, payload?: LogPayload) => write("error", message, payload)
};
