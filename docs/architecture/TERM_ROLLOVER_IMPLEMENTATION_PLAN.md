# Academic Term Rollover Implementation Plan

**Status:** Phases 0–9 implemented; Phase 9 local gates passed; Phases 10–13 pending  
**Started:** 2026-10-05  
**Implementation order:** Expand → migrate/review → contract → cut over

This document is the implementation source of truth for academic term rollover. It supersedes exploratory recommendations that proposed copying old debt into new invoices or reusing one term-owned `Class` row across multiple terms.

## Locked policies

- Academic years support a configurable number of terms; the default is three.
- All branches share one school-wide active term.
- Term lifecycle is `DRAFT → ACTIVE → CLOSING → CLOSED`.
- Administrators see one logical class throughout an academic year. Internally, `ClassCohort` owns the logical identity and each term has a term-specific `Class` offering.
- Students advance grades only after the final term. Within-year rollover retains the logical class unless an explicit transfer or withdrawal is recorded.
- Old debt and credits remain attached to their original obligations and receipts. Rollover never creates duplicate opening-balance invoices.
- Preflight has non-overridable blockers and reason-acknowledged warnings. Unpaid balances are warnings, not blockers.
- Target setup copies subjects/class links, class and subject teachers, fee templates/assignments, timetable, and syllabus/planning structures as editable drafts.
- Attendance, results, reports, payments, allocations, invoices, completed progress, homework submissions, and debt campaigns are never copied.
- Cutover requires a checksum-verified full-school backup and typed confirmation by one authenticated `SUPER_ADMIN`.
- Closed-term corrections use scoped, reason-bound amendments. Previous finalized versions remain immutable.

## Invariants

1. Historical term activity is never reset, copied as new activity, or destructively rewritten.
2. Exactly one term is `ACTIVE`, and it agrees with `AcademicTerm.isActive` and `SchoolSettings.currentTermId` while compatibility fields remain.
3. Each student has at most one authoritative enrollment per term.
4. Each logical class cohort has at most one internal offering per term.
5. `DRAFT` terms accept setup only; `CLOSED` terms reject ordinary academic writes.
6. Later settlement of old debt changes the live receivable but never the immutable close snapshot.
7. Preparation and execution are idempotent, concurrency-safe, branch-aware, and transactionally audited.
8. Cutover commits completely or leaves source and target state unchanged.

## Target domain

### Academic structure

- `AcademicYear`: dates, configured term count, lifecycle, and finalization metadata.
- `AcademicTerm`: year, sequence, lifecycle status, lifecycle timestamps, actor IDs, and optimistic version.
- `ClassCohort`: academic-year logical class identity, branch, grade, and predecessor lineage.
- Existing `Class`: internal term offering linked to a cohort.
- `StudentTermEnrollment`: authoritative student placement for one term.
- `TermInstructionalDay`: explicit instructional calendar used for attendance completeness.

### Rollover and audit

- `TermRollover`: source/target, transition type, state, configuration, hashes, backup evidence, approval, and execution metadata.
- `TermRolloverTask`: idempotent item/category work with source-to-target mapping.
- `TermRolloverEvent`: append-only transactional lifecycle evidence.
- `StudentTransitionDecision`: year-end promote/retain/graduate/transfer/withdraw decisions and exceptional within-year transitions.
- `TermCloseSnapshot`: immutable academic, attendance, enrollment, and finance totals as at close.

### Reports and amendments

- Reports move through `DRAFT`, `FINALIZED`, and `PUBLISHED`.
- `StudentTermReportVersion` preserves immutable versions.
- `ClosedTermAmendment` and amendment items define exact approved corrections.

### Finance

- `StudentFeeStructure` remains the canonical obligation and retains its source term.
- `PaymentAllocation` determines which obligation a receipt settles.
- Invoice payments use the same canonical payment/allocation service as normal receipts.
- Cash reporting follows receipt date/term; receivable reporting follows obligation term.
- Unallocated receipt value remains account credit; it is not copied to a new term.

## Implementation phases

### Phase 0 — Safeguard and baseline

- Preserve the current uncommitted strict term-isolation work.
- Record branch/commit, working-tree diff, migration tail, builds, tests, and baseline reconciliation counts.
- Rehearse against disposable or cloned PostgreSQL only until migration history is reconciled.

**Gate:** Existing backend tests and frontend production build pass before rollover changes.

### Phase 1 — Additive lifecycle foundation

- Add lifecycle enums, years, nullable year/sequence links, cohorts, enrollments, rollover records, instructional days, close snapshots, report versions, and amendments.
- Use nullable compatibility fields and preserve `isActive` and `Student.classId`.
- Add PostgreSQL partial uniqueness for the one-active-term invariant after validating existing data.

**Gate:** Prisma format/validate/generate and clean/upgrade migration rehearsals pass without changing existing API behavior.

### Phase 2 — Deterministic backfill and review

- Group terms into years and assign sequence only where unambiguous.
- Build cohort candidates using year, branch, grade, normalized identity, and historical evidence.
- Reconstruct enrollment using report, result, attendance, movement, and current-placement evidence.
- Produce an exception report and stop on ambiguity instead of guessing.
- Preserve valid explicit assignments and reject invalid year, cohort, ownership, and enrollment lineage.
- Keep financial records out of class-placement inference; a payment proves an account relationship, not a class.
- Run dry-run by default. Apply only from a blocker-free, fingerprinted snapshot under a serializable transaction and advisory lock.

**Gate:** No unresolved hard conflicts; counts and term/class evidence reconcile.

