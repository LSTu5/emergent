import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE } from "../../shared/baseline";
import {
  DEFAULT_CONFIG,
  type Config,
  type Profile,
  type ProviderPort,
  type Comparison,
} from "../../shared/contracts";
import { clone, validateLayout } from "../../shared/layout";
import { scenario, SCENARIOS } from "../../shared/scenarios";
import { comparisonSummary } from "../../shared/comparison";
import {
  project,
  unproject,
  groundDelta,
} from "../../experience/src/renderer/projection";
import { Simulation } from "../src/simulation";
import { population } from "../src/population";
import { rules } from "../../intelligence/src/providers";
const config: Config = {
  ...DEFAULT_CONFIG,
  provider: "rules",
  visitors: 1,
  start: 660,
  end: 1260,
  hourly: Array(10).fill(1),
  initialParkedVehicles: 0,
};
const first: ProviderPort = {
  name: "rules",
  async decide(inputs) {
    return inputs.map((i) => ({
      agentId: i.agentId,
      probabilities: i.options.map((_, n) => (n === 0 ? 1 : 0)),
      source: "rules",
      model: "forced-first",
    }));
  },
};
async function complete(s: Simulation) {
  while (s.snapshot.status === "running") await s.step();
  assert.equal(s.snapshot.status, "completed", s.snapshot.error);
  return s.snapshot;
}
function group(
  id: string,
  arrival: number,
  departure: number,
  mode: Profile["mode"] = "car",
): Profile {
  return {
    ...population(config)[0],
    id,
    groupId: id,
    size: 1,
    arrival,
    departure,
    mode,
    hunger: 1,
    budget: 100000,
    mealIntent: true,
    interests: {
      restaurant: 10,
      cafe: 0.1,
      shop: 0.1,
      attraction: 0.1,
      viewpoint: 1,
      seating: 0.1,
      event: 0.1,
    },
  };
}
function closedLayout() {
  const l = clone(BASELINE);
  for (const v of l.venues) {
    v.open = 1320;
    v.close = 1380;
  }
  return l;
}
test("every management scenario preserves fixed structures and valid access", () => {
  for (const s of SCENARIOS)
    assert.deepEqual(
      validateLayout(scenario(s.id, DEFAULT_CONFIG).layout),
      [],
      s.id,
    );
  const late = scenario("late-dining", DEFAULT_CONFIG);
  assert.equal(late.config.end, 1320);
  assert.equal(late.config.hourly.length, 12);
  assert.equal(
    BASELINE.venues.find((v) => v.id === "pier-market")!.close,
    1260,
  );
});
test("isometric placement converts screen drag back to the same ground geometry", () => {
  for (const x of [8, 65, 129])
    for (const y of [22, 85, 290]) {
      const p = project(x, y),
        back = unproject(p.x, p.y);
      assert.equal(back.x, x);
      assert.equal(back.y, y);
      const to = project(x + 13, y - 24),
        d = groundDelta((to.x - p.x) * 1.7, (to.y - p.y) * 1.7, 1.7);
      assert.ok(Math.abs(d.x - 13) < 1e-10);
      assert.ok(Math.abs(d.y + 24) < 1e-10);
    }
});
test("full meals are limited by occasion and separated by four hours, with finite wallets", async () => {
  const l = clone(BASELINE);
  for (const v of l.venues) {
    if (v.category === "restaurant")
      Object.assign(v, { open: 660, close: 1320, dwellMin: 30, dwellMax: 30 });
    else
      Object.assign(v, {
        category: "viewpoint",
        open: 660,
        close: 1320,
        dwellMin: 80,
        dwellMax: 80,
        spendMin: 0,
        spendMax: 0,
        purchaseProbability: 0,
      });
  }
  const c = { ...config, end: 1320, hourly: Array(11).fill(1) };
  const g = group("long-day", 660, 1320, "walk-transit");
  const s = await complete(new Simulation("meals", l, c, first, [g]));
  const meals = s.agents[0].meals!;
  assert.ok(meals.length >= 2, JSON.stringify(meals));
  assert.equal(new Set(meals.map((m) => m.occasion)).size, meals.length);
  for (let i = 1; i < meals.length; i++)
    assert.ok(meals[i].at - meals[i - 1].at >= 240);
  assert.equal(s.agents[0].remaining + s.agents[0].spend, g.budget);
});
test("adding a restaurant redistributes one dinner instead of creating multiple dinners", async () => {
  const l = closedLayout(),
    a = l.venues.find((v) => v.id === "pier-market")!,
    b = l.venues.find((v) => v.id === "upper-gifts")!;
  Object.assign(a, {
    open: 1080,
    close: 1260,
    dwellMin: 20,
    dwellMax: 20,
    spendMin: 3000,
    spendMax: 3000,
    purchaseProbability: 1,
  });
  const alt = clone(l);
  Object.assign(
    alt.venues.find((v) => v.id === b.id)!,
    {
      ...a,
      id: b.id,
      name: "New dinner venue",
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      floor: b.floor,
      nodeId: b.nodeId,
      category: "restaurant",
    },
  );
  const c = {
    ...config,
    start: 1080,
    end: 1260,
    hourly: [1, 1, 1],
    visitors: 120,
  };
  const cohort = Array.from({ length: 120 }, (_, i) =>
    group(`g${i}`, 1080 + i / 4, 1260, "walk-transit"),
  );
  const x = await complete(new Simulation("a", l, c, rules, cohort)),
    y = await complete(new Simulation("b", alt, c, rules, cohort));
  assert.ok(y.venues[b.id].sales > 0);
  assert.ok(y.venues[a.id].sales < x.venues[a.id].sales);
  for (const s of [x, y])
    assert.ok(s.agents.every((g) => (g.meals?.length ?? 0) <= 1));
  assert.ok(y.metrics.mealEpisodes! <= 120);
  assert.equal(y.metrics.sales, y.metrics.mealEpisodes! * 3000);
});
test("parking rejects only car groups and releases spaces after the visit buffer", async () => {
  const l = closedLayout();
  l.parking = { enabled: true, spaces: 1 };
  const c = {
    ...config,
    visitors: 4,
    end: 780,
    hourly: [1, 1],
    parkingBufferMinutes: 30,
  };
  const cohort = [
    group("car-a", 660, 720),
    group("car-b", 660, 720),
    group("walk", 660, 720, "walk-transit"),
    group("car-c", 700, 760),
  ];
  const s = await complete(new Simulation("parking", l, c, first, cohort));
  assert.equal(s.metrics.attempted, 4);
  assert.equal(s.metrics.arrived, 3);
  assert.equal(s.metrics.parkingRejected, 1);
  assert.equal(s.agents.find((a) => a.id === "car-b")!.admitted, false);
  assert.equal(s.agents.find((a) => a.id === "walk")!.admitted, true);
  assert.equal(s.agents.find((a) => a.id === "car-c")!.admitted, true);
  assert.equal(s.metrics.parkingPeak, 1);
  const more = clone(l);
  more.parking!.spaces = 2;
  const y = await complete(
    new Simulation("more-parking", more, c, first, cohort),
  );
  assert.equal(y.metrics.arrived, 4);
  assert.equal(y.metrics.parkingRejected, 0);
  assert.deepEqual(
    s.agents.map(({ id, mode, arrival, budget }) => ({
      id,
      mode,
      arrival,
      budget,
    })),
    y.agents.map(({ id, mode, arrival, budget }) => ({
      id,
      mode,
      arrival,
      budget,
    })),
  );
  const none = clone(l);
  none.parking!.spaces = 0;
  assert.throws(
    () =>
      new Simulation(
        "invalid-parking",
        none,
        { ...c, initialParkedVehicles: 1 },
        rules,
      ),
    /Initial parked/,
  );
});
test("a venue cannot charge a full meal when too little time remains before closing", async () => {
  const l = closedLayout(),
    v = l.venues.find((v) => v.id === "pier-market")!;
  Object.assign(v, { open: 660, close: 690, dwellMin: 40, dwellMax: 40 });
  const s = await complete(
    new Simulation("closing", l, config, first, [
      group("hungry", 665, 740, "walk-transit"),
    ]),
  );
  assert.equal(s.venues[v.id].visits, 0);
  assert.equal(s.metrics.sales, 0);
});
test("paired venue gains and declines reconcile to total sales, excluding failed pairs", async () => {
  const c = { ...config, visitors: 80 },
    a = new Simulation("a", BASELINE, c, rules),
    alt = scenario("dining", c).layout,
    b = new Simulation("b", alt, c, rules, a.cohort);
  const x = await complete(a),
    y = await complete(b);
  const comparison: Comparison = {
    id: "test",
    baseline: BASELINE,
    variant: alt,
    config: c,
    status: "incomplete",
    meanDelta: y.metrics.sales - x.metrics.sales,
    range: null,
    sd: null,
    pairs: [
      {
        seed: "one",
        status: "completed",
        a: "a",
        b: "b",
        metricsA: x.metrics,
        metricsB: y.metrics,
        delta: y.metrics.sales - x.metrics.sales,
        venueSalesA: Object.fromEntries(
          Object.entries(x.venues).map(([id, v]) => [id, v.sales]),
        ),
        venueSalesB: Object.fromEntries(
          Object.entries(y.venues).map(([id, v]) => [id, v.sales]),
        ),
      },
      { seed: "two", status: "failed", a: null, b: null, error: "interrupted" },
    ],
  };
  const s = comparisonSummary(comparison);
  assert.equal(s.pairs.length, 1);
  assert.equal(s.gains + s.losses, comparison.meanDelta);
  assert.equal(s.metric("arrived", "A"), 80);
});

test("a complimentary restaurant meal still satiates and consumes its meal occasion", async () => {
  const l = closedLayout(),
    v = l.venues.find((v) => v.id === "pier-market")!;
  Object.assign(v, {
    open: 660,
    close: 1260,
    dwellMin: 20,
    dwellMax: 20,
    spendMin: 0,
    spendMax: 0,
    purchaseProbability: 1,
  });
  const s = await complete(
    new Simulation("free-meal", l, config, first, [
      group("guest", 660, 840, "walk-transit"),
    ]),
  );
  assert.equal(s.agents[0].meals!.length, 1);
  assert.equal(s.metrics.sales, 0);
  assert.equal(s.agents[0].remaining, s.agents[0].budget);
  assert.ok(s.agents[0].hunger < 0.5);
});
