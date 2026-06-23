import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCapability } from "./registry.js";

describe("defineCapability", () => {
  it("accepts a capability with at least one transport", () => {
    const c = defineCapability({
      name: "noop", input: z.object({}), handler: async () => ({ ok: true }),
      rest: { method: "get", path: "/noop" },
    });
    expect(c.name).toBe("noop");
  });
  it("throws when neither rest nor mcp is set", () => {
    expect(() => defineCapability({ name: "bad", input: z.object({}), handler: async () => null }))
      .toThrow(/at least one/);
  });
});
