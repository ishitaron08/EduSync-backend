import assert from "node:assert/strict";
import test from "node:test";

import { validateRequest } from "../middlewares/validateRequest";
import { adminUserListEnvelope } from "../modules/admin/validators";

test("validateRequest can safely replace read-only query objects", () => {
  const handler = validateRequest(adminUserListEnvelope);
  const req: any = { body: {}, params: {} };
  Object.defineProperty(req, "query", {
    configurable: true,
    enumerable: true,
    get: () => ({ page: "2", limit: "10" })
  });

  let called = false;
  handler(req, { status: () => ({ json: () => undefined }) } as any, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.query.page, 2);
  assert.equal(req.query.limit, 10);
});