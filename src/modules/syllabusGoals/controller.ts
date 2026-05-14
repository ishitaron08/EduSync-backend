import { Response } from "express";
import { AuthRequest } from "../../types";
import { asyncHandler } from "../common/common.utiles";
import { syllabusGoalsService } from "./service";

export const getSyllabusGoals = asyncHandler(async (req: AuthRequest, res: Response) => {
  const dashboard = await syllabusGoalsService.getDashboard(String(req.user!.id));
  res.json(dashboard);
});

export const getSyllabusAiProvider = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(syllabusGoalsService.getProviderStatus());
});

export const selectSyllabusGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const dashboard = await syllabusGoalsService.selectGoal(String(req.user!.id), req.body);
  res.status(201).json(dashboard);
});

export const createCustomSyllabusGoal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const dashboard = await syllabusGoalsService.createCustomGoal(String(req.user!.id), req.body);
  res.status(201).json(dashboard);
});

export const updateSyllabusProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = await syllabusGoalsService.updateProgress(String(req.user!.id), req.body);
  res.json(plan);
});

export const completeSyllabusTask = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await syllabusGoalsService.completeTask(String(req.user!.id), req.body);
  res.json(result);
});

export const updateSyllabusTaskStudy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = await syllabusGoalsService.updateTaskStudy(String(req.user!.id), req.body);
  res.json(plan);
});
