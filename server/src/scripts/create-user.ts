import { db } from "../db/index.js";
import { hashPassword } from "../services/auth.js";
import { upsertUser } from "../repos/userRepo.js";

async function main() {
  const [email, name, role] = process.argv.slice(2);
  const password = process.argv[5] ?? process.env.USER_PASSWORD;
  if (!email || !name || !role || !password) {
    console.error(
      "Usage: npm run user:create -- <email> <name> <role> <password>  (or USER_PASSWORD env)"
    );
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const u = await upsertUser({ email, name, role, passwordHash }, db);
  console.log(`✓ user ${u.email} (${u.role})`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
