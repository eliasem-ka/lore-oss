import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import type { Router } from "express";
import { Router as ExpressRouter } from "express";
import { LoopError, searchCatalog } from "../services/loop.js";
import type { Capability, Ctx } from "../app/registry.js";
import { ALL_CAPABILITIES } from "../app/capabilities/index.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { db, type DB } from "../db/index.js";

// ── Prompt constants (verbatim from mcp/server.ts) ────────────────────────────

const EXTRACT_RULES_PROMPT = `
You are a business-rules extraction agent. Your goal is to discover and document
business rules from a given source (codebase, docs, or any input) and submit them
to the Lore knowledge base for human review.

## Language — write all rule content in English
The catalog has ONE canonical language: **English**. Always write \`title\`,
\`product_description\`, and \`technical_description\` in English, regardless of the
language the user or the source code uses. This keeps the catalog uniform for
onboarding and RAG. (Don't worry about how rules will later be searched — search is
multilingual, so reviewers and agents can query in any language and still find these
English rules.) Identifiers from the code — class/method names, enum values, codes
like \`SKU4471\` — stay verbatim; only the prose around them is English.

## Step 0 — Detect available tools
Check which analysis tools are available in your current session:
- If **GitNexus MCP** tools are present (gitnexus_query, gitnexus_context, etc.):
  use them as the primary source. Query execution flows, UseCase/Middleware/Manager
  symbols, validators, and constants.
- If **filesystem / grep / glob** tools are available: scan for domain logic in
  use-case files, repositories, validators, and service layers.
- If only **documentation** is available: extract rules from prose descriptions.

Record which tools you found in \`tools_detected\` when calling \`start_round\`.

## Step 1 — Load domain context
Before extracting rules, load existing domain knowledge:

**1a. Check the entity catalog** — call \`list_entities\` (no args) to see what user types,
account types, memberships, and other domain concepts are already defined.
- Use these entity keys when submitting rules via \`entity_links[]\`.
- If you discover a new entity type (e.g. a user type not yet defined), call \`define_entity\`
  to register it before submitting rules that reference it.

**1b. Check the existing rule catalog** — call \`search_catalog\` with the target flow(s)
to see which rules are ALREADY approved. Skip rules that are already in the catalog.
- If a rule exists and needs updating, use its \`rule_key\` in \`submit_candidate\` to create
  a new version instead of a duplicate.

## Step 2 — Start a round
Call \`start_round\` with:
- \`source_label\`: human-readable name (e.g. "acme_shop_web", "checkout-service docs")
- \`source_kind\`: "gitnexus" | "repo" | "docs" | "generic"
- \`tools_detected\`: list of tool names you found
- \`scope\`: { flows: ["Checkout", "Returns"] } — declare which flows you'll cover
- \`owner_name\`: your name or team (helps detect round conflicts with other teams)

If \`start_round\` returns \`conflicts\`, check which flows overlap with an open round
from another team. Coordinate or narrow your \`scope\` to avoid duplicating work.

## Step 3 — Extract rules
For each area of the source, extract business rules. A business rule must have:
- A clear **product description**: what the rule means to a user or business stakeholder.
  Write it as a complete sentence without code references, in English.
- A **technical description**: where and how the rule is enforced in code (class,
  method, condition). Include file paths and symbol names if available.
- **Sources**: code locations (path, symbol, lines, sha if known).
- **Confidence**: high (unambiguous), medium (inferred), low (uncertain/guessed).
- **Open questions**: anything unclear that a human reviewer should answer.
- **Entity links**: which domain entities this rule applies to, excludes, requires, or modifies.
  Use keys from the entity catalog (e.g. \`customer_type.vip\`).

## Step 4 — Submit candidates
Call \`submit_candidate\` for each rule. Include \`entity_links[]\` to associate known entities.
Check the response:
- \`merged: true\` → a new version was created on an existing rule_key.
- \`warnings[]\` → source overlap with another rule; consider whether they should merge.
- \`related_approved[]\` → already-approved rules in the same flow; avoid duplicating them.

Do NOT filter rules by confidence — submit all findings. Use \`open_questions\` to
flag uncertainty instead of skipping.

## Step 5 — Complete the round
Call \`complete_round\` with the \`round_id\` you received in Step 2.

## Step 6 — Report summary
After completing the round, summarize:
- How many candidates submitted per flow
- New entities defined (if any)
- Any rules skipped because they were already approved (from Step 1)
- Source overlaps or conflicts found
- Open questions that need product clarification

## Re-iteration (when called with a rule to refine)
If you are called to refine a rejected rule:
1. Call \`list_pending_feedback\` to get the rejection reason.
2. Read the feedback comment carefully.
3. Call \`get_rule\` to read the current rule content and any source evidence.
4. Re-examine the relevant source code or documentation.
5. Call \`submit_refinement\` with the updated content and the feedback IDs you addressed.
`.trim();

