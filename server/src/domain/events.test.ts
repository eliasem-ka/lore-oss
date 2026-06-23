import { describe, it, expect } from "vitest";
import type { DomainEvent } from "./events.js";

describe("DomainEvent", () => {
  it("constructs each variant", () => {
    const evts: DomainEvent[] = [
      { type: "UnitStatusChanged", unitId: "u", to: "approved" },
      { type: "VerdictSubmitted", unitId: "u", verdict: "approved", reviewer: "r" },
      { type: "UnitPublished", unitId: "u" },
      { type: "UnitContentChanged", unitId: "u", kind: "business_rule", version: 2 },
    ];
    expect(evts).toHaveLength(4);
  });
});
