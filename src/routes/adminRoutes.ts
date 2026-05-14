import { Router } from "express";
import { getMasterTimetable, updateMasterTimetable, listMasterTimetables } from "../modules/timetable/admin.controller";
import { getSystemSettings, updateSystemSettings } from "../modules/settings/settings.controller";
import { getAttendanceStats } from "../modules/attendance/admin.controller";
import { getLearningAnalytics } from "../modules/ml/admin.controller";
import { adminUserCrud, bulkUploadUsers } from "../modules/users/users.controller";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { validateRequest } from "../middlewares/validateRequest";
import { adminCreateUserSchema, adminUpdateUserSchema } from "../modules/users/users.validater";
import { AuditLog } from "../models/AuditLog";
import { adminListAssessments } from "../modules/assessments/controller";
import { getLeaderboard } from "../modules/leaderboard/controller";
import {
  adminCourseListEnvelope,
  adminCourseStatusEnvelope,
  adminStudentSnapshotEnvelope,
  adminUserListEnvelope,
  adminSectionStudentsEnvelope,
  adminAddStudentsEnvelope,
  adminRemoveStudentEnvelope,
  adminCreateSectionEnvelope,
  adminUpdateSectionEnvelope,
  getOverviewMetrics,
  getDashboardMetrics,
  getStudentSnapshot,
  listCoursesAdmin,
  listUsersAdmin,
  setCourseStatus,
  listSectionsAdmin,
  createSectionAdmin,
  updateSectionAdmin,
  deleteSectionAdmin,
  getSectionStudents,
  addStudentsToSection,
  removeStudentFromSection,
  listStudentsForSelection
} from "../modules/admin";

const router = Router();

router.use(authenticate, authorize("admin"));
router.get("/metrics/dashboard", getDashboardMetrics);
router.get("/metrics/overview", getOverviewMetrics);
router.get("/timetable/master/list", listMasterTimetables);
router.get("/timetable/master", getMasterTimetable);
router.put("/timetable/master", updateMasterTimetable);
// NOTE: POST /timetable was removed — it bypassed teacher/room conflict
// detection. All timetable writes must go through PUT /timetable/master
// which runs full conflict checks before saving.
router.get("/users", validateRequest(adminUserListEnvelope), listUsersAdmin);
router.post("/users/bulk", bulkUploadUsers);
router.post("/users", validateRequest(adminCreateUserSchema), adminUserCrud);
router.put("/users/:id", validateRequest(adminUpdateUserSchema), adminUserCrud);
router.delete("/users/:id", adminUserCrud);
router.get("/courses", validateRequest(adminCourseListEnvelope), listCoursesAdmin);
router.patch(
  "/courses/:id/status",
  validateRequest(adminCourseStatusEnvelope),
  setCourseStatus
);
router.get("/sections", listSectionsAdmin);
router.post("/sections", validateRequest(adminCreateSectionEnvelope), createSectionAdmin);
router.put("/sections/:id", validateRequest(adminUpdateSectionEnvelope), updateSectionAdmin);
router.delete("/sections/:id", deleteSectionAdmin);
router.get("/sections/:id/students", validateRequest(adminSectionStudentsEnvelope), getSectionStudents);
router.post("/sections/:id/students", validateRequest(adminAddStudentsEnvelope), addStudentsToSection);
router.delete("/sections/:id/students/:studentId", validateRequest(adminRemoveStudentEnvelope), removeStudentFromSection);
router.get("/students", listStudentsForSelection);
router.get(
  "/students/:id/snapshot",
  validateRequest(adminStudentSnapshotEnvelope),
  getStudentSnapshot
);
router.get("/audit-logs", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actor", "name email"),
      AuditLog.countDocuments()
    ]);
    res.json({ logs, total, page, limit });
  } catch (error) {
    next(error);
  }
});
router.get("/assessments", adminListAssessments);
router.get("/leaderboard", getLeaderboard);
router.get("/settings", getSystemSettings);
router.put("/settings", updateSystemSettings);
router.get("/attendance/stats", getAttendanceStats);
router.get("/analytics/learning", getLearningAnalytics);

export default router;
