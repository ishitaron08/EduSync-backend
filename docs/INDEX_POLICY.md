# Model Index Policy

- Use `schema.index(...)` for TTL, compound, and partial indexes.
- Avoid mixing `index: true` on a field with a matching `schema.index(...)` for the same field.
- Run `npm run check:indexes` before merge to catch duplicate index declarations.
