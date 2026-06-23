import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CheckCircle, XCircle, HelpCircle, Code2, ClipboardCheck, AlertTriangle, CheckSquare, Square } from "lucide-react";
import { api, type Rule, type FlowPolicy } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { StatusChip } from "../components/StatusChip.js";
import { EntityPills } from "../components/EntityPills.js";

const ROLE_RANK: Record<string, number> = { reviewer: 1, senior: 2, admin: 3 };

function roleRank(role: string | undefined | null): number {
  return ROLE_RANK[role ?? ""] ?? 0;
}

type Verdict = "approved" | "rejected" | "needs_clarification";

// Show only last 2 path segments — strips src/main/kotlin/com/acme/ boilerplate
function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

export function ReviewQueuePage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: flowPolicies = [] } = useQuery<FlowPolicy[]>({
    queryKey: ["flow-policies"],
    queryFn: () => api.flowPolicies.list(),
    staleTime: 60_000,
  });

  // Build a map: flow → minApproveRole for O(1) lookup per card
  const policyByFlow = useMemo(
    () => Object.fromEntries(flowPolicies.map((p) => [p.flow, p.minApproveRole])),
    [flowPolicies]
  );

  const { data: businessRules = [], isLoading: loadingBusiness } = useQuery({
    queryKey: ["rules", "in_review", "business_rule"],
    queryFn: () => api.rules.list({ status: "in_review", kind: "business_rule" }),
    refetchInterval: 30_000,
  });
  const { data: archRules = [], isLoading: loadingArch } = useQuery({
    queryKey: ["rules", "in_review", "architecture"],
    queryFn: () => api.rules.list({ status: "in_review", kind: "architecture" }),
    refetchInterval: 30_000,
  });
  const rules = [...businessRules, ...archRules];
  const isLoading = loadingBusiness || loadingArch;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Record<string, Verdict>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [approveError, setApproveError] = useState<string | null>(null);
  // S3: bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkVerdict, setBulkVerdict] = useState<Verdict>("approved");
  const [bulkComment, setBulkComment] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: ({ id, v, c }: { id: string; v: Verdict; c: string }) =>
      api.rules.feedback(id, {
        verdict: v,
        comment: c || undefined,
      }),
    onSuccess: () => {
      setApproveError(null);
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (err: unknown) => {
      const e = err as { status?: number; message?: string };
      if (e?.status === 403) {
        setApproveError("Not allowed: your role does not meet the minimum required to approve this rule.");
      }
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, v, c }: { ids: string[]; v: Verdict; c: string }) =>
      api.rules.bulkFeedback({
        ruleIds: ids,
        verdict: v,
        comment: c || undefined,
      }),
    onSuccess: () => {
      setSelected(new Set());
      setBulkComment("");
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(rules.map((r) => r.id)));
  }

  function submitBulk() {
    if ((bulkVerdict === "rejected" || bulkVerdict === "needs_clarification") && !bulkComment.trim()) {
      alert("A comment is required when rejecting or requesting clarification.");
      return;
    }
    bulkMutation.mutate({ ids: [...selected], v: bulkVerdict, c: bulkComment });
  }

  function submit(rule: Rule) {
    const v = verdict[rule.id];
    const c = comment[rule.id] ?? "";
    if (!v) return;
    if ((v === "rejected" || v === "needs_clarification") && !c.trim()) {
      alert("A comment is required when rejecting or requesting clarification.");
      return;
    }
    feedbackMutation.mutate({ id: rule.id, v, c });
    setExpanded(null);
    setVerdict((p) => { const n = { ...p }; delete n[rule.id]; return n; });
    setComment((p) => { const n = { ...p }; delete n[rule.id]; return n; });
  }

  // Detect which rules share a source (path + symbol) with at least one other rule in the queue
  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i].sources ?? [];
        const b = rules[j].sources ?? [];
        const clash = a.some((sa) =>
          b.some(
            (sb) =>
              sa.path && sb.path && sa.path === sb.path &&
              sa.symbol && sb.symbol && sa.symbol === sb.symbol
          )
        );
        if (clash) { ids.add(rules[i].id); ids.add(rules[j].id); }
      }
    }
    return ids;
  }, [rules]);

  // Group by subflow (fall back to flow if no subflow)
  const bySubflow = rules.reduce<Record<string, Rule[]>>((acc, r) => {
    const key = r.subflow || r.flow || "Architecture";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  const subflows = Object.keys(bySubflow).sort();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Review Queue</h1>
          <p className="page-subtitle">{rules.length} rule{rules.length !== 1 ? "s" : ""} awaiting review</p>
        </div>
      </div>

      <div className="page-body">
        {isLoading && <div className="empty-state"><p className="empty-state-desc">Loading…</p></div>}

        {!isLoading && rules.length === 0 && (
          <div className="empty-state">
            <ClipboardCheck className="empty-state-icon" />
            <p className="empty-state-title">Queue is empty</p>
            <p className="empty-state-desc">All caught up! New rules submitted by agents will appear here.</p>
          </div>
        )}

        {/* S3: bulk action bar */}
        {rules.length > 0 && (
          <div className="bulk-bar">
            <button className="bulk-select-all" onClick={selected.size === rules.length ? () => setSelected(new Set()) : selectAll}>
              {selected.size === rules.length
                ? <CheckSquare size={14} />
                : <Square size={14} />
              }
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </button>

            {selected.size > 0 && (
              <>
                <div className="bulk-verdict-buttons">
                  {(["approved", "rejected", "needs_clarification"] as Verdict[]).map((v) => (
                    <button
                      key={v}
                      className={`btn btn-sm ${bulkVerdict === v ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setBulkVerdict(v)}
                    >
                      {v === "approved" ? "Approve" : v === "rejected" ? "Reject" : "Clarify"}
                    </button>
                  ))}
                </div>
                {(bulkVerdict === "rejected" || bulkVerdict === "needs_clarification") && (
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 200 }}
                    placeholder="Comment (required)…"
                    value={bulkComment}
                    onChange={(e) => setBulkComment(e.target.value)}
                  />
                )}
                <button
                  className="btn btn-primary btn-sm"
                  onClick={submitBulk}
                  disabled={bulkMutation.isPending}
                >
                  Submit {selected.size}
                </button>
              </>
            )}
          </div>
        )}

        {subflows.map((subflow) => (
          <div key={subflow} className="flow-group">
            <div className="flow-group-header">
              <span className="flow-group-name">{subflow}</span>
              <span className="flow-group-count">
                {bySubflow[subflow].length} rule{bySubflow[subflow].length !== 1 ? "s" : ""}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bySubflow[subflow].map((rule) => {
                const isOpen = expanded === rule.id;
                const v = verdict[rule.id] as Verdict | undefined;
                const needsComment = v === "rejected" || v === "needs_clarification";

                // Role gate: check if user's role meets the flow's policy
                const minRole = policyByFlow[rule.flow];
                const canApprove = !minRole || roleRank(user?.role) >= roleRank(minRole);

                return (
                  <div key={rule.id} className={`card ${selected.has(rule.id) ? "card-selected" : ""}`}>
                    <button
                      className="expand-toggle"
                      onClick={() => setExpanded(isOpen ? null : rule.id)}
                      aria-expanded={isOpen}
                    >
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="rule-card-title">{rule.title}</span>
                          <StatusChip value={rule.confidence} type="confidence" />
                          {overlapIds.has(rule.id) && (
                            <span className="overlap-badge" title="Another rule in this queue references the same source">
                              <AlertTriangle size={11} />
                              source overlap
                            </span>
                          )}
                        </div>
                        <div className="rule-card-meta">
                          <span>{rule.flow}</span>
                          {rule.subflow && <><span className="rule-card-meta-dot">›</span><span>{rule.subflow}</span></>}
                        </div>
                        <EntityPills entities={rule.entities} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          className="checkbox-btn"
                          onClick={(e) => { e.stopPropagation(); toggleSelect(rule.id); }}
                          aria-label={selected.has(rule.id) ? "Deselect" : "Select"}
                        >
                          {selected.has(rule.id)
                            ? <CheckSquare size={16} style={{ color: "var(--primary)" }} />
                            : <Square size={16} style={{ color: "var(--text-muted)" }} />
                          }
                        </button>
                        <ChevronDown size={16} className={`expand-chevron ${isOpen ? "open" : ""}`} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="expand-body">
                        {/* Product Description */}
                        <div className="detail-section" style={{ marginTop: "var(--space-4)" }}>
                          <p className="section-label">Product Description</p>
                          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                            {rule.content?.productDescription}
                          </p>
                        </div>

                        {/* Technical Description — code block style */}
                        <div className="detail-section">
                          <p className="section-label">Technical Description</p>
                          <div className="tech-desc">
                            {rule.content?.technicalDescription}
                          </div>
                        </div>

                        {/* Sources */}
                        {rule.sources.length > 0 && (
                          <div className="detail-section">
                            <p className="section-label">Sources</p>
                            <div className="source-list">
                              {rule.sources.map((s, i) => (
                                <span key={i} className="source-pill" title={s.path}>
                                  <Code2 size={11} />
                                  <span className="source-file">{shortPath(s.path ?? "")}</span>
                                  {s.symbol && <><span className="source-sep">·</span><span className="source-symbol">{s.symbol}</span></>}
                                  {s.lines  && <><span className="source-sep">·</span><span className="source-lines">{s.lines}</span></>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Open Questions */}
                        {(rule.content?.openQuestions ?? []).length > 0 && (
                          <div className="detail-section">
                            <p className="section-label open-questions-label">Open Questions</p>
                            <ul className="open-questions-list">
                              {(rule.content?.openQuestions ?? []).map((q, i) => (
                                <li key={i}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Verdict bar */}
                        <div className="verdict-bar">
                          <div className="verdict-buttons">
                            <button
                              className={`btn btn-verdict-approve ${v === "approved" ? "active" : ""}`}
                              onClick={() => { setApproveError(null); setVerdict((p) => ({ ...p, [rule.id]: "approved" })); }}
                              disabled={!canApprove}
                              title={!canApprove && minRole ? `requires ${minRole}` : undefined}
                            >
                              <CheckCircle size={14} />
                              Approve
                            </button>
                            {!canApprove && minRole && (
                              <span className="chip chip-muted" style={{ fontSize: "var(--text-xs)" }}>
                                requires {minRole}
                              </span>
                            )}
                            <button
                              className={`btn btn-verdict-reject ${v === "rejected" ? "active" : ""}`}
                              onClick={() => setVerdict((p) => ({ ...p, [rule.id]: "rejected" }))}
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                            <button
                              className={`btn btn-verdict-clarify ${v === "needs_clarification" ? "active" : ""}`}
                              onClick={() => setVerdict((p) => ({ ...p, [rule.id]: "needs_clarification" }))}
                            >
                              <HelpCircle size={14} />
                              Needs Clarification
                            </button>
                          </div>

                          {approveError && v === "approved" && (
                            <p className="form-error" style={{ marginTop: "var(--space-2)" }}>
                              {approveError}
                            </p>
                          )}

                          {needsComment && (
                            <textarea
                              className="textarea"
                              placeholder="Leave a comment explaining what needs to change… (required)"
                              value={comment[rule.id] ?? ""}
                              onChange={(e) => setComment((p) => ({ ...p, [rule.id]: e.target.value }))}
                            />
                          )}

                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => submit(rule)}
                              disabled={!v || feedbackMutation.isPending}
                            >
                              Submit Verdict
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
