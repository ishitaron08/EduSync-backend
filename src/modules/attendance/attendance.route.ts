import { Router } from "express";
import { markAttendance } from "./attendance.controller";

const attendanceRoute = Router();

attendanceRoute.post("/", markAttendance);

export default attendanceRoute;
