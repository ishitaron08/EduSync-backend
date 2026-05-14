import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { goalLibraryService } from "./service";

/**
 * GET /student/goal-library
 * Returns all goals (defaults + community) sorted by popularity.
 */
export const listGoalLibrary = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const goals = await goalLibraryService.listGoals();
  res.json(goals);
});

/**
 * POST /student/goal-library
 * Body: { title: string }
 *
 * Selects an existing goal or creates a new community goal, then sets it
 * as the authenticated student's active learningGoal.
 */
export const selectOrCreateGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title } = req.body as { title: string };
  const goal = await goalLibraryService.selectOrCreateGoal(title, String(req.user!.id));
  res.status(200).json(goal);
});
