import {
  type Layout,
  type Config,
  type Agent,
  type Profile,
  type Snapshot,
  type VenueStats,
  type Venue,
  type ProviderPort,
  type DecisionInput,
  type Frame,
  type Metrics,
  clock,
} from "../../shared/contracts";
import {
  route,
  distance,
  clone,
  validateLayout,
  validateConfig,
} from "../../shared/layout";
import { population } from "./population";
import { random, weighted } from "./random";
const STEP = 0.25;
export class Simulation {
  snapshot: Snapshot;
  frames: Frame[] = [];
  cohort: Profile[];
  private started = performance.now();
  private frameAt = -Infinity;
  private routes = new Map<string, string[]>();
  private parkingHeld = new Map<string, number>();
  private agentIndex = new Map<string, Agent>();
  private occasion() {
    const t = this.snapshot.time;
    return t < 660 ? "breakfast" : t < 960 ? "lunch" : "dinner";
  }
  private canDine(a: Agent) {
    return (
      !(a.meals ?? []).some(
        (m) =>
          m.occasion === this.occasion() || this.snapshot.time - m.at < 240,
      ) && a.hunger >= 0.4
    );
  }
  private parkingEnabled() {
    return this.snapshot.layout.parking?.enabled ?? true;
  }
  private spaces() {
    return this.snapshot.layout.parking?.spaces ?? 976;
  }

