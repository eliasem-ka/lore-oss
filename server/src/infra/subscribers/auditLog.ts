import type { EventBus, DomainEvent } from "../../domain/events.js";

// The one production subscriber: a structured audit trace. Future S5 (Slack/Jira/
// webhooks) subscribers attach the same way, with zero handler edits.
export function registerAuditLog(bus: EventBus): void {
  const types: DomainEvent["type"][] = ["UnitStatusChanged", "VerdictSubmitted", "UnitPublished", "UnitContentChanged"];
  for (const t of types) {
    bus.on(t, (e) => console.log(`[audit] ${JSON.stringify(e)}`));
  }
}
