import { db } from "../db/index.js";
import { findByKey, addMember } from "../repos/workspaceRepo.js";
import { findByEmail } from "../repos/userRepo.js";

async function main() {
  const [workspaceKey, userEmail] = process.argv.slice(2);
  if (!workspaceKey || !userEmail) {
    console.error("Usage: npm run workspace:add-user -- <workspaceKey> <userEmail>");
    process.exit(1);
  }

  const workspace = await findByKey(workspaceKey, db);
  if (!workspace) {
    console.error(`Error: workspace "${workspaceKey}" not found`);
    process.exit(1);
  }

  const user = await findByEmail(userEmail, db);
  if (!user) {
    console.error(`Error: user "${userEmail}" not found`);
    process.exit(1);
  }

  await addMember(workspace.id, user.id, db);
  console.log(`✓ added ${userEmail} to workspace ${workspaceKey}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