**Implemented tooling:**

- Pure deterministic planner with stable issue codes, source fingerprint, proposed before/after mutations, warnings, and blockers.
- Prisma evidence loader for reports, results, attendance, movement logs, assessments, current placement, and existing explicit records.
- Atomic apply path with stale-source rejection, optimistic term versions, compare-and-set lineage updates, and post-apply idempotency verification.
- CLI commands: `npm run term-backfill:plan` (default dry-run) and `npm run term-backfill:apply` (explicit mutation).
- Reports are written as JSON under `reports/term-backfill/` unless `--report` supplies another path.
- Production execution remains blocked until a dry-run against a scrubbed production-like clone has no blockers and receives data-owner review.

#### Synthetic production-scale rehearsal evidence

On 2026-10-05, the dry-run workflow was rehearsed against the isolated
`term_backfill_review` schema on disposable PostgreSQL at `localhost:55432`.
The fixture is anonymized and production-shaped, but fully synthetic. It is
supplemental engineering evidence and is not a substitute for the required
scrubbed production-like clone or data-owner sign-off. The development database
at `localhost:4400` was not contacted, and no apply command was run.

**Source shape**

| Category | Count |
| --- | ---: |
| Branches | 2 |
| Calendar years / terms | 2 / 6 |
| Term-specific classes | 48 |
| Students | 240 |
| Finalized/published term reports | 1,200 |
| Term results | 3,600 |
| Attendance records | 9,600 |
| Class movement records | 240 |
| Student fee obligations | 480 |
| Payments / allocations | 360 / 360 |

The planner loaded 3,600 grouped placement-evidence rows: report, result, and
attendance evidence for every student in each of the five completed historical
terms. Current placement supplied the sixth-term evidence.

**Dry-run result**

- Report: `backend/reports/term-backfill/synthetic-production-scale-review.json`
- Report SHA-256: `cdbb9636fb6b3676ff56d39007f836ef592fb4ecec55a26c45a9ba442f65aa06`
- Source fingerprint: `fda177402d5ff0a17fe9b2cdd3a12ae2572a14912fcc24a0594fb2df22c3c26d`
- Blockers: 0; warnings: 0; `canApply`: true.
- Proposed creates: 2 academic years, 16 cohorts, and 1,440 enrollments.
- Proposed links/updates: 6 term year/sequence updates and 48 class-to-cohort links.
- Existing cohort and enrollment updates: 0.

**Reconciliation**

- Both inferred years contain the exact term sequence `[1, 2, 3]`.
- Each year has eight branch-aware cohorts; all eight second-year cohorts have
  one predecessor inferred from explicit movement evidence.
- All 48 classes are covered exactly once, with no duplicate class link or
  duplicate source-class coverage.
- Every term has exactly 240 proposed enrollments. All 1,440 student-term pairs
  are unique: 1,200 are `COMPLETED`, 240 are `ACTIVE`, and 1,200 have explicit
  source-enrollment lineage.
- Transition reconciliation produced 960 `CARRY_FORWARD`, 240 `PROMOTE`, and
  240 initial enrollments with no transition action.
- A rolled-back serializable test changed a payment note and reloaded/replanned
  the snapshot. Input and plan fingerprints, proposals, and issues were
  unchanged, proving that payment data does not participate in placement
  inference. The temporary payment change did not persist.
- After the dry run, the review schema still had zero academic years, cohorts,
  enrollments, term-year links, and term sequences. All source academic and
  finance counts remained unchanged.
- An in-memory rerun produced the same source fingerprint, summary, proposals,
  and issue list as the saved report.

**Gate decision:** synthetic scale/mechanics rehearsal passed. Production apply
remains blocked. No scrubbed production-like archive or database dump is
available in the workspace, so real-data reconciliation and human data-owner
sign-off remain pending.

### Phase 3 — Canonical lifecycle and write policy

- Introduce one lifecycle service for creation, activation, closing, locking, current-term resolution, and compatibility synchronization.
- Remove independent activation from term and settings controllers.
- Split permissive read resolution from strict write resolution.
- Enforce lifecycle write categories at domain-service boundaries.

**Gate:** Concurrent activation cannot produce two active terms; writes without an explicit valid term fail closed.

#### Phase 3 implementation evidence

The runtime persistence-boundary audit is complete for active backend code. It
covered direct Prisma mutations, transaction aliases, `(prisma as any)` calls,
and child records whose term ownership is inherited through `Class`,
`Assessment`, `Payment`, or `VirtualClassroom`. Migration/backfill scripts,
disabled routes, global identity, global curriculum definitions, communication
infrastructure, and general accounting records were classified separately
rather than being assigned a term implicitly.

The canonical write boundary now covers:

- Academic setup and activity: classes, subjects assigned to term offerings,
  assessments/questions/submissions/grading, attendance and attendance alerts,
  results/reports, timetable, syllabus progress, lesson plans, homework,
  student risk, mastery, misconceptions, interventions, and adapted lessons.
- Virtual instruction: classroom planning, live start/end automation,
  participants, AI tutor sessions, chat, recordings, attendance synchronization,
  and generated lesson records. Virtual classrooms now require an explicit
  class so their term ownership cannot be inferred from a current-term setting.
- Finance: fee templates/assignments, obligations, invoices, receipts,
  allocations, adjustments, debt campaigns, mobile-money collection/payment
  transitions, term-linked budgets, saved term report snapshots, and derived
  term financial summaries.
