import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { AppError, asyncHandler } from "../common/common.utiles";
import { tasksService } from "./tasks.service";

export const createTask = asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await tasksService.createTask(req.body as Record<string, unknown>, String(req.user!.id));
  res.status(201).json(task);
});

export const listTasks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tasks = await tasksService.listTasks(String(req.user!.id));
  res.json(tasks);
});

export const updateTask = asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await tasksService.updateTask(String(req.params.id), String(req.user!.id), req.body as Record<string, unknown>);
  if (!task) {
    throw new AppError("Task not found", 404);
  }
  res.json(task);
});

export const completeStudentTask = asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await tasksService.completeTask(String(req.params.id), String(req.user!.id));
  if (!task) {
    throw new AppError("Task not found or already completed", 404);
  }
  res.json(task);
});

export const getTaskRecommendations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const duration = parseInt(req.query.duration as string) || 60;
  const recommendations = await tasksService.getTaskRecommendations(String(req.user!.id), duration);
  res.json(recommendations);
});
