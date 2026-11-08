import { BASELINE } from "./baseline";
import {
  CATEGORIES,
  type Layout,
  type Point,
  type Venue,
  type Config,
} from "./contracts";
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y) + (a.floor !== b.floor ? 18 : 0);
}
export function route(
  layout: Layout,
  from: string,
  to: string,
  accessible = false,
): string[] {
  const d = new Map<string, number>([[from, 0]]),
    prev = new Map<string, string>(),
    done = new Set<string>();
  while (true) {
    let id: string | undefined,
      best = Infinity;
    for (const [k, v] of d)
      if (!done.has(k) && v < best) {
        id = k;
        best = v;
      }
    if (!id) return [];
    if (id === to) {
      const r = [to];
      while (r[0] !== from) r.unshift(prev.get(r[0])!);
      return r;
    }
    done.add(id);
    const a = layout.nodes.find((n) => n.id === id)!;
    for (const e of layout.edges)
      if (
        e.enabled &&
        (!accessible || e.accessible) &&
        (e.from === id || e.to === id)
      ) {
        const next = e.from === id ? e.to : e.from,
          b = layout.nodes.find((n) => n.id === next);
        if (!b) continue;
        const cost = best + distance(a, b);
        if (cost < (d.get(next) ?? Infinity)) {
          d.set(next, cost);
          prev.set(next, id);
        }
      }
  }
}
export function validateLayout(l: Layout): string[] {
  const errors: string[] = [];
  if (
    !l ||
    !Array.isArray(l.venues) ||
    !Array.isArray(l.nodes) ||
    !Array.isArray(l.edges)
  )
    return ["Invalid layout"];
  if (
    l.parking &&
    (!Number.isInteger(l.parking.spaces) ||
      l.parking.spaces < 0 ||
      l.parking.spaces > 5000)
  )
    errors.push("Parking capacity must be 0–5,000 spaces");
  if (l.version !== "pier39.v2") errors.push("Unsupported layout version");
  if (new Set(l.venues.map((v) => v.id)).size !== l.venues.length)
    errors.push("Duplicate venue IDs");
  if (
    l.nodes.length !== BASELINE.nodes.length ||
    JSON.stringify(l.nodes) !== JSON.stringify(BASELINE.nodes)
  )
    errors.push("Permanent navigation nodes must stay fixed");
  for (const b of BASELINE.edges.filter((e) => e.structural))
    if (
      !l.edges.some(
        (e) => e.id === b.id && JSON.stringify(e) === JSON.stringify(b),
      )
    )
      errors.push(`Preserve structural connection ${b.id}`);
  for (const e of l.edges) {
    if (
      !l.nodes.some((n) => n.id === e.from) ||
      !l.nodes.some((n) => n.id === e.to)
    )
      errors.push(`Invalid path ${e.id}`);
    if (!Number.isFinite(e.width) || e.width < 2 || e.width > 20)
      errors.push("Paths must be 2–20 m wide");
  }
  for (const b of BASELINE.venues.filter((v) => !v.movable)) {
    const v = l.venues.find((v) => v.id === b.id);
    if (
      !v ||
      v.movable ||
      ["x", "y", "w", "h", "floor", "nodeId"].some(
        (k) => (v as any)[k] !== (b as any)[k],
      )
    )
      errors.push(`Preserve the building at ${b.name}`);
  }
  for (const v of l.venues) {
    if (!CATEGORIES.includes(v.category) || ![1, 2].includes(v.floor))
      errors.push(`Invalid venue ${v.name}`);
    if (
      ![
        v.x,
        v.y,
        v.w,
        v.h,
        v.capacity,
        v.dwellMin,
        v.dwellMax,
        v.spendMin,
        v.spendMax,
        v.purchaseProbability,
        v.open,
        v.close,
        v.areaM2,
        v.signage,
      ].every(Number.isFinite)
    )
      errors.push(`Invalid numeric value at ${v.name}`);
    if (
      v.x < 8 ||
      v.x + v.w > 146 ||
      v.y < 22 ||
      v.y + v.h > 302 ||
      v.w <= 0 ||
      v.h <= 0
    )
      errors.push(`${v.name} must stay on the pier`);
    if (
      v.capacity < 1 ||
      v.capacity > 500 ||
      !Number.isInteger(v.capacity) ||
      v.dwellMin < 1 ||
      v.dwellMax < v.dwellMin ||
      v.spendMin < 0 ||
      v.spendMax < v.spendMin ||
      v.spendMax > 100000 ||
      v.purchaseProbability < 0 ||
      v.purchaseProbability > 1 ||
      v.open < 0 ||
      v.close > 1440 ||
      v.open >= v.close ||
      v.areaM2 <= 0 ||
      v.signage < 0 ||
      v.signage > 3
    )
      errors.push(`Check operating assumptions for ${v.name}`);
    const door = l.nodes.find((n) => n.id === v.nodeId);
    if (
      !door ||
      door.floor !== v.floor ||
      !route(l, "entry", v.nodeId).length ||
      !route(l, "entry", v.nodeId, true).length
    )
      errors.push(`${v.name} needs connected, accessible pedestrian access`);
    if (
      v.movable &&
      door &&
      distance({ ...v, x: v.x + v.w / 2, y: v.y + v.h / 2 }, door) > 22
    )
      errors.push(`${v.name} is too far from a pedestrian route`);
    for (const other of l.venues)
      if (
        v.id < other.id &&
        v.floor === other.floor &&
        v.x < other.x + other.w &&
        v.x + v.w > other.x &&
        v.y < other.y + other.h &&
        v.y + v.h > other.y
      )
        errors.push(`${v.name} overlaps ${other.name}`);
    if (v.movable)
      for (const e of l.edges.filter((e) => e.enabled)) {
        const a = l.nodes.find((n) => n.id === e.from),
          b = l.nodes.find((n) => n.id === e.to);
        if (!a || !b || a.floor !== v.floor || b.floor !== v.floor) continue;
        const steps = Math.max(1, Math.ceil(distance(a, b)));
        let blocked = false;
        for (let i = 0; i <= steps; i++) {
          const x = a.x + ((b.x - a.x) * i) / steps,
            y = a.y + ((b.y - a.y) * i) / steps;
          if (
            x > v.x - e.width / 2 &&
            x < v.x + v.w + e.width / 2 &&
            y > v.y - e.width / 2 &&
            y < v.y + v.h + e.width / 2
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) errors.push(`${v.name} blocks path ${e.id}`);
      }
    if (
      !Array.isArray(v.eventStarts) ||
      v.eventStarts.some((t) => !Number.isFinite(t) || t < 0 || t >= 1440)
    )
      errors.push(`Invalid event schedule for ${v.name}`);
  }
  return [...new Set(errors)];
}
export function validateConfig(c: Config): string[] {
  const e: string[] = [];
  if (
    c.carShare !== undefined &&
    (!Number.isFinite(c.carShare) || c.carShare < 0 || c.carShare > 1)
  )
    e.push("Car share must be 0–100%");
  if (
    c.initialParkedVehicles !== undefined &&
    (!Number.isInteger(c.initialParkedVehicles) ||
      c.initialParkedVehicles < 0 ||
      c.initialParkedVehicles > 5000)
  )
    e.push("Initial parked vehicles must be 0–5,000");
  if (
    c.parkingBufferMinutes !== undefined &&
    (!Number.isFinite(c.parkingBufferMinutes) ||
      c.parkingBufferMinutes < 0 ||
      c.parkingBufferMinutes > 240)
  )
    e.push("Parking buffer must be 0–240 minutes");
  if (!["local", "rules", "jev"].includes(c.provider))
    e.push("Invalid provider");
  if (!Number.isInteger(c.visitors) || c.visitors < 1 || c.visitors > 40000)
    e.push("Use 1–40,000 visitors");
  if (
    !Number.isFinite(c.start) ||
    !Number.isFinite(c.end) ||
    c.start < 0 ||
    c.end > 1440 ||
    c.end <= c.start
  )
    e.push("Invalid operating window");
  if (
    !Array.isArray(c.hourly) ||
    c.hourly.length !== Math.ceil((c.end - c.start) / 60) ||
    !c.hourly.every((n) => Number.isFinite(n) && n >= 0) ||
    !c.hourly.some((n) => n > 0)
  )
    e.push("Supply nonnegative hourly arrivals with a positive total");
  if (!Number.isFinite(c.speed) || c.speed < 1 || c.speed > 100000)
    e.push("Invalid speed");
  if (!c.seed || c.seed.length > 100) e.push("Invalid seed");
  return e;
}
export function nearestNode(l: Layout, v: Point) {
  return l.nodes
    .filter((n) => n.floor === v.floor && !n.id.startsWith("door"))
    .sort((a, b) => distance(a, v) - distance(b, v))[0];
}
export function clone<T>(v: T): T {
  return structuredClone(v);
}
