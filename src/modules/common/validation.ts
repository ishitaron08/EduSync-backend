import { z } from "zod";
import { dayValues, difficultyValues, goalTypeValues, taskStatusValues } from "../../models/schemaV2Enums";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
export const daySchema = z.enum(dayValues);
export const goalTypeSchema = z.enum(goalTypeValues);
export const difficultySchema = z.enum(difficultyValues);
export const taskStatusSchema = z.enum(taskStatusValues);