- Student placement: same-term class/status changes synchronize an existing
  enrollment atomically; cross-term movement fails closed. Student archival is
  a global identity action but is forbidden while an active enrollment or
  ACTIVE/CLOSING compatibility placement exists. Branch reassignment likewise
  requires the explicit transfer/rollover workflow and cannot silently move an
  active placement.

Policy classifications resolved during implementation:

- Adapted-lesson drafts and schedule edits use `SETUP`; deployment, completion,
  mastery, grading, interventions, and live classroom state use
  `ACADEMIC_ACTIVITY`.
- Term-budget draft work uses `SETUP`, activation uses
  `FINANCIAL_OBLIGATION`, and closure uses `FINALIZATION`. Annual and quarterly
  budgets without a term remain global; a term budget must provide `termId` and
  never inherits the current term silently.
- Saved term financial reports use `FINALIZATION` and their embedded payment,
  fee, invoice, enrollment, budget, mobile-money, and campaign data is filtered
  to the selected term. Global reports remain global.
- `TermFinancialSummary` recalculation uses `FINANCIAL_RECEIPT`, allowing a
  closed origin term's live receivable summary to reflect permitted late
  receipts without rewriting its immutable close snapshot.

Verification on 2026-10-05:

- Backend TypeScript build passed after the final audit changes; editor
  diagnostics reported no errors in the changed files.
- The backend unit suite passed all 29 tests, including the complete
  `AcademicTermStatus × TermWriteCategory` policy matrix.
- The isolated PostgreSQL lifecycle suite passed against
  `localhost:55432/postgres?schema=term_lifecycle_test`. It includes concurrent
  activation/close behavior and controller/service persistence-boundary checks,
  including draft-term rejection without persistence for attendance-alert
  resolution, risk assessment, auto-grading, budget activation, classroom start,
  and financial-report finalization. It also verifies ACTIVE/CLOSING budget
  transitions, synchronized student/enrollment withdrawal, rejection of generic
  and explicit branch changes while active placement exists, and a persisted
  CLOSING-term financial snapshot that includes its own invoices, refunds, and
  credit notes while excluding those owned by another term.
- The expanded PostgreSQL assertions exposed and fixed two runtime-only defects:
  the term-report snapshot had applied an invoice `termId` filter to global
  expenses while omitting it from recent invoices, and a future-dated active
  enrollment could receive an end date before its start date during withdrawal.
  Expenses now remain global, recent invoices are term-scoped, and enrollment
  end timestamps are clamped to be no earlier than `startsAt`.
- The isolated backfill PostgreSQL suite was rerun against
  `localhost:55432/postgres?schema=term_backfill_test`; deterministic dry-run,
  atomic apply in the test harness, and zero-change rerun all passed. The
  production backfill apply command was not invoked.
- Exact runtime mutation searches found no remaining direct active-code writes
  to the audited term-owned and class/assessment/classroom-derived model sets;
  the remaining direct matches were the explicit migration script.
- The development database at `localhost:4400` was not contacted and the
  backfill apply command was not run.

This evidence closes the Phase 3 runtime-write gate only. Phase 4 evidence is
recorded separately below. It does not satisfy the scrubbed production-like
clone rehearsal, restore rehearsal, data-owner review, or later rollover gates.

### Phase 4 — Term-aware class and enrollment migration

- Require term context on class APIs and UI selectors.
- Resolve historical/current placement through enrollment.
- Keep `Student.classId` synchronized only for the active term until all consumers migrate.

Implementation evidence on 2026-10-05:

- Added a canonical placement service for explicit-term student placement,
  class rosters, roster assertions, and lifecycle-aware placement upserts.
- Class and student APIs now require explicit term context. Authorized setup
  users can request unplaced student identities separately from the term roster;
  student, parent, and teacher views remain enrollment-scoped.
- Draft placement is staged through `SETUP`; active placement uses
  `ACADEMIC_ACTIVITY`. Only an ACTIVE-term ACTIVE enrollment updates the legacy
  `Student.classId` compatibility pointer.
- Online assessments, virtual classrooms, classroom attendance, attendance
  intelligence, branch transfer checks, student risk, fee statements, term
  balances, debtor segmentation, receivables, payment reconciliation, fee AI,
  study assistance, reminders, and public-payment class projections now resolve
  placement through `StudentTermEnrollment` for an explicit term.
- Frontend academic, finance, accounting, class, student, promotion, virtual
  classroom, and intelligence flows now propagate their selected term. Bulk
  class imports require `academicTermId` on every row and no longer fall back to
  the active term.
- Added database ownership enforcement for enrollment class/term consistency
  and same-student, cross-term lineage, plus an isolated Phase 4 integration
  suite covering explicit context, historical authority, pointer synchronization,
  staged placement, branch checks, lineage, and closed-term mutation blocking.
- Teaching-assistant chat, slash commands, insights, AI tutor rosters, invoice
  creation/listing, fee reminders, smart reminders, branch projections, and
  Master AI student creation now carry explicit term context and use enrollment
  placement. Master AI placement writes route through the canonical placement
  service rather than mutating enrollment or compatibility fields directly.
- A complete runtime placement-authority audit found no remaining active-code
  use of `Student.classId` or `Class.students` as term roster authority. Legitimate
  entity-owned historical class references and global identity counts were kept.
- All 44 Prisma migrations reached the migration head in each isolated schema.
  Fresh chains completed successfully for `term_lifecycle_test` and
  `term_backfill_test`; `student_placement_test` had no pending migrations.
