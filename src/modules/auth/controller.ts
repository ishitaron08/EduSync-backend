import { Request, Response } from "express";
import { env } from "../../config/env";
import { asyncHandler } from "../common/common.utiles";
import { authService } from "./auth.service";
import { AuthRequest } from "../../types";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body);
  res.cookie(result.cookies.access.name, result.cookies.access.value, result.cookies.access.options);
  res.cookie(result.cookies.refresh.name, result.cookies.refresh.value, result.cookies.refresh.options);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body);
  res.cookie(result.cookies.access.name, result.cookies.access.value, result.cookies.access.options);
  res.cookie(result.cookies.refresh.name, result.cookies.refresh.value, result.cookies.refresh.options);
  res.status(200).json(result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  const result = await authService.refreshSession(refreshToken);
  res.cookie(result.cookies.access.name, result.cookies.access.value, result.cookies.access.options);
  res.cookie(result.cookies.refresh.name, result.cookies.refresh.value, result.cookies.refresh.options);
  res.status(200).json(result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  await authService.logout(refreshToken);
  const clearCookies = authService.clearAuthCookies();
  res.clearCookie(clearCookies.access.name, clearCookies.access.options);
  res.clearCookie(clearCookies.refresh.name, clearCookies.refresh.options);
  res.status(200).json({ success: true });
});

export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await authService.getCurrentUser(String(req.user?.id));
  res.status(200).json(result);
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await authService.updateProfile(String(req.user?.id), req.body);
  res.status(200).json(result);
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await authService.changePassword(String(req.user?.id), req.body);
  res.status(200).json(result);
});
