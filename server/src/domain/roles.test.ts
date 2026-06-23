import { describe, it, expect } from "vitest";
import { meetsRole, rank } from "./roles.js";

describe("meetsRole", () => {
  it("senior meets senior", () => expect(meetsRole("senior", "senior")).toBe(true));
  it("reviewer does not meet senior", () => expect(meetsRole("reviewer", "senior")).toBe(false));
  it("admin meets senior", () => expect(meetsRole("admin", "senior")).toBe(true));
  it("undefined does not meet reviewer", () => expect(meetsRole(undefined, "reviewer")).toBe(false));
  it("bogus role does not meet reviewer", () => expect(meetsRole("bogus", "reviewer")).toBe(false));
});

describe("rank ordering", () => {
  it("reviewer < senior < admin", () => {
    expect(rank("reviewer")).toBeLessThan(rank("senior"));
    expect(rank("senior")).toBeLessThan(rank("admin"));
  });
});
