import { describe, it, expect } from "vitest";
import { projectCapabilities } from "./projects.js";

const byName = (n: string) => projectCapabilities.find((c) => c.name === n)!;

describe("project capabilities", () => {
  it("registerProject renders the confirmation line", () => {
    const cap = byName("registerProject");
    expect((cap.mcp as any).render({ key: "k", name: "N", platform: "web" }))
      .toContain("✓ Project registered: k");
  });
  it("listStaleUnits maps the :key param to projectKey", () => {
    const cap = byName("listStaleUnits");
    const raw = (cap.rest as any).input({ params: { key: "proj" }, query: {} });
    expect(raw).toEqual({ projectKey: "proj", ref: undefined });
  });
});
