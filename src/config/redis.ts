import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: true
});

redisClient.on("error", (error) => {
  logger.warn("redis.error", { error: error.message });
});

export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  logger.info("redis.connected");
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient.status === "ready" || redisClient.status === "connecting") {
      await redisClient.quit();
      logger.info("redis.disconnected");
    }
  } catch (error) {
    // Redis may already be disconnected, ignore the error
    logger.warn("redis.disconnect.warning", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}
