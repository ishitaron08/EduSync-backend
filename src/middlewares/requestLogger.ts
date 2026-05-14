import { NextFunction, Response } from "express";
import { AuthRequest } from "../types";
import { logger } from "../utils/logger";

export function requestLogger(req: AuthRequest, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on("finish", () => {
    logger.info("request.completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id ?? null
    });
  });
  next();
}
