import test from "node:test";
import assert from "node:assert/strict";
import { population } from "../src/population";
import { DEFAULT_CONFIG, type Frame } from "../../shared/contracts";
import { BASELINE } from "../../shared/baseline";
import { clone, validateLayout } from "../../shared/layout";
import { createMembers, membersFor } from "../../shared/profiles";
import {
  reshapeVenue,
  findVenuePosition,
  snapCoordinate,
} from "../../shared/editing";
import { visitorMarkers } from "../../experience/src/renderer/visitorMarkers";
import {
  project,
  dropPoint,
  sceneFrames,
} from "../../experience/src/renderer/projection";

test("fictional identities are reproducible, cover every visitor, and accompany children with adults", () => {
  const config = { ...DEFAULT_CONFIG, visitors: 1000, seed: "profile-test" };
  const a = population(config),
    b = population(config);
  assert.deepEqual(a, b);
  assert.equal(
    a.reduce((n, g) => n + g.members!.length, 0),
    1000,
  );
  assert.equal(
    new Set(a.flatMap((g) => g.members!.map((m) => m.id))).size,
    1000,
  );
  assert.ok(a.some((g) => g.members!.some((m) => m.role === "child")));
  for (const g of a) {
    assert.equal(g.members!.length, g.size);
    for (const m of g.members!) {
      assert.ok(m.name.includes(" "));
      assert.ok(m.age >= 5 && m.age <= 82);
    }
    const children = g.members!.filter((m) => m.role === "child");
    if (children.length) {
      assert.ok(g.members!.some((m) => m.role === "parent"));
      assert.ok(
        Math.min(
          ...g.members!.filter((m) => m.role === "parent").map((m) => m.age),
        ) -
          Math.max(...children.map((m) => m.age)) >=
          18,
      );
    }
  }
  assert.notDeepEqual(createMembers("other", a[0]), a[0].members);
});

test("legacy recordings receive stable display profiles without modifying historical data", () => {
  const g = population({ ...DEFAULT_CONFIG, visitors: 4 })[0];
  delete g.members;
  const before = clone(g);
  assert.deepEqual(membersFor(g, "legacy"), membersFor(g, "legacy"));
  assert.deepEqual(g, before);
});

test("individual rendering is bounded and retains a selected group outside the first 300", () => {
  const groups = population({ ...DEFAULT_CONFIG, visitors: 2000 });
  const profiles = new Map(groups.map((g) => [g.id, g]));
  const poses: Frame["agents"] = groups.map((g) => ({
    id: g.id,
    x: 76,
    y: 100,
    floor: 1,
    state: "walking",
  }));
  const chosen = groups.at(-1)!;
  const people = visitorMarkers(poses, profiles, "test", "people", chosen.id);
  assert.equal(people.length, 300);
  assert.equal(new Set(people.map((m) => m.id)).size, 300);
  assert.equal(
    people.filter((m) => m.groupId === chosen.id).length,
    chosen.size,
  );
  assert.equal(
    visitorMarkers(poses, profiles, "test", "groups", chosen.id).length,
    300,
  );
  assert.equal(visitorMarkers([], profiles, "test", "people", null).length, 0);
});

test("placement resizing and rotation preserve fixed geometry and reject invalid dimensions and collisions", () => {
  const layout = clone(BASELINE),
    before = clone(layout),
    base = layout.venues.find((v) => v.id === "snack-kiosk")!;
  const v = { ...base, id: "resizable", x: 84, y: 155, w: 4, h: 6 };
  const result = reshapeVenue(layout, v, {
    x: 83,
    y: 156,
    w: 6,
    h: 4,
    floor: 1,
  });
  assert.deepEqual(result.errors, []);
  layout.venues.push(result.venue);
  assert.deepEqual(validateLayout(layout), []);
  assert.ok(
    reshapeVenue(layout, result.venue, { ...result.venue, w: 80 }).errors
      .length,
  );
  assert.ok(
    reshapeVenue(layout, result.venue, { ...result.venue, w: NaN }).errors
      .length,
  );
  const fixed = layout.venues.find((v) => !v.movable)!;
  assert.ok(
    reshapeVenue(layout, fixed, { ...fixed, x: fixed.x + 1 }).errors.length,
  );
  const duplicate = findVenuePosition(layout, {
    ...result.venue,
    id: "copy",
    x: result.venue.x + 1,
  });
  assert.ok(duplicate);
  layout.venues.push(duplicate);
  assert.deepEqual(validateLayout(layout), []);
  assert.deepEqual(layout.nodes, before.nodes);
  assert.deepEqual(layout.edges, before.edges);
  assert.equal(snapCoordinate(65.3, 0.5), 65.5);
});

test("palette drops resolve the correct floor under zoom and pan", () => {
  for (const both of [false, true])
    for (const floor of [1, 2] as const) {
      const width = 1100,
        height = 700,
        camera = { zoom: 2.5, x: -80, y: 60 };
      const sw = both ? 570 : 545,
        sh = both ? 575 : 290;
      const scale =
        Math.min((width - 40) / sw, (height - 75) / sh) * camera.zoom;
      const pane = sceneFrames(both, floor).find((p) => p.floor === floor)!;
      const point = project(87, 158);
      const x =
        (width - sw * scale) / 2 + camera.x + (pane.x + point.x) * scale;
      const y =
        (height - sh * scale) / 2 + camera.y + 12 + (pane.y + point.y) * scale;
      const found = dropPoint(x, y, width, height, camera, both, floor)!;
      assert.equal(found.floor, floor);
      assert.ok(Math.abs(found.x - 87) < 1e-9);
      assert.ok(Math.abs(found.y - 158) < 1e-9);
    }
  assert.equal(
    dropPoint(-10000, -10000, 1100, 700, { zoom: 1, x: 0, y: 0 }, false, 1),
    null,
  );
});
