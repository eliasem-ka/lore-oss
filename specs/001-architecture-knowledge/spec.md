# Feature Specification: Architecture Knowledge

**Feature Branch**: `001-architecture-knowledge`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "Extend Lore from a business-rules catalog into a project-agnostic architecture knowledge base that ingests, reviews, and serves structured architecture documentation across multiple repositories (Android today, iOS/web later), reusing the existing extraction → human-review → refine loop."

## Overview

Lore today captures **business rules** from a single source through a converging loop: an agent
extracts candidates, a human reviews them, and rejections feed back to the agent for refinement.
This feature lets the **same loop** also capture **architecture documentation** — the structure of a
codebase's features, layers, dependencies, and diagrams — and organizes all knowledge by **project**
so the catalog can span many repositories and platforms (Android first, iOS/web later) instead of one.

The change is deliberately scoped to the **knowledge model and the loop**. Distribution tooling, the
review UI, and the importer that reads existing generated docs are explicitly out of scope (see
*Out of Scope*); this spec defines the structured target those later phases will read from and write to.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture architecture knowledge with confidence-aware surfacing (Priority: P1)

An extraction agent analyzing a repository documents each feature's architecture (what it does, its
tech stack, key files, dependencies, diagrams) and submits it to Lore against a specific project.
High-confidence findings become **searchable immediately** so the knowledge is useful right away,
while uncertain findings are **held for human review** so the catalog stays trustworthy.

**Why this priority**: This is the core new capability — without it there is no architecture knowledge
in the system. It delivers standalone value the moment a single feature's architecture is captured and
becomes retrievable.

**Independent Test**: Submit one high-confidence architecture unit and one low-confidence unit for a
project; confirm the first is immediately retrievable as auto-surfaced and the second appears in the
human review queue and is NOT presented as surfaced/approved.

**Acceptance Scenarios**:

1. **Given** a registered project, **When** an agent submits an architecture unit with high confidence,
   **Then** the unit is stored in an auto-surfaced state, is immediately retrievable by search, and is
   clearly marked as machine-surfaced (not human-approved).
2. **Given** a registered project, **When** an agent submits an architecture unit with medium or low
   confidence, **Then** the unit is stored as pending human review and appears in the reviewer queue.
3. **Given** an agent submitting a **business rule** (not architecture), **When** the rule is submitted
   at any confidence, **Then** it is stored as pending human review exactly as today (no auto-surfacing).
4. **Given** an architecture unit already submitted under a stable identifier, **When** the agent
   resubmits it with updated content, **Then** a new version is created on the same unit rather than a
   duplicate, and its state is recomputed from the new confidence.

---

### User Story 2 - Human review keeps the catalog trustworthy (Priority: P1)

A reviewer examines architecture knowledge — both machine-surfaced units and units pending review —
and renders a verdict. Approving requires an explicit human action; rejecting or asking for
clarification requires a comment, and that feedback is retrievable by the agent so it can refine and
resubmit. The loop converges.

**Why this priority**: The system's value is a *converging, trustworthy* catalog. Auto-surfacing
without a human gate would turn it into an unreviewed dump. This story preserves the non-negotiable
human-in-the-loop guarantee for the new knowledge kind.

**Independent Test**: Take a machine-surfaced architecture unit, have a reviewer approve it, and
confirm it is now marked human-approved; take another, reject it with a comment, and confirm the
rejection (with comment) is retrievable by the agent and the unit re-enters refinement.

**Acceptance Scenarios**:

1. **Given** a machine-surfaced architecture unit, **When** a reviewer approves it, **Then** it becomes
   human-approved, and approval is reachable **only** through this explicit human verdict.
2. **Given** any architecture unit, **When** a reviewer rejects it or requests clarification **without**
   a comment, **Then** the action is refused.
3. **Given** any architecture unit, **When** a reviewer rejects it **with** a comment, **Then** the unit
   enters refinement and the rejection (including the comment) is retrievable by the agent.
