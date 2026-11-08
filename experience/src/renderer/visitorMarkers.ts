import type { Frame, Profile, VisitorMember } from "../../../shared/contracts";
import { membersFor, groupLabel } from "../../../shared/profiles";
export interface VisitorMarker {
  groupId: string;
  id: string;
  name: string;
  member?: VisitorMember;
  x: number;
  y: number;
}
export function visitorMarkers(
  poses: Frame["agents"],
  profiles: Map<string, Profile>,
  seed: string,
  mode: "groups" | "people",
  selected: string | null,
  limit = 300,
): VisitorMarker[] {
  const ordered = [...poses].sort(
    (a, b) => Number(b.id === selected) - Number(a.id === selected),
  );
  const markers: VisitorMarker[] = [];
  for (const pose of ordered) {
    const profile = profiles.get(pose.id);
    const members =
      mode === "people" && profile ? membersFor(profile, seed) : [];
    const items = members.length ? members : [undefined];
    for (let i = 0; i < items.length && markers.length < limit; i++) {
      const member = items[i];
      markers.push({
        groupId: pose.id,
        id: member?.id ?? pose.id,
        name: member
          ? `${member.name}, ${member.age}`
          : profile
            ? groupLabel(profile, seed)
            : pose.id,
        member,
        x: members.length > 1 ? (i % 2 ? 1 : -1) : 0,
        y: members.length > 2 ? (i < 2 ? -1 : 1) : 0,
      });
    }
    if (markers.length >= limit) break;
  }
  return markers;
}
