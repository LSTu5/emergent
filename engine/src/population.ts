import { type Config, type Profile, CATEGORIES } from "../../shared/contracts";
import { random, weighted } from "./random";
export function population(c: Config): Profile[] {
  const groups: Profile[] = [];
  let count = 0;
  while (count < c.visitors) {
    const id = `group-${groups.length + 1}`,
      r = (k: string) => random(c.seed, id, k),
      family = r("type") < 0.35,
      size = Math.min(
        c.visitors - count,
        family ? 3 + Math.floor(r("size") * 2) : 1 + Math.floor(r("size") * 2),
      );
    const band = weighted(c.hourly, r("arrival-band")),
      arrival = Math.min(
        c.end - 1,
        c.start +
          band * 60 +
          r("arrival-minute") * Math.min(60, c.end - (c.start + band * 60)),
      );
    const purpose = [
      "Sightseeing",
      "Family day out",
      "Dining visit",
      "Shopping & browsing",
      "Local stroll",
    ][Math.floor(r("purpose") * 5)];
    const interests = Object.fromEntries(
      CATEGORIES.map((k) => [k, 0.4 + r(k) * 1.5]),
    ) as Profile["interests"];
    if (purpose === "Dining visit") interests.restaurant = 3;
    if (purpose === "Shopping & browsing") interests.shop = 3;
    if (purpose === "Sightseeing") interests.viewpoint = 3;
    if (purpose === "Family day out") interests.attraction = 2.5;
    groups.push({
      id,
      mode: r("mode") < (c.carShare ?? 0.35) ? "car" : "walk-transit",
      mealIntent: purpose === "Dining visit" || r("meal-intent") < 0.35,
      priorityStop:
        purpose === "Sightseeing"
          ? r("anchor") < 0.7
            ? "sea-lions"
            : "bay-lookout"
          : purpose === "Family day out"
            ? r("anchor") < 0.55
              ? "aquarium"
              : "carousel"
            : undefined,
      groupId: id,
      purpose,
      size,
      budget: Math.round((25 + r("budget") * 110) * 100) * size,
      arrival,
      departure: Math.min(c.end, arrival + 90 + r("stay") * 210),
      interests,
      hunger: purpose === "Dining visit" ? 0.8 : r("hunger") * 0.65,
      fatigue: r("fatigue") * 0.2,
      patience: 4 + r("patience") * 16,
      familiarity: r("familiarity"),
      accessible: r("accessible") < 0.12,
    });
    count += size;
  }
  return groups;
}