4. **Given** a rejected architecture unit, **When** the agent submits a refinement addressing the
   feedback, **Then** a new version is created and the addressed feedback is marked resolved.
5. **Given** a machine-surfaced unit that was never reviewed, **When** the catalog is queried for
   human-approved knowledge only, **Then** the machine-surfaced unit is excluded from that result.

---

### User Story 3 - Organize and retrieve knowledge per project and platform (Priority: P2)

Because knowledge now spans multiple repositories, every unit and every extraction round belongs to a
named project (with a platform such as Android, iOS, web, or backend). Users and agents can retrieve
knowledge scoped to a project, browse architecture as a feature→layer hierarchy, and keep one
project's knowledge from mixing with another's.

**Why this priority**: This is the agnostic backbone that makes the system reusable beyond a single
app. It is P2 because P1 already delivers value for one project; this generalizes it to many.

**Independent Test**: Register two projects, submit architecture units to each, and confirm a
project-scoped query returns only that project's units; submit a feature unit with child layer units
and confirm the hierarchy is retrievable.

**Acceptance Scenarios**:

1. **Given** two registered projects, **When** knowledge is submitted to each, **Then** a query scoped
   to one project returns only that project's knowledge.
2. **Given** an architecture feature unit with child layer units, **When** the feature is retrieved,
   **Then** its child layer units are discoverable as belonging to it.
3. **Given** an extraction round, **When** it is started, **Then** it is associated with exactly one
   project, and conflict detection with other open rounds is scoped within that project.
4. **Given** existing business-rule knowledge created before this feature, **When** the change is
   applied, **Then** that knowledge is preserved and assigned to a default project without loss.

---

### User Story 4 - Detect stale architecture knowledge (Priority: P3)

Each architecture unit records the source revision it was derived from. When the codebase moves ahead
of that revision, the knowledge can be identified as potentially stale and a candidate for
re-extraction, so the catalog does not silently rot.

**Why this priority**: Keeps the knowledge alive over time. It is P3 because the catalog is still
valuable without automated staleness handling; this is an enhancement that builds on the recorded
provenance.

**Independent Test**: Store an architecture unit with a recorded source revision, then query for units
whose recorded revision differs from a newer reference revision and confirm the unit is flagged.

**Acceptance Scenarios**:

1. **Given** an architecture unit with a recorded source revision, **When** it is retrieved, **Then**
   the source revision and generation time are available.
2. **Given** an architecture unit whose recorded revision is older than the project's current
   reference revision, **When** staleness is evaluated, **Then** the unit is identified as potentially
   stale.

---

### Edge Cases

- **Migration of existing data**: Existing business rules and rounds have no project. They MUST be
  preserved and assigned to a default project rather than dropped or orphaned.
- **Confidence change on resubmission**: A unit previously machine-surfaced (high confidence) is
  resubmitted at lower confidence — it MUST move into review rather than remain surfaced; the inverse
  (review → high confidence) re-surfaces it, unless a human has already rendered a verdict on it.
- **Human verdict precedence**: Once a human has approved or rejected a unit, a later agent
  resubmission MUST NOT silently override the human's verdict by auto-surfacing.
- **Orphaned hierarchy**: A child layer unit references a feature unit that does not exist or was
  removed — retrieval MUST handle this without breaking and surface the child as parent-less.
- **Cross-project identifier collision**: The same feature name (e.g. "checkout") exists in two
  projects — they MUST remain distinct units and never merge across projects.
- **Diagram content**: A submitted diagram is stored as its textual definition; rendering is a
  downstream concern and MUST NOT be required for storage or retrieval.
- **Reject/clarify without comment**: Refused for architecture units exactly as for business rules.

## Requirements *(mandatory)*

### Functional Requirements

#### Projects (agnostic backbone)

- **FR-001**: System MUST support a first-class **project** as the top-level grouping for all knowledge,
  with at minimum a unique key, a human name, and a platform classification (Android, iOS, web,
  backend, or other).
- **FR-002**: Every extraction round and every knowledge unit MUST belong to exactly one project.
- **FR-003**: Round scope-conflict detection MUST be evaluated **within** a project, not across
  unrelated projects.
