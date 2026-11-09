import { Container, Graphics, Text } from "pixi.js";
import { project, type V3 } from "./projection";
export const shade = (c: number, f: number) =>
  (Math.min(255, Math.round((c >> 16) * f)) << 16) |
  (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) |
  Math.min(255, Math.round((c & 255) * f));
export const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};
export class Draw {
  constructor(readonly g: Graphics) {}
  flat(points: V3[]) {
    return points.flatMap(([x, y, z]) => {
      const p = project(x, y, z);
      return [p.x, p.y];
    });
  }
  poly(points: V3[], color: number, alpha = 1) {
    this.g.poly(this.flat(points)).fill({ color, alpha });
    return this;
  }
  line(points: V3[], color: number, width = 0.3, alpha = 1) {
    const a = this.flat(points);
    this.g.moveTo(a[0], a[1]);
    for (let i = 2; i < a.length; i += 2) this.g.lineTo(a[i], a[i + 1]);
    this.g.stroke({ color, width, alpha });
    return this;
  }
  box(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    height: number,
    wall: number,
    roof = wall,
  ) {
    this.poly(
      [
        [x, y + h, z],
        [x + w, y + h, z],
        [x + w, y + h, z + height],
        [x, y + h, z + height],
      ],
      shade(wall, 0.84),
    );
    this.poly(
      [
        [x + w, y + h, z],
        [x + w, y, z],
        [x + w, y, z + height],
        [x + w, y + h, z + height],
      ],
      shade(wall, 0.64),
    );
    this.poly(
      [
        [x, y, z + height],
        [x + w, y, z + height],
        [x + w, y + h, z + height],
        [x, y + h, z + height],
      ],
      roof,
    );
    return this;
  }
  gable(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    rise: number,
    color: number,
  ) {
    this.poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + h / 2, z + rise],
        [x, y + h / 2, z + rise],
      ],
      shade(color, 1.16),
    );
    this.poly(
      [
        [x + w, y, z],
        [x + w, y + h, z],
        [x + w, y + h / 2, z + rise],
      ],
      shade(color, 0.69),
    );
    this.poly(
      [
        [x, y + h, z],
        [x + w, y + h, z],
        [x + w, y + h / 2, z + rise],
        [x, y + h / 2, z + rise],
      ],
      color,
    );
    this.line(
      [
        [x, y + h / 2, z + rise],
        [x + w, y + h / 2, z + rise],
      ],
      shade(color, 1.45),
      0.35,
    );
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      this.line(
        [
          [x, y + h / 2 + (h / 2) * t, z + rise * (1 - t)],
          [x + w, y + h / 2 + (h / 2) * t, z + rise * (1 - t)],
        ],
        shade(color, 0.78),
        0.18,
      );
    }
  }
  ring(x: number, y: number, r: number, z: number, n = 20): V3[] {
    return Array.from({ length: n }, (_, i) => [
      x + Math.cos((i / n) * Math.PI * 2) * r,
      y + Math.sin((i / n) * Math.PI * 2) * r,
      z,
    ]);
  }
  cylinder(
    x: number,
    y: number,
    r: number,
    z: number,
    height: number,
    color: number,
  ) {
    const a = this.ring(x, y, r, z);
    for (let i = 0; i < a.length; i++) {
      const p = a[i],
        q = a[(i + 1) % a.length];
      this.poly(
        [p, q, [q[0], q[1], z + height], [p[0], p[1], z + height]],
        shade(color, 0.7 + 0.2 * Math.sin(i)),
      );
    }
    this.poly(this.ring(x, y, r, z + height), color);
  }
  cone(
    x: number,
    y: number,
    r: number,
    z: number,
    height: number,
    colors: number[],
  ) {
    const a = this.ring(x, y, r, z, 24);
    for (let i = 0; i < a.length; i++)
      this.poly(
        [a[i], a[(i + 1) % a.length], [x, y, z + height]],
        shade(colors[i % colors.length], 0.85 + 0.15 * Math.sin(i)),
      );
  }
  windows(x: number, y: number, w: number, h: number, z: number) {
    for (let i = 2; i < w - 2; i += 4) {
      this.poly(
        [
          [x + i, y + h, z + 1],
          [x + i + 2, y + h, z + 1],
          [x + i + 2, y + h, z + 3],
          [x + i, y + h, z + 3],
        ],
        0x37606b,
      );
      this.line(
        [
          [x + i, y + h, z + 3],
          [x + i + 2, y + h, z + 3],
        ],
        0xf5dfb0,
        0.25,
      );
    }
    for (let i = 2; i < h - 2; i += 4)
      this.poly(
        [
          [x + w, y + i, z + 1],
          [x + w, y + i + 2, z + 1],
          [x + w, y + i + 2, z + 3],
          [x + w, y + i, z + 3],
        ],
        0x284852,
      );
  }
  rail(x: number, y: number, w: number, h: number, z = 0) {
    const pts: V3[] = [
      [x, y, z + 1.2],
      [x + w, y, z + 1.2],
      [x + w, y + h, z + 1.2],
      [x, y + h, z + 1.2],
      [x, y, z + 1.2],
    ];
    this.line(pts, 0xe9ddc6, 0.55);
    for (let a = x; a <= x + w; a += 6) {
      this.line(
        [
          [a, y, z],
          [a, y, z + 1.2],
        ],
        0xd1c2a8,
        0.4,
      );
      this.line(
        [
          [a, y + h, z],
          [a, y + h, z + 1.2],
        ],
        0xd1c2a8,
        0.4,
      );
    }
  }
}
export function label(
  parent: Container,
  text: string,
  x: number,
  y: number,
  size: number,
  color = 0x183c45,
  weight: "500" | "700" = "500",
) {
  const t = new Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize: size,
      fontWeight: weight,
      fill: color,
      align: "center",
    },
  });
  t.resolution = 4;
  t.anchor.set(0.5);
  t.position.set(x, y);
  parent.addChild(t);
  return t;
}
