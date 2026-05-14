import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import adminRoutes from "./routes/adminRoutes";
import authRoutes from "./routes/authRoutes";
import mlRoutes from "./routes/mlRoutes";
import studentRoutes from "./routes/studentRoutes";
import teacherRoutes from "./routes/teacherRoutes";
import { errorMiddleware } from "./middlewares/errorMiddleware";
import { requestContext } from "./middlewares/requestContext";
import { requestLogger } from "./middlewares/requestLogger";
import mongoose from "mongoose";
import { env } from "./config/env";

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (curl, server-to-server) which omit Origin.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow Vercel preview deployments so PR builds can hit the API.
    try {
      const hostname = new URL(origin).hostname;
      if (hostname.endsWith(".vercel.app")) return callback(null, true);
    } catch {
      // ignore malformed origin and fall through to deny
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
if (env.LOG_LEVEL === "info") {
  app.use(morgan("dev"));
}
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });
app.use(requestContext);
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/ready", (_req, res) => {
  const isDbReady = mongoose.connection.readyState === 1;
  res.status(isDbReady ? 200 : 503).json({
    status: isDbReady ? "ready" : "not_ready",
    database: mongoose.connection.readyState
  });
});

app.get("/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/ml", mlRoutes);

app.use(errorMiddleware);

export default app;
