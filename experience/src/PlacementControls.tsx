import { useEffect, useState } from "react";
import type { Venue, Floor } from "../../shared/contracts";
export type Footprint = Pick<Venue, "x" | "y" | "w" | "h" | "floor">;
export function PlacementControls({
  venue,
  apply,
  duplicate,
}: {
  venue: Venue;
  apply: (patch: Footprint) => void;
  duplicate: () => void;
}) {
  const [draft, setDraft] = useState<Footprint>(venue);
  useEffect(
    () =>
      setDraft({
        x: venue.x,
        y: venue.y,
        w: venue.w,
        h: venue.h,
        floor: venue.floor,
      }),
    [venue],
  );
  return (
    <div className="placement-controls">
      <h3>Placement & size</h3>
      <div className="field-row">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k}>
            {
              {
                x: "X position · m",
                y: "Y position · m",
                w: "Width · m",
                h: "Depth · m",
              }[k]
            }
            <input
              aria-label={
                {
                  x: "Object X",
                  y: "Object Y",
                  w: "Object width",
                  h: "Object depth",
                }[k]
              }
              type="number"
              step={0.5}
              min={k === "w" || k === "h" ? 1 : undefined}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: +e.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Object level
        <select
          value={draft.floor}
          onChange={(e) =>
            setDraft({ ...draft, floor: +e.target.value as Floor })
          }
        >
          <option value={1}>Level 1 · Boardwalk</option>
          <option value={2}>Level 2 · Upper terraces</option>
        </select>
      </label>
      <div className="button-row">
        <button onClick={() => apply(draft)}>Apply placement</button>
        <button
          onClick={() =>
            apply({
              x: venue.x + (venue.w - venue.h) / 2,
              y: venue.y + (venue.h - venue.w) / 2,
              w: venue.h,
              h: venue.w,
              floor: venue.floor,
            })
          }
        >
          Rotate 90°
        </button>
        <button onClick={duplicate}>Duplicate object</button>
      </div>
      <p className="hint">
        Select an object on the map, then use arrow keys to nudge it. Shift
        moves five snap steps. Update capacity and floor area separately when
        needed.
      </p>
    </div>
  );
}
