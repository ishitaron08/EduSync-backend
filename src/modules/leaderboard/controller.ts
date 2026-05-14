import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { leaderboardService } from "./service";

export const getLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scopeParam = String(req.query.scope ?? "all_time");
  const scope = scopeParam === "weekly" || scopeParam === "monthly" ? scopeParam : "all_time";
  const requestedLimit = Number(req.query.limit ?? 20);
  const limit = req.user?.role === "teacher" || req.user?.role === "admin"
    ? Math.min(1000, Math.max(1, requestedLimit))
    : 20;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const leaderboard = await leaderboardService.getLeaderboard(scope, { limit, q });
  res.json(leaderboard);
});
