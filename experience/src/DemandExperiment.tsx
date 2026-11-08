import { useEffect, useRef, useState } from "react";
import { BASELINE } from "../../shared/baseline";
import {
  DEFAULT_CONFIG,
  money,
  type Snapshot,
  type Config,
} from "../../shared/contracts";
const patterns: Record<string, number[]> = {
  Even: Array(11).fill(1),
  Morning: [12, 10, 8, 4, 2, 1, 1, 1, 1, 1, 1],
  Afternoon: [1, 1, 1, 2, 4, 8, 12, 10, 6, 2, 1],
};
const key = "pier39-demand-test-v1";
type Trial = {
  counts: number[];
  arrivals: string[];
  ids: (string | null)[];
  stopped?: boolean;
  error?: string;
};
async function api(path: string, body?: unknown) {
  const r = await fetch(
    `/api${path}`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const v = await r.json();
  if (!r.ok) throw Error(v.error ?? "Request failed");
  return v;
}
export function DemandExperiment({ open }: { open: (id: string) => void }) {
  const [trial, setTrial] = useState<Trial | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      return saved &&
        saved.counts?.length === 2 &&
        saved.arrivals?.length === 2 &&
        saved.ids?.length === 2 &&
        saved.counts.every(
          (n: unknown) =>
            typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 2000,
        ) &&
        saved.arrivals.every((v: string) => Object.hasOwn(patterns, v))
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [counts, setCounts] = useState(trial?.counts ?? [100, 200]),
    [arrivals, setArrivals] = useState(trial?.arrivals ?? ["Even", "Even"]);
  const [runs, setRuns] = useState<(Snapshot | null)[]>([null, null]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const starting = useRef(false),
    stopping = useRef(false);
  function save(t: Trial) {
    localStorage.setItem(key, JSON.stringify(t));
    setTrial(t);
  }
  useEffect(() => {
    if (!trial) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const snapshots = await Promise.all(
          trial.ids.map((id) => (id ? api(`/runs/${id}`) : null)),
        );
        if (!alive) return;
        setRuns(snapshots);
        if (trial.stopped || trial.error || stopping.current) return;
        if (snapshots.some((s) => s?.status === "failed")) {
          save({
            ...trial,
            error: "A run failed. Inspect its result before retrying.",
          });
          return;
        }
        if (
          snapshots[0]?.status === "completed" &&
          !trial.ids[1] &&
          !starting.current
        ) {
          starting.current = true;
          setBusy(true);
          try {
            const result = await launch(trial, 1);
            if (stopping.current) {
              await api(`/runs/${result.id}`, { action: "cancel" });
              save({ ...trial, ids: [trial.ids[0], result.id], stopped: true });
            } else save({ ...trial, ids: [trial.ids[0], result.id] });
          } finally {
            starting.current = false;
            setBusy(false);
          }
          return;
        }
        if (snapshots.every((s) => s?.status === "completed")) return;
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      if (alive) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trial]);
  async function launch(t: Trial, index: number) {
    const config: Config = {
      ...DEFAULT_CONFIG,
      provider: "rules",
      visitors: t.counts[index],
      hourly: patterns[t.arrivals[index]],
      speed: 100000,
      seed: "crowd-test-1",
    };
    return api("/runs", { layout: BASELINE, config });
  }
  async function start() {
    if (counts.some((n) => !Number.isInteger(n) || n < 1 || n > 2000)) {
      setError("Choose 1–2,000 visitors per run.");
      return;
    }
    setBusy(true);
    setError("");
    stopping.current = false;
    const t: Trial = {
      counts: [...counts],
      arrivals: [...arrivals],
      ids: [null, null],
    };
    try {
      const first = await launch(t, 0);
      setRuns([null, null]);
      save({ ...t, ids: [first.id, null] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const complete = runs.every((r) => r?.status === "completed");
  const active = !!trial && !trial.stopped && !trial.error && !complete;
  return (
    <div className="comparison demand-test">
      <p className="eyebrow">SAME PIER · DIFFERENT DEMAND</p>
      <h2>Compare crowds and arrivals</h2>
      <p>
        Both runs use Current PIER 39, the same opening hours, prices and
        behavior rules. Only visitor counts and arrival patterns change. Runs
        execute one at a time.
      </p>
      <div className="button-row">
        <button disabled={active} onClick={() => setCounts([100, 200])}>
          Quick · 100 vs 200
        </button>
        <button disabled={active} onClick={() => setCounts([1000, 2000])}>
          Larger · 1,000 vs 2,000
        </button>
      </div>
      <div className="comparison-cards">
        {[0, 1].map((i) => (
          <div key={i}>
            <h3>Run {i === 0 ? "A" : "B"}</h3>
            <label>
              Visitors {i === 0 ? "A" : "B"}
              <input
                type="number"
                min={1}
                max={2000}
                disabled={active}
                value={counts[i]}
                onChange={(e) =>
                  setCounts(
                    counts.map((n, j) => (i === j ? +e.target.value : n)),
                  )
                }
              />
            </label>
            <label>
              Arrivals {i === 0 ? "A" : "B"}
              <select
                disabled={active}
                value={arrivals[i]}
                onChange={(e) =>
                  setArrivals(
                    arrivals.map((v, j) => (i === j ? e.target.value : v)),
                  )
                }
              >
                {Object.keys(patterns).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <p className="hint">
        Rules mode · 10:00–21:00 · 100/200 is the recommended fast test. Large
        populations take longer. Revenue is earned through simulated purchases,
        so capacity, timing and budgets affect the difference.
      </p>
      <button
        className="primary"
        disabled={busy || active}
        onClick={() => void start()}
      >
        {busy
          ? "Starting…"
          : active
            ? "Experiment running…"
            : "Run crowd comparison"}
      </button>
      {active && (
        <button
          disabled={busy}
          onClick={() => {
            stopping.current = true;
            setBusy(true);
            void Promise.all(
              trial!.ids.filter(Boolean).map(async (id) => {
                const current: Snapshot = await api(`/runs/${id}`);
                if (["running", "paused"].includes(current.status)) {
                  try {
                    await api(`/runs/${id}`, { action: "cancel" });
                  } catch (error) {
                    const latest: Snapshot = await api(`/runs/${id}`);
                    if (["running", "paused"].includes(latest.status))
                      throw error;
                  }
                }
              }),
            )
              .then(() => save({ ...trial!, stopped: true }))
              .catch((e) => {
                stopping.current = false;
                setError(e.message);
                save({ ...trial! });
              })
              .finally(() => setBusy(false));
          }}
        >
          Stop experiment
        </button>
      )}
      {(error || trial?.error) && <p role="alert">{error || trial?.error}</p>}
      {trial && (
        <>
          <h3>
            {trial.stopped
              ? "Experiment stopped"
              : complete
                ? "Completed results"
                : "Experiment progress"}
          </h3>
          <p>
            {trial.counts[0]} ({trial.arrivals[0]}) versus {trial.counts[1]} (
            {trial.arrivals[1]}) · Current PIER 39
          </p>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Run A</th>
                <th>Run B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Status</th>
                {[0, 1].map((i) => (
                  <td key={i}>
                    {runs[i]?.status ??
                      (trial.ids[i]
                        ? "Loading"
                        : trial.stopped
                          ? "Stopped"
                          : "Queued")}
                  </td>
                ))}
              </tr>
              {(
                [
                  ["Revenue", (r: Snapshot) => money(r.metrics.sales)],
                  ["Arrived", (r: Snapshot) => r.metrics.arrived],
                  [
                    "Revenue / arrived visitor",
                    (r: Snapshot) => money(r.metrics.spendPerVisitor),
                  ],
                  [
                    "Level 1 visits",
                    (r: Snapshot) =>
                      r.layout.venues
                        .filter((v) => v.floor === 1)
                        .reduce((n, v) => n + r.venues[v.id].visits, 0),
                  ],
                  [
                    "Level 2 visits",
                    (r: Snapshot) =>
                      r.layout.venues
                        .filter((v) => v.floor === 2)
                        .reduce((n, v) => n + r.venues[v.id].visits, 0),
                  ],
                ] as const
              ).map(([label, value]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {[0, 1].map((i) => (
                    <td key={i}>{runs[i] ? value(runs[i]!) : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="button-row">
            {trial.ids.map(
              (id, i) =>
                id && (
                  <button key={id} onClick={() => open(id)}>
                    Inspect run {i === 0 ? "A" : "B"}
                  </button>
                ),
            )}
          </div>
          {complete && (
            <p>
              <strong>
                Revenue difference:{" "}
                {money(runs[1]!.metrics.sales - runs[0]!.metrics.sales)}
                {runs[0]!.metrics.sales > 0
                  ? ` (${((runs[1]!.metrics.sales / runs[0]!.metrics.sales - 1) * 100).toFixed(1)}%)`
                  : ""}
              </strong>
              . One seeded test is illustrative; different demand does not
              guarantee proportional revenue.
            </p>
          )}
        </>
      )}
    </div>
  );
}
