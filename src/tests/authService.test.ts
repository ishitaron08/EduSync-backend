import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { redisClient } from "../config/redis";
import { authService } from "../modules/auth/auth.service";
import { usersRepository } from "../modules/users/users.queries";
import { AppError } from "../utils/appError";

test("refreshSession falls back when Redis is unavailable", async () => {
  const originalStatus = redisClient.status;
  const originalGet = redisClient.get;
  const originalSet = redisClient.set;
  const originalFindById = usersRepository.findById;

  try {
    Object.defineProperty(redisClient, "status", { value: "wait", configurable: true });
    redisClient.get = async () => {
      throw new Error("redis should not be queried when unavailable");
    };
    redisClient.set = async () => {
      throw new Error("redis should not be written when unavailable");
    };
    (usersRepository as any).findById = async () => ({
      id: "user-1",
      role: "student",
      email: "student@example.com",
      name: "Student One",
      phone: null
    }) as any;

    const refreshToken = jwt.sign(
      { id: "user-1", role: "student", sid: "session-1", jti: "refresh-1" },
      env.JWT_REFRESH_SECRET as jwt.Secret,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
    );

    const result = await authService.refreshSession(refreshToken);
    assert.equal(result.user.id, "user-1");
    assert.equal(typeof result.token, "string");
  } finally {
    Object.defineProperty(redisClient, "status", { value: originalStatus, configurable: true });
    redisClient.get = originalGet;
    redisClient.set = originalSet;
    (usersRepository as any).findById = originalFindById;
  }
});

test("loginUser rejects valid credentials from the wrong portal role", async () => {
  const originalFindByEmail = usersRepository.findByEmail;
  const originalSet = redisClient.set;

  try {
    const password = "Password123";
    const hashedPassword = await bcrypt.hash(password, 10);

    (usersRepository as any).findByEmail = async () => ({
      id: "teacher-1",
      role: "teacher",
      email: "teacher@example.com",
      name: "Teacher One",
      phone: null,
      password: hashedPassword
    }) as any;
    redisClient.set = async () => {
      throw new Error("session should not be created for wrong portal login");
    };

    await assert.rejects(
      () => authService.loginUser({ email: "teacher@example.com", password, portalRole: "student" }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 403 &&
        error.message.includes("teacher")
    );
  } finally {
    (usersRepository as any).findByEmail = originalFindByEmail;
    redisClient.set = originalSet;
  }
});
