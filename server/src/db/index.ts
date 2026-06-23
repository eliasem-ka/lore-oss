import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

const url = process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const client = postgres(url);
export const db = drizzle(client, { schema: { ...schema, ...relations } });
export type DB = typeof db;
