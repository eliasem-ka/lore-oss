import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/index.js";
import { buildApiRouter } from "./transport/rest.js";
import { ALL_CAPABILITIES } from "./app/capabilities/index.js";
import { createEventBus } from "./infra/eventBus.js";
import { registerAuditLog } from "./infra/subscribers/auditLog.js";
import { registerWebhook } from "./infra/subscribers/webhook.js";
import { registerJira } from "./infra/subscribers/jira.js";
import { buildMcpRouter } from "./transport/mcp.js";
import { warmupEmbeddings } from "./services/embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

await migrate(db as never, { migrationsFolder: path.join(__dirname, "../migrations") });

const app = express();
app.use(express.json());

const bus = createEventBus();
registerAuditLog(bus);
registerWebhook(bus); // no-op unless LORE_WEBHOOK_URL is set
registerJira(bus); // no-op unless JIRA_* env is configured
app.use("/api", buildApiRouter(ALL_CAPABILITIES, { bus }));
app.use("/mcp", buildMcpRouter({ bus }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "Not found" });
  });
});

app.listen(PORT, () => {
  console.log(`Lore running on http://localhost:${PORT}`);
  // Warm the embedding model in the background so the first search/submit is fast.
  void warmupEmbeddings();
});

export { app };
