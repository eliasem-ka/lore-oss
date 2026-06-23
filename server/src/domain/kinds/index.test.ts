import { describe, it, expect } from "vitest";
import { policyFor } from "./index.js";

describe("kind registry", () => {
  it("resolves a policy per kind", () => {
    expect(policyFor("business_rule").computeInitialStatus("high", false)).toBe("in_review");
    expect(policyFor("architecture").computeInitialStatus("high", false)).toBe("published");
  });
});
