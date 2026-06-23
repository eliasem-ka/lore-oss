import { describe, it, expect } from "vitest";
import { architecturePolicy } from "./architecture.js";

describe("architecturePolicy", () => {
  it("auto-publishes high confidence with no prior human verdict", () => {
    expect(architecturePolicy.computeInitialStatus("high", false)).toBe("published");
  });
  it("sends medium/low to review", () => {
    expect(architecturePolicy.computeInitialStatus("medium", false)).toBe("in_review");
    expect(architecturePolicy.computeInitialStatus("low", false)).toBe("in_review");
  });
  it("never auto-publishes once a human has judged it (FR-020)", () => {
    expect(architecturePolicy.computeInitialStatus("high", true)).toBe("in_review");
  });
  it("requires a parent for a layer unit", () => {
    expect(() => architecturePolicy.validateHierarchy({ unitType: "layer" }, undefined))
      .toThrow(/parent/i);
  });
  it("allows a feature unit with no parent", () => {
    expect(() => architecturePolicy.validateHierarchy({ unitType: "feature" }, undefined)).not.toThrow();
  });
  it("builds search text from overview + techStack", () => {
    const text = architecturePolicy.searchText({
      title: "Checkout", productDescription: null, technicalDescription: null,
      content: { overview: "handles payment", techStack: { libraries: ["stripe"] }, provenance: {} } as never,
    });
    expect(text).toContain("Checkout");
    expect(text).toContain("stripe");
  });

  // ── New policy method tests ──────────────────────────────────────────────────

  describe("indexableFrom", () => {
    it("passes content through and sets descriptions to null", () => {
      const archContent = { overview: "API layer", techStack: { libraries: ["express"] }, provenance: {} } as never;
      const indexable = architecturePolicy.indexableFrom({ title: "API Layer", content: archContent });
      expect(indexable.title).toBe("API Layer");
      expect(indexable.productDescription).toBeNull();
      expect(indexable.technicalDescription).toBeNull();
      expect(indexable.content).toBe(archContent);
    });

    it("handles null content", () => {
      const indexable = architecturePolicy.indexableFrom({ title: "T", content: null });
      expect(indexable.content).toBeNull();
    });
  });

  describe("structuralColumns", () => {
    it("returns unitType and parentId from input", () => {
      const cols = architecturePolicy.structuralColumns({ unitType: "feature", parentId: "parent-123" });
      expect(cols).toEqual({ unitType: "feature", parentId: "parent-123" });
    });

    it("returns undefined values when not provided", () => {
      const cols = architecturePolicy.structuralColumns({});
      expect(cols.unitType).toBeUndefined();
      expect(cols.parentId).toBeUndefined();
    });
  });

  describe("usesPriorVerdict", () => {
    it("is true for architecture units", () => {
      expect(architecturePolicy.usesPriorVerdict).toBe(true);
    });
  });

  describe("buildSnapshot", () => {
    it("produces the architecture snapshot shape with all expected fields", () => {
      const archContent = { overview: "Handles routing", provenance: {} } as never;
      const input = {
        title: "Router",
        unitType: "feature" as const,
        parentId: "parent-abc",
        content: archContent,
        sources: [{ path: "src/router.ts" }],
        confidence: "high" as const,
      };
      const snap = architecturePolicy.buildSnapshot(input);
      expect(snap.title).toBe("Router");
      expect(snap.unitType).toBe("feature");
      expect(snap.parentId).toBe("parent-abc");
      expect(snap.content).toBeDefined();
      expect(snap.sources).toEqual(input.sources);
      expect(snap.confidence).toBe("high");
      // Should NOT include business-rule-specific fields
      expect(Object.keys(snap)).not.toContain("flow");
      expect(Object.keys(snap)).not.toContain("ruleKey");
      expect(Object.keys(snap)).not.toContain("entityLinks");
    });
  });
});
