import { mlService } from "../modules/ml/ml.service";
import { MlRecommendationInput } from "../modules/ml/ml.types";
import { tasksService } from "../modules/tasks/tasks.service";
import { detectFreeSlots } from "../modules/timetable/timetable.service";

export { detectFreeSlots };

export function completeTask(taskId: string, studentId: string) {
  return tasksService.completeTask(taskId, studentId);
}

export function getRecommendation(input: MlRecommendationInput) {
  return mlService.getRecommendation(input);
}
