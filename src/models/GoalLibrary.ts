import { model, Schema } from "mongoose";

/**
 * GoalLibrary — shared pool of learning goals.
 *
 * Default goals (isDefault: true) are seeded on server start and always
 * appear first. Community goals are created when a student submits a custom
 * goal that doesn't already exist. usageCount is incremented every time any
 * student selects a goal, so popular entries naturally surface at the top.
 */
const goalLibrarySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 80
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    usageCount: {
      type: Number,
      default: 1,
      min: 0
    }
  },
  { timestamps: true, collection: "goal_library" }
);

// Primary sort index: defaults first, then by popularity
goalLibrarySchema.index({ isDefault: -1, usageCount: -1, createdAt: 1 });

export const GoalLibrary = model("GoalLibrary", goalLibrarySchema);
