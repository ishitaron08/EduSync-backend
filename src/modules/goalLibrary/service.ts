import { AppError } from "../common/common.utiles";
import { usersRepository } from "../users/users.queries";
import { syllabusGoalsService } from "../syllabusGoals/service";
import { goalLibraryRepository } from "./repository";

export const goalLibraryService = {
  /**
   * Returns the full goal library (defaults + community goals).
   */
  listGoals() {
    return goalLibraryRepository.listAll();
  },

  /**
   * Select or create a goal:
   * 1. Validate the title string.
   * 2. Upsert into GoalLibrary (creates if new, increments count if existing).
   * 3. Set the student's learningGoal on their User document.
   * 4. Return the goal library entry.
   */
  async selectOrCreateGoal(title: string, studentId: string) {
    const trimmed = title.trim();

    if (trimmed.length < 3) {
      throw new AppError("Goal must be at least 3 characters", 400);
    }
    if (trimmed.length > 80) {
      throw new AppError("Goal must be 80 characters or fewer", 400);
    }

    // Upsert into the shared library
    const goal = await goalLibraryRepository.upsertByTitle(trimmed);

    // Update the student's active learning goal and syllabus plan.
    await usersRepository.updateById(studentId, { learningGoal: trimmed });
    await syllabusGoalsService.syncSelectedGoalFromProfile(studentId, trimmed);

    return goal;
  }
};
