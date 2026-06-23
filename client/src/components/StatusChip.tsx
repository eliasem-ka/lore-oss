const LABELS: Record<string, string> = {
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  refining: "Refining",
  needs_clarification: "Needs Clarification",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function StatusChip({ value, type = "status" }: { value: string; type?: "status" | "confidence" }) {
  const cls = type === "confidence" ? `chip chip-conf-${value}` : `chip chip-${value}`;
  return <span className={cls}>{LABELS[value] ?? value}</span>;
}
