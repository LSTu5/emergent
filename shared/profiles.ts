import { LABELS, type Profile, type VisitorMember } from "./contracts";
const firstNames = [
  "Maya",
  "Leo",
  "Avery",
  "Noah",
  "Sofia",
  "Ethan",
  "Nora",
  "Kai",
  "Amelia",
  "Miles",
  "Isla",
  "Owen",
  "Zoe",
  "Luca",
  "Aria",
  "Elijah",
  "Harper",
  "Theo",
  "Riley",
  "Finn",
  "Elena",
  "Sam",
  "Chloe",
  "Rowan",
  "Naomi",
  "Jules",
  "Iris",
  "Alex",
  "Emma",
  "Jordan",
  "Talia",
  "Elliot",
];
const lastNames = [
  "Brooks",
  "Chen",
  "Rivera",
  "Patel",
  "Nguyen",
  "Morgan",
  "Kim",
  "Garcia",
  "Reed",
  "Shah",
  "Park",
  "Bennett",
  "Lopez",
  "Wilson",
  "Singh",
  "Davis",
  "Ahmed",
  "Stone",
  "Taylor",
  "Lewis",
  "Cruz",
  "Martin",
  "Lee",
  "Hayes",
];
function sample(seed: string, key: string) {
  let h = 2166136261;
  for (const c of `${seed}|visitor-identity-v1|${key}`)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Fictional display identities use a separate stream: they never change behavioral draws. */
export function createMembers(
  seed: string,
  group: Pick<Profile, "id" | "size">,
  family = false,
): VisitorMember[] {
  const r = (k: string) => sample(seed, `${group.id}|${k}`);
  const surname = lastNames[Math.floor(r("surname") * lastNames.length)];
  const older = !family && r("older") < 0.2;
  return Array.from({ length: group.size }, (_, i) => {
    const child = family && group.size >= 3 && i >= 2;
    const age = child
      ? 5 + Math.floor(r(`age-${i}`) * 12)
      : family
        ? 34 + Math.floor(r(`age-${i}`) * 25)
        : older
          ? 65 + Math.floor(r(`age-${i}`) * 18)
          : 18 + Math.floor(r(`age-${i}`) * 47);
    const name = `${firstNames[Math.floor(r(`name-${i}`) * firstNames.length)]} ${family ? surname : lastNames[Math.floor(r(`surname-${i}`) * lastNames.length)]}`;
    return {
      id: `${group.id}-person-${i + 1}`,
      name,
      age,
      role: child
        ? "child"
        : family && group.size >= 3
          ? "parent"
          : age >= 65
            ? "older adult"
            : "adult",
    };
  });
}
export function membersFor(group: Profile, seed: string): VisitorMember[] {
  return group.members?.length === group.size
    ? group.members
    : createMembers(seed, group, group.size >= 3);
}
export function groupLabel(group: Profile, seed: string) {
  const lead = membersFor(group, seed)[0];
  return lead
    ? `${lead.name}${group.size > 1 ? ` +${group.size - 1}` : ""}`
    : group.id;
}
export function profileDescription(group: Profile) {
  const likes = Object.entries(group.interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => LABELS[c as keyof typeof LABELS].toLowerCase());
  return `${group.size === 1 ? "A solo visitor" : `A party of ${group.size}`} here for ${group.purpose.toLowerCase()}. Most interested in ${likes.join(" and ")}. ${group.familiarity > 0.6 ? "Familiar with the pier." : "Still discovering the pier."}`;
}
