# 06w — Workspace Decision Log (ADR-W)

_Cross-product decisions: ones that belong to **no single product**. Product-specific decisions stay in
[`06-decisions.md`](06-decisions.md) (2-D, `ADR-NNN`) and [`06b-decisions-3d.md`](06b-decisions-3d.md)
(3-D, `ADR-3D-NNN`). Add a new entry (don't rewrite history) when a decision is made or reversed._

**Pre-existing workspace decisions keep their original homes.** Nothing is renumbered or relocated —
see ADR-W-001.

---

## ADR-W-001 — Establish a workspace-level decision log

**Status:** Accepted (2026-08-08)

**Context.** The workspace hosts several products (`src/` 2-D, `src3d/` 3-D, `server/` shared, with
`src-analytic/` and `src-complex/` planned per [docs/22 §9](22-workflow.md)). Decisions belonging to no
single product — the products registry, the isolation rule, deploy topology, documentation structure —
have had no home and landed in whichever product log happened to be open. [ADR-266](06-decisions.md#adr-266),
which establishes the multi-product workspace itself, sits in the **2-D** log.

Numbering was also about to collide: the natural next slot, `06c`, is already allocated to analytic geometry
(`06c-decisions-analytic.md`, ids `ADR-AG-NNN`, [docs/22 §9](22-workflow.md)).

**Decision.** Cross-product decisions are recorded here as `ADR-W-nnn`, in `docs/06w-decisions-workspace.md`
— `06w` for *workspace*, leaving `06c`/`06d` free for the products already registered against them.

**Existing ADRs are never renumbered or relocated.** Over 200 ids are referenced from documentation and code
comments; stable anchors are worth more than tidy filing. ADR-266 keeps its id and its home in the 2-D log.

**Consequences.** A third log to check, offset by a session working in one product no longer having to read
another product's log to learn a workspace rule. New products get an obvious place to register. The
misfiling of ADR-266 is accepted permanently rather than corrected.

---

## ADR-W-002 — CLAUDE.md is an orientation file, not a session log

**Status:** Accepted (2026-08-08) · **Issue:** #452 · **Guards:** `server/__tests__/docs-hygiene.test.ts`

**Context.** `CLAUDE.md` had grown to **192,188 bytes (188 KB)**, of which two sections — `Current state`
(93 KB) and `The 3-D sibling app` (79 KB) — were **90%**. Both were append-only session chronologies:
**95** `**Then (date):**` entries running from 2026-06-15.

Three measurements decided the shape of the fix.

1. **The chronology was redundant.** It referenced **200 distinct ADR ids, all 200 of which resolve** in
   `06-decisions.md` / `06b-decisions-3d.md`. It was a second copy of the ADR logs, ordered by date instead
   of by id, with no anchor and no index — and the one copy that loaded unconditionally into every session.
2. **It was also stale.** Its last update was 2026-07-30; ADR-425, 426, 427, 428 and ADR-3D-111/112 all
   landed afterwards without touching it, while `06-decisions.md` and `DEPLOY-LOG.md` were updated the same
   day. A cold session reading it concluded the project had ended nine days earlier. The ADR logs are the
   only durable record actually kept current.
3. **It regrows fast.** Main line: 135,150 B (2026-07-23) → 192,188 B (2026-07-30) — **+57 KB in seven days,
   ~2 KB per commit.** A 10 KB file returns to 188 KB in roughly three weeks of active work. A one-off
   cleanup without a guard provably evaporates, so **the guard is the deliverable**.

There is a precedent and a warning in this repo's own history: on 2026-07-16 the same operation was performed
on a sibling (*"archive plan status log, replace the 81KB status line with a lean pointer"* →
`docs/09b-status-log.md`). **That file has not been touched since.** Archiving produced a second dead file,
not a maintained one.

**Root cause.** The file had no stated *kind*. Without one, "record what happened" is a locally reasonable act
on every commit, and 95 locally reasonable acts produced 172 KB. Naming the kind makes the pressure visible
at the moment it recurs.

**Decision.**

- **CLAUDE.md is an orientation file**: what exists, where it lives, what must never be done. It carries **no
  history and no status**. The prose is **deleted, not moved** — it is already in the ADR logs, and moving it
  into another session-loaded file (per the 09b precedent) just relocates the problem. Git history is the net.
- **Current state is read from the live sources only**: the ADR-log tails, `gh issue list`,
  **`gh pr list`** and `docs/DEPLOY-LOG.md`. The older narrative logs (`09-implementation-plan.md`,
  `09b-status-log.md`, `PROJECT-MEMORY.md`) are labelled as background that lags, never as current status.
  *(Amended 2026-08-10, [#488](https://github.com/dcodish/geo_builder/issues/488): `gh pr list` was missing
  from this list, and `DEPLOY-LOG.md` records what WAS deployed, never what is awaiting deploy — so a cold
  session following this list faithfully still could not see a finished feature sitting in an open PR. The
  omission was not the trim's doing; the trim made it load-bearing by making this the one canonical list.)*
- **The 3-D section moves to `src3d/CLAUDE.md`** — condensed to an orientation file for that tree, not
  relocated verbatim. It is picked up when a session works in `src3d/`, so 2-D sessions stop paying for 3-D
  history, and it matches the product-isolation doctrine already enforced mechanically.
- **Two guards**, in `server/__tests__/` so they run in **every** per-product CI lane (the
  `isolation.test.ts` precedent): a size ceiling with headroom, and a **ban on the dated-chronology form**
  (`**Then (`). The second is the real guard — size creeps back one justified paragraph at a time, but the
  `Then (` form is the specific habit that produced 172 KB, so banning the *form* surfaces the pressure at
  the moment it recurs. A third assertion keeps every ADR id referenced by either file resolvable, so the
  one-off pre-delete verification becomes standing.
- **One fact, one home.** `.claude/memory/` entries that merely restate a CLAUDE.md standing rule are
  retired; memory keeps only what no repo doc carries. Duplicated rules drift, and after they drift nobody
  can tell which copy a session obeyed.

**Consequences.** ~45k tokens of context returned at the head of every session, and — more valuable — the
standing rules stop competing with three months of narrative for attention; previously `no autonomous API
calls` and `triage-first` sat *after* 172 KB of history. Costs: the two CLAUDE.md files must be kept honest
by hand (no mechanism asserts the module map still matches the tree), and a session wanting narrative history
must now go to the ADR logs — which is the intent.

The ceiling is set with headroom rather than at the current size: a guard that fires spuriously gets
relaxed, and then there is no guard at all.

---

## ADR-W-003 — Product boundaries are a machine-readable manifest, and directory classification is total

**Status:** Accepted (2026-08-08) · **Issue:** #453 · **Amends:** [ADR-266](06-decisions.md#adr-266), docs/20 §12 · **Guard:** `server/__tests__/isolation.test.ts`

**Context.** The isolation rule — product trees never import each other — was enforced by a test that
**hard-coded exactly two edges** (`src` ↔ `src3d`) and asserted nothing else. Three gaps followed from the
form, not from the rule:

1. **A new product arrives unguarded.** `src-analytic/` and `src-complex/` are already registered
   ([docs/22 §9](22-workflow.md)). Neither would have been covered, and nothing would have said so.
2. **A new directory arrives unclassified.** Nothing asked which layer it belonged to — so "should this be
   copied or shared?" was answered by analogy, and analogy has no edge.
3. **The deliberate coupling was invisible.** `server/parseHandler.ts` imports from **both** product trees
   (`src/parser/llmShared`, `src3d/parser/llmShared3`) — the one intended sharing point, parameterized by
   `tool:`. Nothing recorded that, so on inspection it reads exactly like the violation the test exists to
   prevent. A rule whose deliberate exceptions are folklore is a rule people learn to distrust.

**Decision.** `BOUNDARIES.json` at the repo root is the **single authoritative** statement of trees, layers,
and import edges. The isolation test **reads** it and states nothing itself — a registry and a test that
restate each other drift, and after they drift the rule is held by interpretation again. Four assertions:
the manifest is well-formed and non-vacuous (declared trees exist on disk, every edge names declared trees
and carries a rationale); every **forbidden** edge holds, against relative *and* alias specifiers; directory
classification is **total**; and every documented **allowed** edge is real, so the manifest can never
advertise a coupling the code no longer has.

Layers are a **classification vocabulary**: `engine` (reasons about points, lines, planes, DOF, constraints),
`lexicon` (names vocabulary, or maps a noun to a shape), `shell` (everything else). Classification is total
by construction — an unclassified directory fails the test, which is the mechanical half of the §2 copy
tripwire added to [docs/17](17-design-rules.md) in the same change.

Two edges were **added** on measurement, not inherited: `src ↛ server` and `src3d ↛ server` (both already
clean). A product talks to the proxy over HTTP; importing server code would pull the key-handling path into
a browser bundle.

**What this does NOT decide.** Whether a non-`engine` layer may be **physically shared** (a `shared/` tree)
is deferred, deliberately. The proposal that prompted this work argued for extracting `src/ui` and
`src/i18n`; measurement did not support it *yet*:

- `src3d/` has **no** modal, dialog, or overlay UI at all — it does not duplicate `src/ui`, it lacks it.
- `src/ui` is imported by exactly **one** file in the repo (`src/App.tsx`): a two-file, single-consumer
  directory. Extracting an abstraction for a second consumer that does not exist is speculative generality.
- `src/App.tsx` carries **105 inline hex colours** despite importing `theme.ts` — the 2-D theme is not a
  settled abstraction, and sharing it would export an inconsistency and freeze it.
- The `i18n` bootstrap dedup totals ~25 lines, against a new tree, a new alias in `tsconfig` and two Vite
  configs, and a rewritten test.

**Trigger to revisit:** when `src-analytic/` starts. That is when there are genuinely three products, the
shell duplication triples, and the boundary can be drawn against real demand instead of two files. The
classification landing now is what makes that decision measurable rather than rhetorical.

**Consequences.** Adding a product is a manifest edit, and forgetting to guard it is impossible. The
deliberate `server → both products` coupling is documented where the rule lives. `engine` keeps its
copy-never-share doctrine exactly where it earns it. Cost: one more file to keep honest, and the standing
risk that classification becomes rote — the rationale field and the tripwire exist to resist that.

---

## ADR-W-004 — A diagnosed class must be checked against the sibling product

**Status:** Accepted (2026-08-08) · **Issue:** #453 · **Amends:** [docs/17](17-design-rules.md) §1, §5, §6

**Context.** The products copy patterns by design ([ADR-266](06-decisions.md#adr-266)), so they copy
**defects** by design. The evidence was already written down, in the ADRs' own words:

- `ADR-3D-110` — "the `ADR-3D-069` shape verbatim"
- `ADR-3D-093` — "the `ADR-167` shape" ("the node-definition issue, **again**")
- `ADR-424` — the 2-D twin of `ADR-3D-070`

Each was found months after its twin, by accident. [docs/17](17-design-rules.md) §1 already requires
grepping for siblings of a class — but only *within the tree being fixed*. Nothing ever asked whether the
sibling product had the same class, so the answer was never wrong; it was never sought.

**Root cause.** The diagnosis protocol was written when there was one product and was never revisited when
there were two. The class sentence it demands is already product-neutral ("a **statement about an existing
object** is executed as a **re-creation**"), so the cross-product question costs one grep — the protocol
simply never posed it.

**Decision.** A class fix is not done until the sibling product has been checked and the answer **stated in
the ADR**. "Checked `src3d/`, class not present" is complete; silence is not. If the sibling has the class,
**file an issue against that product** rather than fixing it in the same commit — different product,
different CI lane, different ADR log, and per [ADR-265](06-decisions.md#adr-265) a cross-product fix is
scoped with the operator, not smuggled in under one product's banner.

**Explicitly: this is not solved by sharing code.** Every class above lives in the `engine` layer, which
[ADR-W-003](#adr-w-003) keeps copied on purpose. The check *is* the mechanism.

**Consequences.** One grep and one sentence per class fix, against classes that have historically cost a
full diagnosis session each to rediscover. It is a discipline, not a guard — no test can assert that a
question was asked honestly, which is why it is written into the definition of done where it will be read.

## ADR-W-005 — CI is BEST-EFFORT; the local full suite is the gate

**Status:** accepted, 2026-08-09 · **Issue:** #388 (closed as not-an-issue) · **Operator ruling**

**The decision.** GitHub Actions has been blocked on billing since 2026-07-25, and #388 tracked that as a
defect to repair. The operator's ruling closes it: *"not an issue — we should close it and just acknowledge
that it will sometimes work and sometimes not."* CI is therefore **best-effort infrastructure**, not a
gate, and a red or absent CI run is not by itself a reason to hold a merge.

**What this does NOT relax, and the reason to write it down.** The bar is unchanged — it simply has one
owner instead of two. `npm run test:full` **green locally, plus `tsc -b` and both builds clean**, remains
required before every commit and every deploy (root CLAUDE.md standing rule 5). With CI unreliable, that
local run is the *only* thing standing between a regression and `main`, so the honest consequence of this
ruling is that skipping it is now strictly worse than it was, not more acceptable.

Report the result truthfully in the commit or the PR — counts, and any skips — since no second opinion is
coming. A session that cannot run the full suite says so rather than implying a gate that did not happen.

## ADR-W-006 — A mirror's contract is DERIVED from the mirrored source, never enumerated

**Status:** accepted, 2026-08-10 · **Issue:** [#501](https://github.com/dcodish/geo_builder/issues/501) ·
**Extends:** [ADR-346](06-decisions.md#adr-346)

**What happened.** The 2026-08-10 log triage reported «שזוות A לא תהיה ישרה» and «לא תהיה ישרה» as ▶ LIVE
grammar gaps. Both are false: the App refuses them PRE-parse through the #436 negation guard
(`statedNegation`, `submitPipeline.ts`) and answers with guidance. `triage.mjs` never learned that check,
so its replay fell through to `parse` → `not-handled` → "LIVE gap" — and the run **uploaded those verdicts
to prod**, where the admin dashboard's «פערים אמיתיים» card now annotates two deliberately-answered inputs
as open gaps. Fourth drift of the same mirror, and the fourth time the instrument produced confident false
signal in the exact place it exists to prevent it.

**Root cause — the guard was an enumeration.** ADR-346's anti-drift test already checked the predicate-based
short-circuits, but against a hard-coded list: `for (const p of ['looksLikeLatex', 'wordRootMagnitude'])`.
**A guard that enumerates the predicates it knows about cannot fail on a predicate it does not know about.**
#436 added a third pre-parse guard and nothing forced either the list or the harness to follow. This is the
one-directional-guard shape #255 documents, applied to the guard itself — the instrument that measures
drift drifted, silently, because its contract was a copy rather than a derivation.

**The decision.** *Where one artifact mirrors another, the guard extracts the contract from the mirrored
SOURCE rather than restating it.* Concretely: the pre-parse guards are now read out of `submitPipeline.ts`
by structure — every `ident(utterance)` call between the store-op block and the `parse(` call — and each
extracted name must appear in `triage.mjs`. A new pre-parse guard fails the test the day it lands, with
nobody having to remember anything. Both anchors are asserted present, and the extraction is asserted
non-empty, so an anchor drift cannot silently shrink the expectation into a test that passes forever while
proving nothing.

**Scope.** This is the general rule, not a one-off: the same shape applies to any place a script, a doc, or
a second product restates a list the source already owns. Where a derivation is genuinely impossible, the
enumeration must at least be guarded from BOTH sides (assert the source still has each member — the
existing honesty-gate check does this) so a stale list is loud rather than quiet.

**Not fixed here:** the two false verdicts already on the prod dashboard. They are corrected by the next
triage run, which is operator-invoked (it fetches from prod and uploads) — flagged rather than done
autonomously.

## ADR-W-007 — PUSHED is not the finish line: session start reports merged-ness and deployed-ness

**Status:** accepted, 2026-08-10 · **Issue:** [#488](https://github.com/dcodish/geo_builder/issues/488)

**What happened.** PR #471 (the admin sessions view) was built, green and pushed on the work PC on
2026-08-09, and never merged — the play-and-approve gate was still open when the day ended. The operator
switched to the home PC, looked at the live admin pages, and found the feature missing. Nothing in the
session-start report, in `CLAUDE.md`, or in any log said *a finished feature is sitting in an open PR*.

**Root cause — the wrong predicate, applied consistently.** `scripts/session-sync.mjs` encodes one model:
*git is the only channel, so anything not committed-and-pushed does not exist on the other machine.* Every
check keys on it — uncommitted files, unpushed commits, dependency drift, stray auto-memory. PR #471 was
committed **and** pushed, so by that model nothing was wrong and the script correctly said nothing. The
model is true and **insufficient**: there are two further states where work is complete and still invisible,
and both bit on the same day — *pushed but not merged* (on a branch, awaiting the operator), and *merged but
not deployed* (the proxy had gone undeployed since `prod/2026-07-27-2`, two weeks of static-only deploys,
with nothing ever saying so). Same shape as [ADR-352](06-decisions.md#adr-352) and
[ADR-434](06-decisions.md#adr-434): the data was always available (`gh pr list`, `git log prod/…..main`) and
no surface read it.

**Decision.** `session-sync.mjs` **start** mode gains both checks — it already fires on exactly the failing
event (session start / machine switch), already exists to report things needing a human decision, and
already fails open. It now prints any open PR with its branch, and any commit on the trunk newer than the
most recent `prod/*` tag, calling out how many touch `server/` (a proxy deploy is a rebuild + restart, not a
static push). Both are best-effort by contract: a missing or unauthenticated `gh`, an offline box, or a repo
with no prod tag prints nothing and exits 0 — **a hook must never wedge a session**, and `gh` gets a 10 s
timeout because a hook that hangs is worse than one that reports nothing.

**The documentation half, which is the durable part.** [ADR-W-002](#adr-w-002--claudemd-is-an-orientation-file-not-a-session-log)
made one canonical list of live state sources, and that list had a hole: open PRs were not on it, and
`DEPLOY-LOG.md` records what *was* deployed, never what is *awaiting* deploy. A cold session following
`CLAUDE.md` faithfully still could not see #471. So: `gh pr list` joins the list in both `CLAUDE.md` and
ADR-W-002, DEPLOY-LOG's entry says explicitly what it does not answer, and the `/handoff` skill gains a step
naming open PRs and undeployed commits before it may declare a session handed off — it previously mentioned
neither.

**Acceptance.** A session started with an open PR and undeployed `main` commits prints both lines; a clean,
merged, deployed tree prints neither. Verified on this machine: 2 undeployed commits reported, no open PRs.

## ADR-W-008 — A per-machine artifact may not feed a cross-machine decision

**Status:** accepted, 2026-08-10 · **Issue:** [#502](https://github.com/dcodish/geo_builder/issues/502) ·
**Extends:** [ADR-346](06-decisions.md#adr-346) Am. 2

**What happened.** The 2026-08-10 triage header read *previous triage: 2026-07-23*, and its ▶ LIVE **NEW**
sections listed rows that had been put in front of the operator two days earlier on the other PC — «אלכסון
תיבה AC'» (filed #449, approved), «שזוות A לא תהיה ישרה» (filed #436, fixed and closed), the #448 height
form (approved, partly built). The "spend your attention on NEW" rule inverted into its opposite: attention
re-spent on already-triaged, already-approved, even already-FIXED rows, with a live risk of re-filing them.
The session caught it only because the issues happened to cite the 08-08 triage in their bodies.

**Root cause.** `logs/triage-state-<app>.json` is per-machine and gitignored — **correct** for the raw
utterances it holds (this skill's privacy posture) — and the NEW-vs-carried split was *derived from it*. So
a decision that is inherently cross-machine ("have we already shown the operator this row?") was reading an
artifact that by construction knows only about one machine. Third instance of the same workspace class in a
week: #484 (test-tier membership measured per machine), #488 (merged/deployed-ness invisible after a
switch), and this.

**Decision — split the artifact by what it holds, not by what it is for.** The per-machine state keeps the
verdict cache and the raw text, unchanged. A second, **git-tracked** file `reports/triage-surfaced.json`
answers only *was this row surfaced, and when*: hashed row keys (`sha256(salt + app + utterance)`,
truncated) and dates. No utterance text, so the privacy rationale that keeps the state file out of git is
preserved exactly; the salt is a namespace, not a secret, and the file says so rather than implying
protection it does not give. `--reverify` / `--no-state` semantics are unchanged, and a machine with no
local state still does a full verification sweep — it just no longer mislabels old rows as new.

**Migration, so the first run does not erase history.** A row this machine had already surfaced carries its
REAL date into the tracked file rather than being re-stamped with today's, or the fix would have destroyed
the "sitting there unactioned since" signal on the very run that introduced it.

**The general rule, which is the reusable part:** *when a decision spans machines, the state it reads must
travel; when the data is private, split the artifact so the ANSWER travels and the DATA does not.* Reach
for that split before concluding a per-machine cache is unavoidable.
