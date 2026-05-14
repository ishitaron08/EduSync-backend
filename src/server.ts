import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { connectRedis } from "./config/redis";
import { logger } from "./utils/logger";
import { setupGracefulShutdown } from "./config/gracefulShutdown";

async function bootstrap() {
  await connectDB();
  try {
    await connectRedis();
  } catch (error: unknown) {
    logger.warn("redis.connect_failed__continuing_without_sessions", {
      error: error instanceof Error ? error.message : "unknown_error"
    });
  }
  const server = app.listen(env.PORT, () => {
    if (env.CONSOLE_STARTUP_BANNER) {
      console.log(`Server started on port ${env.PORT}`);
    }
  });
  setupGracefulShutdown(server);
}

bootstrap().catch((error: unknown) => {
  logger.error("server.startup_failed", {
    error: error instanceof Error ? error.message : "unknown_error"
  });
  process.exit(1);
});
