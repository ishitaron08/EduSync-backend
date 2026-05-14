import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { redisClient } from "../../config/redis";
import { AppError } from "../common/common.utiles";
import { usersRepository } from "../users/users.queries";
import { Role } from "../../types";

type SessionRecord = {
  userId: string;
  role: Role;
  refreshJti: string;
};

function parseDurationToSeconds(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input);
  if (!match) {
    throw new AppError(`Invalid duration format: ${input}`, 500);
  }
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return value;
  if (unit === "m") return value * 60;
  if (unit === "h") return value * 3600;
  return value * 86400;
}

const accessTokenTtlSeconds = parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
const refreshTokenTtlSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);

function accessTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    maxAge: accessTokenTtlSeconds * 1000,
    path: "/"
  } as const;
}

function refreshTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    maxAge: refreshTokenTtlSeconds * 1000,
    path: "/api/auth"
  } as const;
}

function signAccessToken(userId: string, role: Role, sid?: string): string {
  const payload: { id: string; role: Role; sid?: string } = { id: userId, role };
  if (sid) payload.sid = sid;
  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET as jwt.Secret,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
}

function signRefreshToken(userId: string, role: Role, sid: string, jti: string): string {
  return jwt.sign(
    { id: userId, role, sid, jti },
    env.JWT_REFRESH_SECRET as jwt.Secret,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
}

async function createSession(userId: string, role: Role) {
  const sid = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const session: SessionRecord = { userId, role, refreshJti };
  let redisStored = false;
  try {
    await redisClient.set(`session:${sid}`, JSON.stringify(session), "EX", refreshTokenTtlSeconds);
    redisStored = true;
  } catch {
    // Degrade gracefully when Redis is down/unreachable:
    // Access tokens will still work, but refresh/session revocation won't.
  }

  return {
    sid,
    refreshJti,
    accessToken: redisStored ? signAccessToken(userId, role, sid) : signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId, role, sid, refreshJti)
  };
}

type AuthResponse = {
  token: string;
  user: { id: string; role: Role; email: string; name: string; phone: string | null };
  cookies: {
    access: { name: string; value: string; options: ReturnType<typeof accessTokenCookieOptions> };
    refresh: { name: string; value: string; options: ReturnType<typeof refreshTokenCookieOptions> };
  };
};

function buildAuthResponse(user: any, session: { accessToken: string; refreshToken: string }): AuthResponse {
  return {
    token: session.accessToken,
    user: {
      id: String(user.id),
      role: String(user.role) as Role,
      email: String(user.email),
      name: String(user.name),
      phone: user.phone ? String(user.phone) : null
    },
    cookies: {
      access: {
        name: env.ACCESS_COOKIE_NAME,
        value: session.accessToken,
        options: accessTokenCookieOptions()
      },
      refresh: {
        name: env.REFRESH_COOKIE_NAME,
        value: session.refreshToken,
        options: refreshTokenCookieOptions()
      }
    }
  };
}

