// Keyed randomness keeps cohorts and per-venue spending comparable across alternative layouts.
export function random(seed: string, ...keys: (string | number)[]) {
  let h = 2166136261;
  for (const c of [seed, ...keys].join("|")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h += 0x6d2b79f5;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
export function weighted(weights: number[], u: number) {
  const total = weights.reduce((s, n) => s + n, 0);
  let t = u * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0) return i;
  }
  return weights.length - 1;
}
