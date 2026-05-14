import { Router } from "express";
import { markAttendance } from "../modules/attendance/attendance.controller";
import { generateQrAttendance, getAttendanceStudents, getLiveAttendanceStatus } from "../modules/attendance/teacher.controller";
import { addExtraSession, teacherTimetable } from "../modules/timetable/timetable.controller";
import { setAvailability, teacherPerformance, getStudentProgress, getTeacherSections } from "../modules/users/users.controller";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { attendanceSchema } from "../modules/attendance/attendance.validater";
import { extraSessionSchema } from "../modules/timetable/timetable.validater";
import { availabilitySchema } from "../modules/users/users.validater";
import { getLeaderboard } from "../modules/leaderboard/controller";
import {
  teacherAssessmentAnalytics,
  teacherAssessmentExport,
  teacherCreateAssessment,
  teacherDeleteAssessment,
  teacherListAssessments,
  teacherPublishAssessment,
  teacherUpdateAssessment
} from "../modules/assessments/controller";
import { createAssessmentSchema, updateAssessmentSchema } from "../modules/assessments/validators";

const router = Router();

router.use(authenticate, authorize("teacher"));
router.get("/timetable", teacherTimetable);
router.post("/attendance", validateRequest(attendanceSchema), markAttendance);
router.post("/attendance/generate", generateQrAttendance);
router.get("/attendance/students", getAttendanceStudents);
router.get("/attendance/live-status", getLiveAttendanceStatus);
router.post("/extra-session", validateRequest(extraSessionSchema), addExtraSession);
router.patch("/availability", validateRequest(availabilitySchema), setAvailability);
router.get("/performance", teacherPerformance);
router.get("/students/progress", getStudentProgress);
router.get("/sections", getTeacherSections);
router.get("/leaderboard", getLeaderboard);
router.post("/assessments", validateRequest(createAssessmentSchema), teacherCreateAssessment);
router.get("/assessments", teacherListAssessments);
router.patch("/assessments/:id", validateRequest(updateAssessmentSchema), teacherUpdateAssessment);
router.delete("/assessments/:id", teacherDeleteAssessment);
router.patch("/assessments/:id/publish", teacherPublishAssessment);
router.get("/assessments/:id/analytics", teacherAssessmentAnalytics);
router.get("/assessments/:id/export", teacherAssessmentExport);

export default router;
