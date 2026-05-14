import { Request, Response } from "express";
import { asyncHandler } from "../common/common.utiles";
import { mlService } from "./ml.service";
import { recommendationInputSchema, recommendationV2InputSchema } from "./ml.validater";

export const recommendTask = asyncHandler(async (req: Request, res: Response) => {
  const payload = recommendationInputSchema.parse(req.body);
  const result = await mlService.getRecommendation(payload);
  res.json(result);
});

export const recommendTaskV2 = asyncHandler(async (req: Request, res: Response) => {
  const payload = recommendationV2InputSchema.parse(req.body);
  const result = await mlService.getRecommendationV2(payload);
  res.json(result);
});
