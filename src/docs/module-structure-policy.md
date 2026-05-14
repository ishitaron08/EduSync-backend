# Backend Module File Policy

Every feature module uses the `module.work.ts` naming convention:

- `module.controller.ts`
- `module.service.ts`
- `module.route.ts`
- `module.queries.ts`
- `module.utiles.ts`
- `module.types.ts`
- `module.validater.ts`
- `index.ts`

Active modules:

- `auth`
- `users`
- `timetable`
- `attendance`
- `goals`
- `tasks`
- `ml`
- `common`

Guidelines:

- Keep `src/routes` as public compatibility adapters.
- Keep data access in `module.queries.ts`.
- Keep validation in `module.validater.ts`.
- Re-export module surface from `index.ts`.
