import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, ChevronDown, Code2, ClipboardCopy } from "lucide-react";
import { api, type Rule, type RuleVersion } from "../lib/api.js";
import { StatusChip } from "../components/StatusChip.js";
import { EntityPills } from "../components/EntityPills.js";

function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

function VersionDiff({ versions, currentVersion }: { versions: RuleVersion[]; currentVersion: number }) {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const curr = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  // Read defensively: new snapshots store descriptions under `content`, old ones stored them flat.
  function snapProduct(snap: Record<string, unknown>): string {
    const c = snap.content as Record<string, unknown> | undefined;
    return String(c?.productDescription ?? snap.productDescription ?? "");
  }
  function snapTechnical(snap: Record<string, unknown>): string {
    const c = snap.content as Record<string, unknown> | undefined;
    return String(c?.technicalDescription ?? snap.technicalDescription ?? "");
  }

  if (!prev) {
    return (
      <div className="diff-block">
        <p className="section-label" style={{ marginBottom: 8 }}>Version {currentVersion}</p>
        <div className="diff-curr">
          <p className="diff-label">Product</p>
          <p className="diff-text">{snapProduct(curr.snapshot)}</p>
          <p className="diff-label" style={{ marginTop: 10 }}>Technical</p>
          <p className="diff-text">{snapTechnical(curr.snapshot)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-block">
      <div className="diff-header">
        <span className="diff-version-tag diff-prev-tag">v{prev.version}</span>
        <span className="diff-arrow">→</span>
        <span className="diff-version-tag diff-curr-tag">v{curr.version}</span>
        {curr.changeNote && <span className="diff-note">{curr.changeNote}</span>}
      </div>

      <div className="diff-row">
        <div className="diff-col">
          <p className="diff-label">Product (before)</p>
          <p className="diff-text diff-text-prev">{snapProduct(prev.snapshot)}</p>
          <p className="diff-label" style={{ marginTop: 10 }}>Technical (before)</p>
          <p className="diff-text diff-text-prev">{snapTechnical(prev.snapshot)}</p>
        </div>
        <div className="diff-col">
          <p className="diff-label">Product (after)</p>
          <p className="diff-text diff-text-curr">{snapProduct(curr.snapshot)}</p>
          <p className="diff-label" style={{ marginTop: 10 }}>Technical (after)</p>
          <p className="diff-text diff-text-curr">{snapTechnical(curr.snapshot)}</p>
        </div>
      </div>
    </div>
  );
}

function RuleDetail({ ruleId }: { ruleId: string }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => api.rules.get(ruleId),
    staleTime: 10_000,
  });

  if (isLoading) return <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", padding: "var(--space-4) 0" }}>Loading versions…</p>;
  if (!detail) return null;

  return (
    <div className="expand-body">
      {/* Feedback comments */}
      {detail.feedback.length > 0 && (
        <div className="detail-section" style={{ marginTop: "var(--space-4)" }}>
          <p className="section-label">Reviewer Feedback</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {detail.feedback.map((fb) => (
              <div key={fb.id} className={`feedback-card feedback-card-${fb.verdict}`}>
                <div className="feedback-meta">
                  <StatusChip value={fb.verdict} />
                  <span className="feedback-reviewer">{fb.reviewerName}</span>
                  {fb.reviewerRole && <span className="feedback-role">· {fb.reviewerRole}</span>}
                  <span className="feedback-date">{new Date(fb.createdAt).toLocaleDateString()}</span>
                  <span className={`feedback-status-dot ${fb.status}`} title={fb.status} />
                </div>
                {fb.comment && <p className="feedback-comment">{fb.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entities */}
      {detail.entities && detail.entities.length > 0 && (
        <div className="detail-section">
          <p className="section-label">Domain Entities</p>
          <EntityPills entities={detail.entities} />
        </div>
      )}

      {/* Sources */}
      {detail.sources.length > 0 && (
        <div className="detail-section">
          <p className="section-label">Sources</p>
          <div className="source-list">
            {detail.sources.map((s, i) => (
              <span key={i} className="source-pill" title={s.path}>
                <Code2 size={11} />
                <span className="source-file">{shortPath(s.path ?? "")}</span>
                {s.symbol && <><span className="source-sep">·</span><span className="source-symbol">{s.symbol}</span></>}
                {s.lines && <><span className="source-sep">·</span><span className="source-lines">{s.lines}</span></>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Version diff */}
      {detail.unitVersions.length > 0 && (
        <div className="detail-section">
          <p className="section-label">Version diff</p>
          <VersionDiff versions={detail.unitVersions} currentVersion={detail.currentVersion} />
        </div>
      )}

      {/* Agent hint */}
      <div className="agent-hint">
        <span className="agent-hint-label">Agent: call <code>submit_refinement</code> with</span>
        <code className="agent-hint-value">rule_id: {detail.id}</code>
        {detail.unitKey && <code className="agent-hint-value">unit_key: {detail.unitKey}</code>}
        <button
          className="agent-hint-copy"
          title="Copy rule ID"
          onClick={() => navigator.clipboard.writeText(detail.id)}
        >
          <ClipboardCopy size={12} />
        </button>
      </div>
    </div>
  );
}

export function IterationsPage() {
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["feedback", "pending"],
    queryFn: () => api.pendingFeedback(),
    refetchInterval: 20_000,
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Iterations</h1>
          <p className="page-subtitle">
            {rules.length} rule{rules.length !== 1 ? "s" : ""} pending agent re-iteration
          </p>
        </div>
      </div>

      <div className="page-body">
        {isLoading && (
          <div className="empty-state">
            <p className="empty-state-desc">Loading…</p>
          </div>
        )}

        {!isLoading && rules.length === 0 && (
          <div className="empty-state">
            <GitBranch className="empty-state-icon" />
            <p className="empty-state-title">No pending iterations</p>
            <p className="empty-state-desc">
              When a reviewer rejects a rule or requests clarification, it appears here for the agent to refine.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(rules as Rule[]).map((rule) => {
            const isOpen = expanded === rule.id;

            return (
              <div key={rule.id} className="card">
                <button
                  className="expand-toggle"
                  onClick={() => setExpanded(isOpen ? null : rule.id)}
                  aria-expanded={isOpen}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="rule-card-title">{rule.title}</span>
                      <StatusChip value={rule.status} />
                      <StatusChip value={rule.confidence} type="confidence" />
                      <span className="version-pill">v{rule.currentVersion}</span>
                    </div>
                    <div className="rule-card-meta">
                      <span>{rule.flow}</span>
                      {rule.subflow && (
                        <>
                          <span className="rule-card-meta-dot">›</span>
                          <span>{rule.subflow}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`expand-chevron ${isOpen ? "open" : ""}`}
                  />
                </button>

                {isOpen && <RuleDetail ruleId={rule.id} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
