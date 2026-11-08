import type { Comparison, Metrics } from "./contracts";
export function comparisonSummary(c: Comparison) {
  const pairs = c.pairs.filter(
    (p) => p.status === "completed" && p.metricsA && p.metricsB,
  );
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const metric = (key: keyof Metrics, side: "A" | "B") => {
    const values = pairs.map(
      (p) => (side === "A" ? p.metricsA! : p.metricsB!)[key],
    );
    return values.every((v) => typeof v === "number")
      ? average(values as number[])
      : null;
  };
  const venuePairs = pairs.filter((p) => p.venueSalesA && p.venueSalesB);
  const ids = [
    ...new Set([...c.baseline.venues, ...c.variant.venues].map((v) => v.id)),
  ];
  const venues = venuePairs.length
    ? ids
        .map((id) => {
          const a = average(venuePairs.map((p) => p.venueSalesA![id] ?? 0))!;
          const b = average(venuePairs.map((p) => p.venueSalesB![id] ?? 0))!;
          const before = c.baseline.venues.find((v) => v.id === id),
            after = c.variant.venues.find((v) => v.id === id);
          return {
            id,
            name: after?.name ?? before?.name ?? id,
            beforeName: before?.name,
            a,
            b,
            delta: b - a,
            changed: JSON.stringify(before) !== JSON.stringify(after),
          };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];
  const gains = venues.reduce((sum, v) => sum + Math.max(0, v.delta), 0);
  const losses = venues.reduce((sum, v) => sum + Math.min(0, v.delta), 0);
  const percentages = pairs
    .filter((p) => p.metricsA!.sales > 0)
    .map(
      (p) =>
        (100 * (p.metricsB!.sales - p.metricsA!.sales)) / p.metricsA!.sales,
    );
  return {
    pairs,
    metric,
    venues,
    gains,
    losses,
    meanPercent: average(percentages),
  };
}
