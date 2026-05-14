import { Request } from "express";

export type Role = "admin" | "teacher" | "student";

export interface AuthPayload {
  id: string;
  role: Role;
  sid?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  requestId?: string;
}
