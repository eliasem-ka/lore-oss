import { describe, it, expect } from "vitest";
import { exportCapabilities } from "./export.js";

describe("export capability", () => {
  const cap = exportCapabilities[0];
  it("is exposed on both transports (parity)", () => {
    expect(Boolean(cap.rest)).toBe(true);
    expect(Boolean(cap.mcp)).toBe(true);
  });
  it("rest uses a respond hook for raw output", () => {
    expect(typeof (cap.rest as any).respond).toBe("function");
  });
  it("mcp render returns the body text", () => {
    expect((cap.mcp as any).render({ contentType: "text/markdown", body: "# X" })).toBe("# X");
  });
});
