import { describe, it, expect } from "vitest";
import { entityCapabilities } from "./entities.js";
import { ALL_CAPABILITIES } from "./index.js";

const cap = (name: string) => entityCapabilities.find((c) => c.name === name)!;

describe("entityCapabilities — mcp:false flags", () => {
  it("getEntityWithRules has mcp === false", () => {
    expect(cap("getEntityWithRules").mcp).toBe(false);
  });

  it("updateEntity has mcp === false", () => {
    expect(cap("updateEntity").mcp).toBe(false);
  });

  it("deleteEntity has mcp === false", () => {
    expect(cap("deleteEntity").mcp).toBe(false);
  });

  it("unlinkRuleFromEntity has mcp === false", () => {
    expect(cap("unlinkRuleFromEntity").mcp).toBe(false);
  });

  it("linkRuleToEntity has a truthy mcp", () => {
    expect(cap("linkRuleToEntity").mcp).toBeTruthy();
  });
});

describe("entityCapabilities — input mappers", () => {
  it("updateEntity.rest.input maps params.key + body → { name, key }", () => {
    const restSpec = cap("updateEntity").rest as { input: (req: any) => any };
    expect(
      restSpec.input({ params: { key: "k" }, body: { name: "N" } })
    ).toEqual({ name: "N", key: "k" });
  });
});

describe("ALL_CAPABILITIES aggregator", () => {
  it("has exactly 27 entries", () => {
    expect(ALL_CAPABILITIES).toHaveLength(27);
  });

  it("has unique names (no duplicates)", () => {
    const names = ALL_CAPABILITIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
