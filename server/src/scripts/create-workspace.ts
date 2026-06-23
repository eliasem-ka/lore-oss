import { db } from "../db/index.js";
import { upsertWorkspace } from "../repos/workspaceRepo.js";

async function main() {
  const [key, name] = process.argv.slice(2);
  if (!key || !name) {
    console.error("Usage: npm run workspace:create -- <key> <name>");
    process.exit(1);
  }
  const ws = await upsertWorkspace({ key, name }, db);
  console.log(`✓ workspace ${ws.key} (${ws.name}) id=${ws.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
