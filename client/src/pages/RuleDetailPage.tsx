import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Code2, Layers, GitBranch, AlertTriangle, Boxes, Workflow } from "lucide-react";
import { api, type RuleDetail, type Diagram, type ExternalLink } from "../lib/api.js";
import { StatusChip } from "../components/StatusChip.js";
import { EntityPills } from "../components/EntityPills.js";
import { MermaidDiagram } from "../components/MermaidDiagram.js";

function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

const DIAGRAM_LABELS: Record<string, string> = {
  c4_context: "C4 — System Context",
  c4_container: "C4 — Container",
  c4_component: "C4 — Component",
  sequence: "Sequence",
  call_graph: "Call Graph",
};

function diagramLabel(type: string): string {
  return DIAGRAM_LABELS[type] ?? type;
}

// Architecture units store their substance in `content` (overview, tech stack,
// diagrams, risk) rather than product/technical descriptions. Render all of it.
function ArchitectureBody({ rule, navigate }: { rule: RuleDetail; navigate: (to: string) => void }) {
  const c = rule.content ?? {};
  const techGroups: [string, string[] | undefined][] = [
    ["Endpoints", c.techStack?.endpoints],
    ["Libraries", c.techStack?.libraries],
    ["Persistence", c.techStack?.persistence],
  ];
  const hasTech = techGroups.some(([, v]) => v && v.length > 0);

  return (
    <>
      {/* Hierarchy: parent + children */}
      {(rule.parent || (rule.children && rule.children.length > 0)) && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Hierarchy</p>
          {rule.parent && (
            <button className="arch-link" onClick={() => navigate(`/rule/${rule.parent!.id}`)}>
              <Boxes size={13} /> Parent: {rule.parent.title}
            </button>
          )}
          {rule.children && rule.children.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: rule.parent ? 8 : 0 }}>
              {rule.children.map((ch) => (
                <button key={ch.id} className="arch-link" onClick={() => navigate(`/rule/${ch.id}`)}>
                  <Layers size={13} /> {ch.unitType ?? "layer"}: {ch.title}
                  <span style={{ marginLeft: "auto" }}><StatusChip value={ch.status} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview */}
      {c.overview && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 8 }}>Overview</p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.75 }}>
            {c.overview}
          </p>
        </div>
      )}

      {/* Diagrams — the crown jewel */}
      {c.diagrams && c.diagrams.length > 0 && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 12 }}>
            Diagrams <span style={{ color: "var(--text-muted)" }}>({c.diagrams.length})</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {c.diagrams.map((d: Diagram, i) => (
              <div key={i} className="diagram-block">
                <div className="diagram-header">
                  <Workflow size={13} />
                  <span>{diagramLabel(d.type)}</span>
                </div>
                <div className="diagram-canvas">
                  <MermaidDiagram source={d.source} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tech stack */}
      {hasTech && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Tech Stack</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {techGroups.map(([label, items]) =>
              items && items.length > 0 ? (
                <div key={label}>
                  <p className="arch-subhead">{label}</p>
                  <div className="source-list">
                    {items.map((it, i) => (
                      <span key={i} className="source-pill"><Code2 size={11} />{it}</span>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Entry points */}
      {c.entryPoints && c.entryPoints.length > 0 && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 8 }}>Entry Points</p>
          <ul className="arch-list">
            {c.entryPoints.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Patterns + dependencies */}
      {((c.patterns && c.patterns.length > 0) || (c.dependencies && c.dependencies.length > 0)) && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          {c.patterns && c.patterns.length > 0 && (
            <>
              <p className="section-label" style={{ marginBottom: 8 }}>Patterns</p>
              <div className="source-list" style={{ marginBottom: c.dependencies?.length ? 14 : 0 }}>
                {c.patterns.map((p, i) => <span key={i} className="pattern-pill">{p}</span>)}
              </div>
            </>
          )}
          {c.dependencies && c.dependencies.length > 0 && (
            <>
              <p className="section-label" style={{ marginBottom: 8 }}>Dependencies</p>
              <div className="source-list">
                {c.dependencies.map((d, i) => (
                  <span key={i} className="pattern-pill"><GitBranch size={11} />{d}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Risk */}
      {c.risk && (c.risk.level || c.risk.notes) && (
        <div className={`card risk-card risk-${c.risk.level ?? "unknown"}`} style={{ padding: "var(--space-5)" }}>
          <p className="section-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={13} /> Risk
            {c.risk.level && <span style={{ marginLeft: 4 }}><StatusChip value={c.risk.level} type="confidence" /></span>}
          </p>
          {c.risk.notes && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{c.risk.notes}</p>
          )}
        </div>
      )}

      {/* Provenance */}
      {c.provenance && (c.provenance.indexCommit || c.provenance.generatedAt) && (
        <div className="provenance-strip">
          {c.provenance.indexCommit && (
            <span title="Commit the docs were generated against">
              indexed @ <code>{c.provenance.indexCommit.slice(0, 10)}</code>
            </span>
          )}
          {c.provenance.generatedAt && (
            <span>· generated {new Date(c.provenance.generatedAt).toLocaleString()}</span>
          )}
        </div>
      )}
    </>
  );
}

export function RuleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rule, isLoading, isError } = useQuery({
    queryKey: ["rule", id],
    queryFn: () => api.rules.get(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="page-body">
        <div className="empty-state"><p className="empty-state-desc">Loading…</p></div>
      </div>
    );
  }

  if (isError || !rule) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <p className="empty-state-title">Rule not found</p>
          <button className="btn btn-ghost" onClick={() => navigate("/")}>Back to Catalog</button>
        </div>
      </div>
    );
  }

  const isArchitecture = rule.kind === "architecture";

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title" style={{ fontSize: "var(--text-lg)" }}>{rule.title}</h1>
            <div className="rule-card-meta" style={{ marginTop: 4 }}>
              {isArchitecture && rule.unitType && <><span className="unit-type-pill">{rule.unitType}</span><span className="rule-card-meta-dot">·</span></>}
              {rule.flow && <span>{rule.flow}</span>}
              {rule.subflow && <><span className="rule-card-meta-dot">›</span><span>{rule.subflow}</span></>}
              {rule.flow && <span className="rule-card-meta-dot">·</span>}
              <span>v{rule.currentVersion}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusChip value={rule.status} />
          <StatusChip value={rule.confidence} type="confidence" />
        </div>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Entity pills */}
        {rule.entities && rule.entities.length > 0 && (
          <EntityPills entities={rule.entities} />
        )}

        {/* External links (e.g. Jira tickets) */}
        {rule.externalLinks && rule.externalLinks.length > 0 && (
          <div className="source-list">
            {rule.externalLinks.map((link: ExternalLink) => (
              <a
                key={`${link.system}:${link.externalKey}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="source-pill"
              >
                {capitalize(link.system)}: {link.externalKey}
              </a>
            ))}
          </div>
        )}

        {isArchitecture ? (
          <ArchitectureBody rule={rule} navigate={navigate} />
        ) : (
          <>
            {/* Product description */}
            <div className="card" style={{ padding: "var(--space-5)" }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Product Description</p>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                {rule.content?.productDescription}
              </p>
            </div>

            {/* Technical description */}
            <div className="card" style={{ padding: "var(--space-5)" }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Technical Description</p>
              <div className="tech-desc">{rule.content?.technicalDescription}</div>
            </div>
          </>
        )}

        {/* Sources */}
        {rule.sources.length > 0 && (
          <div className="card" style={{ padding: "var(--space-5)" }}>
            <p className="section-label" style={{ marginBottom: 8 }}>Sources</p>
            <div className="source-list">
              {rule.sources.map((s, i) => (
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

        {/* Open questions */}
        {(rule.content?.openQuestions ?? []).length > 0 && (
          <div className="card" style={{ padding: "var(--space-5)" }}>
            <p className="section-label open-questions-label" style={{ marginBottom: 8 }}>Open Questions</p>
            <ul className="open-questions-list">
              {(rule.content?.openQuestions ?? []).map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}

        {/* Feedback history */}
        {rule.feedback.length > 0 && (
          <div className="card" style={{ padding: "var(--space-5)" }}>
            <p className="section-label" style={{ marginBottom: 8 }}>Review History</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rule.feedback.map((fb) => (
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

        {/* Version history */}
        {rule.unitVersions.length > 1 && (
          <div className="card" style={{ padding: "var(--space-5)" }}>
            <p className="section-label" style={{ marginBottom: 8 }}>Version History</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...rule.unitVersions].sort((a, b) => b.version - a.version).map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "var(--text-sm)" }}>
                  <span className="version-pill">v{v.version}</span>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(v.createdAt).toLocaleDateString()}</span>
                  {v.changeNote && <span style={{ color: "var(--text-secondary)" }}>{v.changeNote}</span>}
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>by {v.createdBy}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
