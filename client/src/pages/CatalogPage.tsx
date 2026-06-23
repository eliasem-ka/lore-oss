import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, FileText } from "lucide-react";
import { api } from "../lib/api.js";
import { StatusChip } from "../components/StatusChip.js";
import { EntityPills } from "../components/EntityPills.js";

type Confidence = "high" | "medium" | "low";
const CONFIDENCE_OPTIONS: Confidence[] = ["high", "medium", "low"];

export function CatalogPage() {
  const [q, setQ] = useState("");
  const [flow, setFlow] = useState("");
  const [confidence, setConfidence] = useState<Confidence | "">("");
  const navigate = useNavigate();

  const { data: businessRules = [], isLoading: loadingBusiness } = useQuery({
    queryKey: ["rules", "approved", "business_rule", q, flow, confidence],
    queryFn: () =>
      api.rules.list({
        status: "approved",
        kind: "business_rule",
        query: q || undefined,
        flow: flow || undefined,
        confidence: confidence || undefined,
      }),
  });
  const { data: archRules = [], isLoading: loadingArch } = useQuery({
    queryKey: ["rules", "approved", "architecture", q, flow, confidence],
    queryFn: () =>
      api.rules.list({
        status: "approved",
        kind: "architecture",
        query: q || undefined,
        flow: flow || undefined,
        confidence: confidence || undefined,
      }),
  });
  const rules = [...businessRules, ...archRules];
  const isLoading = loadingBusiness || loadingArch;

  const byFlow = rules.reduce<Record<string, typeof rules>>((acc, r) => {
    const key = r.flow || r.subflow || "Architecture";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catalog</h1>
          <p className="page-subtitle">{rules.length} approved rule{rules.length !== 1 ? "s" : ""}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div className="input-row" style={{ flex: 1, maxWidth: 480, justifyContent: "flex-end" }}>
            <div className="search-wrapper">
              <Search className="search-icon" />
              <input
                className="input"
                placeholder="Search rules…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <input
              className="input"
              style={{ maxWidth: 160 }}
              placeholder="Flow…"
              value={flow}
              onChange={(e) => setFlow(e.target.value)}
            />
          </div>
          {/* S3: confidence filter chips */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={`filter-chip ${confidence === "" ? "active" : ""}`}
              onClick={() => setConfidence("")}
            >
              All
            </button>
            {CONFIDENCE_OPTIONS.map((c) => (
              <button
                key={c}
                className={`filter-chip filter-chip-${c} ${confidence === c ? "active" : ""}`}
                onClick={() => setConfidence(confidence === c ? "" : c)}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
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
            <FileText className="empty-state-icon" />
            <p className="empty-state-title">No approved rules yet</p>
            <p className="empty-state-desc">
              Once a reviewer approves rules in the Review Queue, they'll appear here.
            </p>
          </div>
        )}

        {Object.entries(byFlow).map(([flowName, flowRules]) => (
          <div key={flowName} className="flow-group">
            <div className="flow-group-header">
              <span className="flow-group-name">{flowName}</span>
              <span className="flow-group-count">{flowRules.length} rule{flowRules.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flowRules.map((rule) => (
                <div
                  key={rule.id}
                  className="card card-clickable"
                  onClick={() => navigate(`/rule/${rule.id}`)}
                >
                  <div className="rule-card">
                    <div className="rule-card-header">
                      <span className="rule-card-title">{rule.title}</span>
                      <div className="rule-card-chips">
                        <StatusChip value={rule.confidence} type="confidence" />
                        <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                      </div>
                    </div>
                    <p className="rule-card-desc">
                      {rule.content?.productDescription
                        ? rule.content.productDescription.length > 150
                          ? `${rule.content.productDescription.slice(0, 150)}…`
                          : rule.content.productDescription
                        : null}
                    </p>
                    <div className="rule-card-meta">
                      {rule.subflow && <span>{rule.subflow}</span>}
                      {rule.subflow && <span className="rule-card-meta-dot">·</span>}
                      <span>v{rule.currentVersion}</span>
                      <span className="rule-card-meta-dot">·</span>
                      <span>{rule.sources.length} source{rule.sources.length !== 1 ? "s" : ""}</span>
                    </div>
                    <EntityPills entities={rule.entities} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
