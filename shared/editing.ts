import type { Layout, Point, Venue } from "./contracts";
import { clone, distance, placementConflicts, route } from "./layout";

export function placeVenue(
  layout: Layout,
  venue: Venue,
  point: Point,
): { venue: Venue; errors: string[] } {
  const next = { ...venue, ...point };
  const errors = placementConflicts(layout, next);
  if (errors.length) return { venue: next, errors };
  const center = {
    x: next.x + next.w / 2,
    y: next.y + next.h / 2,
    floor: next.floor,
  };
  const door = layout.nodes
    .filter(
      (n) =>
        n.floor === next.floor &&
        !n.id.startsWith("door") &&
        distance(n, center) <= 22,
    )
    .sort((a, b) => distance(a, center) - distance(b, center))
    .find(
      (n) =>
        route(layout, "entry", n.id).length &&
        route(layout, "entry", n.id, true).length,
    );
  if (!door)
    errors.push(
      `${next.name} needs a clear, accessible pedestrian route nearby`,
    );
  else next.nodeId = door.id;
  return { venue: next, errors };
}

/** Search the whole floor, nearest preferred position first; never return an invalid fallback. */
export function findVenuePosition(layout: Layout, venue: Venue): Venue | null {
  const candidates = [{ x: venue.x, y: venue.y, floor: venue.floor }];
  for (let x = 8; x <= 146 - venue.w; x += 2)
    for (let y = 22; y <= 302 - venue.h; y += 2)
      candidates.push({ x, y, floor: venue.floor });
  candidates.sort((a, b) => distance(a, venue) - distance(b, venue));
  for (const point of candidates) {
    const result = placeVenue(layout, venue, point);
    if (!result.errors.length) return result.venue;
  }
  return null;
}

/** Repair only movable objects. Preserve business settings, fixed buildings and edited paths. */
export function repairObjectPositions(
  layout: Layout,
): { layout: Layout; moved: number } | null {
  const result = clone(layout);
  result.venues = result.venues.filter((v) => !v.movable);
  let moved = 0;
  const pending: Venue[] = [];
  for (const venue of layout.venues.filter((v) => v.movable)) {
    const check = placeVenue(result, venue, venue);
    if (check.errors.length) pending.push(venue);
    else result.venues.push(check.venue);
  }
  for (const venue of pending) {
    const placed = findVenuePosition(result, venue);
    if (!placed) return null;
    result.venues.push(placed);
    moved++;
  }
  const positions = new Map(result.venues.map((v) => [v.id, v]));
  result.venues = layout.venues.map((v) => positions.get(v.id)!);
  return { layout: result, moved };
}

export function reshapeVenue(
  layout: Layout,
  venue: Venue,
  patch: Pick<Venue, "x" | "y" | "w" | "h" | "floor">,
) {
  if (!venue.movable)
    return { venue, errors: ["Fixed buildings cannot be moved or resized"] };
  if (
    ![patch.x, patch.y, patch.w, patch.h].every(Number.isFinite) ||
    patch.w < 1 ||
    patch.h < 1 ||
    ![1, 2].includes(patch.floor)
  )
    return {
      venue,
      errors: [
        "Use finite positions, dimensions of at least 1 metre, and a valid level",
      ],
    };
  return placeVenue(layout, { ...venue, ...patch }, patch);
}
export function snapCoordinate(value: number, step: number) {
  return Math.round(value / step) * step;
}
