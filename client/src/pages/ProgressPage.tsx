import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowUpRight, Circle, CheckCircle2 } from "lucide-react";
import { api, type Progress, type Round } from "../lib/api.js";

const STATUS_ORDER = ["approved", "in_review", "rejected", "refining"] as const;

const STATUS_META: Record<string, { label: string; color: string; cardClass: string; textColor: string }> = {
  approved:  { label: "Approved",  color: "var(--status-approved)",  cardClass: "kpi-card-approved",  textColor: "var(--pastel-mint-text)" },
  in_review: { label: "In Review", color: "var(--status-in-review)", cardClass: "kpi-card-in_review", textColor: "var(--pastel-yellow-text)" },
  rejected:  { label: "Rejected",  color: "var(--status-rejected)",  cardClass: "kpi-card-rejected",  textColor: "var(--pastel-pink-text)" },
  refining:  { label: "Refining",  color: "var(--status-refining)",  cardClass: "kpi-card-refining",  textColor: "var(--pastel-lavender-text)" },
};

function ProgressBar({ counts }: { counts: Progress["totals"] }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>No rules yet.</p>;

  return (
    <div>
      <div className="progress-bar-track">
        {STATUS_ORDER.map((s) => {
          const pct = (counts[s] / total) * 100;
          if (!pct) return null;
          return (
            <div
              key={s}
              className="progress-bar-seg"
              style={{ width: `${pct}%`, background: STATUS_META[s].color }}
              title={`${STATUS_META[s].label}: ${counts[s]}`}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
        {STATUS_ORDER.map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)" }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_META[s].color, flexShrink: 0 }} />
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{STATUS_META[s].label}</span>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{counts[s]}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 500 }}>
          Total <strong style={{ color: "var(--text-primary)" }}>{total}</strong>
        </div>
      </div>
    </div>
  );
}

function RoundCard({ round }: { round: Round }) {
  const scope = round.scope;
  const isOpen = round.status === "open";
  const elapsed = Math.round((Date.now() - new Date(round.createdAt).getTime()) / 60000);
  const elapsedLabel = elapsed < 60
    ? `${elapsed}m ago`
    : elapsed < 1440
    ? `${Math.round(elapsed / 60)}h ago`
    : `${Math.round(elapsed / 1440)}d ago`;

  return (
    <div className="round-card">
      <div className="round-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isOpen
            ? <Circle size={10} style={{ color: "var(--status-in-review)", fill: "var(--status-in-review)" }} />
            : <CheckCircle2 size={10} style={{ color: "var(--status-approved)" }} />
          }
          <span className="round-card-label">{round.sourceLabel}</span>
          <span className="round-card-kind">{round.sourceKind}</span>
        </div>
        <span className="round-card-elapsed">{elapsedLabel}</span>
      </div>
      <div className="round-card-meta">
        {round.ownerName && (
          <span className="round-card-owner">{round.ownerName}</span>
        )}
        {scope?.flows?.length ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {scope.flows.map((f) => (
              <span key={f} className="scope-chip">{f}</span>
            ))}
          </div>
        ) : (
          <span className="scope-chip scope-chip-global">all flows</span>
        )}
      </div>
    </div>
  );
}

export function ProgressPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["progress"],
    queryFn: api.progress,
    refetchInterval: 15_000,
  });

  if (isLoading) return <div className="empty-state"><p className="empty-state-desc">Loading…</p></div>;
  if (!data) return null;

  const total = Object.values(data.totals).reduce((a, b) => a + b, 0);
  const openRounds = data.openRounds ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Progress</h1>
          <p className="page-subtitle">
            {total} rule{total !== 1 ? "s" : ""} across {Object.keys(data.byFlow).length} flow{Object.keys(data.byFlow).length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="page-body">
        {/* Pastel KPI grid */}
        <div className="kpi-grid">
          {STATUS_ORDER.map((s) => (
            <div key={s} className={`kpi-card ${STATUS_META[s].cardClass}`}>
              <button className="btn-icon kpi-arrow" style={{ background: "rgba(0,0,0,0.08)" }}>
                <ArrowUpRight size={13} />
              </button>
              <span className="kpi-label" style={{ color: STATUS_META[s].textColor }}>{STATUS_META[s].label}</span>
              <span className="kpi-value" style={{ color: STATUS_META[s].textColor }}>{data.totals[s]}</span>
            </div>
          ))}
        </div>

        {/* S2: Active Rounds panel */}
        {openRounds.length > 0 && (
          <div className="card card-body" style={{ marginBottom: 24 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>
              Active Rounds
              <span className="round-count-badge">{openRounds.length}</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openRounds.map((r) => <RoundCard key={r.id} round={r} />)}
            </div>
          </div>
        )}

        {/* Overall bar */}
        <div className="card card-body" style={{ marginBottom: 24 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Overall</p>
          <ProgressBar counts={data.totals} />
        </div>

        {/* By flow */}
        {Object.keys(data.byFlow).length > 0 && (
          <>
            <p className="section-label" style={{ marginBottom: 12 }}>By Flow</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(data.byFlow).sort().map(([flow, counts]) => {
                const flowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
                return (
                  <div key={flow} className="card card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-md)" }}>{flow}</span>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600 }}>
                        {flowTotal} rule{flowTotal !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <ProgressBar counts={counts} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {Object.keys(data.byFlow).length === 0 && (
          <div className="empty-state">
            <BarChart2 className="empty-state-icon" />
            <p className="empty-state-title">No data yet</p>
            <p className="empty-state-desc">Submit rule candidates via the MCP server to start tracking progress.</p>
          </div>
        )}
      </div>
    </>
  );
}
