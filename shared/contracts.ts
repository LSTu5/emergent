export const CONTRACT_VERSION = "pier39.v2" as const;
export type Floor = 1 | 2;
export type Category =
  | "restaurant"
  | "cafe"
  | "shop"
  | "attraction"
  | "viewpoint"
  | "seating"
  | "event";
export type Provider = "local" | "rules" | "jev";
export interface Point {
  x: number;
  y: number;
  floor: Floor;
}
export interface PathNode extends Point {
  id: string;
  label?: string;
}
export interface PathEdge {
  id: string;
  from: string;
  to: string;
  width: number;
  enabled: boolean;
  structural: boolean;
  accessible: boolean;
}
export interface Venue extends Point {
  id: string;
  name: string;
  category: Category;
  zone: string;
  w: number;
  h: number;
  nodeId: string;
  movable: boolean;
  capacity: number;
  dwellMin: number;
  dwellMax: number;
  spendMin: number;
  spendMax: number;
  purchaseProbability: number;
  open: number;
  close: number;
  areaM2: number;
  signage: number;
  eventStarts: number[];
  source: string;
}
export interface ParkingConfig {
  spaces: number;
  enabled: boolean;
}
export interface Layout {
  parking?: ParkingConfig;
  scenario?: { question: string; tradeoff: string };
  version: typeof CONTRACT_VERSION;
  id: string;
  revision: number;
  name: string;
  description: string;
  venues: Venue[];
  nodes: PathNode[];
  edges: PathEdge[];
  sources: { label: string; url: string; checked: string }[];
}
export interface Config {
  carShare?: number;
  initialParkedVehicles?: number;
  parkingBufferMinutes?: number;
  provider: Provider;
  visitors: number;
  seed: string;
  day: "weekday" | "weekend";
  start: number;
  end: number;
  hourly: number[];
  speed: number;
}
export interface Profile {
  mode?: "car" | "walk-transit";
  mealIntent?: boolean;
  priorityStop?: string;
  id: string;
  groupId: string;
  purpose: string;
  size: number;
  budget: number;
  arrival: number;
  departure: number;
  interests: Record<Category, number>;
  hunger: number;
  fatigue: number;
  patience: number;
  familiarity: number;
  accessible: boolean;
}
export interface Agent extends Profile {
  ateOnVisit?: boolean;
  admitted?: boolean;
  meals?: { at: number; occasion: string; venueId: string }[];
  remaining: number;
  state:
    "pending" | "choosing" | "walking" | "waiting" | "visiting" | "departed";
  nodeId: string;
  position: Point;
  target: string | null;
  route: string[];
  remainingDwell: number;
  wait: number;
  visited: string[];
  spend: number;
  entered: number;
  left: number | null;
  decisions: number;
  history: { at: number; text: string; source: string }[];
  departing: boolean;
}
export interface VenueStats {
  visits: number;
  buyers: number;
  sales: number;
  occupancy: number;
  queue: number;
  dwellMinutes: number;
  waitMinutes: number;
  completed: number;
  abandoned: number;
  occupancyMinutes: number;
}
export interface Sale {
  at: number;
  venueId: string;
  groupId: string;
  people: number;
  cents: number;
  category: Category;
}
export interface DecisionInput {
  agentId: string;
  state: string;
  options: { id: string; label: string; weight: number }[];
}
export interface DecisionOutput {
  agentId: string;
  probabilities: number[];
  source: Provider;
  model: string;
}
export interface ProviderPort {
  name: Provider;
  decide(input: DecisionInput[]): Promise<DecisionOutput[]>;
}
export interface Snapshot {
  behaviorVersion?: string;
  parking?: {
    occupied: number;
    peak: number;
    admittedVehicles: number;
    deniedVisitors: number;
  };
  id: string;
  layout: Layout;
  config: Config;
  time: number;
  status: "running" | "paused" | "completed" | "failed";
  error?: string;
  agents: Agent[];
  venues: Record<string, VenueStats>;
  sales: Sale[];
  traffic: Record<string, number>;
  metrics: Metrics;
  wallSeconds: number;
  achievedSpeed: number;
  decisions: number;
  model: string;
}
export interface Metrics {
  attempted?: number;
  parkingRejected?: number;
  parkingPeak?: number;
  mealEpisodes?: number;
  unmetDining?: number;
  totalWaitMinutes?: number;
  queueAbandonments?: number;
  sales: number;
  arrived: number;
  departed: number;
  buyers: number;
  spendPerVisitor: number;
  conversion: number;
  averageVisit: number;
  zeroSpendDepartures: number;
  waiting: number;
  occupancy: number;
  salesPerM2: number;
  hourly: { hour: number; sales: number; visits: number }[];
  categories: Record<string, number>;
}
export interface Frame {
  time: number;
  agents: {
    id: string;
    x: number;
    y: number;
    floor: Floor;
    state: Agent["state"];
    remaining?: number;
    spend?: number;
    target?: string | null;
    history?: Agent["history"];
  }[];
  traffic?: Record<string, number>;
  metrics: Metrics;
  venues: Record<string, VenueStats>;
}
export interface RunRecord {
  snapshot: Snapshot;
  frames: Frame[];
  cohort: Profile[];
  cohortHash: string;
}
export interface Pair {
  seed: string;
  a: string | null;
  b: string | null;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  delta?: number;
  metricsA?: Metrics;
  metricsB?: Metrics;
  cohortHash?: string;
  venueSalesA?: Record<string, number>;
  venueSalesB?: Record<string, number>;
}
export interface Comparison {
  id: string;
  baseline: Layout;
  variant: Layout;
  config: Config;
  pairs: Pair[];
  status: "running" | "completed" | "incomplete";
  meanDelta: number | null;
  range: [number, number] | null;
  sd: number | null;
}
export const CATEGORIES: Category[] = [
  "restaurant",
  "cafe",
  "shop",
  "attraction",
  "viewpoint",
  "seating",
  "event",
];
export const LABELS: Record<Category, string> = {
  restaurant: "Restaurant",
  cafe: "Food & drink",
  shop: "Retail",
  attraction: "Attraction",
  viewpoint: "Viewpoint",
  seating: "Seating",
  event: "Event space",
};
export const DEFAULT_CONFIG: Config = {
  provider: "local",
  visitors: 5000,
  carShare: 0.35,
  initialParkedVehicles: 300,
  parkingBufferMinutes: 30,
  seed: "pier39-2026",
  day: "weekend",
  start: 600,
  end: 1260,
  hourly: [3, 6, 11, 14, 15, 14, 12, 10, 8, 5, 2],
  speed: 100000,
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const clock = (min: number) =>
  `${Math.floor(min / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(min % 60)
    .toString()
    .padStart(2, "0")}`;