- The isolated placement suite passed 1/1 against
  `localhost:55432/postgres?schema=student_placement_test`, including historical
  enrollment authority, ACTIVE-only compatibility-pointer synchronization,
  DRAFT staging, ownership-trigger rejection, branch isolation, lineage checks,
  and CLOSED-term mutation rejection.
- The isolated lifecycle suite passed 1/1 against
  `localhost:55432/postgres?schema=term_lifecycle_test`. Final validation exposed
  and corrected attendance validation order so the lifecycle gate runs before
  roster validation; its placement-status fixture was also updated to supply the
  now-required explicit academic term.
- The isolated backfill suite passed 1/1 against
  `localhost:55432/postgres?schema=term_backfill_test`, covering deterministic
  dry-run, atomic test-harness apply, and zero-change rerun.
- The final backend TypeScript build passed, the backend unit suite passed 29/29,
  and the frontend production build passed. The frontend reported only its
  existing bundle-size and stale Browserslist warnings.
- No request was sent to `localhost:4400`, and `term-backfill:apply` was not run.

**Gate decision:** Phase 4 passed. Later-term placement changes are enrollment-
scoped and do not alter historical class evidence.

**Gate:** Later transitions do not alter historical class evidence.

### Phase 5 — Canonical finance settlement

- Consolidate normal, invoice, public, and mobile-money receipt allocation.
- Link invoice items to fee obligations and reconcile invoice status from allocations.
- Separate receipt-term cash reports from obligation-term receivables.
- Backfill deterministic allocations and report ambiguous historical receipts.

**Implemented**

- `StudentFeeStructure` plus effective `PaymentAllocation` rows are the
  canonical receivable projection. Database triggers reject cross-student,
  receipt-overrun, and obligation-overrun allocations and synchronize fee and
  invoice counters under concurrent writes.
- Receipt provenance remains on `Payment.academicTermId`; allocation may
  intentionally settle older obligations. Source payment credit is derived
  rather than copied into another term.
- Manual, invoice, authenticated mobile-money, public mobile-money, and AI
  receipts use the same idempotent settlement boundary. Refunds consume source
  credit first and then append immutable allocation reversals.
- Invoice items resolve canonical fee obligations. Free-form AI invoices and
  unsupported discount/tax divergence are blocked. Credit notes reduce unpaid
  canonical obligations; unpaid cancellation releases the obligation for safe
  re-invoicing and reverses its accrual journal.
- Receipt-term cash/refund/net-cash reporting is separate from obligation-term
  expected/collected/outstanding reporting. Term statements show effective
  allocations, including later-term receipts and processed reversals.
- Financial document counters are global per prefix/year, matching globally
  unique document numbers and preventing cross-branch collisions.
- Operational finance transactions enqueue idempotent ledger intent in a
  transactional accounting outbox. Receipts post entirely to source account
  credit, and each allocation delta carries immutable amount and classification
  payloads that reclassify credit to receivable or revenue independently of
  worker timing. The retry worker reconstructs every allocation source posting
  before a void reversal and drains at startup and every minute.
- The fingerprinted finance reconciliation planner reports blockers, unlinked
  invoice items, stale fee/invoice counters, proposed oldest-debt allocations,
  and projected source credit. Apply refuses stale fingerprints or blockers and
  is idempotent on rerun.

**Validation evidence**

- Prisma schema format/validation and client generation passed.
- All 49 current migrations completed from empty payment-settlement,
  placement, lifecycle, and backfill schemas; migration status reported
  current. Phase 5 originally ended at migration 48, and its canonical
  settlement, global sequence, accounting-outbox, and immutable
  allocation-event behavior was revalidated after migration 49 was added.
- The Phase 5 PostgreSQL suite passed 10/10 nested scenarios: cross-term and
  CLOSED-term settlement, historical refunds, database bounds, idempotency,
  invoice/credit-note/cancellation reconciliation, deterministic accounting
  posting keys, source-credit reclassification, refund composition, complete
  receipt-plus-allocation void reversal under delayed worker timing,
  reconciliation/branch controls, mobile completion, concurrent allocation,
  fingerprinted legacy reconciliation, and durable outbox drain/replay.
- Backend unit tests passed 29/29. Placement, lifecycle, and backfill PostgreSQL
  integration gates each passed. The final backend TypeScript build and
  frontend Vite/PWA production build passed; the frontend retained only its
  existing stale Browserslist and large-chunk warnings.
- The reconciliation CLI dry-run completed with no mutations against the
  cleaned isolated schema. No request was sent to `localhost:4400`, and
  `term-backfill:apply` was not run.

**Gate decision:** Phase 5 passed. Allocations cannot exceed receipts or
obligations, old debt can be paid in a later receipt term without duplication,
and every new operational settlement retains retryable, timing-independent
receipt and allocation accounting intent.

**Gate:** Allocations cannot exceed receipts or obligations; old debt can be paid in a new term without duplication.

### Phase 6 — Attendance calendar and report finalization

- Manage instructional days.
- Add report readiness, bulk finalization, publishing, immutable versions, and correction routing.

**Implemented**

- `TermInstructionalDay` is the only attendance denominator. Calendar dates
  are explicit, bounded by the term, unique per term/date, and editable only
  while the term is `DRAFT` or `ACTIVE`. Dates absent from the stored calendar
  remain excluded in the UI until deliberately enabled or populated with the
  weekday template. Attendance writes reject non-instructional dates.
