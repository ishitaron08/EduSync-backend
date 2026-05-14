import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";
import { AuthRequest } from "../types";

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const authReq = req as AuthRequest;
  logger.error("request.failed", {
    requestId: authReq.requestId,
    method: req.method,
    path: req.originalUrl,
    error: err.message
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: "APP_ERROR"
      },
      requestId: authReq.requestId
    });
    return;
  }
  res.status(500).json({
    error: {
      message: "Internal Server Error",
      code: "INTERNAL_ERROR"
    },
    requestId: authReq.requestId
  });
}
