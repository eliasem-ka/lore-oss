import { db } from "../db/index.js";
import { upsertPolicy } from "../repos/flowPolicyRepo.js";
import { ROLES } from "../domain/roles.js";

async function main() {
  const [flow, minApproveRole] = process.argv.slice(2);
  if (!flow || !minApproveRole || !ROLES.includes(minApproveRole)) {
    console.error(`Usage: npm run flow:policy -- <flow> <minRole>   (minRole one of: ${ROLES.join(", ")})`);
    process.exit(1);
  }
  const p = await upsertPolicy({ flow, minApproveRole }, db);
  console.log(`✓ flow policy: "${p.flow}" requires ${p.minApproveRole} to approve`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
