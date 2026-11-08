import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE } from "../../shared/baseline";
import { DEFAULT_CONFIG } from "../../shared/contracts";
import { clone, validateLayout, route } from "../../shared/layout";
import { Simulation } from "../src/simulation";
import { population } from "../src/population";
import { rules } from "../../intelligence/src/providers";
const cfg = {
  ...DEFAULT_CONFIG,
  provider: "rules" as const,
  visitors: 80,
  speed: 100000,
};
async function complete(sim: Simulation) {
  while (sim.snapshot.status === "running") await sim.step();
  assert.equal(sim.snapshot.status, "completed", sim.snapshot.error);
  return sim.snapshot;
}
test("baseline has accessible routes on both floors and no invalid placements", () => {
  assert.deepEqual(validateLayout(BASELINE), []);
  for (const v of BASELINE.venues)
    assert.ok(route(BASELINE, "entry", v.nodeId, true).length);
});
test("preserves fixed buildings and structural connections; detects overlap/disconnected routes", () => {
  const b = clone(BASELINE);
  b.venues[0].x++;
  assert.match(validateLayout(b).join(" "), /Preserve/);
  const c = clone(BASELINE);
  const kiosk = c.venues.find((v) => v.movable)!;
  Object.assign(kiosk, { x: c.venues[0].x, y: c.venues[0].y });
  assert.match(validateLayout(c).join(" "), /overlaps/);
  const d = clone(BASELINE);
  d.edges.filter((e) => !e.structural).forEach((e) => (e.enabled = false));
  assert.match(validateLayout(d).join(" "), /access/);
});
test("cohorts are deterministic, exact size, and independent of layouts", () => {
  assert.deepEqual(population(cfg), population(cfg));
  assert.equal(
    population(cfg).reduce((n, a) => n + a.size, 0),
    80,
  );
  const late = population({
    ...cfg,
    hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  });
  assert.ok(late.every((a) => a.arrival >= 1200));
});
test("all-day conservation, venue capacity, spending and hourly reconciliation", async () => {
  const sim = new Simulation("test", BASELINE, cfg, rules);
  while (sim.snapshot.status === "running") {
    await sim.step();
    for (const v of sim.snapshot.layout.venues) {
      const s = sim.snapshot.venues[v.id];
      assert.ok(s.occupancy >= 0 && s.occupancy <= v.capacity);
      assert.ok(s.queue >= 0);
    }
  }
  const s = sim.snapshot;
  assert.equal(s.status, "completed", s.error);
  assert.equal(s.metrics.arrived, cfg.visitors);
  assert.equal(s.metrics.departed, cfg.visitors);
  assert.ok(s.metrics.sales > 0);
  for (const a of s.agents) assert.equal(a.remaining + a.spend, a.budget);
  assert.equal(
    s.metrics.sales,
    Object.values(s.venues).reduce((n, v) => n + v.sales, 0),
  );
  assert.equal(
    s.metrics.sales,
    s.metrics.hourly.reduce((n, h) => n + h.sales, 0),
  );
  assert.equal(
    s.metrics.sales,
    Object.values(s.metrics.categories).reduce((n, x) => n + x, 0),
  );
  assert.ok(sim.frames.length > 100);
});
test("identical baseline/variant runs give identical results and tape", async () => {
  const a = new Simulation("a", BASELINE, cfg, rules),
    b = new Simulation("b", clone(BASELINE), cfg, rules);
  await complete(a);
  await complete(b);
  assert.deepEqual(a.snapshot.metrics, b.snapshot.metrics);
  assert.deepEqual(a.snapshot.sales, b.snapshot.sales);
  assert.deepEqual(a.frames, b.frames);
});
test("closed venues receive no visits; free destinations receive no sales", async () => {
  const layout = clone(BASELINE);
  layout.venues.find((v) => v.id === "pier-market")!.open = 1300;
  layout.venues.find((v) => v.id === "pier-market")!.close = 1380;
  const s = await complete(new Simulation("closed", layout, cfg, rules));
  assert.equal(s.venues["pier-market"].visits, 0);
  assert.equal(s.venues["sea-lions"].sales, 0);
  assert.ok(
    s.agents.some((a) =>
      a.visited.some(
        (id) => layout.venues.find((v) => v.id === id)?.floor === 2,
      ),
    ),
  );
});
test("layout alternatives retain cohorts while applying different geometry", async () => {
  const b = clone(BASELINE);
  const v = b.venues.find((v) => v.id === "snack-kiosk")!;
  v.y = 85;
  v.nodeId = "f1-8";
  const a = new Simulation("a", BASELINE, cfg, rules),
    alt = new Simulation("b", b, cfg, rules, a.cohort);
  assert.deepEqual(a.cohort, alt.cohort);
  await complete(alt);
  assert.equal(
    alt.snapshot.layout.venues.find((x) => x.id === "snack-kiosk")?.y,
    85,
  );
});
test("provider failures are explicit and do not become rule-driven results", async () => {
  const broken = {
    name: "local" as const,
    async decide(): Promise<never> {
      throw Error("model unavailable");
    },
  };
  const s = new Simulation("broken", BASELINE, cfg, broken);
  while (s.snapshot.status === "running") await s.step();
  assert.equal(s.snapshot.status, "failed");
  assert.match(s.snapshot.error!, /model unavailable/);
});
test("path closure produces an accessible detour, and objects cannot block a path", () => {
  const l = clone(BASELINE);
  l.edges.find((e) => e.id === "walk-1-4")!.enabled = false;
  assert.equal(validateLayout(l).length, 0);
  assert.ok(route(l, "f1-4", "f1-5").some((n) => n.startsWith("west-")));
  l.edges.find((e) => e.id === "walk-1-4")!.enabled = true;
  l.venues.find((v) => v.id === "snack-kiosk")!.x = 74;
  assert.match(validateLayout(l).join(" "), /blocks path/);
});
test("venue capacity creates waiting and abandonment without negative occupancy", async () => {
  const l = clone(BASELINE);
  for (const v of l.venues) {
    v.open = 1300;
    v.close = 1380;
  }
  const v = l.venues.find((v) => v.id === "pier-market")!;
  Object.assign(v, {
    capacity: 1,
    open: 600,
    close: 660,
    dwellMin: 30,
    dwellMax: 30,
  });
  const config = { ...cfg, start: 600, end: 660, hourly: [1], visitors: 20 };
  const first = population(config)[0];
  const cohort = Array.from({ length: 20 }, (_, i) => ({
    ...clone(first),
    id: `g${i}`,
    groupId: `g${i}`,
    size: 1,
    arrival: 600,
    departure: 660,
    patience: 2,
  }));
  const forced = {
    name: "rules" as const,
    async decide(inputs: any[]) {
      return inputs.map((x) => ({
        agentId: x.agentId,
        probabilities: x.options.map((_: any, i: number) => (i === 0 ? 1 : 0)),
        source: "rules" as const,
        model: "capacity-test",
      }));
    },
  };
  const sim = new Simulation("capacity", l, config, forced, cohort);
  let peak = 0;
  while (sim.snapshot.status === "running") {
    await sim.step();
    peak = Math.max(peak, sim.snapshot.venues[v.id].queue);
    assert.ok(sim.snapshot.venues[v.id].occupancy <= 1);
  }
  assert.ok(peak > 0);
  assert.ok(sim.snapshot.venues[v.id].abandoned > 0);
  assert.equal(sim.snapshot.venues[v.id].queue, 0);
});

