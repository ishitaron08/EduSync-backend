import { GoalLibrary } from "../../models/GoalLibrary";

export const goalLibraryRepository = {
  /**
   * Returns all goals sorted: defaults first, then by usageCount desc,
   * then by creation date asc (oldest community goals appear before newer ones
   * with the same count).
   */
  listAll() {
    return GoalLibrary.find()
      .sort({ isDefault: -1, usageCount: -1, createdAt: 1 })
      .lean();
  },

  /**
   * Atomically upsert a goal by title.
   * - If it doesn't exist: creates it with usageCount = 1.
   * - If it already exists: increments usageCount by 1.
   * Returns the resulting document.
   */
  upsertByTitle(title: string) {
    return GoalLibrary.findOneAndUpdate(
      { title },
      {
        $inc: { usageCount: 1 },
        $setOnInsert: { title, isDefault: false }
      },
      { upsert: true, new: true }
    ).lean();
  }
};