- Student readiness checks authoritative enrollment and class consistency,
  required subjects, assessments and complete scores, exactly 100% subject
  weighting, fresh `TermResult` projections, grading-scale coverage, explicit
  instructional days, and one non-duplicate attendance record for every
  eligible student/day intersection. Class readiness aggregates the same
  stable blocker details without weakening the student-level gate.
- Reports follow `DRAFT → FINALIZED → PUBLISHED`. Finalization and publication
  are permitted only in `CLOSING`; finalization creates immutable version 1 and
  publication creates immutable version 2. Individual retries are idempotent,
  and class-wide finalization/publication preflight and commit atomically under
  serializable transactions and advisory locks.
- Every version stores a canonical, recursively key-sorted SHA-256 snapshot.
  Public verification accepts only the current `PUBLISHED` version after
  recomputing its checksum, and visibly identifies the published version.
- Migration 49 (`20261007100000_report_finalization_integrity`) enforces the
  release boundary in PostgreSQL. Finalized reports and version rows cannot be
  updated or deleted; represented term results, assessment results, attendance,
  and instructional calendars cannot be inserted, changed, or removed through
  ordinary writes after finalization.
- Approved closed-term amendments are reason-bound, independently approved,
  allowlisted to exact supported fields, compare their recorded before-values,
  and apply under shared term/report/amendment locks. An applied amendment
  appends the next immutable report version; rejected or stale amendments fail
  closed without changing evidence.
- The report-card workspace exposes readiness, individual and bulk release,
  version history, amendment routing, official printing, and publication-only
  QR verification. Loading a locked report retrieves its existing evidence
  instead of attempting regeneration. The term workspace exposes an explicit
  calendar editor and a read-only `CLOSING`/`CLOSED` view.

**Validation evidence — 2026-10-07**

- All 49 migrations replayed successfully from empty isolated PostgreSQL
  schemas at `localhost:55432`; no request was sent to `localhost:4400` and the
  production backfill apply command was not run.
- The isolated report-finalization suite passed 1/1. Its nested assertions cover
  out-of-range calendars, non-instructional attendance rejection, precise
  missing-attendance blockers, successful and failure-path atomic bulk release,
  concurrent idempotent finalization, report/result/assessment/attendance/
  calendar/version immutability, public verification before and after
  publication, independent approval, rejected-amendment refusal, concurrent
  approve/reject serialization, and verified amended version 3 evidence.
- Phase 5 remained green after the Phase 6 migration: settlement passed 10/10,
  and lifecycle, placement, and deterministic backfill suites each passed 1/1.
  The backend unit suite passed 29/29.
- Backend TypeScript and frontend Vite/PWA production builds passed. Frontend
  output retained only the pre-existing stale Browserslist and large-chunk
  warnings.
- Browser validation against the isolated report-finalization schema completed
  the full readiness → draft → finalization → publication flow. It confirmed
  locked-report retrieval and printing, version 1/2 history, publication-only
  QR rendering, a disabled `CLOSING · calendar locked` dialog showing the two
  persisted instructional days, and successful public verification of
  published version 2.

**Gate decision:** Phase 6 passed. Preflight proves complete instructional-day,
attendance, assessment, grading, result, and report evidence before release;
the released evidence is immutable, checksum-verifiable, and correctable only
through an approved versioned amendment after term closure.

**Gate:** Preflight can prove required attendance and reports are complete.

### Phase 7 — Idempotent target preparation

- Dry-run and prepare the target term.
- Create/reuse target offerings and copy approved setup as drafts.
- Track generated records by source and operation key.

**Implemented**

- A dedicated preparation service validates lifecycle and adjacency for both
  within-year and year-end transitions. Source terms must be `ACTIVE` or
  `CLOSING`, targets must be `DRAFT`, and both terms must belong to explicit,
  correctly sequenced academic years.
- Draft creation is idempotent by request key and rejects competing open
  source/target pairs. Configuration is versioned and supports an explicit
  copy-category allowlist plus reviewed year-end cohort successor mappings.
- The deterministic dry run computes canonical SHA-256 source, target, and
  input fingerprints and exact create/reuse/skip counts without mutating setup.
  It blocks target operational activity and stale plans before preparation.
- Atomic preparation runs in a serializable transaction with retryable Prisma
  conflict handling and PostgreSQL advisory locks. Stable task operation keys
  retain source-to-target IDs across concurrent requests and retries.
- Preparation creates or reuses only class cohorts/offerings, subject links,
  teacher assignments, fee templates/class assignments, timetable joins, and
  lesson plans. It never creates enrollment, pupil placement, obligations,
  invoices, balances, receipts, allocations, attendance, assessments, results,
  reports, campaigns, interventions, risk/mastery records, or virtual-classroom
  activity.
- Prepared retries return the existing result instead of overwriting target
  records. Validation detects source drift, preserves and reports manual target
  edits, and independently recounts prohibited target activity.
- Migration 50 (`20261007110000_rollover_preparation_integrity`) adds one-open-
  pair uniqueness, completed-task target validation, and append-only rollover
  events at the PostgreSQL boundary.
- A `SUPER_ADMIN`-only API exposes create/list/detail, configuration, dry-run,
  preparation, validation, task, and event operations under
  `/api/v1/term-rollovers`. Validation failures have stable error codes and
  structured details; CORS explicitly permits configuration `PATCH` requests.
- Academic Management now includes a responsive Term Preparation workspace for
  create → configure → dry run → prepare → validate/inspect. It explains copied,
  excluded, and deferred data; refreshes server state after mutations; supports
  year-end successor review; and exposes stable task mappings and append-only
  events without adding later-phase placement, finance, approval, backup,
  execution, activation, or cutover controls.