- **FR-004**: Knowledge retrieval MUST be filterable by project so one project's knowledge never mixes
  with another's, including when the same feature name exists in multiple projects.

#### Knowledge kinds (generalization)

- **FR-005**: System MUST distinguish knowledge by **kind**: existing **business rules** and new
  **architecture** units, sharing one lifecycle/loop and one feedback/version mechanism.
- **FR-006**: Existing business-rule behavior MUST remain unchanged: business rules continue to start
  as pending human review regardless of confidence, and there MUST be no auto-surfacing path for them.

#### Architecture content & hierarchy

- **FR-007**: An architecture unit MUST capture, in a structured form: an overview, the observed tech
  stack (endpoints, libraries, persistence), entry points, patterns, dependencies on other features,
  one or more diagrams, and a risk assessment.
- **FR-008**: Architecture units MUST support a two-level hierarchy: a **feature** unit and **layer**
  child units linked to it, so that a feature's structure can be reviewed and retrieved as a whole or
  by layer.
- **FR-009**: Source-linked evidence (file path, line range, symbol names, source revision) MUST be
  attached to architecture units using the same evidence mechanism as business rules, including the
  same non-blocking source-overlap warnings.
- **FR-010**: Diagrams MUST be stored as their **textual definition** (not as rendered output), so they
  are versionable and re-renderable downstream.
- **FR-011**: Each architecture unit MUST record **provenance**: the source revision it was derived
  from and when it was generated.
- **FR-012**: System MUST be able to identify architecture units whose recorded source revision is
  behind a newer reference revision (potential staleness).

#### Lifecycle (hybrid-by-confidence, human gate preserved)

- **FR-013**: When an **architecture** unit is submitted with **high** confidence, the system MUST place
  it in a **machine-surfaced** state that is immediately retrievable by search.
- **FR-014**: When an **architecture** unit is submitted with **medium or low** confidence, the system
  MUST place it in the **pending-review** state and add it to the reviewer queue.
- **FR-015**: The machine-surfaced state MUST be **distinct from** and never presented as the
  human-approved state.
- **FR-016**: The **human-approved** state MUST be reachable **only** through an explicit human verdict.
  No agent submission path may set a unit to human-approved. *(Constitution Principle III — non-negotiable)*
- **FR-017**: A reviewer MUST be able to **approve** (→ human-approved), **reject**, or **request
  clarification** on any architecture unit, including machine-surfaced ones.
- **FR-018**: Rejecting or requesting clarification MUST require a reviewer comment; the action MUST be
  refused without one.
- **FR-019**: Rejection/clarification feedback (including the comment) MUST be retrievable by the agent
  so it can refine and resubmit, and addressed feedback MUST be markable as resolved.
- **FR-020**: Once a human verdict exists on a unit, a later agent resubmission MUST NOT auto-surface
  over that verdict.
- **FR-021**: Resubmitting an existing unit (by its stable identifier) MUST create a new version rather
  than a duplicate, for both business rules and architecture units.

#### Interface parity & integrity

- **FR-022**: Every capability above that is exposed to agents MUST be exposed to humans with identical
  invariants, and vice versa; neither interface may add or relax a domain rule. *(Constitution
  Principle II — parity)*
- **FR-023**: All lifecycle transitions and guards (auto-surface, surfaced→approved, surfaced→refine,
  business-rule-always-review, comment-required-on-reject, human-verdict precedence) MUST be enforced
  in one shared place, not duplicated per interface. *(Constitution Principle I)*
- **FR-024**: Search/retrieval MUST be able to return architecture units filtered by project, kind,
  hierarchy level, and lifecycle state (including the machine-surfaced state).
- **FR-025**: A query for "human-approved knowledge only" MUST exclude machine-surfaced units that
  have not received a human verdict.

### Key Entities

- **Project**: The top-level grouping representing one repository/codebase. Key attributes: unique key,
  display name, platform, source location, default reference revision. All rounds and knowledge units
  belong to a project.
