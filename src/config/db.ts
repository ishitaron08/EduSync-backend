import mongoose from "mongoose";
import { env } from "./env";
import { GoalLibrary } from "../models/GoalLibrary";

const DEFAULT_GOALS = [
  "Academic Improvement",
  "Placement Preparation",
  "Skill Development"
];

/**
 * Upsert the three built-in goals so they always exist in the library.
 * Uses $setOnInsert so existing documents (and their usageCount) are never
 * overwritten — safe to run on every server start.
 */
async function seedDefaultGoals(): Promise<void> {
  await Promise.all(
    DEFAULT_GOALS.map((title) =>
      GoalLibrary.findOneAndUpdate(
        { title },
        { $setOnInsert: { title, isDefault: true, usageCount: 0 } },
        { upsert: true, new: true }
      )
    )
  );
}

export async function connectDB(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  await seedDefaultGoals();
}
