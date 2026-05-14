import { Server } from "http";
import mongoose from "mongoose";
import { disconnectRedis } from "./redis";
import { logger } from "../utils/logger";

export function setupGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn("shutdown.started", { signal });

    // Force close connections after timeout
    server.close(async () => {
      try {
        await disconnectRedis();
        await mongoose.connection.close();
        logger.info("shutdown.completed");
        process.exit(0);
      } catch (error) {
        logger.error("shutdown.failed", {
          error: error instanceof Error ? error.message : "unknown_error"
        });
        process.exit(1);
      }
    });

    // Force exit if server.close hangs (no active connections to close)
    setTimeout(async () => {
      try {
        await disconnectRedis();
        await mongoose.connection.close();
      } catch {
        // Ignore cleanup errors on forced exit
      }
      logger.warn("shutdown.forced");
      process.exit(0);
    }, 5000).unref();

    setTimeout(() => {
      logger.error("shutdown.timeout");
      process.exit(1);
    }, 30000).unref();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("process.unhandledRejection", {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
    void shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    logger.error("process.uncaughtException", { error: error.message });
    void shutdown("uncaughtException");
  });
}
