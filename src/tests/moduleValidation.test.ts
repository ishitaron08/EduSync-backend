import assert from "node:assert/strict";
import test from "node:test";
import { attendanceSchema } from "../modules/attendance/attendance.validater";
import { createGoalSchema } from "../modules/goals/goals.validater";
import { createTaskSchema } from "../modules/tasks/tasks.validater";
import { adminCreateUserSchema } from "../modules/users/users.validater";
import { createAssessmentSchema } from "../modules/assessments/validators";

test("adminCreateUserSchema validates required fields", () => {
  const parsed = adminCreateUserSchema.parse({
    name: "Teacher One",
    email: "teacher@example.com",
    password: "secret123",
    role: "teacher"
  });
  assert.equal(parsed.role, "teacher");
});

test("createGoalSchema rejects invalid goal type", () => {
  assert.throws(() => createGoalSchema.parse({
    goalType: "invalid_goal",
    targetDate: "2027-02-01",
    difficultyPreference: "easy"
  }));
});

test("createTaskSchema validates object id fields", () => {
  const parsed = createTaskSchema.parse({
    goal: "64c0d9860f317b1d4a7f8e12",
    title: "Complete chapter 1",
    category: "study",
    durationMinutes: 45
  });
  assert.equal(parsed.durationMinutes, 45);
});

test("attendanceSchema rejects malformed section id", () => {
  assert.throws(() => attendanceSchema.parse({
    student: "64c0d9860f317b1d4a7f8e12",
    section: "bad-id",
    sessionDate: "2026-06-01",
    slotKey: "monday_0900",
    status: "present"
  }));
});

test("createAssessmentSchema rejects written assessment without paper URL and rubric", () => {
  assert.throws(() => createAssessmentSchema.parse({
    section: "64c0d9860f317b1d4a7f8e12",
    title: "Written paper",
    type: "written",
    startTime: new Date(Date.now() + 60_000),
    endTime: new Date(Date.now() + 3_600_000),
    durationMinutes: 30,
    questions: []
  }));
});

test("createAssessmentSchema accepts written assessment with typed questions and rubric", () => {
  const parsed = createAssessmentSchema.parse({
    section: "64c0d9860f317b1d4a7f8e12",
    title: "Written paper",
    type: "written",
    startTime: new Date(Date.now() + 60_000),
    endTime: new Date(Date.now() + 3_600_000),
    durationMinutes: 30,
    rubric: "Grade for clarity and correctness.",
    questions: [
      { prompt: "Explain the concept.", marks: 10 }
    ]
  });
  assert.equal(parsed.questions.length, 1);
});

test("createAssessmentSchema rejects MCQ question without correct answer", () => {
  assert.throws(() => createAssessmentSchema.parse({
    section: "64c0d9860f317b1d4a7f8e12",
    title: "Quiz",
    type: "mcq",
    startTime: new Date(Date.now() + 60_000),
    endTime: new Date(Date.now() + 3_600_000),
    durationMinutes: 30,
    questions: [
      { prompt: "Pick one", options: ["A", "B"], marks: 1 }
    ]
  }));
});
