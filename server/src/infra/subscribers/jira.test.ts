import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../eventBus.js";
import { registerJira } from "./jira.js";

const unit = { id: "u1", title: "Coupon rule", flow: "Checkout", kind: "business_rule", status: "approved", currentVersion: 1, content: { productDescription: "must have order" } };
const cfgClient = (over = {}) => ({ isConfigured: () => true, createIssue: vi.fn(async () => ({ key: "DOC-1", url: "https://x/browse/DOC-1" })), addComment: vi.fn(async () => {}), ...over });
const loadUnit = async () => unit as any;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("registerJira", () => {
  it("creates an issue + stores the link on first approval", async () => {
    const bus = createEventBus(); const client = cfgClient();
    const linkRepo = { findLink: vi.fn(async () => undefined), insertLink: vi.fn(async () => {}), findLinksForUnit: vi.fn() };
    registerJira(bus, { client, loadUnit, linkRepo });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" });
    await tick();
    expect(client.createIssue).toHaveBeenCalledTimes(1);
    expect(linkRepo.insertLink).toHaveBeenCalledWith(expect.objectContaining({ unitId: "u1", system: "jira", externalKey: "DOC-1" }), expect.anything());
    expect(client.addComment).not.toHaveBeenCalled();
  });
  it("comments on the existing issue when already linked", async () => {
    const bus = createEventBus(); const client = cfgClient();
    const linkRepo = { findLink: vi.fn(async () => ({ externalKey: "DOC-1" })), insertLink: vi.fn(), findLinksForUnit: vi.fn() };
    registerJira(bus, { client, loadUnit, linkRepo });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" });
    await tick();
    expect(client.addComment).toHaveBeenCalledTimes(1);
    expect(client.createIssue).not.toHaveBeenCalled();
  });
  it("ignores non-approved verdicts", async () => {
    const bus = createEventBus(); const client = cfgClient();
    const linkRepo = { findLink: vi.fn(async () => undefined), insertLink: vi.fn(), findLinksForUnit: vi.fn() };
    registerJira(bus, { client, loadUnit, linkRepo });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "rejected", reviewer: "Ana" });
    await tick();
    expect(client.createIssue).not.toHaveBeenCalled();
  });
  it("is a no-op when the client is not configured", async () => {
    const bus = createEventBus(); const client = cfgClient({ isConfigured: () => false });
    const linkRepo = { findLink: vi.fn(), insertLink: vi.fn(), findLinksForUnit: vi.fn() };
    registerJira(bus, { client, loadUnit, linkRepo });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" });
    await tick();
    expect(linkRepo.findLink).not.toHaveBeenCalled();
  });
  it("does not throw out of emit when the client rejects", async () => {
    const bus = createEventBus(); const client = cfgClient({ createIssue: vi.fn(async () => { throw new Error("jira down"); }) });
    const linkRepo = { findLink: vi.fn(async () => undefined), insertLink: vi.fn(), findLinksForUnit: vi.fn() };
    registerJira(bus, { client, loadUnit, linkRepo });
    expect(() => bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" })).not.toThrow();
    await tick();
  });
});