const EXTRACT_ARCHITECTURE_PROMPT = `
You are an architecture-documentation agent. Your goal is to extract the structure of a
codebase — its features, layers, dependencies, and diagrams — and submit it to Lore as
**architecture units** for human review. Write all prose in English; copy identifiers verbatim.

## Step 0 — Detect tools
Prefer **GitNexus MCP** (gitnexus_query, gitnexus_context, route_map, impact, etc.) as the primary
source — it gives a verified call graph and symbol index. Fall back to filesystem/grep, then docs.

## Step 1 — Register the project
Call \`register_project\` with: key (slug, e.g. "acme-shop-web"), name, platform
(android|ios|web|backend|other), and defaultRef (the indexed commit sha) if known. Idempotent.

## Step 2 — Start a round
Call \`start_round\` with the projectKey, a source_label, source_kind ("gitnexus"|"repo"|"docs"),
tools_detected, and optionally scope.flows. Conflicts are scoped to the project.

## Step 3 — Per feature, emit a hierarchy
For each feature/module:
- Submit a **feature root unit** via \`submit_architecture_unit\` (unitType="feature"), with
  content: overview, techStack {endpoints, libraries, persistence — verbatim, not inferred},
  entryPoints, patterns, dependencies (other feature keys), diagrams (Mermaid TEXT: C4
  context/container/component), risk {level, notes}, and provenance {indexCommit, generatedAt}.
- Submit **layer sub-units** (unitType="layer", parentId = the feature unit's id) for UI / domain /
  data, each with content.layer set and content.diagrams holding the sequence / call-graph for that
  layer. Attach source-linked evidence in \`sources[]\` (path, lines, symbol, sha) — the "Key files".
- Set \`confidence\`: high (verbatim from the graph) auto-publishes; medium/low enters review. Use a
  namespaced ruleKey like "arch:<projectKey>:<featureSlug>" (and ":<layer>" for sub-units) so
  re-runs version instead of duplicating.

## Step 4 — Check responses
\`status: published\` means auto-surfaced (searchable, not human-approved). Watch source-overlap
warnings. Use \`search_catalog\` (kind="architecture", projectKey) to avoid re-submitting covered units.

## Step 5 — Staleness & refinement
Use \`list_stale_units\` to find units behind the current ref. If a unit was rejected, read
\`list_pending_feedback\` and \`submit_refinement\` (reused) addressing the feedback.
`.trim();

// ── Tool generator ─────────────────────────────────────────────────────────────

function registerTools(server: McpServer, capabilities: Capability[], ctx: Ctx) {
  for (const cap of capabilities) {
    if (!cap.mcp) continue;
    const { tool, description, shape, render } = cap.mcp;
    server.tool(tool, description, shape, async (args: unknown) => {
      try {
        const parsed = cap.input.parse(args);
        const out = await cap.handler(parsed, ctx);
        return { content: [{ type: "text" as const, text: render(out, parsed) }] };
      } catch (err) {
        if (err instanceof LoopError) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err.message} (${err.code})` }],
            isError: true,
          };
        }
        throw err;
      }
    });
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

// Creates a fresh, fully configured McpServer — one per session.
export function createMcpServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "lore", version: "0.1.0" });

  registerTools(server, ALL_CAPABILITIES, ctx);

  // ── Prompts ───────────────────────────────────────────────────────────────

  server.prompt(
    "extract_rules",
    "Tool-aware business-rules extraction methodology.",
    async () => ({
      messages: [
        { role: "user", content: { type: "text", text: EXTRACT_RULES_PROMPT } },
      ],
    })
  );

  server.prompt(
    "extract_architecture",
    "Tool-aware architecture-documentation extraction methodology (feature → layer units).",
    async () => ({
      messages: [
        { role: "user", content: { type: "text", text: EXTRACT_ARCHITECTURE_PROMPT } },
      ],
    })
  );

  // ── Resource ──────────────────────────────────────────────────────────────

  server.resource(
    "catalog",
    "catalog://approved",
    { description: "Full approved business rules catalog as JSON" },
    async () => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const rules = await searchCatalog({ status: "approved" }, ctx.workspaceId);
      return {
        contents: [
          {
            uri: "catalog://approved",
            mimeType: "application/json",
            text: JSON.stringify(rules, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

// ── Workspace resolution ─────────────────────────────────────────────────────

// Selects the workspace for an MCP session. MCP authenticates with a SHARED service
// credential (MCP_API_KEY) — there is no per-user JWT and no membership to validate.
// This is SELECTION, not authorization. Precedence (first that resolves wins):
//   1. X-Workspace-Id header (a workspace id UUID) → findById
//   2. MCP_WORKSPACE env (a workspace key)        → findByKey
//   3. the "default" workspace key                → findByKey
// Returns undefined only if even "default" is missing (tenant tools then throw FORBIDDEN).
export async function resolveMcpWorkspaceId(
  header: string | undefined,
  envKey: string | undefined,
  db: DB
): Promise<string | undefined> {
  if (header) {
    const byId = await workspaceRepo.findById(header, db);
    if (byId) return byId.id;
  }
  if (envKey) {
    const byKey = await workspaceRepo.findByKey(envKey, db);
    if (byKey) return byKey.id;
  }
  return (await workspaceRepo.findByKey("default", db))?.id;
}

// ── Express router ─────────────────────────────────────────────────────────────

export function buildMcpRouter(ctx: Ctx): Router {
  const router = ExpressRouter();

  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();

  router.use(async (req, res, next) => {
    const apiKey = process.env.MCP_API_KEY;
    if (apiKey && apiKey !== "dev-key") {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${apiKey}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  router.all("/", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
      return;
    }

    const wsHeader = req.headers["x-workspace-id"];
    const headerId = Array.isArray(wsHeader) ? wsHeader[0] : wsHeader;
    const workspaceId = await resolveMcpWorkspaceId(headerId, process.env.MCP_WORKSPACE, db);

    const sessionServer = createMcpServer({ ...ctx, workspaceId });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server: sessionServer });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    await sessionServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return router;
}
