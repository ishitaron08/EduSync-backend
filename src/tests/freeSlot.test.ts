import test from "node:test";
import assert from "node:assert/strict";
import { detectFreeSlots } from "../services/coreService";

test("detectFreeSlots finds gaps in daily schedule", () => {
  const slots = [
    { day: "monday", startTime: "09:00", endTime: "10:00" },
    { day: "monday", startTime: "11:00", endTime: "12:00" }
  ];

  const result = detectFreeSlots(slots, "08:00", "13:00");
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    day: "monday",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60
  });
});
