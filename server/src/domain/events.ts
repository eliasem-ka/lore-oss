import type { Status } from "./fsm.js";
import type { Kind } from "../db/schema.js";
import type { Verdict } from "../db/schema.js";

// `from` is optional: a thin handler emitting after a service call doesn't always
// have the prior status without extra reads. Subscribers must tolerate its absence.
export type DomainEvent =
  | { type: "UnitStatusChanged"; unitId: string; to: Status; from?: Status; verdict?: Verdict }
  | { type: "VerdictSubmitted"; unitId: string; verdict: Verdict; reviewer: string }
  | { type: "UnitPublished"; unitId: string }
  | { type: "UnitContentChanged"; unitId: string; kind: Kind; version: number };

export type DomainEventType = DomainEvent["type"];

export interface EventBus {
  emit(event: DomainEvent): void;
  on(type: DomainEventType, handler: (event: DomainEvent) => void): () => void;
}
