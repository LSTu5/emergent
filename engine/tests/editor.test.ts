import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE, categoryDefaults } from "../../shared/baseline";
import type { Floor, Venue } from "../../shared/contracts";
import { clone, validateLayout } from "../../shared/layout";
import {
  findVenuePosition,
  placeVenue,
  repairObjectPositions,
} from "../../shared/editing";

function proposal(
  id: string,
  floor: Floor,
  category: Venue["category"] = "cafe",
): Venue {
  return {
    ...clone(BASELINE.venues.find((v) => v.id === "snack-kiosk")!),
    ...categoryDefaults(category),
    id,
    name: id,
    category,
    floor,
    x: 83,
    y: 155,
    w: 6,
    h: 6,
  };
}

test("repeated kiosk, seating and event creation finds valid nonoverlapping positions on either floor", () => {
  const layout = clone(BASELINE);
  for (const floor of [1, 2] as const) {
    for (let index = 0; index < 12; index++) {
      const category = (["cafe", "seating", "event"] as const)[index % 3];
      const placed = findVenuePosition(
        layout,
        proposal(`new-${floor}-${index}`, floor, category),
      );
      assert.ok(placed, `No space for ${floor}/${index}`);
      layout.venues.push(placed);
      assert.deepEqual(
        validateLayout(layout),
        [],
        `Invalid layout after ${floor}/${index}`,
      );
    }
  }
});

test("unplaceable objects are rejected without modifying the layout", () => {
  const layout = clone(BASELINE),
    before = clone(layout);
  const huge = { ...proposal("oversized", 1), w: 140, h: 285 };
  assert.equal(findVenuePosition(layout, huge), null);
  assert.deepEqual(layout, before);
});

test("drag validation rejects collisions and path obstruction while preserving the previous position", () => {
  const layout = clone(BASELINE),
    before = clone(layout);
  const kiosk = layout.venues.find((v) => v.id === "snack-kiosk")!;
  const blocked = placeVenue(layout, kiosk, { x: 73, y: 181, floor: 1 });
  assert.match(blocked.errors.join(" "), /Level 1 main promenade/);
  const outside = placeVenue(layout, kiosk, { x: 200, y: 181, floor: 1 });
  assert.match(outside.errors.join(" "), /must stay on the pier/);
  const moved = placeVenue(layout, kiosk, { x: 65, y: 157, floor: 1 });
  assert.deepEqual(moved.errors, []);
  assert.deepEqual(layout, before);
  layout.venues = layout.venues.map((v) =>
    v.id === kiosk.id ? moved.venue : v,
  );
  assert.deepEqual(validateLayout(layout), []);
});

test("repairs existing overlapping additions and blocked paths without discarding custom settings", () => {
  const layout = clone(BASELINE);
  layout.edges.find((e) => e.id === "walk-1-4")!.width = 20;
  layout.venues.push(
    {
      ...proposal("new-food-a", 1),
      name: "Food",
      x: 83,
      y: 287,
      spendMin: 900,
    },
    { ...proposal("new-food-b", 1), name: "New food kiosk", x: 83, y: 287 },
  );
  assert.ok(validateLayout(layout).length >= 4);
  const before = clone(layout),
    repaired = repairObjectPositions(layout);
  assert.ok(repaired);
  assert.equal(repaired.moved, 3);
  assert.deepEqual(validateLayout(repaired.layout), []);
  assert.deepEqual(repaired.layout.edges, before.edges);
  assert.deepEqual(
    repaired.layout.venues.filter((v) => !v.movable),
    before.venues.filter((v) => !v.movable),
  );
  assert.equal(
    repaired.layout.venues.find((v) => v.id === "new-food-a")!.spendMin,
    900,
  );
  assert.equal(
    repaired.layout.venues.find((v) => v.id === "new-food-a")!.name,
    "Food",
  );
  assert.deepEqual(layout, before);
});
