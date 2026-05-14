import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";

test("authenticate accepts Bearer JWT without sid (no Redis dependency)", async () => {
  const token = jwt.sign(
    { id: "user-1", role: "student" },
    env.JWT_ACCESS_SECRET as jwt.Secret,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );

  const req: any = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
  let called = false;

  await authenticate(req, {} as any, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user.id, "user-1");
  assert.equal(req.user.role, "student");
  assert.equal(req.user.sid, undefined);
});

test("authenticate rejects missing Authorization token", async () => {
  const req: any = { headers: {}, cookies: {} };

  await assert.rejects(
    () => authenticate(req, {} as any, () => undefined),
    (err) => err instanceof AppError && err.statusCode === 401
  );
});

test("authorize denies non-matching role", () => {
  const req: any = { user: { id: "user-1", role: "student" } };

  const mw = authorize("admin");
  assert.throws(() => mw(req, {} as any, () => undefined), (err: any) => err instanceof AppError && err.statusCode === 403);
});