**Validation evidence — 2026-10-07**

- All 50 migrations replayed successfully from empty in the isolated
  `term_rollover_prep_test` schema on PostgreSQL at `localhost:55432`. Migration
  50 was then deployed successfully to the lifecycle, backfill, placement,
  settlement, and report-finalization test schemas.
- The Phase 7 PostgreSQL acceptance suite passed 1/1. It covers lifecycle and
  adjacency refusal, idempotent draft creation, deterministic non-mutating dry
  runs, concurrent preparation, stable task mappings, unchanged source records,
  zero target operational activity, append-only events, preserved manual edits,
  explicit activity detection, and year-end successor mapping.
- HTTP acceptance passed on an ephemeral isolated server: unauthenticated and
  non-admin requests returned 401/403, while list/detail, dry-run, idempotent
  prepared reuse, validation, and `PATCH` CORS behavior succeeded.
- Browser validation used only the isolated API/frontend ports 4547/5179. The
  administrator completed dry-run → prepared reuse → validation, observed a
  valid verdict and zero operational activity, inspected stable mappings and
  events, and retained state across refresh. The workspace had no horizontal
  page overflow at 375px or 1440px and rendered correctly in light/dark and
  reduced-motion conditions.
- The backend unit suite passed 29/29. Lifecycle, backfill, placement, and
  report-finalization suites each passed 1/1; settlement passed all 10 tests.
  Backend TypeScript and frontend Vite/PWA production builds passed. Frontend
  output retained only the existing stale Browserslist and large-chunk warnings.
- No request was sent to `localhost:4400`, and `term-backfill:apply` was not run.

**Gate decision:** Phase 7 passed. Repeated and concurrent preparation retains
the same target IDs, preserves administrator edits, and creates zero operational
activity.

**Gate:** Repeated preparation yields the same IDs and zero operational activity.

### Phase 8 — Enrollment carry-forward and year-end decisions

- Stage within-year enrollment in the same cohort.
- Require a complete year-end decision set and approved target mappings.
- Do not change current placement before cutover.

**Implemented**

- The enrollment-staging service derives eligible pupils only from ACTIVE
  source `StudentTermEnrollment` records. Within-year transitions resolve
  automatically to the prepared target class for the same `ClassCohort` and
  record `CARRY_FORWARD`; they never infer placement from `Student.classId`.
- Year-end rollovers require exactly one explicit `PROMOTE`, `RETAIN`,
  `GRADUATE`, `TRANSFER`, or `WITHDRAW` decision for every eligible source
  enrollment. Promotion is restricted to the approved successor cohort;
  retention is restricted to a prepared same-grade/same-branch target class;
  terminal outcomes cannot have a target class or target enrollment.
- Promotion, retention, and carry-forward create only `STAGED` target
  enrollments with source-enrollment lineage. Graduate, transfer, and withdraw
  remain audited terminal outcomes without changing `Student.status`. No
  Phase 8 path updates current `Student.classId`, source enrollment, target-term
  lifecycle, or operational academic/finance data.
- Decision saving and outcome staging run serializably under the rollover
  advisory lock. Retry handling covers PostgreSQL serialization conflicts and
  deterministic uniqueness races. Stable unique enrollment ownership makes
  concurrent and repeated staging reuse the same target enrollment IDs.
- Canonical SHA-256 source, decision, prepared-target, and outcome fingerprints
  lock the staged evidence. The source fingerprint includes enrollment status
  and effective dates. Validation detects eligibility, decision, mapping, or
  staged-record drift without rewriting the original staged audit evidence.
- Migration 51 (`20261007160000_rollover_enrollment_staging_integrity`) requires
  source-enrollment ownership, adds one-decision-per-rollover/student and
  source-enrollment uniqueness, and installs a PostgreSQL decision trigger that
  enforces term, student, branch, cohort, grade, transition-type, and terminal
  target invariants even for direct database writes.
- Phase 7 preparation validation recognizes only decision-owned Phase 8 staged
  enrollments as allowed target records. All other target enrollment and
  operational activity remains a preparation blocker.
- The `SUPER_ADMIN`-only rollover API now exposes enrollment plan, decision
  save, outcome staging, and staged validation operations. Inputs use UUID,
  action, length, and reviewed-fingerprint validation with stable structured
  conflict/blocker errors.
- Academic Management includes a responsive Enrollment Staging workspace with
  prepared-rollover selection, automatic within-year review, complete year-end
  decision entry, approved target selection, blocker visibility, explicit
  staging confirmation, idempotent re-check, and fingerprint validation.
  Invalid promote/retain choices are disabled when no approved server target
  exists. The workspace explicitly labels approval, backup, lifecycle
  activation, status changes, and cutover as deferred.

**Validation evidence — 2026-10-07**

- All 51 migrations replayed successfully from empty in each exact isolated
  PostgreSQL integration schema at `localhost:55432`: lifecycle, backfill,
  placement, payment settlement, report finalization, rollover preparation,
  and rollover enrollment. No development-database request was made.
- The backend unit suite passed 29/29. Lifecycle, deterministic backfill,
  placement, report finalization, Phase 7 preparation, and Phase 8 enrollment
  each passed 1/1; canonical payment settlement passed all 10 nested tests.
