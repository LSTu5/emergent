import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE } from "../../shared/baseline";
import type { Frame } from "../../shared/contracts";
import {
  visitorStatus,
  selectionNote,
} from "../../experience/src/visitorStatus";
import {
  visitorPresentationKey,
  followOffset,
} from "../../experience/src/renderer/visitorPresentation";

test("visitor status distinguishes departure, queues, decisions and current destinations", () => {
  const a = { state: "departed" as const, target: "aquarium", arrival: 600 };
  assert.equal(
    visitorStatus(a, BASELINE),
    "Visit finished · no longer on the pier",
  );
  assert.equal(
    visitorStatus({ ...a, state: "waiting" }, BASELINE),
    "Waiting at Aquarium of the Bay",
  );
  assert.equal(
    visitorStatus({ ...a, state: "choosing" }, BASELINE),
    "Choosing the next stop",
  );
  assert.equal(
    visitorStatus({ ...a, state: "walking", target: null }, BASELINE),
    "Walking to the exit",
  );
  assert.match(
    visitorStatus({ ...a, state: "walking" }, BASELINE),
    /^Heading to Aquarium/,
  );
  assert.equal(selectionNote(true, false), "selected · outside current filter");
  assert.equal(
    selectionNote(false, true),
    "not present in this recorded frame",
  );
});

test("movement and route updates reuse marker presentation while floor, state and controls invalidate it", () => {
  const pose: Frame["agents"][number] = {
    id: "g1",
    x: 76,
    y: 200,
    floor: 1,
    state: "walking",
    nodeId: "f1-4",
    route: ["f1-5"],
  };
  const key = visitorPresentationKey([pose], ["people", 1]);
  assert.equal(
    visitorPresentationKey(
      [{ ...pose, x: 80, y: 190, nodeId: "f1-5", route: [] }],
      ["people", 1],
    ),
    key,
  );
  assert.notEqual(
    visitorPresentationKey([{ ...pose, floor: 2 }], ["people", 1]),
    key,
  );
  assert.notEqual(
    visitorPresentationKey([{ ...pose, state: "waiting" }], ["people", 1]),
    key,
  );
  assert.notEqual(visitorPresentationKey([pose], ["people", 2]), key);
  assert.notEqual(visitorPresentationKey([], ["people", 1]), key);
});

test("camera follow is frame-rate independent, bounded and immediate for reduced motion", () => {
  const start = { x: 0, y: 40 },
    target = { x: 100, y: -50 };
  const whole = followOffset(start, target, 32);
  const halves = followOffset(followOffset(start, target, 16), target, 16);
  assert.ok(Math.abs(whole.x - halves.x) < 1e-10);
  assert.ok(whole.x > 0 && whole.x < target.x);
  assert.ok(whole.y < start.y && whole.y > target.y);
  assert.deepEqual(followOffset(start, target, 16, true), target);
  assert.deepEqual(followOffset(start, target, -16), start);
  assert.deepEqual(
    followOffset(start, target, 10000),
    followOffset(start, target, 100),
  );
});
