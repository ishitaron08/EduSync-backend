import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { redisClient } from "../config/redis";
import { AuthRequest, Role } from "../types";
import { AppError } from "../utils/appError";

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const cookieToken = req.cookies?.[env.ACCESS_COOKIE_NAME];
  const token = bearerToken ?? cookieToken ?? null;

  if (!token) {
    throw new AppError("Unauthorized", 401);
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { id: string; role: Role; sid?: string };
    if (payload.sid) {
      try {
        const session = await redisClient.get(`session:${payload.sid}`);
        if (!session) {
          throw new AppError("Session expired", 401);
        }
      } catch (error: unknown) {
        // Degrade gracefully: if Redis is unreachable, don't break JWT auth.
        if (error instanceof AppError) throw error;
      }
    }
    req.user = { id: payload.id, role: payload.role, sid: payload.sid };
    next();
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
}
