import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE } from "../../shared/baseline";
import { DEFAULT_CONFIG } from "../../shared/contracts";
import {
  clone,
  upgradeLegacyLayout,
  validateLayout,
} from "../../shared/layout";
import { Simulation } from "../src/simulation";
import { rules } from "../../intelligence/src/providers";

function legacyLayout() {
  const layout = clone(BASELINE);
  layout.id = "legacy-alternative";
  for (const [id, x, row] of [
    ["bay-plunge", 94, 5],
    ["west-gifts", 23, 6],
    ["carousel", 94, 6],
    ["christmas", 23, 7],
    ["sea-lions", 23, 8],
    ["bay-stage", 94, 9],
  ] as const) {
    Object.assign(
      layout.venues.find((v) => v.id === id)!,
      { x, y: 278 - row * 24 },
    );
    Object.assign(
      layout.nodes.find((n) => n.id === `door-${id}`)!,
      {
        x: x === 23 ? 58 : 94,
        y: 287 - row * 24,
      },
    );
    layout.edges.find((e) => e.id === `access-${id}`)!.from = `f1-${row}`;
  }
  return layout;
}

test("fixed geometry accepts reordered JSON and arrays without accepting moved or duplicate nodes", () => {
  const layout = clone(BASELINE);
  layout.nodes = layout.nodes
    .reverse()
    .map(({ id, x, y, floor, label }) => ({
      floor,
      y,
      x,
      id,
      ...(label ? { label } : {}),
    }));
  layout.edges = layout.edges
    .reverse()
    .map(({ id, from, to, width, enabled, structural, accessible }) => ({
      accessible,
      structural,
      enabled,
      width,
      to,
      from,
      id,
    }));
  assert.deepEqual(validateLayout(layout), []);
  layout.nodes[0].x++;
  assert.ok(
    validateLayout(layout).includes(
      "Permanent navigation nodes must stay fixed",
    ),
  );
  layout.nodes = clone(BASELINE.nodes);
  layout.nodes[0] = clone(layout.nodes[1]);
  assert.ok(
    validateLayout(layout).includes(
      "Permanent navigation nodes must stay fixed",
    ),
  );
});

test("legacy alternatives upgrade for new runs while keeping business edits and the original recording", async () => {
  const layout = legacyLayout();
  const venue = layout.venues.find((v) => v.id === "bay-plunge")!;
  Object.assign(venue, {
    name: "Alternative attraction",
    capacity: 36,
    spendMin: 1800,
    spendMax: 2400,
  });
  layout.parking!.spaces = 676;
  layout.edges.find((e) => e.id === "walk-1-4")!.enabled = false;
  const original = clone(layout);
  assert.ok(
    validateLayout(layout).includes(
      "Permanent navigation nodes must stay fixed",
    ),
  );
  const upgraded = upgradeLegacyLayout(layout);
  assert.deepEqual(validateLayout(upgraded), []);
  assert.deepEqual(layout, original);
  assert.equal(upgraded.id, layout.id);
  assert.equal(upgraded.venues.find((v) => v.id === venue.id)!.capacity, 36);
  assert.equal(
    upgraded.venues.find((v) => v.id === venue.id)!.name,
    venue.name,
  );
  assert.equal(upgraded.parking!.spaces, 676);
  assert.equal(upgraded.edges.find((e) => e.id === "walk-1-4")!.enabled, false);
  assert.equal(upgradeLegacyLayout(upgraded), upgraded);
  const sim = new Simulation(
    "legacy",
    upgraded,
    {
      ...DEFAULT_CONFIG,
      provider: "rules",
      visitors: 20,
    },
    rules,
  );
  while (sim.snapshot.status === "running") await sim.step();
  assert.equal(sim.snapshot.status, "completed", sim.snapshot.error);
  assert.equal(sim.snapshot.metrics.departed, sim.snapshot.metrics.arrived);
});

test("known legacy kiosk footprints are repaired at both saved default locations", () => {
  for (const [y, nodeId] of [
    [181, "f1-4"],
    [85, "f1-8"],
  ] as const) {
    const layout = legacyLayout();
    Object.assign(
      layout.venues.find((v) => v.id === "snack-kiosk")!,
      { w: 6, y, nodeId },
    );
    const upgraded = upgradeLegacyLayout(layout);
    assert.deepEqual(validateLayout(upgraded), []);
    const kiosk = upgraded.venues.find((v) => v.id === "snack-kiosk")!;
    assert.equal(kiosk.w, 4);
    assert.equal(kiosk.y, y);
    assert.equal(kiosk.nodeId, nodeId);
  }
});

test("migration never masks changes to current nodes or unknown legacy geometry", () => {
  const current = clone(BASELINE);
  current.nodes[0].x++;
  const badNode = legacyLayout();
  badNode.nodes[0].x++;
  const badEdge = legacyLayout();
  badEdge.edges.find((e) => e.id === "access-carousel")!.enabled = false;
  const badBuilding = legacyLayout();
  badBuilding.venues.find((v) => v.id === "carousel")!.x++;
  for (const layout of [current, badNode, badEdge, badBuilding]) {
    assert.equal(upgradeLegacyLayout(layout), layout);
    assert.ok(validateLayout(layout).length > 0);
  }
});
