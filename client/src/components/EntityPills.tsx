import type { EntityLink } from "../lib/api.js";

const ROLE_LABELS: Record<string, string> = {
  applies_to: "→",
  excludes: "✕",
  requires: "req",
  modifies: "mod",
};

// Deterministic pastel color from category string
function categoryColor(cat: string): string {
  const colors = [
    "var(--pastel-mint)",
    "var(--pastel-yellow)",
    "var(--pastel-lavender)",
    "var(--pastel-pink)",
    "#e0f0ff",
    "#fde8d8",
  ];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function categoryTextColor(cat: string): string {
  const colors = [
    "var(--pastel-mint-text)",
    "var(--pastel-yellow-text)",
    "var(--pastel-lavender-text)",
    "var(--pastel-pink-text)",
    "#1a5276",
    "#7d4800",
  ];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export function EntityPills({ entities }: { entities?: EntityLink[] }) {
  if (!entities?.length) return null;
  return (
    <div className="entity-pills">
      {entities.map((e) => (
        <span
          key={e.key}
          className="entity-pill"
          title={`${e.key} — ${e.role.replace("_", " ")}`}
          style={{
            background: categoryColor(e.category),
            color: categoryTextColor(e.category),
          }}
        >
          <span className="entity-pill-role">{ROLE_LABELS[e.role] ?? e.role}</span>
          {e.name}
        </span>
      ))}
    </div>
  );
}
