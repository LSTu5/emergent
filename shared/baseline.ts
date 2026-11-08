import {
  CONTRACT_VERSION,
  type Layout,
  type Venue,
  type Category,
  type Floor,
  type PathNode,
  type PathEdge,
} from "./contracts";
export const MAP_SOURCE =
  "https://www.pier39.com/wp-content/uploads/2026/02/P39-PIER-Map-for-Website-2026.pdf";
const defaults: Record<Category, Partial<Venue>> = {
  restaurant: {
    capacity: 64,
    dwellMin: 40,
    dwellMax: 75,
    spendMin: 2400,
    spendMax: 4800,
    purchaseProbability: 1,
    open: 660,
    close: 1260,
  },
  cafe: {
    capacity: 14,
    dwellMin: 5,
    dwellMax: 18,
    spendMin: 600,
    spendMax: 1600,
    purchaseProbability: 0.9,
    open: 600,
    close: 1200,
  },
  shop: {
    capacity: 20,
    dwellMin: 5,
    dwellMax: 20,
    spendMin: 800,
    spendMax: 4500,
    purchaseProbability: 0.34,
    open: 600,
    close: 1200,
  },
  attraction: {
    capacity: 30,
    dwellMin: 12,
    dwellMax: 35,
    spendMin: 1200,
    spendMax: 2600,
    purchaseProbability: 1,
    open: 600,
    close: 1200,
  },
  viewpoint: {
    capacity: 80,
    dwellMin: 8,
    dwellMax: 24,
    spendMin: 0,
    spendMax: 0,
    purchaseProbability: 0,
    open: 600,
    close: 1260,
  },
  seating: {
    capacity: 12,
    dwellMin: 5,
    dwellMax: 15,
    spendMin: 0,
    spendMax: 0,
    purchaseProbability: 0,
    open: 600,
    close: 1260,
  },
  event: {
    capacity: 45,
    dwellMin: 12,
    dwellMax: 25,
    spendMin: 0,
    spendMax: 0,
    purchaseProbability: 0,
    open: 660,
    close: 1140,
  },
};
export function categoryDefaults(c: Category) {
  return { ...defaults[c] };
}
const nodes: PathNode[] = [];
const edges: PathEdge[] = [];
for (const floor of [1, 2] as Floor[]) {
  for (let row = 0; row <= 10; row++)
    nodes.push({ id: `f${floor}-${row}`, floor, x: 76, y: 290 - row * 24 });
  for (let row = 0; row < 10; row++)
    edges.push({
      id: `walk-${floor}-${row}`,
      from: `f${floor}-${row}`,
      to: `f${floor}-${row + 1}`,
      width: floor === 1 ? 12 : 8,
      enabled: true,
      structural: false,
      accessible: true,
    });
}
// Parallel promenade paths allow practical rerouting without moving buildings.
for (const floor of [1, 2] as Floor[]) {
  for (let row = 0; row <= 10; row++)
    nodes.push({ id: `west-${floor}-${row}`, floor, x: 63, y: 290 - row * 24 });
  for (let row = 0; row < 10; row++)
    edges.push({
      id: `promenade-${floor}-${row}`,
      from: `west-${floor}-${row}`,
      to: `west-${floor}-${row + 1}`,
      width: 3,
      enabled: true,
      structural: false,
      accessible: true,
    });
  for (const row of [0, 2, 4, 6, 8, 10])
    edges.push({
      id: `cross-${floor}-${row}`,
      from: `f${floor}-${row}`,
      to: `west-${floor}-${row}`,
      width: 3,
      enabled: true,
      structural: false,
      accessible: true,
    });
}
nodes.push({ id: "entry", floor: 1, x: 76, y: 312, label: "Entrance plaza" });
edges.push({
  id: "entrance",
  from: "entry",
  to: "f1-0",
  width: 18,
  enabled: true,
  structural: true,
  accessible: true,
});
for (const row of [0, 4, 8, 10])
  edges.push({
    id: `stairs-${row}`,
    from: `f1-${row}`,
    to: `f2-${row}`,
    width: 3,
    enabled: true,
    structural: true,
    accessible: row === 0 || row === 8,
  });
