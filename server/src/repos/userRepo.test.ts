import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { findByEmail, upsertUser } from "./userRepo.js";

const TEST_DB_URL = process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";
const RUN = Date.now().toString(36);

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
});

afterAll(async () => {
  await client.end();
});

describe("userRepo", () => {
  it("upsertUser then findByEmail returns the user", async () => {
    const email = `alice-${RUN}@example.com`;
    const inserted = await upsertUser(
      { email, name: "Alice", role: "reviewer", passwordHash: "hash1" },
      db as never
    );

    expect(inserted.email).toBe(email);
    expect(inserted.name).toBe("Alice");
    expect(inserted.role).toBe("reviewer");
    expect(inserted.passwordHash).toBe("hash1");

    const found = await findByEmail(email, db as never);
    expect(found).toBeDefined();
    expect(found?.id).toBe(inserted.id);
    expect(found?.name).toBe("Alice");
  });

  it("second upsertUser with same email updates name/role — no duplicate", async () => {
    const email = `bob-${RUN}@example.com`;

    await upsertUser(
      { email, name: "Bob", role: "reviewer", passwordHash: "hash-original" },
      db as never
    );
    const updated = await upsertUser(
      { email, name: "Robert", role: "admin", passwordHash: "hash-updated" },
      db as never
    );

    expect(updated.name).toBe("Robert");
    expect(updated.role).toBe("admin");
    expect(updated.passwordHash).toBe("hash-updated");

    // ensure no duplicate rows — findByEmail returns exactly one
    const found = await findByEmail(email, db as never);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Robert");
  });

  it("findByEmail returns undefined for unknown email", async () => {
    const found = await findByEmail(`nobody-${RUN}@example.com`, db as never);
    expect(found).toBeUndefined();
  });
});
