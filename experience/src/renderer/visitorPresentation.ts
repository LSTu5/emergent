import type { Frame } from "../../../shared/contracts";
export function visitorPresentationKey(
  poses: Frame["agents"],
  settings: unknown[],
) {
  return JSON.stringify([settings, poses.map((p) => [p.id, p.floor, p.state])]);
}
export function followOffset(
  current: { x: number; y: number },
  target: { x: number; y: number },
  elapsedMs: number,
  immediate = false,
) {
  const amount = immediate
    ? 1
    : 1 - Math.exp(-Math.max(0, Math.min(100, elapsedMs)) / 100);
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
  };
}
