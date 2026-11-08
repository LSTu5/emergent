import type { Frame, Snapshot } from "../../shared/contracts";
import { clone } from "../../shared/layout";

/** A committed, compact map update; excludes pending visitors and full profiles. */
export function liveView(snapshot: Snapshot): Frame {
  return {
    time: snapshot.time,
    agents: snapshot.agents
      .filter(
        (agent) => agent.state !== "pending" && agent.state !== "departed",
      )
      .map((agent) => ({
        id: agent.id,
        ...agent.position,
        state: agent.state,
        nodeId: agent.nodeId,
        route: [...agent.route],
        target: agent.target,
        remaining: agent.remaining,
        spend: agent.spend,
        history: clone(agent.history.slice(-6)),
      })),
    traffic: clone(snapshot.traffic),
    metrics: clone(snapshot.metrics),
    venues: clone(snapshot.venues),
  };
}
