import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { leaderboardService } from "./service";

export const getLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const scopeParam = String(req.query.scope ?? "all_time");
  const scope = scopeParam === "weekly" || scopeParam === "monthly" ? scopeParam : "all_time";
  const leaderboard = await leaderboardService.getLeaderboard(scope);
  res.json(leaderboard);
});
