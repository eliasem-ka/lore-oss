import type { EventBus, DomainEvent } from "../../domain/events.js";
import type { JiraClient } from "../jira/client.js";
import { createJiraClient } from "../jira/client.js";
import * as unitLinkRepo from "../../repos/unitLinkRepo.js";
import { findUnitByIdInternal } from "../../repos/knowledgeUnitRepo.js";
import { db as defaultDb } from "../../db/index.js";

type VerdictEvent = Extract<DomainEvent, { type: "VerdictSubmitted" }>;
type UnitCtx = { id: string; title: string; flow: string | null; kind: string; status: string; currentVersion: number; content: any };

export function buildIssueFields(unit: UnitCtx, catalogBaseUrl?: string): { summary: string; description: string; labels: string[] } {
  const body = unit.content?.productDescription ?? unit.content?.overview ?? "";
  const link = catalogBaseUrl ? `\nLore: ${catalogBaseUrl.replace(/\/$/, "")}/rule/${unit.id}` : "";
  return {
    summary: unit.title,
    description: `${body}${link}`.trim() || unit.title,
    labels: [unit.flow || unit.kind, "lore"].map((l) => l.replace(/\s+/g, "-")),
  };
}

type LinkRepo = {
  findLink: (unitId: string, system: string, db: any) => Promise<{ externalKey: string } | undefined>;
  insertLink: (v: { unitId: string; system: string; externalKey: string; url: string }, db: any) => Promise<void>;
};

export function registerJira(
  bus: EventBus,
  opts: { client?: JiraClient; loadUnit?: (id: string) => Promise<UnitCtx | undefined>; linkRepo?: LinkRepo; catalogBaseUrl?: string } = {},
): void {
  const client = opts.client ?? createJiraClient();
  if (!client.isConfigured()) return; // disabled — do not subscribe
  const linkRepo: LinkRepo = opts.linkRepo ?? unitLinkRepo;
  const catalogBaseUrl = opts.catalogBaseUrl ?? process.env.LORE_CATALOG_BASE_URL;
  const loadUnit = opts.loadUnit ?? (async (id: string) => {
    const u = await findUnitByIdInternal(id, defaultDb);
    return u ? { id: u.id, title: u.title, flow: u.flow, kind: u.kind, status: u.status, currentVersion: u.currentVersion, content: u.content } : undefined;
  });

  bus.on("VerdictSubmitted", (e) => {
    const ev = e as VerdictEvent;
    if (ev.verdict !== "approved") return;
    // Non-blocking: kick off async work, never awaited inside emit.
    void (async () => {
      try {
        const unit = await loadUnit(ev.unitId);
        if (!unit) return;
        const existing = await linkRepo.findLink(ev.unitId, "jira", defaultDb);
        if (existing) {
          await client.addComment(existing.externalKey, `Re-approved — v${unit.currentVersion} by ${ev.reviewer}`);
        } else {
          const fields = buildIssueFields(unit, catalogBaseUrl);
          const { key, url } = await client.createIssue(fields);
          await linkRepo.insertLink({ unitId: ev.unitId, system: "jira", externalKey: key, url }, defaultDb);
        }
      } catch (err) {
        console.warn("[jira] delivery failed:", (err as Error).message);
      }
    })();
  });
}
