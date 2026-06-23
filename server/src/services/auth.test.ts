import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, issueToken, verifyToken } from "./auth.js";
import type { AuthUser } from "./auth.js";

describe("auth (pure)", () => {
  it("hashPassword + verifyPassword round-trips correctly", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("issueToken + verifyToken round-trips AuthUser", () => {
    const user: AuthUser = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "alice@example.com",
      name: "Alice",
      role: "reviewer",
    };
    const token = issueToken(user);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.name).toBe(user.name);
    expect(decoded.role).toBe(user.role);
  });

  it("verifyToken throws on garbage token", () => {
    expect(() => verifyToken("garbage.not.a.token")).toThrow();
  });
});
