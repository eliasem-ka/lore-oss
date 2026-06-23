import { describe, it, expect } from "vitest";
import { createEventBus } from "./eventBus.js";

describe("eventBus", () => {
  it("delivers an emitted event to a subscriber of that type", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on("UnitPublished", (e) => seen.push(e.unitId));
    bus.emit({ type: "UnitPublished", unitId: "u1" });
    expect(seen).toEqual(["u1"]);
  });
  it("does not deliver to subscribers of other types", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on("VerdictSubmitted", () => seen.push("x"));
    bus.emit({ type: "UnitPublished", unitId: "u1" });
    expect(seen).toEqual([]);
  });
  it("unsubscribe stops delivery", () => {
    const bus = createEventBus();
    let n = 0;
    const off = bus.on("UnitPublished", () => n++);
    bus.emit({ type: "UnitPublished", unitId: "a" });
    off();
    bus.emit({ type: "UnitPublished", unitId: "b" });
    expect(n).toBe(1);
  });
  it("a throwing subscriber does not break emit or other subscribers", () => {
    const bus = createEventBus();
    let reached = false;
    bus.on("UnitPublished", () => { throw new Error("boom"); });
    bus.on("UnitPublished", () => { reached = true; });
    expect(() => bus.emit({ type: "UnitPublished", unitId: "a" })).not.toThrow();
    expect(reached).toBe(true);
  });
});
