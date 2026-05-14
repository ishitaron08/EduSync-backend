import { Router } from "express";
import {
  addExtraSession,
  adminCreateTimetable,
  studentFreeSlots,
  studentTimetable,
  teacherTimetable
} from "./timetable.controller";

const timetableRoute = Router();

timetableRoute.post("/", adminCreateTimetable);
timetableRoute.get("/teacher", teacherTimetable);
timetableRoute.post("/extra-session", addExtraSession);
timetableRoute.get("/student", studentTimetable);
timetableRoute.get("/free-slots", studentFreeSlots);

export default timetableRoute;
