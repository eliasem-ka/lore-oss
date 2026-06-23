import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { z } from "zod";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildApiRouter } from "./rest.js";
import { createEventBus } from "../infra/eventBus.js";
import { defineCapability } from "../app/registry.js";

const caps = [
  defineCapability({
    name: "rawText", input: z.object({}),
    handler: async () => ({ contentType: "text/markdown", body: "# Hi" }),
    rest: { method: "get", path: "/raw", public: true, respond: (res, out: any) => res.type(out.contentType).send(out.body) },
  }),
  defineCapability({
    name: "jsonOne", input: z.object({}), handler: async () => ({ ok: true }),
    rest: { method: "get", path: "/jsonone", public: true },
  }),
];

let server: Server; let base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use("/api", buildApiRouter(caps as any, { bus: createEventBus() }));
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("rest.respond hook", () => {
  it("sends raw content-typed body when respond is set", async () => {
    const res = await fetch(`${base}/api/raw`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toBe("# Hi");
  });
  it("still sends JSON when respond is absent", async () => {
    const res = await fetch(`${base}/api/jsonone`);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
