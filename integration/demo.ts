import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Simulation } from "../engine/src/simulation";
import { BASELINE } from "../shared/baseline";
import { DEFAULT_CONFIG } from "../shared/contracts";
import { provider } from "../intelligence/src/providers";
const config = {
  ...DEFAULT_CONFIG,
  provider: (process.env.DEMO_PROVIDER ||
    "local") as typeof DEFAULT_CONFIG.provider,
  visitors: Number(process.env.DEMO_VISITORS || DEFAULT_CONFIG.visitors),
  speed: 100000,
};
const sim = new Simulation(
  `demo-${config.provider}-${Date.now()}`,
  BASELINE,
  config,
  provider(config.provider),
);
let last = 0;
while (sim.snapshot.status === "running") {
  await sim.step();
  if (sim.snapshot.decisions - last >= 1000) {
    last = sim.snapshot.decisions;
    console.log(
      JSON.stringify({
        time: sim.snapshot.time,
        decisions: last,
        seconds: Math.round(sim.snapshot.wallSeconds),
      }),
    );
  }
}
await mkdir(".data", { recursive: true });
const record = {
  snapshot: sim.snapshot,
  frames: sim.frames,
  cohort: sim.cohort,
  cohortHash: createHash("sha256")
    .update(JSON.stringify(sim.cohort))
    .digest("hex"),
};
await writeFile(`.data/${sim.snapshot.id}.json`, JSON.stringify(record));
console.log(
  JSON.stringify({
    id: sim.snapshot.id,
    status: sim.snapshot.status,
    error: sim.snapshot.error,
    metrics: sim.snapshot.metrics,
    seconds: sim.snapshot.wallSeconds,
    speed: sim.snapshot.achievedSpeed,
    frames: sim.frames.length,
  }),
);
if (sim.snapshot.status !== "completed") process.exitCode = 1;
