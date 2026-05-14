import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { redisClient } from "../config/redis";
import { AttendanceRecord } from "../models/AttendanceRecord";
import { Enrollment } from "../models/Enrollment";
import { QrSession } from "../models/QrSession";
import { Section } from "../models/Section";
import { Timetable } from "../models/Timetable";
import {
  authorizeTeacherForAttendanceSlot,
  generateQrAttendanceSession,
  scanQrAttendanceSession
} from "../modules/attendance/session.service";
import { AppError } from "../modules/common/common.utiles";

function leanResult(value: unknown) {
  return {
    lean: async () => value
  };
}

function selectLeanResult(value: unknown) {
  return {
    select: () => leanResult(value)
  };
}

test("authorizeTeacherForAttendanceSlot rejects a slot not assigned to the teacher", async () => {
  const originalFindById = Section.findById;
  const originalFindOne = Timetable.findOne;

  try {
    (Section as any).findById = () => leanResult({ _id: new Types.ObjectId() });
    (Timetable as any).findOne = () => selectLeanResult({
      slots: [
        { day: "monday", startTime: "09:00", endTime: "10:00", teacher: new Types.ObjectId() }
      ]
    });

    await assert.rejects(
      () => authorizeTeacherForAttendanceSlot({
        teacherId: String(new Types.ObjectId()),
        sectionId: String(new Types.ObjectId()),
        slotKey: "monday:09:00-10:00"
      }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 403 &&
        error.message.includes("Teacher is not assigned")
    );
  } finally {
    (Section as any).findById = originalFindById;
    (Timetable as any).findOne = originalFindOne;
  }
});

test("generateQrAttendanceSession stores token under the qrSession-specific Redis key", async () => {
  const teacherId = String(new Types.ObjectId());
  const sectionId = String(new Types.ObjectId());
  const qrSessionId = new Types.ObjectId();
  const originalFindById = Section.findById;
  const originalTimetableFindOne = Timetable.findOne;
  const originalUpdateMany = QrSession.updateMany;
  const originalQrFindOne = QrSession.findOne;
  const originalCreate = QrSession.create;
  const originalStatus = redisClient.status;
  const originalSetex = redisClient.setex;
  let redisKey = "";

  try {
    (Section as any).findById = () => leanResult({ _id: sectionId });
    (Timetable as any).findOne = () => selectLeanResult({
      slots: [
        { day: "monday", startTime: "09:00", endTime: "10:00", teacher: teacherId, className: "Class", subject: "Math", room: "101" }
      ]
    });
    (QrSession as any).updateMany = async () => ({ modifiedCount: 0 });
    (QrSession as any).findOne = () => ({ sort: async () => null });
    (QrSession as any).create = async () => ({
      _id: qrSessionId,
      expiresAt: new Date(Date.now() + 300000)
    });
    Object.defineProperty(redisClient, "status", { value: "ready", configurable: true });
    redisClient.setex = (async (key: string) => {
      redisKey = key;
      return "OK";
    }) as any;

    const result = await generateQrAttendanceSession({
      teacherId,
      sectionId,
      slotKey: "monday:09:00-10:00"
    });

    assert.equal(result.qrSessionId, String(qrSessionId));
    assert.equal(redisKey, `attendance:session:${qrSessionId}`);
  } finally {
    (Section as any).findById = originalFindById;
    (Timetable as any).findOne = originalTimetableFindOne;
    (QrSession as any).updateMany = originalUpdateMany;
    (QrSession as any).findOne = originalQrFindOne;
    (QrSession as any).create = originalCreate;
    Object.defineProperty(redisClient, "status", { value: originalStatus, configurable: true });
    redisClient.setex = originalSetex;
  }
});

test("scanQrAttendanceSession rejects students not enrolled in the session section", async () => {
  const teacherId = String(new Types.ObjectId());
  const sectionId = String(new Types.ObjectId());
  const qrSessionId = new Types.ObjectId();
  const studentId = String(new Types.ObjectId());
  const originalFindById = Section.findById;
  const originalTimetableFindOne = Timetable.findOne;
  const originalUpdateMany = QrSession.updateMany;
  const originalQrFindOne = QrSession.findOne;
  const originalCreate = QrSession.create;
  const originalQrFindById = QrSession.findById;
  const originalEnrollmentFindOne = Enrollment.findOne;
  const originalStatus = redisClient.status;
  const originalSetex = redisClient.setex;
  const originalGet = redisClient.get;
  let token = "";

  try {
    (Section as any).findById = () => leanResult({ _id: sectionId });
    (Timetable as any).findOne = () => selectLeanResult({
      slots: [
        { day: "monday", startTime: "09:00", endTime: "10:00", teacher: teacherId, className: "Class", subject: "Math", room: "101" }
      ]
    });
    (QrSession as any).updateMany = async () => ({ modifiedCount: 0 });
    (QrSession as any).findOne = () => ({ sort: async () => null });
    (QrSession as any).create = async () => ({
      _id: qrSessionId,
      expiresAt: new Date(Date.now() + 300000)
    });
    (QrSession as any).findById = async () => ({
      _id: qrSessionId,
      teacher: teacherId,
      section: sectionId,
      slotKey: "monday:09:00-10:00",
      mode: "qr",
      status: "active",
      expiresAt: new Date(Date.now() + 300000)
    });
    (Enrollment as any).findOne = () => leanResult(null);
    Object.defineProperty(redisClient, "status", { value: "ready", configurable: true });
    redisClient.setex = (async (_key: string, _ttl: number, value: string) => {
      token = value;
      return "OK";
    }) as any;
    redisClient.get = (async () => token) as any;

    const generated = await generateQrAttendanceSession({
      teacherId,
      sectionId,
      slotKey: "monday:09:00-10:00"
    });

    await assert.rejects(
      () => scanQrAttendanceSession({ studentId, token: generated.token }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 403 &&
        error.message.includes("not enrolled")
    );
  } finally {
    (Section as any).findById = originalFindById;
    (Timetable as any).findOne = originalTimetableFindOne;
    (QrSession as any).updateMany = originalUpdateMany;
    (QrSession as any).findOne = originalQrFindOne;
    (QrSession as any).create = originalCreate;
    (QrSession as any).findById = originalQrFindById;
    (Enrollment as any).findOne = originalEnrollmentFindOne;
    Object.defineProperty(redisClient, "status", { value: originalStatus, configurable: true });
    redisClient.setex = originalSetex;
    redisClient.get = originalGet;
  }
});

test("scanQrAttendanceSession marks a valid enrolled student once", async () => {
  const teacherId = String(new Types.ObjectId());
  const sectionId = String(new Types.ObjectId());
  const qrSessionId = new Types.ObjectId();
  const studentId = String(new Types.ObjectId());
  const originalFindById = Section.findById;
  const originalTimetableFindOne = Timetable.findOne;
  const originalUpdateMany = QrSession.updateMany;
  const originalQrFindOne = QrSession.findOne;
  const originalCreate = QrSession.create;
  const originalQrFindById = QrSession.findById;
  const originalQrUpdateOne = QrSession.updateOne;
  const originalEnrollmentFindOne = Enrollment.findOne;
  const originalRecordFindOne = AttendanceRecord.findOne;
  const originalRecordCreate = AttendanceRecord.create;
  const originalStatus = redisClient.status;
  const originalSetex = redisClient.setex;
  const originalGet = redisClient.get;
  let token = "";
  let createdPayload: any = null;

  try {
    (Section as any).findById = () => leanResult({ _id: sectionId });
    (Timetable as any).findOne = () => selectLeanResult({
      slots: [
        { day: "monday", startTime: "09:00", endTime: "10:00", teacher: teacherId, className: "Class", subject: "Math", room: "101" }
      ]
    });
    (QrSession as any).updateMany = async () => ({ modifiedCount: 0 });
    (QrSession as any).findOne = () => ({ sort: async () => null });
    (QrSession as any).create = async () => ({
      _id: qrSessionId,
      expiresAt: new Date(Date.now() + 300000)
    });
    (QrSession as any).findById = async () => ({
      _id: qrSessionId,
      teacher: teacherId,
      section: sectionId,
      slotKey: "monday:09:00-10:00",
      mode: "qr",
      status: "active",
      expiresAt: new Date(Date.now() + 300000)
    });
    (QrSession as any).updateOne = async () => ({ modifiedCount: 1 });
    (Enrollment as any).findOne = () => leanResult({ student: studentId, section: sectionId });
    (AttendanceRecord as any).findOne = async () => null;
    (AttendanceRecord as any).create = async (payload: any) => {
      createdPayload = payload;
      return { _id: new Types.ObjectId(), ...payload };
    };
    Object.defineProperty(redisClient, "status", { value: "ready", configurable: true });
    redisClient.setex = (async (_key: string, _ttl: number, value: string) => {
      token = value;
      return "OK";
    }) as any;
    redisClient.get = (async () => token) as any;

    const generated = await generateQrAttendanceSession({
      teacherId,
      sectionId,
      slotKey: "monday:09:00-10:00"
    });
    const result = await scanQrAttendanceSession({ studentId, token: generated.token });

    assert.equal(result.alreadyMarked, false);
    assert.equal(createdPayload.student, studentId);
    assert.equal(createdPayload.qrSession, qrSessionId);
    assert.equal(createdPayload.status, "present");
  } finally {
    (Section as any).findById = originalFindById;
    (Timetable as any).findOne = originalTimetableFindOne;
    (QrSession as any).updateMany = originalUpdateMany;
    (QrSession as any).findOne = originalQrFindOne;
    (QrSession as any).create = originalCreate;
    (QrSession as any).findById = originalQrFindById;
    (QrSession as any).updateOne = originalQrUpdateOne;
    (Enrollment as any).findOne = originalEnrollmentFindOne;
    (AttendanceRecord as any).findOne = originalRecordFindOne;
    (AttendanceRecord as any).create = originalRecordCreate;
    Object.defineProperty(redisClient, "status", { value: originalStatus, configurable: true });
    redisClient.setex = originalSetex;
    redisClient.get = originalGet;
  }
});
