import { Container, Graphics } from "pixi.js";
import type { Layout, Venue, Floor } from "../../../shared/contracts";
import { Draw, hash, shade, label } from "./drawing";
import { project, type V3 } from "./projection";
export const COLORS: Record<string, number> = {
  restaurant: 0xc47c4f,
  cafe: 0xc49a47,
  shop: 0x537e8a,
  attraction: 0x8a719d,
  viewpoint: 0x488d79,
  seating: 0x759666,
  event: 0xae8a52,
};
export const SHORT: Record<string, string> = {
  wipeout: "Wipeout",
  "hard-rock": "Hard Rock Cafe",
  aquarium: "Aquarium of the Bay",
  "pier-market": "Pier Market",
  "sea-lions": "Sea lion viewing",
  carousel: "Carousel",
  "bay-stage": "Bay End Stage",
  "bay-plunge": "The Bay Plunge",
  players: "Players Grill",
  "7d": "7D Experience",
  "fog-harbor": "Fog Harbor",
  eagle: "Eagle Cafe",
  "crab-house": "Crab House",
  taco: "Taco Cantina",
  "swiss-louis": "Swiss Louis",
  "bubba-gump": "Bubba Gump",
  "fire-ice": "Fire + Ice",
  flyer: "The Flyer",
  "upper-sealions": "Sea lion overlook",
  "mirror-maze": "Mirror Maze",
  christmas: "Christmas shops",
  "bay-lookout": "Bay panorama",
};
const major = new Set([
  "sea-lions",
  "carousel",
  "pier-market",
  "aquarium",
  "fog-harbor",
  "crab-house",
  "bubba-gump",
  "upper-sealions",
]);
export const isLandmark = (v: Venue) => major.has(v.id);
function boat(d: Draw, x: number, y: number, color = 0xf3eee0) {
  d.poly(
    [
      [x, y - 6, 0],
      [x + 2, y - 3, 0],
      [x + 2, y + 5, 0],
      [x, y + 7, 0],
      [x - 2, y + 5, 0],
      [x - 2, y - 3, 0],
    ],
    0x234d59,
    0.3,
  );
  d.poly(
    [
      [x, y - 7, 0.6],
      [x + 2, y - 3, 0.6],
      [x + 2, y + 5, 0.6],
      [x, y + 7, 0.6],
      [x - 2, y + 5, 0.6],
      [x - 2, y - 3, 0.6],
    ],
    color,
  );
  d.box(x - 1, y - 2, 2, 5, 0.6, 1, 0xe4dfcd, 0x477783);
  d.line(
    [
      [x, y, 1],
      [x, y, 7],
    ],
    0xe7e8dc,
    0.3,
  );
  d.poly(
    [
      [x, y, 6.8],
      [x, y + 4, 1.5],
      [x + 0.15, y, 1.5],
    ],
    0xf7f1dd,
    0.9,
  );
}
export function environment(
  world: Container,
  layout: Layout,
  floor: Floor,
  scale: number,
) {
  const g = new Graphics(),
    d = new Draw(g);
  world.addChild(g);
  // Ground-floor context follows the directory's west/east marina and K Dock arrangement.
  if (floor === 1) {
    d.box(-23, 105, 30, 2, -0.8, 0.8, 0x84765e, 0xb7a386);
    d.box(-23, 105, 2, 147, -0.8, 0.8, 0x84765e, 0xb7a386);
    for (let y = 117; y < 245; y += 22) {
      d.box(-23, y, 20, 1, -0.6, 0.6, 0x9b876b);
      boat(d, -13, y + 8);
      boat(d, -4, y + 8);
    }
    d.box(149, 92, 2, 185, -0.8, 0.8, 0x86755c, 0xb7a386);
    for (let y = 105; y < 270; y += 23) {
      d.box(150, y, 20, 1, -0.6, 0.6, 0xa18d70);
      boat(d, 157, y + 8);
      boat(d, 167, y + 8);
    }
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++) {
        const x = -25 + col * 13,
          y = 52 + row * 10;
        d.box(x, y, 11, 7, -0.5, 0.7, 0x8d795e, 0xc6b18a);
        for (let n = 0; n < 4; n++) {
          const q = project(x + 2 + n * 2, y + 2 + (n % 2) * 2, 0.4);
          g.ellipse(q.x, q.y, 1.7, 0.8).fill(n % 2 ? 0x6d5845 : 0x8e7457);
          g.circle(q.x + 1.35, q.y - 0.5, 0.6).fill(0x6d5845);
        }
      }
    const kd = project(-15, 42);
    label(
      world,
      "K DOCK · SEA LIONS",
      kd.x,
      kd.y,
      Math.max(3.1, 9 / scale),
      0x335f69,
      "700",
    );
  }
  // Upper galleries follow the circulation spine and tenant bays, rather than
  // duplicating the entire ground-floor slab. All actual routes remain on deck.
  const terraces = [38, 110, 182, 230].filter(
    (y) =>
      !layout.venues.some(
        (v) =>
          v.floor === 2 &&
          v.x < 130 &&
          v.x + v.w > 91 &&
          v.y < y + 15 &&
          v.y + v.h > y,
      ),
  );
  const deck = (x: number, y: number, w: number, h: number) => {
    d.box(x, y, w, h, -3, 3, 0x74604c, 0xc6ad86);
    for (let py = y + 1; py < y + h; py += 2.1)
      d.line(
        [
          [x, py, 0.08],
          [x + w, py, 0.08],
        ],
        0xb39a78,
        0.35,
        0.65,
      );
  };
  if (floor === 1) {
    deck(8, 22, 138, 280);
    d.rail(8, 22, 1, 280);
    d.rail(145, 22, 1, 280);
    d.rail(8, 22, 138, 1);
    d.rail(8, 301, 58, 1);
    d.rail(86, 301, 60, 1);
    d.box(66, 300, 20, 13, -1, 1, 0xbaa580, 0xd8c29c);
    for (let y = 30; y < 300; y += 15) {
      d.box(8, y, 1, 1, -4, 4, 0x594b3d);
      d.box(145, y, 1, 1, -4, 4, 0x594b3d);
    }
  } else {
    const bays = layout.venues.filter((v) => v.floor === 2);
    for (const v of bays) {
      // A bay includes its connection to the promenade, including edited amenities.
      const left = Math.min(v.x, 58),
        right = Math.max(v.x + v.w, 94);
      if (left < 58) deck(left, v.y, 58 - left, v.h);
      if (right > 94) deck(94, v.y, right - 94, v.h);
      d.rail(v.x < 76 ? left : right, v.y, 0.5, v.h);
    }
    for (const y of terraces) deck(94, y, 36, 15);
    deck(58, 22, 36, 280);
    for (const x of [58, 94]) {
      let start: number | null = null;
      for (let y = 22; y <= 302; y++) {
        const opening =
          bays.some(
            (v) =>
              v.y <= y &&
              v.y + v.h >= y &&
              (x === 58 ? v.x < 58 : v.x + v.w > 94),
          ) ||
          (x === 94 && terraces.some((t) => t <= y && t + 15 >= y));
        if (!opening && y < 302) start ??= y;
        else if (start !== null) {
          d.rail(x, start, 0.5, y - start);
          start = null;
        }
      }
    }
    d.rail(58, 22, 36, 0.5);
    d.rail(58, 301, 36, 0.5);
  }
  if (floor === 2) {
    // Visible open terraces distinguish the upper promenade from enclosed tenant spaces.
    for (const y of terraces) {
      d.box(91, y, 39, 15, 0.1, 0.25, 0xbaa687, 0xd8c8a6);
      d.rail(129, y, 1, 15, 0.4);
      for (let x = 98; x < 126; x += 11) {
        d.cylinder(x, y + 8, 2.2, 0.5, 0.9, 0x85745c);
        d.line(
          [
            [x, y + 8, 1.5],
            [x, y + 8, 4],
          ],
          0x75604e,
          0.25,
        );
        d.cone(x, y + 8, 3.5, 3.6, 1.2, [0xe9d7a8, 0xd8c395]);
      }
    }
  }
  // Street and entrance are visual context, not an additional arrival model.
  if (floor === 1) {
    d.box(0, 306, 160, 23, -1, 0.5, 0x98988c, 0xb5b4a7);
    for (let x = 4; x < 157; x += 9)
      d.line(
        [
          [x, 318, 0],
          [x + 4, 318, 0],
        ],
        0xece8d5,
        0.6,
      );
    for (let x = 65; x < 89; x += 3)
      d.poly(
        [
          [x, 306, 0.1],
          [x + 1.5, 306, 0.1],
          [x + 1.5, 315, 0.1],
          [x, 315, 0.1],
        ],
        0xf0e9d4,
      );
  }
  const e = project(76, 320);
  label(
    world,
    floor === 1
      ? "THE EMBARCADERO · ENTRANCE PLAZA"
      : "LEVEL 2 · UPPER PROMENADE",
    e.x,
    e.y + 10,
    Math.max(3.3, 10 / scale),
    0x315964,
    "700",
  );
  // Lamps and planters are illustrative furnishings, not new simulated venues.
  for (const y of [57, 129, 201, 273]) {
    d.box(85, y, 3, 3, 0.1, 0.8, 0x82755b, 0x4f7253);
    const a = project(86.5, y + 1.5, 1.4);
    g.circle(a.x, a.y, 1.6).fill(0x4d7959);
    d.line(
      [
        [70, y, 0],
        [70, y, 4.5],
      ],
      0x394c48,
      0.25,
    );
    d.box(69.2, y - 0.6, 1.6, 1.2, 4.3, 0.6, 0x414b43, 0xf1dfaf);
  }
}
export function venueGraphic(
  v: Venue,
  selected: boolean,
  heat: string,
  ratio: number,
): { container: Container; height: number } {
  const c = new Container(),
    g = new Graphics(),
    d = new Draw(g);
  c.addChild(g);
  const x = v.x,
    y = v.y,
    w = v.w,
    h = v.h;
  let top = 7;
  const ring: V3[] = [
    [x, y, 0.2],
    [x + w, y, 0.2],
    [x + w, y + h, 0.2],
    [x, y + h, 0.2],
    [x, y, 0.2],
  ];
  d.poly(
    [
      [x + 3, y + 4, 0],
      [x + w + 4, y + 4, 0],
      [x + w + 4, y + h + 5, 0],
      [x + 3, y + h + 5, 0],
    ],
    0x29484b,
    0.17,
  );
  if (v.category === "viewpoint" || v.category === "seating") {
    top = 2;
    d.box(x, y, w, h, 0, 0.5, 0xa99777, 0xd0ba94);
    d.rail(x, y, w, h, 0.5);
    if (v.id === "musical-stairs") {
      for (let i = 0; i < 9; i++) {
        d.box(
          x + 5,
          y + 2 + i * 1.3,
          w - 10,
          1.3,
          0.4,
          i * 0.3,
          0xa9997d,
          i % 2 ? 0xe6e1d1 : 0x434b4d,
        );
      }
    } else
      for (let i = x + 3; i < x + w - 2; i += 8) {
        d.box(i, y + h - 4, 5, 1.5, 0.5, 0.7, 0x6e5c49, 0x9b805b);
        d.box(i, y + h - 4, 5, 0.35, 1.2, 0.65, 0x9b805b);
      }
  } else if (v.id === "carousel") {
    top = 10;
    const cx = x + w / 2,
      cy = y + h / 2,
      r = Math.min(w, h) / 2 - 1;
    d.cylinder(cx, cy, r, 0, 0.8, 0xbba783);
    for (const [px, py] of d.ring(cx, cy, r * 0.78, 0.8, 12)) {
      d.line(
        [
          [px, py, 0.8],
          [px, py, 5.2],
        ],
        0xb99851,
        0.22,
      );
      d.box(px - 0.4, py - 0.4, 0.8, 0.8, 1.3, 0.8, 0xeee1c2);
    }
    d.cylinder(cx, cy, r, 4.9, 0.6, 0x864f36);
    d.cone(cx, cy, r + 0.6, 5.5, 3.5, [0x9c4939, 0xf0d9aa]);
    d.line(
      [
        [cx, cy, 8],
        [cx, cy, 10],
      ],
      0xc99b45,
      0.3,
    );
  } else if (v.id === "bay-plunge") {
    top = 12;
    const cx = x + w / 2,
      cy = y + h / 2;
    d.cylinder(cx, cy, 7, 0, 0.6, 0x516a6d);
    d.box(cx - 1, cy - 1, 2, 2, 0.6, 11, 0xa2b5b7, 0xd9d6bf);
    d.cylinder(cx, cy, 5, 7, 1.3, 0x8b6341);
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2;
      d.box(
        cx + Math.cos(t) * 4 - 0.5,
        cy + Math.sin(t) * 4 - 0.5,
        1,
        1,
        8.2,
        0.7,
        0xc3ac6b,
      );
    }
  } else if (v.category === "event") {
    top = 7;
    d.box(x + 1, y + 2, w - 2, h - 3, 0, 1, 0x78624e, 0xae9270);
    d.box(x + 3, y + 2, w - 6, 3, 1, 5, 0x6a8378, 0x465f59);
    d.poly(
      [
        [x + 5, y + 5, 1],
        [x + w - 5, y + 5, 1],
        [x + w - 5, y + 5, 5.5],
        [x + 5, y + 5, 5.5],
      ],
      0x233d42,
    );
    d.gable(x + 1, y, w - 2, 7, 6, 2, 0x728b7e);
  } else if (v.movable) {
    top = 4.4;
    d.box(x, y, w, h, 0, 3, 0xd6bc90, 0x716e5f);
    for (let i = 0; i < 6; i++)
      d.poly(
        [
          [x + (i * w) / 6, y + h, 2.9],
          [x + ((i + 1) * w) / 6, y + h, 2.9],
          [x + ((i + 1) * w) / 6, y + h + 1, 2.4],
          [x + (i * w) / 6, y + h + 1, 2.4],
        ],
        i % 2 ? 0xefdbac : 0x8f4e40,
      );
    d.box(x + 0.4, y + 0.4, w - 0.8, h - 0.8, 3, 0.45, 0x64796c);
    d.windows(x, y, w, h, 0);
  } else {
    const wall = [0xb99473, 0xd6c6a2, 0x90a39c, 0xc1a68c, 0xb9afa0][
        Math.floor(hash(v.id) * 5)
      ],
      roof = [0x687b70, 0x934f40, 0x6d7372, 0x8e795d][
        Math.floor(hash(v.id + "roof") * 4)
      ];
    const clusters =
      v.category === "shop" &&
      v.name.match(/shops|gifts|neighbors|apparel|boutiques/i);
    const count = clusters ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const xx = x + (i * w) / count + 0.5,
        ww = w / count - 1,
        hh = h - 1;
      d.box(xx, y + 0.5, ww, hh, 0, 4.8, shade(wall, 1 - i * 0.035), roof);
      d.windows(xx, y + 0.5, ww, hh, 0);
      for (let yy = 1; yy < 5; yy += 0.7)
        d.line(
          [
            [xx, y + h - 0.5, yy],
            [xx + ww, y + h - 0.5, yy],
          ],
          shade(wall, 0.65),
          0.12,
          0.6,
        );
      if (v.id === "aquarium")
        d.box(xx, y + 0.5, ww, hh, 4.8, 1, 0x627e89, 0x9db6bb);
      else d.gable(xx - 0.3, y + 0.2, ww + 0.6, hh + 0.6, 4.8, 2.8, roof);
      for (let j = 0; j < Math.floor(ww / 3); j++)
        d.poly(
          [
            [xx + j * 3, y + h - 0.4, 3.1],
            [xx + j * 3 + 2.8, y + h - 0.4, 3.1],
            [xx + j * 3 + 2.8, y + h + 1, 2.7],
            [xx + j * 3, y + h + 1, 2.7],
          ],
          j % 2 ? 0xe2d3ae : shade(roof, 1.25),
        );
    }
    if (v.id === "aquarium") {
      const q = project(x + w / 2, y + h / 2, 6.2);
      g.ellipse(q.x, q.y, 5, 2).fill(0x328695);
      g.poly([q.x + 4, q.y, q.x + 7, q.y - 2, q.x + 7, q.y + 2]).fill(0x328695);
    }
  }
  // Category stripe provides land-use information without painting whole buildings as flat blocks.
  d.line(
    [
      [x, y + h + 0.5, 0.3],
      [x + w, y + h + 0.5, 0.3],
    ],
    COLORS[v.category],
    1.1,
  );
  if (heat === "landuse") d.poly(ring.slice(0, 4), COLORS[v.category], 0.35);
  if (heat === "spending" || heat === "occupancy")
    d.poly(
      ring.slice(0, 4),
      ratio > 0.65 ? 0xd65e40 : ratio > 0.3 ? 0xe1a14f : 0xe5d594,
      0.2 + 0.5 * Math.min(1, ratio),
    );
  if (selected) d.line(ring, 0xffdf88, 1.5);
  return { container: c, height: top };
}
