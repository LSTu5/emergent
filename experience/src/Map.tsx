import { useEffect, useRef, useState } from "react";
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
} from "pixi.js";
import { placeVenue } from "../../shared/editing";
import type {
  Layout,
  Floor,
  Snapshot,
  Frame,
  Point,
} from "../../shared/contracts";
import { BASELINE } from "../../shared/baseline";
import { project, groundDelta, sceneFrames } from "./renderer/projection";
import { Draw, label } from "./renderer/drawing";
import {
  COLORS,
  SHORT,
  environment,
  venueGraphic,
  isLandmark,
} from "./renderer/pierScene";
export { COLORS };
interface Props {
  layout: Layout;
  floor: Floor;
  both: boolean;
  selected: string | null;
  run: Snapshot | null;
  frame: Frame | null;
  heat: string;
  editable: boolean;
  paths: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, p: Point) => void;
  onPath: (id: string) => void;
  onGuest: (id: string) => void;
  onFloor: (f: Floor) => void;
}
export function PierMap(p: Props) {
  const host = useRef<HTMLDivElement>(null),
    appRef = useRef<Application | null>(null),
    props = useRef(p),
    camera = useRef({ zoom: 1, x: 0, y: 0 });
  props.current = p;
  const [hover, setHover] = useState<string | null>(null);
  const [dragFeedback, setDragFeedback] = useState<{
    text: string;
    invalid: boolean;
  } | null>(null);
  useEffect(() => {
    camera.current = { zoom: 1, x: 0, y: 0 };
    (appRef.current as any)?.redraw?.();
  }, [p.both, p.floor]);
  useEffect(() => {
    const app = new Application();
    let dead = false,
      resize: ResizeObserver;
    let render = () => {};
    let cancelDrag: (() => void) | null = null;
    void app
      .init({
        background: 0x9ebfc7,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
        resizeTo: host.current!,
      })
      .then(() => {
        if (dead) {
          app.destroy();
          return;
        }
        host.current!.appendChild(app.canvas);
        appRef.current = app;
        app.stage.eventMode = "static";
        app.stage.hitArea = new Rectangle(
          0,
          0,
          app.screen.width,
          app.screen.height,
        );
        let pan: { x: number; y: number; cx: number; cy: number } | null = null;
        app.stage.on("pointerdown", (e) => {
          if (e.target === app.stage) {
            pan = {
              x: e.global.x,
              y: e.global.y,
              cx: camera.current.x,
              cy: camera.current.y,
            };
          }
        });
        app.stage.on("globalpointermove", (e) => {
          if (pan) {
            camera.current.x = pan.cx + e.global.x - pan.x;
            camera.current.y = pan.cy + e.global.y - pan.y;
            render();
          }
        });
        app.stage.on("pointerup", () => {
          pan = null;
        });
        app.stage.on("pointerupoutside", () => {
          pan = null;
        });
        render = () => {
          if ((app as any).dragging) return;
          const p = props.current;
          app.stage
            .removeChildren()
            .forEach((c) => c.destroy({ children: true }));
          app.stage.hitArea = new Rectangle(
            0,
            0,
            app.screen.width,
            app.screen.height,
          );
          const bg = new Graphics();
          for (let y = 0; y < app.screen.height; y += 24) {
            for (let x = 0; x < app.screen.width; x += 42) {
              const s = Math.sin(x * 0.04 + y * 0.09);
              bg.moveTo(x, y + s * 4)
                .bezierCurveTo(
                  x + 10,
                  y - 3 + s * 4,
                  x + 21,
                  y + 4 + s * 4,
                  x + 30,
                  y + s * 4,
                )
                .stroke({ color: 0xd8e5df, width: 0.65, alpha: 0.3 });
            }
          }
          app.stage.addChild(bg);
          const sceneW = p.both ? 570 : 545,
            sceneH = p.both ? 575 : 290;
          const scale =
            Math.min(
              (app.screen.width - 40) / sceneW,
              (app.screen.height - 75) / sceneH,
            ) * camera.current.zoom;
          const ox = (app.screen.width - sceneW * scale) / 2 + camera.current.x,
            oy =
              (app.screen.height - sceneH * scale) / 2 + camera.current.y + 12;
          const root = new Container();
          root.position.set(ox, oy);
          root.scale.set(scale);
          app.stage.addChild(root);
          const stats = p.frame?.venues ?? p.run?.venues,
            traffic = p.frame ? p.frame.traffic : p.run?.traffic;
          const visitors =
            p.frame?.agents ??
            p.run?.agents
              .filter((a) => a.state !== "pending" && a.state !== "departed")
              .map((a) => ({ id: a.id, ...a.position, state: a.state })) ??
            [];
          const maxSales = Math.max(
            1,
            ...Object.values(stats ?? {}).map((v) => v.sales),
          );
          for (const pane of sceneFrames(p.both, p.floor)) {
            const world = new Container();
            world.position.set(pane.x, pane.y);
            root.addChild(world);
            const heading = new Container();
            heading.position.set(340, -12);
            world.addChild(heading);
            heading.addChild(
              new Graphics()
                .roundRect(-82, -14, 164, 29, 5)
                .fill({ color: 0xf7f6ec, alpha: 0.96 })
                .stroke({ color: 0x718f89, width: 0.5 }),
            );
            label(
              heading,
              `LEVEL ${pane.floor}  ·  ${pane.floor === 1 ? "BOARDWALK" : "UPPER TERRACES"}`,
              0,
              -3,
              Math.max(5.2, 11 / scale),
              0x203f45,
              "700",
            );
            label(
              heading,
              pane.floor === 1
                ? "Shops · sea lions · waterfront"
                : "Dining · overlooks · attractions",
              0,
              7,
              Math.max(3.6, 8 / scale),
              0x55746e,
            );
            heading.eventMode = "static";
            heading.cursor = "pointer";
            heading.on("pointertap", () => props.current.onFloor(pane.floor));
            environment(world, p.layout, pane.floor, scale);
            const paths = new Graphics(),
              d = new Draw(paths);
            world.addChild(paths);
            for (const e of p.layout.edges) {
              const a = p.layout.nodes.find((n) => n.id === e.from)!,
                b = p.layout.nodes.find((n) => n.id === e.to)!;
              if (a.floor !== pane.floor || b.floor !== pane.floor) continue;
              d.line(
                [
                  [a.x, a.y, 0.15],
                  [b.x, b.y, 0.15],
                ],
                e.enabled ? (p.paths ? 0x83b6aa : 0xdfcba8) : 0xbf6a4d,
                Math.min(8, e.width),
                e.enabled ? 0.7 : 0.9,
              );
              if (p.paths && !e.structural) {
                const hit = new Graphics(),
                  dr = new Draw(hit);
                dr.line(
                  [
                    [a.x, a.y, 0.25],
                    [b.x, b.y, 0.25],
                  ],
                  e.enabled ? 0x4b9b83 : 0xba5a4a,
                  3,
                  0.85,
                );
                hit.eventMode = "static";
                hit.cursor = "pointer";
                hit.on("pointertap", () => props.current.onPath(e.id));
                world.addChild(hit);
              }
              if (p.heat === "footfall" && traffic) {
                const q = project(b.x, b.y, 0.4),
                  n = traffic[b.id] ?? 0;
                if (n)
                  paths.ellipse(q.x, q.y, 6, 3).fill({
                    color: 0xe78a3d,
                    alpha: Math.min(
                      0.8,
                      0.15 + n / Math.max(500, p.run?.config.visitors ?? 500),
                    ),
                  });
              }
            }
            const models = new Container();
            models.sortableChildren = true;
            world.addChild(models);
            const overlay = new Container();
            overlay.sortableChildren = true;
            for (const v of p.layout.venues.filter(
              (v) => v.floor === pane.floor,
            )) {
              const st = stats?.[v.id],
                selected = v.id === p.selected,
                ratio =
                  p.heat === "occupancy"
                    ? (st?.occupancy ?? 0) / v.capacity
                    : (st?.sales ?? 0) / maxSales;
              const { container: c, height } = venueGraphic(
                v,
                selected,
                p.heat,
                ratio,
              );
              c.zIndex = v.x + v.y + v.w / 2 + v.h;
              models.addChild(c);
              // Include the projected footprint so free spaces and small kiosks remain selectable.
              const footprint = [
                [v.x, v.y],
                [v.x + v.w, v.y],
                [v.x + v.w, v.y + v.h],
                [v.x, v.y + v.h],
              ].map(([x, y]) => project(x, y));
              const minX = Math.min(...footprint.map((q) => q.x)),
                maxX = Math.max(...footprint.map((q) => q.x)),
                minY = Math.min(...footprint.map((q) => q.y)) - height * 1.2,
                maxY = Math.max(...footprint.map((q) => q.y));
              c.hitArea = new Rectangle(
                minX - 1,
                minY - 1,
                Math.max(8 / scale, maxX - minX + 2),
                Math.max(10 / scale, maxY - minY + 2),
              );
              const labelGroup = new Container();
              labelGroup.zIndex = selected
                ? 20
                : v.movable && p.editable
                  ? 10
                  : 0;
              overlay.addChild(labelGroup);
              const bindTarget = (target: Container) => {
                target.eventMode = "static";
                target.cursor = p.editable && v.movable ? "grab" : "pointer";
                target.on("pointerover", () =>
                  setHover(
                    v.movable && p.editable
                      ? `Drag ${v.name}`
                      : `${v.name}${!v.movable && p.editable ? " · fixed building" : ""}`,
                  ),
                );
                target.on("pointerout", () => setHover(null));
                target.on("pointerdown", (event: FederatedPointerEvent) => {
                  event.stopPropagation();
                  if (event.button !== 0) return;
                  if (!props.current.editable || !v.movable) {
                    props.current.onSelect(v.id);
                    return;
                  }
                  cancelDrag?.();
                  pan = null;
                  (app as any).dragging = true;
                  const pointer = event.pointerId;
                  const origin = { x: event.global.x, y: event.global.y };
                  let moved = false;
                  let destination: Point = { x: v.x, y: v.y, floor: v.floor };
                  const preview = new Graphics();
                  preview.zIndex = 30;
                  preview.eventMode = "none";
                  overlay.addChild(preview);
                  app.canvas.setPointerCapture(pointer);
                  app.canvas.style.cursor = "grabbing";
                  const update = (e: PointerEvent) => {
                    if (e.pointerId !== pointer) return;
                    const bounds = app.canvas.getBoundingClientRect();
                    const dx =
                      ((e.clientX - bounds.left) * app.screen.width) /
                        bounds.width -
                      origin.x;
                    const dy =
                      ((e.clientY - bounds.top) * app.screen.height) /
                        bounds.height -
                      origin.y;
                    moved ||= Math.hypot(dx, dy) > 3;
                    if (!moved) return;
                    const delta = groundDelta(dx, dy, scale);
                    destination = {
                      x: Math.round(v.x + delta.x),
                      y: Math.round(v.y + delta.y),
                      floor: v.floor,
                    };
                    const issues = placeVenue(
                      props.current.layout,
                      v,
                      destination,
                    ).errors;
                    c.position.set(dx / scale, dy / scale);
                    labelGroup.position.set(dx / scale, dy / scale);
                    c.alpha = issues.length ? 0.5 : 0.8;
                    preview.clear();
                    const outline: [number, number, number][] = [
                      [destination.x, destination.y, 0.2],
                      [destination.x + v.w, destination.y, 0.2],
                      [destination.x + v.w, destination.y + v.h, 0.2],
                      [destination.x, destination.y + v.h, 0.2],
                      [destination.x, destination.y, 0.2],
                    ];
                    const color = issues.length ? 0xc44931 : 0x238765;
                    new Draw(preview)
                      .poly(outline, color, 0.25)
                      .line(outline, color, 2 / scale);
                    setDragFeedback({
                      text:
                        issues[0] ??
                        `Release to place ${v.name} · Esc to cancel`,
                      invalid: !!issues.length,
                    });
                  };
                  const finish = (commit: boolean) => {
                    window.removeEventListener("pointermove", update);
                    window.removeEventListener("pointerup", release);
                    window.removeEventListener("pointercancel", abort);
                    window.removeEventListener("keydown", keyboard);
                    app.canvas.removeEventListener("lostpointercapture", abort);
                    if (app.canvas.hasPointerCapture(pointer))
                      app.canvas.releasePointerCapture(pointer);
                    cancelDrag = null;
                    (app as any).dragging = false;
                    app.canvas.style.cursor = "";
                    c.alpha = 1;
                    setDragFeedback(null);
                    setHover(null);
                    if (commit) {
                      props.current.onSelect(v.id);
                      if (moved) props.current.onMove(v.id, destination);
                    }
                    render();
                  };
                  const release = (e: PointerEvent) => {
                    if (e.pointerId === pointer) {
                      update(e);
                      finish(true);
                    }
                  };
                  const abort = (e: PointerEvent) => {
                    if (e.pointerId === pointer) finish(false);
                  };
                  const keyboard = (e: KeyboardEvent) => {
                    if (e.key === "Escape") finish(false);
                  };
                  cancelDrag = () => finish(false);
                  window.addEventListener("pointermove", update);
                  window.addEventListener("pointerup", release);
                  window.addEventListener("pointercancel", abort);
                  window.addEventListener("keydown", keyboard);
                  app.canvas.addEventListener("lostpointercapture", abort);
                });
              };
              bindTarget(c);
              if (
                selected ||
                (v.movable && p.editable) ||
                isLandmark(v) ||
                (!p.both && SHORT[v.id])
              ) {
                const q = project(v.x + v.w / 2, v.y + v.h / 2, height + 2);
                const text = label(
                  labelGroup,
                  (v.movable && p.editable ? "↔ " : "") +
                    (BASELINE.venues.find((b) => b.id === v.id)?.name === v.name
                      ? (SHORT[v.id] ?? v.name)
                      : v.name),
                  q.x,
                  q.y - 5,
                  Math.max(4.6, 10 / scale),
                  selected ? 0x183d42 : 0x31494d,
                  "700",
                );
                const w = text.width + 8,
                  h = text.height + 5;
                const plate = new Graphics()
                  .roundRect(q.x - w / 2, q.y - 5 - h / 2, w, h, 2.5)
                  .fill({ color: selected ? 0xffe5a3 : 0xf9f5e8, alpha: 0.96 })
                  .stroke({ color: 0xb5b49f, width: 0.3 });
                labelGroup.addChildAt(plate, 0);
                labelGroup.hitArea = new Rectangle(
                  q.x - w / 2,
                  q.y - 5 - h / 2,
                  w,
                  h,
                );
                labelGroup.interactiveChildren = false;
                bindTarget(labelGroup);
              }
            }
            for (const e of p.layout.edges.filter((e) => {
              const a = p.layout.nodes.find((n) => n.id === e.from)!,
                b = p.layout.nodes.find((n) => n.id === e.to)!;
              return a.floor !== b.floor;
            })) {
              const node = p.layout.nodes.find(
                (n) => n.id === (pane.floor === 1 ? e.from : e.to),
              )!;
              const g = new Graphics(),
                d = new Draw(g);
              g.zIndex = node.x + node.y + 5;
              models.addChild(g);
              if (e.accessible) {
                d.box(node.x - 2, node.y - 2, 4, 4, 0, 4, 0x92aba7, 0xd7dfd2);
                d.windows(node.x - 2, node.y - 2, 4, 4, 0);
              } else
                for (let i = 0; i < 6; i++)
                  d.box(
                    node.x - 2,
                    node.y - 3 + i,
                    4,
                    1,
                    0,
                    0.25 + i * 0.45,
                    0x8b9489,
                    0xc8c6b0,
                  );
              const q = project(node.x, node.y, 6);
              const b = new Graphics()
                .roundRect(q.x - 5, q.y - 4, 10, 8, 2)
                .fill(0x315d61);
              overlay.addChild(b);
              label(overlay, "↕", q.x, q.y, 7, 0xffffff, "700");
              b.eventMode = "static";
              b.cursor = "pointer";
              b.on("pointertap", () =>
                props.current.onFloor(pane.floor === 1 ? 2 : 1),
              );
            }
            for (const [i, a] of visitors
              .filter((a) => a.floor === pane.floor)
              .entries()) {
              const q = project(
                  a.x + ((i % 3) - 1) * 0.8,
                  a.y + ((i % 5) - 2) * 0.6,
                  0.3,
                ),
                g = new Graphics();
              g.ellipse(q.x + 1, q.y + 1, 1.6, 0.7).fill({
                color: 0x234952,
                alpha: 0.25,
              });
              g.roundRect(q.x - 0.65, q.y - 2, 1.3, 2.1, 0.4).fill(
                a.state === "waiting"
                  ? 0xc9673c
                  : [0x2d6d79, 0x925442, 0x465e4f][i % 3],
              );
              g.circle(q.x, q.y - 2.7, 0.7).fill(0xd6b28c);
              g.zIndex = a.x + a.y + 1;
              g.hitArea = new Rectangle(q.x - 3, q.y - 5, 6, 8);
              g.eventMode = "static";
              g.cursor = "pointer";
              g.on("pointertap", () => props.current.onGuest(a.id));
              models.addChild(g);
            }
            world.addChild(overlay);
          }
        };
        render();
        resize = new ResizeObserver(() => {
          app.resize();
          render();
        });
        resize.observe(host.current!);
        (app as any).redraw = render;
      });
    return () => {
      cancelDrag?.();
      dead = true;
      resize?.disconnect();
      appRef.current = null;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);
  useEffect(() => {
    (appRef.current as any)?.redraw?.();
  }, [p]);
  function zoom(by: number) {
    camera.current.zoom = Math.max(0.8, Math.min(3, camera.current.zoom * by));
    (appRef.current as any)?.redraw?.();
  }
  return (
    <div className={`map-shell ${p.both ? "two-floor" : "single-floor"}`}>
      <div
        className="map-canvas"
        ref={host}
        aria-label={
          p.both
            ? "PIER 39 both levels interactive isometric map"
            : `PIER 39 level ${p.floor} interactive isometric map`
        }
      />
      <div className="map-context">
        <span>◈ SAN FRANCISCO BAY</span>
        <small>
          {p.both ? "Two floors, shown separately" : "Illustrated place view"} ·
          schematic geometry
        </small>
      </div>
      <div className="map-navigation">
        <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
          ＋
        </button>
        <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
          −
        </button>
        <button
          aria-label="Fit pier to view"
          onClick={() => {
            camera.current = { zoom: 1, x: 0, y: 0 };
            (appRef.current as any)?.redraw?.();
          }}
        >
          Fit
        </button>
      </div>
      <div
        className={`map-hint ${dragFeedback?.invalid ? "invalid" : ""}`}
        role={dragFeedback ? "status" : undefined}
      >
        {dragFeedback?.text ??
          hover ??
          (p.editable
            ? "Drag a highlighted object or its label · drag water to pan"
            : "Select a place or visitor · drag water to pan")}
      </div>
    </div>
  );
}
