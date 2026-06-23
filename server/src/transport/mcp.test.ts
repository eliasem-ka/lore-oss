import { describe, it, expect } from "vitest";
import { ALL_CAPABILITIES } from "../app/capabilities/index.js";
import { createMcpServer } from "./mcp.js";
import { createEventBus } from "../infra/eventBus.js";

describe("transport/mcp", () => {
  it("has exactly 15 MCP-enabled capabilities", () => {
    const mcpCaps = ALL_CAPABILITIES.filter((c) => c.mcp);
    expect(mcpCaps.length).toBe(15);
  });

  it("createMcpServer returns a truthy server without throwing", () => {
    const bus = createEventBus();
    const server = createMcpServer({ bus });
    expect(server).toBeTruthy();
  });
});
