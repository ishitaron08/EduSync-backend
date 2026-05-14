# Legacy ML Migration Notes

This document preserves the previous Python training heuristics after moving ML inference fully into TypeScript.

## Former Python Inputs

- `student_year`
- `goal_type`
- `free_time_duration`
- `completion_rate`
- `difficulty_preference`

## Former Python Output

- `recommended_task_category`

## Training Heuristics Previously Used

The old Python data generator used these target rules:

- For `goal_type = placement`:
  - recommend `coding_practice` when difficulty was `medium` or `hard`
  - recommend `communication_drill` when difficulty was `easy`
- For `goal_type = exam`:
  - recommend `revision` when free time was under 120 minutes
  - recommend `mock_test` when free time was 120 minutes or more
- For `goal_type = skill_development`:
  - recommend `project_work` when completion rate was above 0.6
  - recommend `coding_practice` otherwise

These rules are preserved here as historical context for improving the in-process TypeScript recommendation engine.