- The Phase 8 PostgreSQL acceptance suite covers automatic same-cohort staging,
  partial and complete year-end decision sets, approved promotion/retention,
  all three terminal outcomes, direct-trigger refusal, source/target lifecycle
  drift refusal, serializable concurrent staging, stable retry IDs,
  post-staging source drift detection, source/current placement immutability,
  zero prohibited target activity, and absence of Phase 9/10 state. It passed
  1/1.
- Route-level acceptance through the real Express app passed: unauthenticated
  enrollment-plan access returned 401, a teacher returned 403, and a
  `SUPER_ADMIN` successfully loaded the plan, reused staged outcomes, validated
  them, and completed an OPTIONS CORS preflight. The app-import maintenance
  timer is unreferenced so one-shot HTTP tests exit cleanly.
- Browser acceptance used only the isolated API/frontend ports 4548/5180. An
  administrator reviewed the two automatic within-year outcomes, then completed
  the year-end workflow from 0/5 decisions through promote, retain, graduate,
  transfer, and withdraw; saved the complete set; confirmed atomic staging;
  received a valid four-fingerprint verdict; and re-checked without duplication.
  Full reload retained the staged 2-enrollment/3-terminal result.
- The Enrollment Staging workspace had no page-level horizontal overflow at
  375px or 1440px, retained light/dark state, and honored the active reduced-
  motion preference. Backend TypeScript and frontend Vite/PWA production builds
  passed; frontend output retained only the existing stale Browserslist and
  large-chunk warnings.
- A final database assertion after the browser flow confirmed five decisions,
  two `STAGED` target enrollments, unchanged ACTIVE source placement and
  `Student.classId`, rollover status `PREPARED`, target status `DRAFT`, and null
  preflight, approval, and execution fields. `term-backfill:apply` was not run.

**Gate decision:** Phase 8 passed. Every eligible pupil has exactly one locked
target outcome; placement and student status remain unchanged until cutover.

**Gate:** Every eligible student has exactly one staged target outcome.

### Phase 9 — Preflight, warning acknowledgement, and backup

**Implemented; local gates passed.** This is readiness/approval only, not
production authorization or cutover. Phase 8 evidence above remains historical
evidence from its own validation run.

- Stable blocker/warning IDs, affected records, remediation links, and canonical
  SHA-256 preflight fingerprints cover preparation, staged outcomes, released
  reports, finance reconciliation, and unsettled accounting outbox work. Unpaid
  balances remain reason-acknowledged warnings, not blockers.
- Full-application domain fingerprints include unrelated application changes
  conservatively. Rollover events and evidence-only fields/timestamps/version
  are excluded; rollover `READY` is normalized to `PREPARED`. Warning reasons,
  actor, and fingerprint are checked against the immutable acknowledgement event.
- Warning acknowledgement, external backup, verification, and approval are
  fingerprint-bound, serializable, advisory-locked, and transactionally audited.
  Backup creation is unverified; approval requires zero blockers, full warning
  coverage, and a verified current artifact. Approval reaches `READY` only.
- Verification and approval reread artifact bytes and compare checksum, size,
  manifest, reconstructed domain fingerprint, and schema/migrations against live
  domain and schema data, not merely the artifact's internally consistent hashes.
- Readiness operations refresh evidence; default-client rollover list/detail
  reads revalidate persisted `READY` before returning it. There is **no universal
  write-trigger invalidation**: persisted `READY` can be historical between
  checks. Transaction-client/internal reads are not that default-client boundary.
  These reads do not universally reread the external artifact; verification and
  approval do. Detected drift clears dependent evidence and demotes `READY`;
  evaluation/storage failures fail closed.
- Migrations 52/53 add readiness evidence and forward JSON integrity constraints.
  Migration 53 closes the earlier SQL-NULL versus JSON-null gaps without
  rewriting migration 52.
- Protected filesystem storage is local/test only. Production Azure Blob storage
  uses managed identity and a private, preprovisioned container on Node 22;
  live cloud behavior has **not** been validated. All 11 offline adapter cases
  pass with mocked data operations and guarded token acquisition.
- The external artifact captures current-schema tables (including implicit
  joins and migration ledger), Prisma schema, migration lock, and migration SQL.
  It is not a complete infrastructure/filesystem backup or a rehearsed restore.
  See the [operations guide](../operations/TERM_ROLLOVER_READINESS.md) for sensitive
  data protection, storage configuration, exclusions, and production prerequisites.

**Final recorded local evidence:** 53 migrations applied; readiness integration
45/45; expanded unit run 44/44; seven prior regression suites, 16 total
tests passing; backend build and frontend production build passed. Actual built
frontend browser **mock-backed** acceptance passed 191/191 with zero uncaught
page errors. The circular manual chunk split was removed and the PWA per-file
cap is 8 MiB; this is not live-API browser E2E or service-worker/offline validation.
See [backend evidence](../../backend/tests/PHASE9_READINESS_VALIDATION.md) and
[built-browser evidence](../operations/phase9-frontend-browser-validation-2026-10-06.md).

**Gate decision:** Phase 9 passed local gates. Blockers cannot be acknowledged
away; changed data invalidates approval at the documented revalidation
boundaries, not automatically on every write. Production storage, clone review,
restore rehearsal, and execution remain separate pending gates.

### Phase 10 — Atomic cutover

**Pending — not implemented.** Persisted `READY` is not execution authorization.

- Re-run fresh preflight under a school-wide serializable lifecycle lock **inside
  the execution transaction**, validate current warning/approval bindings, and
  reread the external artifact against live domain and schema in that same
  transaction before any cutover mutation. A prior list/detail read or approval
  must not substitute for this check.
