import { describe, it, expect } from "vitest";
import { transition } from "./fsm.js";

describe("fsm.transition", () => {
  it("approves an in_review unit", () => {
    expect(transition("in_review", "approve", {})).toEqual({ ok: true, to: "approved" });
  });
  it("approves a published unit (ratification)", () => {
    expect(transition("published", "approve", {})).toEqual({ ok: true, to: "approved" });
  });
  it("rejects with a comment", () => {
    expect(transition("in_review", "reject", { comment: "no" })).toEqual({ ok: true, to: "rejected" });
  });
  it("requires a comment to reject", () => {
    const r = transition("in_review", "reject", {});
    expect(r).toMatchObject({ ok: false, code: "COMMENT_REQUIRED" });
  });
  it("requires a comment to clarify", () => {
    const r = transition("published", "clarify", { comment: "  " });
    expect(r).toMatchObject({ ok: false, code: "COMMENT_REQUIRED" });
  });
  it("refines a rejected unit back to in_review", () => {
    expect(transition("rejected", "refine", {})).toEqual({ ok: true, to: "in_review" });
  });
  it("refines an in_review unit (self-loop) ", () => {
    expect(transition("in_review", "refine", {})).toEqual({ ok: true, to: "in_review" });
  });
  it("rejects an illegal transition (approve an approved unit)", () => {
    const r = transition("approved", "approve", {});
    expect(r).toMatchObject({ ok: false, code: "ILLEGAL_TRANSITION" });
  });
  it("rejects refine on a published unit", () => {
    expect(transition("published", "refine", {})).toMatchObject({ ok: false, code: "ILLEGAL_TRANSITION" });
  });
});
