import React, { useEffect, useState } from "react";
import demoManifest from "../../data/demo-manifest.json";
import { BASELINE, categoryDefaults } from "../../shared/baseline";
import { clone, upgradeLegacyLayout, validateLayout } from "../../shared/layout";
import {
  findVenuePosition,
  placeVenue,
  repairObjectPositions,
} from "../../shared/editing";
import {
  DEFAULT_CONFIG,
  CATEGORIES,
  LABELS,
  money,
  clock,
  type Layout,
  type Config,
  type Venue,
  type Floor,
  type Snapshot,
  type Comparison,
  type Frame,
  type Point,
} from "../../shared/contracts";
import { PierMap, COLORS } from "./Map";
import { SCENARIOS, scenario } from "../../shared/scenarios";
import { ComparisonResults } from "./ComparisonResults";
import "./style.css";
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
  const raw = await r.text();
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    throw Error(
      "Engine is unavailable. Start the local services with npm run dev.",
    );
  }
  if (!r.ok) throw Error(b.error ?? "Request failed");
  return b;
}
const number = (n: number) => Math.round(n).toLocaleString();
function TimeInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(clock(value));
  useEffect(() => setText(clock(value)), [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
          onChange(t.split(":").reduce((h, m) => h * 60 + +m, 0));
      }}
      onBlur={() => setText(clock(value))}
    />
  );
}
function ScheduleInput({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const formatted = value.map(clock).join(", ");
  const [text, setText] = useState(formatted);
  useEffect(() => setText(formatted), [formatted]);
  return (
    <input
      value={text}
      placeholder="12:00, 14:00, 16:00"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const times = text
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))
          onChange(
            times.map((t) => t.split(":").reduce((h, m) => h * 60 + +m, 0)),
          );
        else setText(formatted);
      }}
    />
  );
}
export default function App() {
  const [layout, setLayout] = useState<Layout>(clone(BASELINE)),
    [saved, setSaved] = useState<Layout[]>([]),
    [past, setPast] = useState<any[]>([]),
    [history, setHistory] = useState<Layout[]>([]),
    [future, setFuture] = useState<Layout[]>([]);
  const [selected, setSelected] = useState<string | null>("sea-lions"),
    [floor, setFloor] = useState<Floor>(1),
    [bothFloors, setBothFloors] = useState(true),
    [tab, setTab] = useState("plan"),
    [scenarioId, setScenarioId] = useState<string>("dining"),
    [paths, setPaths] = useState(false),
    [pathId, setPathId] = useState("walk-1-4"),
    [heat, setHeat] = useState("none");
  const [config, setConfig] = useState<Config>(clone(DEFAULT_CONFIG)),
    [health, setHealth] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null),
    [run, setRun] = useState<Snapshot | null>(null),
    [guest, setGuest] = useState<string | null>(null),
    [guestSearch, setGuestSearch] = useState(""),
    [replayPlaying, setReplayPlaying] = useState(false),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [reports, setReports] = useState<Comparison[]>([]),
    [pairs, setPairs] = useState(1),
    [frames, setFrames] = useState<Frame[]>([]),
    [frameIndex, setFrameIndex] = useState(-1);
  const editable = layout.id !== BASELINE.id;
  const viewLayout = tab === "simulate" && run ? run.layout : layout;
  const venue = viewLayout.venues.find((v) => v.id === selected);
  const errors = validateLayout(layout);
  const frame = frameIndex >= 0 ? frames[frameIndex] : null;
  const metrics = frame?.metrics ?? run?.metrics;
  function loadPlanningLayout(source: Layout) {
    const current = upgradeLegacyLayout(source);
    setLayout(clone(current));
    setError("");
    if (current !== source)
      setNotice("Updated this older layout to the current pier map. Business assumptions are preserved; save a new version to keep it.");
  }
  async function refresh() {
    try {
      setHealth(await api("/health"));
      setSaved(await api("/layouts"));
      setPast(await api("/runs"));
      setReports(await api("/comparisons"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void api("/health")
        .then(setHealth)
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const poll = () =>
      api(`/runs/${runId}`)
        .then((s) => {
          if (alive) setRun(s);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void poll();
    const t =
      run?.id === runId && ["completed", "failed"].includes(run.status)
        ? undefined
        : setInterval(poll, 1100);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [runId, run?.status]);
  useEffect(() => {
    if (!comparison || comparison.status !== "running") return;
    const t = setInterval(() => {
      void api(`/comparisons/${comparison.id}`)
        .then(setComparison)
        .catch((e) => setError(e.message));
    }, 1000);
    return () => clearInterval(t);
  }, [comparison?.id, comparison?.status]);
  useEffect(() => {
    if (!replayPlaying || frameIndex < 0 || tab !== "simulate") return;
    if (frameIndex >= frames.length - 1) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(() => setFrameIndex((i) => i + 1), 500);
    return () => clearTimeout(timer);
  }, [replayPlaying, frameIndex, frames.length, tab]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(next: Layout) {
    setError("");
    setHistory((h) => [...h.slice(-49), clone(layout)]);
    setFuture([]);
    setLayout({ ...next, revision: layout.revision + 1 });
    setNotice("Unsaved alternative");
  }
  function updateVenue(patch: Partial<Venue>) {
    if (!editable || !venue) return;
    const n = clone(layout);
    Object.assign(
      n.venues.find((v) => v.id === venue.id)!,
      patch,
    );
    edit(n);
  }
  function makeAlternative() {
    setHistory([]);
    setFuture([]);
    setLayout({
      ...clone(BASELINE),
      id: `draft-${Date.now()}`,
      revision: 1,
      name: "Alternative 01",
    });
    setError("");
    setSelected("snack-kiosk");
    setGuest(null);
    setNotice(
      "Alternative created. Drag a highlighted object or its label to move it.",
    );
    setTab("plan");
  }
  function move(id: string, point: Point) {
    if (!editable || tab !== "plan") return;
    const venue = layout.venues.find((v) => v.id === id);
    if (!venue?.movable) return;
    const result = placeVenue(layout, venue, point);
    if (result.errors.length) {
      setNotice("");
      setError(
        `Move cancelled. ${result.errors[0]}. The object stayed in its previous position.`,
      );
      return;
    }
    setError("");
    edit({
      ...clone(layout),
      venues: layout.venues.map((v) => (v.id === id ? result.venue : v)),
    });
    setNotice(`${venue.name} moved. Undo is available; save when ready.`);
  }
  function repairPlacement() {
    const result = repairObjectPositions(layout);
    if (!result) {
      setError(
        "There is not enough connected clear space to reposition every object. Remove an object or reopen a path, then try again.",
      );
      return;
    }
    setError("");
    if (result.moved) edit(result.layout);
    setNotice(
      result.moved
        ? `Repositioned ${result.moved} objects in nearby clear spaces. Business settings and paths are preserved. You can Undo this change.`
        : "Object positions are already clear. Check the remaining operating assumptions.",
    );
  }
  function editPaths(next: Layout) {
    const existing = new Set(validateLayout(layout));
    const introduced = validateLayout(next).filter((e) => !existing.has(e));
    if (introduced.length) {
      setNotice("");
      setError(
        `Path change cancelled. ${introduced[0]}. Move the affected object or keep another accessible route open first.`,
      );
      return;
    }
    setError("");
    edit(next);
  }
  function add(category: Venue["category"]) {
    if (!editable || tab !== "plan") return;
    const n = clone(layout);
    const id = `object-${crypto.randomUUID()}`;
    const v: Venue = {
      id,
      name:
        category === "cafe"
          ? "New food kiosk"
          : category === "seating"
            ? "New seating"
            : "Pop-up performance",
      category,
      floor,
      x: 83,
      y: 155,
      w: 6,
      h: 6,
      nodeId: `f${floor}-5`,
      movable: true,
      zone: "Proposed",
      capacity: 12,
      dwellMin: 5,
      dwellMax: 15,
      spendMin: 0,
      spendMax: 0,
      purchaseProbability: 0,
      open: config.start,
      close: config.end,
      areaM2: 8,
      signage: 1,
      eventStarts: [],
      source: "Management proposal",
      ...categoryDefaults(category),
    };
    const placed = findVenuePosition(n, v);
    if (!placed) {
      setNotice("");
      setError(
        `No clear, accessible space is available on Level ${floor}. Nothing was added. Try another floor or remove an object.`,
      );
      return;
    }
    n.venues.push(placed);
    setError("");
    setBothFloors(false);
    setGuest(null);
    edit(n);
    setSelected(id);
    setNotice(
      `${placed.name} added in a clear space. Drag its label or the object to reposition it.`,
    );
  }
  function changeWindow(key: "start" | "end", value: number) {
    const c = { ...config, [key]: value };
    const count = Math.max(1, Math.ceil((c.end - c.start) / 60));
    c.hourly = Array.from({ length: count }, (_, i) => config.hourly[i] ?? 3);
    setConfig(c);
  }
  async function start() {
    if (errors.length) throw Error(errors[0]);
    const r = await api("/runs", { layout, config });
    setRunId(r.id);
    setRun(null);
    setFrameIndex(-1);
    setFrames([]);
    setTab("simulate");
    setNotice(
      "Simulation started. Visitors arrive throughout the operating window.",
    );
  }
  async function openRun(id: string) {
    const snapshot: Snapshot = await api(`/runs/${id}`);
    setRun(snapshot);
    setRunId(id);
    setConfig(clone(snapshot.config));
    loadPlanningLayout(snapshot.layout);
    setHistory([]);
    setFuture([]);
    setFrames([]);
    setFrameIndex(-1);
    setReplayPlaying(false);
    setGuest(null);
    setTab("simulate");
  }
  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const liveAgent = run?.agents.find((a) => a.id === guest);
  const recordedAgent = frame?.agents.find((a) => a.id === guest);
  const agent = frame
    ? liveAgent && recordedAgent?.remaining !== undefined
      ? { ...liveAgent, ...recordedAgent, history: recordedAgent.history ?? [] }
      : undefined
    : liveAgent;
  const st = selected ? (frame?.venues ?? run?.venues)?.[selected] : null;
  const recordedIds = frame ? new Set(frame.agents.map((a) => a.id)) : null;
  const guestList =
    run?.agents.filter(
      (a) =>
        (recordedIds ? recordedIds.has(a.id) : a.state !== "pending") &&
        `${a.id} ${a.purpose}`
          .toLowerCase()
          .includes(guestSearch.toLowerCase()),
    ) ?? [];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-icon">≋</span>
          <div>
            emergent
            <small>PLACE INTELLIGENCE</small>
          </div>
        </div>
        <div className="place">
          <span>WORKSPACE</span>
          <strong>
            PIER 39 <i>San Francisco</i>
          </strong>
        </div>
        <div className="connection">
          <b className={health?.ready ? "dot on" : "dot"} />
          {health?.ready ? "Engine connected" : "Connecting to engine"}
          <span>LOCAL WORKSPACE</span>
        </div>
      </header>
      <div className="page-title">
        <div>
          <p className="eyebrow">A BETTER DAY ON THE PIER</p>
          <h1>Make every space count.</h1>
          <p>Explore how a change to the pier changes the visit.</p>
        </div>
        <div className="title-actions">
          <button
            onClick={() =>
              void act(async () => {
                await refresh();
                setNotice("Workspace refreshed");
              })
            }
          >
            ↻ Refresh
          </button>
          <button
            className="primary"
            disabled={
              busy || !!errors.length || !health?.providers?.[config.provider]
            }
            onClick={() => void act(start)}
          >
            ▶ Run simulation
          </button>
        </div>
      </div>
      <nav className="tabs">
        {[
          ["plan", "01", "Plan the pier"],
          ["simulate", "02", "Explore a day"],
          ["compare", "03", "Compare alternatives"],
        ].map(([id, n, name]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              if (
                id === "compare" &&
                tab === "simulate" &&
                comparison &&
                comparison.pairs.some((p) => p.a === runId || p.b === runId)
              ) {
                loadPlanningLayout(comparison.variant);
                setConfig(clone(comparison.config));
                setHistory([]);
                setFuture([]);
              }
              setTab(id);
            }}
          >
            <span>{n}</span>
            {name}
          </button>
        ))}
        <div className="assumption-tag">
          ◌ Scenario estimates · Editable assumptions
        </div>
      </nav>
      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={`message ${error ? "error" : ""}`}
        >
          {error || notice}
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <main className={tab === "compare" ? "comparison-workspace" : undefined}>
        <aside className="left-panel">
          <div className="panel-label">
            {tab === "plan" ? "LAYOUT WORKSPACE" : "SIMULATION SETTINGS"}
          </div>
          <label>
            Layout
            <select
              value={layout.id}
              onChange={(e) => {
                const l =
                  e.target.value === BASELINE.id
                    ? BASELINE
                    : saved.find((l) => l.id === e.target.value);
                if (l) {
                  loadPlanningLayout(l);
                  setHistory([]);
                  setFuture([]);
                }
              }}
            >
              <option value={BASELINE.id}>Current PIER 39 · baseline</option>
              {!saved.some((l) => l.id === layout.id) && editable && (
                <option value={layout.id}>{layout.name} · draft</option>
              )}
              {saved
                .filter((l) => l.id !== BASELINE.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · v{l.revision}
                  </option>
                ))}
            </select>
          </label>
          {editable ? (
            <>
              <label>
                Alternative name
                <input
                  value={layout.name}
                  onChange={(e) =>
                    setLayout({ ...layout, name: e.target.value })
                  }
                />
              </label>
              <div className="button-row">
                <button
                  disabled={!history.length}
                  onClick={() => {
                    setError("");
                    setNotice("Undid the last layout change.");
                    setFuture((f) => [clone(layout), ...f]);
                    setLayout(history.at(-1)!);
                    setHistory((h) => h.slice(0, -1));
                  }}
                >
                  ↶ Undo
                </button>
                <button
                  disabled={!future.length}
                  onClick={() => {
                    setError("");
                    setNotice("Restored the layout change.");
                    setHistory((h) => [...h, clone(layout)]);
                    setLayout(future[0]);
                    setFuture((f) => f.slice(1));
                  }}
                >
                  ↷ Redo
                </button>
              </div>
              <div className="button-row">
                <button
                  disabled={!!errors.length || busy}
                  onClick={() =>
                    void act(async () => {
                      const l = await api("/layouts", layout);
                      setLayout(l);
                      await refresh();
                      setNotice("Alternative saved to the local database.");
                    })
                  }
                >
                  Save version
                </button>
                <button
                  onClick={() =>
                    edit({
                      ...clone(BASELINE),
                      id: layout.id,
                      name: layout.name,
                    })
                  }
                >
                  Reset
                </button>
              </div>
            </>
          ) : (
            <button className="wide outline" onClick={makeAlternative}>
              ＋ Create alternative
            </button>
          )}
          <details className="scenario-picker">
            <summary>Management questions</summary>
            <label>
              Scenario template
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
              >
                {SCENARIOS.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p>{SCENARIOS.find((s) => s.id === scenarioId)?.question}</p>
            <button
              className="wide"
              onClick={() => {
                const draft = scenario(scenarioId, config);
                setHistory([]);
                setFuture([]);
                setLayout(draft.layout);
                setConfig(draft.config);
                setSelected(draft.focus);
                setTab("plan");
                setError("");
                setNotice(
                  "New scenario alternative created. Review its assumptions, save a version, then compare.",
                );
              }}
            >
              Create scenario alternative
            </button>
          </details>
          {layout.scenario && (
            <p className="scenario-question">{layout.scenario.question}</p>
          )}
          <details>
            <summary>
              Parking supply ·{" "}
              {(layout.parking?.spaces ?? 976).toLocaleString()} spaces
            </summary>
            <p className="hint">
              The published garage has 976 spaces. Alternatives change
              hypothetical supply outside the pier footprint.
            </p>
            <fieldset disabled={!editable}>
              <label>
                Available parking spaces
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={layout.parking?.spaces ?? 976}
                  onChange={(e) =>
                    edit({
                      ...layout,
                      parking: {
                        enabled: layout.parking?.enabled ?? true,
                        spaces: +e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={layout.parking?.enabled ?? true}
                  onChange={(e) =>
                    edit({
                      ...layout,
                      parking: {
                        spaces: layout.parking?.spaces ?? 976,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                Apply finite parking capacity
              </label>
            </fieldset>
            <p className="hint">
              One space per car group; released after its visit plus a time
              buffer. A full garage turns that group away. No street traffic,
              overflow search, fees or construction feasibility are modeled.
            </p>
          </details>
          {tab === "plan" && (
            <>
              <div className="divider" />
              <div className="panel-label">DESIGN TOOLS</div>
              <div className="tools">
                {(["cafe", "seating", "event"] as const).map((c) => (
                  <button disabled={!editable} key={c} onClick={() => add(c)}>
                    <span>
                      {c === "cafe" ? "▣" : c === "seating" ? "≡" : "☷"}
                    </span>
                    {c === "cafe"
                      ? "Kiosk"
                      : c === "seating"
                        ? "Seating"
                        : "Event"}
                  </button>
                ))}
              </div>
              <button
                className={`wide ${paths ? "active-tool" : ""}`}
                disabled={!editable}
                onClick={() => setPaths(!paths)}
              >
                ⌁ {paths ? "Finish path editing" : "Edit pedestrian paths"}
              </button>
              {paths && (
                <div>
                  <label>
                    Path segment
                    <select
                      value={pathId}
                      onChange={(e) => setPathId(e.target.value)}
                    >
                      {layout.edges
                        .filter((e) => !e.structural)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.id} · {e.enabled ? "open" : "closed"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Width · meters
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={
                        layout.edges.find((e) => e.id === pathId)?.width ?? 3
                      }
                      onChange={(e) => {
                        const n = clone(layout);
                        n.edges.find((p) => p.id === pathId)!.width =
                          +e.target.value;
                        editPaths(n);
                      }}
                    />
                  </label>
                  <button
                    className="wide"
                    onClick={() => {
                      const n = clone(layout);
                      const e = n.edges.find((e) => e.id === pathId)!;
                      e.enabled = !e.enabled;
                      editPaths(n);
                    }}
                  >
                    Toggle selected path
                  </button>
                </div>
              )}
              <p className="hint">
                Drag movable objects. Buildings and floor connections stay
                fixed.
              </p>
            </>
          )}
          <div className="divider" />
          <div className="panel-label">THE DAY YOU’RE MODELING</div>
          <label>
            Decision model
            <select
              value={config.provider}
              onChange={(e) =>
                setConfig({
                  ...config,
                  provider: e.target.value as Config["provider"],
                })
              }
            >
              <option value="local">Local AI · Laya</option>
              <option value="rules">Rules · test mode</option>
              <option value="jev" disabled={!health?.providers?.jev}>
                Jev · optional
              </option>
            </select>
          </label>
          <p className="hint">
            {config.provider === "local"
              ? health?.providers?.local
                ? "● Local model ready · no API charges"
                : "◌ Local model starting or unavailable."
              : config.provider === "rules"
                ? "Deterministic rules. Results reflect authored assumptions."
                : "Uses configured Jev credentials."}
          </p>
          <div className="field-row">
            <label>
              Attempted visitors
              <input
                type="number"
                min={1}
                max={40000}
                value={config.visitors}
                onChange={(e) =>
                  setConfig({ ...config, visitors: +e.target.value })
                }
              />
            </label>
            <label>
              Day profile
              <select
                value={config.day}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    day: e.target.value as Config["day"],
                    hourly: Array.from(
                      { length: config.hourly.length },
                      (_, i) =>
                        (e.target.value === "weekend"
                          ? [3, 6, 11, 14, 15, 14, 12, 10, 8, 5, 2]
                          : [4, 7, 13, 17, 12, 9, 8, 10, 11, 6, 3])[i] ?? 3,
                    ),
                  })
                }
              >
                <option value="weekend">Weekend</option>
                <option value="weekday">Weekday</option>
              </select>
            </label>
          </div>
          <div className="population-presets">
            <button onClick={() => setConfig({ ...config, visitors: 5000 })}>
              5,000 · working demo
            </button>
            <button onClick={() => setConfig({ ...config, visitors: 30000 })}>
              30,000 · demand stress
            </button>
          </div>
          <details>
            <summary>Population scale & arrival access</summary>
            <p className="hint">
              Every visitor is modeled in a group. Dollars are never multiplied
              from a smaller sample. The 5,000-person default is a working
              scenario, not a claim about daily attendance.
            </p>
            <p className="hint">
              <a
                href="https://www.pier39.com/leasing/"
                target="_blank"
                rel="noreferrer"
              >
                PIER 39 reports about 11 million visitors in 2023 ↗
              </a>
              . Dividing by 365 gives roughly 30,000/day, but that arithmetic is
              not measured demand for this 11-hour window, season or day type.
            </p>
            <label>
              Car groups · {Math.round((config.carShare ?? 0.35) * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.carShare ?? 0.35}
                onChange={(e) =>
                  setConfig({ ...config, carShare: +e.target.value })
                }
              />
            </label>
            <label>
              Vehicles already parked at opening
              <input
                type="number"
                min={0}
                max={5000}
                value={config.initialParkedVehicles ?? 300}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    initialParkedVehicles: +e.target.value,
                  })
                }
              />
            </label>
            <label>
              Parking time after pier visit · min
              <input
                type="number"
                min={0}
                max={240}
                value={config.parkingBufferMinutes ?? 30}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    parkingBufferMinutes: +e.target.value,
                  })
                }
              />
            </label>
            <p className="hint">
              Mode share and starting occupancy are assumptions shared by both
              runs. Initial cars leave over an assumed 30–180 minutes. All
              modeled car groups seek this garage.
            </p>
          </details>
          <div className="field-row">
            <label>
              From
              <TimeInput
                value={config.start}
                onChange={(v) => changeWindow("start", v)}
              />
            </label>
            <label>
              Until
              <TimeInput
                value={config.end}
                onChange={(v) => changeWindow("end", v)}
              />
            </label>
          </div>
          <details>
            <summary>Hourly arrivals & run settings</summary>
            <p className="hint">
              Relative arrival weights; normalized to the visitor count.
            </p>
            <div className="hour-inputs">
              {config.hourly.map((n, i) => (
                <label key={i}>
                  {clock(config.start + i * 60)}
                  <input
                    type="number"
                    min={0}
                    value={n}
                    onChange={(e) => {
                      const h = [...config.hourly];
                      h[i] = +e.target.value;
                      setConfig({ ...config, hourly: h });
                    }}
                  />
                </label>
              ))}
            </div>
            <label>
              Random seed
              <input
                value={config.seed}
                onChange={(e) => setConfig({ ...config, seed: e.target.value })}
              />
            </label>
            <label>
              Requested speed
              <select
                value={config.speed}
                onChange={(e) =>
                  setConfig({ ...config, speed: +e.target.value })
                }
              >
                <option value={60}>60×</option>
                <option value={600}>600×</option>
                <option value={100000}>As fast as possible</option>
              </select>
            </label>
          </details>
          <div className="divider" />
          <details>
            <summary>Saved runs ({past.length})</summary>
            {[...past]
              .sort(
                (a, b) =>
                  Number(b.id === demoManifest.runId) -
                  Number(a.id === demoManifest.runId),
              )
              .map((r) => (
                <button
                  className="saved-run"
                  key={r.id}
                  onClick={() => void act(() => openRun(r.id))}
                >
                  {r.id === demoManifest.runId
                    ? "Recorded demo · PIER 39"
                    : r.name}
                  <small>
                    {r.provider} · {r.status} · {money(r.metrics?.sales ?? 0)} ·{" "}
                    {r.id.slice(-6)}
                  </small>
                </button>
              ))}
          </details>
          <a
            className="source"
            href={BASELINE.sources[0].url}
            target="_blank"
            rel="noreferrer"
          >
            Official PIER 39 directory ↗
          </a>
          <p className="hint">
            Schematic geography. Venue capacities, demand and sales assumptions
            are editable estimates.
          </p>
        </aside>
        <section className="workspace">
          {tab === "compare" ? (
            <div className="comparison">
              <p className="eyebrow">TEST THE CHANGE, KEEP THE CROWD</p>
              <h2>Would your alternative work better?</h2>
              <p>
                Compare the current pier with <b>{layout.name}</b>. Each pair
                receives identical visitor profiles, budgets and arrival
                schedules.
              </p>
              <div className="comparison-cards">
                <div>
                  <span>A · BASELINE</span>
                  <h3>Current PIER 39</h3>
                  <p>{BASELINE.venues.length} modeled destinations</p>
                </div>
                <div>
                  <span>B · ALTERNATIVE</span>
                  <h3>{layout.name}</h3>
                  <p>
                    {layout.venues.length} modeled destinations · revision{" "}
                    {layout.revision}
                  </p>
                </div>
              </div>
              <div className="button-row">
                <select
                  aria-label="Comparison pairs"
                  value={pairs}
                  onChange={(e) => setPairs(+e.target.value)}
                >
                  <option value={1}>One pair · illustrative</option>
                  <option value={3}>Three pairs · show variation</option>
                </select>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !health?.providers?.[config.provider] ||
                    comparison?.status === "running"
                  }
                  onClick={() =>
                    void act(async () => {
                      if (errors.length) throw Error(errors[0]);
                      const c = await api("/comparisons", {
                        baseline: BASELINE,
                        variant: layout,
                        config,
                        pairs,
                      });
                      setComparison(c);
                    })
                  }
                >
                  Run comparison
                </button>
              </div>
              <label>
                Saved comparisons
                <select
                  aria-label="Saved comparisons"
                  value={comparison?.id ?? ""}
                  onFocus={() => void api("/comparisons").then(setReports)}
                  onChange={(e) => {
                    const report = reports.find((r) => r.id === e.target.value);
                    if (report) {
                      setComparison(report);
                      loadPlanningLayout(report.variant);
                      setConfig(clone(report.config));
                      setPairs(report.pairs.length);
                      setHistory([]);
                      setFuture([]);
                      setNotice(
                        "Loaded the recorded experiment and its settings.",
                      );
                    }
                  }}
                >
                  <option value="">Select a recorded comparison</option>
                  {[
                    ...reports,
                    ...(comparison &&
                    !reports.some((r) => r.id === comparison.id)
                      ? [comparison]
                      : []),
                  ].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.variant.name} · {c.pairs.length} pair(s) · {c.status}
                    </option>
                  ))}
                </select>
              </label>
              {comparison && (
                <>
                  <ComparisonResults
                    comparison={comparison}
                    inspect={(id) => void act(() => openRun(id))}
                  />
                  <button
                    onClick={() =>
                      download(comparison, "pier39-comparison.json")
                    }
                  >
                    Export comparison
                  </button>
                </>
              )}
              <div className="assumptions">
                <b>How to read these results</b>
                <p>
                  Visitor spending is business sales, not management income.
                  These runs test stated behavioral and operating assumptions.
                  Failed pairs stay visible and are excluded from completed-pair
                  summaries.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="map-toolbar">
                <div className="floor-toggle" aria-label="Pier levels">
                  <button
                    className={bothFloors ? "selected" : ""}
                    aria-pressed={bothFloors}
                    onClick={() => setBothFloors(true)}
                  >
                    Both levels<small>Whole pier</small>
                  </button>
                  {([1, 2] as Floor[]).map((f) => (
                    <button
                      key={f}
                      className={!bothFloors && floor === f ? "selected" : ""}
                      aria-pressed={!bothFloors && floor === f}
                      onClick={() => {
                        setFloor(f);
                        setBothFloors(false);
                      }}
                    >
                      Level {f}
                      <small>{f === 1 ? "Boardwalk" : "Upper terraces"}</small>
                    </button>
                  ))}
                </div>
                <span>
                  {tab === "plan"
                    ? editable
                      ? "Alternative · editable"
                      : "Current layout · read only"
                    : run
                      ? `${clock(frame?.time ?? run.time)} · ${run.status}`
                      : "Start a simulation to explore a day"}
                </span>
                <select
                  aria-label="Map overlay"
                  value={heat}
                  onChange={(e) => setHeat(e.target.value)}
                >
                  <option value="none">Place view</option>
                  <option value="landuse">Land use</option>
                  <option value="footfall">Footfall</option>
                  <option value="spending">Spending</option>
                  <option value="occupancy">Occupancy</option>
                </select>
              </div>
              <div
                className={`editing-guide ${tab === "plan" && editable ? "editing-active" : ""}`}
              >
                {tab !== "plan" ? (
                  <>
                    <span>
                      <strong>Simulation view · layout locked</strong> Open the
                      editor to move objects; recordings keep their original
                      layout.
                    </span>
                    <button onClick={() => setTab("plan")}>
                      Open layout editor
                    </button>
                  </>
                ) : !editable ? (
                  <>
                    <span>
                      <strong>Current pier · read only</strong> Create an
                      alternative to add and move kiosks, seating and event
                      areas.
                    </span>
                    <button onClick={makeAlternative}>
                      Create editable alternative
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      <strong>Layout editor</strong> Drag a highlighted object
                      or its label. Green = clear; red = blocked. Buildings stay
                      fixed.
                    </span>
                    <select
                      aria-label="Select movable object"
                      value={venue?.movable ? venue.id : ""}
                      onChange={(e) => {
                        const v = layout.venues.find(
                          (v) => v.id === e.target.value,
                        );
                        if (v) {
                          setSelected(v.id);
                          setFloor(v.floor);
                          setBothFloors(false);
                          setGuest(null);
                        }
                      }}
                    >
                      <option value="">Find a movable object…</option>
                      {layout.venues
                        .filter((v) => v.movable)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} · L{v.floor}
                          </option>
                        ))}
                    </select>
                  </>
                )}
              </div>
              <PierMap
                layout={viewLayout}
                floor={floor}
                both={bothFloors}
                onFloor={(f) => {
                  setFloor(f);
                  setBothFloors(false);
                }}
                selected={selected}
                run={tab === "simulate" ? run : null}
                frame={tab === "simulate" ? frame : null}
                heat={heat}
                editable={tab === "plan" && editable}
                paths={paths && tab === "plan"}
                onSelect={(id) => {
                  setSelected(id);
                  setFloor(
                    viewLayout.venues.find((v) => v.id === id)?.floor ?? floor,
                  );
                  setGuest(null);
                }}
                onMove={move}
                onPath={(id) => {
                  const n = clone(layout);
                  n.edges.find((e) => e.id === id)!.enabled = !n.edges.find(
                    (e) => e.id === id,
                  )!.enabled;
                  editPaths(n);
                }}
                onGuest={(id) => setGuest(id)}
              />
              <div className="legend">
                {CATEGORIES.map((c) => (
                  <span key={c}>
                    <i style={{ background: `#${COLORS[c].toString(16)}` }} />
                    {LABELS[c]}
                  </span>
                ))}
              </div>
              {tab === "simulate" && run && (
                <div className="playback">
                  <div>
                    <button
                      onClick={() =>
                        void act(async () => {
                          await api(`/runs/${run.id}`, {
                            action:
                              run.status === "paused" ? "resume" : "pause",
                          });
                        })
                      }
                      disabled={!["running", "paused"].includes(run.status)}
                    >
                      {run.status === "paused" ? "▶ Resume" : "Ⅱ Pause"}
                    </button>
                    <strong>{clock(frame?.time ?? run.time)}</strong>
                    <span>
                      {number(run.achievedSpeed)}× achieved · {run.model}
                    </span>
                    <button
                      onClick={() =>
                        void act(async () => {
                          const r = await api(`/runs/${run.id}/replay`);
                          setFrames(r.frames);
                          setFrameIndex(0);
                          setReplayPlaying(false);
                        })
                      }
                    >
                      Replay
                    </button>
                    {frames.length > 0 && (
                      <button onClick={() => setReplayPlaying(!replayPlaying)}>
                        {replayPlaying ? "Pause recording" : "Play recording"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setReplayPlaying(false);
                        setFrameIndex(-1);
                        setFrames([]);
                      }}
                    >
                      Live
                    </button>
                    <button
                      onClick={() =>
                        void act(async () =>
                          download(
                            await api(`/runs/${run.id}/replay`),
                            "pier39-run.json",
                          ),
                        )
                      }
                    >
                      Export
                    </button>
                  </div>
                  {frames.length > 0 && (
                    <input
                      aria-label="Replay timeline"
                      type="range"
                      min={0}
                      max={frames.length - 1}
                      value={Math.max(0, frameIndex)}
                      onChange={(e) => {
                        setReplayPlaying(false);
                        setFrameIndex(+e.target.value);
                      }}
                    />
                  )}
                  <small>
                    {frame
                      ? "Recorded simulation frame"
                      : "Actual engine state"}{" "}
                    · {run.layout.name} · {run.config.provider} ·{" "}
                    {run.config.visitors.toLocaleString()} attempted visitors
                    {run.error && ` · ${run.error}`}
                  </small>
                </div>
              )}
            </>
          )}
        </section>
        <aside className="right-panel">
          {tab === "simulate" && metrics ? (
            <>
              <div className="panel-label">
                {frame ? "RECORDED OUTCOMES" : "DAY AT A GLANCE"}
              </div>
              <div className="hero-metric">
                <span>Visitor spending</span>
                <strong>{money(metrics.sales)}</strong>
                <small>Business sales · simulated</small>
              </div>
              <div className="metric-grid">
                <div>
                  <b>{money(metrics.spendPerVisitor)}</b>
                  <span>per arrived visitor</span>
                </div>
                <div>
                  <b>{Math.round(metrics.conversion * 100)}%</b>
                  <span>purchase conversion</span>
                </div>
                <div>
                  <b>{number(metrics.arrived)}</b>
                  <span>arrived</span>
                </div>
                <div>
                  <b>{Math.round(metrics.averageVisit)}m</b>
                  <span>completed visit</span>
                </div>
                <div>
                  <b>{metrics.zeroSpendDepartures}</b>
                  <span>left without buying</span>
                </div>
                <div>
                  <b>{money(metrics.salesPerM2)}</b>
                  <span>per modeled m²</span>
                </div>
              </div>
              {metrics.attempted !== undefined && (
                <details open>
                  <summary>Access, meals & waiting</summary>
                  <div className="metric-grid">
                    <div>
                      <b>{number(metrics.attempted)}</b>
                      <span>attempted arrivals</span>
                    </div>
                    <div>
                      <b>{number(metrics.parkingRejected ?? 0)}</b>
                      <span>parking turnaways</span>
                    </div>
                    <div>
                      <b>{number(metrics.parkingPeak ?? 0)}</b>
                      <span>peak parked vehicles</span>
                    </div>
                    <div>
                      <b>{number(metrics.mealEpisodes ?? 0)}</b>
                      <span>meals served</span>
                    </div>
                    <div>
                      <b>{number(metrics.unmetDining ?? 0)}</b>
                      <span>meal-intent visitors left without a meal</span>
                    </div>
                    <div>
                      <b>{number(metrics.queueAbandonments ?? 0)}</b>
                      <span>queue abandonments</span>
                    </div>
                  </div>
                  <p className="hint">
                    At most one full meal per occasion and at least four hours
                    between meals. Snacks remain separate.
                  </p>
                </details>
              )}
              <details>
                <summary>Sales by category</summary>
                {Object.entries(metrics.categories).map(([k, v]) => (
                  <p key={k}>
                    {LABELS[k as keyof typeof LABELS]} <b>{money(v)}</b>
                  </p>
                ))}
              </details>
              <div className="mini-chart">
                <div className="panel-label">SPENDING BY HOUR</div>
                <div className="bars">
                  {metrics.hourly.map((h) => (
                    <div
                      key={h.hour}
                      title={`${clock(h.hour)}: ${money(h.sales)}, ${h.visits} arrivals`}
                    >
                      <i
                        style={{
                          height: `${Math.max(2, (70 * h.sales) / Math.max(1, ...metrics.hourly.map((x) => x.sales)))}px`,
                        }}
                      />
                      <span>{Math.floor(h.hour / 60)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="divider" />
            </>
          ) : null}
          {agent && tab === "simulate" ? (
            <>
              <div className="panel-label">VISITOR GROUP</div>
              <h2>{agent.purpose}</h2>
              <p>
                {agent.size} visitors · {agent.state} ·{" "}
                {agent.mode === "car" ? "car group" : "walk / transit"}
              </p>
              <div className="metric-grid">
                <div>
                  <b>{money(agent.remaining)}</b>
                  <span>remaining budget</span>
                </div>
                <div>
                  <b>{money(agent.spend)}</b>
                  <span>spent</span>
                </div>
              </div>
              <p className="hint">
                {agent.mealIntent
                  ? "Arrived with meal intent. "
                  : "Flexible meal plans. "}{" "}
                Decisions below describe recorded actions and context.
              </p>
              <div className="history">
                {agent.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <p key={i}>
                      <small>
                        {clock(h.at)} · {h.source}
                      </small>
                      {h.text}
                    </p>
                  ))}
              </div>
              <button onClick={() => setGuest(null)}>Back to venue</button>
            </>
          ) : venue ? (
            <>
              <div className="panel-label">
                {tab === "plan" ? "DESTINATION INSPECTOR" : "VENUE PERFORMANCE"}
              </div>
              <span className="venue-tag">
                {LABELS[venue.category]} · Level {venue.floor}
              </span>
              <h2>{venue.name}</h2>
              <p className="hint">
                {venue.zone} ·{" "}
                {venue.movable ? "Movable planning object" : "Fixed footprint"}
              </p>
              {tab === "simulate" && st ? (
                <>
                  <div className="metric-grid">
                    <div>
                      <b>{money(st.sales)}</b>
                      <span>sales</span>
                    </div>
                    <div>
                      <b>{st.visits}</b>
                      <span>visitor entries</span>
                    </div>
                    <div>
                      <b>
                        {st.occupancy}/{venue.capacity}
                      </b>
                      <span>occupancy</span>
                    </div>
                    <div>
                      <b>{st.queue}</b>
                      <span>waiting</span>
                    </div>
                    <div>
                      <b>
                        {st.visits
                          ? (st.dwellMinutes / st.visits).toFixed(1)
                          : "0"}
                        m
                      </b>
                      <span>mean time so far</span>
                    </div>
                    <div>
                      <b>{st.abandoned}</b>
                      <span>left queue</span>
                    </div>
                  </div>
                  <div className="divider" />
                </>
              ) : null}
              <fieldset disabled={!editable || tab !== "plan"}>
                <label>
                  Name
                  <input
                    value={venue.name}
                    onChange={(e) => updateVenue({ name: e.target.value })}
                  />
                </label>
                <label>
                  Business / space type
                  <select
                    value={venue.category}
                    onChange={(e) =>
                      updateVenue({
                        category: e.target.value as Venue["category"],
                        ...categoryDefaults(
                          e.target.value as Venue["category"],
                        ),
                      })
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option value={c} key={c}>
                        {LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row">
                  <label>
                    Capacity
                    <input
                      type="number"
                      min={1}
                      value={venue.capacity}
                      onChange={(e) =>
                        updateVenue({ capacity: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Area · m²
                    <input
                      type="number"
                      min={1}
                      value={venue.areaM2}
                      onChange={(e) => updateVenue({ areaM2: +e.target.value })}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Visit min · min
                    <input
                      type="number"
                      min={1}
                      value={venue.dwellMin}
                      onChange={(e) =>
                        updateVenue({ dwellMin: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Visit max · min
                    <input
                      type="number"
                      min={1}
                      value={venue.dwellMax}
                      onChange={(e) =>
                        updateVenue({ dwellMax: +e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Spend min · $/person
                    <input
                      type="number"
                      min={0}
                      value={venue.spendMin / 100}
                      onChange={(e) =>
                        updateVenue({
                          spendMin: Math.round(+e.target.value * 100),
                        })
                      }
                    />
                  </label>
                  <label>
                    Spend max · $/person
                    <input
                      type="number"
                      min={0}
                      value={venue.spendMax / 100}
                      onChange={(e) =>
                        updateVenue({
                          spendMax: Math.round(+e.target.value * 100),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Purchase probability ·{" "}
                  {Math.round(venue.purchaseProbability * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={venue.purchaseProbability}
                    onChange={(e) =>
                      updateVenue({ purchaseProbability: +e.target.value })
                    }
                  />
                </label>
                <div className="field-row">
                  <label>
                    Opens
                    <TimeInput
                      value={venue.open}
                      onChange={(v) => updateVenue({ open: v })}
                    />
                  </label>
                  <label>
                    Closes
                    <TimeInput
                      value={venue.close}
                      onChange={(v) => updateVenue({ close: v })}
                    />
                  </label>
                </div>
                <label>
                  Visibility · {venue.signage.toFixed(1)}×
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={venue.signage}
                    onChange={(e) => updateVenue({ signage: +e.target.value })}
                  />
                </label>
                {venue.category === "event" && (
                  <label>
                    Show times (HH:MM, separated by commas)
                    <ScheduleInput
                      value={venue.eventStarts}
                      onChange={(eventStarts) => updateVenue({ eventStarts })}
                    />
                  </label>
                )}
                {venue.movable && (
                  <p className="hint">
                    Position: x {venue.x}, y {venue.y} · Level {venue.floor}.
                    {tab === "plan" && editable
                      ? "Drag the object or its label to move it; coordinates are modeled meters."
                      : "Open the layout editor to move this object."}
                  </p>
                )}
                {venue.movable && (
                  <button
                    className="danger wide"
                    onClick={() => {
                      const n = clone(layout);
                      n.venues = n.venues.filter((v) => v.id !== venue.id);
                      edit(n);
                      setSelected(null);
                    }}
                  >
                    Remove object
                  </button>
                )}
              </fieldset>
              <p className="hint">
                Capacity, time and spending are assumptions. A venue visit is
                modeled in aggregate.
              </p>
            </>
          ) : (
            <>
              <div className="panel-label">EXPLORE THE PIER</div>
              <h2>Start with a destination.</h2>
              <p>
                Select a business, attraction or public space on the map to
                inspect its assumptions.
              </p>
            </>
          )}
          {errors.length > 0 && (
            <div className="validation">
              <b>Layout needs attention</b>
              {tab === "plan" && editable && (
                <button className="wide" onClick={repairPlacement}>
                  Find clear positions for objects
                </button>
              )}
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
          <details>
            <summary>Destination directory</summary>
            {viewLayout.venues.map((v) => (
              <button
                className="directory"
                key={v.id}
                onClick={() => {
                  setSelected(v.id);
                  setFloor(v.floor);
                  setBothFloors(false);
                  setGuest(null);
                }}
              >
                {v.name}
                <small>
                  L{v.floor} · {LABELS[v.category]}
                </small>
              </button>
            ))}
          </details>
          {tab === "simulate" && run && (
            <details>
              <summary>Visitor groups</summary>
              <label>
                Find visitor group
                <input
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Group ID or purpose"
                />
              </label>
              <p className="hint">
                Showing {Math.min(100, guestList.length)} of{" "}
                {guestList.length.toLocaleString()} matching groups. Select any
                visible group on the map.
              </p>
              {guestList.slice(0, 100).map((a) => (
                <button
                  className="directory"
                  key={a.id}
                  onClick={() => {
                    setGuest(a.id);
                    setFloor(
                      frame?.agents.find((r) => r.id === a.id)?.floor ??
                        a.position.floor,
                    );
                  }}
                >
                  {a.id}
                  <small>
                    {a.purpose} ·{" "}
                    {frame?.agents.find((r) => r.id === a.id)?.state ?? a.state}
                  </small>
                </button>
              ))}
            </details>
          )}
        </aside>
      </main>
      <footer>
        <span>EMERGENT / PIER 39</span>
        <span>Plan with curiosity. Compare with evidence.</span>
        <span>Source checked 08 NOV 2026</span>
      </footer>
    </div>
  );
}