export const authService = {
  async registerUser(payload: { name: string; email: string; password: string; role: "admin" | "teacher" | "student" }) {
    const exists = await usersRepository.findByEmail(payload.email);
    if (exists) {
      throw new AppError("Email already exists", 409);
    }
    const password = await bcrypt.hash(payload.password, 10);
    const user = await usersRepository.create({ ...payload, password });
    const role = String((user as any).role) as Role;
    const session = await createSession(String((user as any).id), role);
    return buildAuthResponse(user, session);
  },
  async loginUser(payload: { email: string; password: string; portalRole: Role }) {
    const user = await usersRepository.findByEmail(payload.email, true);
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }
    const isValid = await bcrypt.compare(payload.password, (user as any).password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 401);
    }
    const role = String((user as any).role) as Role;
    if (role !== payload.portalRole) {
      throw new AppError(`This account belongs to ${role}. Use the ${role} login tab.`, 403);
    }
    const session = await createSession(String((user as any).id), role);
    return buildAuthResponse(user, session);
  },
  async refreshSession(refreshToken?: string): Promise<AuthResponse> {
    if (!refreshToken) {
      throw new AppError("Missing refresh token", 401);
    }
    let payload: { id: string; role: Role; sid: string; jti: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
        id: string;
        role: Role;
        sid: string;
        jti: string;
      };
    } catch {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const user = await usersRepository.findById(payload.id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const nextRefreshJti = crypto.randomUUID();
    const accessToken = signAccessToken(payload.id, payload.role, payload.sid);
    const nextRefreshToken = signRefreshToken(payload.id, payload.role, payload.sid, nextRefreshJti);

    if (redisClient.status !== "ready") {
      return buildAuthResponse(user, {
        accessToken,
        refreshToken: nextRefreshToken
      });
    }

    let rawSession: string | null = null;
    try {
      rawSession = await redisClient.get(`session:${payload.sid}`);
    } catch {
      return buildAuthResponse(user, {
        accessToken,
        refreshToken: nextRefreshToken
      });
    }
    if (!rawSession) {
      throw new AppError("Session expired", 401);
    }

    const session = JSON.parse(rawSession) as SessionRecord;
    if (session.userId !== payload.id || session.refreshJti !== payload.jti) {
      throw new AppError("Session revoked", 401);
    }

    const updatedSession: SessionRecord = {
      userId: payload.id,
      role: payload.role,
      refreshJti: nextRefreshJti
    };
    try {
      await redisClient.set(`session:${payload.sid}`, JSON.stringify(updatedSession), "EX", refreshTokenTtlSeconds);
    } catch {
      return buildAuthResponse(user, {
        accessToken,
        refreshToken: nextRefreshToken
      });
    }

    return buildAuthResponse(user, {
      accessToken,
      refreshToken: nextRefreshToken
    });
  },
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sid: string };
      await redisClient.del(`session:${payload.sid}`);
    } catch {
      // Always succeed logout to keep idempotent behavior.
    }
  },
  async getCurrentUser(userId: string) {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return {
      user: {
        id: String((user as any).id),
        name: String((user as any).name),
        email: String((user as any).email),
        role: String((user as any).role) as Role,
        phone: (user as any).phone ? String((user as any).phone) : null
      }
    };
  },
  async updateProfile(userId: string, payload: { name: string; phone?: string | null }) {
    const normalizedPhone = payload.phone?.trim() ? payload.phone.trim() : null;
    const user = await usersRepository.updateById(userId, {
      name: payload.name.trim(),
      phone: normalizedPhone
    });
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return {
      user: {
        id: String((user as any).id),
        name: String((user as any).name),
        email: String((user as any).email),
        role: String((user as any).role) as Role,
        phone: (user as any).phone ? String((user as any).phone) : null
      }
    };
  },
  async changePassword(
    userId: string,
    payload: { currentPassword: string; newPassword: string; confirmPassword: string }
  ) {
    const user = await usersRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const isCurrentValid = await bcrypt.compare(payload.currentPassword, String((user as any).password));
    if (!isCurrentValid) {
      throw new AppError("Current password is incorrect", 400);
    }
    if (payload.currentPassword === payload.newPassword) {
      throw new AppError("New password must be different from current password", 400);
    }

    await usersRepository.updateById(userId, { password: payload.newPassword });
    return { success: true, message: "Password updated successfully" };
  },
  clearAuthCookies() {
    return {
      access: {
        name: env.ACCESS_COOKIE_NAME,
        options: {
          httpOnly: true,
          secure: env.COOKIE_SECURE,
          sameSite: env.COOKIE_SAMESITE,
          domain: env.COOKIE_DOMAIN,
          path: "/"
        } as const
      },
      refresh: {
        name: env.REFRESH_COOKIE_NAME,
        options: {
          httpOnly: true,
          secure: env.COOKIE_SECURE,
          sameSite: env.COOKIE_SAMESITE,
          domain: env.COOKIE_DOMAIN,
          path: "/api/auth"
        } as const
      }
    };
  }
};
