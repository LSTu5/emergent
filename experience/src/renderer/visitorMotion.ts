import type { Frame, Layout, Point } from "../../../shared/contracts";

type Pose = Frame["agents"][number];
type Track = {
  pose: Pose;
  path: Point[];
  distances: number[];
  total: number;
  start: number;
  duration: number;
};
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Follow the actual traversed route; never cut across a building or between floors. */
export function motionPath(
  layout: Layout,
  previous: Pose,
  next: Pose,
): Point[] {
  if (previous.floor !== next.floor || previous.target !== next.target)
    return [next];
  if (previous.nodeId && previous.nodeId === next.nodeId)
    return [previous, next];
  if (previous.state !== "walking" || !previous.route || !next.nodeId)
    return [next];
  const reached = previous.route.indexOf(next.nodeId);
  if (reached < 0) return [next];
  const nodes = previous.route
    .slice(0, reached + 1)
    .map((id) => layout.nodes.find((n) => n.id === id));
  if (nodes.some((node) => !node || node.floor !== next.floor)) return [next];
  return [previous, ...(nodes as Point[]), next];
}

/** Display-only interpolation between committed engine updates, with no extrapolation. */
export class VisitorMotion {
  private tracks = new Map<string, Track>();
  private key = "";
  private time = -Infinity;
  private wall = 0;
  update(
    key: string,
    layout: Layout,
    poses: Pose[],
    time: number,
    paused: boolean,
    wall: number,
  ) {
    const reset = key !== this.key || time < this.time;
    if (!reset && time === this.time && !paused) return;
    const duration =
      paused || reset ? 0 : Math.min(30000, Math.max(100, wall - this.wall));
    const next = new Map<string, Track>();
    for (const pose of poses) {
      const previous = reset ? undefined : this.tracks.get(pose.id)?.pose;
      const path =
        previous && duration ? motionPath(layout, previous, pose) : [pose];
      const distances = path.slice(1).map((point, i) => length(path[i], point));
      next.set(pose.id, {
        pose,
        path,
        distances,
        total: distances.reduce((a, b) => a + b, 0),
        start: wall,
        duration,
      });
    }
    this.tracks = next;
    this.key = key;
    this.time = time;
    this.wall = wall;
  }
  point(id: string, wall: number): Point | undefined {
    const track = this.tracks.get(id);
    if (!track) return;
    const { path, start, duration } = track;
    const progress = duration
      ? Math.min(1, Math.max(0, (wall - start) / duration))
      : 1;
    let remaining = track.total * progress;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        distance = track.distances[i - 1];
      if (remaining < distance) {
        const t = remaining / distance;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          floor: a.floor,
        };
      }
      remaining -= distance;
    }
    return path.at(-1);
  }
}

export function visitorStyle(id: string) {
  let hash = 0;
  for (const character of id)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return {
    x: ((hash % 3) - 1) * 0.8,
    y: ((hash % 5) - 2) * 0.6,
    color: [0x2d6d79, 0x925442, 0x465e4f][hash % 3],
  };
}