  constructor(
    id: string,
    layout: Layout,
    config: Config,
    readonly policy: ProviderPort,
    cohort?: Profile[],
  ) {
    const errors = [...validateLayout(layout), ...validateConfig(config)];
    if (
      (layout.parking?.enabled ?? true) &&
      (config.initialParkedVehicles ?? 300) > (layout.parking?.spaces ?? 976)
    )
      errors.push(
        "Initial parked vehicles must not exceed the parking capacity in either layout.",
      );
    if (errors.length) throw Error(errors.join("; "));
    this.cohort = clone(cohort ?? population(config));
    const entry = layout.nodes.find((n) => n.id === "entry")!;
    const agents: Agent[] = this.cohort.map((a) => ({
      ...clone(a),
      admitted: false,
      meals: [],
      remaining: a.budget,
      state: "pending",
      nodeId: "entry",
      position: { x: entry.x, y: entry.y, floor: 1 },
      target: null,
      route: [],
      remainingDwell: 0,
      wait: 0,
      visited: [],
      spend: 0,
      entered: 0,
      left: null,
      decisions: 0,
      history: [],
      departing: false,
    }));
    this.agentIndex = new Map(agents.map((a) => [a.id, a]));
    this.snapshot = {
      behaviorVersion: "pier39.behavior.3",
      parking: { occupied: 0, peak: 0, admittedVehicles: 0, deniedVisitors: 0 },
      id,
      layout: clone(layout),
      config: clone(config),
      time: config.start,
      status: "running",
      agents,
      venues: Object.fromEntries(
        layout.venues.map((v) => [
          v.id,
          {
            visits: 0,
            buyers: 0,
            sales: 0,
            occupancy: 0,
            queue: 0,
            dwellMinutes: 0,
            waitMinutes: 0,
            completed: 0,
            abandoned: 0,
            occupancyMinutes: 0,
          } satisfies VenueStats,
        ]),
      ),
      sales: [],
      traffic: {},
      metrics: {} as Metrics,
      wallSeconds: 0,
      achievedSpeed: 0,
      decisions: 0,
      model: policy.name,
    };
    for (let i = 0; i < (config.initialParkedVehicles ?? 300); i++)
      this.parkingHeld.set(
        `initial-${i}`,
        config.start +
          30 +
          random(config.seed, "initial-parking", i.toString()) * 150,
      );
    this.snapshot.parking!.occupied = this.parkingEnabled()
      ? this.parkingHeld.size
      : 0;
    this.snapshot.parking!.peak = this.snapshot.parking!.occupied;
    this.refresh();
    this.frame();
  }
  private path(a: Agent, target: string) {
    const key = `${a.nodeId}|${target}|${a.accessible}`;
    if (!this.routes.has(key))
      this.routes.set(
        key,
        route(this.snapshot.layout, a.nodeId, target, a.accessible),
      );
    return [...this.routes.get(key)!];
  }
  private log(a: Agent, text: string, source = "Engine") {
    a.history.push({ at: this.snapshot.time, text, source });
    if (a.history.length > 8) a.history.shift();
  }
  private leave(a: Agent) {
    a.target = null;
    a.departing = true;
    a.route = this.path(a, "entry").slice(1);
    a.state = "walking";
    if (a.nodeId === "entry") {
      a.state = "departed";
      a.left = this.snapshot.time;
      this.log(a, "Left the pier.");
    }
  }
  private open(v: Venue) {
    const t = this.snapshot.time;
    return t >= v.open && t < v.close;
  }
  private options(a: Agent): DecisionInput {
    const s = this.snapshot,
      t = s.time;
    const meal = Math.max(
      Math.exp(-(((t - 780) / 55) ** 2)),
      Math.exp(-(((t - 1110) / 65) ** 2)),
    );
    const available = s.layout.venues.filter(
      (v) =>
        this.open(v) &&
        (v.category !== "restaurant" || this.canDine(a)) &&
        !a.visited.includes(v.id) &&
        v.capacity >= a.size &&
        (v.category === "shop" || a.remaining >= v.spendMin * a.size) &&
        (v.category !== "event" ||
          !v.eventStarts.length ||
          v.eventStarts.some(
            (start) => start >= t - v.dwellMin && start <= t + 20,
          )) &&
        this.path(a, v.nodeId).length &&
        t + v.dwellMin < Math.min(a.departure, v.close, s.config.end),
    );
    const scored = available
      .map((v) => {
        const st = s.venues[v.id],
          d = distance(
            a.position,
            s.layout.nodes.find((n) => n.id === v.nodeId)!,
          );
        const food = v.category === "restaurant" || v.category === "cafe";
        const need = food
          ? 0.25 + a.hunger * 2 + meal * (a.mealIntent ? 2.0 : 1.0)
          : v.category === "seating"
            ? 0.2 + a.fatigue * 3
            : 1;
        const weight =
          ((v.id === a.priorityStop ? 4 : 1) *
            a.interests[v.category] *
            need *
            Math.max(0.1, v.signage) *
            Math.exp(-d / (140 + 80 * a.familiarity))) /
          (1 + st.queue / Math.max(1, v.capacity));
        return { v, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);
    const options = scored.map(({ v, weight }) => ({
      id: v.id,
      weight: Math.max(0.01, weight),
      label: `${v.name}: ${v.category}, approximately ${Math.round(
        distance(
          a.position,
          s.layout.nodes.find((n) => n.id === v.nodeId)!,
        ),
      )} modeled meters away, ${v.dwellMin}-${v.dwellMax} min, $${Math.round((v.spendMin * a.size) / 100)}-$${Math.round((v.spendMax * a.size) / 100)} group spend, ${s.venues[v.id].queue} waiting, level ${v.floor}`,
    }));
    options.push({
      id: "exit",
      weight: !options.length ? 1 : a.visited.length > 3 ? 0.35 : 0.04,
      label: "Leave PIER 39 now",
    });
    return {
      agentId: a.id,
      state: `Time ${clock(t)}. ${a.purpose}; ${a.size} people. Budget $${Math.round(a.remaining / 100)}. ${Math.round(a.departure - t)} minutes left. Hunger ${Math.round(a.hunger * 100)}/100; fatigue ${Math.round(a.fatigue * 100)}/100. Interests ${Object.entries(
        a.interests,
      )
        .map(([k, v]) => `${k}:${v.toFixed(1)}`)
        .join(
          ", ",
        )}. ${a.visited.length} venues visited. Full meals already taken: ${(a.meals ?? []).map((m) => m.occasion).join(", ") || "none"}. Meal intent: ${a.mealIntent ? "yes" : "optional"}. Priority stop: ${a.priorityStop ? (s.layout.venues.find((v) => v.id === a.priorityStop)?.name ?? a.priorityStop) : "flexible"}. Current level ${a.position.floor}. Familiarity with the pier ${Math.round(a.familiarity * 100)}/100.`,
      options,
    };
  }
  private admit(a: Agent, v: Venue) {
    const s = this.snapshot,
      st = s.venues[v.id];
    if (
      s.time + v.dwellMin > Math.min(a.departure, v.close, s.config.end) ||
      (v.category === "restaurant" && !this.canDine(a))
    ) {
      a.state = "choosing";
      a.target = null;
      a.visited.push(v.id);
      this.log(
        a,
        `Not enough time or no meal need for ${v.name}; choosing again.`,
      );
      return;
    }
    if (
      v.category === "event" &&
      v.eventStarts.length &&
      !v.eventStarts.some((t) => t + v.dwellMin >= s.time && t <= s.time + 20)
    ) {
      a.state = "choosing";
      a.target = null;
      return;
    }
    a.state = "visiting";
    a.visited.push(v.id);
    st.visits += a.size;
    st.occupancy += a.size;
    const r = (k: string) => random(s.config.seed, a.id, v.id, k);
    let dwell = v.dwellMin + r("dwell") * (v.dwellMax - v.dwellMin);
    if (v.category === "event" && v.eventStarts.length) {
      const start = v.eventStarts.find((t) => t + v.dwellMax > s.time);
      if (start === undefined) {
        a.state = "choosing";
        st.occupancy -= a.size;
        return;
      }
      dwell += Math.max(0, start - s.time);
    }
    a.remainingDwell = Math.min(
      dwell,
      a.departure - s.time,
      v.close - s.time,
      s.config.end - s.time,
    );
    a.entered = s.time;
    // Purchases happen once on admission; prices are cents and a group shares a finite wallet.
    const willBuy =
      a.remaining >= v.spendMin * a.size &&
      r("purchase") < v.purchaseProbability;
    const cents = willBuy
      ? Math.min(
          a.remaining,
          Math.round(v.spendMin + r("spend") * (v.spendMax - v.spendMin)) *
            a.size,
        )
      : 0;
    a.ateOnVisit =
      willBuy && (v.category === "restaurant" || v.category === "cafe");
    if (v.category === "restaurant" && willBuy)
      (a.meals ??= []).push({
        at: s.time,
        occasion: this.occasion(),
        venueId: v.id,
      });
    if (cents > 0) {
      a.remaining -= cents;
      a.spend += cents;
      st.sales += cents;
      st.buyers += a.size;
      s.sales.push({
        at: s.time,
        venueId: v.id,
        groupId: a.id,
        people: a.size,
        cents,
        category: v.category,
      });
    }
    this.log(
      a,
      `Entered ${v.name}; ${Math.ceil(a.remainingDwell)} min planned${cents ? `, $${(cents / 100).toFixed(2)} spent` : `, no purchase`}.`,
    );
  }
  async step() {
    const s = this.snapshot;
    if (s.status !== "running") return;
    try {
      for (const [id, until] of this.parkingHeld)
        if (until <= s.time) this.parkingHeld.delete(id);
      const walkingByNode = new Map<string, number>();
      for (const a of s.agents)
        if (a.state === "walking")
          walkingByNode.set(
            a.nodeId,
            (walkingByNode.get(a.nodeId) ?? 0) + a.size,
          );
      for (const a of s.agents) {
        if (a.state === "departed") continue;
        if (a.state === "pending") {
          if (s.time < a.arrival) continue;
          if (a.mode === "car" && this.parkingEnabled()) {
            if (this.parkingHeld.size >= this.spaces()) {
              a.state = "departed";
              a.left = s.time;
              a.admitted = false;
              s.parking!.deniedVisitors += a.size;
              this.log(
                a,
                "No modeled parking space available; group did not enter the pier. No overflow search is modeled.",
              );
              continue;
            }
            this.parkingHeld.set(a.id, Infinity);
            s.parking!.admittedVehicles++;
          }
          a.admitted = true;
          a.state = "choosing";
          this.log(a, "Arrived at the entrance plaza.");
        }
        a.hunger = Math.min(1, a.hunger + STEP / 210);
        a.fatigue = Math.min(1, a.fatigue + STEP / 800);
        if (a.state === "visiting") {
          const v = s.layout.venues.find((v) => v.id === a.target)!,
            st = s.venues[v.id];
          const used = Math.min(STEP, Math.max(0, a.remainingDwell));
          a.remainingDwell -= used;
          st.dwellMinutes += used * a.size;
          st.occupancyMinutes += used * a.size;
          if (a.remainingDwell <= 0 || !this.open(v) || s.time >= a.departure) {
            st.occupancy -= a.size;
            st.completed += a.size;
            if (
              a.ateOnVisit &&
              (v.category === "restaurant" || v.category === "cafe")
            )
              a.hunger = Math.max(
                0,
                a.hunger - (v.category === "restaurant" ? 0.85 : 0.25),
              );
            if (v.category === "seating")
              a.fatigue = Math.max(0, a.fatigue - 0.35);
            a.state = "choosing";
            a.target = null;
            this.log(a, `Finished visiting ${v.name}.`);
          }
          continue;
        }
        if (a.state === "waiting") {
          const v = s.layout.venues.find((v) => v.id === a.target)!,
            st = s.venues[v.id];
          a.wait += STEP;
          st.waitMinutes += STEP * a.size;
          if (!this.open(v) || a.wait >= a.patience || s.time >= a.departure) {
            st.queue -= a.size;
            st.abandoned += a.size;
            a.visited.push(v.id);
            a.state = "choosing";
            a.target = null;
            this.log(a, `Left the wait for ${v.name}.`);
          } else if (st.occupancy + a.size <= v.capacity) {
            st.queue -= a.size;
            this.admit(a, v);
          }
          continue;
        }
        if (s.time >= a.departure && !a.departing) this.leave(a);
        if (a.state === "walking") {
          let remaining = STEP * 60 * (a.accessible ? 0.85 : 1.2);
          while (a.route.length && remaining > 0) {
            const next = s.layout.nodes.find((n) => n.id === a.route[0])!;
            const edge = s.layout.edges.find(
              (e) =>
                (e.from === a.nodeId && e.to === next.id) ||
                (e.to === a.nodeId && e.from === next.id),
            );
            const traffic = walkingByNode.get(a.nodeId) ?? a.size;
            const crowdFactor = Math.max(
              0.35,
              1 - traffic / Math.max(12, (edge?.width ?? 6) * 8),
            );
            const d = distance(a.position, next);
            const move = remaining * crowdFactor;
            if (d <= move) {
              remaining -= d / crowdFactor;
              a.position = { x: next.x, y: next.y, floor: next.floor };
              a.nodeId = next.id;
              a.route.shift();
              s.traffic[next.id] = (s.traffic[next.id] ?? 0) + a.size;
            } else {
              if (a.position.floor === next.floor) {
                a.position.x += ((next.x - a.position.x) * move) / d;
                a.position.y += ((next.y - a.position.y) * move) / d;
              } else {
                a.position = { ...a.position, floor: next.floor };
              }
              remaining = 0;
            }
          }
          if (!a.route.length) {
            if (a.departing) {
              a.state = "departed";
              a.left = s.time;
              this.log(a, "Left the pier.");
            } else {
              const v = s.layout.venues.find((v) => v.id === a.target)!;
              if (!v || !this.open(v)) {
                a.state = "choosing";
                a.target = null;
              } else if (s.venues[v.id].occupancy + a.size <= v.capacity)
                this.admit(a, v);
              else {
                a.state = "waiting";
                a.wait = 0;
                s.venues[v.id].queue += a.size;
                this.log(a, `Waiting outside ${v.name}.`);
              }
            }
          }
        }
      }
      const choosing = s.agents.filter((a) => a.state === "choosing");
      const requests: DecisionInput[] = [];
      for (const a of choosing) {
        if (s.time >= a.departure) {
          this.leave(a);
          continue;
        }
        const input = this.options(a);
        if (input.options.length === 1) {
          this.leave(a);
          continue;
        }
        requests.push(input);
      }
      if (requests.length) {
        const outputs = await this.policy.decide(requests);
        if (outputs.length !== requests.length)
          throw Error("Incomplete provider batch");
        for (const input of requests) {
          const output = outputs.find((o) => o.agentId === input.agentId);
          if (
            !output ||
            output.probabilities.length !== input.options.length ||
            output.probabilities.some((n) => !Number.isFinite(n) || n < 0)
          )
            throw Error("Invalid provider response");
          const a = this.agentIndex.get(input.agentId)!;
          const option =
            input.options[
              weighted(
                output.probabilities,
                random(s.config.seed, a.id, "decision", a.decisions++),
              )
            ];
          s.decisions++;
          s.model = output.model;
          this.log(
            a,
            `Selected ${option.id === "exit" ? "departure" : s.layout.venues.find((v) => v.id === option.id)!.name}; budget $${(a.remaining / 100).toFixed(0)}, ${Math.round(a.departure - s.time)} min remaining.`,
            output.source,
          );
          if (option.id === "exit") this.leave(a);
          else {
            a.target = option.id;
            a.route = this.path(
              a,
              s.layout.venues.find((v) => v.id === option.id)!.nodeId,
            ).slice(1);
            a.state = "walking";
          }
        }
      }
      s.time = Math.min(s.config.end, s.time + STEP);
      if (s.time >= s.config.end) {
        for (const a of s.agents)
          if (a.state !== "pending" && a.state !== "departed") {
            if (a.state === "visiting" && a.target) {
              s.venues[a.target].occupancy -= a.size;
              s.venues[a.target].completed += a.size;
            }
            if (a.state === "waiting" && a.target)
              s.venues[a.target].queue -= a.size;
            a.state = "departed";
            a.left = s.time;
            this.log(a, "Operating window ended.");
          }
        s.status = "completed";
      }
      for (const a of s.agents)
        if (a.state === "departed" && this.parkingHeld.get(a.id) === Infinity)
          this.parkingHeld.set(
            a.id,
            s.time + (s.config.parkingBufferMinutes ?? 30),
          );
      s.parking!.occupied = this.parkingEnabled() ? this.parkingHeld.size : 0;
      s.parking!.peak = Math.max(s.parking!.peak, s.parking!.occupied);
      this.refresh();
      if (s.time - this.frameAt >= 5 || s.status === "completed") this.frame();
    } catch (error) {
      s.status = "failed";
      s.error = (error as Error).message;
      this.refresh();
      this.frame();
    }
  }
  refresh() {
    const s = this.snapshot;
    const arrived = s.agents.filter(
        (a) => a.state !== "pending" && a.admitted !== false,
      ),
      left = arrived.filter((a) => a.state === "departed");
    const n = arrived.reduce((n, a) => n + a.size, 0),
      departed = left.reduce((n, a) => n + a.size, 0),
      sales = s.sales.reduce((n, x) => n + x.cents, 0),
      buyers = arrived
        .filter((a) => a.spend > 0)
        .reduce((n, a) => n + a.size, 0);
    const area = s.layout.venues
      .filter((v) =>
        ["restaurant", "cafe", "shop", "attraction"].includes(v.category),
      )
      .reduce((n, v) => n + v.areaM2, 0);
    s.metrics = {
      attempted: s.agents
        .filter((a) => a.state !== "pending")
        .reduce((n, a) => n + a.size, 0),
      parkingRejected: s.parking?.deniedVisitors ?? 0,
      parkingPeak: s.parking?.peak ?? 0,
      mealEpisodes: arrived.reduce(
        (n, a) => n + (a.meals?.length ?? 0) * a.size,
        0,
      ),
      unmetDining: left
        .filter((a) => a.mealIntent && !a.meals?.length)
        .reduce((n, a) => n + a.size, 0),
      totalWaitMinutes: Object.values(s.venues).reduce(
        (n, v) => n + v.waitMinutes,
        0,
      ),
      queueAbandonments: Object.values(s.venues).reduce(
        (n, v) => n + v.abandoned,
        0,
      ),
      sales,
      arrived: n,
      departed,
      buyers,
      spendPerVisitor: n ? sales / n : 0,
      conversion: n ? buyers / n : 0,
      averageVisit: departed
        ? left.reduce(
            (n, a) => n + ((a.left ?? s.time) - a.arrival) * a.size,
            0,
          ) / departed
        : 0,
      zeroSpendDepartures: left
        .filter((a) => a.spend === 0)
        .reduce((n, a) => n + a.size, 0),
      waiting: Object.values(s.venues).reduce((n, v) => n + v.queue, 0),
      occupancy: Object.values(s.venues).reduce((n, v) => n + v.occupancy, 0),
      salesPerM2: area ? sales / area : 0,
      hourly: Array.from(
        { length: Math.ceil((s.config.end - s.config.start) / 60) },
        (_, i) => ({
          hour: s.config.start + i * 60,
          sales: s.sales
            .filter((x) => Math.floor((x.at - s.config.start) / 60) === i)
            .reduce((n, x) => n + x.cents, 0),
          visits: arrived
            .filter((a) => Math.floor((a.arrival - s.config.start) / 60) === i)
            .reduce((n, a) => n + a.size, 0),
        }),
      ),
      categories: Object.fromEntries(
        [...new Set(s.sales.map((x) => x.category))].map((c) => [
          c,
          s.sales
            .filter((x) => x.category === c)
            .reduce((n, x) => n + x.cents, 0),
        ]),
      ),
    };
    s.wallSeconds = (performance.now() - this.started) / 1000;
    s.achievedSpeed = s.wallSeconds
      ? ((s.time - s.config.start) * 60) / s.wallSeconds
      : 0;
  }
  private frame() {
    const s = this.snapshot;
    this.frameAt = s.time;
    this.frames.push({
      time: s.time,
      agents: s.agents
        .filter((a) => a.state !== "pending" && a.state !== "departed")
        .map((a) => ({
          id: a.id,
          ...a.position,
          state: a.state,
          remaining: a.remaining,
          spend: a.spend,
          target: a.target,
          history: clone(a.history.slice(-6)),
        })),
      traffic: clone(s.traffic),
      metrics: clone(s.metrics),
      venues: clone(s.venues),
    });
  }
}
