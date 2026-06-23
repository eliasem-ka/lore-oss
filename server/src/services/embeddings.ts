import { pipeline } from "@huggingface/transformers";

// The pipeline() overload union is too complex for tsc to represent, so we type
// the extractor loosely — we only ever call it as (text, options) → { data }.
type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ data: Float32Array }>;

// ── Config ──────────────────────────────────────────────────────────────────
// Server-side embeddings. The MCP/REST surface NEVER sends or receives vectors —
// agents send text, Lore embeds it here. This keeps the interface tool-agnostic.
//
// Model: multilingual-e5-small (384 dims, cross-lingual). E5 family requires
// asymmetric prefixes: "query: " for searches, "passage: " for stored documents.

export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "Xenova/multilingual-e5-small";

// EMBEDDING_PROVIDER=none disables embeddings entirely (used in tests / FTS-only mode).
const DISABLED = process.env.EMBEDDING_PROVIDER === "none";

type EmbedKind = "query" | "passage";

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL) as unknown as Promise<FeatureExtractor>;
  }
  return extractorPromise;
}

/**
 * Embed a single text. Best-effort: returns null on any failure (model not
 * loaded, OOM, disabled) so callers degrade gracefully instead of throwing.
 */
export async function embed(text: string, kind: EmbedKind): Promise<number[] | null> {
  if (DISABLED || !text.trim()) return null;
  try {
    const extractor = await getExtractor();
    const output = await extractor(`${kind}: ${text}`, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.warn("[embeddings] embed failed, falling back:", (err as Error).message);
    return null;
  }
}

/** Combined text used to represent a rule in vector space. */
export function buildRuleText(rule: {
  title: string;
  productDescription: string;
  technicalDescription: string;
}): string {
  return [rule.title, rule.productDescription, rule.technicalDescription]
    .filter(Boolean)
    .join("\n");
}

/** Embed a rule's combined text as a stored passage. */
export function embedRule(rule: {
  title: string;
  productDescription: string;
  technicalDescription: string;
}): Promise<number[] | null> {
  return embed(buildRuleText(rule), "passage");
}

/**
 * Load the model ahead of the first real request so the first search/submit
 * doesn't pay the ~2-5s cold-load. Fire-and-forget at startup.
 */
export async function warmupEmbeddings(): Promise<void> {
  if (DISABLED) {
    console.log("[embeddings] disabled (EMBEDDING_PROVIDER=none)");
    return;
  }
  const t0 = Date.now();
  const ok = await embed("warmup", "query");
  if (ok) {
    console.log(`[embeddings] model "${EMBEDDING_MODEL}" warmed up in ${Date.now() - t0}ms`);
  } else {
    console.warn(`[embeddings] warmup produced no vector — search will fall back to FTS only`);
  }
}

export function embeddingsEnabled(): boolean {
  return !DISABLED;
}
