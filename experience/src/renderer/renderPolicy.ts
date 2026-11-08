export const MAX_VISIBLE_GROUPS = 300;
export function renderPolicy(speed: number, count: number, paused: boolean) {
  const overview = !paused && (speed > 120 || count > MAX_VISIBLE_GROUPS);
  return { overview, limit: overview ? 0 : MAX_VISIBLE_GROUPS };
}