test("meal times and familiarity reach decisions; closed hours and show times filter choices", async () => {
  const inputAt = async (at: number) => {
    const config = {
      ...cfg,
      start: at,
      end: at + 60,
      hourly: [1],
      visitors: 1,
    };
    const cohort = population(config);
    cohort[0].arrival = at;
    cohort[0].departure = at + 60;
    const seen: any[] = [];
    const policy = {
      name: "rules" as const,
      async decide(inputs: any[]) {
        seen.push(...inputs);
        return rules.decide(inputs);
      },
    };
    const sim = new Simulation("meal", BASELINE, config, policy, cohort);
    await sim.step();
    return seen[0];
  };
  const morning = await inputAt(600),
    lunch = await inputAt(780);
  assert.match(lunch.state, /Familiarity/);
  assert.ok(lunch.options.some((o: any) => /restaurant/.test(o.label)));
  assert.ok(!morning.options.some((o: any) => o.id === "pier-market"));
  assert.ok(!morning.options.some((o: any) => o.id === "bay-stage"));
});

test("zero-budget retail browsing creates visits without purchases and replay wallets stay historical", async () => {
  const layout = clone(BASELINE);
  for (const v of layout.venues) {
    v.open = 1300;
    v.close = 1380;
  }
  const shop = layout.venues.find((v) => v.id === "souvenirs-south")!;
  Object.assign(shop, {
    open: 600,
    close: 660,
    dwellMin: 10,
    dwellMax: 10,
    purchaseProbability: 1,
  });
  const config = { ...cfg, visitors: 1, start: 600, end: 660, hourly: [1] };
  const cohort = population(config);
  Object.assign(cohort[0], { arrival: 600, departure: 650, budget: 0 });
  const policy = {
    name: "rules" as const,
    async decide(inputs: any[]) {
      return inputs.map((i) => ({
        agentId: i.agentId,
        probabilities: i.options.map((o: any) => (o.id === shop.id ? 1 : 0)),
        source: "rules" as const,
        model: "test-browse",
      }));
    },
  };
  const sim = new Simulation("browse", layout, config, policy, cohort);
  await complete(sim);
  assert.equal(sim.snapshot.venues[shop.id].visits, 1);
  assert.equal(sim.snapshot.venues[shop.id].sales, 0);
  assert.ok(sim.snapshot.venues[shop.id].dwellMinutes >= 10);
  assert.equal(sim.snapshot.metrics.zeroSpendDepartures, 1);
  const recorded = sim.frames.find((f) => f.agents.length)?.agents[0];
  assert.equal(recorded?.remaining, 0);
  assert.ok(Array.isArray(recorded?.history));
  assert.ok(sim.frames.every((f) => f.traffic));
});

test("same-pier 1000/2000 demand tests produce reconciled sales and visits on both levels", async () => {
  const results = [];
  for (const visitors of [1000, 2000]) {
    const s = await complete(
      new Simulation(
        `demand-${visitors}`,
        BASELINE,
        { ...cfg, visitors, hourly: Array(11).fill(1), seed: "crowd-test-1" },
        rules,
      ),
    );
    assert.equal(s.metrics.arrived, visitors);
    assert.equal(s.metrics.departed, visitors);
    assert.equal(
      s.metrics.sales,
      s.agents.reduce((total, a) => total + a.spend, 0),
    );
    for (const floor of [1, 2])
      assert.ok(
        s.layout.venues
          .filter((v) => v.floor === floor)
          .reduce((n, v) => n + s.venues[v.id].visits, 0) > 0,
      );
    results.push(s.metrics.sales);
  }
  // A broad regression bound for this fixed seed, not a promised economic multiplier.
  assert.ok(results[1] > results[0] * 1.5);
});