- **Knowledge Unit**: A reviewable piece of knowledge with a **kind** (business rule or architecture),
  a lifecycle state, a confidence level, a version history, optional embedding for search, and
  source-linked evidence. Business-rule and architecture units share this lifecycle and feedback model.
- **Architecture Unit** (a Knowledge Unit of kind=architecture): adds a hierarchy level
  (feature or layer), an optional parent (a layer's feature), and structured architecture content
  (overview, tech stack, entry points, patterns, dependencies, diagrams-as-text, risk, provenance).
- **Round**: An extraction session, now scoped to a project, declaring the area being covered for
  conflict detection within that project.
- **Feedback**: A reviewer verdict (approve / reject / request clarification) on a unit version, with a
  required comment for reject/clarify, retrievable by the agent and markable resolved. Reused unchanged.
- **Version**: An immutable snapshot of a unit at a point in time, created on every submission or
  refinement. Reused unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A high-confidence architecture unit submitted by an agent is retrievable by a search
  query within the same session, with no human action required.
- **SC-002**: 100% of architecture units reach the human-approved state only after an explicit human
  verdict; zero are auto-approved. *(Audit invariant)*
- **SC-003**: 100% of reject/clarify actions without a comment are refused, for both knowledge kinds.
- **SC-004**: After a rejection, the agent can retrieve the rejection comment and submit a refinement
  that creates a new version, completing one full loop iteration without manual data fixes.
- **SC-005**: Knowledge from two different projects never appears in a query scoped to the other
  project (0% cross-project leakage), including when feature names collide.
- **SC-006**: All pre-existing business-rule knowledge survives the change with no records lost and is
  attributed to a default project.
- **SC-007**: The same set of capabilities (submit, review, refine, retrieve) is available to both the
  agent interface and the human interface, verified by parity tests.
- **SC-008**: Every new lifecycle transition and guard is covered by an automated state-machine test,
  and the full test suite passes.
- **SC-009**: An architecture unit whose recorded source revision is older than the project's reference
  revision is correctly identified as potentially stale.

## Out of Scope *(this phase)*

- The one-command repository onboarding tool (`npx kl init`-style distribution of the agent connection,
  skills, and dependent tooling). This spec defines the backend the tool will register against.
- The multi-project review UI and any diagram-rendering view. This spec defines the data those views
  will consume.
- The importer/parser that turns existing generated architecture docs (e.g. the 62 `acme-docs` HTML
  feature pages) into units. This spec defines the **storage target** that importer will write to, but
  not the parser itself.
- A queryable cross-feature/cross-platform **dependency graph** (edge-list for impact analysis and
  Android↔iOS parity). Dependencies are stored on the unit now; a dedicated graph is an anticipated
  later extension, not built here.
- Automated re-extraction/scheduling triggered by staleness. This phase only *detects* staleness.

## Assumptions

- **Default project for migration**: Existing rules/rounds are backfilled into a single default project
  representing the current source; no historical data is discarded.
- **Default search visibility for architecture**: Architecture retrieval includes both machine-surfaced
  and human-approved units by default (because surfaced units are meant to be useful immediately);
  the "approved-only" query remains available and excludes surfaced-but-unreviewed units.
- **Confidence is agent-supplied**: The high/medium/low confidence that drives auto-surfacing is
  provided by the extracting agent, consistent with how business rules already report confidence.
- **Reference revision source**: Staleness compares an architecture unit's recorded revision against a
  project-level reference revision; how that reference revision is supplied/updated is treated as an
  input, not built in this phase.
- **Hierarchy depth**: Architecture hierarchy is two levels (feature → layer) for this phase; deeper
  nesting is not required.
- **Existing identity/dedup mechanism**: The existing stable-identifier-based versioning (re-submit
  creates a version, not a duplicate) is reused for architecture units; identity is unique within a
  project.
- **Existing feedback/version machinery is reused as-is** for the architecture kind, including the
  agent-retrievable feedback queue and immutable version snapshots.
