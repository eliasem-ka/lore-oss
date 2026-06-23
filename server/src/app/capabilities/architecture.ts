import { defineCapability, type Capability } from "../registry.js";
import { submitArchitectureUnit, LoopError } from "../../services/loop.js";
import { SubmitArchitectureUnitSchema, SubmitArchitectureUnitShape } from "../../schemas/architecture.js";

export const architectureCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "submitArchitectureUnit",
    input: SubmitArchitectureUnitSchema,
    handler: async (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const result = await submitArchitectureUnit(input as any, ctx.workspaceId);
      ctx.bus.emit({ type: "UnitContentChanged", unitId: result.unit.id, kind: "architecture", version: result.version });
      if (result.status === "published") {
        ctx.bus.emit({ type: "UnitPublished", unitId: result.unit.id });
      }
      return result;
    },
    rest: { method: "post", path: "/architecture-units" },
    mcp: {
      tool: "submit_architecture_unit",
      description:
        "Submit an architecture unit (feature root or layer sub-unit) for a project. High confidence is auto-surfaced (status 'published', searchable immediately but NOT human-approved); medium/low enters human review. Resubmitting an existing ruleKey creates a new version. A unit a human has already judged re-enters review instead of auto-surfacing.",
      shape: SubmitArchitectureUnitShape.shape,
      render: ({ unit, merged, version, status, warnings, relatedApproved }: any) => {
        const lines: string[] = [];
        lines.push(
          merged
            ? `✓ Merged into existing unit "${unit.title}" (${unit.unitKey ?? unit.id}) → now at v${version}`
            : `✓ Created architecture unit "${unit.title}" (${unit.unitType}) → v${version}`
        );
        lines.push(`  unit_id: ${unit.id}`);
        lines.push(`  status: ${status}${status === "published" ? "  (auto-surfaced — awaiting optional human ratification)" : "  (in human review)"}`);

        if (warnings.length > 0) {
          lines.push(`\n⚠ Source overlap warnings (${warnings.length}):`);
          for (const w of warnings) {
            lines.push(`  - "${w.existingRuleTitle}" (${w.existingRuleId}) already references: ${w.overlapSource}`);
          }
        }
        if (relatedApproved.length > 0) {
          lines.push(`\n📚 Already-approved architecture units in this project (${relatedApproved.length}):`);
          for (const r of relatedApproved.slice(0, 5)) {
            lines.push(`  - "${r.title}"${r.unitKey ? ` [${r.unitKey}]` : ""} (${r.id})`);
          }
        }
        return lines.join("\n");
      },
    },
  }),
];
