import { describe, it, expect } from "vitest";
import { ALL_CAPABILITIES } from "./capabilities/index.js";

const REST_ONLY = new Set([
  "getRounds", "submitVerdict", "bulkVerdict", "getProgress",
  "getEntityWithRules", "updateEntity", "deleteEntity", "unlinkRuleFromEntity",
  "login", "me", "listFlowPolicies", "listWorkspaces",
]);
const MCP_ONLY = new Set<string>();

describe("REST↔MCP parity (Principle II)", () => {
  it("every capability is exposed on at least one transport", () => {
    for (const c of ALL_CAPABILITIES) expect(Boolean(c.rest) || Boolean(c.mcp)).toBe(true);
  });
  it("a capability is single-transport only if it's on the documented allow-list", () => {
    for (const c of ALL_CAPABILITIES) {
      const restOnly = Boolean(c.rest) && !c.mcp;
      const mcpOnly = Boolean(c.mcp) && !c.rest;
      if (restOnly) expect(REST_ONLY.has(c.name)).toBe(true);
      if (mcpOnly) expect(MCP_ONLY.has(c.name)).toBe(true);
    }
  });
  it("the allow-list has no stale entries", () => {
    const names = new Set(ALL_CAPABILITIES.map((c) => c.name));
    for (const n of REST_ONLY) expect(names.has(n)).toBe(true);
  });
  it("capability names are unique", () => {
    const names = ALL_CAPABILITIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
