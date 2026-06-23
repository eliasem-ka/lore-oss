import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../eventBus.js";
import { registerWebhook, buildWebhookPayload } from "./webhook.js";

const unit = { title: "Coupon rule", flow: "Checkout", kind: "business_rule", status: "approved" };
const loadUnit = async () => unit as any;
const tick = () => new Promise((r) => setTimeout(r, 0)); // let the async handler settle

describe("buildWebhookPayload", () => {
  it("builds an approved message + event", () => {
    const p = buildWebhookPayload(
      { type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" } as any,
      unit,
    );
    expect(p.text).toContain("Approved");
    expect(p.text).toContain("Coupon rule");
    expect(p.text).toContain("Ana");
    expect(p.event).toMatchObject({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana", title: "Coupon rule" });
  });
  it("labels rejected and needs_clarification distinctly", () => {
    expect(buildWebhookPayload({ type: "VerdictSubmitted", unitId: "u", verdict: "rejected", reviewer: "R" } as any, unit).text).toContain("Rejected");
    expect(buildWebhookPayload({ type: "VerdictSubmitted", unitId: "u", verdict: "needs_clarification", reviewer: "R" } as any, unit).text).toMatch(/clarif/i);
  });
});

describe("registerWebhook", () => {
  it("POSTs once on a VerdictSubmitted when a url is configured", async () => {
    const bus = createEventBus();
    const post = vi.fn<(url: string, body: unknown, timeoutMs: number) => Promise<void>>(async () => {});
    registerWebhook(bus, { url: "https://hook.test/x", post, loadUnit });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" });
    await tick();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("https://hook.test/x");
    expect((body as any).text).toContain("Approved");
  });
  it("is a no-op when no url is configured", async () => {
    const bus = createEventBus();
    const post = vi.fn(async () => {});
    registerWebhook(bus, { url: "", post, loadUnit });
    bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" });
    await tick();
    expect(post).not.toHaveBeenCalled();
  });
  it("does not throw out of emit when post rejects", async () => {
    const bus = createEventBus();
    const post = vi.fn(async () => { throw new Error("network"); });
    registerWebhook(bus, { url: "https://hook.test/x", post, loadUnit });
    expect(() => bus.emit({ type: "VerdictSubmitted", unitId: "u1", verdict: "approved", reviewer: "Ana" })).not.toThrow();
    await tick();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
