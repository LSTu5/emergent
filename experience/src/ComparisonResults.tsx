import React from "react";
import { comparisonSummary } from "../../shared/comparison";
import { money, type Comparison, type Metrics } from "../../shared/contracts";
const num = (n: number | null) =>
  n === null ? "—" : Math.round(n).toLocaleString();
const signed = (n: number, format: (n: number) => string = num) =>
  `${n > 0 ? "+" : ""}${format(n)}`;
export function ComparisonResults({
  comparison: c,
  inspect,
}: {
  comparison: Comparison;
  inspect: (id: string) => void;
}) {
  const s = comparisonSummary(c);
  const rows: {
    key: keyof Metrics;
    label: string;
    format?: (n: number) => string;
  }[] = [
    { key: "sales", label: "Total business sales", format: money },
    {
      key: "spendPerVisitor",
      label: "Spend per admitted visitor",
      format: money,
    },
    { key: "arrived", label: "Visitors admitted to the pier" },
    { key: "parkingRejected", label: "Visitors turned away by parking rule" },
    { key: "parkingPeak", label: "Peak occupied parking spaces" },
    { key: "mealEpisodes", label: "Meals served · people" },
    {
      key: "unmetDining",
      label: "Meal-intent visitors leaving without a meal",
    },
    { key: "queueAbandonments", label: "Queue abandonments · people / events" },
    { key: "totalWaitMinutes", label: "Total waiting · person-minutes" },
    { key: "averageVisit", label: "Mean completed visit · minutes" },
    {
      key: "zeroSpendDepartures",
      label: "Admitted visitors leaving without buying",
    },
  ];
  return (
    <div className="comparison-results">
      <div className="compare-head">
        <span className="pill">{c.status}</span>
        <span>
          {c.baseline.name} → {c.variant.name}
        </span>
        <span>
          {s.pairs.length} / {c.pairs.length} pairs complete
        </span>
      </div>
      <p className="hint">
        {c.config.visitors.toLocaleString()} attempted visitors per run ·{" "}
        {c.config.provider === "local" ? "Local AI · Laya" : c.config.provider}{" "}
        · one vehicle per car group · identical demand, budgets and seeds within
        each pair
      </p>
      <div className="delta">
        <span>Mean change in total visitor spending</span>
        <strong>
          {c.meanDelta === null
            ? "No completed summary yet"
            : signed(c.meanDelta, money)}
        </strong>
        <b>
          {s.meanPercent === null
            ? "—"
            : `${signed(s.meanPercent, (n) => n.toFixed(2))}% mean paired change`}
        </b>
        <p>
          {c.pairs.length === 1
            ? "One pair is illustrative."
            : `Paired range: ${c.range?.map(money).join(" to ") ?? "Pending"} · standard deviation: ${c.sd === null ? "Pending" : money(c.sd)}`}
        </p>
        {c.range && c.range[0] < 0 && c.range[1] > 0 && (
          <p className="variation-note">
            The direction changes across seeds. This is not a consistent uplift.
          </p>
        )}
        <small>
          Variation across seeds is not a forecast confidence interval. Inputs
          and model assumptions remain uncalibrated.
        </small>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pair</th>
              <th>Status</th>
              <th>A · sales</th>
              <th>B · sales</th>
              <th>Change</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {c.pairs.map((p, i) => (
              <tr key={p.seed}>
                <td>{i + 1}</td>
                <td>
                  {p.status}
                  {p.error && <small className="danger">{p.error}</small>}
                </td>
                <td>{p.metricsA ? money(p.metricsA.sales) : "—"}</td>
                <td>{p.metricsB ? money(p.metricsB.sales) : "—"}</td>
                <td>
                  {p.delta === undefined ? (
                    "—"
                  ) : (
                    <>
                      {signed(p.delta, money)}
                      <small>
                        {p.metricsA!.sales > 0
                          ? `${signed((100 * p.delta) / p.metricsA!.sales, (n) => n.toFixed(2))}%`
                          : "No baseline sales"}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  {(["A", "B"] as const).map((side) => {
                    const id = side === "A" ? p.a : p.b;
                    return (
                      id && (
                        <button key={side} onClick={() => inspect(id)}>
                          {side}
                        </button>
                      )
                    );
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.pairs.length > 0 && (
        <>
          <h3>Commercial and operational tradeoffs</h3>
          <p className="hint">
            Mean of completed pairs only. Capacity, time, spending and demand
            are modeled assumptions.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>A · baseline</th>
                  <th>B · alternative</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = s.metric(r.key, "A"),
                    b = s.metric(r.key, "B"),
                    fmt = r.format ?? num;
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{a === null ? "—" : fmt(a)}</td>
                      <td>{b === null ? "—" : fmt(b)}</td>
                      <td>
                        {a === null || b === null ? "—" : signed(b - a, fmt)}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>Purchase conversion</td>
                  <td>{(100 * s.metric("conversion", "A")!).toFixed(1)}%</td>
                  <td>{(100 * s.metric("conversion", "B")!).toFixed(1)}%</td>
                  <td>
                    {signed(
                      100 *
                        (s.metric("conversion", "B")! -
                          s.metric("conversion", "A")!),
                      (n) => n.toFixed(1),
                    )}{" "}
                    pp
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      {!!s.venues.length && (
        <>
          <h3>Where spending moved</h3>
          <div className="transfer-summary">
            <div>
              <span>Gains across venues</span>
              <b>{signed(s.gains, money)}</b>
            </div>
            <div>
              <span>Declines across venues</span>
              <b>{money(s.losses)}</b>
            </div>
            <div>
              <span>Net pier-wide change</span>
              <b>{signed(s.gains + s.losses, money)}</b>
            </div>
          </div>
          <p className="hint">
            A new restaurant can gain sales while other tenants lose them. These
            venue differences reconcile to the pier-wide change; they do not
            identify each visitor’s substitute or prove demand creation.
          </p>
          <details open>
            <summary>Sales by venue · paired means</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Venue / modeled tenant space</th>
                    <th>A</th>
                    <th>B</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {s.venues.map((v) => (
                    <tr key={v.id}>
                      <td>
                        {v.name}
                        {v.changed && (
                          <small>
                            Edited space
                            {v.beforeName !== v.name
                              ? ` · previously ${v.beforeName}`
                              : ""}
                          </small>
                        )}
                      </td>
                      <td>{money(v.a)}</td>
                      <td>{money(v.b)}</td>
                      <td>{signed(v.delta, money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {c.variant.scenario && (
        <div className="assumptions">
          <b>{c.variant.scenario.question}</b>
          <p>{c.variant.scenario.tradeoff}</p>
        </div>
      )}
    </div>
  );
}
