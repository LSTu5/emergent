import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE } from "../../shared/baseline";
import { DEFAULT_CONFIG, type Frame } from "../../shared/contracts";
import { clone } from "../../shared/layout";
import { liveView } from "../src/liveView";
import { Simulation } from "../src/simulation";
import { rules } from "../../intelligence/src/providers";
import {
  motionPath,
  VisitorMotion,
  visitorStyle,
} from "../../experience/src/renderer/visitorMotion";

test("live frames are immutable committed views with active agents, routes and inspection data", () => {
  const sim = new Simulation(
    "live",
    BASELINE,
    { ...DEFAULT_CONFIG, visitors: 20, provider: "rules" },
    rules,
  );
  const agent = sim.snapshot.agents[0];
  Object.assign(agent, {
    state: "walking",
    route: ["f1-0", "f1-1"],
    remaining: 5000,
    target: "aquarium",
  });
  agent.history.push({ at: 600, text: "Selected aquarium", source: "rules" });
  const frame = liveView(sim.snapshot);
  assert.equal(frame.agents.length, 1);
  assert.equal(frame.agents[0].remaining, 5000);
  assert.equal(frame.agents[0].history![0].text, "Selected aquarium");
  assert.deepEqual(frame.agents[0].route, ["f1-0", "f1-1"]);
  assert.ok(!("interests" in frame.agents[0]));
  const before = clone(frame);
  agent.position.x++;
  agent.route.shift();
  agent.history[0].text = "Changed";
  sim.snapshot.venues.aquarium.occupancy++;
  sim.snapshot.traffic.entry = 10;
  assert.deepEqual(frame, before);
});

const poses = () => {
  const start: Frame["agents"][number] = {
    id: "g001",
    x: 76,
    y: 192,
    floor: 1,
    state: "walking",
    nodeId: "f1-4",
    route: ["f1-5", "door-sf-socks"],
    target: "sf-socks",
  };
  const end: Frame["agents"][number] = {
    ...start,
    x: 60,
    y: 167,
    nodeId: "f1-5",
    route: ["door-sf-socks"],
  };
  return { start, end };
};

test("visitor movement follows the actual graph corner instead of cutting across it", () => {
  const { start, end } = poses();
  const path = motionPath(BASELINE, start, end);
  assert.deepEqual(
    path.map((p) => [p.x, p.y]),
    [
      [76, 192],
      [76, 170],
      [60, 167],
    ],
  );
  const motion = new VisitorMotion();
  motion.update("run:live", BASELINE, [start], 600, false, 1000);
  motion.update("run:live", BASELINE, [end], 601, false, 2000);
  const middle = motion.point(start.id, 2250)!;
  assert.equal(middle.x, 76);
  assert.ok(middle.y < start.y && middle.y > 170);
  assert.deepEqual(motion.point(start.id, 4000), end);
});

test("pausing freezes at the committed pose; seeks and floor changes snap without invented movement", () => {
  const { start, end } = poses();
  const motion = new VisitorMotion();
  motion.update("run:live", BASELINE, [start], 600, false, 1000);
  motion.update("run:live", BASELINE, [end], 601, false, 2000);
  motion.update("run:live", BASELINE, [end], 601, true, 2200);
  assert.deepEqual(motion.point(start.id, 2200), motion.point(start.id, 8000));
  assert.equal(motion.point(start.id, 2200)!.x, end.x);
  motion.update("run:replay", BASELINE, [start], 600, true, 9000);
  assert.equal(motion.point(start.id, 9000)!.x, start.x);
  const upstairs = { ...end, floor: 2 as const };
  assert.deepEqual(motionPath(BASELINE, start, upstairs), [upstairs]);
  assert.deepEqual(motionPath(BASELINE, start, { ...end, target: "other" }), [
    { ...end, target: "other" },
  ]);
  motion.update("run:live", BASELINE, [], 602, false, 10000);
  assert.equal(motion.point(start.id, 10000), undefined);
  assert.deepEqual(visitorStyle(start.id), visitorStyle(start.id));
});

import { renderPolicy } from "../../experience/src/renderer/renderPolicy";
test("fast or crowded runs skip animation, while pause enables bounded inspection", () => {
  assert.equal(renderPolicy(60, 100, false).overview, false);
  assert.deepEqual(renderPolicy(600, 100, false), { overview: true, limit: 0 });
  assert.equal(renderPolicy(60, 2000, false).overview, true);
  assert.deepEqual(renderPolicy(100000, 2000, true), {
    overview: false,
    limit: 300,
  });
});

test("real-time movement uses the engine's 15-second tick instead of rushing it in one second", () => {
  const { start } = poses();
  const end = { ...start, y: start.y - 10 };
  const motion = new VisitorMotion();
  motion.update("slow", BASELINE, [start], 600, false, 1000);
  motion.update("slow", BASELINE, [end], 600.25, false, 16000);
  assert.equal(motion.point(start.id, 23500)!.y, start.y - 5);
  assert.equal(motion.point(start.id, 31000)!.y, end.y);
});
