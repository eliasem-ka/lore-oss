import { EventEmitter } from "node:events";
import type { DomainEvent, DomainEventType, EventBus } from "../domain/events.js";

// In-process synchronous bus. Subscriber exceptions are isolated so one bad
// listener cannot fail a request. This is the seam for S5 (webhooks/Slack/Jira).
export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    emit(event: DomainEvent) {
      try {
        emitter.emit(event.type, event);
      } catch (err) {
        console.error("[eventBus] emit failed:", err);
      }
    },
    on(type: DomainEventType, handler: (event: DomainEvent) => void) {
      const wrapped = (event: DomainEvent) => {
        try {
          handler(event);
        } catch (err) {
          console.error(`[eventBus] subscriber for ${type} threw:`, err);
        }
      };
      emitter.on(type, wrapped);
      return () => emitter.off(type, wrapped);
    },
  };
}
