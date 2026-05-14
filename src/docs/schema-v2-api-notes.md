# Schema v2 API Notes

## Compatibility behavior

- Runtime flows are now fully v2-model based (`StudentTimetable`, `StudentGoal`, `StudentTask`, `AttendanceRecord`).
- Legacy v1 runtime fallback/dual-write logic has been removed from API paths.
- `completeTask` keeps reward point increment behavior through v2 task completion service.

## Endpoint-level validation updates

- `POST /api/auth/register` and `POST /api/auth/login` now validate request body with Zod.
- `POST /api/admin/timetable`, `POST /api/admin/users`, and `PUT /api/admin/users/:id` now validate request body.
- `GET /api/admin/users` accepts optional `page` and `limit` query params.
- `POST /api/teacher/attendance`, `POST /api/teacher/extra-session`, and `PATCH /api/teacher/availability` now validate request body.
- `POST /api/student/goals` and `POST /api/student/tasks` now validate request body.

## API contract adjustments for frontend

- `GET /api/admin/users` returns paginated shape:
  - `{ users: User[], total: number, page: number, limit: number }`
- Teacher attendance create now expects v2 fields:
  - `student`, `section`, `sessionDate`, `slotKey`, `status` (optional `className`, `subject`)
- Student task create now enforces goal ownership by student and rejects cross-user goal IDs.

## Migration script

- One-time script path: `src/scripts/migrateToSchemaV2.ts`
- Run with: `npm run migrate:schema-v2`
- Keep this script for historical backfill/recovery only; production runtime does not depend on it.
