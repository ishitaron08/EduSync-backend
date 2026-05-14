import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { goalsService } from "./goals.service";

export const createGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goal = await goalsService.createGoal(req.body as Record<string, unknown>, String(req.user!.id));
  res.status(201).json(goal);
});

export const getGoals = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goals = await goalsService.listGoals(String(req.user!.id));
  res.json(goals);
});

export const updateGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const goal = await goalsService.updateGoal(String(req.params.id), String(req.user!.id), req.body as Record<string, unknown>);
  res.json(goal);
});

export const deleteGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  await goalsService.deleteGoal(String(req.params.id), String(req.user!.id));
  res.status(204).send();
});
