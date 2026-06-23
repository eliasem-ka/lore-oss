import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronDown, Users, X, Check } from "lucide-react";
import { api, type Entity } from "../lib/api.js";

const ROLE_LABELS: Record<string, string> = {
  applies_to: "applies to",
  excludes: "excludes",
  requires: "requires",
  modifies: "modifies",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "var(--status-approved)",
  in_review: "var(--status-in-review)",
  rejected: "var(--status-rejected)",
  refining: "var(--status-refining)",
};

type FormData = {
  key: string;
  category: string;
  name: string;
  description: string;
  attributes: { k: string; v: string }[];
};

const EMPTY_FORM: FormData = { key: "", category: "", name: "", description: "", attributes: [] };

function EntityForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial: FormData;
  onSave: (data: FormData) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial);

  function set(field: keyof Omit<FormData, "attributes">, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addAttr() {
    setForm((f) => ({ ...f, attributes: [...f.attributes, { k: "", v: "" }] }));
  }

  function setAttr(i: number, field: "k" | "v", value: string) {
    setForm((f) => {
      const attrs = [...f.attributes];
      attrs[i] = { ...attrs[i], [field]: value };
      return { ...f, attributes: attrs };
    });
  }

  function removeAttr(i: number) {
    setForm((f) => ({ ...f, attributes: f.attributes.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="entity-form">
      {isNew && (
        <div className="entity-form-row">
          <label className="entity-form-label">Key *</label>
          <input
            className="input"
            placeholder="category.name  (e.g. customer_type.vip)"
            value={form.key}
            onChange={(e) => set("key", e.target.value)}
          />
          <p className="entity-form-hint">Format: category.name — lowercase, underscores only</p>
        </div>
      )}
      <div className="entity-form-row">
        <label className="entity-form-label">Category *</label>
        <input
          className="input"
          placeholder="customer_type / order_status / payment_method / coupon_type …"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        />
      </div>
      <div className="entity-form-row">
        <label className="entity-form-label">Name *</label>
        <input
          className="input"
          placeholder="Human-readable name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="entity-form-row">
        <label className="entity-form-label">Description</label>
        <textarea
          className="textarea"
          placeholder="What does this entity represent? When does it apply?"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
        />
      </div>
      <div className="entity-form-row">
        <label className="entity-form-label">Attributes</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {form.attributes.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input className="input" placeholder="key" value={a.k} onChange={(e) => setAttr(i, "k", e.target.value)} style={{ flex: 1 }} />
              <input className="input" placeholder="value" value={a.v} onChange={(e) => setAttr(i, "v", e.target.value)} style={{ flex: 2 }} />
              <button className="btn-icon" onClick={() => removeAttr(i)} style={{ color: "var(--text-muted)" }}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={addAttr}>
            <Plus size={12} /> Add attribute
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>
          <Check size={13} /> {isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}

function formToPayload(f: FormData) {
  const attrs = f.attributes.filter((a) => a.k.trim());
  return {
    key: f.key.trim(),
    category: f.category.trim(),
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    attributes: attrs.length ? Object.fromEntries(attrs.map((a) => [a.k.trim(), a.v.trim()])) : undefined,
  };
}

function entityToForm(e: Entity): FormData {
  return {
    key: e.key,
    category: e.category,
    name: e.name,
    description: e.description ?? "",
    attributes: e.attributes ? Object.entries(e.attributes).map(([k, v]) => ({ k, v: String(v) })) : [],
  };
}

export function EntitiesPage() {
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useQuery({
    queryKey: ["entities"],
    queryFn: () => api.entities.list(),
  });

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["entity", expandedKey],
    queryFn: () => api.entities.get(expandedKey!),
    enabled: !!expandedKey,
  });

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.entities.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entities"] }); setCreating(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, body }: { key: string; body: unknown }) => api.entities.update(key, body),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["entity", key] });
      setEditingKey(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.entities.delete(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] });
      setExpandedKey(null);
    },
  });

  const byCategory = all.reduce<Record<string, Entity[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Domain Entities</h1>
          <p className="page-subtitle">{all.length} entities across {Object.keys(byCategory).length} categories</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreating(true); setEditingKey(null); }}>
          <Plus size={14} /> New Entity
        </button>
      </div>

      <div className="page-body">
        {isLoading && <div className="empty-state"><p className="empty-state-desc">Loading…</p></div>}

        {creating && (
          <div className="card card-body" style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>New Entity</p>
            <EntityForm
              initial={EMPTY_FORM}
              isNew
              onCancel={() => setCreating(false)}
              onSave={(f) => createMutation.mutate(formToPayload(f))}
            />
          </div>
        )}

        {!isLoading && all.length === 0 && !creating && (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">No entities yet</p>
            <p className="empty-state-desc">Add customer types, order statuses, payment methods and other domain concepts that business rules reference.</p>
          </div>
        )}

        {Object.entries(byCategory).sort().map(([category, items]) => (
          <div key={category} className="entity-category-group">
            <div className="entity-category-header">
              <span className="entity-category-label">{category.replace(/_/g, " ")}</span>
              <span className="entity-category-count">{items.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((entity) => {
                const isExpanded = expandedKey === entity.key;
                const isEditing = editingKey === entity.key;

                return (
                  <div key={entity.key} className="card">
                    <button
                      className="expand-toggle"
                      onClick={() => {
                        setExpandedKey(isExpanded ? null : entity.key);
                        setEditingKey(null);
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="rule-card-title">{entity.name}</span>
                          <span className="entity-key-chip">{entity.key}</span>
                        </div>
                        {entity.description && (
                          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                            {entity.description}
                          </p>
                        )}
                        {entity.attributes && Object.keys(entity.attributes).length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {Object.entries(entity.attributes).map(([k, v]) => (
                              <span key={k} className="entity-attr-chip">
                                <span className="entity-attr-key">{k}</span>
                                <span className="entity-attr-val">{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="entity-source-badge">{entity.source}</span>
                        <ChevronDown size={16} className={`expand-chevron ${isExpanded ? "open" : ""}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="expand-body">
                        {isEditing ? (
                          <EntityForm
                            initial={entityToForm(entity)}
                            isNew={false}
                            onCancel={() => setEditingKey(null)}
                            onSave={(f) => updateMutation.mutate({ key: entity.key, body: formToPayload(f) })}
                          />
                        ) : (
                          <>
                            {detail?.key === entity.key && detail.rules.length > 0 && (
                              <div className="detail-section" style={{ marginTop: "var(--space-4)" }}>
                                <p className="section-label">Referenced by {detail.rules.length} rule{detail.rules.length !== 1 ? "s" : ""}</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {detail.rules.map((r) => (
                                    <div key={r.id} className="entity-rule-ref">
                                      <span className="entity-rule-role">{ROLE_LABELS[r.role] ?? r.role}</span>
                                      <span className="entity-rule-title">{r.title}</span>
                                      <span className="entity-rule-flow">{r.flow}</span>
                                      <span
                                        className="entity-rule-status"
                                        style={{ color: STATUS_COLORS[r.status] }}
                                      >
                                        {r.status.replace("_", " ")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {detail?.key === entity.key && detail.rules.length === 0 && (
                              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", padding: "var(--space-4) 0" }}>
                                No rules reference this entity yet.
                              </p>
                            )}
                            <div style={{ display: "flex", gap: 8, marginTop: "var(--space-4)" }}>
                              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditingKey(entity.key); }}>
                                <Pencil size={12} /> Edit
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--status-rejected)" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete "${entity.name}"?`)) deleteMutation.mutate(entity.key);
                                }}
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </>
                        )}
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
