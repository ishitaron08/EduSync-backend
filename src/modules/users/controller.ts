import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { usersService } from "./users.service";
import { createAuditLog } from "../../services/auditService";
import { Timetable } from "../../models/Timetable";

export const adminUserCrud = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  if (req.method === "GET") {
    const result = await usersService.listUsers(Number(req.query.page ?? 1), Number(req.query.limit ?? 25));
    return void res.json(result);
  }
  if (req.method === "POST") {
    const user = await usersService.createUser(req.body as Record<string, unknown>) as unknown as Record<string, unknown>;
    await createAuditLog({
      actor: String(actor.id),
      actorRole: actor.role,
      action: "admin.user.create",
      resource: "User",
      metadata: {
        targetUserId: String(user._id ?? ""),
        targetUserName: String(user.name ?? ""),
        targetUserEmail: String(user.email ?? ""),
        targetUserRole: String(user.role ?? "")
      }
    });
    return void res.status(201).json(user);
  }
  if (req.method === "PUT") {
    const user = await usersService.updateUser(String(req.params.id), req.body as Record<string, unknown>) as unknown as Record<string, unknown>;
    await createAuditLog({
      actor: String(actor.id),
      actorRole: actor.role,
      action: "admin.user.update",
      resource: "User",
      metadata: {
        targetUserId: req.params.id,
        targetUserName: String(user.name ?? ""),
        targetUserEmail: String(user.email ?? ""),
        targetUserRole: String(user.role ?? ""),
        changes: Object.keys(req.body as Record<string, unknown>)
      }
    });
    return void res.json(user);
  }
  // DELETE - look up user before deleting to capture details
  const userToDelete = await usersService.getUserById(String(req.params.id));
  await usersService.deleteUser(String(req.params.id));
  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.user.delete",
    resource: "User",
    metadata: {
      targetUserId: req.params.id,
      targetUserName: userToDelete?.name ?? "Unknown",
      targetUserEmail: userToDelete?.email ?? "",
      targetUserRole: userToDelete?.role ?? ""
    }
  });
  res.status(204).send();
});

export const bulkUploadUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const users = req.body.users;
  if (!Array.isArray(users)) {
    return void res.status(400).json({ message: "Invalid payload, expected 'users' array" });
  }
  
  const createdUsers: Record<string, unknown>[] = [];
  for (const userData of users) {
    try {
      const user = await usersService.createUser(userData as Record<string, unknown>) as unknown as Record<string, unknown>;
      createdUsers.push(user);
    } catch (error) {
      console.error("Failed to create user in bulk upload:", error);
    }
  }

  await createAuditLog({
    actor: String(actor.id),
    actorRole: actor.role,
    action: "admin.user.bulk_create",
    resource: "User",
    metadata: {
      count: createdUsers.length,
      createdUserNames: createdUsers.map(u => String(u.name ?? "Unknown"))
    }
  });
  
  res.status(201).json({ created: createdUsers.length, totalAttempted: users.length });
});

export const setAvailability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const teacher = await usersService.setAvailability(String(req.user!.id), req.body.availability ?? []);
  res.json(teacher);
});

export const teacherPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const topStudents = await usersService.getTeacherTopStudents(String(req.user!.id));
  res.json(topStudents);
});

export const studentRewardPoints = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await usersService.getRewardPoints(String(req.user!.id));
  res.json(student);
});

export const getStudentProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const progress = await usersService.getStudentProgress(String(req.user!.id));
  res.json(progress);
});

export const getTeacherSections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timetables = await Timetable.find({ "slots.teacher": String(req.user!.id) })
    .populate({
      path: "section",
      select: "sectionCode course term year capacity",
      populate: { path: "course", select: "code name" }
    })
    .sort({ year: -1, term: 1 })
    .lean();

  const sectionsById = new Map<string, unknown>();
  for (const timetable of timetables) {
    const section = timetable.section as any;
    if (section?._id) {
      const attendanceSlots = (timetable.slots ?? [])
        .filter((slot: any) => String(slot.teacher?._id ?? slot.teacher) === String(req.user!.id))
        .map((slot: any) => ({
          key: `${slot.day}:${slot.startTime}-${slot.endTime}`,
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          subject: slot.subject,
          className: slot.className,
          room: slot.room
        }));
      const existing = sectionsById.get(String(section._id)) as any;
      sectionsById.set(String(section._id), {
        ...section,
        attendanceSlots: [
          ...(existing?.attendanceSlots ?? []),
          ...attendanceSlots
        ]
      });
    }
  }
  const sections = Array.from(sectionsById.values());
  res.json(sections);
});

export const updateStudentProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await usersService.updateStudentProfile(String(req.user!.id), req.body);
  res.json(user);
});

export const getStudentProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await usersService.getStudentProfile(String(req.user!.id));
  res.json(user);
});
