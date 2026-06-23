import { db as defaultDb, type DB } from "../db/index.js";
import { searchCatalog } from "./loop.js";
import type { ExportCatalogInput } from "../schemas/export.js";

type Kind = "business_rule" | "architecture";

export async function exportCatalog(input: ExportCatalogInput, workspaceId: string, db: DB = defaultDb) {
  // INTENTIONAL: default is "approved" only, not "approved|published" like searchCatalog's
  // architecture default — exports are human-verified-only; "published" is still reachable
  // via an explicit `status` param.
  const status = input.status ?? "approved";
  const kinds: Kind[] = input.kind ? [input.kind] : ["business_rule", "architecture"];
  const groups = await Promise.all(
    kinds.map((kind) =>
      searchCatalog({ status, kind, projectKey: input.projectKey, flow: input.flow }, workspaceId, db),
    ),
  );
  const units = groups.flat();

  if (input.format === "markdown") {
    return { contentType: "text/markdown", body: renderMarkdown(units, input, status) };
  }
  const doc = {
    generatedAt: new Date().toISOString(),
    filters: { status, kind: input.kind ?? null, projectKey: input.projectKey ?? null, flow: input.flow ?? null },
    count: units.length,
    units,
  };
  return { contentType: "application/json", body: JSON.stringify(doc, null, 2) };
}

// Escape inline Markdown metacharacters in user/agent content so a title or
// description renders literally (Confluence/Notion/RAG). Does NOT touch the
// structural markdown we emit ourselves (#, ###, **, sources).
function escapeMarkdown(text: string): string {
  // Inline Markdown metacharacters only. NOT - . + ! (line-start-special; escaping
  // them mid-text would add visible backslash noise to the export).
  return text.replace(/([\\`*_{}[\]()#|>~])/g, "\\$1");
}

function renderMarkdown(units: any[], input: ExportCatalogInput, status: string): string {
  const lines: string[] = [`# Lore catalog export`, "", `> status: ${status}${input.flow ? ` · flow: ${input.flow}` : ""} · ${units.length} unit(s)`, ""];
  // group by flow (fallback to kind for architecture/no-flow)
  const byGroup: Record<string, any[]> = {};
  for (const u of units) (byGroup[u.flow || u.kind || "(ungrouped)"] ??= []).push(u);
  for (const [group, items] of Object.entries(byGroup).sort()) {
    lines.push(`## ${group}`, "");
    for (const u of items) {
      lines.push(`### ${escapeMarkdown(u.title)}  _(v${u.currentVersion}, ${u.status})_`);
      const body = u.content?.productDescription ?? u.content?.overview;
      if (body) lines.push("", escapeMarkdown(body));
      const srcs = (u.sources ?? []).map((s: any) => [s.path, s.symbol].filter(Boolean).join(" · ")).filter(Boolean);
      if (srcs.length) lines.push("", `**Sources:** ${srcs.join("; ")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
