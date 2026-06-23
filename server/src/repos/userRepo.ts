import { eq, sql } from "drizzle-orm";
import { users } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type User = typeof users.$inferSelect;

export async function findByEmail(email: string, db: DB): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  return u;
}

export async function upsertUser(
  values: { email: string; name: string; role: string; passwordHash: string },
  db: DB
): Promise<User> {
  const [u] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: values.name,
        role: values.role,
        passwordHash: values.passwordHash,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return u;
}
