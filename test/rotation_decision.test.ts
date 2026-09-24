import assert from "node:assert/strict";
import test from "node:test";
import { decideRotation } from "../src/rotation_decision.ts";

test("keeps the old key active while a dispatched van still reports it", () => {
  const result = decideRotation(
    [
      { deployment: "dispatch-east", stillUsesOldKey: false },
      { deployment: "van-17", stillUsesOldKey: true },
    ],
    ["https://photos.example/work-orders/wo-1842/meter.jpg"],
  );

  assert.equal(result.status, "follow-up-required");
  assert.deepEqual(result.technicianFollowUp, ["van-17"]);
  assert.deepEqual(result.dispatchStatus, {
    "dispatch-east": "verified",
    "van-17": "update-key",
  });
  assert.equal(result.workOrderPhotos.length, 1);
});

test("retires the old key only after every deployment is verified", () => {
  const result = decideRotation(
    [{ deployment: "dispatch-east", stillUsesOldKey: false }],
    [],
  );

  assert.equal(result.status, "ready-to-retire-old-key");
  assert.deepEqual(result.technicianFollowUp, []);
});
