import mongoose, { Types } from "mongoose";
import { connectDB } from "../config/db";
import { Attendance } from "../models/Attendance";
import { AttendanceRecord } from "../models/AttendanceRecord";
import { Course } from "../models/Course";
import { Enrollment } from "../models/Enrollment";
import { Goal } from "../models/Goal";
import { Section } from "../models/Section";
import { StudentGoal } from "../models/StudentGoal";
import { StudentTask } from "../models/StudentTask";
import { StudentTimetable } from "../models/StudentTimetable";
import { Task } from "../models/Task";

const TERM = "fall";

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

async function migrateTimetables(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }
  const oldTimetables = await db.collection("timetables").find().toArray();
  for (const oldTimetable of oldTimetables) {
    const newSlots = [];

    for (const slot of oldTimetable.slots) {
      const code = normalizeCode(slot.subject);
      const course = await Course.findOneAndUpdate(
        { code },
        { $setOnInsert: { code, name: slot.subject, description: slot.className } },
        { upsert: true, returnDocument: "after" }
      );

      const sectionCode = normalizeCode(`${slot.className}_${slot.room}`);
      const section = await Section.findOneAndUpdate(
        { course: course._id, term: TERM, year: oldTimetable.year, sectionCode },
        {
          $setOnInsert: {
            course: course._id,
            term: TERM,
            year: oldTimetable.year,
            sectionCode,
            schedule: [{ day: slot.day, startTime: slot.startTime, endTime: slot.endTime, room: slot.room }]
          }
        },
        { upsert: true, returnDocument: "after" }
      );

      if (oldTimetable.student) {
        await Enrollment.updateOne(
          { student: oldTimetable.student, section: section._id },
          { $setOnInsert: { student: oldTimetable.student, section: section._id } },
          { upsert: true }
        );
      }

      newSlots.push({
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        section: section._id,
        className: slot.className,
        room: slot.room,
        subject: slot.subject,
        teacher: slot.teacher
      });
    }

    if (!oldTimetable.student) {
      continue;
    }

    await StudentTimetable.updateOne(
      { student: oldTimetable.student, term: TERM, year: oldTimetable.year },
      { $set: { student: oldTimetable.student, term: TERM, year: oldTimetable.year, slots: newSlots } },
      { upsert: true }
    );
  }
}

async function migrateGoalsAndTasks(): Promise<Map<string, Types.ObjectId>> {
  const goalIdMap = new Map<string, Types.ObjectId>();
  const goals = await Goal.find();
  for (const goal of goals) {
    const created = await StudentGoal.findOneAndUpdate(
      { student: goal.student, goalType: goal.goalType, targetDate: goal.targetDate },
      {
        $set: {
          student: goal.student,
          goalType: goal.goalType,
          targetDate: goal.targetDate,
          difficultyPreference: goal.difficultyPreference,
          progress: goal.progress
        }
      },
      { upsert: true, returnDocument: "after" }
    );
    goalIdMap.set(String(goal._id), created._id);
  }

  const tasks = await Task.find();
  for (const task of tasks) {
    await StudentTask.updateOne(
      { student: task.student, title: task.title, createdAt: task.createdAt },
      {
        $set: {
          student: task.student,
          goal: goalIdMap.get(String(task.goal)) ?? task.goal,
          title: task.title,
          category: task.category,
          status: task.status,
          durationMinutes: task.durationMinutes,
          pointsAwarded: task.pointsAwarded,
          completedAt: task.completedAt
        }
      },
      { upsert: true }
    );
  }

  return goalIdMap;
}

async function migrateAttendance(): Promise<void> {
  const attendanceRows = await Attendance.find();
  for (const row of attendanceRows) {
    const sectionCode = normalizeCode(`${row.className}_${row.subject}`);
    const courseCode = normalizeCode(row.subject);

    const course = await Course.findOneAndUpdate(
      { code: courseCode },
      { $setOnInsert: { code: courseCode, name: row.subject, description: row.className } },
      { upsert: true, returnDocument: "after" }
    );

    const section = await Section.findOneAndUpdate(
      { course: course._id, term: TERM, year: row.date.getUTCFullYear(), sectionCode },
      {
        $setOnInsert: {
          course: course._id,
          term: TERM,
          year: row.date.getUTCFullYear(),
          sectionCode,
          schedule: []
        }
      },
      { upsert: true, returnDocument: "after" }
    );

    const slotKey = `${row.className}_${row.subject}_${row.date.toISOString().slice(0, 10)}`;
    await AttendanceRecord.updateOne(
      { student: row.student, section: section._id, sessionDate: row.date, slotKey },
      {
        $set: {
          student: row.student,
          teacher: row.teacher,
          section: section._id,
          sessionDate: row.date,
          slotKey,
          status: row.status
        }
      },
      { upsert: true }
    );
  }
}

async function runMigration(): Promise<void> {
  await connectDB();
  await migrateTimetables();
  await migrateGoalsAndTasks();
  await migrateAttendance();
}

runMigration()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Schema v2 migration failed", error);
    await mongoose.disconnect();
    process.exit(1);
  });
