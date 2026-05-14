import { NextFunction, Response } from "express";
import { randomUUID } from "crypto";
import { AuthRequest } from "../types";

export function requestContext(req: AuthRequest, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header("x-request-id");
  const requestId = typeof incomingRequestId === "string" && incomingRequestId.trim() ? incomingRequestId : randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
