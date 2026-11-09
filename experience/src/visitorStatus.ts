import type { Agent, Layout } from "../../shared/contracts";
/** Describe the current state, never a stale target left on a departed group. */
export function visitorStatus(
  agent: Pick<Agent, "state" | "target" | "arrival">,
  layout: Layout,
) {
  const destination = layout.venues.find((v) => v.id === agent.target)?.name;
  switch (agent.state) {
    case "pending":
      return "Has not arrived yet";
    case "departed":
      return "Visit finished · no longer on the pier";
    case "choosing":
      return "Choosing the next stop";
    case "waiting":
      return destination
        ? `Waiting at ${destination}`
        : "Waiting for admission";
    case "visiting":
      return destination ? `At ${destination}` : "Visiting a destination";
    case "walking":
      return destination ? `Heading to ${destination}` : "Walking to the exit";
  }
}
export function selectionNote(onPier: boolean, recorded: boolean) {
  return onPier
    ? "selected · outside current filter"
    : recorded
      ? "not present in this recorded frame"
      : "no longer on pier";
}
