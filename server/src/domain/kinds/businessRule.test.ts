import { describe, it, expect } from "vitest";
import { businessRulePolicy } from "./businessRule.js";

describe("businessRulePolicy", () => {
  it("always enters review regardless of confidence", () => {
    expect(businessRulePolicy.computeInitialStatus("high", false)).toBe("in_review");
    expect(businessRulePolicy.computeInitialStatus("low", true)).toBe("in_review");
  });
  it("builds search text from title + descriptions", () => {
    const text = businessRulePolicy.searchText({
      title: "Coupon rule", productDescription: "must have order", technicalDescription: "Middleware.validate", content: null,
    });
    expect(text).toContain("Coupon rule");
    expect(text).toContain("Middleware.validate");
  });
  it("imposes no hierarchy constraints", () => {
    expect(() => businessRulePolicy.validateHierarchy({ unitType: undefined }, undefined)).not.toThrow();
  });

  // ── New policy method tests ──────────────────────────────────────────────────

  describe("indexableFrom", () => {
    it("extracts productDescription and technicalDescription from content", () => {
      const indexable = businessRulePolicy.indexableFrom({
        title: "My Rule",
        content: { productDescription: "User sees X", technicalDescription: "Service.doX" },
      });
      expect(indexable.title).toBe("My Rule");
      expect(indexable.productDescription).toBe("User sees X");
      expect(indexable.technicalDescription).toBe("Service.doX");
      expect(indexable.content).toBeNull();
    });

    it("returns null descriptions when content has none", () => {
      const indexable = businessRulePolicy.indexableFrom({ title: "T", content: null });
      expect(indexable.productDescription).toBeNull();
      expect(indexable.technicalDescription).toBeNull();
      expect(indexable.content).toBeNull();
    });
  });

  describe("structuralColumns", () => {
    it("returns empty object for business rules", () => {
      expect(businessRulePolicy.structuralColumns({})).toEqual({});
      expect(businessRulePolicy.structuralColumns({ unitType: "feature", parentId: "x" })).toEqual({});
    });
  });

  describe("usesPriorVerdict", () => {
    it("is false for business rules", () => {
      expect(businessRulePolicy.usesPriorVerdict).toBe(false);
    });
  });

  describe("buildSnapshot", () => {
    it("produces the business rule snapshot shape with all expected fields", () => {
      const input = {
        title: "Checkout rule",
        flow: "checkout",
        subflow: "payment",
        productDescription: "Pay page",
        technicalDescription: "PayService",
        sources: [{ path: "src/pay.ts" }],
        confidence: "high" as const,
        ruleKey: "checkout.pay",
        entityLinks: [{ key: "Order", role: "subject" }],
        roundId: "round-1",
      };
      const snap = businessRulePolicy.buildSnapshot(input);
      expect(snap.title).toBe("Checkout rule");
      expect(snap.flow).toBe("checkout");
      expect(snap.subflow).toBe("payment");
      expect(snap.content).toBeDefined();
      expect(snap.sources).toEqual(input.sources);
      expect(snap.confidence).toBe("high");
      expect(snap.ruleKey).toBe("checkout.pay");
      expect(snap.entityLinks).toEqual(input.entityLinks);
      expect(snap.roundId).toBe("round-1");
      // Should NOT include architecture-specific fields
      expect(Object.keys(snap)).not.toContain("unitType");
      expect(Object.keys(snap)).not.toContain("parentId");
    });
  });
});
