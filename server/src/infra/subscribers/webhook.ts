import type { EventBus, DomainEvent } from "../../domain/events.js";
import { findUnitByIdInternal } from "../../repos/knowledgeUnitRepo.js";
import { db as defaultDb } from "../../db/index.js";

type VerdictSubmittedEvent = Extract<DomainEvent, { type: "VerdictSubmitted" }>;
type UnitCtx = { title: string; flow: string | null; kind: string; status: string };

const LABEL: Record<string, string> = {
  approved: "✅ Approved",
  rejected: "❌ Rejected",
  needs_clarification: "🔶 Needs clarification",
};

export function buildWebhookPayload(event: VerdictSubmittedEvent, unit: UnitCtx | undefined) {
  const label = LABEL[event.verdict] ?? `Verdict ${event.verdict}`;
  const title = unit?.title ?? event.unitId;
  const scope = unit?.flow ?? unit?.kind ?? "";
  const text = `${label}: "${title}"${scope ? ` (${scope})` : ""} — by ${event.reviewer}`;
  return {
    text,
    event: {
      type: event.type, unitId: event.unitId, verdict: event.verdict, reviewer: event.reviewer,
      title: unit?.title, flow: unit?.flow, kind: unit?.kind, status: unit?.status,
      at: new Date().toISOString(),
    },
  };
}

async function postViaFetch(url: string, body: unknown, timeoutMs: number): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function registerWebhook(
  bus: EventBus,
  opts: {
    url?: string;
    timeoutMs?: number;
    post?: (url: string, body: unknown, timeoutMs: number) => Promise<void>;
    loadUnit?: (id: string) => Promise<UnitCtx | undefined>;
  } = {},
): void {
  const url = opts.url ?? process.env.LORE_WEBHOOK_URL ?? "";
  if (!url) return; // disabled — do not subscribe
  const timeoutMs = opts.timeoutMs ?? Number(process.env.LORE_WEBHOOK_TIMEOUT_MS ?? 5000);
  const post = opts.post ?? postViaFetch;
  const loadUnit = opts.loadUnit ?? (async (id: string) => {
    const u = await findUnitByIdInternal(id, defaultDb);
    return u ? { title: u.title, flow: u.flow, kind: u.kind, status: u.status } : undefined;
  });

  bus.on("VerdictSubmitted", (e) => {
    // Non-blocking: kick off async work, never awaited inside emit.
    void (async () => {
      try {
        const unit = await loadUnit(e.unitId);
        const body = buildWebhookPayload(e as VerdictSubmittedEvent, unit);
        await post(url, body, timeoutMs);
      } catch (err) {
        console.warn("[webhook] delivery failed:", (err as Error).message);
      }
    })();
  });
}
