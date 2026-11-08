import assert from "node:assert/strict";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { BASELINE } from "../shared/baseline";
import {
  DEFAULT_CONFIG,
  type Config,
  type Comparison,
  type Snapshot,
  type Layout,
} from "../shared/contracts";
import { scenario } from "../shared/scenarios";
import { comparisonSummary } from "../shared/comparison";
async function api(path: string, body?: unknown): Promise<any> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await fetch(
        `http://127.0.0.1:4321/api${path}`,
        body
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : undefined,
      );
      break;
    } catch (error) {
      if (body || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!response) throw Error("No HTTP response");
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
}
function verify(s: Snapshot) {
  assert.equal(s.status, "completed", s.error);
  assert.equal(s.metrics.attempted, s.config.visitors);
  assert.equal(
    s.metrics.arrived + (s.metrics.parkingRejected ?? 0),
    s.config.visitors,
  );
  assert.equal(s.metrics.arrived, s.metrics.departed);
  assert.equal(
    s.metrics.sales,
    s.sales.reduce((sum, x) => sum + x.cents, 0),
  );
  assert.equal(
    s.metrics.sales,
    Object.values(s.venues).reduce((sum, v) => sum + v.sales, 0),
  );
  assert.equal(
    s.metrics.sales,
    s.metrics.hourly.reduce((sum, h) => sum + h.sales, 0),
  );
  assert.equal(
    s.metrics.arrived,
    s.metrics.hourly.reduce((sum, h) => sum + h.visits, 0),
  );
  assert.equal(
    s.metrics.sales,
    Object.values(s.metrics.categories).reduce((sum, x) => sum + x, 0),
  );
  assert.ok((s.metrics.parkingPeak ?? 0) <= (s.layout.parking?.spaces ?? 976));
  for (const a of s.agents) {
    assert.equal(a.remaining + a.spend, a.budget);
    assert.ok(a.remaining >= 0);
    const meals = a.meals ?? [];
    assert.equal(new Set(meals.map((m) => m.occasion)).size, meals.length);
    for (let i = 1; i < meals.length; i++)
      assert.ok(meals[i].at - meals[i - 1].at >= 240);
  }
}
async function runPair(
  variant: Layout,
  config: Config,
  pairs: number,
  label: string,
) {
  let comparison: Comparison;
  const resume = process.env.E2E_RESUME;
  delete process.env.E2E_RESUME;
  if (resume) {
    comparison = await api(`/comparisons/${resume}`);
    assert.equal(comparison.config.visitors, config.visitors);
    assert.equal(comparison.config.provider, config.provider);
  } else {
    const saved = await api("/layouts", variant);
    assert.ok((await api("/layouts")).some((l: Layout) => l.id === saved.id));
    comparison = await api("/comparisons", {
      baseline: BASELINE,
      variant: saved,
      config,
      pairs,
    });
  }
  console.log(
    JSON.stringify({
      label,
      id: comparison.id,
      provider: config.provider,
      visitors: config.visitors,
      pairs,
    }),
  );
  const start = Date.now();
  let last = "";
  while (comparison.status === "running") {
    await new Promise((r) => setTimeout(r, 2000));
    comparison = await api(`/comparisons/${comparison.id}`);
    const status = comparison.pairs.map((p) => p.status).join(",");
    if (status !== last) {
      console.log(
        JSON.stringify({
          label,
          status,
          elapsedSeconds: Math.round((Date.now() - start) / 1000),
        }),
      );
      last = status;
    }
    assert.ok(Date.now() - start < 60 * 60 * 1000, "Experiment timed out");
  }
  assert.equal(comparison.status, "completed", JSON.stringify(comparison));
  const runs = [];
  for (const pair of comparison.pairs) {
    const a: Snapshot = await api(`/runs/${pair.a}`),
      b: Snapshot = await api(`/runs/${pair.b}`);
    verify(a);
    verify(b);
    assert.ok(pair.venueSalesA && pair.venueSalesB);
    assert.equal(
      Object.values(pair.venueSalesB).reduce((n, v) => n + v, 0) -
        Object.values(pair.venueSalesA).reduce((n, v) => n + v, 0),
      pair.delta,
    );
    runs.push({
      a: {
        id: a.id,
        seconds: a.wallSeconds,
        speed: a.achievedSpeed,
        decisions: a.decisions,
      },
      b: {
        id: b.id,
        seconds: b.wallSeconds,
        speed: b.achievedSpeed,
        decisions: b.decisions,
      },
    });
  }
  // Replay is fetched from the real HTTP service after completion and decompression.
  const a = await api(`/runs/${comparison.pairs[0].a}/replay`),
    b = await api(`/runs/${comparison.pairs[0].b}/replay`);
  assert.equal(a.cohortHash, b.cohortHash);
  assert.deepEqual(a.cohort, b.cohort);
  assert.equal(
    a.cohort.reduce((n: number, g: any) => n + g.size, 0),
    config.visitors,
  );
  assert.ok(b.frames.length > 100);
  assert.ok(
    b.frames.some((f: any) => f.agents.some((a: any) => a.floor === 2)),
  );
  for (const f of b.frames)
    for (const [id, v] of Object.entries(f.venues) as any) {
      assert.ok(
        v.occupancy >= 0 &&
          v.occupancy <=
            b.snapshot.layout.venues.find((x: any) => x.id === id).capacity,
      );
      assert.ok(v.queue >= 0);
    }
  const summary = comparisonSummary(comparison);
  assert.ok(
    Math.abs(summary.gains + summary.losses - comparison.meanDelta!) < 0.001,
  );
  const result = {
    checkedAt: new Date().toISOString(),
    comparison,
    runs,
    replayFrames: b.frames.length,
    cohortHash: b.cohortHash,
    elapsedSeconds: (Date.now() - start) / 1000,
    checks: [
      "SpacetimeDB layout persistence",
      "Matched exact cohorts",
      "Real Engine and provider",
      "Finite wallets and meals",
      "Parking conservation",
      "Venue/hour/category sales reconciliation",
      "Paired venue decomposition",
      "Saved replay with both floors",
    ],
  };
  await mkdir("docs", { recursive: true });
  await writeFile(
    `docs/verification-${label}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      label,
      status: "PASS",
      meanDelta: comparison.meanDelta,
      range: comparison.range,
      seconds: result.elapsedSeconds,
    }),
  );
  return result;
}
const phase = process.env.E2E_PHASE ?? "local";
const health = await api("/health");
assert.equal(health.storage, "SpacetimeDB");
if (phase === "parking") {
  await runPair(
    scenario("parking-less", DEFAULT_CONFIG).layout,
    {
      ...DEFAULT_CONFIG,
      provider: "rules",
      visitors: 30000,
      seed: "parking-demand-v3",
    },
    3,
    "parking-30000",
  );
} else if (phase === "scale") {
  assert.equal(health.providers.local, true);
  await runPair(
    scenario("dining", DEFAULT_CONFIG).layout,
    { ...DEFAULT_CONFIG, visitors: 5000, seed: "dining-scale-v3" },
    1,
    "local-5000",
  );
} else {
  assert.equal(health.providers.local, true);
  const draft = scenario("dining", DEFAULT_CONFIG);
  draft.layout.name = "Demo · bay-end kiosk, terrace dining & later hours";
  Object.assign(
    draft.layout.venues.find((v) => v.id === "snack-kiosk")!,
    { x: 65, y: 85, nodeId: "west-1-8" },
  );
  draft.layout.venues.find((v) => v.id === "pier-market")!.close = 1320;
  const config = {
    ...DEFAULT_CONFIG,
    visitors: 1000,
    end: 1320,
    hourly: [...DEFAULT_CONFIG.hourly, 2],
    seed: "management-demo-v3",
  };
  const result = await runPair(draft.layout, config, 3, "local-1000");
  const identical = await runPair(
    {
      ...structuredClone(BASELINE),
      id: "draft-identical",
      name: "Identical layout control",
    },
    { ...DEFAULT_CONFIG, visitors: 60, seed: "identical-v3" },
    1,
    "identical",
  );
  assert.equal(identical.comparison.meanDelta, 0);
  assert.deepEqual(
    identical.comparison.pairs[0].metricsA,
    identical.comparison.pairs[0].metricsB,
  );
  let failed: Comparison = await api("/comparisons", {
    baseline: BASELINE,
    variant: draft.layout,
    config: { ...DEFAULT_CONFIG, provider: "rules", visitors: 1000, speed: 60 },
    pairs: 1,
  });
  while (!failed.pairs[0].a) {
    await new Promise((r) => setTimeout(r, 100));
    failed = await api(`/comparisons/${failed.id}`);
  }
  await api(`/runs/${failed.pairs[0].a}`, { action: "cancel" });
  while (failed.status === "running") {
    await new Promise((r) => setTimeout(r, 500));
    failed = await api(`/comparisons/${failed.id}`);
  }
  assert.equal(failed.status, "incomplete");
  assert.equal(failed.meanDelta, null);
  await writeFile(
    "docs/verification.json",
    JSON.stringify(
      {
        ...result,
        health,
        identicalLocalAI: {
          id: identical.comparison.id,
          delta: 0,
          status: "completed",
        },
        cancelledComparison: {
          id: failed.id,
          status: failed.status,
          meanDelta: failed.meanDelta,
        },
      },
      null,
      2,
    ),
  );
  console.log("PASS: identical local-AI control and interrupted comparison.");
}
