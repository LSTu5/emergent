import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { BASELINE } from "../../shared/baseline";
import { clone, validateLayout, validateConfig } from "../../shared/layout";
import type {
  Layout,
  Config,
  Snapshot,
  Comparison,
  Profile,
  RunRecord,
} from "../../shared/contracts";
import { Simulation } from "./simulation";
import { provider, providerHealth } from "../../intelligence/src/providers";
import {
  initializeStorage,
  save,
  list,
  saveReplay,
  loadReplay,
} from "./storage";
import { population } from "./population";
const runs = new Map<string, Simulation>();
const past = new Map<string, Snapshot>();
const comparisons = new Map<string, Comparison>();
const hash = (p: Profile[]) =>
  createHash("sha256").update(JSON.stringify(p)).digest("hex");
await initializeStorage();
await save(BASELINE.id, "layout", BASELINE);
for (const s of await list<Snapshot>("run")) {
  if (s.status === "running" || s.status === "paused") {
    s.status = "failed";
    s.error = "Interrupted by server restart; start a new run.";
    await save(s.id, "run", s);
  }
  past.set(s.id, s);
}
// A portable recording of an actual completed local-model run is included for demos.
try {
  const demo: RunRecord = JSON.parse(
    gunzipSync(await readFile("data/demo-run.json.gz")).toString(),
  );
  if (!past.has(demo.snapshot.id)) {
    await save(demo.snapshot.id, "run", demo.snapshot);
    await saveReplay(demo.snapshot.id, demo);
    past.set(demo.snapshot.id, demo.snapshot);
  }
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT")
    console.warn("Demo replay import:", (e as Error).message);
}
for (const c of await list<Comparison>("comparison")) {
  if (c.status === "running") {
    c.status = "incomplete";
    for (const p of c.pairs)
      if (p.status !== "completed") {
        p.status = "failed";
        p.error = "Interrupted by server restart";
      }
    await save(c.id, "comparison", c);
  }
  comparisons.set(c.id, c);
}
let stopping = false;
async function execute(sim: Simulation) {
  const s = sim.snapshot;
  let savedAt = s.time;
  try {
    await save(s.id, "run", s);
    while (!stopping && (s.status === "running" || s.status === "paused")) {
      if (s.status === "paused") {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const started = performance.now();
      await sim.step();
      if (
        s.time - savedAt >= (s.config.visitors > 2000 ? 60 : 15) ||
        (["completed", "failed"] as string[]).includes(s.status)
      ) {
        savedAt = s.time;
        await save(s.id, "run", s);
        await saveReplay(s.id, {
          snapshot: s,
          frames: sim.frames,
          cohort: sim.cohort,
          cohortHash: hash(sim.cohort),
        } satisfies RunRecord);
      }
      const wait = 15000 / s.config.speed - (performance.now() - started);
      await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    }
    if (stopping && s.status === "running") {
      s.status = "failed";
      s.error = "Server stopped";
    }
    await save(s.id, "run", s);
    await saveReplay(s.id, {
      snapshot: s,
      frames: sim.frames,
      cohort: sim.cohort,
      cohortHash: hash(sim.cohort),
    });
  } catch (e) {
    s.status = "failed";
    s.error = (e as Error).message;
    console.error("Run failed:", s.error);
  } finally {
    past.set(s.id, s);
    runs.delete(s.id);
  }
}
function start(layout: Layout, config: Config, cohort?: Profile[]) {
  const errors = [...validateLayout(layout), ...validateConfig(config)];
  if (errors.length) throw Error(errors.join("; "));
  const sim = new Simulation(
    `run-${randomUUID()}`,
    layout,
    config,
    provider(config.provider),
    cohort,
  );
  runs.set(sim.snapshot.id, sim);
  return sim;
}
async function compare(c: Comparison) {
  try {
    for (const p of c.pairs) {
      p.status = "running";
      const config = { ...c.config, seed: p.seed };
      const cohort = population(config);
      p.cohortHash = hash(cohort);
      const a = start(c.baseline, config, cohort);
      p.a = a.snapshot.id;
      await save(c.id, "comparison", c);
      await execute(a);
      if (a.snapshot.status !== "completed")
        throw Error(a.snapshot.error ?? "Baseline incomplete");
      const b = start(c.variant, config, cohort);
      p.b = b.snapshot.id;
      await save(c.id, "comparison", c);
      await execute(b);
      if (b.snapshot.status !== "completed")
        throw Error(b.snapshot.error ?? "Alternative incomplete");
      p.venueSalesA = Object.fromEntries(
        Object.entries(a.snapshot.venues).map(([id, v]) => [id, v.sales]),
      );
      p.venueSalesB = Object.fromEntries(
        Object.entries(b.snapshot.venues).map(([id, v]) => [id, v.sales]),
      );
      p.metricsA = clone(a.snapshot.metrics);
      p.metricsB = clone(b.snapshot.metrics);
      p.delta = b.snapshot.metrics.sales - a.snapshot.metrics.sales;
      p.status = "completed";
      await save(c.id, "comparison", c);
    }
    c.status = "completed";
  } catch (e) {
    c.status = "incomplete";
    for (const p of c.pairs)
      if (p.status !== "completed") {
        p.status = "failed";
        p.error = (e as Error).message;
      }
  }
  const ds = c.pairs
    .filter((p) => p.status === "completed")
    .map((p) => p.delta!);
  c.meanDelta = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  c.range = ds.length ? [Math.min(...ds), Math.max(...ds)] : null;
  c.sd =
    ds.length > 1
      ? Math.sqrt(
          ds.reduce((n, d) => n + (d - c.meanDelta!) ** 2, 0) / (ds.length - 1),
        )
      : null;
  await save(c.id, "comparison", c);
}
async function body(req: import("node:http").IncomingMessage) {
  let str = "";
  for await (const chunk of req) {
    str += chunk;
    if (str.length > 2_000_000) throw Error("Request too large");
  }
  return str ? JSON.parse(str) : {};
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4321"),
    path = url.pathname;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    const origin = req.headers.origin;
    if (
      origin &&
      !["http://127.0.0.1:4320", "http://localhost:4320"].includes(origin)
    )
      throw Error("Unrecognized browser origin");
    if (path === "/api/health") {
      res.end(
        JSON.stringify({
          ready: true,
          storage: "SpacetimeDB",
          providers: await providerHealth(),
          version: "pier39.v2",
        }),
      );
      return;
    }
    if (path === "/api/layouts" && req.method === "GET") {
      res.end(JSON.stringify(await list<Layout>("layout")));
      return;
    }
    if (path === "/api/layouts" && req.method === "POST") {
      const l = (await body(req)) as Layout;
      const e = validateLayout(l);
      if (e.length) throw Error(e.join("; "));
      if (l.id === BASELINE.id)
        throw Error("Create an alternative to edit the baseline");
      l.id = `layout-${randomUUID()}`;
      await save(l.id, "layout", l);
      res.end(JSON.stringify(l));
      return;
    }
    if (path === "/api/runs" && req.method === "GET") {
      const all = [
        ...past.values(),
        ...Array.from(runs.values(), (r) => r.snapshot),
      ];
      res.end(
        JSON.stringify(
          [...new Map(all.map((s) => [s.id, s])).values()].map((s) => ({
            id: s.id,
            status: s.status,
            time: s.time,
            name: s.layout.name,
            provider: s.config.provider,
            metrics: s.metrics,
          })),
        ),
      );
      return;
    }
    if (path === "/api/runs" && req.method === "POST") {
      const { layout, config } = await body(req);
      const health = await providerHealth();
      if (!health[config.provider as keyof typeof health])
        throw Error(`${config.provider} provider is not ready`);
      const sim = start(layout, config);
      void execute(sim);
      res.end(JSON.stringify({ id: sim.snapshot.id }));
      return;
    }
    if (path.startsWith("/api/runs/")) {
      const [, , , id, action] = path.split("/");
      const sim = runs.get(id);
      const s = sim?.snapshot ?? past.get(id);
      if (!s) throw Error("Unknown run");
      if (action === "replay") {
        res.end(
          JSON.stringify(
            sim
              ? {
                  snapshot: s,
                  frames: sim.frames,
                  cohort: sim.cohort,
                  cohortHash: hash(sim.cohort),
                }
              : await loadReplay(id),
          ),
        );
        return;
      }
      if (req.method === "POST") {
        if (!sim) throw Error("Recorded runs cannot be resumed");
        const b = await body(req);
        if (b.action === "pause" && s.status === "running") s.status = "paused";
        else if (b.action === "resume" && s.status === "paused")
          s.status = "running";
        else if (
          b.action === "cancel" &&
          (s.status === "running" || s.status === "paused")
        ) {
          s.status = "failed";
          s.error = "Cancelled by operator";
        }
        res.end(JSON.stringify({ status: s.status }));
        return;
      }
      res.end(JSON.stringify(s));
      return;
    }
    if (path === "/api/comparisons" && req.method === "GET") {
      res.end(JSON.stringify([...comparisons.values()]));
      return;
    }
    if (path === "/api/comparisons" && req.method === "POST") {
      const b = await body(req);
      const errors = [
        ...validateLayout(b.baseline),
        ...validateLayout(b.variant),
        ...validateConfig(b.config),
      ];
      for (const l of [b.baseline, b.variant])
        if (
          (l.parking?.enabled ?? true) &&
          (b.config.initialParkedVehicles ?? 300) > (l.parking?.spaces ?? 976)
        )
          errors.push(
            "Initial parked vehicles exceed a layout's parking capacity",
          );
      if (errors.length) throw Error(errors.join("; "));
      if (![1, 3].includes(b.pairs)) throw Error("Choose one or three pairs");
      const h = await providerHealth();
      if (!h[b.config.provider as keyof typeof h])
        throw Error("Provider is not ready");
      const c: Comparison = {
        id: `comparison-${randomUUID()}`,
        baseline: clone(b.baseline),
        variant: clone(b.variant),
        config: b.config,
        pairs: Array.from({ length: b.pairs }, (_, i) => ({
          seed: `${b.config.seed}-${i + 1}`,
          a: null,
          b: null,
          status: "pending",
        })),
        status: "running",
        meanDelta: null,
        range: null,
        sd: null,
      };
      comparisons.set(c.id, c);
      await save(c.id, "comparison", c);
      void compare(c);
      res.end(JSON.stringify(c));
      return;
    }
    if (path.startsWith("/api/comparisons/")) {
      res.end(JSON.stringify(comparisons.get(path.split("/")[3])));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
});
server.listen(4321, "127.0.0.1", () =>
  console.log("PIER 39 Engine: http://127.0.0.1:4321"),
);
process.on("SIGTERM", () => {
  stopping = true;
  server.close();
});
