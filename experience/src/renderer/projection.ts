/** Shared projection for rendering and inverse-projected drag placement. */
export type V3 = [number, number, number];
export const project = (x: number, y: number, z = 0) => ({
  x: x - y + 330,
  y: (x + y) * 0.5 + 22 - z * 1.2,
});
export const unproject = (x: number, y: number) => ({
  x: (2 * (y - 22) + x - 330) / 2,
  y: (2 * (y - 22) - x + 330) / 2,
});
export function groundDelta(dx: number, dy: number, scale: number) {
  return {
    x: (dx / scale + (2 * dy) / scale) / 2,
    y: ((2 * dy) / scale - dx / scale) / 2,
  };
}
export function sceneFrames(both: boolean, floor: 1 | 2) {
  return both
    ? [
        { floor: 2 as const, x: 32, y: 4 },
        { floor: 1 as const, x: 0, y: 286 },
      ]
    : [{ floor, x: 0, y: 0 }];
}
