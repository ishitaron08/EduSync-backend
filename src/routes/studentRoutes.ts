import { Router } from "express";
import { createGoal, deleteGoal, getGoals, updateGoal } from "../modules/goals/goals.controller";
import { scanQrAttendance, getStudentAttendanceHistory, getStudentAttendanceStats } from "../modules/attendance/student.controller";
import {
  studentAssessmentResults,
  studentTakeAssessment,
  studentListAssessments,
  studentStartAssessmentAttempt,
  studentSubmitAssessmentAttempt
} from "../modules/assessments/controller";
import { completeStudentTask, createTask, listTasks, updateTask, getTaskRecommendations } from "../modules/tasks/controller";
import { studentRewardPoints, updateStudentProfile, getStudentProfile } from "../modules/users/controller";
import { getLeaderboard } from "../modules/leaderboard/controller";
import { studentFreeSlots, studentTimetable } from "../modules/timetable/controller";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { createGoalSchema, updateGoalSchema } from "../modules/goals/goals.validater";
import { createTaskSchema, updateTaskSchema } from "../modules/tasks/tasks.validater";
import { submitAssessmentSchema } from "../modules/assessments/validators";
import {
  createCustomSyllabusGoal,
  getSyllabusAiProvider,
  getSyllabusGoals,
  regenerateSyllabus,
  selectSyllabusGoal,
  updateSyllabusProgress
} from "../modules/syllabusGoals/controller";
import {
  createCustomSyllabusGoalSchema,
  selectSyllabusGoalSchema,
  updateSyllabusProgressSchema
} from "../modules/syllabusGoals/validators";

const router = Router();

router.use(authenticate, authorize("student"));
router.get("/timetable", studentTimetable);
router.post("/attendance/scan", scanQrAttendance);
router.get("/attendance/history", getStudentAttendanceHistory);
router.get("/attendance/stats", getStudentAttendanceStats);
router.get("/free-slots", studentFreeSlots);
router.get("/profile", getStudentProfile);
router.patch("/profile", updateStudentProfile);
router.get("/syllabus-goals", getSyllabusGoals);
router.get("/syllabus-goals/provider", getSyllabusAiProvider);
router.post("/syllabus-goals/select", validateRequest(selectSyllabusGoalSchema), selectSyllabusGoal);
router.post("/syllabus-goals/custom", validateRequest(createCustomSyllabusGoalSchema), createCustomSyllabusGoal);
router.patch("/syllabus-goals/progress", validateRequest(updateSyllabusProgressSchema), updateSyllabusProgress);
router.post("/syllabus-goals/regenerate", regenerateSyllabus);
router.post("/goals", validateRequest(createGoalSchema), createGoal);
router.get("/goals", getGoals);
router.patch("/goals/:id", validateRequest(updateGoalSchema), updateGoal);
router.delete("/goals/:id", deleteGoal);
router.get("/tasks/recommendations", getTaskRecommendations);
router.post("/tasks", validateRequest(createTaskSchema), createTask);
router.get("/tasks", listTasks);
router.patch("/tasks/:id", validateRequest(updateTaskSchema), updateTask);
router.patch("/tasks/:id/complete", completeStudentTask);
router.get("/reward-points", studentRewardPoints);
router.get("/leaderboard", getLeaderboard);
router.get("/assessments", studentListAssessments);
router.get("/assessments/:id/take", studentTakeAssessment);
router.post("/assessments/:id/attempts/start", studentStartAssessmentAttempt);
router.post("/assessments/:id/attempts/submit", validateRequest(submitAssessmentSchema), studentSubmitAssessmentAttempt);
router.get("/assessments/results", studentAssessmentResults);

export default router;