- Create the close snapshot and final report versions.
- Close source, activate target, activate staged enrollments, update compatibility pointers/settings, and append events in one transaction.
- Run notifications/cache invalidation through retryable post-commit tasks.

**Gate:** Failure injection leaves no partial state; concurrent execution produces one idempotent result.

### Phase 11 — Administrator workflow

**Pending.** Existing Phase 7–9 workspaces are not the complete execution wizard.

- Evolve Terms into Academic Years & Terms.
- Add a resumable rollover wizard: transition, dates, class/setup review, enrollment/decisions, finance, preflight, backup, acknowledgement, confirmation, execution, reconciliation.
- Convert Promotions into the year-end decision workspace.

**Gate:** Refresh/relogin resumes safely and duplicate submission is impossible.

### Phase 12 — Amendments and recovery

**Pending.** Existing Phase 6 report amendments do not implement rollover recovery.

- Implement scoped amendment approval/execution with immutable versions.
- Cancel only untouched generated setup before cutover.
- Permit reversal after cutover only when target operational activity is still zero; otherwise use corrective amendments/rollover.

**Gate:** No recovery path deletes history or manually edited records.

### Phase 13 — Verification and rollout

**Pending.** Local Phase 9 tests do not satisfy production rehearsal or pilot gates.

- Add unit, PostgreSQL integration, concurrency, migration, failure-injection, component, and browser tests.
- Rehearse on a scrubbed production-like clone and restore the generated backup.
- Release behind a feature flag, run a preflight-only pilot, then one supervised cutover.

**Gate:** Builds/tests, reconciliation, restore, and pilot sign-off all pass.

## Current implementation progress

- [x] Policies and architecture approved.
- [x] Existing repository and migration baseline captured.
- [x] Pre-change backend test baseline: 16 passing tests.
- [x] Pre-change frontend Vite/PWA production build passes.
- [x] Additive lifecycle schema and migration.
- [x] Clean 43-migration chain and populated legacy upgrade rehearsals pass on disposable PostgreSQL.
- [x] Canonical lifecycle service, activation routing, compatibility synchronization, and current-term resolver.
- [x] Serializable concurrent-activation, stale-version, closing, snapshot-gated close, and reopen integration coverage.
- [x] Deterministic backfill/review planner, evidence loader, dry-run/apply CLI, and stable exception report.
- [x] Planner fixtures for single/multiple years, explicit mappings, date ambiguity, normalized cohort collisions, contradictory placement evidence, lineage cycles, invalid enrollment sources, and idempotent reruns.
- [x] Disposable-PostgreSQL coverage for stale-plan refusal, atomic apply, persisted lineage, and zero-change rerun.
- [x] Supplemental synthetic production-scale dry-run and reconciliation: 240 students across 6 terms, zero blockers/warnings, no mutations.
- [x] Apply lifecycle write categories across active academic and finance persistence boundaries, including derived teaching/classroom records and optional-term finance records.
- [x] Post-enforcement backend build, 29-test unit suite, and isolated PostgreSQL lifecycle/concurrency boundary suite pass.
- [x] Phase 4 explicit-term API/UI cutover, canonical enrollment placement boundary, ownership enforcement, clean runtime authority audit, 44-migration rehearsal, and all three isolated PostgreSQL integration gates.
- [x] Phase 5 canonical settlement cutover, invoice/receipt/refund reconciliation, deterministic legacy planner, durable accounting outbox, and full backend/frontend regression gates; originally completed at migration 48 and revalidated through the current 49-migration head.
- [x] Phase 6 explicit instructional calendars, comprehensive readiness, atomic finalization/publication, immutable checksum-verified versions, controlled closed-term amendments, 49-migration rehearsal, and backend/frontend/browser regression gates.
- [x] Phase 7 deterministic target planning, serializable idempotent preparation, stable setup mappings, database integrity, SUPER_ADMIN API/workspace, 50-migration rehearsal, and full regression/browser gates.
- [x] Phase 8 same-cohort carry-forward, complete year-end decisions, serializable idempotent outcome staging, database trigger integrity, fingerprint validation, SUPER_ADMIN API/workspace, 51-migration rehearsal, and full regression/HTTP/browser gates.
- [x] Phase 9 preflight, immutable-event-bound warning reasons, external artifact creation/live-domain-and-schema verification, READY-only approval, default-client READY list/detail refresh, 53-migration rehearsal, 45/45 readiness integration, 44/44 unit tests including offline Blob adapter checks, seven prior regression suites/16 tests, and production frontend build plus actual built mock-browser 191/191 acceptance.
- [ ] Validate managed-identity storage in a controlled live-cloud environment.
- [ ] Run the backfill dry-run on a scrubbed production-like clone, resolve every blocker, reconcile counts, and obtain data-owner sign-off.
- [ ] Phases 10–13: execution-transaction fresh preflight/artifact reread, atomic cutover, complete administrator workflow, recovery, restore rehearsal, and supervised rollout.

## Acceptance criteria

- A new term begins with zero attendance, results, reports, invoices, payments, and campaigns.
- Source-term records remain queryable and unchanged.
- Administrators see one logical class while APIs use the correct term offering.
- Promotion occurs only after the final term.
- Old balances remain attributable to origin and are never duplicated.
- Exactly one active term exists and compatibility fields agree.
- Closed records reject ordinary writes; approved corrections create audited versions.
- Every cutover has a verified backup, immutable snapshot, approved preflight hash, warning acknowledgements, and transactional event trail.