let venues: Venue[] = [];
function add(
  id: string,
  name: string,
  category: Category,
  floor: Floor,
  row: number,
  side: "w" | "e",
  zone: string,
  extra: Partial<Venue> = {},
) {
  const x = side === "w" ? 23 : 94,
    y = 278 - row * 24;
  const nodeId = `door-${id}`;
  nodes.push({ id: nodeId, x: side === "w" ? 58 : 94, y: y + 9, floor });
  edges.push({
    id: `access-${id}`,
    from: `f${floor}-${row}`,
    to: nodeId,
    width: 5,
    enabled: true,
    structural: true,
    accessible: true,
  });
  venues.push({
    id,
    name,
    category,
    floor,
    x,
    y,
    w: 35,
    h: 18,
    zone,
    nodeId,
    movable: false,
    capacity: 20,
    dwellMin: 5,
    dwellMax: 20,
    spendMin: 0,
    spendMax: 0,
    purchaseProbability: 0,
    open: 600,
    close: 1260,
    areaM2: 110,
    signage: 1,
    eventStarts: [],
    source: MAP_SOURCE,
    ...defaults[category],
    ...extra,
  });
}
add("wipeout", "Wipeout Bar & Grill", "restaurant", 1, 0, "w", "A-1");
add("hard-rock", "Hard Rock Cafe", "restaurant", 1, 0, "e", "Q-1");
add(
  "souvenirs-south",
  "Entrance gifts & apparel",
  "shop",
  1,
  1,
  "w",
  "B-1 / D-1",
);
add("aquarium", "Aquarium of the Bay", "attraction", 1, 1, "e", "R-1", {
  dwellMin: 45,
  dwellMax: 75,
  spendMin: 3000,
  spendMax: 3800,
  capacity: 90,
});
add("sweet-treats", "Chocolate & sweet shops", "cafe", 1, 2, "w", "D-1");
add("east-retail", "East-side gifts & boutiques", "shop", 1, 2, "e", "P-1");
add("specialty-west", "West-side specialty shops", "shop", 1, 3, "w", "E-1");
add("musical-stairs", "Musical stairs", "viewpoint", 1, 3, "e", "O-1", {
  capacity: 15,
  dwellMin: 3,
  dwellMax: 8,
});
add("pier-market", "Pier Market Seafood", "restaurant", 1, 4, "w", "F-1");
add("north-retail", "Apparel & local gifts", "shop", 1, 4, "e", "N-1");
add("sf-socks", "SF Sock Market & neighbors", "shop", 1, 5, "w", "G-1");
add("bay-plunge", "The Bay Plunge", "attraction", 1, 6, "w", "H-1", {
  capacity: 12,
  dwellMin: 5,
  dwellMax: 10,
  spendMin: 1200,
  spendMax: 1200,
});
add("west-gifts", "West promenade gifts", "shop", 1, 7, "w", "I-1 / J-1");
add("carousel", "San Francisco Carousel", "attraction", 1, 9, "e", "Bay end", {
  capacity: 24,
  dwellMin: 5,
  dwellMax: 8,
  spendMin: 1000,
  spendMax: 1000,
});
add("christmas", "Christmas in San Francisco", "shop", 1, 8, "w", "K-1");
add("7d", "7D Experience", "attraction", 1, 7, "e", "M-1", {
  capacity: 20,
  dwellMin: 10,
  dwellMax: 15,
});
add("sea-lions", "Sea lion viewing", "viewpoint", 1, 9, "w", "K Dock", {
  capacity: 100,
  areaM2: 200,
});
add(
  "players",
  "Players Sports Grill & Arcade",
  "restaurant",
  1,
  8,
  "e",
  "L-1 / M-1",
);
add("bay-stage", "Bay End Stage", "event", 1, 10, "e", "Bay end", {
  eventStarts: [690, 750, 810, 870, 930, 990, 1050, 1110],
});
add("bay-lookout", "Bay panorama", "viewpoint", 1, 10, "w", "Bay end", {
  capacity: 40,
});
add("fog-harbor", "Fog Harbor Fish House", "restaurant", 2, 0, "w", "A-2");
add("flyer", "The Flyer & escape rooms", "attraction", 2, 0, "e", "Q-2", {
  dwellMin: 20,
  dwellMax: 45,
});
add("eagle", "Eagle Cafe", "restaurant", 2, 1, "w", "A-2", {
  open: 600,
  spendMin: 1800,
  spendMax: 3500,
});
add("taco", "Taco Cantina", "restaurant", 2, 1, "e", "P-2", {
  spendMin: 1800,
  spendMax: 3200,
});
add("crab-house", "Crab House", "restaurant", 2, 2, "w", "C-2", {
  spendMin: 3500,
  spendMax: 6500,
});
add("mirror-maze", "Magowan’s Mirror Maze", "attraction", 2, 3, "e", "O-2", {
  spendMin: 1000,
  spendMax: 1000,
  dwellMin: 10,
  dwellMax: 20,
});
add("spice-tea", "Spice & Tea Exchange", "shop", 2, 3, "w", "E-2");
add("swiss-louis", "Swiss Louis", "restaurant", 2, 5, "w", "G-2");
add("upper-gifts", "Upper-level specialty shops", "shop", 2, 6, "e", "N-2");
add("scrumptious", "Scrumptious & neighbors", "shop", 2, 6, "w", "H-2 / J-2");
add("upper-sealions", "Upper sea lion viewing", "viewpoint", 2, 8, "w", "K-2");
add("bubba-gump", "Bubba Gump Shrimp Co.", "restaurant", 2, 8, "e", "M-2", {
  capacity: 90,
});
add("fire-ice", "Fire + Ice", "restaurant", 2, 9, "e", "M-2", { capacity: 70 });
// Movable amenity/kiosk locations are explicit planning assumptions, not claimed surveyed objects.
venues.push({
  id: "snack-kiosk",
  name: "Promenade snack kiosk",
  category: "cafe",
  floor: 1,
  x: 65,
  y: 181,
  w: 4,
  h: 6,
  zone: "Planning assumption",
  nodeId: "f1-4",
  movable: true,
  areaM2: 6,
  capacity: 8,
  dwellMin: 4,
  dwellMax: 8,
  spendMin: 500,
  spendMax: 1000,
  purchaseProbability: 0.9,
  open: 660,
  close: 1140,
  signage: 1,
  eventStarts: [],
  source: "Assumed movable kiosk for planning",
});
venues.push({
  id: "bay-seating",
  name: "Bay-side seating",
  category: "seating",
  floor: 1,
  x: 83,
  y: 60,
  w: 6,
  h: 6,
  zone: "Planning assumption",
  nodeId: "f1-9",
  movable: true,
  areaM2: 8,
  capacity: 12,
  dwellMin: 5,
  dwellMax: 15,
  spendMin: 0,
  spendMax: 0,
  purchaseProbability: 0,
  open: 600,
  close: 1260,
  signage: 1,
  eventStarts: [],
  source: "Assumed movable amenity for planning",
});
export const BASELINE: Layout = {
  parking: { enabled: true, spaces: 976 },
  version: CONTRACT_VERSION,
  id: "pier39-current",
  revision: 1,
  name: "Current PIER 39",
  description:
    "Schematic of the published 2026 directory. Dimensions, connections and operating parameters are approximations; smaller tenants are grouped.",
  venues,
  nodes,
  edges,
  sources: [
    {
      label: "Official 2026 directory",
      url: MAP_SOURCE,
      checked: "2026-11-08",
    },
    {
      label: "Published opening hours",
      url: "https://www.pier39.com/pier-info/address-hours/",
      checked: "2026-11-08",
    },
    {
      label:
        "Operator leasing facts · 2023 annual visitors and 976-space garage",
      url: "https://www.pier39.com/leasing/",
      checked: "2026-11-08",
    },
  ],
};
