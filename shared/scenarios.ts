import { BASELINE, categoryDefaults } from "./baseline";
import { clone } from "./layout";
import type { Config, Layout, Venue } from "./contracts";
export const SCENARIOS = [
  {
    id: "dining",
    name: "Retail → upper-level restaurant",
    question:
      "Does a new restaurant serve unmet meal demand or take diners from existing tenants?",
    tradeoff:
      "Replace an upper-level retail cluster with 72 dining places. The commercial footprint stays fixed; construction costs are not modeled.",
  },
  {
    id: "retail",
    name: "Restaurant → specialty retail",
    question:
      "Would this space work better as shopping, and where would its diners go?",
    tradeoff:
      "Replace Swiss Louis with specialty retail. Dining capacity is lost and shoppers may browse without buying.",
  },
  {
    id: "bay-end",
    name: "Food and seating at the bay end",
    question:
      "Can a stronger food offer near the viewpoints redistribute activity along the pier?",
    tradeoff:
      "Move the planning kiosk toward the bay; replace a west retail cluster with a café. Retail space is sacrificed and snacks compete for finite budgets.",
  },
  {
    id: "parking-less",
    name: "Parking capacity −300 spaces",
    question:
      "How sensitive are visits and sales to fewer available parking spaces?",
    tradeoff:
      "A hypothetical 676-space garage. Car groups unable to park leave the modeled system; overflow garages and street traffic are outside this model.",
  },
  {
    id: "parking-more",
    name: "Parking capacity +300 spaces",
    question:
      "Would extra parking admit more visitors, and would the pier have capacity to serve them?",
    tradeoff:
      "A hypothetical 1,276-space supply. Physical feasibility, land use, construction costs and parking income are not modeled.",
  },
  {
    id: "late-dining",
    name: "Keep three restaurants open later",
    question:
      "Does an extra dinner hour retain spending, or mostly move sales between restaurants?",
    tradeoff:
      "Fog Harbor, Pier Market and Bubba Gump close at 22:00. Both runs use the same 10:00–22:00 demand window. Staffing costs are not modeled.",
  },
] as const;
export function scenario(
  id: string,
  config: Config,
): { layout: Layout; config: Config; focus: string } {
  const spec = SCENARIOS.find((s) => s.id === id);
  if (!spec) throw Error("Unknown management scenario");
  const layout = clone(BASELINE);
  layout.id = `draft-${id}-${Date.now()}`;
  layout.revision = 1;
  layout.name = spec.name;
  layout.scenario = { question: spec.question, tradeoff: spec.tradeoff };
  const next = clone(config);
  let focus = "sea-lions";
  const swap = (
    venueId: string,
    category: Venue["category"],
    name: string,
    patch: Partial<Venue> = {},
  ) => {
    const venue = layout.venues.find((v) => v.id === venueId)!;
    Object.assign(
      venue,
      categoryDefaults(category),
      {
        category,
        name,
        source: "Hypothetical management scenario; editable assumptions",
      },
      patch,
    );
    focus = venueId;
  };
  if (id === "dining")
    swap("upper-gifts", "restaurant", "Proposed terrace restaurant", {
      capacity: 72,
      spendMin: 2800,
      spendMax: 4600,
    });
  if (id === "retail")
    swap("swiss-louis", "shop", "Proposed specialty retail", {
      capacity: 40,
      purchaseProbability: 0.4,
      spendMin: 1800,
      spendMax: 6500,
    });
  if (id === "bay-end") {
    swap("west-gifts", "cafe", "Proposed bay-end café", {
      capacity: 40,
      dwellMin: 12,
      dwellMax: 28,
    });
    Object.assign(
      layout.venues.find((v) => v.id === "snack-kiosk")!,
      { x: 65, y: 85, nodeId: "west-1-8" },
    );
  }
  if (id.startsWith("parking-"))
    layout.parking = {
      enabled: true,
      spaces: id === "parking-less" ? 676 : 1276,
    };
  if (id === "late-dining") {
    for (const venueId of ["fog-harbor", "pier-market", "bubba-gump"])
      layout.venues.find((v) => v.id === venueId)!.close = 1320;
    next.start = 600;
    next.end = 1320;
    next.hourly = [3, 6, 11, 14, 15, 14, 12, 10, 8, 5, 3, 2];
    focus = "pier-market";
  }
  return { layout, config: next, focus };
}
