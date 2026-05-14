import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { studentChatService } from "./service";
import { StudentChatRequestBody } from "./validators";

export const getStudentChatStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await studentChatService.getStatus(String(req.user!.id));
  res.json(status);
});

export const sendStudentChatMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as StudentChatRequestBody;
  const response = await studentChatService.sendMessage({
    studentId: String(req.user!.id),
    message: body.message,
    history: body.history
  });
  res.json(response);
});
