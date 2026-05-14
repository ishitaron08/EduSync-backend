# Admin API

All routes are mounted under `/api/admin` and require:

- A valid access token (cookie or `Authorization: Bearer <token>`).
- The token's `role` claim equal to `"admin"`. Anything else returns `403 Forbidden`.

State-changing endpoints (POST/PUT/PATCH/DELETE) write an `AuditLog` document.

## Metrics

### `GET /api/admin/metrics/overview`

Single round-trip aggregation used by the admin dashboard's KPI strip.

Response:

```jsonc
{
  "users":       { "admin": 2, "teacher": 14, "student": 312, "total": 328 },
  "courses":     { "pending": 4, "approved": 21, "rejected": 1, "total": 26, "active": 22 },
  "assessments": { "draft": 3, "published": 9, "closed": 17, "total": 29 },
  "auditLogs24h": 18,
  "generatedAt": "2024-05-10T12:00:00.000Z"
}
```

## Users

### `GET /api/admin/users`

Query params (all optional):

| Param  | Type                                  | Default | Notes                                  |
| ------ | ------------------------------------- | ------- | -------------------------------------- |
| `page` | int >= 1                              | `1`     |                                        |
| `limit`| int 1..100                            | `25`    |                                        |
| `role` | `"admin" \| "teacher" \| "student"` | —       | Filter by role.                        |
| `q`    | string 1..120                         | —       | Case-insensitive match on name/email.  |

Response:

```jsonc
{
  "users": [ /* User docs without password */ ],
  "total": 312,
  "page": 1,
  "limit": 25
}
```

### `POST /api/admin/users`

Create a user. Body:

```json
{ "name": "Aanya", "email": "aanya@x.com", "password": "...", "role": "student" }
```

Audit: `admin.user.create`.

### `PUT /api/admin/users/:id`

Partial update (`name`, `role`, `availability`, `rewardPoints`).

Audit: `admin.user.update`.

### `DELETE /api/admin/users/:id`

Hard delete.

Audit: `admin.user.delete`.

## Courses

### `GET /api/admin/courses`

Query params:

| Param   | Type                                       | Default | Notes                              |
| ------- | ------------------------------------------ | ------- | ---------------------------------- |
| `page`  | int >= 1                                   | `1`     |                                    |
| `limit` | int 1..100                                 | `25`    |                                    |
| `status`| `"pending" \| "approved" \| "rejected"` | —       | Filter by `moderationStatus`.      |
| `q`     | string 1..120                              | —       | Match on `code`/`name`/`description`. |

### `PATCH /api/admin/courses/:id/status`

Body:

```json
{ "status": "approved" }
```

Allowed values: `"pending" | "approved" | "rejected"`.

Returns the updated `Course`. `404` if not found.

Audit: `admin.course.moderate` with `metadata: { courseId, status }`.

## Students

### `GET /api/admin/students/:id/snapshot`

Joined view of a single student. `404` if the user does not exist or does not have role `student`.

Response:

```jsonc
{
  "student": { /* User without password */ },
  "enrollments": 4,
  "goals": [ /* StudentGoal docs */ ],
  "tasks":      { "pending": 3, "in_progress": 1, "completed": 12 },
  "attendance": { "present": 22, "absent": 1, "late": 0 },
  "generatedAt": "2024-05-10T12:00:00.000Z"
}
```

## Assessments

### `GET /api/admin/assessments`

Returns every assessment in the system (no pagination yet).

## Audit logs

### `GET /api/admin/audit-logs?page=&limit=`

Paginated audit log feed (newest first).

## Timetable

### `POST /api/admin/timetable`

See `src/modules/timetable/timetable.validater.ts` for the request shape.

## Leaderboard

### `GET /api/admin/leaderboard?scope=all_time|weekly|monthly`

Top students by `rewardPoints`. `scope` defaults to `all_time`.

## Conventions

- Pagination defaults: `page=1`, `limit=25`. `limit` is clamped to `100`.
- All list responses share the shape `{ items_or_named_collection, total, page, limit }`.
- All Zod errors return HTTP 400 with `{ message: "Validation failed", issues: [...] }`.
- All not-found errors return HTTP 404 with `{ message: "..." }`.
