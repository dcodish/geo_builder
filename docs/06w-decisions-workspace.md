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

## ADR-W-009 — A measured threshold is a RATIO, never a wall-clock constant

**Status:** accepted, 2026-08-10 · **Issue:** [#484](https://github.com/dcodish/geo_builder/issues/484) ·
**Amends:** [ADR-394](06-decisions.md#adr-394)

**What happened.** Every `npm run test:full` rewrote `reports/test-tiers.json`, and the result depended on
which PC ran it — one measured refresh was *14 insertions, 70 deletions* against a refresh from the other PC
committed hours earlier. The file flip-flopped on every machine switch: spurious diffs on an artifact no
human reads, and a near-certain conflict on any branch that happened to touch it.

**Root cause.** Tier membership was "every file measured **over 60 seconds**" — an **absolute** threshold
applied to a **machine-dependent** measurement. The home PC is faster, so few files crossed it; the work PC
is slower, so many did. Both lists were correct for the machine that produced them and wrong for the other.
ADR-394 commits the file deliberately *"so the fast tier matches on every machine"* — the intent is right,
and an absolute wall-clock cutoff simply cannot deliver it. This is the measurement analogue of
[ADR-052](06-decisions.md#adr-052)'s fixed-default smell: **a value that looks like a constant but is really
a free variable of the environment.**

**Decision — state the property, not one machine's reading of it.** The slow tier is now the heaviest files
that together hold `SLOW_SHARE` (0.75) of the suite's total file-time, each at least `MIN_MEAN_MULT` (3×)
the mean file duration. Both conditions are ratios, so a uniform speed difference cannot change the answer,
and both machines derive the SAME membership from their own timings. This is also precisely the intent the
60 s number was chosen to approximate — the original comment argued it from the distribution ("39 files over
it hold 73% of all compute, 5277 under 1 s hold 1%"), so the share formulation states directly what the
threshold was standing in for. The ADR-394 property worth keeping is kept: a test that gets slower still
joins the slow tier by itself.

The mean-multiple condition is not decoration: on a FLAT distribution nothing is "one of the heavy few", and
a share rule alone would sweep most of the suite into the slow tier. Flat ⇒ empty slow tier, which is the
honest answer.

**Guarded by the property itself.** `server/__tests__/test-tiers.test.ts` scales every timing by ×0.25 … ×10
and demands identical membership — *the old rule fails that test by construction, which is why it is the
test* — plus the flat/empty/zero degenerate cases and order-independence (ties break by name, so two
machines cannot disagree over equal timings). It lives in `server/__tests__/` for the `isolation.test.ts`
reason: those tests run in every per-product lane and this script belongs to no product. The script's CLI
dispatch is now guarded by an is-main check so the pure rule can be imported without running the suite.

**Consequences.** The committed artifact becomes stable by construction, so the interim rule in #484 ("do not
commit tier refreshes measured on the faster PC") is retired — refreshes from either machine may now be
committed. The per-file `ms` values in the file are the writing machine's and remain informational; only the
SET is meaningful, and only a change to the SET (or to the rule) rewrites the file.

## ADR-W-010 — An instrument must report what it does not know (#489, #439, #48)

Three P3s about the tooling, sharing one failure: **a surface that answers confidently where it has no
information.** All three were found by the instruments themselves, which is the argument for keeping them
honest rather than merely useful.

**#489 — a warning with no reason.** `git pull` writes its progress banner to stderr, so `e.stderr` is
non-empty on essentially every failure and the first line is `From https://github.com/…` — git's transport
chatter, not a reason for anything. A real session start printed exactly that while `main` sat 17 commits
behind: the safety net reported nothing actionable in the one case it exists for. The selector's intent
(prefer stderr) was right and its first-line assumption was noise by construction. `gitReason` now drops the
chatter, prefers a line in git's own error vocabulary, and falls back through to the raw text — never to
nothing. Applied to the `push failed` sibling too, which selected identically and would have misled the
same way. The `needs a PROXY deploy` hint from [ADR-W-007](#adr-w-007--pushed-is-not-the-finish-line-session-start-reports-merged-ness-and-deployed-ness) now excludes
`server/__tests__`: a hint that fires on a test-only change teaches the operator to ignore the hint.

**#439 — "fixed" and "aged out" were indistinguishable.** The prod sink keeps 7 days by design (a
minors'-data retention policy, and correct). The triage built BOTH report sections from the current log, so
an open row whose events expired simply stopped being emitted — the 2026-07-28 run's four carried-over rows
were absent from 2026-08-08's, which reads as *all resolved* when only one could be shown to be. The
dangerous direction, and the #35/#183 family again on the time axis instead of the context axis. The state
file still holds every surfaced row, so those rows are now re-verified against HEAD and reported with the
caveat carried in the DETAIL rather than in the `degraded` flag — forcing the flag would have routed every
still-failing aged row into `? UNVERIFIED`, i.e. off the worklist again, which is the same defect wearing a
different heading. The header also stops claiming `window: all time`, which has been untrue since retention
was set; it prints the span the log actually covers.

**#48 — the open-issues report** is now defined in [docs/22 §2c](22-workflow.md): trigger, per-row format
(including complexity read from the issue's OWN fix plan), the ordering rules, and two honesty clauses — an
issue missing its fix plan is FLAGGED rather than improvised into one at report time, and the report says
which rows can land directly on `main` versus which need a PR and the operator's play-and-approve. That last
distinction, not the priority, is usually what decides how much a session can actually close. **Batchability
is an explicit sort key**, because the P3 queue is the evidence: these ten items were only worth doing as
clusters sharing a root cause and one gate run, and that is precisely why they had accumulated.

## ADR-W-011 — /status-update: the standard issue-queue report (#521)

Operator (2026-08-11): asking for a list of issues must produce a STANDARD report, not an ad-hoc one —
so reports are comparable across days and the next fix round is decidable in minutes. The shape is
fixed by the skill (`.claude/skills/status-update/SKILL.md`): open issues grouped P1/P2/P3 and split by
product, bugs/features/debt distinguished, a per-issue VALUE indicator and COMPLEXITY/RISK grade, the
"waiting on you" section (needs-operator ∪ issues whose bodies pose unanswered rulings — the skill also
back-fills the missing label, so the queue converges on the truth), and a recommended next-round
composition (every P1 first; then a deliberate P2/P3 MIX — theme-affine P2 batches with quick P3 wins
riding along, per the operator's explicit "good mix" instruction).

Value and complexity are not stored on issues; the skill fixes the RUBRICS (value: prod honesty >
prod-log demand > blocked work > capability > polish; complexity: the issue's own measured surface when
present, else the layer, with RISK graded separately — a one-line fix in the solver is still risky) so
two sessions grade the same issue the same way. The report is always built from the LIVE queue
(`gh issue list`), never from session memory — the queue wins every disagreement.

## ADR-W-012 — /fix-round: autonomous execution of operator-approved fix plans (#543, #544)

Operator (2026-08-12): dispatching fixes one at a time ("now fix this, now fix that") does not scale
against a 66-issue queue, and per-fix validation interrupts too much. The automatable stage is **fix
execution** — the one stage that is mechanical once triage (docs/22 §2b) has already written a
root-cause fix plan into the issue. Intake (log-triage), triage, and validation keep their owners.

The mechanism (`.claude/skills/fix-round/SKILL.md`, route in docs/22 §2d): eligibility is the
**`auto-ok` label, applied only by the operator** after reading the plan — blessing a plan is a
30-second read, and the label is the control knob that replaces per-fix dispatch. A round is **3–5
work items** *(superseded twice — 5–8 with a ceiling of 10 by [ADR-W-028](#adr-w-028--the-fix-round-cap-is-58-items-with-stop-conditions-35-was-a-phase-1-number-that-has-now-been-measured-767), then **20** by [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028); the rest of this sentence stands)*
where a bundle of issues sharing one root cause counts as ONE item (operator ruling: the
cap must never prevent a correct bundle). Each item runs in its own worktree under the full standing
gates; bugs land on `main` (`Fixes #NN`), features become PRs the round never merges; open P1s stop
the round before it starts. The **escalation exit** is what keeps standing rule 1 intact under loop
pressure: a plan that fails contact with the code is commented back onto the issue
(`auto-ok` → `needs-operator`) and skipped — the round executes plans, it never improvises one, and
an escalated item is the mechanism working, not failing.

Validation is batched, not skipped: the round ends with ONE round issue labeled **`awaiting-play`**
carrying the play sheet (Hebrew utterances per item, landed/PR'd/escalated lists); the operator plays
the batch in one sitting and closes the issue as the validation signal. `/status-update`'s "Waiting
on you" section (#544) grew into the full attention surface — decisions, plans awaiting `auto-ok`,
PRs awaiting play-and-approve, rounds awaiting validation — so one report feeds the whole loop.

**Deliberately deferred (Phase 2):** scheduled/unattended runs, and their landing policy (bugs
direct-to-main vs one-PR-per-round) — undecided until Phase 1's measured escalation rate provides the
data. First live round only after the operator's home-PC work in flight on 2026-08-12 has landed.

## ADR-W-013 — The round issue is a live ledger opened at composition, not an end-of-round report (#547)

**Status:** accepted, 2026-08-13 · **Amends:** [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544)

**Context.** Reviewing ADR-W-012's `/fix-round` before its first live run, six traceability gaps shared
one root cause: **the round's only durable artifact was written at the END, free-form.** Everything
before Step 5 lived in session chat, which evaporates — the announced composition (the round's
contract), which eligible items were left out and why, skips, and in-flight state. A session dying
after item 2 of 4 would leave pushed commits with nothing recording that a round was in flight. The
end-of-round body spec ("landed / in PRs / escalated" one-liners) also omitted the evidence a later
reader needs — ADR ids, gate results, and where the executed fix deviated from the plan the operator's
`auto-ok` actually approved — and Step 4's "track the escalation rate in the summary" had no
accumulation mechanism: per-round prose cannot be aggregated, so the Phase-2 landing-policy input
(#543) was being collected in a form that cannot answer it.

**Decision.** The round issue opens **at composition time** (new label **`in-round`**, swapped to
`awaiting-play` at finish) with the composition plus the not-picked list as its initial body, and is
**updated as each item resolves** — a live ledger. Item commits carry `round #RR` alongside
`Fixes #NN` (bidirectional git ↔ round traceability). The final body carries per-item evidence
(commit SHA, ADR ids, a one-line gate record, and a **required deviations-from-plan line** — `none`
or one justified sentence; a deviation that resists one honest sentence was an escalation), a
**skipped** section, and a fixed machine-greppable
`stats: picked= landed= prs= escalated= skipped=` line, so Phase 2 aggregates rounds by listing
their issues, never by re-reading prose. Two guardrails ride along: a **stale-round gate** in the
preconditions (an open `in-round` issue stops a new round — never two live rounds), and a
**mid-round origin guard** (fetch before every landing; external `origin/main` movement stops
landing for reconciliation instead of a silent rebase). `/status-update` surfaces `in-round` in the
attention section as "executing now or crashed mid-flight".

**Explicitly not done:** verifying *who* applied `auto-ok` — Claude sessions authenticate as the
operator's own `gh` account, so an actor check cannot distinguish operator from session; the
"operator-applied ONLY" rule stays procedural, which is worth stating so nobody later mistakes it
for mechanically enforced.

**Consequences.** Validation semantics are unchanged (closing the round issue remains the signal);
the round pays one extra `gh issue create` at start and one `gh issue edit` per item. What it buys:
plan-vs-outcome readable without the session chat, crash-safe rounds, one-hop evidence per landing,
and an escalation-rate record that accumulates by construction.

## ADR-W-014 — Batch approval: one operator okay arms a round; `auto-ok` may be transcribed, with an audit comment (#548)

**Status:** accepted, 2026-08-13 · **Amends:** [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544)

**Context.** The first live-round attempt starved on an empty `auto-ok` queue — while five issues
(#546 #505 #504 #503 #392) carried the operator's approval **in prose** from earlier triage sessions.
The approval had happened; only its transcription into the label had no owner, so the operator was
being charged a second, per-issue approval act for decisions already made. The operator's ruling
(2026-08-13, scoped via explicit A/B/C question): approval stays per-batch and explicit — **"batch
okay per round"** — not standing class-based pre-approval, which remains the Phase-2 landing-policy
question (#543) awaiting measured escalation rates.

**Decision.** The `auto-ok` label records an **operator approval**; who types the `gh` command is
transcription. When a session has presented a concrete composition (typically `/status-update`'s
recommended round) and the operator replies with an explicit batch approval ("approved", "okay, fix
1/2/3", with any swaps), the session applies `auto-ok` to exactly the named issues **in the same
turn** and posts an **audit comment on each**, quoting the approval and its date. A session never
infers approval — not from silence, not from prose in an issue body (prose approvals are surfaced as
*candidates* and re-presented for a batch okay, exactly as the five above were backfilled via an
explicit question). `/fix-round` treats a bare `auto-ok` with neither an audit comment nor the
operator's own memory of applying it as a labeling error (Skipped + ask). The round itself still
never applies the label — composing and approving remain separate acts. Every round's final message
additionally carries a **"waiting on you" digest** (open `needs-operator` questions + plans awaiting
`auto-ok`), so what is blocked on the operator reaches them without a separate report — their stated
requirement ("if there are things waiting for my decision, I need to know").

**Consequences.** The operator's cost per round drops from N label edits to one reply, on either PC
(labels and audit comments live on GitHub, so the armed queue travels by construction). The audit
comment preserves the paper trail ADR-W-013 noted cannot be enforced by actor identity — provenance
is now readable on the issue itself. Touchpoints: docs/22 §2d, CLAUDE.md label glossary,
`.claude/skills/status-update/SKILL.md` (the arming line), `.claude/skills/fix-round/SKILL.md`
(Step 1 validity rule + Step 6 digest).

## ADR-W-015 — exercise-sequence agent: textbook exercise → VERIFIED utterance sequence (#567)

**Status:** accepted, 2026-08-13

**Context.** The validation work is corpus-driven (CLAUDE.md → Documentation): a real bagrut exercise
is reproduced as a *figure* and compared against the official image. Transcribing an exercise into app
input was manual — author a sequence, play it in the dev server, eyeball the result — and nothing
proved that a written-down sequence still builds on HEAD. The LLM lane cannot help autonomously
(standing rule 2), and the one existing headless replayer (log-triage's `triage.mjs`) is welded to
prod-log sessions.

**Decision.** A project subagent, **`.claude/agents/exercise-sequence.md`**, accepts an exercise
(text / image / PDF page), extracts only the **stated** figure givens (never solves, ADR-052 — no
invented magnitudes), routes 2-D vs 3-D, authors a Hebrew line-per-fact sequence in catalog phrasing,
and must verify it before reporting via **`.claude/skills/exercise-sequence/run-sequence.mjs`**
(vite-node). The verifier is **not a new mirror of the submit path** (the ADR-346 drift class): the
2-D lane calls the scenario harness's own `factsOf`/`replayFacts`, whose pure core moved **verbatim**
to `src/__tests__/scenario-pipeline.ts` (the harness re-exports it, every test import site unchanged)
because the harness's top-level `import { expect } from 'vitest'` refuses to load outside the test
runner. The 3-D lane is the `parse3` → `derive3` shape triage.mjs already established. Per-line
verdicts (`built` / `applied` / `no-change` / `error-now` / `parse-fail`) + a FINAL judgement with
the givens verifier; exit 0 ⇔ every line parses deterministically and the figure is verifier-clean.
Agent obligations: given-by-given accounting (an inexpressible given is reported, never dropped),
expected-differences notes for unstated free DOFs, grammar gaps reported as **candidate** feature
issues only (filing needs operator approval, docs/22), no live LLM calls, no repo writes.
*(Amended 2026-08-13, same session: images uploaded IN-CHAT are invisible to a subagent — the parent
conversation's image blocks do not travel. The agent contract therefore accepts a third input form, a
**figure brief**: the invoking session, which can see the upload, transcribes the figure — labels,
stated givens, markings, ambiguities — and passes the brief in the prompt; a file path remains the
preferred route when one exists.)*

**Consequences.** A textbook exercise becomes a proven, copy-pasteable sequence in one agent run, and
the same sequences are one step from fixture/scenario locks (standing rule 4). The `scenario-pipeline`
split gives ANY future headless tool the exact app path without vitest, keeping the implementation
count at one. Verdicts are HEAD-truth, so a sequence that stops building is caught the next time it
is verified, not when the operator plays it.

**ADR-W-014 Amendment 1 (2026-08-13, operator ruling): a CLEAR PLAN is itself the approval.** After one
day of batch-approval practice the operator ruled: *"If an issue has a clear plan, it should be
auto-ok."* The default inverts — an issue whose body carries a concrete, self-contained fix plan and no
open operator question is ARMED (`auto-ok` + an audit comment citing this ruling) as part of triage or
the status pass, without a per-batch okay. What still gates: `needs-operator` and any unanswered
ruling/scope question in the body disqualify; a plan that is a sketch with open options ("needs a scope
call", "two directions worth measuring", diagnosis incomplete) is NOT a clear plan; P1s never enter
rounds silently; and the round's escalation exit remains the safety valve — a plan that fails contact
with the code goes back to `needs-operator` with the template. Batch approval (the original ADR-W-014
flow) remains for compositions and anything a session is unsure about. Applied retroactively to the
open queue the same day: 41 planned issues armed, each with the audit comment.

## ADR-W-016 — The shell layer becomes physically shared, seeded by evidence and consumed by the third product first

**Status:** accepted, 2026-08-15 · **Amends:** [ADR-W-003](#adr-w-003) · **Operator ruling**

**Context.** ADR-W-003 deferred whether a non-`engine` layer may be physically shared, with a named
trigger: *"when `src-analytic/` starts. That is when there are genuinely three products, the shell
duplication triples, and the boundary can be drawn against real demand instead of two files."* The
literal trigger has not fired — [ADR-CX-001](06d-decisions-complex.md#adr-cx-001) D5 moved analytic to
last. **Every condition it was written to detect has.** `src-complex/` is on disk, classified in
`BOUNDARIES.json`, and live in production, so there are three product trees today; and all four
measurements ADR-W-003 used to argue *against* sharing have moved against it:

| ADR-W-003's measurement (2026-08-08) | Measured 2026-08-15 |
|---|---|
| *"`src3d/` has **no** modal, dialog, or overlay UI at all — it does not duplicate `src/ui`, it lacks it."* | Still true, and `src-complex/` lacks it too — **two** products missing the same thing reads as a gap, not as absent demand |
| *"`src/ui` is imported by exactly **one** file… a two-file, single-consumer directory."* | Still one consumer; a second and third are now the question |
| *"`src/App.tsx` carries **105 inline hex colours** despite importing `theme.ts` — the 2-D theme is not a settled abstraction."* | **194** inline hex colours. `src3d/App3.tsx` carries 42 with no token module; `src-complex/styles.css` adds a **third palette** (warm stone against the siblings' slate) on a third styling stack |
| *"The `i18n` bootstrap dedup totals ~25 lines."* | Still ~25 lines — now written **three** times, and complex skipped locale *files* entirely so key parity cannot be diffed |

The stronger evidence is behavioural. The shell honesty behaviours are the ones that keep failing to
cross a product boundary: ADR-065's "this is the only configuration" report (2-D only), the load audit
(ADR-242 / ADR-3D-087 — complex has neither), save naming (ADR-274/286 — complex's own store comment
claims a convention its code does not implement), the in-app privacy note (NFR-SE-3 — absent in a
publicly linked product), the build stamp, usage logging, and the palette-as-assertable-module, whose
whole point (#482: *"a module can be asserted"*) `src-complex` reversed on day one by re-inlining it.
Each has now been implemented-or-forgotten three times. [ADR-W-004](#adr-w-004) explains why copying is
right for **engine** classes — *"Every class above lives in the `engine` layer, which ADR-W-003 keeps
copied on purpose. The check *is* the mechanism."* — and that reasoning does not extend to these.

**Operator constraint (2026-08-15):** *"i cannot afford impacting the 2d and 3d in prod… i will later
have this unification discussion."*

**Decision.** A `shell/` tree is created and **only `src-complex/` imports it**. `src/` and `src3d/`
are not migrated: zero lines of either change, and the unification of the two shipped products stays
the operator's later decision. The mechanical cost to shared files is one entry in `tsconfig.json`'s
`include` and the `BOUNDARIES.json` edges — the sibling builds are the acceptance evidence.

Three rules bound it:

1. **Seeded by evidence, never by anticipation.** A surface may enter `shell/` only if it is already
   implemented **≥ 2 times** across the existing trees and is settled. That is the direct answer to
   ADR-W-003's speculative-generality objection, which was correct and is preserved as a constraint
   rather than overturned. The opening set: design tokens (from `src/ui/theme.ts`, a documented design
   system), bidi isolation, the i18n bootstrap, the save-file envelope + naming + load audit, the
   symbol palette module, and the app frame (header, error/notice banners, DOF cue, About/privacy
   modal, product switcher).
2. **Parameterized by the caller.** ADR-W-003's rule stands verbatim: *"branching on product identity
   inside a shared module is a fork wearing a shared file's name."* No `if (product === …)` in
   `shell/`. `shell/` may not import any product tree — a forbidden edge in the manifest.
3. **`engine` is untouched by this.** Value core, model, solver, replay, scene, parser rules and
   catalogs stay **copied-never-shared**. ADR-W-003's `engine` doctrine and ADR-W-004's sibling audit
   are unchanged, and the audit now spans three trees.

**Reversibility, stated because the decision was taken while the operator slept.** Nothing consumes
`shell/` but the product being rebuilt, so backing it out is moving files into `src-complex/ui/` and
deleting two manifest edges. The cost of the alternative is not symmetric: a third copy re-drifts on
the first divergent edit — which already happened — and turns the later unification into a three-way
reconciliation.

**Consequences.** The `shell` layer's `sharing` field moves from `undecided` to
`shared-parameterized`; `lexicon` stays `undecided` (its carriers exist now — `src/parser/lexicon.ts`
and the morphology constants in `parse3.ts` — but #361 records that even the 2-D atoms have one
consumer, so demand is unproven). ADR-W-003's trigger is spent and is replaced by this entry.

## ADR-W-017 — Sibling safety is a check, not a promise (2026-08-16)

**Status:** accepted, 2026-08-16 · **Operator requirement** · **Guard:** `scripts/check-sibling-safety.mjs`,
`npm run check:siblings`, classifier unit-tested in `server/__tests__/sibling-safety.test.ts`

**Context.** Opening the complex-tool foundation rebuild ([#616](https://github.com/dcodish/geo_builder/issues/616)),
the operator set a standing requirement: *"as we continue evolving this complex tool we gain
capability, but we never, never, never harm the other tools that are running."* Two mechanisms already
pointed at that and neither covers it alone:

- [ADR-W-003](#adr-w-003)'s manifest + `isolation.test.ts` forbid **import** coupling. That closes
  `src-complex → src`, and says nothing about a change that edits `src/` **directly**, or that breaks a
  sibling through a file every product compiles.
- [ADR-W-005](#adr-w-005)'s local full suite catches behavioural regressions — but only after the work
  is written, only if it is run, and at ~4 minutes it is a gate, not a habit.

The gap between them is the one that bites: a slice scoped to one product quietly editing another's
tree, or a shared-surface edit (`tsconfig.json`, `package.json`, the proxy) whose sibling fallout
nobody thought to look for. Both are invisible to the import guard and both are cheap to detect.

**Decision.** A change is checked against the siblings in two ways, in seconds:

1. **A diff refusal.** Files belonging to a shipped sibling product — `src/`, `src3d/`, their entry
   HTML, their vite configs, their fixtures — may not change. The escape hatch is deliberately a
   **reason, not a flag**: `ALLOW_SIBLING_EDIT="why"` permits and records it. A bare `--force` gets
   typed reflexively; a sentence gets read back in review.
2. **The sibling builds, run regardless of the diff.** A shared-surface edit can break a sibling
   without touching one of its files, which is precisely what the diff check cannot see. `npm run
   build` and `build:3d` are the half that costs seconds and catches that class.

Two properties are load-bearing and are asserted rather than assumed. The classifier **partitions
totally**, and an **unrecognised path is SHARED, never inert** — unknown-by-default must mean "check
it", the `ci.yml` classifier's rule for the same reason. And `src-complex/` is matched **before**
`src/`, because a prefix table that swallows it would fail OPEN, waving through the exact edit the
script exists to catch. That near-miss is the first case in the unit test.

**What this does NOT replace.** `npm run test:full` remains the gate ([ADR-W-005](#adr-w-005)): the
builds prove the siblings still COMPILE, only the suite proves they still BEHAVE, and the script says
so in its own output whenever a shared file changed. Nor does it replace the import guard — the two
answer different questions, which is why both run.

**Consequences.** Complex slices carry a sibling-safety line in their PR, and a cross-product change
carries its reason in the environment where a reviewer will see it. Cost is one script, one unit test
in `server/__tests__/` (so it runs in every per-product lane, the `isolation.test.ts` precedent), and
~10 seconds per invocation. Verified non-vacuous on adoption: a one-line edit to `src/format.ts` was
REFUSED, and the check passed once it was reverted.

## ADR-W-018 — Product unification: four-plus builders, one learned interface (2026-08-16)

**Status:** accepted, 2026-08-16 · **Operator rulings throughout** · **Plan of record:**
[docs/28](28-product-unification.md) · **Umbrella:** [#648](https://github.com/dcodish/geo_builder/issues/648)

**Context.** The operator, on three shipped/rebuilding tools: *"we now have 3 tools but each has its
own ui and look and feel is a bit different so they don't feel like one tool… should we continue on
this route or step back a sec and do some ordering and ensure we have a robust product that doesn't
fix one item in 2d just to realise we should have also done it on other tools, or worse — we fix in
one tool and break in another."*

Measured at `main`, that is three complaints with three different answers:

| layer | duplicated? | answer |
| --- | --- | --- |
| **Engine** (~15,300 / ~10,900 / ~4,900 LOC) | **No** — different mathematics | Leave alone; [ADR-W-003](#adr-w-003)'s copied-never-shared stands |
| **Chrome** (194 inline hexes in `App.tsx`, 42 in `App3.tsx` with no token module, a third palette on a third styling stack, one ~25-line i18n bootstrap written 3×) | **Yes, visibly** | Share via `shell/` — already decided by [ADR-W-016](#adr-w-016), still unbuilt (#617) |
| **Doctrine** (51 distinct 2-D ADR ids cited from the 3-D log; honesty gates **18 / 8 / 0**) | **Yes — in prose only** | Make it enumerable and checkable. No mechanism exists today |

[ADR-W-017](#adr-w-017) already closed *breaking* a sibling. This ADR addresses *forgetting* one,
which [ADR-W-004](#adr-w-004)'s prose discipline has been practised faithfully (173 + 61 sibling
mentions) and still could not prevent: #555 (a gate whose 2-D twin was a P1), #656 (3-D has no
language toggle at all), and an inverted disable/delete pair between 3-D and complex.

**Decisions.**

1. **Separate builders at separate links, one learned interface.** *"i will eventually have 4 or maybe
   even more builders that should all look and feel the same but in reality they are accessed via
   different links… from a user pov he should be familiar with the tool and how to use it and what to
   expect."* One app with modes is **rejected, not deferred**. Navigation is a link in a shared
   toolbar. Nothing changes any builder's entry, bundle, URL or deploy topology.
2. **"What to expect" is a testable contract, not a style guide.** The conformance artifact therefore
   carries two row families — **correctness** and **interaction** — and is written over
   **properties, not implementations**, because `src-complex` demonstrated that the newest tree can
   hold the better mechanism (total span accounting over 18 post-hoc vetoes; wrap-selection over
   caret-insert). Enumerating mechanisms would drag the best answer down to the oldest one.
3. **The interface is fully specified** — docs/28 §4a, D1–D10, each measured out of the three `App`
   files before being ruled. 2-D is the reference and won six of ten; where it was measurably weaker
   the better mechanism won (D2 Tailwind, D5 wrap-selection), and D9 went somewhere no builder is
   today.
4. **The row list is DERIVED from the ADR corpus, not authored.** 665 ADRs exist; 109 carry
   contract-shaped titles that state the property outright. A dedicated pass triages all 665 titles
   and reads every candidate, yielding rows with provenance. This **satisfies** [ADR-W-006](#adr-w-006)
   rather than excepting it — the logs are the source to derive from — and makes the maintenance rule
   mechanical: a new ADR whose title carries contract language is either classified into the matrix
   or explicitly excluded with a stated reason, else the check fails.
5. **Any mechanism that holds a property counts.** The matrix records *which* mechanism each builder
   uses, so asymmetry stays visible (#659), but a better mechanism creates **zero** obligations
   elsewhere — the alternative turns every improvement into N−1 obligations and makes improving
   expensive.
6. **One machine-readable product registry**, cross-checked against `BOUNDARIES.json`: a registered
   tree with no roster entry **fails**. It retires the drift in the [docs/22 §9](22-workflow.md) table
   and `ci.yml`'s second hand-maintained copy of the same paths. The switcher renders it as **data**;
   `shell/` may not import a product tree.
7. **Operator-editable admin config**, on the existing password-protected `server/admin.ts`:
   *"human manageable config/admin pages where i can decide things without having to change code for
   it."* **Bounded by one non-negotiable line: config may CHOOSE AMONG what the code already
   supports and may never ASSERT support the code lacks.** A featured quick command is validated
   against that builder's catalog at save time and refused if absent — otherwise the admin page
   becomes a way to offer a student a command that fails, which is #511's blocker with a nicer UI.
   The static registry is the fallback, so an unreachable server leaves every builder working.
8. **Execution is BUILD-LED and split by exposure.** Matrix rows are written alongside each surface
   as it lands, and **a landing surface writes its row for every builder, not only the one being
   worked on**. Work that cannot change 2-D or 3-D behaviour goes to `main`; the visible UI migration
   of the shipped builders lives on `unify/ui`, one surface per PR, merged after the operator plays
   it. Rationale: `main` never reaches students on its own (deploys are manual), but a half-migrated
   `main` would force an emergency P1 deploy to carry unfinished UI.

**Consequences.** `shell`'s `sharing` field completes the move ADR-W-016 began. The docs/22 §9 table
becomes generated rather than typed. `server/admin.ts` gains persistence and write endpoints, having
been stateless and read-only. Two capabilities arrive that exist in no builder today: a per-builder
**manual screen** and **quick commands**. And the largest single build in the programme is D6 — the
fact list — because `src3d/store/store3.ts` has neither `removeFact` nor `replaceGroup` and
`useComplexStore` has no `enabled` flag.

**Accepted costs, recorded so they are not rediscovered as surprises.** No baseline: improvement is
asserted rather than measured, and the correctness gaps stay unknown during the build (Q1). The
weakest mechanism may persist as long as no counter-example is found, and "no counter-example found"
is not "holds" (Q3). 2-D runs two styling systems during the transition (D2). And the row list is a
judgement call per ADR — two passes could differ at the margins (Q2).

## ADR-W-019 — The shell/ tree lands: the seeded surfaces, the boundary edges, and what deliberately waited (#673)

**Status:** accepted, 2026-08-17 · **Issue:** [#673](https://github.com/dcodish/geo_builder/issues/673)
(unify A1; programme [#648](https://github.com/dcodish/geo_builder/issues/648), [ADR-W-018](#adr-w-018)) ·
**Implements:** [ADR-W-016](#adr-w-016)

**What landed.** `shell/` exists and `src-complex/` consumes it — ADR-W-016 executed. Seeded exactly
by the ≥2×-implemented-and-settled set, nothing speculative:

| surface | shell module | what complex gained by consuming it |
| --- | --- | --- |
| design tokens | `shell/theme.ts` — `src/ui/theme.ts` VALUES, the declared token source | consumed by the frame's own styling today; becomes the Tailwind theme in B1 (#666) |
| bidi isolation | `shell/bidi.ts` — the 3-D refinement as a FACTORY: the run alphabet and the declaration-split rule are caller parameters, never a product branch | registered as a post-processor on the complex i18n instance — the third builder had shipped with NO isolation (docs/28 §1a) |
| i18n bootstrap | `shell/i18n.ts` — `createProductI18n`, an own instance per product (ADR-3D-001 §9 by construction) | `src-complex/i18n` keeps only its resources |
| save envelope + naming + load audit | `shell/save.ts` | the envelope is validated on load (`version` was never checked — a future file half-loaded); saves are date-stamped `…-complex.json` (a fixed name silently overwrote); and the **ADR-242 audit arrived**: a line the load could not restore is REPORTED with its own refusal reason — before this it vanished, and `clearError()` erased even the evidence |
| symbol palette | `shell/symbols.ts` — the module SHAPE (#482: a module can be asserted) + the wrap-selection core (D5: an empty selection IS a caret insert) | palette data moved to `src-complex/ui/symbols.ts`, with a new totality lock: every button lands in an utterance the real grammar reads, and every inserted character stays inside the bidi run alphabet |
| app frame | `shell/frame/` — `AppFrame`, `Modal` (the 2-D a11y modal), `Banner`, `OverflowMenu`, `ProductSwitcher` | the D4 header (save/load/language behind `⋯`); an About modal whose **privacy note is a REQUIRED prop** — NFR-SE-3 can no longer be forgotten by a consumer, and complex had shipped publicly without one; the `__BUILD__` stamp, which the complex production config never defined |

**The boundary edges.** `shell` is a declared tree in `BOUNDARIES.json`; `layers.shell.sharing`
completes the ADR-W-016→W-018 move to `shared-parameterized`. Eight forbidden edges close the
boundary in both directions (`shell` → every tree; every tree → `shell` except the consumer), and
ONE allowed edge — `src-complex → shell` — which the isolation test asserts is **real**, so `shell/`
can never silently become a dead tree the manifest still advertises. `src → shell` and
`src3d → shell` are forbidden **deliberately**: Track B flips each one as an operator-played act
(docs/28 §5a), never by accident.

**What deliberately waited, so A1 did not absorb its neighbours.** The switcher ships DARK —
component and roster prop exist, and A2's registry (#661) lights it, because a hand-rolled roster
here is exactly the drift A2 exists to kill. No Tailwind (B1 owns the mechanism change; the frame
styles by tokens through the settled inline mechanism). Figure actions (cycle, view toggle) stay in
the header until B6 executes D7. No quick commands (B4), no fact-list operations (B5), no complex
locale-file split. Complex still has no figure-name field, so saves use the date-stamped fallback —
the name field arrives with B3's header.

**Also made honest on the way.** The complex title dropped «אב-טיפוס» — the prototype it named was
deleted by the cutover (ADR-CX-027), and a public banner claiming prototype status was stale. The
new privacy note states what is true TODAY (no registration, nothing leaves the browser — complex
has no usage logging); when logging arrives, the note must change with it.

**Consequences.** Every remaining A/B item now has the tree it is expressed in. `test:complex` runs
`shell/` (its only consumer's lane; sibling lanes adopt it when they adopt the tree). To ci.yml's
classifier and `check:siblings`, a `shell/` path is *unrecognised ⇒ shared* (the ADR-W-017 rule), so
a shell edit runs every lane — conservative and correct until A2 replaces the hand-kept path lists.
The complex layer-direction guard (`import-direction.test.ts`) gained the `shell` vocabulary — an
out-of-tree import classifies as the `shell` layer only when it lands inside `shell/`, and a layer
must LIST it explicitly (`store` and `app` today); any other escape from the tree stays a violation,
so the guard's fail-closed posture survives the new tree rather than being loosened by it.
Cost accepted: complex renders two styling mechanisms until B1 (tokens inline in the frame, the
stone-palette CSS in the body) — the same per-surface transition D2 ruled for 2-D.

> **Amendment — both reserved flips executed.** `src3d → shell` flipped with B3-3d (#668, PR #715,
> 2026-08-17). `src → shell` flipped with **B3-2d** (#668, 2026-08-18): the 2-D app mounts the
> shared AppFrame (curriculum title «הנדסת המישור», suite bar, tool row with שמור/טען moved off the
> canvas toolbar, shared FigureName, frame-owned language/dir/About; product header, footer and dir
> effect retired — the About body, contact line included, is composed once and shared with 2-D's
> first-load intro modal). With this every product consumes `shell/`, and
> `scripts/visual-parity.mjs` compares all THREE tools pairwise — it caught the עזרה button
> displacing שמור/טען from the suite position and gates the reorder: same buttons, same pixels,
> every builder. The B4/B5/B6 2-D halves (input area, fact list, data panel) remain, per-surface
> PRs on #669/#670/#671.

**Status:** accepted, 2026-08-17 · **Operator ruling** · **Issue:**
[#700](https://github.com/dcodish/geo_builder/issues/700) · **Amends:** [ADR-W-018](#adr-w-018)
decision 8 / docs/28 §5a

**The ruling.** *"I don't want to impact the existing 2-D tool. We can create a separate URL that
works in parallel until I'm happy with the new one, and then we switch over."*

**What changes.** ADR-W-018 already kept unfinished UI off `main` (Track B on `unify/ui`, per-surface
play, merge at whole-interface acceptance) — but its play channel was a dev server, and its endpoint
was a deploy onto the canonical paths. This ruling adds a **prod-parallel evaluation channel** and
moves acceptance onto it: each shipped builder gets a parallel URL (`…/geo-builder-next/`,
`…/3d-builder-next/`) serving the `unify/ui` build, while the canonical URL keeps serving the
untouched current build for the whole of Track B. The **switchover** — the canonical path taking the
accepted build — happens once per builder, at the operator's declared acceptance, as an ordinary
RUNBOOK deploy; the `-next` path is torn down after a grace period. 2-D is the named driver; 3-D
gets the same treatment (the standing constraint has always covered both shipped tools). Students
can only ever be on the canonical URL until the operator switches it.

**What does not change.** The `unify/ui` branch flow and per-surface PRs, `check:siblings`, the
engine boundaries, manual deploys, and the DEPLOY-LOG discipline — a `-next` deploy is a deploy and
is logged with its path named (the ADR-W-007 lesson applied to the new channel).

**Mechanism** — owned by #700: CLI overrides on the existing configs (`vite build
--base=/geo-builder-next/ --outDir dist-next`; no config forks), a RUNBOOK `-next` section including
the one-time Apache mapping of `/geo-builder-next/api` onto the same proxy, `__BUILD__`-stamped
usage separation, and a canonical-bytes-unchanged check. First use is deliberately the B1 (#666)
build — a visual no-op for 2-D — so the channel is proven before any visible surface rides it.

## ADR-W-021 — One machine-readable product registry, with teeth in three directions (#661)

**Status:** accepted, 2026-08-17 · **Issue:** [#661](https://github.com/dcodish/geo_builder/issues/661)
(unify A2; [ADR-W-018](#adr-w-018) decision 6)

**Decision.** `products.json` at the repo root is THE roster — `id`, `labelKey`, `icon`, `url`,
`devUrl`, `tree`, `buildTarget`, `enabled` per builder — with three consumers, each a guard:

1. **The shell switcher renders it as DATA** — lit in the complex builder by this change (the A1
   component had shipped dark on purpose, ADR-W-019). `labelKey` resolves through each consuming
   product's OWN i18n resources, which is what keeps the registry product-neutral; `devUrl` swaps in
   under `import.meta.env.DEV` because the dev server serves every app from one origin.
2. **`isolation.test.ts` asserts a BIJECTION** between registry entries and the manifest's product
   trees (declared trees whose `product` is not `server`/`workspace`): a registered tree with no
   roster entry FAILS, and a roster entry naming a missing tree fails the other way — builder N+1
   cannot ship missing from the switcher. `buildTarget` must name a real npm script.
3. **`registry-consistency.test.ts` asserts the two hand-kept copies** — ci.yml's path classifier +
   lanes, and the docs/22 §9 table — carry every registry product. Static YAML/Markdown cannot read
   JSON, so the copies stay physically present; the assertions make forgetting one impossible.

**Found by writing it, which is the argument for it:** docs/22 §9's table had NO complex column —
a shipped, deployed product was absent from the workspace's own registry table. The bijection and
consistency checks turn that class of drift into a red suite.

**Also in this change:** the complex CI lane runs `shell/` (matching `test:run:complex` — A1 updated
the npm script and the lane had lagged), and §9 records complex as shipped rather than planned.

**Provisional, deliberately:** the `icon` glyphs (📐/🧊/ℂ) are a first pick — curation (labels,
icons, order, visibility) is exactly what A3's admin config owns, bounded by choose-among-what-exists
(ADR-W-018 decision 7). What is NOT configurable stays in code: which builders exist, their trees and
URLs — this file, cross-checked.

## ADR-W-022 — Operator config: persisted curation, bounded by choose-among-what-exists (#662)

**Status:** accepted, 2026-08-17 · **Issue:** [#662](https://github.com/dcodish/geo_builder/issues/662)
(unify A3; [ADR-W-018](#adr-w-018) decision 7)

**Decision.** `server/adminConfig.ts` + a `/config` page on the existing password-protected admin:

1. **The store** is one JSON document per tool beside the events log, written ATOMICALLY
   (tmp + rename, the event-log precedent). Malformed or missing reads as **absent** — the degraded
   path is a lock, not a fallback: a dead or configless server leaves every builder rendering its
   static registry roster.
2. **Save-time validation enforces the non-negotiable line** — config chooses among what exists:
   a switcher id absent from `products.json` is refused (builder 5 cannot be conjured from a form);
   a featured quick command runs through the tool's REAL grammar and is refused with the entry and
   reason if it does not parse. The complex lane uses `parseLineV2` (context-free), which adds the
   **`server → src-complex` allowed edge** to the manifest — the same binding-point pattern as the
   llmShared edges, asserted real by the isolation test. Tools whose validation lane does not exist
   yet (2-D/3-D quick commands await their B4 surface) are refused HONESTLY, never stored unchecked.
3. **The wire contract is a guarded mirror**: `server/adminConfig.ts` ↔ `shell/switcherConfig.ts`
   may not import each other (BOUNDARIES), so the `ToolConfig` shape lives on both sides and both
   sides tolerate unknown fields — the mirror can drift ahead but never hard-break the other.
4. **One config page curates every tool** (`…/admin/config?tool=<id>`, registry-validated): complex
   has no dashboard mount of its own — it does not log — and its curation must not wait for one.
5. **The public read** `GET /api/config?tool=` is unauthenticated by design (it serves students'
   builders and can only reveal curation saved for public display); `204` means "use your static
   roster". The complex builder applies the overlay via `shell/switcherConfig.applySwitcherConfig`;
   2-D/3-D consume it when their shell adoption lands (B3).

**Flagged, operator-side, one-time:** prod complex reads `/complex-builder/api/config`, so the same
Apache api-mapping the siblings have must be added for complex before the overlay is live in prod —
until then the degraded path serves the static roster, which is correct behaviour, not an error.

## ADR-W-020 — The parallel `-next` deploy channel: Track B evaluated in prod conditions without touching prod

**Status:** accepted, 2026-08-17 (operator ruling; entry backfilled 2026-08-18 — the RUNBOOK §"-next"
and docs/28 §5a amendments shipped referencing this id, and the log entry itself had not landed) ·
**Issue:** [#700](https://github.com/dcodish/geo_builder/issues/700)

**Decision.** The unified interface (Track B, `unify/ui`) is evaluated on the REAL host under the
REAL server without replacing what students use: each builder deploys a second copy under
`…-next/` paths (`geo-builder-next/`, `space-builder-next/`, `complex-builder-next/`) on
themathbible.com, built from **committed `unify/ui` state only** — the branch analogue of the
"deploys use only committed `main`" rule.

1. **The canonical deploys are byte-untouched** — proven per deploy by stat/hash comparison, not
   asserted. The `-next` copies live BESIDE them; a student URL never changes meaning.
2. **Same tag-and-log discipline as prod:** each push gets a `next/YYYY-MM-DD[-n]` tag and a
   DEPLOY-LOG entry — the log records `-next` deploys as first-class history, so "what is the
   operator actually playing on mobile" has one answer.
3. **Degraded api is EXPECTED and recorded:** until the operator adds the Plesk api mapping for the
   `-next` paths, the copies run without LLM fallback and without logging — the honest state is
   written into each DEPLOY-LOG entry rather than worked around.
4. **The channel is temporary by design:** switchover (the `-next` build becomes canonical) and
   teardown are one operator decision, recorded when taken; nothing auto-promotes.

## ADR-W-023 — The under-canvas row is a CONTRACT: shared ops only, one wording, product options live in the panel (#738, #739)

**Status:** accepted, 2026-08-18 · **Issues:** [#738](https://github.com/dcodish/geo_builder/issues/738),
[#739](https://github.com/dcodish/geo_builder/issues/739) · operator: "we need to standardize this
between all of the tools"

**Problem.** The row under the canvas was never specified, so each product grew its own: THREE
wordings for the same show-another-configuration action («הצג אפשרות נוספת», «אפשרות נוספת»,
«הציגו תצורה אחרת»), 2-D's analysis buttons and display checkboxes parked on it, 3-D's
distance-witness toggle parked on it, complex's clear-all on the fact-list footer instead. After
ADR-W-018 ("one learned interface") the drift is a defect class, not a style choice.

**Decision.**

1. **The row carries only what EVERY builder has:** «הציגו תצורה אחרת» + בטל / בצע שוב / נקה הכל
   (undo/redo pending in complex — a named feature gap on #739, the store has no temporal
   middleware; the row shows what exists honestly rather than stub buttons).
2. **One wording per action, every product, he+en** — and prose that NAMES a button uses the
   button's exact current label (catalogs and manual text included: they are user-facing).
3. **Product-specific DISPLAY options live in the נתונים panel,** beside the data they toggle:
   2-D's analysis buttons + checkboxes (#738), 3-D's witness toggle (#739 — reversing its B6
   placement, which predates this contract). Undecided residents (complex's layer chips and view
   toggle) stay put until the operator rules — the contract governs what is DECIDED.
4. **Held by a guard, not by review:** `shell/__tests__/row-parity.test.ts` scans the product
   sources — the one-wording rule (retired variants may not reappear in any user-facing tree) and
   the placement splits — in the import-direction/isolation pattern, so builder N+1 inherits the
   contract mechanically.

## ADR-W-024 — The canvas CHROME is contracted: one empty state, one corner cluster, one export home, disabled-not-hidden (#742)

**Status:** accepted, 2026-08-18 · **Issue:** [#742](https://github.com/dcodish/geo_builder/issues/742) ·
operator: "the canvas is not the same in all tools as well… the whole idea was to get a similar look
and feel"; rulings same day: "buttons should be disabled - not hidden", "for leg 2 - i go with the
recommendation", "3d and complex tools can have the same functionality [as the 2-D top toolbar]".

**Problem.** ADR-W-018/W-019 contracted everything AROUND the canvas; the canvas renderer stayed
per-product on purpose (three genuinely different drawing surfaces). The canvas-adjacent chrome fell
between the two scopes and was never specified: three empty-state wordings, a six-button 2-D canvas
toolbar beside a complex canvas with NO controls, image export in two different homes, and a row
that hid on empty in one builder and showed in two.

**Decision — four clauses, all guard-locked in `shell/__tests__/row-parity.test.ts`:**

1. **One empty state.** Title «מה בונים היום?» + one hint wording in every builder (chips CONTENT
   stays per-product — different subjects, different examples). An empty canvas is BLANK — the
   complex plane no longer draws its grid under the overlay; axes appear with the first point.
2. **One corner cluster.** Every canvas carries ↺ − + at the top inline-end corner — style objects
   and the zoom step (×1.25) exist once in `shell/frame/canvasControls.ts`; each renderer keeps its
   own zoom RANGE (the 3-D orthographic fit tolerates [0.3, 4]; the 2-D/complex planes take
   [0.2, 8]) and its own view state (docs/20 §6.4: never in the store, never in undo). The complex
   canvas GAINS zoom+reset; 3-D gains the − / + buttons its wheel already implied; the 2-D trio
   moved in from the toolbar row, which keeps only the product-specific סיבוב ויישור group.
3. **One export home.** Image exports are TOP-TOOL-ROW buttons in every builder, in the 2-D order —
   שמור / טען / העתיקו תמונה / הורידו תמונה / [הורידו שאלה] / מדריך. The 2-D renderer no longer
   knows exports exist (`svgToPng` moved to `src/export/`; App queries its own canvas — the 3-D
   pattern, now in all three). **הורידו שאלה stays 2-D-only for now:** the question-docx builder is
   a real feature to port (product isolation forbids sharing it as-is) — flagged on #742, not
   silently built. Also flagged: `rasterCanvas` is now the workspace's THIRD product-local svg→png
   copy — the ADR-W-016 shell threshold; a candidate for the next shell seeding pass.
4. **Disabled, never hidden.** The under-canvas row renders always; each button disables when
   meaningless (no facts, nothing to undo/redo, nothing to cycle). The 2-D row un-hides; 3-D and
   complex gain the missing disabled states; the empty complex view-toggle disables (a blank canvas
   has no view to toggle).

## ADR-W-025 — The `-next` channel is retired: the unified interface IS the baseline (#747)

**Status:** accepted, 2026-08-18 · **Issue:** [#747](https://github.com/dcodish/geo_builder/issues/747) ·
supersedes the temporary half of [ADR-W-020](#adr-w-020) · operator: *"i think its not longer needed
and we can just turn this code to the baseline"*

**Decision.** Track B is accepted. The unified build is deployed to the canonical
`/geo-builder/` and `/3d-builder/` paths as an ordinary Standard deploy of `main`, and the parallel
evaluation channel is torn down — the operator waived the grace period ADR-W-020 §4 allowed for,
having played the channel across two `next/*` deploys.

1. **`main` → canonical is once again the ONLY deploy path.** ADR-W-020's one deliberate exception —
   a channel deploying committed `unify/ui` state — ends here. `unify/ui` is fully merged into
   `main`, so the exception has nothing left to serve, and leaving it standing would be an invitation
   to ship un-merged branch state to a public URL.
2. **The channel's machinery goes with it, not just its directories.** `build:next:2d` /
   `build:next:3d` are deleted from `package.json`: a build script whose deploy target no longer
   exists is a trap that produces a plausible `dist-next/` for nowhere. The RUNBOOK section shrinks
   to a historical pointer so the DEPLOY-LOG's `next/*` entries stay readable — history is kept,
   procedure is not.
3. **What survives as the lesson**, not as a standing structure: the channel did its job (two
   deploys, a mobile fix found and fixed on it, canonical bytes stat-proven untouched throughout).
   The pattern is reusable — re-create it from this ADR when the next big surface needs prod-condition
   evaluation; do not keep an idle channel alive for a hypothetical one.
4. **The Apache api mappings for the `-next` paths are the operator's to remove** (Plesk directives
   field). They are inert once the directories are gone — a mapping to nothing — so the teardown is
   complete without them, but they are noise in a field where noise is expensive.


## ADR-W-026 — Displayed numbers have ONE rounder, and precision-per-surface is still open (#723)

**Operator ruling (2026-08-18, B5 play):** *"decimal points, only two numbers after the point. This is a
rule that should be for all of the tools we have."* The trigger was the complex canvas printing
«w ≈ ~9.3·cis~254.4101°».

**Decision.** `shell/format.ts` is the ONE place a computed number becomes the digits a student reads, and
every product's display formatter delegates to it: 2-D's `formatMeasure` and 3-D's `cleanNum` decimal
fallback both dropped their private rounders in favour of `fmtNum`. `DISPLAY_DECIMALS = 2` is the house
precision the ruling names. The complex builder's reading composition had already adopted it, which is
what the report was about.

**Nothing visible changed in 2-D or 3-D — and that is the point.** Both already *printed* two decimals;
what they no longer own is a private rounder, so the next precision decision is made once instead of three
times. Rounding scattered across call sites is how two surfaces start printing the same number differently
(the #653 class), and a chokepoint that agrees with the old behaviour today is the only kind worth
installing before it is needed.

**Deliberately NOT collapsed: the exact tiers.** An integer, `1/2`, `√2`, a π-form, `cis120°` are not
decimal expansions and never pass through the rounder. Each product keeps its own tiers above the fallback
— they encode what that product's students write on paper — and the rule reaches only the decimals below
them. `formatMeasure`'s non-finite dash likewise stays 2-D's.

**Two cells escalated rather than assumed** (round #752 → `needs-operator` on #723):

1. **The 3-D canvas asks for THREE decimals under [#491]**, whose recorded reasoning is that *precision is
   a property of the SURFACE* — a canvas has room a panel row does not, and #481's coarsening of `-0.586`
   to `-0.59` was collateral #491 deliberately reversed. Reading #723 as an absolute ceiling would overturn
   an earlier ruling on a surface the operator was not looking at when they gave it. So `maxDecimals`
   stays a parameter with a default rather than becoming a hard cap, and which ruling governs the canvas is
   the operator's to say.
2. **The complex `value/` layer keeps a private 3-decimal `fmtNum`** because it *cannot* import `shell/`:
   `value/` is the declared BOTTOM of its tree and `src-complex/__tests__/import-direction.test.ts`
   enforces it. The round reverted the one-line delegation rather than weaken the layering test. The
   duplicate has no consumers outside its own barrel, so deleting it is the recommended resolution — but
   that is a `src-complex` decision, not a workspace one.

**The guard is PER PRODUCT, by necessity and by design.** A single cross-product test would have to live in
`shell/` and import the products, and `shell → src` / `shell → src3d` are forbidden edges
(`BOUNDARIES.json`) — the isolation test caught exactly that during this work. Each product locks its own
routing (`src/__tests__/display-format.test.ts`, `src3d/__tests__/display-format.test.ts`) against values
where two plausible rounders disagree; `shell/__tests__/display-format.test.ts` locks the chokepoint itself.

## ADR-W-027 — The question document is ONE composer, parameterized by the caller's bidi (#745)

**Status:** accepted, 2026-08-18 · **Amended 2026-08-19** (scope: 3-D only, see *Scope amendment*)
· **Issue:** [#745](https://github.com/dcodish/geo_builder/issues/745) · operator: *"for the 3d and for
complex tool we need the option to download question in the same way we do for the 2d tool"*

**Problem.** «הורידו שאלה» — the figure printed beside the student's own givens as a real `.docx`
(FR-HS-11, [ADR-251](06-decisions.md#adr-251)) — existed only in 2-D. Not by decision: it was written
in `src/export/`, a product tree the siblings may not import ([ADR-266](06-decisions.md#adr-266),
`BOUNDARIES.json`), so a module that reasons about nothing but headings, list items and an image was
unreachable by the sibling builders purely because of where it sat. `buildQuestionDoc` already took only
`{ title, heading, lines, png, rtl }`; its single product coupling was an import of the 2-D bidi
segmenter. The same was true one layer down: the clean-export rasteriser was a private helper inside
`src/render/Figure.tsx`, which is why 3-D had grown a thinner inline copy and complex had none at all.

**Decision.**

1. **`shell/export/questionDoc.ts` and `shell/export/svgToPng.ts` are shared surfaces.** This is the
   [ADR-W-016](#adr-w-016) seed rule applied at the moment it bites: the surface is settled (five issues
   of hardening — #451 ink, #464/#465 bidi, ADR-252 scaffolding, ADR-428 canonical form) and is about to
   be implemented a second time. Copying it would put the OOXML layout, the A4 column split, the
   Word-bidi per-run rule and the PNG IHDR reader in two places, and the next fix in that class would
   have to be found and applied twice — the exact failure the shell layer exists to prevent. The
   rasteriser carries the sharper version of the argument: it had already been copied THREE times
   (`src/render/Figure.tsx`, an inline copy in `App3.tsx`, a third in complex that #742 itself flagged
   as *"a shell candidate"*), and all three are retired here.
   This overrides the "(COPIED, per ADR-W-003)" parenthetical in [#713](https://github.com/dcodish/geo_builder/issues/713)'s
   triage, which predates the request that made the surface a three-product one.

2. **The bidi segmenter is an INPUT, and a required one.** Word has no glyph for U+2066/U+2069 and
   prints visible boxes, so the document cannot use the browser's isolate strategy; OOXML's mechanism is
   per-RUN direction, which means the composer must know where a technical run begins. That knowledge is
   the *product's* — its run alphabet is derived from its own symbol palette (#482) — so it is handed in
   rather than imported. Required rather than optional on purpose: an optional segmenter lets builder
   N+1 omit it and silently ship the #464 scramble, and the defect class was authors not thinking about
   bidi. A contract that permits not thinking about it has not closed the class.

3. **Each product keeps its own bidi module and gains a `segments` view of it.** `shell/bidi`'s kit,
   `src/i18n/bidi` and `src3d/i18n/bidi` are now all segments-first, with `isolateLtrRuns` built on top —
   one definition of a run per product, so that product's screen and its paper cannot disagree. (The 2-D
   copy was already this shape; #464 discovered the need. The other two were rebuilt onto it here.)

4. **The «נתון:» list is VERBATIM in 3-D.** 2-D omits scaffolding
   ([ADR-252](06-decisions.md#adr-252)) via a per-command classification over the 2-D engine. Porting it
      would mean inventing a second classification, able to DROP a given the student stated —
   which is the honesty invariant this export exists to serve. A line too many is a cosmetic complaint;
   a line missing is the tool lying about the question. Operator ruling, 2026-08-18. Revisit only with a
   real figure that prints noise.

5. **The printed width is one constant, and it lives with the ink normalisation** (`svgToPng`), not with
   the composer: the document prints the PNG at that width and `scaleInk` pre-multiplies by
   `canvasWidth / it`, so they are one decision (#451) and two constants could drift. It also keeps
   `docx` out of the static import graph — every app imports the composer dynamically so the library
   stays out of its main chunk, and a static import of a constant declared beside it would defeat that.

**Scope amendment (operator ruling, 2026-08-19): the question document is 2-D and 3-D only.**
*"הורידו שאלה should be in 3d but not in complex"*, given during play-and-approve. The complex leg —
its givens module, handler, button and locale strings — is removed, not flagged off. Everything above
stands unchanged: the composer is shared because 2-D and 3-D both print through it, and the argument
was never a headcount. Complex keeps the shared **rasteriser**, which is the part it always needed:
the n/a is the DOCUMENT, not the export layer. Recorded in
[ADR-CX-028](06d-decisions-complex.md#adr-cx-028); the rationale is the operator's and is recorded as
given, not inferred.

**Held by.** `shell/__tests__/question-export.test.ts`, which locks the matrix in BOTH directions: the
composer is exercised with a STUB segmenter no product would produce (a hard-coded run rule sneaking
back in fails) and may not name a product identity; the two builders that print are source-scanned for
the dynamic import, a givens source, a handed-in segmenter and the strings; and **complex is scanned for
their absence** while still being required to rasterise through the shared path. That negative half is
the load-bearing one — a deliberate n/a and a forgotten cell look identical in a passing suite, and
without it the next "complete the matrix" pass silently reverses an operator ruling.

**What this does not decide.** Complex's remaining export questions stay on
[#713](https://github.com/dcodish/geo_builder/issues/713). Image download and copy-image already
shipped there with #742 and are untouched here beyond the rasteriser swap.

## ADR-W-028 — The fix-round cap is 5–8 items with stop conditions; 3–5 was a Phase-1 number that has now been measured (#767)

**Status:** accepted, 2026-08-19 · **§1 and §3's first bullet superseded by [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028) (2026-09-20): the cap is 20 and the escalation stop is a RATE. §2 (fewer is always fine), §3's chokepoint bullet and §4 (the play sheet splits by route) stand.** · **Amends:** [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544)
· **Issue:** [#767](https://github.com/dcodish/geo_builder/issues/767) · operator: *"currently the
fix-round agent is limited to 3-5 items. I think we can relax this a bit - no?"*

**Problem.** [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544)
set the round at 3–5 work items before a single round had run, and said so: the landing-policy question
was *"undecided until Phase 1's measured escalation rate provides the data."* Six rounds later that data
exists, and the `stats:` lines were designed to be read exactly this way (aggregated by listing round
issues, never by re-reading prose). Across #561, #576, #582, #589, #596 and #752:

```
picked=25  landed=14  prs=10  escalated=2  skipped=1
```

An **8% escalation rate**, zero crashed rounds, all six ledgers reaching `awaiting-play` and closed by the
operator as validated. The never-patch guard (ADR-W-012's Step 4) fired twice and held both times. No round
was stopped by anything except the cap. Meanwhile the queue reached **30 open issues, all 30 `auto-ok`** —
roughly eight rounds of work — which inverts the cap's original purpose: it was introduced to relieve the
one-at-a-time dispatch bottleneck, and had become the bottleneck itself.

**Decision.**

1. **The working band is 5–8 work items; the hard ceiling is 10.** *(Superseded — the cap is **20**, one
   number, since [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028); the rest of this clause stands.)* A bundle of issues sharing one root
   cause still counts as ONE item, and the cap still never forbids a correct bundle (the ADR-W-012
   operator ruling stands unchanged).

2. **Fewer is always fine — the band is not a quota.** "3–5" read as a floor of 3; a round with two
   eligible items must still run rather than wait to fill up. Composing small is never a defect.

3. **Two stop conditions bound a round by evidence, not by the number alone.** The count was one knob over
   three different constraints — machine cost (~6 min `test:full` + a worktree `npm install` ≈ 8–10 min
   fixed overhead per item, linear, walling around 10), the operator's play sitting, and reconciliation
   risk between items. The ceiling covers the first; these cover the third and the real reason a big round
   goes wrong:
   - **Second escalation in one round → finalize.** *(Superseded — the stop is a RATE since
     [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028): escalations reaching a quarter of the items attempted, minimum 2. At the
     5–8 band that IS the second escalation; the reasoning below is unchanged and is why it had to scale.)*
     Land what is done, close the ledger honestly, report.
     Two plans failing contact with the code in one round says the queue's plans are going stale, and that
     is a *triage* signal — grinding through the remaining items is exactly the loop pressure the
     escalation exit exists to relieve. This is a stop, not a failure: the stats line records it.
   - **More than ~2 items on one chokepoint → defer the rest.** Items sharing a chokepoint rebase over
     each other and each one's full-suite run can break the previous one's scenario. Spread them across
     rounds rather than reconciling repeatedly inside one.

4. **The play sheet splits by route.** `batch (landed on main)` and `individual (PRs)` are separate
   sections. The operator's sitting was the constraint most often confused with round size, and it was
   never really a single number: feature PRs are played one at a time under their own play-and-approve
   gate (docs/22 §4) regardless of how many shipped in a round, while only the landed-on-`main` items are
   genuinely a batch. Splitting the sheet means a larger round grows the part that batches well and leaves
   the part that does not exactly as it was.

**What this does not change.** Eligibility (`auto-ok` + a concrete plan, ADR-W-014 and its Am. 1), the
worktree-per-item isolation, the full per-item gates, the escalation exit itself, the landing routes, the
live ledger opened at composition ([ADR-W-013](#adr-w-013--the-round-issue-is-a-live-ledger-opened-at-composition-not-an-end-of-round-report-547)),
and the P1 / stale-`in-round` preconditions. Only the composition size and its stop conditions move.

**What this does not decide.** ADR-W-012's Phase 2 — *scheduled, unattended* rounds and their landing
policy (bugs direct-to-`main` vs one-PR-per-round) — remains open. This ADR consumes the Phase-1
escalation-rate data for the cap question only; unattended running is a separate risk argument, since every
round measured here had a human at the keyboard.

---

## ADR-W-029 — A stored utterance holds what the STUDENT stated: display transforms stop at the store (#751)

**Context.** Playing #746 the operator's exported `.docx` printed the first given as
«קובייה ⟦PDI⟧ABCD⟦LRI⟧» — two missing-glyph boxes — while lines 2–3 of the same document were clean.
Line 1 had been entered by clicking an **example chip**; lines 2–3 were typed by hand.

Every product registers an i18next post-processor that wraps LTR technical runs in Unicode isolates
(U+2066 LRI / U+2069 PDI) so Hebrew UI strings lay out correctly on screen. That is correct for
**display**. The empty-canvas chips then built their command list out of those post-processed strings
and submitted the chip's own label as the utterance — `shell/frame/QuickChips` passed ONE string to
both the button label and `onPick`, so **the thing rendered was the thing stored**.

The pollution was already in production in 2-D and 3-D and predates the PR that revealed it. The
exporter and `bidiSegments` were behaving correctly; they were handed dirty data. Blast radius, all of
it invisible on screen: saved `.geo.json`/`.geo3.json` files, the production usage logs that
`/log-triage` re-runs and clusters (two identical-looking utterances differing by invisible characters
cluster separately), and every exact-match comparison over utterances — dedup, idempotence, fixtures,
drift nets.

**Decision.**

1. **The invariant: an utterance entering the fact list holds what the student stated, never
   presentation characters.** Enforced at the boundary of the module that OWNS the list — each
   product's store — over every path that sets a fact's text and over the load path:
   - 2-D `src/store/geoStore.ts` (`foldFact`, `update`, `replaceGroup`) + `figureFile.ts`
     (`deserializeFigure`);
   - 3-D `src3d/store/store3.ts` (`submit`, `submitSteps`, `replaceFact`) + `figureFile3.ts`
     (`deserializeFigure3`);
   - complex `src-complex/store/useComplexStore.ts` (`recordLine`, `recordDisabledLine`,
     `replaceLine`), which `hydrateSession` already routes through.

   **Cleaning on LOAD is not optional and is not belt-and-braces:** it is what protects the saves
   already in the wild. Fixing only the seam stops new dirt being made and leaves every file a student
   has already saved carrying it.

2. **The seam: `QuickChips` takes a RAW command and an optional `display` transform.** `commands` are
   what a student would have typed and are exactly what `onPick` receives; `display` is presentation
   only. The callers ask i18next for the pre-post-processor value (`t(key, { postProcess: [] })`) and
   hand the product's own bidi kit in as `display`, so the rendering is unchanged. The fix is in the
   shared component deliberately: a one-line fix at each of the two call sites would have left the
   component still able to conflate the two, and that conflation IS the defect.

3. **One definition of the control set.** `shell/bidi.ts` exports `stripFormatControls` — U+061C,
   U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF, written by code point. The set previously had
   three copies; both parsers now read it from here, as do all three stores.

**Amends [ADR-3D-144](06b-decisions-3d.md) (#531).** That decision stripped the same controls at the
PARSER boundary and recorded, as part of its reasoning, that *"the stored fact stays RAW and re-parses
through this same seam"* — i.e. that cleaning in the UI was unnecessary. The first half stands and is
untouched: a display transform must never reach the grammar, and the parser keeps its own strip because
a paste from a PDF or another RTL editor carries the same controls and never passes through a store
action. The second half does not survive contact with the other consumers: the parser's copy protects
the *grammar*, and the fact list is separately saved, logged, exported and compared. Two boundaries,
two different things being protected, one shared definition of the set.

**Why not in the exporter.** Stripping isolates on the way out would treat the messenger: the same
characters would still sit in the fact list, and the next consumer would meet them again. The `.docx`
lock is nevertheless kept (`src/export/__tests__/questionDoc.test.ts`) — it is the assertion that would
have caught this, and it fails if a future seam re-introduces a display transform upstream.

**The sweep (plan part 3), and its result.** Every other affordance where a value reaches a submit path
rather than a DOM node was audited: the manual "click to try" in all three products already separates
display from command (2-D and 3-D submit `raw` from `COMMAND_CATALOG`/`COMMAND_CATALOG_3D` while
rendering an isolated copy; complex does the same with `complexBidi.inputPreview(raw) ?? raw`). The
chips were the only conflation. *An enumeration is not a rule* — which is why the invariant is enforced
at the store rather than at the list of places that happened to be dirty.

**Coverage.** `shell/__tests__/bidi.test.ts` (the set, the isolate→strip identity, idempotence);
`shell/__tests__/quick-chips.test.tsx` (label ≠ command, at the component); per-product ingest locks
(`src/store/__tests__/ingest-invariant.test.ts`, `src3d/store/__tests__/ingest-invariant3.test.ts`,
`src-complex/store/__tests__/ingest-invariant.test.ts`) each covering the chip source, the store's
write paths and a pre-fix saved file loading clean; and the end-to-end `.docx` lock.

## ADR-W-030 — Non-canonical input is TAUGHT, never silently accepted, and the teaching names the exact sentence (#778)

**Context.** Triaging the prod window 2026-08-17…08-24, two unrelated 3-D users ran near-identical
pyramid lessons and both talked to the tool in commands — «הוסף אלכסוני בסיס», «הדגש משולש SEC» — while
2-D showed «סמן BK גובה המקבילית מקודקוד B». The operator's ruling: *"when a user enters a command like
add a line, draw a shape, we need to tell him to add the input as a textbook would — so we need to guide
them so they learn. I don't want the tool to support the wrong text input because it teaches them
wrong,"* extended in the same session to **all tools**, not the one the report happened to surface.

Measuring what the products actually do found three different answers to the same two questions:

| | An imperative wrapper | A label in the other case | Guidance register | Canonical renderer |
| --- | --- | --- | --- | --- |
| 2-D | **builds silently** — all of הוסף/שרטט/בנה/העבר/סמן/הדגש/צייר | **silently upper-cases** (`משולש abc` → `triangle A,B,C`) | ✓ ADR-289 `ui-command` | ✓ `canonicalText` / `teachCanonical` |
| 3-D | builds some incidentally (`שרטט גובה הפירמידה` → `perp-to-base`) | ✓ refuses with a nudge that works | ✓ ADR-3D-040 `classifyGuidance3` | ✗ none |
| complex | refuses, with **no teaching** | accepts `z1` and `Z1` alike, silently | ✗ **none** | ✗ none |

2-D's acceptance was deliberate — `src/parser/scope.ts` states it: *"an imperative that names a real
CONSTRUCT parses via its own rule and never reaches this classifier."* This ADR **reverses that note**.

The silent case-rewrite is not merely a teaching problem: it punches a hole through the honesty gates.
The build path upper-cases while the dropped-given gates match `[A-Z]`, so the same defective lowering
escalates honestly in uppercase and commits GREEN in lowercase (#779) — the case the student typed
decides whether a stated given may vanish.

**Decision.** Three invariants, for every product now and every product added later.

1. **No silent acceptance of a register the product does not teach.** A command-to-the-tool phrasing,
   or a label convention the product does not use, must not build. This is deliberately stated as *the
   product's own convention*, not a uniform one: complex's convention **is** lowercase (`z1`, `w`), and a
   rule saying "uppercase" would be wrong there. The invariant is that input is never silently rewritten
   into a different register — what varies per product is which register is canonical.

2. **The teaching names the exact sentence, and derives it from the commands.** Never a hand-written
   nudge table: a table can name a phrasing the parser rejects, and drifts the moment a rule moves —
   which is exactly how a guidance register rots. Deriving the text from the lowering buys a property a
   table cannot: **the tool can never teach a form it would not accept.** Where the product can derive
   it, the canonical sentence is **pre-filled into the input** and the student presses Enter.

   Pre-fill rather than auto-build, because auto-building has no honest answer to *what gets stored*:
   storing the student's imperative makes the fact list, the saved file and the `.docx` export teach the
   wrong form back at them, and storing a rewrite stores a sentence they never typed — the second
   directly violating [ADR-W-029](#adr-w-029). Pre-fill dissolves the dilemma: the student submits the
   canonical sentence, so what is stored is what they stated, truthfully and in the right form. It also
   costs one keypress rather than a retype, and reading-then-confirming is a stronger learning beat than
   a banner.

3. **Pre-fill means certainty; suggest means guess — and they must never look alike.** Only the
   deterministic path pre-fills: strip the wrapper, parse the remainder, render it. When the remainder
   does not parse we do not know what the student meant, and fabricating a canonical sentence there
   would assert a given they never stated — [ADR-052](06-decisions.md#adr-052), one Enter away from the
   figure. In that branch the LLM may **suggest** a phrasing, at visibly lower weight and click-to-insert,
   never pre-filled and never committed.

**Why not let the LLM decide the policy.** The alternative considered was routing imperative-looking
input to the LLM and letting it rule on whether the phrasing should be supported. Rejected on three
counts. Detection is a closed verb lexicon — deterministic, free, and exact — so the model adds nothing
to it. A paid, nondeterministic model as the arbiter of a pedagogical policy gives the same utterance
different verdicts across runs, which is both untestable (the scenario corpus cannot lock a behaviour
re-decided per call) and pedagogically self-defeating: a student learning from inconsistent feedback
learns nothing. And an LLM asked to help tends to *build* the thing, which is what the ruling forbids —
so a deterministic gate is needed regardless, leaving the code layer plus a paid call.

The measurement settled the cost question that prompted the alternative: imperative-prefixed input was
**3/162 submits in 2-D (1.9%)** and **7/54 in 3-D (13%)**, and nine of those ten already reached the LLM
or the scope register. Of the ten, only two have a stripped remainder that parses. Routing to the LLM
would add nearly nothing — and gain nearly nothing, because for eight of ten the model's answer is the
`not-understood` they already received. Cost was never the deciding argument; **who owns the policy** was.

**Consequences — the enabling debt is real.** The renderer this depends on exists in **one** product
(`src/parser/canonical.ts`, consumed by `submitPipeline` and the `.docx` export), and complex has no
guidance register at all. So invariant 2 costs a canonical renderer in 3-D and complex before it can be
honoured there; until it is, those products can satisfy invariants 1 and 3 with a refusal that teaches
the register in general terms, and must not fake a specific sentence they cannot derive. Adopting per
product is the slice discipline, one PR each — the invariants are workspace-wide from today, the
machinery arrives per product.

**Coverage.** Per product: an imperative wrapper over a supported construct returns the teaching, never
commands; the pre-filled sentence re-parses to the same lowering as the stripped remainder (the property
that makes "we never teach a form we reject" mechanical rather than reviewed); a suggestion from the LLM
branch is never auto-submitted. Workspace-wide: the case-parity assertion from #779 — for every catalog
line, the other-case variant produces the *same* honesty verdict as the original — which is what stops
invariant 1 from being re-opened by a normalisation added later.

Related: #778 (the umbrella), #779 (the P1 the case half exposes), #777 (the same "teach what is missing
rather than guess" spine on an incomplete comparative), [ADR-289](06-decisions.md#adr-289) and
ADR-3D-040 (the guidance registers), [ADR-W-029](#adr-w-029), [ADR-052](06-decisions.md#adr-052).

## ADR-W-031 — A restated fact SUCCEEDS, appends no row, and says so — in every product (#613)

**Operator ruling (2026-08-16):** *"if a fact is already known - it should not be added. this is true to
all tools."*

**Context.** In 3-D, restating a fact that is already true added a **second identical row**:

| sequence | rows |
| --- | --- |
| «פירמידה SABC» + «משולש ABC» + «משולש ABC» | **3** |
| «פירמידה SABC» + «זווית ABC = 90» ×2 | **3** |

M1 idempotency is implemented at **apply** — a statement about existing objects correctly returns the
construction unchanged — but the **store** appended any utterance that applied `ok`, and an idempotent
no-op applies `ok`. So the engine was right and the fact list still grew.

Nothing is geometrically wrong: the figure is identical and deleting either row leaves the other. It
matters because **the fact list is the tool's record of the student's own reasoning**, and it is what
`.geo3.json` saves and replays. A student who restates a given three times while exploring gets a list
that reads as three givens, and every replay re-pays their solve cost.

**Decision — option (b), as ruled: the submit SUCCEEDS, no row is appended, and a notice says the
statement was already stated.** Option (a) (refuse, naming the row it repeats) is rejected: a refusal
for something that is not an error reads harshly, and restating a given while exploring is not a
mistake. Option (c) (today's behaviour, on the reasoning that the list mirrors what was typed) is
rejected by the ruling.

**Two facts are the same STATEMENT when their lowered commands are structurally equal.** Compared on
the commands and never on the utterance — «משולש ABC» and «triangle ABC» are one statement in two
languages — and the round-trip serializer already relies on exactly this equality. It is a **store-level
rule about restating a fact, NOT a per-command check**: putting it in a command is the enumeration habit
this workspace keeps paying for.

**What each product had to do, measured before building (the ruling required it).**

- **2-D — already conformant, and nothing was changed.** `foldFact` has deduped a restated command since
  FR-EN-9 (`commitCommands` does not even `set` when the fold returns the same array), and the submit
  path already answers «זה כבר קיים באיור — אין מה להוסיף». That is option (b) exactly. What it lacked
  was a TEST tying it to this rule, which it now has: an invariant with a conformant product and no
  test is one refactor away from a non-conformant product with no test.
- **3-D — the port.** The store now finds a structurally-equal twin before appending, succeeds without
  a row, and publishes `lastNotice: { code: 'already-stated', utterance }` — a NOTICE channel distinct
  from `lastError`, because this is a success. A **disabled** twin is re-enabled rather than duplicated,
  mirroring 2-D's FR-EN-9. The notice names the row it repeats and is cleared by the next statement.
- **complex — nothing yet, deliberately.** Its line list is not the same structure (lines, not lowered
  facts), and #613's comparison is defined on commands. Recorded here as the open cell rather than
  invented: it joins the conformance matrix (unify A5, #664) as a known n/a-or-todo, not as a silent gap.

**Why the notice is not an error.** The three surfaces now agree: the figure is unchanged, the list is
unchanged, and the student is told why — instead of a repeat producing either a silent no-op (which
reads as "the tool ignored me") or a red refusal (which reads as "you were wrong").

Locks: `src3d/__tests__/restate-dedupe-613.test.ts` (8 tests — the three reported sequences, the notice
and what it names, the notice being cleared by the next statement, the disabled-twin re-enable, a
DIFFERENT statement still appending, and the cross-language identity) and the 2-D conformance block in
`src/app/__tests__/submitPipeline.test.ts`.

## ADR-W-032 — The palette is how the app TYPES MATH: one SymbolRow, every text surface (#525)

**Status:** Accepted (2026-08-26) · **Products:** 2d + 3d + complex + shell

#525's diagnosis, now executed: the palette was bound to one `<input>`'s JSX rather than to "how
this app types math", so every later text surface — both query boxes, the fact-list editor, the
complex ask box — was born without it, and `∠ ° √ α d_{…}` were untypeable exactly where a student
checks their own answer.

**Decision.** The insert MECHANISM — chips, wrap-selection insert (`shell/symbols.applySymbol`),
keep-focus/caret-restore, and a mousedown guard so a palette click never blurs its target (a blur
COMMITS the fact-list edit, so without the guard the insert would land after the editor closed) —
is one shared control, `shell/frame/SymbolRow`. The VOCABULARY stays each product's own
(`SYMBOL_SPECS` / `SYMBOL_SPECS_3` / complex `SYMBOLS`), with its own parse/bidi drift locks, per
the operator's original #525 ruling ("only relevant symbols appear per tool").

Mounted: the shell InputArea (refactored onto it — the mains keep their exact look), the 2-D and
3-D query boxes, the complex ask box, and the shared FactList editor (one mount, three products —
the worst case the issue named: *"a step created with α cannot be corrected without re-typing a
character the UI itself refuses to offer"*). Secondary surfaces mount COLLAPSED behind a small
toggle (the issue's constraint), full vocabulary (its recommendation — trim only if it proves
noisy). The complex palette gains the operator's distance chip `d_{}` (#791's grammar), and `_`
joins complex's bidi expression core so `d_{AB}` isolates as one LTR run.

Locks: `shell/__tests__/symbol-row.test.tsx` (mount contract), each product's existing palette
drift locks (complex gains the `symDist` template), and the three product lanes green.

## ADR-W-033 — The suite writes a VERDICT; "green" is read, never inferred from an exit code (#750)

**Status:** Accepted (2026-08-26) · **Products:** workspace (all lanes)

`npm run test:full` is the bar before every commit and every deploy, and until now "was it green?"
could only be answered by a human reading two summary lines. The obvious mechanical answer — the
exit status — is honest at the source and destroyed at the call site: a POSIX pipeline reports its
LAST command's status, so the ubiquitous `npm run test:full 2>&1 | tail -40` reads `tail`'s `0`
whatever the suite did. That exact line gated the `prod/2026-08-25-2` deploy (the suite genuinely
was green, and nothing in the mechanism would have said so had it not been). Its sibling — a gate
chain composed with `;` instead of `&&` — had already burned a session and is recorded in the
`gate-lines-are-read-not-matched` memory. Two failures of discipline at one seam is a design signal,
not a reminder to try harder.

Note what is **not** the defect: round #768 escalated this issue rather than patching, having measured
that `scripts/test-tiers.mjs` already calls `process.exit(status)` on every path of every mode
(`EXIT_CODE=1` end-to-end on a deliberately red suite). The script was correct. Its verdict was
thrown away by the invocation.

**Decision.** Every run that executes tests writes `reports/suite-verdict.json`:

```json
{ "green": false, "mode": "full", "at": "…",
  "files": { "passed": 502, "failed": 1, "skipped": 2 },
  "tests": { "passed": 9139, "failed": 1, "skipped": 4 },
  "failingFiles": ["src/render/__tests__/shadow-matrix3.test.ts"],
  "sha": "13edd1d", "dirty": false }
```

Claiming green becomes: read the file, `green === true`, `mode === 'full'`, `sha === HEAD`, `!dirty`.
No exit code sits in that path, so no pipeline can corrupt it.

Five properties carry the weight:

- **The sha and `dirty` stamp are the point, not decoration** — they answer "green for *this* tree
  state?", which is the question, and they are sampled BEFORE vitest starts (a full run may rewrite
  the tracked `reports/test-tiers.json`, so sampling after would report the run's own bookkeeping as
  a modified tree). A verdict from an earlier tree cannot masquerade as current.
- **Every mode stamps its own `mode`.** `test:fast` is explicitly never a gate, so its verdict must
  never be mistakable for a full one — including on `fast`'s no-membership fallback, where it really
  does run every file and still stamps `"fast"`. Under-claiming is the safe direction.
- **The counts are per FILE, read from `testResults`** — not from the reporter's `num*TestSuites`,
  which counts `describe` BLOCKS and reads 2085 on a suite of 520 files. A verdict whose numbers
  disagree with the `Test Files` line a human reads is a verdict nobody will trust.
- **A crashed run reads `green: false`**, with the detail fields explicitly `null` and a note, rather
  than leaving an absent file a consumer could read as "no news".
- **It is written first**, before the tier/catch bookkeeping, so a fault there cannot cost the record;
  and it is best-effort, because this artifact must never itself fail a suite run.
- **It is gitignored.** Per-machine, per-run local evidence. Committing it would churn every run and
  let the other PC's verdict be read as this one's — the precise staleness the sha stamp exists to
  catch. (Contrast `reports/test-tiers.json`, which IS shared state and stays committed.)

`node scripts/test-tiers.mjs report` prints the newest verdict and judges it against the current tree
("Valid green gate for this tree" / why not). It deliberately writes nothing: `report` runs no tests,
so a `mode: "report"` record would be a verdict about nothing and would destroy the real one.

**Deliberately not taken:** the enforcement hook (blocking a commit when no fresh matching green
verdict exists). Build the artifact first; enforcement can follow on evidence, and a hook that can
wedge a session needs its own fail-open design like `scripts/ensure-test-server.mjs`.

Locks: `server/__tests__/test-tiers.test.ts` asserts the RECORD — red → `green:false` naming the
failing file, green → `green:true`, dirty tree → `dirty:true`, crash → `green:false` with details
`null`, mode stamped, and the JSON landing parseable on disk. Deliberately not the printed summary
(always correct — which is what made the hole invisible) and not the exit code (which nobody kept).

## ADR-W-034 — A fix round gates the BATCH, and lands it in ONE push (operator ruling 2026-08-30)

**Context.** Round #822 (8 items, all landed, 0 escalations) took ~5 hours wall-clock. Measured: 11
full-suite runs (8 items + 3 re-runs), each 17–25 min instead of the nominal ~6 because runs were
overlapped and the slow-tier files crawled under load; and the landing was SERIAL — the per-item gate
was "full suite on the rebased tip", so item N could not start its gate until N−1 had landed.

**Ruling (operator, "yes to 1+3").**

1. **One full suite per batch, not per item.** Per item, the gate is: `tsc -b`, the product build, the
   product lane (`npm run test:run:3d` / `test:run:2d`) and the item's own locks — all green. The full
   suite (`npm run test:full`) runs **once, on the merged batch tip, before the push** — and again only
   when it comes back red (fix, re-run). The bar on what actually lands is unchanged: nothing reaches
   `main` without a green full suite on exactly that state.
2. **Land in one push at the end.** Item branches merge, in composition order, into a staging tip
   (`round/<date>` on the shared tree or a worktree); conflicts are reconciled there; the batch's full
   suite runs on that tip; then `main` fast-forwards to it and pushes once. The ledger still records
   per-item commits (`Fixes #NN` + `round #RR`) and gate lines; the SHA column is filled at the push.
3. **Never overlap suite runs** — a lane, a probe or a full suite runs alone. (Not a ruling; a rule the
   round applies to itself, recorded here because it doubled every gate in #822.)

**What stays.** Escalation, the round cap and the escalation stop (ADR-W-028 — now 20 items and a
quarter-of-attempted rate, [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028)), fixtures-first,
ADR + locks per item, the ledger-as-record, and the operator's play-and-close validation. A PR item
(feature route) is unaffected — its gate is its own.

**Why the bar is the same.** The full suite's job is to catch what the fast tier and the lane miss
across products (ADR-394). Running it on the merged tip tests the exact bytes that land; running it
per rebased item tested seven intermediate states that never shipped. What is lost is attribution —
a batch-level red does not say which item caused it — and that is paid once, by bisecting inside
the round, instead of eight times up front.

Applies from the round after #822. `.claude/skills/fix-round/SKILL.md` Steps 2–3 carry the mechanics.


## ADR-W-035 — A UI-touching change SELF-SCREENSHOTS, and the session reads the images before the operator does (#704)

**Status:** accepted, 2026-08-31. **Scope:** all products. **Stage:** the readiness gate (standing
rule 5), not CI.

**The problem, stated by the operator** (2026-08-17, playing #699): *"why can't you use playwright to
see this for yourself? why do I need to manually test?"* — and then demonstrated twice on 2026-08-31,
in one day: a bidi row-direction fix that **did not work**, and the #841 placeholder collision where
minting a point broke every later definition of it. Both shipped. Both were caught by the operator's
eyes, not by the session's gates. Both had the same shape: **the session verified the mechanism it
changed and never looked at the surface a student sees.** Tests were green in both cases, honestly.

The absence of this gate also has a measured downstream cost: on 2026-08-31 it led the operator to
waive play-and-approve entirely («lets deploy all for now»), so two UI PRs shipped visually unseen by
either party.

**Decision.** For a change touching a UI surface, the readiness gate grows a self-screenshot step.
`scripts/visual-smoke.mjs` drives the real app in a real browser (Playwright + Chromium, a
devDependency), runs a scripted utterance sequence per product, captures the states the play sheet
will ask the operator to check, and **reads the captures back**. The session then looks at the images
itself and fixes or files what it sees, before reporting anything ready.

**What it fails on** — the mechanical breakage, so the operator's play is spent on judgement:

| lock | why it is a failure and not a warning |
| --- | --- |
| a **blank** capture (≥99.5% one quantized colour) or one under 3 KB | a screenshot of a page that did not paint is indistinguishable from a screenshot of a white app; without this the gate launders "I looked at it" |
| a **refused** line (`role=alert` appearing during the sequence) | the #841 class exactly — mechanism green, student surface amber |
| an **uncaught page error** | the captures are no longer trustworthy evidence, whatever they show |
| a step that leaves the figure with **no geometry** | the DOM-level answer to "did anything draw?" |
| the **input placeholder** not matching | the product's copy moved, or the app failed to render |

**Sequences are the products' own example lines**, not invented input — 2-D runs CLAUDE.md's defining
interaction (`ריבוע ABCD` → `נקודה G על AD` → `זווית GBA = 37`, a free shape, a 1-DOF point-on-object
and a constraint that slides it); 3-D runs `he.json` `examples.ex1/ex3/ex5`; complex runs the #701
enumerated-roots repro, the worst labelling load in any product. A sequence that stops building is
therefore a real signal about shipped copy, never about this script drifting from the app.

**Not CI** (ADR-W-005): a browser download is heavy and CI here is best-effort. This is a **local
gate, like `check:siblings`** — seconds, runnable before every UI-touching report. Screenshots are
per-machine artifacts and stay gitignored under the existing `reports/*` rule (ADR-W-008); the
`manifest.json` is the part worth quoting in a PR body.

**The judgement is a pure function** (`judgeCapture`), split from the browser that produces the
measurements, and locked by `scripts/__tests__/visual-smoke.test.ts`. That split is the point: a gate
that cannot fail is worse than no gate, so what it means to fail is unit-tested — including that an
*unmeasurable* capture fails rather than silently passing on `undefined` comparisons.

**What this does NOT change.** The operator's play remains the acceptance judgment — does the design
feel right, is this the figure the exercise asks for. This gate only stops him being the first to
discover clipping, collisions, a missing control, a blank canvas or broken RTL. Passing it proves the
captures are real, **not** that they are right; the script says so on success, because a green gate
that reads as "verified" would recreate the exact overconfidence it exists to fix.

**Honesty rule this carries.** A session may claim it "tested in the app" only for what it actually
drove and looked at. Everything else is headless verification and must be described as such — the
distinction the play sheet now draws for the operator (`.claude/memory/no-browser-self-test.md`).

Workflow text: docs/22 §4 steps 4–5. Command: `npm run smoke:visual [-- --app 2d|3d|complex] [-- --base URL]`.

## ADR-W-036 — The sibling guard's VIEWPOINT is a parameter, and an unreachable base stops the run (#846)

**Context.** `scripts/check-sibling-safety.mjs` is the mechanical form of the operator's standing
requirement (2026-08-16): *"as we continue evolving this complex tool we gain capability, but we never,
never, never harm the other tools that are running."* Round #843 found it crashing before any test ran:

```
fatal: ambiguous argument 'HEAD~1...HEAD': unknown revision or path not in the working tree.
```

Two defects, and the second hid the first.

**1 — The fallback answered a different question, then died.** `changedFiles()` verified the requested
base and, failing that, silently retargeted to `HEAD~1`. On a depth-1 CI clone the PR base is not
fetched *and neither is `HEAD~1`*, so the fallback that existed to make a fresh clone work was itself
what killed the lane. The silent retarget was the worse half: a sibling check that compares the wrong
range reports PASS over a diff nobody asked about.

**2 — The guard had one hard-coded viewpoint, so only one lane could run it.** `SIBLING_PREFIXES`
listed `src/` and `src3d/`; `COMPLEX_PREFIXES` listed `src-complex/`. That is the complex product's
point of view baked into the file. Pointed at a 2-D branch the guard would have refused every
legitimate `src/` edit as a sibling violation — so it ran only in `test-complex`, and a 2-D-only or
3-D-only PR got **no sibling verification at all**. The guarantee (ADR-W-017) was enforced on one
product out of three.

**Decision.**

- **A product REGISTRY** (`PRODUCTS`) holds each product's own prefixes and its build script; the
  viewpoint is a `--product` argument (`2d` | `3d` | `complex`, default `complex`). `own` is the tree
  the change may touch, `sibling` is any other product's tree, and the builds that run are the
  siblings' — building the tree you just changed proves nothing about a sibling. Adding product N+1 is
  one row (docs/22 §9), not a fourth hand-maintained list.
- **Longest-prefix ownership** (`productOf`) replaces the ordered `if`s. The old code carried the
  comment *"Order matters: `src-complex/` would otherwise match the `src/` sibling prefix"* — a
  correctness property held by list order is exactly the mirror-drift shape this workspace keeps
  retiring (ADR-W-004 family). Longest-match cannot be broken by reordering.
- **An unreachable base stops the run.** Try the base, then try to fetch it (`git fetch --depth=1
  origin <sha>` — GitHub serves an explicit sha), and otherwise **refuse**: a readable message naming
  the likely cause (a shallow checkout) and the fix, plus exit 1. Never a silent retarget. The CLI
  entry point catches it and prints the message rather than a stack trace — "loudly" means legible in
  the last lines of a CI log, not a Node traceback.
- **Every lane runs the guard** — `test-2d --product 2d`, `test-3d --product 3d`, `test-complex
  --product complex`, each with `fetch-depth: 0`. This is the operator's ruling of 2026-09-01, asked as
  step 3 of the issue: *"yes — test-2d and test-3d should run the sibling check too."*

**Why not just `fetch-depth: 0` on the complex lane.** Round #843 already applied that one-line unblock
so PR #844 could go green, and filed the rest. It stops the crash and leaves both real defects: a
fallback that lies when it does not crash, and a guarantee enforced for one product in three.

**Evidence.** The same 9-file diff, classified from two viewpoints: `--product complex` REFUSES it (4
files under `src/` are a sibling tree) while `--product 2d` PASSES it (those 4 are `own`, 0 sibling) and
builds 3-D and complex instead. An unreachable base exits 1 with the readable refusal and no stack.

**Locks.** `server/__tests__/sibling-safety.test.ts` (14 tests, in `server/` so it runs in EVERY lane —
the script belongs to no product): the same file is `own` to its product and `sibling` to the other two;
a 2-D slice sees both others as siblings; every registered product is a usable viewpoint owning its
whole tree; `productOf` resolves by longest prefix, not list order; an unknown viewpoint THROWS rather
than silently classifying everything as sibling; and the partition is total under every viewpoint.

### ADR-W-037 — the tier artifact carries shared state and nothing else (#812)

**What happened.** Every parallel PR in a fix round conflicted against `main` on exactly one file —
`reports/test-tiers.json` — and on nothing else. Round #800 predicted it, pre-emptively STACKED four PRs
to route around it, and that stack's own failure mode (a `--delete-branch` on the stack base auto-closing
the next PR) cost a recovery session.

**Root cause.** [ADR-W-035](#adr-w-035) made the tier RULE machine-independent — membership is the
heaviest files holding a share of suite time, a ratio, invariant under a uniform speed difference. The
**artifact** was not. It still recorded two kinds of content with different lifetimes:

| field | what it is | who reads it |
| --- | --- | --- |
| `slow[].file` | tier MEMBERSHIP — shared state, identical on every machine | `test:fast` builds its `--exclude` list from it |
| `slow[].ms`, `measuredCutoffMs` | the writing machine's wall clock | **nobody** — `classifySlow` measures the CURRENT run |

The write guard was already correct (*"rewrite only when the SET of slow files actually changed"*), and
the file's own `_comment` claimed the timings were informational *"so a faster or slower PC no longer
produces a diff"*. **That promise was not kept**: when membership legitimately changed — which any round
adding a slow test does — the rewrite carried the machine's numbers along. Two branches each adding a
test wrote two different `measuredCutoffMs` and two different `ms` columns on top of one real one-line
change.

**Decision — serialize the shared state, report the rest.** One exported `serializeTiers`, with three
properties, each load-bearing for MERGING rather than for reading:

1. **No timings.** `slow` is a list of paths; `measuredCutoffMs` is gone. The cutoff this machine
   measured is now *printed* by the run that measured it, which is where a diagnostic belongs.
2. **Sorted by PATH, not by measured time.** Not in the issue's plan, and necessary: the old order was
   the machine's speed ranking, so keeping it would have re-introduced the identical churn one field over
   — a file that merely got faster would move up the list.
3. **One line per entry**, so a membership change is an insertion git can merge with another insertion.

One tolerant reader (`slowFiles`) serves all four consumers and accepts the old object shape, so a
working copy that predates the change still runs.

**Measured, and stated exactly.** Through `git merge-file`, two branches that each add a slow file — each
reporting wildly different timings for the shared files, the real cross-machine case — merge **cleanly**
when the insertions land in the middle, and cleanly when one lands at the end. The **one** residue is two
additions that BOTH sort to the very end: JSON's trailing comma makes each rewrite the previous last
line. The issue's plan called that out in advance, and the difference is the point — that conflict is two
real membership changes, it resolves by keeping both lines, and no number is ever inside it. All three
cases are asserted, including the residual one, so the limit is recorded rather than discovered again.

**`updatedAt` stays.** It is printed by `test:fast`, and the write guard means it changes only when
membership does — so it is part of the membership record, not per-run noise.

**Scope note.** This is not a gitignore proposal: the artifact stays committed and the write guard stays,
both correct and load-bearing ([docs/08](08-testing-strategy.md), [ADR-394](06-decisions.md#adr-394)).

**Locks.** `server/__tests__/test-tiers.test.ts` (7 new): no timing field in the serialized bytes;
path-sorted (asserted by serializing the same set in two orders and demanding byte equality); one line
per entry; the three measured merge outcomes; and the artifact **on disk** asserted to be in the new
shape, so it can never quietly regress to timings. They live beside #484's, in `server/`, because the
shared-server tests run in every per-product lane and this script belongs to no product.

## ADR-W-038 — one ASK LANE across the builders; the answers stay product-shaped (#741)

**Status:** accepted, 2026-09-02 · **Operator report** (2026-08-18) · **Extends:** [ADR-W-016](#adr-w-016) (the shell is parameterized by its caller), [ADR-W-023](#adr-w-023) (the panel's row contract)

**Context.** The operator, moving between the three tools:

> *"the data panel is not the same in all tools. in geo, i need to press חשב ערכים to see it and then i
> can enter a value for calculation. in 3d its there from the start. in complex, it looks different and
> i dont have an option to enter a value for calculation. we need a unified approach here."*

The B6/D8 skeleton (#671) had unified the panel's SECTIONS and left the ASK lane alone, so each product
kept its own history. Measured at `0e8062a`, and the 2-D half is worse than the report says:

| | where the box lives | when it exists |
| --- | --- | --- |
| **2-D** | inside the `valuesLayer &&` card | **only after «חשב ערכים» runs** — and `valuesLayer` is invalidated on identity (`valuesState.facts === facts`), so **every new fact hid it again** |
| **3-D** | a direct `DataPanel` child | always |
| **complex** | a direct `DataPanel` child (rebuilt at #789) | always |

So 2-D's lane was not merely behind a button; it was behind a button that had to be pressed **again
after every line the student typed**. That is the operator's *"i need to press חשב ערכים to see it"*,
and it is why the box felt absent rather than merely hidden.

**Decision — the LANE is shared, the ANSWERS are not.**

`shell/frame/AskLane.tsx` owns everything that must look and behave the same in every builder: the box,
the submit, the collapsed symbol palette, and the rule that **the lane is always present** — never
behind a button, never gated on a computation having run. All three Apps render it; none keeps a
private ask form.

The **answer rows stay per-product**, passed in as children. An answer is the one genuinely
product-shaped part — a length with a unit, a vector equation, a complex modulus — and keeping it out of
the shell is what stops this component from acquiring the `if (product === …)` that ADR-W-016 forbids.

**#217's pull-only economics survive the move, one step later.** 2-D's values compute is expensive
(sampling), which is why it was gated at all. It is now pulled when a question is **submitted** rather
than when the panel opens: nothing is computed because the lane is merely visible, so the bargain is
unchanged — and «חשב ערכים» remains as the separate trigger that volunteers the automatic rows. A
question asked before any compute has run shows as itself, marked waiting, and never disappears.

**Consequences.**

- 3-D's ask button loses its bespoke blue Tailwind styling and 2-D's its bespoke small-grey styling;
  both now render the shared control. That the three looked different was the defect, not a feature.
- The complex third of #741 needed nothing — #789 (PR #790, ADR-CX-032) had already rebuilt it on the
  3-D shape; this ADR only moves it onto the shared component.
- The stale comment at `src/App.tsx` claiming the panel-open pulls the compute is reconciled: opening
  the panel does pull, but the pull is invalidated by the next fact, which is the mechanism above.

**Deliberately not done.** The panel's *sections* are already shared (#671) and the answer renderers
stay separate by design; no further consolidation of the three data panels is attempted here.

**Locked** in `shell/__tests__/ask-lane-parity.test.ts` (the `row-parity` source-scan pattern): every
App imports and renders the shared lane, none keeps a private ask input, 2-D's lane is **not** inside
the values-gated block, asking is what pulls the compute, and «חשב ערכים» still exists as its own
trigger. Verified visually in all three products (`npm run smoke:visual`).

---

## ADR-W-039 — The sibling guard's escape hatch rides the COMMIT, because an env var cannot reach CI (#895)

**Context.** [ADR-W-036](#adr-w-036) made the sibling guard runnable from every lane, and its escape
hatch was deliberately *a reason, not a flag* — the script's own header argues that "a bare `--force`
would be typed reflexively; a sentence gets read back in review." The sentence was carried in the
environment variable `ALLOW_SIBLING_EDIT`.

PR #894 (the Analytic Builder tree, [ADR-AG-006](06c-decisions-analytic.md#adr-ag-006)) is the first
change that had to use it, and **all four CI lanes failed**. The refused edits were one line per
sibling — `switcherAnalytic` in `src/i18n/locales/*.json`, `src3d/i18n/locales/*.json` and
`src-complex/i18n/index.ts` — which are not optional: every builder renders `products.json` as data,
so without the label each *shipped* builder shows a raw i18n key in its own product switcher.

**The root cause is WHERE the sentence lived, not whether one was written.** An environment variable
exists only in the shell of whoever typed it. It reaches neither review nor CI, and it evaporates
when the shell closes. So the hatch had a shape nobody could satisfy: a legitimately cross-product
change went green locally and could **never** go green in CI. Worse, it made a local pass look like
a gate — ADR-AG-006 recorded `check-sibling-safety --product analytic` PASS, and that PASS had been
produced by exporting the var, so the gate the ADR cited had never actually been met on the PR.

This was never analytic-specific. It hits every future product N+1 by construction, and every
shared-shell or workspace-wide rename — precisely the legitimate cases the header names.

**Decision** (operator ruling, 2026-09-03: the justification must travel *with* the change).

- The reason rides an **`Allow-sibling-edit:` commit trailer**, read from the commits in the same
  `base..HEAD` range the guard already diffs. It is therefore read from exactly the work under
  judgement, never from history that merely precedes it.
- The trailer puts the sentence in the permanent git record, which is strictly better than the var
  on every axis the original design cared about: `git log` keeps it forever, review reads it, the
  other PC sees it, and CI can act on it — with **no new configuration surface** and no workflow-level
  value that would disable the guard globally.
- `ALLOW_SIBLING_EDIT` **stays** for the local pre-commit loop, when the reason is not yet written
  into a commit. It is no longer the only channel, and it is documented as the local-only half.
- The refusal message teaches the **trailer first**, because that is the form that survives to CI.

**GIT parses the trailer, not a regex of ours** — a correctness decision, not a convenience one. A
hand-rolled `^Allow-sibling-edit:` match fails **OPEN on prose**: this mechanism gets described in
commit messages and ADR text, and a body paragraph explaining how the hatch works would arm it. Git
honours the real definition — last paragraph only — so the sentence documenting the trailer cannot
be mistaken for the trailer. It also unfolds continuations and matches the key case-insensitively,
both of which a hand-rolled matcher gets wrong quietly. Verified against git 2.53 before adopting it.

**A bare `Allow-sibling-edit:` fails CLOSED.** Git emits a blank value for a trailer written with no
reason; the guard selects the first *non-empty* line, so an empty sentence does not open the hatch.
An empty reason would be exactly the reflexive `--force` the design refuses.

**Locked** in `server/__tests__/sibling-safety.test.ts` (#895 block, 4 tests): the reason is taken
from git's output; a bare trailer and whitespace-only output yield nothing; blank lines from commits
that carry no trailer are skipped to find the one that does; and — in a real temporary git repo — the
key at line start **in a body paragraph is not a trailer**, while a real one is found folded, past an
unrelated `Co-Authored-By:`, and anywhere in the range rather than only on its tip commit.

**Consequences.** PR #894 goes green by stating its reason in its own commit, which is where a reader
looking at that commit in two years will want to find it. The guard keeps its teeth in every lane:
nothing global was relaxed, and the only way through is still a sentence somebody had to write.

---

## ADR-W-040 — The math-text core moves to `shell/`, and the "≥2 implementations" seeding rule is met by CONSUMERS (#900)

**Context.** #900 needed the 3-D Builder to render `p^2` as p². 2-D has done exactly that since
ADR-298 in `src/render/mathText.tsx` — a pure `string → MathML-string` module that names no product and
branches on nothing. `src3d/` may not import `src/` ([BOUNDARIES.json](../BOUNDARIES.json)), so the
options were to move it to `shell/` or to write a second copy.

**The seeding rule reads the other way at first glance.** [ADR-W-016](#adr-w-016)'s `shell` layer is
*"seeded only by surfaces already implemented ≥ 2 times and settled"*, and this surface is implemented
once. Taken literally that would require writing the 3-D copy first and extracting later.

**Decision: move it, and read the rule by its rationale.** The clause exists to stop an abstraction being
invented from a single example, where the second use then bends the shape. Neither hazard is present:

- **The shape is settled, not speculative** — shipped since ADR-298, locked by `mathText.test.ts`, and
  unchanged by this move. The file is transplanted, not redesigned; the only edit is its docblock.
- **It has two consumers on landing**, not one plus a hope: 2-D's step list and 3-D's non-vector rows.
- **It carries no product knowledge** — the exact failure mode ADR-W-018 names ("branching on product
  identity inside a shared module is a fork wearing a shared file's name"). There is nothing here to
  parameterize; it takes a string and returns markup.
- **Math rendering is in fact already implemented twice.** `src3d/render/VecMath.tsx` emits MathML too.
  The two are not interchangeable — `VecMath` DECORATES (arrows, vector pairs) and `shell/math` does
  not — but the claim that this is a one-off surface is false on the code.

Writing the second copy instead would have created precisely the drift `symbols3.ts`'s docblock records
from #482, where a palette and its bidi class disagreed because the vocabulary lived in two places.

**What moved.** `src/render/mathText.tsx` → `shell/math.tsx`, `git mv` so history follows, with three
import sites re-pointed (`src/App.tsx`, `src/render/mathSvg.tsx`, and its test). 2-D behaviour is
byte-identical — same module, new path — and its own locks are the evidence.

**The rule is not amended.** "≥ 2 times and settled" stays as written; this records that CONSUMERS, not
copies, are what the clause is counting, and that a settled single implementation acquiring a second
consumer satisfies it. A surface that is still being designed does not, however many callers want it.

Consumed by #900's 3-D routing — see [ADR-3D-216](06b-decisions-3d.md#adr-3d-216).

## ADR-W-041 — Requirements and design are DELIVERABLES of a change, and the ADR is where that is enforced (#904)

**Requirements:** none (internal) — no promise to a student changes. This ADR creates the requirements
*structure* (`02b`/`02c`/`02d`/`02w`); the documents it mandates are written in #904 Phase 3.
**Design:** none (internal) — no product architecture changes.

*(These two lines are the form this ADR mandates. It is the first ADR bound by its own rule — the
`06w` cutoff in `DOCS.json` is set at 41, not 42, deliberately.)*

**Context.** A full audit (2026-09-05) measured the contract layer against the build. Since
`docs/02-requirements.md` was last touched (2026-07-19) the repo took **887 commits, 216 of them
`feat`. One touched the requirements doc.** The ADR logs took 332 commits over the same window. The
code and test layers audited clean — 1 `TODO` in 86,423 non-test source lines, zero `@ts-ignore`, zero
`.only`, zero dead modules, 10,646 tests green — so this is not general neglect. It is one specific
artifact rotting while every mandatory gate stayed green.

**Why no existing gate could catch it.** The workflow has an enforced home *and* a gate for decisions
(the ADR logs, mandatory per CLAUDE.md), for work (the issue queue, `gh issue create` on every operator
report) and for behaviour (the suite, `test:full` before any commit). The contract — what the product
promises, and how it is built — has **neither**. It is the only artifact in the repo that no route step
requires and no test reads. Nothing was skipped; there was nothing to skip.

The sharpest evidence is `FR-RV-1…7`. The reveal layer shipped **2026-06-27** in `a390fcc`
(`src/engine/relations.ts`, 591 lines; `viewRelations` / `hideRelations` live in both locales). Ten
weeks later `docs/02-requirements.md` still heads that section *"(deferred, own phase)"* with every item
tagged *"(Later)"* — and the doc was edited on 2026-07-19, three weeks after the feature shipped,
without anyone looking at it. A session planning from that doc would conclude the feature does not exist.

This is [ADR-W-018](#adr-w-018)'s rule ("branching on product identity inside a shared module is a fork
wearing a shared file's name") and [docs/28](28-product-unification.md) §1c's finding ("the doctrine is
duplicated in PROSE — which is the real defect") one layer up: a rule with no mechanical home is a rule
held by memory, and memory lost.

### Decision 1 — the contract

A change that alters **what the product promises** updates its requirements doc. A change that alters
**how it is built** updates its design doc. Both in the **same commit as the code**, exactly like the
ADR and the regression scenario — not in a follow-up, not "when the dust settles". A promise the code
makes and the doc denies is the same class of defect as a figure that violates its givens: the tool
says one thing and does another.

### Decision 2 — the hook is the ADR, not a new checklist item

Every ADR gains two mandatory lines:

```
**Requirements:** FR-RN-9 (new), FR-RV-1…7 (status → Realised)   |   none (internal)
**Design:**       04b §6 (the landing funnel gains a stage)      |   none (internal)
```

Three reasons this is the right seam rather than a new step in `docs/22`:

- **An ADR is already mandatory** for any significant decision. Putting the question inside a step
  nobody skips is the only placement that does not rely on remembering.
- **It is auditable.** A test can assert the lines exist and that every id cited resolves. A prose rule
  in a workflow doc cannot be tested, which is exactly how the current gap was created.
- **It asks the question at the moment the answer is known** — while the author is arguing the decision,
  not weeks later when a doc audit tries to reconstruct it.

**`none (internal)` is a first-class answer and most ADRs will use it.** A refactor, a perf fix, a
solver change behind an unchanged promise genuinely alters no contract. This is load-bearing: if an FR
id were the only acceptable answer, sessions would invent FRs to satisfy the gate, and an inflated
requirements doc is worse than a stale one — it lies with more words.

### Decision 3 — the document scheme mirrors the ADR logs

| | 2-D | 3-D | Analytic | Complex | Workspace |
| --- | --- | --- | --- | --- | --- |
| Decisions | `06` | `06b` | `06c` | `06d` | `06w` |
| **Requirements** | `02` | **`02b`** | **`02c`** | **`02d`** | **`02w`** |
| **Design** | `04` | **`04b`** | **`04c`** | **`04d`** | **`04w`** |

The suffixes are already navigated daily, so the scheme costs nothing to learn, and it makes the
coverage guard a one-line derivation from `products.json` rather than a hand-kept list.

`02w` / `04w` exist to give the **shared** surfaces one home: the `shell/` chrome, the admin dashboard,
the ask lane and data panel, save/load, the switcher, i18n. Today those are documented as D1–D10 inside
`docs/28`, a *plan* document — and a plan is finished, while a contract is standing. Without `02w` each
of those promises would be restated in four product docs, which is the prose duplication this ADR is
reacting to.

**Requirements docs are CONTRACT, not catalogue.** `src/parser/catalog.ts` and `src3d/parser/catalog3.ts`
are already the machine-readable, test-guarded construct inventories, and they cannot drift because
guard tests parse every entry. A requirements doc that re-listed constructs would be a second copy that
*can* drift. It owns the layer above: the honesty invariants, the DOF promises, the claims contract, the
gauge-vs-knowledge rule, the pedagogy boundary, the refusal semantics. This is what makes retrofitting
3-D and complex a bounded job rather than a hopeless one.

### Decision 4 — the gate is proportional, and the proportion is measured

`test:full` is ~10 minutes. That cost should be paid whenever it can tell us something and not
otherwise. Measured on the tree at `26c7cad`: **exactly two product tests read a doc file at runtime** —
`src/__tests__/scenarios.test.ts` (`docs/test-scenarios.md`) and
`src/theorems/__tests__/t5-principles.test.ts` (`docs/10-pedagogy.md`). Everything else guarding the doc
surface is a registry/hygiene test. So the doc gate is that set plus the four guards:

```
npx vitest run server/__tests__/docs-hygiene.test.ts \
  server/__tests__/registry-consistency.test.ts \
  server/__tests__/isolation.test.ts \
  server/__tests__/sibling-safety.test.ts \
  src/__tests__/scenarios.test.ts \
  src/theorems/__tests__/t5-principles.test.ts
```

**84 tests, 2.0 s**, against ~10 min. A change touching **any** `.ts` / `.tsx` pays the full suite,
claimed by reading `reports/suite-verdict.json` per [ADR-W-033](#adr-w-033) — never an exit code.

The list is **derived, not remembered**: the conformance guard recomputes the set of test files that
read from `docs/` and fails if the registry disagrees. A new doc-reading test joins the gate by itself,
which is the same discipline [ADR-394](06-decisions.md#adr-394) applied to the slow tier — a hand-kept
exclusion list is how the fast tier silently stopped meaning anything.

### Decision 5 — three long-open tooling questions, closed

- **No linter, and this is the record of why.** Measured: 1 `TODO`, 16 `any` and zero `@ts-ignore`
  across 86,423 non-test source lines, under `strict` + `noUnusedLocals` + `noUnusedParameters` +
  `noFallthroughCasesInSwitch`. The defects this repo actually ships are semantic (a Hebrew morphology
  gate admitting one spelling, an enumeration one member short) and no linter detects those — the
  narrow guard tests do. Adopting one now means a mechanical diff across 239 modules for no measured
  defect class, against a standing rule that nothing working may break. Revisit if a second contributor
  joins, where a formatter's value is coordination rather than defect-finding.
- **Coverage: measure once, do not gate.** Install `@vitest/coverage-v8`, run it as a diagnostic, record
  the numbers in `docs/08`. This closes a question `docs/08` has carried under *Open decisions* since
  2026-06-10. It is explicitly **not** a gate: this repo's correctness evidence is four independent nets
  (invariants campaign, the coordinate oracle at 5.6e-15 worst residual, the givens verifier, 339
  scenarios + 29 fixtures), and a line-coverage target would be a weaker claim dressed as a stronger one.
- **Visual smoke in CI: deferred to its own issue.** `npm run smoke:visual` needs a preview server in
  the lane; it is real value and a separate build, not part of a documentation-contract program.

### What this does not decide

The `parse.ts` decomposition (11,336 lines, untracked); whether `docs/19a` is renamed to `02c` now or
when analytic V1 ratifies (it is live work, so the rename waits on the operator); and Phase 4 of #904,
which is discussed when reached.

**Amendment 2 (2026-09-05, Phase 1 — the gate above was measured wrong and is corrected here).**
Decision 4 claimed *"exactly two product tests read a doc file at runtime"*, from a hand-written grep.
Building the derived check in `DOCS.json` found **five**, not two: the grep missed
`src/theorems/__tests__/integrity.test.ts` (byte-matches `THEOREM_TABLE` against `docs/07`),
`src-complex/formulas/__tests__/integrity.test.ts` (byte-matches the formula table against `docs/29`)
and `src/theorems/__tests__/fill-order.test.ts` (`docs/sample questions/theorem-ground-truth.md`). Two
of those are byte-match gates, so editing the prose **alone** turns the suite red.

The corrected gate is **9 files, 655 tests, 2.1 s** — the same wall-clock, 571 more tests. The
under-count mattered more than it looks: `ci.yml` carries `paths-ignore: docs/**`, so a docs-only push
runs **no CI lane at all**, and a doc-reading test outside the gate would first go red on someone
else's later code push, attributed to the wrong commit.

This is why Decision 4 says the list is *derived, not remembered* — the derivation caught its own
author's list on the day it was written. The scan is now an assertion in `docs-hygiene.test.ts`: any
test referencing a `docs/*.md` path that is not in the gate fails the suite.

**Amendment 1 (2026-09-05, operator: "we should make changes now during cleanup").** `docs/19a` is
renamed to `docs/02c-requirements-analytic.md` immediately, in Phase 1, rather than waiting on
ratification. Its declared lifecycle changes with it: the file no longer *"folds into 19 and is
deleted"*. Under this ADR a requirements doc is a **standing contract** and `docs/19` is a **finishing
plan**, so the fold runs the other way — `docs/19`'s analytic requirements fold into `02c`, and
ratification changes `02c`'s status line rather than ending its life. Recorded in that file's header,
because a lifecycle reversal is exactly the kind of implication this ADR exists to stop losing.

## ADR-W-042 — An orientation-file ceiling is a FORCING FUNCTION, not a budget; raises are logged (#904)

**Requirements:** none (internal) — no promise to a student changes.
**Design:** none (internal) — a parameter under [ADR-W-002](#adr-w-002); the mechanism is unchanged.

**Context.** The operator asked what raising `CLAUDE.md`'s 20 KB ceiling would imply, and observed that
the number looked arbitrary. It was: set on 2026-08-08 by [ADR-W-002](#adr-w-002) at the post-cleanup
size (17,349 B) plus roughly 15%, a round number. **The reasoning was recorded nowhere**, so the first
question ever asked about it had no answer in the repo — the same defect [ADR-W-041](#adr-w-041) exists
to close, in miniature.

**What the measurement showed.** In the 28 days after the ceiling landed, `CLAUDE.md` grew 2,607 B
(~93 B/day) across 9 commits, and **every one was structural**: products 3 and 4, the `shell/` tree,
standing rule 5, the fix-round and batch-approval machinery. Zero chronology. The ceiling was firing on
the case it was *not* built for, and had 44 B left.

**Two guards, two different failures.** They are routinely confused, so this records the split:

- **The chronology ban** (the `**Then (` form) prevents the 188 KB failure — 95 locally reasonable acts
  producing 172 KB of duplicated ADR narrative. That is the catastrophic mode, and it is caught by
  FORM, independent of any size limit.
- **The ceiling** guards the slower mode: accretion that is legitimate one commit at a time and only
  visible in aggregate. Nothing else measures that.

**Decision 1 — the ceiling's value is arbitrary; its ROLE is a forcing function.** Its worth is not
that it bounds a budget but that hitting it forces a prune nobody performs voluntarily. The evidence is
immediate: the squeeze in #904 Step 3 removed four passages that duplicated a fuller home (the tier
doctrine and fold-memo corollary → `docs/08`; the `@/` alias hazard → `BOUNDARIES.json`; the worktree
bullet → `docs/22 §7`), each verified at its origin before deletion. None would have been found by
looking for duplication on purpose.

**So set a ceiling that produces a periodic prune — never one so tight that recording a real rule
becomes a negotiation.** 44 B is a wall, not a cadence, and a wall inverts the incentive: a session that
cannot afford a line puts it somewhere less discoverable, which is precisely what these files exist to
prevent. **Raised to 24,000** (operator ruling, 2026-09-05) — about six weeks between prunes at the
observed rate, and the drivers of that rate, adding two products, are largely spent.

**Decision 2 — context cost is the wrong axis, and this says so on purpose.** `CLAUDE.md` is ~4,900
tokens and prompt-cached; against the session window that is noise. A future argument to tighten or
loosen the ceiling on token-budget grounds is reasoning about the wrong quantity, and without this
paragraph it is the most natural argument to reach for.

**Decision 3 — every raise is logged.** `DOCS.json` `orientationFiles.$raiseLog` records date, file, new
value, **size at the time**, and why, for each raise including the 2026-08-08 one reconstructed from
git. The growth curve is then visible, the next raise is argued from data rather than memory, and
appending a row is conspicuous enough to discourage a lazy one. The `$` prefix is this file's existing
convention for "not an entry in this map", so the reader needed no change.

**Why this is an ADR and not just the log entry.** The first attempt recorded only the `$raiseLog` row,
on the reasoning that an ADR would duplicate a fact with a better home. That was wrong in one respect:
the *parameter* belongs next to the number, but the *doctrine* above — which failure each guard catches,
why the number is arbitrary, why token budget is the wrong axis — was sitting in a JSON `$comment`,
where doctrine is not discoverable and not linkable. The log keeps the data series; this keeps the
reasoning; the `$comment` now points here instead of restating it.

**What this does not decide.** Whether the sibling trees' 10 KB ceilings should move (none is near one),
and whether the ceiling should ever measure something smarter than total bytes — excluding the module
table that legitimately grows with each product was considered and rejected as more mechanism than the
problem deserves.

## ADR-W-043 — A product's reverse-proxy rule is a DEPLOY STEP, and "unreachable" is not "unset" (#903)

**Status:** accepted, 2026-09-05 · fix-round #915 · **Requirements:** none student-facing (nothing a
student can do changes) · **Design:** [RUNBOOK](RUNBOOK.md) gains the per-product proxy step;
`shell/switcherConfig.ts` gains the three-state read

**Context.** Measured live on 2026-09-05:

```
https://themathbible.com/geo-builder/api/parse            → 405   routed (method refused)
https://themathbible.com/geo-builder/api/config?tool=geo  → 404   NOT routed
https://themathbible.com/3d-builder/api/log               → 405   routed
https://themathbible.com/complex-builder/api/parse        → 404   nothing under this prefix exists
```

Two findings, one root cause. The **complex builder was added to the deploy table with no conf at
all** — `deploy/` held `apache-geo-builder.conf` and `apache-3d-builder.conf` and nothing else — so
its whole prefix 404'd from its first deploy (`prod/2026-08-15-2`). And **`/api/config` had never
been proxied for ANY product**: the route is implemented server-side for every tool
(`server/standalone.ts`) and carried by no conf. A shipped admin feature (#662's per-tool curation)
was silently inert everywhere, visible only where something consumed it — which today is only
`src-complex/App.tsx`.

**Why it took a month to find.** The consumer's degraded path is correct and deliberate: *"a dead or
configless server answers non-200 and the switcher renders the built-in registry roster; nothing here
can error at the student."* It worked perfectly. It also **collapsed two different worlds into one
`null`** — "there is no curation" and "your curation cannot be delivered" — so the failure had no
observer. A graceful fallback that cannot distinguish absence from unreachability is an
**error-swallowing** fallback wearing better clothes.

**Decision (operator ruling, 2026-09-05): both halves.**

**1 — The routing, as a recipe step rather than three files.** `deploy/apache-complex-builder.conf`
is written, and `api/config` is added to the 2-D and 3-D confs too. Fixing only the complex prefix
would have left the route unproxied for the two products that will need it the moment they grow a
consumer, and for `src-analytic/`, already planned. The RUNBOOK now carries the per-product proxy
step and the `curl` verification, because **the root cause is a missing recipe step, not a
mis-executed one** — the recipe that produced this hole would produce it again for builder N+1.

**Deliberately NO `/admin` line for complex.** Apache strips the product prefix and the Node server
matches on the path TAIL, so `/complex-builder/admin` would reach the bare `/admin` and serve the
**2-D dashboard** under the complex prefix — worse than the 404 it replaces. 2-D owns `/admin`, 3-D
has the distinct `/admin3`, and complex has no dashboard mount because it does not log. It is
curated from the existing config page (`/geo-builder/admin/config?tool=complex`). This departs from
the fix plan's "proxy `api/parse`, `api/log`, `api/config`, `admin`" — measured, that fourth line
would have shipped a misleading surface, so it is left out and locked out.

**2 — The three-state read, in `shell/` rather than in the product.** `ConfigRead` is
`configured` · `unset` · `unreachable`, and `readToolConfig` is total: it never throws and never
rejects, so a caller cannot reintroduce the collapse by forgetting a `catch`. It lives in the shared
chrome tree because **any product that adds a config consumer must inherit the distinction** — put it
in `src-complex/App.tsx` and the next silently-inert surface repeats this exactly. `configOf` maps
both non-configured outcomes to `null`, so the **student's** experience is byte-identical: the
degraded path is preserved, not weakened.

**Where the third state surfaces.** The operator's config page runs the probe **from the browser**,
against each enabled product's own public prefix, and names any builder the config cannot reach. It
has to be the browser: the dashboard is served by the very process that serves `/api/config`, so the
server can always reach itself and **cannot observe its own proxy hole**. The complex app also warns
on the console with the URL and what is inert. Neither is student-facing, per the ruling.

**Locked** in `shell/__tests__/config-read-903.test.ts` (404/500/dead-network/non-JSON are all
`unreachable` and never `unset`; 204 is `unset`; every non-configured outcome still yields `null` for
the roster merge; the request goes through the app's own public prefix) and
`server/__tests__/deploy-proxy-confs.test.ts` (every `enabled` product in `products.json` has a conf;
every conf proxies `api/config` with its `ProxyPassReverse` twin; every `ProxyPass` is paired; and the
complex conf does **not** proxy a bare `/admin`). Adding builder N+1 without its conf now fails the
suite instead of failing quietly in production.

**What this does NOT do — the last mile is the operator's.** Apache directives live in Plesk's GUI
field (direct `vhost_ssl.conf` edits do not survive regeneration), so the confs in `deploy/` are
sources, not deployment. **The routing stays broken in production until the new/updated directives are
pasted there and Apache reloaded.** That is a deploy act, and a fix round never deploys.

**Out of scope, deliberately.** The second comment on #903 proposes replacing the RUNBOOK's
`server/`-only rebuild rule with a bundle diff — a real defect in the same document, and not in the
approved scope of this ruling.

## ADR-W-044 — A fact whose SUBJECT is gone is a fact in error, and the action that orphaned it says so (#926)

**Status:** accepted, 2026-09-07 · fix-round #927 · **Requirements:** [02](02-requirements.md) FR-EN-22 (new) ·
[02b](02b-requirements-3d.md) FR-VC-2c (new) — what the tool owes a stated value whose definition is edited
away · **Design:** [04](04-design.md) §4 (the fold's orphan check) · [04b](04b-design-3d.md), the claims /
`derive3` section (the symbol retry pass and the dependents report)

**Context.** Transcribing the operator's #925 answer (2026-09-07): *"if user modified the ∠SAB = α row to
something else, the α = 70 will still exist but is meaningless at this point. Perhaps it turns red."*
Measured at `82d87c6`, it was worse than meaningless — and it was the same defect in both trees:

```
3-D  פירמידה SABCD שבסיסה ריבוע · ∠SAB = α · α = 70
     replaceFact('∠SAB = α' → '∠SAB = 40')   → returns TRUE, lastError null, «α = 70» still listed, symbolPins []
     remove('∠SAB = α')                       → lastError null; the same for «C(p²,1,0)»+«p=3» and «SN = k·SC»+«k = 1/2»
     remove + re-add «∠SAB = α»               → «α = 70» stays red (the fold is strictly in order)
2-D  משולש ABC · ∠ABC = α · α = 70            → the arc reads «70°»
     drop «∠ABC = α»                          → status ok / ok, lastError null, labels.angles []   ← a green ✓ on a row that does nothing
```

CLAUDE.md's honesty invariant — *no stated magnitude is ever silently dropped* — was broken in the fact
list instead of on the canvas: the student's own list said the figure honoured α = 70, and the figure did
not know what α was.

**Decision — one rule for every builder.** A statement whose subject no longer exists is a **fact in
error**: the row stays in the list (the tool never deletes the student's sentence for them), it is marked
as not in effect with a reason that names the letter, and it takes effect again by itself the moment its
definition is back — wherever in the list the definition lands, including after the value row. And the
**action that orphaned it** — a delete, a mute, an edit — is committed as asked but is **not reported as a
bare success**: it names the rows it took from green to red, in the student's wording. The class is *"a
fact whose subject no longer exists"*: the symbol lanes (#902's five owners) and the point lanes (a length
on a point whose defining step was deleted) get the same report from the same seam, because the seam judges
on the fold's own per-row status and never on a second dependency walk.

**What each tree does** — re-derived, never shared (products do not import each other): 2-D in
[ADR-483](06-decisions.md#adr-483), 3-D in [ADR-3D-220](06b-decisions-3d.md#adr-3d-220). The two differ
only where the trees differ: 2-D's symbol table is whole-list and position-independent, so the re-added
definition binds for free; 3-D's fold is strictly in order, so it gains a bounded retry pass for symbol
statements alone (nothing that introduces an object is ever re-ordered — the 2-D ADR-104 rule).

**The armed assumption, confirmed by the code.** The operator approved the plan with the session's
assumption that a re-added definition restores the value silently. In 2-D this held already; in 3-D it
needed the retry pass, which touches only rows already red with `unknown-symbol`, so no green figure can
change. Had it required re-ordering the fold, this would have been an escalation.

**Not in scope, recorded.** The plan's "check the same sweep" items were investigation, not licence: a
length on a deleted point in 3-D was measured to reach the same report through the same seam
(`issue-926.test.ts`, the last case) and so is covered; a general dependency audit was not started.

## ADR-W-045 — An angle arc reads ONE text per wedge: the value once stated, the letter until then (#923)

**Status:** accepted, 2026-09-07 · fix-round #927 · operator ruling 2026-09-07 · **Requirements:**
[02b](02b-requirements-3d.md) FR-RD-4 (new); 2-D already keeps it structurally (`wedgeOf` + `perVertex`
rank in `src/render/scene.ts`, ADR-167 Am.) · **Design:** [04b](04b-design-3d.md), the rendering section;
2-D: none (already built)

**Context.** The 3-D builder painted «α» and «70°» at one pixel for an angle the student first named and
then valued (#923). 2-D, measured on the same sequence, already reads the way the operator ruled:

```
משולש ABC · ∠ABC = α           → labels.angles [{B,A,C,"α"}]
משולש ABC · ∠ABC = α · α = 70  → labels.angles [{B,A,C,"70°"}]
משולש ABC · ∠ABC = 70          → labels.angles [{B,A,C,"70°"}]
```

**Decision — the suite rule, so the two cannot drift again.** In every builder, an angle the student
marked draws **one arc per wedge**, and its text is **the stated value once one exists** («70°»), **the
letter until then** («α»), never both concatenated and never two labels. The operator's reason is the
shape of the exam: *"in part 1 of the question the user needs to work with the parameter α, and in a
later part α is given"* — two moments of one question, and the canvas follows the student to the moment
they are in. A right-angle value draws the textbook knee and no arc in either builder. Re-derived per
tree, never shared: 2-D as built, 3-D in [ADR-3D-221](06b-decisions-3d.md#adr-3d-221).

**Left open, on purpose.** *Which spellings name the same wedge* is a per-builder question: 2-D matches
by ray DIRECTION (±1.5°) because F7/REN-9 taught it that «∠AFD» and «∠GFH» at one corner are one angle;
3-D matches by point ids, and the alternate-spelling case is reachable there (ADR-3D-221 §4, filed
separately). The toggle chip letting a student flip an arc between the letter and the value is #925 —
a capability, built on this rule, not part of it.

## ADR-W-046 — A builder opens EMPTY; durable work is an explicit save to a file (#919)

**Status:** accepted, 2026-09-07 · fix-round #927 · operator ruling 2026-09-06 (`/decisions` pass:
*"clean canvas always"*) · **Requirements:** [02w](02w-requirements-workspace.md) FR-SL-5 (new — the suite
rule); [02](02-requirements.md) FR-HS-4 **withdrawn** · **Design:** none (a seam is removed, not built) ·
Cross-referenced from [ADR-CX-038](06d-decisions-complex.md#adr-cx-038)

**Context.** The operator, playing round #915 (2026-09-06): *"complex builder — when i move to this tool
from another tool, the last values are always there and not a clean canvas like in 2d and 3d tools."*
Measured at `38f7461`: `src-complex/app/session.ts` restored `localStorage['complex-proto-session']` on
every load — re-submitting every stored line through the grammar — and wrote it back on every store
change; the product switcher is a plain `<a href>`, so arriving from another tool IS a page load and
indistinguishable from F5. Neither sibling does this: `src/` touches `localStorage` only for the
one-time About dialog flag, `src3d/` not at all. The harm was more than clutter — the next line a student
typed was evaluated against a figure they did not build.

**The class.** Not "complex restores": *the suite never decided whether a builder survives a reload, so
each product answered differently by accident.* The complex builder honoured a written requirement
(FR-HS-4, *"persist the current construction across page reloads"*) that the other two never realised.

**Decision — clean canvas always, one rule for every builder.** A builder opens empty on every load,
whether reached by the switcher, a bookmark, or a refresh. Durable work is the explicit save/load to a
file (FR-HS-10 / FR-SL-1…4), which every builder already has. The restore seam is **deleted whole** —
`session.ts` and its `main.tsx` call, the write half included (a subscription filling a key nothing
reads would read as intentional to the next person); nothing is left disabled. `hydrateSession`, shared
with the file-load path, is untouched.

**What this withdraws, deliberately.** FR-HS-4 is struck: the operator was told it was a written
requirement and chose this anyway (the session had recommended the refresh-only option on its strength).
An accidental refresh mid-question now loses the lines in the complex builder, as it always has in 2-D
and 3-D. Recorded plainly so nobody re-opens it as an oversight.

**Locks.** `src-complex/__tests__/no-session-restore-919.test.ts`: a populated session key is ignored on
boot (the store imports empty) and no product tree reads or writes a session key (a grep guard, so
`src-analytic/` cannot inherit the coin flip); the fixtures net (`fixtures.test.ts`) stays the proof that
file load still works.

## ADR-W-047 — A parameter the student VALUES gets a display choice on the valuing line; one they never valued is never replaced (#937, #925)

**Status:** accepted, 2026-09-08 (fix-round #946, item 1) · **Issues:** #937 (the rule), #925 (its first adoption)
**Operator ruling:** 2026-09-08, playing round #931 T10, with three scope answers the same day
**Requirements:** [02b](02b-requirements-3d.md) FR-RD-3 — amended · **Design:** [04b](04b-design-3d.md) — the display seam
**Adoptions:** 3-D angle arc — [ADR-3D-233](06b-decisions-3d.md#adr-3d-233), this PR. 2-D, the 3-D coordinate lane and complex follow as their own issues.

### The ruling, and why it is a rule rather than a feature

> *"the general pedagogy rule that needs to propagate to all cases is that if a point, line, vector,
> angle, segment size or anything is defined by a parameter, and later in input we define that
> parameter, the user will have a chip toggle where he can decide if he wants to see the parameter
> display or the value display. this chip will be on the input line that defined the parameter - i.e.
> on the line with p=3. … if the value of the parameter is computable, but user did not enter it, the
> canvas always shows the parameter and data panel can show the computed values."*

**A bagrut question is worked in PARTS.** Part 1 reasons with the letter and every line the student
writes is *about* «α»; a later part supplies 70. The figure serves both, and which form belongs on
screen depends on **where in the question the student is** — which the tool cannot infer and must not
guess. So the default follows their last statement, and the chip lets them go back.

Measured before this change, through the real path: after «∠SAB = α» the arc reads `α`; after «α = 70»
it reads `70°` and **no surface anywhere still shows `α`.** The form the student typed was
unrecoverable. Same defect one lane over for a coordinate (`c(p²,1,0)` · `p=3` → `C(9, 1, 0)`, the
report that produced this ruling), and one tree over in 2-D (`AB = 3x` · `x = 4` → `12`).

### The three clauses, and the operator's answers

**1 — Scope is every parametrised quantity, not angles.** A point, line, vector, angle, segment
length — anything defined in terms of a parameter the student later values.

**2 — The chip lives on the line that VALUED the parameter** (`α = 70`, `p = 3`), not on the line that
used it. Same ownership he settled for #925 on 2026-09-07, and it is the row whose statement the choice
is about.

**3 — A parameter the student did NOT value is never silently replaced.** If the figure can *compute*
it, the canvas still shows the letter and the panel may show the computed value. **There is no chip in
this case — there is nothing the student chose between.** This is the honesty half and the more
important one: a value the student never wrote must not appear on the figure as though they had.

His three scope answers, all 2026-09-08:

- **Only where the displays COMPETE** — *"only when displays compete"*. The wider literal reading of
  clause 1 is not taken.
- **The choice PERSISTS** — *"show another config and save/reload should keep the choice"*. This
  reverses #925's earlier session-level recommendation.
- **Clause 3 is a LOCK, not new work** — *"what works today is good. i just wrote it so there is no
  confusion"*, confirmed by measurement in both trees.

### The decision — what is shared, and what each product derives

**`shell/displayMode.ts` — the state shape and its pure operations.** `DisplayModeMap` is
`factId → 'letter' | 'value'`, default `value`, plus toggle, prune, and the file-boundary converters.
No strings, no geometry, no opinion about which surfaces compete: ADR-W-016's contract as written.

**`shell/frame/FactList.tsx` — the affordance.** A row may carry `chip: { letter, value, mode,
onToggle, title }`; it renders a two-state control showing the form the student would switch *to*, and
calls back. It knows no product and no symbol semantics, and in particular it does **not** decide which
rows get one.

**The COMPETING predicate is derived per product, over its own display builders.** *"Compete"* is a
property of a **surface**, not of the figure — an angle's two forms compete on the canvas arc, a
coordinate's compete in the data panel, and a symbol nothing renders competes nowhere. So the rule is:

> a valued parameter offers a chip **iff some display surface holds both its parametric form and its
> value** — i.e. renders the letter while the value is absent and the value once it arrives.

Each product answers that from the data its builders already carry, never from a list of quantity
KINDS. A surface that learns to hold both forms starts offering the chip by itself; a per-kind
enumeration is the case-by-case shape this ruling exists to avoid.

**Deviation from #937's design comment, stated plainly.** D1 defined the predicate as a *replay diff*:
replay without the valuing fact and with it, and compare the rendered strings. That is a correct
**definition** and a poor implementation — it is a second solve per valuing row on every render. The
structural form above is the same predicate computed from what the surface already holds (a wedge with
both a label and a `deg` renders the letter without the value and the value with it — that is exactly
what `degText` does), and it is O(1). Nothing else about D1–D7 changed.

### Why the store keys by fact id and the FILE keys by position

The choice is keyed by the id of the fact that valued the parameter. That id survives a reseed and a
branch cycle — the figure is derived from the fact list and the id is not — which is what makes the
persistence half of ruling 2 work with no positions stored. It is a display preference and **not a
geometric fact**, so it never enters the ordered fact list; CLAUDE.md's source-of-truth rule is
untouched. It sits beside `seed` in the store, in `partialize`, and in the save file, exactly as each
product's other display preferences already do.

**Across a FILE, the id means nothing.** A load re-parses the saved utterances into fresh facts with
fresh ids — the point of the format is that it stores what the student *said*, so an old file picks up
parser and engine fixes automatically. A first cut keyed the file by id and silently lost the choice on
every reload while looking correct in the store; the round-trip lock is what caught it. The file
therefore keys by the fact's **index**, the file's own stable handle, converted at that boundary and
only there.

A file saved before this shipped carries no map and loads showing values — today's behaviour, so there
is no migration and the load audit stays green. A figure with no choice writes no key at all, so an
untouched file is byte-identical.

### Locks

Per-product, and clause 3 is locked **in every tree the rule reaches**, whether or not that tree has a
chip yet — it is the half that binds today. 3-D: `issue-937-param-display-chip.test.ts` (16). 2-D:
`issue-937-clause3-2d.test.ts` (4) — the free scale, the DETERMINED scale, the determined named angle,
and the boundary case where the student *did* state the value, so the two halves cannot be confused by
a later change.

### What this does NOT settle

The remaining adoptions, each its own issue with its own product ADR: **2-D**'s angle and length chips,
the **3-D coordinate lane** (panel-competing — the first non-canvas chip, and the case that proves the
predicate is not canvas-specific), and **complex**, whose render side is still unmeasured (#937's design
pass measured its parser only, and says so). Per docs/20 §12 each copies the pattern rather than
importing it; what they share is this ADR and `shell/`.

## ADR-W-048 — A figure whose givens force a named object FLAT says so, in the student's own words (#936, #945)

**Status:** accepted, 2026-09-09 (fix-round #949, item 3) · **Issues:** #936 (the 3-D half), #945 (the 2-D half)
**Operator ruling:** 2026-09-08 (`/decisions` pass on #936)
**Requirements:** [02b](02b-requirements-3d.md) FR-RD-7 (new) · **Design:** [04b](04b-design-3d.md) — the notice channel
**Adoptions:** 3-D — [ADR-3D-234](06b-decisions-3d.md#adr-3d-234), this PR. 2-D — #945, which cites this rule rather than re-deciding it.

**Context.** The operator, playing round #931's T12: *"the image collapsed to a 2d diagram."* He was
right about what he saw and the tool was right too — «∠BAS = 40» + «∠DAS = 50» at a right-angled corner
puts the apex exactly in the base plane, because `cos²40° + cos²50° ≡ 1`. Every given was honoured and
the drawing was the only one satisfying them. What was missing is that nothing **told** him. A student
who types «פירמידה» and gets a flat quadrilateral with every fact green concludes the app is broken —
which is what happened to an operator who knows the tool well.

**The rule, stated once for every builder.** When a figure's givens force a named object's defining
extent to collapse, the tool says so, **in the student's own words, naming the statements responsible**.
It never draws a degenerate figure in silence with every fact green.

Two things the ruling settled explicitly:

- **A notice, not the DOF cue.** The cue is a number; it cannot name *which statements* forced the
  collapse, and naming them is the honest half. Routing this through the cue was considered and rejected.
- **A notice, not a refusal.** The figure is correct and the student may well have meant to discover
  exactly this. Refusing would be the opposite error — withholding a valid drawing.

**Both products.** The operator ruled for 2-D as well, wider than the session's own recommendation
(which was 3-D first, 2-D on evidence). Recorded as his decision, not the session's.

**Copied, never imported** (docs/20 §12): products never share code, so one rule lands as two
independently derived implementations, each with its own calibration. #945 must **measure its own 2-D
trigger family** rather than transposing the 3-D one — a collapsed polygon is not the same predicate as
a coplanar solid, and the corpora differ.

**The tolerance is the deliverable, in each product.** It must be relative to the figure's own scale
(never absolute) and calibrated against that product's fixture corpus, with the calibration evidence in
the product ADR and the corpus sweep kept as a **lock** rather than a one-off measurement. The
false-positive net — an ordinary figure must stay silent — is the half that matters: a false degeneracy
notice on a legitimate drawing is worse than the silence it replaces.

## ADR-W-049 — THE THREAD IS THE AUTHORITY ON WHETHER A QUESTION IS OPEN; a status pass may CLEAR `needs-operator`, never apply it (#959)

**Status:** accepted, 2026-09-10 (round #962) · **Issue:** #959
**Requirements:** none (internal — workflow) · **Design:** [22](22-workflow.md) §2d (the label's lifecycle) · the `/status-update` skill

**The defect.** A status pass reads an issue's title and body, sees an open question, and applies
`needs-operator` — over a ruling already sitting in the issue's **comment thread**. The question then
costs the operator a decision slot in the next `/decisions` pass, where it is discovered to have been
answered weeks earlier. **Four recurrences, three of them on one day** (#551 ×3, #370, #364), with the
2026-09-01 self-correction stating the exact lesson and it recurring twice afterwards — which is the
evidence that a note in a thread is not a fix.

**Root cause — a structural conflict between two correct rules,** not carelessness:

1. *An issue body is written once and never revised; the ruling lives in a comment* (#509, #659). This
   is right — a revised body destroys the record of what was originally asked.
2. A status pass triages from the body, because the body is what states the issue.

Given (1), **the body of a ruled issue is guaranteed to still contain the open question**, so a pass
reading only the body will relabel *every* ruled issue, forever.

It has a second, worse direction: an issue whose LABEL says `needs-operator` while its THREAD says ruled
is equally likely to be read the other way by a fix round — armed work skipped because the label says
blocked.

**Decision — two halves, because they fix opposite directions.**

**(a) Ruled-ness is a QUERY, not a reading-comprehension task.** `scripts/queue-hygiene.mjs` holds pure
predicates over a plain `{ labels, comments }` shape — `isRulingComment`, `rulingComments`,
`labelThreadDisagreement`, `auditQueue` — plus a thin CLI that pulls the live queue and reports both
directions, exiting non-zero when any disagreement exists. The marker vocabulary is **measured from the
real corpus**, not invented: `/decisions` passes have been writing «## Operator ruling — DATE»,
«Operator decision (DATE)» and «**Ruled: …**» all along, and nothing ever asked.

**Recency decides, not mere presence.** A ruling that PRE-dates the newest escalation is not stale: round
#961 escalated #960 with a genuine new question on an issue whose thread already held older rulings, and
the operator answered it one message later. Both states are locked.

**(b) A status pass may CLEAR the label; only a `/decisions` pass or a fix-round ESCALATION may apply
it.** The `/status-update` skill previously instructed the opposite — *"the label lags reality, so scan
for the questions, and add the label where it's missing … so the queue converges on the truth"* — which
is precisely the instruction that produced all four recurrences. A `/decisions` pass applies it while
transcribing the operator; a fix-round escalation applies it having hit the code, so it is a genuine new
question by construction. A status pass has neither warrant: it is reading the same body that already
contained the question when the ruling was given.

**Why not "read the thread carefully" alone.** That was tried — the 2026-09-01 self-correction said
exactly that, and the bug recurred twice within nine days. A habit a pass can forget is not a mechanism.

**What running it immediately taught, and why that is in the ADR.** The first live run reported #960 as
*"an unanswered escalation but no `needs-operator`"* — a false positive, because that morning's operator
answer had been written under «## **Operator answer** — 2026-09-10», a heading the vocabulary did not
know. The shapes were widened to the measured set (`ruling|decision|answer`) and the queue then read
clean: **64 open issues, label and thread agree everywhere.** The lesson is recorded in the file itself:
a vocabulary of what passes are *supposed* to write is worth nothing; this one is measured from what they
*do* write, and widening it is expected maintenance rather than a defect.

**Locks.** `scripts/__tests__/queue-hygiene.test.ts` (16), offline against fixtures taken from the real
threads: every measured ruling shape is recognised, including the `answer` heading that running it
surfaced; a session's own analysis («Plan correction … **Not a ruling; no approval implied**», an
`auto-ok` audit comment citing the standing ruling) is NOT read as a ruling, which is what stops the
guard clearing labels nobody answered; the reported stale-label case (#370's «count them»); both label
shapes `gh --json` returns; an escalation after the last ruling keeps its label, and the operator's
answer to it makes the label stale again; the reverse direction; and an empty queue is clean, not an
error.

**Not in scope.** The guard reports; it does not edit. Applying or clearing a label stays a deliberate
act by the pass that has the warrant, so an automated relabel can never be the thing that goes wrong.

## ADR-W-050 — AN FR ID IS DEFINED AT MOST ONCE, AND THE GUARD SAYS SO (#987)

**Status:** accepted, 2026-09-13 · **Issue:** #987 (debt, P3 — found while filing ADR-3D-238's requirements line, round #974) · round #998 · debt route (landed on `main`)
**Requirements:** none · **Design:** none (internal — a documentation-integrity guard)

**The defect.** `docs/02b` defined **FR-SP-7 twice** (2026-09-05, *every exam's space/vectors input is
expressible*; 2026-09-10, *one line may declare a solid AND a construct*) and **FR-SP-8 twice**
(2026-09-07, *case in labels*; 2026-09-10, *operand coverage*, #963). Every citation of either id was
ambiguous, and the suite reported green throughout: [ADR-W-041](#adr-w-041)'s FR guard checks that a cited
id RESOLVES to a definition — two definitions resolve just fine. An enumeration checked one way and
unchecked the other is ADR-W-041's own class (that is how `docs/06c` went invisible while green).

**Decision.** `docs-hygiene.test.ts` gains the uniqueness half: across every requirements doc registered
in `DOCS.json`, each bold declaration `**FR-XX-N (Tier)**` may appear at most once, and a collision is
reported with both file:line sites. It was run BEFORE the repair and failed naming exactly the two pairs —
the proof the guard works — and passes after it. **Renumber, newest loses:** the pre-existing definitions
keep their ids (they are cited from shipped ADRs, and a stable reference that moves is worse than one out
of order); the later additions moved to the next free ids — the composed-form FR is now **FR-SP-10**, the
operand-coverage FR **FR-SP-11** — and their citations were repointed in the same commit (`docs/04b` §the
operand table, [ADR-3D-238](06b-decisions-3d.md#adr-3d-238)'s requirements line, which now says where it
came from). [ADR-3D-237](06b-decisions-3d.md#adr-3d-237) cites its FR by description, so nothing to move.

**Locks.** The guard itself (the `DEFINED at most once` case in `docs-hygiene.test.ts`, asserted on the
live docs); `test:docs` green.

## ADR-W-051 — A DOWNLOADED IMAGE NEVER CONTAINS ON-SCREEN CHROME, IN EVERY BUILDER — and each product proves it (#713)

**Status:** accepted, 2026-09-13 · **Issue:** #713 (feature, P3 — the operator's 2026-09-08 ruling *"a downloaded image never contains on-screen chrome — in ALL THREE products"*) · round #1001 · feature route (PR) · extends [ADR-W-016](#adr-w-016)/[ADR-W-019](#adr-w-019)'s shared `shell/export`; the 2-D contract of F3/REN-3 made workspace-wide
**Requirements:** [02w](02w-requirements-workspace.md) FR-EX-3 (new — export is a shared surface, which is where 02b and 02d both send their export promises; the ruling's "each product's requirements doc" resolves to the one document that owns the surface) · **Design:** none (internal — the strip contract and the tagging seam are unchanged; a markup twin of the strip, `shell/export/exportMarkup.ts`, exists so the locks run DOM-free)

**Context — measured at HEAD (2026-09-13).** All three products rasterise through the shared
`shell/export/svgToPng`, which strips every `[data-noexport]` subtree and reverts the `data-export-*`
selection accents on a clone before drawing. The opt-in is per-renderer tagging. 2-D tags eight sites
(crossing offers, promotable points, highlight overlays, hidden-item ghosts, hover relation marks).
**3-D tagged nothing and painted two interaction-only things inside its SVG:** the #483 crossing OFFER — a
hollow dashed dot with a transparent hit ring that says "click to name" — and the #578 point hit rings.
A 3-D worksheet PNG therefore carried a dashed "available" dot that is not part of the figure. **Complex
tagged nothing and paints nothing interactive** — its plane takes no hover/selection/offer prop; the
ruling's "neither product tags a single element" was, for complex, the absence of chrome rather than an
untagged one (a measurement the issue's framing did not distinguish).

**The class (docs/17 §1).** *A clean-export contract that lives in the shared tree but whose opt-in is
per-product, with nothing making a product opt in.* Fixing 3-D's two sites alone would leave the same
class open for the next affordance and the next product.

**Decision.**

1. **3-D opts in:** the crossing-offer group and the point hit ring carry `data-noexport`
   (`src3d/render/Figure3.tsx`).
2. **The class is closed by a lock per product, never a shared import** (docs/20 §12): each product
   renders its figure with EVERY chrome affordance its renderer takes as a prop switched ON, strips the
   markup the way the rasteriser does, and asserts the ink equals its chrome-free render —
   `src/render/__tests__/clean-export.test.tsx` (crossing offers, highlight overlay + accents, promotable
   points; the hover marks are internal state, so their tag is asserted at the source),
   `src3d/render/__tests__/clean-export.test.tsx` (the offer and the hit rings), and
   `src-complex/__tests__/clean-export.test.tsx` (the strip is the identity and no affordance marker is
   painted — the measured "no chrome" recorded so it cannot drift). The rule the locks encode: **a chrome
   affordance is added with its prop ON in the product's lock, or it ships in the download untested.**
3. **The strip, stated over markup.** Tests run DOM-free (`renderToStaticMarkup`), so
   `shell/export/exportMarkup.ts` restates the rasteriser's two operations over serialised SVG —
   `stripNoExport` (every tagged subtree, nested groups included) and `revertExportAccents` (each
   `data-export-<x>="v"` becomes `<x>="v"`) — with `normalizeForExport` dropping what paints nothing
   (`class`, cursor styles, `<title>` tooltips) so renders compare by ink. Its own contract is pinned in
   `shell/__tests__/export-markup.test.ts`. It is the reference every product lock reads; the DOM strip
   in `svgToPng` is unchanged.
4. **The conformance row** (#664's matrix, A5): *clean export — every product's export equals its
   chrome-free render.* Measured 2026-09-13: 2-D ✓ (was already), 3-D ✓ (after 1), complex ✓ (nothing to
   strip). Recorded here as the row's first cell values; the harness itself is #664's.

**Locks.** 14: the helper's six (self-closing, nested groups, byte-identity when untagged, a look-alike
attribute, the accent revert, the non-painting normalisation); 2-D four; 3-D two (the chrome is really
painted and tagged; the stripped ink equals the plain render, no dashed offer, no hit ring); complex two.

**Deviations from the plan, recorded.** The ruling expected the complex plane to carry untagged chrome
("hover targets, selection marks") — measured, it paints none, so its lock records the absence rather
than tagging anything. The ruling's requirements lines went to 02w rather than 02b/02d, because both
product documents state that export is a shared surface owned by 02w. The conformance check is a lock
per product over a shared markup helper rather than a row in a harness that does not exist yet (#664).

## ADR-W-052 — The CONTINUOUS LOOP: the operator tests while the session keeps fixing (2026-09-15)

**Status:** accepted, 2026-09-15 · **Amends:** [CLAUDE.md](../CLAUDE.md) standing rule 3
(triage-first) for sessions the operator explicitly puts into this mode · **Scope:** any product; born
in the analytic tree's 2026-09-15 session

**Requirements:** none (internal workflow). **Design:** none (internal).

**Context.** Standing rule 3 says a session in which the operator reports issues does the FULL triage
and **then stops**. Its stated reason is real: *"the operator raises several issues per testing pass;
immediate fixes force one-at-a-time reporting and overwrite each other."*

On 2026-09-15 the analytic tree ran three rounds back to back, and the operator was testing throughout.
The rule's failure mode showed up in a form it did not anticipate: **the session kept stopping to hand
over a new port.** Each fix sat on its own branch with its own dev server — 5311, 5312, 5313 — so every
item cost the operator a context switch, and twice they tested the right sentence on a build that did
not contain the fix. The rule was protecting them from clobbered fixes and charging them a tax in
interruptions instead.

Operator, 2026-09-15: *"we need to define a loop process here. you never stop fixing issues until we
have cleared the list … when there are things to test, you tell me and i test (you continue working) so
we have a continuous work and parallel testing and more issues will come in."*

**Decision.** In **loop mode**, entered only when the operator asks for it by name:

1. **The session does not stop after triage.** It files each report as an issue with a measured
   diagnosis — that half of rule 3 is untouched and is what keeps root-cause discipline — and then
   **keeps fixing**.
2. **ONE long-lived server, on `main`.** A dedicated worktree (`loop/serve`) is kept fast-forwarded to
   `origin/main`; each push pulls into it and Vite hot-reloads. **The operator's URL never changes**,
   and they are always looking at the newest green code. This is the change that makes the loop work —
   the interruptions were never about the fixing, they were about the ports.
3. **Gate per PUSH, not per item.** Each item pays `tsc` + build + the product lane; a push of one to
   three items pays `npm run test:full`, read from `reports/suite-verdict.json`
   ([ADR-W-033](#adr-w-033)). The full bar is not lowered; it is paid at the point where work becomes
   visible to the operator.
4. **Reports arriving mid-flight are triaged without losing the place** — measured, filed, and the
   current item continues.

**What still stops the session**, and the operator should want all three:

- **a decision only they can make** — the session asks and moves to another item rather than guessing;
- **two escalations in a row** ([ADR-W-028](#adr-w-028)) — two plans failing contact with the code says
  the QUEUE is going stale, and grinding through more is the loop pressure the escalation exit exists
  to relieve;
- **anything that would need a patch instead of a root fix.** Throughput pressure is exactly when that
  temptation appears, and it is the one thing the loop may not trade.

**Why this is not a weakening of rule 3.** The rule's purpose is that the operator's reports are not
lost and not overwritten. The loop serves that purpose *better*: every report becomes a filed issue
with a measurement before anything is built, and a stable server means the operator can keep testing
rather than waiting for a session to finish triaging. What it drops is the STOP, and the stop was
protecting against a problem — clobbered work-in-progress — that per-item branches and a merge-to-main
cadence already prevent.

**Recorded because a future session would do the opposite.** CLAUDE.md loads every session and says
"STOP". Without this ADR, a session reading it during a loop the operator had asked for would halt
mid-flight and the operator would have to re-establish the mode by hand.

---

## ADR-W-053 — The component and the locks call the SAME decision; the seam list is an assertion (#1132)

**Requirements:** none (internal). **Design:** [04-design](04-design.md) (the 2-D commit-seam table),
[04c](04c-design-analytic.md) (the analytic app layer).

**Operator, 2026-09-16, mid-round:** *"we should always address root cause and not symptoms"* — raised
when two items of round #1131 turned out to share one root.

### The rule

> **A decision with no exported seam gets REPRODUCED by its test, and the reproduction drifts from
> production silently.** So every commit seam names a decision module, and the component and the locks
> call the same function. A test that re-implements its subject can only agree with itself.

### The evidence it is drawn from

Two shipped, green features were dead in production, and no gate could see either:

- **#1102** — analytic's submit decision lived inline in `App.tsx`. `useAnalyticStore.ts` had NAMED
  `app/submit.ts` since V0 and the file did not exist, so #1063's lock reproduced the decision. The copy
  had no `created` arm; #1076 added one to the real path fifteen minutes later and the branch went dead
  for its entire class. Green throughout.
- **#1041** — ADR-510 moved the post-commit configuration search out of the commit seams into their
  callers and re-armed only the submit one. The ✎ edit seam kept a comment describing the connection.
  Its lock hand-rolls a test-local copy of the App closure **and** uses a sequence valid at seed 0, so it
  passes with or without the fix.

**The shared root is not a wrong line — it is that nothing enumerates the seams**, so a forgotten one and
a deliberately exempt one are indistinguishable. `replaceGroup`'s docblock had *already* recorded that it
is the seam that drifts (`PARITY CAVEAT`, `geoStore.ts:560`). The note was there and the move still missed
it. **Prose is not a mechanism.**

### The mechanism

`shell/__tests__/seam-registry.test.ts`, cross-product like `row-parity.test.ts`:

1. **Seed-resetting actions are EXTRACTED from each store and compared to a declared list.** A new seam,
   or an existing one that starts resetting the seed, fails the suite until someone decides in writing
   whether it needs the post-commit search. Each entry carries a status — `wired`, `exempt`, `gap`,
   `not-a-seam` — and everything but `wired` must carry a reason.
2. **A `gap` must name its open issue.** Gaps are allowed to exist; pretending otherwise only pressures
   people to mislabel one as exempt. What is forbidden is a gap with nowhere to read about it.
3. **Every `*/app/` decision module must be imported by at least one test.**

### What the mechanism does NOT do, stated so nobody over-trusts it

- **It cannot detect a test that reproduces its subject.** That is a judgement, not a pattern. What it
  removes are the conditions that make reproduction tempting: a decision that has a callable seam tends
  to get called.
- **Check 3 would not have caught #1102** — that module did not exist, and a file that is not there
  cannot be untested. Check 1 is what forces the module to exist; check 3 guards the next state, where a
  module exists and quietly grows a branch nothing calls. Recorded rather than oversold.
- **A first draft of the extractor missed `replaceGroup`**, which writes `patch.seed = 0` rather than
  `seed: 0` — it would have missed the very seam the file exists for. Both spellings are matched, and a
  case guards the extractor itself. A guard that misses its motivating case is worse than no guard,
  because it grants confidence it has not earned.

### What the inventory found on its first run

The registry's first pass discovered that **2-D has six seed-resetting actions, not the three #1041
documented** — and two of them are a real, previously unknown defect:

| action | status |
| --- | --- |
| `replaceGroup` (✎ edit) | wired — ADR-518 |
| `removeGroup` | exempt, measured |
| `remove` | exempt, same shape; own measurement owed (#1133) |
| **`toggle`** | **GAP — #1133** |
| **`setGroupEnabled`** | **GAP — #1133** |
| `clear`, initial state | not a seam |

**Re-enabling a disabled given ADDS a requirement back** — the same direction as a submit, and submits
have always searched — while deletion only ever relaxes. Measured stranded on «משולש ABC» · «גובה AD
במשולש ABC» · «AB = 10» · «AD = 7»: seed 0 invalid, seed 1 valid, nothing searches. That asymmetry is
exactly what an un-enumerated inventory hides: the two read as one "toggling" concern and behave as
opposites.

Filed as **#1133** rather than fixed, because the round's contract is its contract. **The registry ships
with those rows red-flagged rather than silently green** — a mechanism that surfaces a gap on its first
run and then names it is the mechanism working.

### Consequences

`shell/__tests__/seam-registry.test.ts` (19). `src3d/` still has **no `app/` layer at all** — 0 decision
modules behind an 1121-line component — which is the tree most exposed to this class; it is its own slice
and is NOT folded in here. The registry currently declares 2-D's store only; extending it to the sibling
stores is the natural next step, and each product's row set should be added with its measurements rather
than copied.

---

## ADR-W-054 — Unattended overnight rounds: ADR-W-012's Phase 2, opened with a hard boundary at the deploy

**Requirements:** none (internal). **Design:** none (internal) — the mechanism is the existing
`/fix-round` skill plus `/loop`; what is new is the authority to run it with nobody watching.

**Operator, 2026-09-16, late:** *"i want a loop to run over night forever and fix all issues with the
alaytical tool so i can test them in the morning. prepare a live document with a list of tests the i can
keep open and test. i will provide results in a separate session not to interfere with the code fixing
session."*

[ADR-W-012](#adr-w-012) deliberately deferred *scheduled, unattended* rounds and their landing policy,
and [ADR-W-028](#adr-w-028) restated that it *"remains open … unattended running is a separate risk
argument, since every round measured here had a human at the keyboard."* This ADR closes that question in
the affirmative, with the boundary the risk argument actually needs.

### What is now permitted without a human at the keyboard

- **Rounds run back to back, indefinitely**, each composed from the `auto-ok` queue by priority.
- **Bugs and debt land on `main`**, under the unchanged full gates: per-item ADR, lock, `tsc`, build, the
  product lane, and the batch `test:full` on the staging tip before a single push.
- **Features become PRs**, never merged.

### What an unattended round may NEVER do — the boundary that makes the rest safe

1. **It does not deploy.** A night's worth of unplayed changes is exactly what the play-and-approve gate
   exists to prevent, and a bad deploy is the one outcome nobody is awake to notice. `main` is the
   finish line until the operator has played.
2. **It does not merge a PR.** Unchanged from ADR-W-012.
3. **It does not invent a plan.** The escalation exit is what stands in for the missing human: a plan
   that fails contact with the code goes to `needs-operator` and the round moves on. The
   two-escalations-finalize rule ([ADR-W-028](#adr-w-028)) still ends a round, and the loop then opens
   the next one rather than grinding.
4. **It does not widen its own contract.** Work discovered mid-round is filed, never folded in — three
   times in round #1131 alone (#1133, #1134, and the #1108 escalation).

### The live document is part of the mechanism, not a nicety

The operator will read the results **in a different session**, so the handover cannot be this session's
chat. Each round republishes a single Artifact play sheet — numbered cases, the Hebrew lines, *look for*
and *before* per standing rule 5 — and the sheet stores the operator's per-case verdict in the artifact
database. A later session reads those verdicts directly with `read_db` instead of asking him to retype
them. *(This clause was written for unattended rounds only and was never carried into the skill, so no
round produced one. [ADR-W-068](#adr-w-068--every-fix-round-ends-with-a-published-html-report-and-play-sheet-1291-completes-adr-w-054) makes it universal — EVERY round publishes the report — and puts
it in the procedure as Step 5b.)*

That closes the loop ADR-W-012's Phase 1 left open: rounds could run, but their output still needed a
human to transcribe. The round issue remains the durable ledger; the sheet is the operator's surface onto
it.

### Why the risk argument is answered rather than waved away

The thing that made unattended running frightening was never the fixing — it was landing something
nobody looked at. With the deploy boundary in place, the worst an unattended night can do is put green,
gated, unplayed code on `main`, which is precisely what an attended round does, and `main` is not what
students use. The gates that protect `main` do not need a human; the judgement that protects
**production** does, and it keeps him.

---

## ADR-W-055 — The shared math renderer gains an EXPRESSION level under its value level (#1125)

**Requirements:** none (internal) — what changes is that a formula the tool already shows is legible as
mathematics. **Design:** [04-design](04-design.md) — `shell/mathExpr.ts` joins `shell/math.tsx`.

**Operator, playing PR #1116 T8/T9:** *"the equations are not full mathml (the sqrt is not on the whole
line and ratios are not shown nicely)"*. Two defects named, a third found by measuring.

**Root cause — a lane that emits EXPRESSIONS was pointed at a renderer whose grammar stops at VALUES.**
`shell/math.tsx` was built for stated magnitudes ([ADR-298](06-decisions.md#adr-298) / #77 / #40, the
`BC = 35/√32` case), and its grammar bottoms out at a literal number:

```
RADICAND := ( NUM [/ NUM] ) | NUM      RTERM := [NUM] √ RADICAND | NUM      VALUE := RTERM [/ RTERM]
```

The #1053 formula traces are arithmetic over sub-expressions — `3² + (-4)²`, `(3 - 0)² + (4 - 0)²`. None
is a `NUM`, so nothing matched, the `√` and `/` survived as glyphs, and the tokenizer fell through to its
innermost atoms, emitting **one `<math>` island per superscript** with plain text between. Measured:

| trace | `<math>` roots | `msqrt` | `mfrac` |
| --- | --- | --- | --- |
| `d(A, l1) = \|3·2 - 4·5 + 1\| / √(3² + (-4)²)` | 2 | 0 | 0 |
| `d = √((3 - 0)² + (4 - 0)²)` | 2 | 0 | 0 |
| `m = (4 - 0) / (3 - 0), …` | **`hasMath: false`** | 0 | 0 |

**Widening `NUM` is the patch, and was rejected:** it would still island, and still bottom out one level
down. The fix is the missing level — a recursive-descent parser whose operands are themselves
expressions, emitting one `<math>` per span, with `|…|` as `<mo>` fences.

**The SPAN boundaries are kept, and that is the load-bearing constraint.** `math.tsx` decides which parts
of a line are mathematical, and those boundaries are asserted: «BC = 35/√32» keeps `BC = ` as text,
«קשת AC + קשת BE» stays two arc islands, a lone number is never wrapped. Whole-line runs would be a
simpler story and would break every one of them, so `mathExpr.ts` is handed an already-identified span
and answers only *what MathML is it*.

Two guards make the new span safe, and both were added because measurement caught them failing:

- **It must CONTAIN a `√` or `/`.** Without that it swallowed neighbours it could not improve:
  «(x-3)^2+(y-4)^2=9» matched from the `+`, carried no radical, fell through to text and **dropped a
  superscript the corpus had always typeset**.
- **It may not begin or end on whitespace**, which had eaten the space in «BC = 35/√32».

`hasMath`'s `/` clause required a DIGIT either side, which is why the slope trace was never typeset at
all. A fraction bar between two bracketed sub-expressions is exactly as much a fraction as one between
two numbers.

**The subtlest bug, worth recording.** `|` is the one bracket whose opening and closing forms are the same
character, so the juxtaposition rule read the CLOSING bar of `|3·2 - 4·5 + 1|` as the start of another
factor and the whole parse failed — on the headline case. An `absDepth` counter settles it.

**A malformed span is kept verbatim.** Every level returns `null` on a shape it does not recognise. Four
products render through this file; a parse that silently dropped an operand would show a student a
formula that is not the one they were given.

**Verified across the blast radius**, as the issue required rather than assumed: the stated-magnitude
corpus is **byte-identical** before and after (diffed, not trusted), and the 2-D math corpus (22) plus the
analytic (1129), complex (1152) and 3-D (4632) lanes are green.

**Consequences.** New `shell/mathExpr.ts` and `shell/__tests__/issue-1125-expression-math.test.ts` (15).
This also corrects a claim in **#1117**, which says the trace is *"MathML, correct"* — it was plain glyphs
with islands. #1117's fix is still wanted, and could not have improved anything until this landed.

---

## ADR-W-056 — An ADR id is a reference, so no two decisions may claim one (#1140)

**Requirements:** none (internal). **Design:** none (internal) — a case in `docs-hygiene.test.ts`.

**Found by colliding.** On 2026-09-17 two sessions landed an `ADR-AG-072` within minutes of each other —
one for the locus lane (`5faa5e4d`, the other PC), one for the answer row (`fe52156b`, overnight round
#1135). **Both passed `test:docs` and both were pushed.** The duplicate surfaced only because the landing
session happened to `grep` the log's headers while reconciling external movement on `main`. That is luck,
not a gate.

**Why it matters more than tidiness.** An ADR id is a **reference**: commit messages, code comments,
`Requirements:`/`Design:` lines and the orientation files all cite them. Two decisions sharing one id
makes every citation ambiguous — and silently, because the prose around each citation still reads
correctly.

The numbering convention is *"take the next number after the tail"*. That is right, and **two concurrent
sessions cannot both obey it**. Exactly the class [ADR-W-053](#adr-w-053) names: a convention held up by
everyone remembering, with no mechanism. It stopped being hypothetical when [ADR-W-054](#adr-w-054)
authorised unattended overnight rounds — every round writes ADRs, another PC is active, and nobody is
awake to spot the next one.

**A DECLARATION is what may not repeat, and that distinction is measured, not assumed.** Matching every
`^#+ ADR-N` heading reports **31 duplicates, of which 28 are legitimate**: an amendment
(«ADR-050 Amendment 1 — …», «ADR-115 Am. — …») shares its parent's id *by design* — that is what an
amendment is — and a bare «## ADR-265» with no title is a section wrapper around the real heading
beneath it. A guard that fired on 28 correct entries would be switched off within a day. So a declaration
is an id followed **directly by its em-dash title**, and only those are counted.

**Three real collisions predate the guard** — `ADR-244`, `ADR-245`, `ADR-500`, all in the 2-D log and all
from long before it existed. They are **grandfathered, not renumbered**: these ids are cited from commits,
comments and other ADRs, and rewriting months-old decision history to satisfy a new test would break more
citations than it fixes. A companion case asserts the list **neither grows nor rots** — if one is ever
renumbered by hand, that case fails and the entry is deleted with it. A named, bounded, self-expiring
exception, the shape #1099 proved works.

**A numbering GAP is information, never a failure.** A skipped number is usually a withdrawn decision and
entirely legitimate; a repeated one never is. The gap case asserts only that gaps are computable, and says
in its own docblock that it exists to stop a future reader tightening it into a contiguity check — which
would make a withdrawn ADR unrenumberable.

**The collision rule needs no coordination:** whichever declaration landed **second** renumbers, and
records its old number in its body, because the commit that introduced it is already pushed.

**Verified by firing.** A deliberately duplicated id turns both new cases red; removed, `test:docs` is
green at 678.

## ADR-W-057 — Which product a change is scoped to is a property of the CHANGE, not of the lane that asks (#1155)

**Requirements:** none (internal). **Design:** none (internal) — `scripts/check-sibling-safety.mjs`.

**Amends [ADR-W-036](#adr-w-036)**, which made the viewpoint a parameter so every lane could run the
guard. That was right about the lanes and wrong about the parameter: it let the LANE supply the
viewpoint, and a lane has no opinion about what a change is scoped to.

**Found by trying to merge green work.** PRs #1142 and #1143 were green on the analytic lane and red on
the 2-D, 3-D and complex lanes, with **every test in those lanes passing**. So was `main` itself at
`8525c378` (run 35151806213) — a batch push that landed and left three lanes red, and nobody noticed,
because the round read the analytic lane it had run locally.

The refusal in all three:

```
  REFUSED: 4 file(s) belonging to a shipped sibling product were changed:
      src-analytic/parser/parseAnalytic.ts
      ...
```

`src-analytic/` is not a sibling of an analytic change. It is the tree the change is **for**.

**The root cause is a question asked of the wrong thing.** The guard took its *viewpoint* — which tree
this change may touch — from `--product`, and [ci.yml](../.github/workflows/ci.yml) fills `--product` in
**from the lane**: the 2-D job passes `2d`, the 3-D job `3d`, and so on. A lane is not a claim about the
change. "Which product is this change scoped to" has **one** answer; the guard asked it four times and
got four. For any change touching exactly one tree P, the P lane passed and the other three refused —
so at most one lane could be right, and three were wrong *by construction*.

**Why it stayed hidden for sixteen days** ([ADR-W-036](#adr-w-036) made the viewpoint a parameter on 2026-09-01).
A lane runs only when the `changes` filter selects it, and a single-product change with **no shared
file** never wakes the other three, so the wrong answers were never computed. The trigger is the very
ordinary shape *one product tree + any shared surface*:

| PR | files | lanes woken | result |
| --- | --- | --- | --- |
| #1146 | `src-analytic/` + docs | analytic only | CLEAN |
| #1142, #1143 | `src-analytic/` + `server/__tests__/docs-hygiene.test.ts` | all four | three refuse |

It is not analytic-specific: a 2-D fix touching `src/` + `shell/` fails the 3-D and complex lanes
identically. The guard has been wrong for every product since the day it became per-lane.

**The decision.** The diff refusal is computed from the change alone and reads the same in every lane:

- `treesTouched(files)` — the set of product trees the change edits. **It takes no product argument**,
  which is the fix expressed in a signature rather than in a comment.
- **0 or 1 tree is not a cross-product edit**, and no lane may refuse it.
- **2 or more is one**, and every lane refuses it alike unless an `Allow-sibling-edit:` trailer says why
  ([ADR-W-039](#adr-w-039) / #895) — and the refusal now names the trees, instead of calling files
  "sibling" relative to whoever happened to ask.
- `--product` keeps its *other* job, which was always legitimate: naming the lane, so the three builds
  that run are the ones this job has not already proved. The header comment says that now.

**Nothing in [ADR-W-017](#adr-w-017)'s guarantee moves, and that was checked rather than asserted.** The
operator's requirement is *"we never, never, never harm the other tools that are running."* A change
that touches one tree did not harm a sibling by editing it — it did not edit one. Harm reaching a
sibling through a **shared** surface was never the diff check's half to catch; the sibling builds (which
still run in every lane, unchanged) and `npm run test:full` are. What the refusal has always really
meant is *"two trees in one change with no stated reason"*, and that is preserved exactly. Only the
lane-relativity is gone.

**The lock is the property, not the four instances.** `crossProductGroups` returns `null` for a
single-tree change for **every** id in `PRODUCTS`, so product N+1 is covered the day it is registered —
the same reason the function takes no viewpoint. PR #1142's file list is pinned verbatim as the reported
case, and a genuine two-tree edit is asserted still refused, with `shell/` correctly *excluded* from the
refusal because shared surface is the builds' business.

**The decision is an exported seam, not an `if` in `main()`** ([ADR-W-053](#adr-w-053)). A test that
recomputed "two or more trees" would keep passing after `main()` drifted back to asking
`classifyChange().sibling`; that is precisely the drift ADR-W-053 names. So `crossProductGroups` holds
the decision, `main()` calls it, and a case asserts that `main()` branches on the seam and never on a
lane-relative bucket.

**What must NOT be done, recorded because it was the tempting exit.** Adding `Allow-sibling-edit:` to
#1142/#1143 would have turned both green in minutes. The hatch exists to record *why a change
legitimately edits a sibling*; those changes edit no sibling at all. It would have written a false
sentence into the permanent record and left the gate broken for everyone after — and a gate people learn
to wave through is worse than no gate. Same for an admin merge. The gate was wrong, so the gate was
fixed.

## ADR-W-058 — Which deploy steps to run is a MEASUREMENT, not a question about which files changed (#1130)

**Requirements:** none (internal — an operating procedure, not a product promise). **Design:** [RUNBOOK](RUNBOOK.md) § *Standard deploy*. **Product:** workspace.

### The rule was not fragile; it was UNSOUND

The RUNBOOK decided the proxy step by asking *"did `server/` change?"* — **No** → static-only, do not restart the proxy. It shipped stale server code **twice**, and the second occurrence is what filed this.

The reason it could never work, measured through esbuild's own metafile on the real `build:proxy` options:

```
26 first-party modules go into dist-server/proxy.mjs
20 of them live OUTSIDE server/
   src/parser/catalog.ts        <- the 2-D catalog IS the LLM's vocabulary
   src3d/parser/catalog3.ts     <- and the 3-D one
   src-complex/**, src-analytic/**
```

So editing a catalog row — a change nobody would call a *server* change — makes the deployed proxy stale, and the rule answers "no". The failure mode is invisible by construction: **the stale artifact keeps working**, so nothing surfaces until someone diffs it by hand. A convention that depends on remembering is not a check, which is the same class as the per-product clear-all list #1107 fixed for the fourth time.

This round demonstrated it live: **no `server/` file was touched**, and the preflight measured the built proxy as DIFFERING from production — because items 1–3 edited `src-analytic/`.

### The question becomes a measurement

`scripts/deploy-preflight.mjs` builds the proxy (~30 ms, so it is unconditional) and compares artifacts against the live ones:

| artifact | compared by |
| --- | --- |
| `dist-server/proxy.mjs` | `sha256` local vs `sha256sum` over ssh |
| each product bundle | the **content-hashed filename** Vite emits, read from the local page and from the served `index.html` |

Vite's asset names are content hashes, so comparing the referenced bundle IS a content comparison and needs no hashing of its own.

It **reads only** — no writes, no restart, no deploy — and **exits non-zero whenever anything differs**. Differing is the normal pre-deploy state, so that exit code is not a pass/fail verdict; it is there so the verdict cannot be skimmed past on the way to the scp commands. Evidence produced is not evidence read.

An artifact that is NOT BUILT, or a host that cannot be reached, is reported as such and also exits non-zero: *"nothing measured as stale"* must never be readable as *"everything is current"*.

### The lock asserts the OLD RULE IS UNSOUND

`server/__tests__/deploy-preflight.test.ts` asks esbuild what goes into the bundle, **through the same `proxyBuildOptions` the real build uses** — `server/build.mjs` now exports them, so the preflight, the build and the lock have one definition instead of three descriptions. Describing the import graph a second time is exactly how the RUNBOOK sentence drifted from the build it described.

It asserts that the bundle's inputs outside `server/` are a MAJORITY, not a count, so adding a module does not fail a test about the rule. And it asserts the retired rule is not being INSTRUCTED again — blockquotes and headings exempt, because the RUNBOOK must be free to explain what it replaced and why.

### Consequences

`scripts/deploy-preflight.mjs` (new) · `npm run deploy:preflight` · `server/build.mjs` exports `proxyBuildOptions`/`proxyInputs` and only builds when RUN, not when imported · RUNBOOK § *Standard deploy* rewritten around the preflight, with the old rule recorded as retired rather than deleted. `server/__tests__/deploy-preflight.test.ts` (4).

## ADR-W-059 — A test file that cannot fail is not a test, and the suite now says so (#1044)

**Requirements:** none (internal — suite hygiene, not a product promise). **Design:** [08](08-testing-strategy.md) — the suite's own guards. **Product:** workspace.

### The reported instance

`src/__tests__/_scratch556b.test.ts` — 14 lines, **zero assertions**, six replay sweeps of `console.log`. It ran on every `test:full`, on every machine, and **could not fail**: it reported green forever whatever the engine did. Left behind as a scratch diagnostic and never removed.

### Deleting it is the patch shape, and the class is live

The `/decisions` pass of 2026-09-17 found two more (`tmp-probe.test.ts`, `tmp-probe2.test.ts`) sitting untracked in `src-analytic/__tests__/` the same morning. So the deletion ships with a guard — and the guard immediately earned its place by finding a **second tracked instance the issue did not know about**: `src3d/__tests__/probe578c.test.ts`, the 3-D twin of the reported file, thirteen lines of `console.log` over five spellings of «גובה».

Both are deleted. Nothing is lost, because neither asserted anything.

### The guard, and the heuristic stated rather than assumed

`server/__tests__/suite-hygiene.test.ts` walks every tree that carries tests and fails the suite for any `*.test.ts(x)` that contains no assertion. It **discovers** files rather than carrying a list, which is the difference between a guard and a snapshot.

"Contains no assertion" is judged from the SOURCE, because vitest exposes no per-file assertion count this can read. A file counts as asserting when it — **or any local module it imports, one hop** — contains one of the listed forms. The import hop is what keeps a file asserting through a shared harness (`scenarios-harness.ts` is this tree's own example) from being flagged.

It is a heuristic and the ADR says so. Its failure direction is a **false alarm** on a file asserting in some form not yet listed, fixed by adding the form or naming a waiver. The expensive direction — a file that cannot fail passing silently — is the one it closes.

### `.only` is the same class from the other end

`.only` leaves a file's siblings unrun while the suite still reports green. CLAUDE.md's readiness gate already forbids *"skipped or `.only` specs hiding gaps"*; this is the mechanical half of a promise that until now depended on someone remembering. Added in the same guard because it is the same question: **can this file still fail?**

### Waivers are NAMED, because a guard with no escape hatch gets disabled

Two files are legitimately assertion-free and are waived with reasons: `triageDump.test.ts` and `triageHtml.test.ts` — env-gated operator TOOLS, skipped in the normal suite, whose deliverable is a written report. Asserting on a report they exist to produce would be asserting on their own input. A fourth case in the guard requires every waiver to carry a reason, so an entry cannot be added as a bare silencer.

### The guard was SEEN to fail

Run against the tree **before** the deletion, it failed naming exactly `_scratch556b.test.ts` and nothing else; after the deletion it failed again naming `probe578c.test.ts` and the two tools. A guard that has never been observed failing is not known to work, and this one was checked in both directions before it was trusted.

### Consequences

`server/__tests__/suite-hygiene.test.ts` (new, 4 cases — it lives there for the `isolation.test.ts` reason: it runs in EVERY per-product lane and belongs to no product). `_scratch556b.test.ts` and `probe578c.test.ts` deleted. Two named waivers.

## ADR-W-060 — A math span is bracket-balanced; a bracket whose partner is outside it is text (#1208)

**Requirements:** [19](19-…)/[02c](02c-requirements-analytic.md) — mathematics is typeset wherever it is shown; no new row. **Design:** the shared renderer's span boundaries. **Product:** workspace (`shell/`), reported in analytic. **LADDER stage:** display only.

**Operator, 2026-09-18, playing T8:** *"the x of point P is not shown correctly. the y of point P is the right presentation"* — on a row reading `P = (14/3, 31/3)` with the y stacked and the x flat.

### It was never about x versus y

Measured through the real `mathHtml`, counting `<mfrac>`:

```
P = (14/3, 31/3)  ->  1     (14/3   ->  0      P = (14/3, 5)  ->  0
14/3              ->  1     14/3)   ->  1      P = (5, 31/3)  ->  1
```

**An opening bracket before a fraction kills it**, and in an ordered pair only the first coordinate has one.

### Root cause — a correct refusal, upstream of a wrong span

`EXPR` carries no comma deliberately (#1125: «m = (4-0)/(3-0), y - 0 = …» is two statements, not one expression). But a span that BEGINS at a bracket and ENDS at that comma holds an opener whose partner is outside it, so `exprML` refuses `(14/3` — and refusing is right: *"a renderer that half-parses a formula would show the student a formula that is not the one they were given."*

The defect is that the bracket was in the span at all. It belongs to the sentence, not to the expression.

So an unmatched bracket at either EDGE is peeled off and rendered as the text it is, and what remains is offered to `exprML` unchanged. Peeled one layer at a time and only at the edges: an unmatched bracket in the MIDDLE means the text really is malformed, `exprML` still refuses it, and the never-half-parse guarantee is untouched.

### Blast radius

`shell/math.tsx` is shared by 2-D, 3-D, complex and analytic, and every one of them writes ordered pairs. The full suite is the gate, not a product lane. `shell/__tests__/bracketed-fraction.test.ts` (6) — **proven to fail without the fix**: making the peel the identity turns 2 of its 6 red.

## ADR-W-061 — The preflight may not say MATCHES about a build it cannot vouch for (#1213, amends ADR-W-058)

**Requirements:** none (internal — an operating procedure). **Design:** [RUNBOOK](RUNBOOK.md) § *Standard deploy*. **Product:** workspace.

Found by running **T12 of round #1200's own play sheet**, against the preflight shipped that same day.

### It reported MATCHES for four artifacts that did not match

```
proxy (dist-server/proxy.mjs)    DIFFERS — push required
2-D bundle (dist)                MATCHES live      ← false
3-D / complex / analytic         MATCHES live      ← false
```

`main` carried round #1200's six items and the #1201 P1, none of it deployed. Measured:

```
dist/index.html built     2026-09-17 22:51        (the day before)
sources newer than it     src/app/roleReadings.ts, submitPipeline.ts, editPipeline.ts, …
after `npm run build`     assets/index-Dk2TolO8.js  →  assets/index-B3YiZORf.js
```

The local bundle matched the live one because **both were stale**. The comparison was true and meaningless.

### Root cause — the word that carried the guarantee was the one the implementation dropped

The proxy is rebuilt on every run, so its answer is always against current source. The static bundles were read off disk as found. #1130's plan said the live hash is compared against the **freshly built** one.

This is ADR-W-058's own class, reintroduced inside the tool written to retire it: **a check whose answer depends on someone having remembered to do something first is not a check.** The RUNBOOK's step 0 builds everything before the preflight is consulted, and the preflight trusted that — which is exactly the trust ADR-W-058 says a deploy may not extend.

### The fix, and why staleness rather than an unconditional rebuild

A product whose `dist` is older than any source it is built from is reported **`STALE BUILD`**, never `MATCHES`, and exits non-zero — the same discipline already applied to NOT BUILT and to an unreachable host: *"nothing measured as stale"* must never be readable as *"everything is current"*.

Not an unconditional rebuild: four builds are real time on a script that should stay cheap enough to run casually, step 0 already builds, and a guard on the **forgotten** build is what was actually missing. A future session may decide to build instead; what may not change is that MATCHES cannot be printed without evidence.

Each product now declares the trees it is built from, and **`shell/` is in all four** — which is why one edit there stales every bundle at once, and why a product that forgot to declare it would go quietly unchecked. That is asserted.

### Tested, which needed a split

`scripts/preflight-targets.mjs` holds the targets and the two decisions, because importing `deploy-preflight.mjs` runs a preflight — including the ssh reads — which a test may not do. `server/__tests__/preflight-staleness.test.ts` (6) calls the real decisions rather than restating them, and covers the boundary that matters: a test file is not a source, and NOT BUILT is not STALE (they send the operator to two different actions).

Demonstrated end to end: a freshly built bundle compares normally; touching one analytic source flips analytic to STALE; touching one `shell/` source flips it too.

## ADR-W-062 — The longest match that RENDERS wins, not the first one that matches (#1217)

**Requirements:** [19](19-analytic-geometry-tool.md)/[02c](02c-requirements-analytic.md) — mathematics is typeset wherever it is shown; no new row. **Design:** the shared renderer's tokenizer precedence. **Product:** workspace (`shell/`), reported in analytic, fixed for all four.

**Operator, 2026-09-19, playing T21:** *"the mathml on the row below textbox and the input rows are not working. This rule of using mathml is for all shapes so why does it work on circle but not elipeses? it is also the same rule for all tools (2d/3d/complex)"*.

### The circle was not working either

`█` marks a rendered island; everything else came out as plain text.

```
x/9                       frac 1  sup 0   ->  █                  a plain fraction always worked
x^2/9                     frac 0  sup 1   ->  █/9                adding a power broke it
(x^2)/9                   frac 1  sup 1   ->  █                  bracketing it brought it back

x^2/9+y^2/16=1            frac 0  sup 1   ->  █/9+y^2/16=1       the ellipse he reported
מעגל (x-3)^2+(y-5)^2=25   frac 0  sup 2   ->  מעגל █+█=25        the circle he thought worked
```

The circle's leftovers are `+` and `=25` — an operator and a number, unremarkable as plain text. The ellipse's leftover is `/9+`, a fraction bar that visibly is not a fraction. One defect, two appearances, which is exactly why it read as ellipse-specific.

### Root cause — a tie, decided by declaration order

Every alternative lived in one alternation, and JS takes the first BRANCH that matches at the earliest position:

```js
const TOKEN = new RegExp(`(${ARC})|(${SUB})|(${SUP})|(${VALUE})|(${EXPR})`, 'gu');
```

At index 0 of `x^2/9`, `SUP` matches `x^2` and `EXPR` matches `x^2/9`. `SUP` is declared first, so it won and consumed the numerator — after which the `/9` had nothing on its left to be a fraction with.

The third measured line is the proof this is precedence and not a missing capability: `(x^2)/9` renders correctly because the brackets make `SUP` fail at index 0, and `exprML` then composes the power inside the fraction perfectly well. **The renderer could always do this.**

The old comment — *"ORDER IS LOAD-BEARING. `SUP` precedes `EXPR` so `(x-3)^2` keeps rendering as the superscript island the corpus asserts"* — was sound and is still true. What it did not anticipate was a power that is **part of a larger expression** rather than a standalone island.

### The fix, and what still protects the old behaviour

The alternatives become sticky regexes tried at each position; the **longest match that actually renders** wins, with the declared order kept only as the tie-break. `tokenML` returns `null` when an alternative cannot render the text it matched, which is what makes the change safe in one direction: a candidate that declines is passed over for a shorter one, so this can never render *less* than before.

The protection is not the ordering, and never was — it is `EXPR`'s own lookahead, which asserts a `√` or a `/` inside the span. Neither `(x-3)^2+(y-4)^2=9` nor `y^2 = 54x` contains one, so `EXPR` does not match there at all and the corpus's superscript islands are byte-identical. Those are the first assertions in the lock, not an afterthought.

### A red test that was the gate working

The first attempt also advanced **one character** when nothing rendered, instead of consuming the failed span. It fixed `F(27/2, 0)` and turned `issue-1125-expression-math.test.ts` red on `|3 - 2 / 4`.

The test was right. Stepping over a malformed delimiter and typesetting the remainder shows `2/4` as a fraction beside a stray unmatched bar — a formula the student was never given, which is the whole class #1125 exists to forbid. So **a refusal consumes its entire span**, deliberately, and that is now written down where the next session will read it.

The cost is accepted and named: `F(27/2, 0)` matches `EXPR` as `F(27/2`, an opener whose partner sits past the comma, so `exprML` refuses and the good `27/2` goes down with it. That is a **span-boundary artefact**, not malformed input — the distinction ADR-W-060 already drew for brackets at a span's edges — which makes it a different fix and its own issue (#1229), not something to smuggle in by weakening an honesty lock.

### Blast radius

`shell/math.tsx` is shared by 2-D, 3-D, complex and analytic, so the full suite is the gate rather than a product lane. `shell/__tests__/issue-1217-longest-match.test.ts` (8) leads with the regression guards and ends with #1208 and #1125 intact; the fixed cases sit in between.

It also repairs a row this workspace shipped hours earlier: #1212's ellipse equation `x²/16 + y²/9 = 1` composes with the `²` character, which `SUP` matched as readily as `^2`, so the panel row that issue added was broken from the moment it landed.

## ADR-W-063 — The leading peel takes whatever sits before the unmatched bracket (#1229)

**Requirements:** [19](19-analytic-geometry-tool.md)/[02c](02c-requirements-analytic.md) — mathematics is typeset wherever it is shown; no new row. **Design:** the shared renderer's span boundaries. **LADDER stage:** presentation only — `shell/math.tsx`, no product code. **Extends** [ADR-W-060](#adr-w-060) (#1208).

Split out of #1217 rather than fixed inside it, and the reason is the whole decision.

### The symptom

```
F(27/2, 0), x = -27/2   ->   the trailing fraction stacks; the bracketed one stays flat
```

It is the parabola's folded detail from #1212, so it is on screen today, in all four products — `shell/` is shared by construction.

### Cause — a span boundary, not malformed input

`EXPR` carries no comma on purpose (#1125: «m = (4-0)/(3-0), y - 0 = …» is two statements). So the span here is `F(27/2` — an opening bracket whose partner sits past the boundary, with a **non-bracket prefix in front of it**. `exprML` refuses it, correctly, and the perfectly good `27/2` goes down with it.

ADR-W-060's `peelBrackets` already handles exactly this shape — *"an unmatched bracket at either EDGE is peeled off and rendered as the text it is"* — but its loop was written as

```ts
while (core.startsWith('(') && unmatched(core, '(', ')') > 0)
```

so it fired only when the span BEGAN with the bracket. Here it begins with `F`, and nothing peeled.

### The decision

The leading peel takes the run **up to and including** the unmatched `(`, rather than requiring the span to start with it. The `esc(lead) + ml + esc(tail)` assembly is unchanged.

**The loop is still driven by bracket DEPTH**, and that is what keeps ADR-W-060's line intact:

| | `\|3 - 2 / 4` | `F(27/2, 0)` |
| --- | --- | --- |
| the imbalance is | in the student's own text | created by the span boundary |
| bracket depth | 0 — the loop never runs | +1 — the loop peels the prefix |
| correct behaviour | keep it all as text | peel the prefix, render the rest |

### The falsified alternative, recorded so it is not re-tried

The obvious repair — *when a span fails to render, advance one character and look again* — was tried in #1217 and **turned `issue-1125-expression-math.test.ts` red on `|3 - 2 / 4`**. That bar is unmatched in the student's own text, and stepping over it typesets `2/4` beside a stray `|`: a formula the student was never given. The lock was right, and #1217 now records that a refusal consumes its whole span deliberately.

A depth-driven peel cannot make that mistake, because a balanced span has nothing to peel.

### Measured

| span | before | after |
| --- | ---: | ---: |
| `F(27/2, 0), x = -27/2` | 1 fraction | **2** |
| `F(27/2` | 0 | **1** |
| `A(1/2, 3/4)` | 1 | **2** |
| `\|3 - 2 / 4` | 0 | 0 |
| `√(3 + ` | 0 | 0 |
| `(4 - 0) / (3 - 0` | 0 | 0 |
| `P = (14/3, 31/3)` | 2 | 2 |
| `m = (4-0)/(3-0), y - 0 = 2x` | 1 | 1 |

`A(1/2, 3/4)` was not in the report and is the same class — a named ordered pair — which is the sign the fix is at the right altitude.

### The lock

The three refusal rows are the ones that matter, and they are asserted alongside the three sibling suites (#1125, #1208, #1217), all of which stay green. Verified to bite: 3 of the 9 assertions fail against pristine `shell/math.tsx`.

### Consequences

`shell/math.tsx` — `peelBrackets`'s leading loop, four lines.

`issue-1229-prefixed-bracket.test.ts` (9). Analytic and complex lanes green (both carry `shell/`).

## ADR-W-064 — A fix session RE-MEASURES the issue before it reads the plan, and a divergence is the expected case (#1252)

**Requirements:** none (process). **Design:** [docs/17 §5 step 0](17-design-rules.md) — the protocol; [docs/22 §3](22-workflow.md) — the bug route; the `fix-round` skill, Step 2. **Operator, 2026-09-20:** *"we can continue the loop approach but we should add something in your instructions that acknowledges that diagnosis needs to re-run every time - i think you do this today anyway but just document it so you dont panic when something is different between diagnosis and fix time."*

### The observation that prompted it, which is the operator's

Reporting the overnight run [#1252](https://github.com/dcodish/geo_builder/issues/1252), I presented its five escalations as evidence that *the queue's plans are being written without measuring*. That is true of some of them. The operator's reply was sharper: **the time between triage and fix is itself enough to change the diagnosis.** It is, and separating the two causes matters because they have different remedies.

### Measured

```
commits/day, 13–20 Sep:  ~35        of which ADR-bearing:  ~20
```

An issue four days old has had ~130 commits land under it; #999, filed seven days before it was picked up, ~250.

Sorting the run's own items by which cause applied:

| | issue | what the issue said | what the tip said |
| --- | --- | --- | --- |
| **stale** | #1128 | *"no «מרחק» sentence parses at all"* | three did, since #1151 — and its part (b) had landed via #1048 |
| **stale** | #1216 | «נתון מעגל 1» → `bad-equation` | `not-handled` — changed four hours earlier the same night by #1246 |
| **stale** | #1129 | `\|…\|`, `d_{}`, `x_A` blocked on grammar | five of six unblocked; two by this same run |
| **stale** | #1198 | a change request against an unmerged PR | that PR merged the day before |
| **wrong** | #1202 | the cause is `crossings.ts:122` | those objects are a different kind and never reach that line |
| **wrong** | #999 | narrow `dryRunOutcome`'s count arm | that arm is not what fires |
| **wrong** | #1227 | *"the count must come from #1083's existing dedup"* | that dedup keeps all four noise members |
| **wrong** | #1222/#1240 | a spelling gap | needs a name-minting seam that exists nowhere |

**All four STALE items still built and landed.** All four WRONG items escalated. That is the finding: the two look identical at the moment of discovery and are nothing alike.

### The rule

Re-measure at pickup, **before** reading the fix plan, and classify what comes back:

| what you find | what to do |
| --- | --- |
| the reported case now passes | close the issue with the evidence — do **not** build |
| one symptom of several is gone | correct the record in the issue and the ADR; build the rest |
| a named dependency has landed | re-scope, then build |
| the cause the plan names is not what fires | escalate (docs/17 §8) |

**Only the last row is a signal about triage quality.** The first three are the ordinary cost of a fast trunk, and the operator's word for the right posture is the operative one: *don't panic*. Writing them up as "deviations from plan" — which this run did — overstates them and buries the row that matters.

### Two consequences that are not obvious

**Re-measure per item, not once per round.** A long round invalidates its own queue: #1246 landed at ~00:30 and changed #1216's symptom by 01:15; #1128 landed and unblocked #1129's chips an hour later. Composing a batch up front and trusting it for eight hours would have gone stale inside the run.

**Some open issues are already fixed and nobody knows.** #1216 had one of its three reported symptoms silently closed under it. The `log-triage` agent re-runs its candidates against current code for exactly this reason; nothing does that for operator-reported issues. A periodic sweep — re-run the reported utterance, close or amend — is cheap and is not yet anybody's job.

### What this does NOT excuse

The four WRONG diagnoses were wrong when written, and would be wrong again in the next plan written the same way: each named a cause read off the code, in a declarative sentence, without running the case. §1's rule — *a root cause read off the code is a hypothesis* — applies to an issue body as much as to a session's first idea.

The counter-example is worth recording, because it shows the distinction is about honesty rather than certainty: **#1182's plan was also a guess and was fine**, because it said so — *"Hypothesis, not yet measured … start by printing `solveLM`'s start point and iterate count at seed 0."* Measured, it was confirmed, and the measurement then ruled out the cheaper fix. A plan that labels its guess produces a fix session that checks; a plan that states the same guess as fact produces one that builds on it.

Hence the second half of docs/17 §5 step 0: *a plan that says "not measured past the above" is a hypothesis however confidently it is phrased.* Three of the four wrong plans said exactly that, and carried `auto-ok` anyway.

### Consequences

`docs/17-design-rules.md` §5 (a new step 0 — this is the file CLAUDE.md sends you to before fixing any reported bug, so it is the load-bearing home), `docs/22-workflow.md` §3 (the bug route's gap between reporting and fixing), `.claude/skills/fix-round/SKILL.md` Step 2 (where it fires for an unattended run).

## ADR-W-065 — An LLM-normalised line carries NO marker in the UI; the usage log is the channel (#1283, #1243)

**Requirements:** none — the student-facing promise is unchanged. **Design:** the LLM seam in each product's submit path (`src-analytic/App.tsx` `tryFallback`, and its 2-D/3-D twins) and the usage-event sink in `server/`. **Operator, 2026-09-20:** *"no need for an llm mark - we have that in the logs and user couldnt care less"*

### What was asked, and why

Triaging [#1283](https://github.com/dcodish/geo_builder/issues/1283) the operator reported a line he believed had escalated. It had not. What made him unsure is structural: the fallback re-enters `decideSubmit` and records the normalised line, so its chip is indistinguishable from a parser-handled one — a spinner during the call, nothing after. I asked whether a line should carry a visible "the model read this for you" marker.

### The ruling

**No.** Two reasons, and the second is the load-bearing one:

1. **The student does not care.** Which internal lane read their sentence is not a fact about their figure. A provenance badge is the tool talking about itself.
2. **Provenance already has a home — the usage log.** Escalation is a *development* signal, consumed by `/log-triage` and the admin dashboard, not a student-facing one. Surfacing it twice would put a debugging concern in the student's reading path.

This is deliberately NOT an honesty-invariant case. The invariants bind what the student *stated* (no given silently dropped, everything stated visible on the figure). They say nothing about which component parsed the sentence, and the LLM's output re-enters the same `decideSubmit` gates as any parser line — so an escalated line is held to the identical standard. There is no honesty gap to close.

### The consequence, which is the reason this ADR exists

If the log is the only channel, **a product without a usage log has no channel at all.** [#1243](https://github.com/dcodish/geo_builder/issues/1243) records that analytic and complex emit no usage events and the proxy logs only startup — so for exactly the tool this question arose in, escalation is currently invisible everywhere. That reprices #1243 from polish to the single point of observability for the whole LLM seam in two of four products.

**So this ruling is conditional on #1243 being closed.** Declining the UI marker is correct; declining it *while* two products log nothing leaves a blind spot the operator has to discover by doubting a working line, which is what happened here.

## ADR-W-066 — TWO NAMED POINTS ARE NEVER DRAWN AT THE SAME PLACE (#1254, #1274, #1273)

**Status:** accepted, 2026-09-20; **all three members built** — 2-D's after the operator ruled on the collision below · **Operator ruling**, given playing round #1252's T18, extended by hand, and settled a second time the same day · round #1280
**Products:** analytic ([ADR-AG-125](06c-decisions-analytic.md#adr-ag-125)), 3-D (already: ADR-3D-183), 2-D ([ADR-531](06-decisions.md#adr-531), #1274 — built after the ruling below)
**Requirements:** [02](02-requirements.md) FR-XP-1 (2-D) and [02c](02c-requirements-analytic.md) R60 (analytic); 3-D's shipped with ADR-3D-183 · **Design:** [04](04-design.md) and [04c](04c-design-analytic.md). This ADR states the RULE the trees share; it adds no promise of its own.

**The ruling, verbatim.** *"P falls on B. why dont we reject it in this case? … if P and B must be on the same location, like in this case, it should be refused. The only case where P and B can fall [together] is if one of them has a degree of freedom and I would just press «show a different config» and would see a different config. … even if they do fall on the same point by chance, but not necessarily because there is a degree of freedom, the system should not show them on top of each other. It should automatically look for a different config and show them differently. So this is otherwise very confusing to show two points on the same location."*

And, asked whether it was analytic-only: *"the 2d and 3d tools should follow the same logic about points being on the same location."*

**Stated once, for all three trees:**

> **Two distinct named points are never drawn at the same place. If some configuration separates them, show that one. If none does, the statement is refused.**

**What each tree already did, measured before building anything:**

| | a NEW letter named where a point already is | two EXISTING points driven together by the givens |
| --- | --- | --- |
| **3-D** | refused — `point-coincides`, affirming the geometry (ADR-3D-183, #769, 30 Aug) | — |
| **2-D** | **minted**, notice only → **refused** (ADR-531, 20 Sep) | notice (ADR-123), and a separating configuration already preferred first (ADR-486, #942) — unchanged |
| **analytic** | structural case refused (#1175); positional case minted | nothing |

So the ruling's *display* half was already 2-D's behaviour and its *naming* half was already 3-D's. The missing cell in **analytic** is built here (ADR-AG-125). The display half for analytic — a configuration-search preference — is [#1273](https://github.com/dcodish/geo_builder/issues/1273), deliberately NOT in this round: it is a different mechanism and wants a clean run, and 2-D's `firstSatisfyingSeed` ranking is the shape to port rather than a second invention.

**THE DISTINCTION THAT MUST SURVIVE, and it is not "refuse every coincidence".** Two situations look alike:

1. **A new point is NAMED at an occupied position** — «D נקודת המפגש של AB עם BC» where the two lines share B. The geometry is right and only the NAME is wrong: there is no new point to make. → **Refuse, affirming the crossing and naming the holder.**
2. **Two points that already exist are driven together by the student's own givens** — an inscribed square's seating (#942), a point landing on a circle's centre (ADR-123's own example). Nothing is misnamed; the figure is what the student stated. → **ADR-123's notice stands**, after the search has tried to avoid it. This half is untouched in every tree, and four 2-D locks assert it.

### 2-D's member collided with a shipped ruling, and the operator settled it

The 2-D refusal was written, and it turned the 2-D lane red: **13 tests across 9 files**. Nine of them are one figure — [#944](https://github.com/dcodish/geo_builder/issues/944) / [ADR-489](06-decisions.md#adr-489), 2026-09-08 — and that figure is **case 1 above**, not case 2:

```
משולש ABC
D = חיתוך AB ו-BC
```

#944 was the operator reporting that the tool drew this correctly and flagged it amber anyway. The ruling that shipped was that the crossing of two carriers sharing a vertex *"is structurally exact … the correct and only answer"*: `D` lands on `B`, the canvas writes «B=D», a blue notice says so, and `intersectionsWithinSegments` gained a **structural exemption** for exactly this shape. Its lock asserts, positively, that `D` IS minted at `B`. Three further 2-D locks use the same sentence as scaffolding for #943's refusal wording, and `shadow-matrix`'s **hard gate** — the one `vitest -u` cannot absorb — records a catalog-wide shadow set that the parser change moves.

So the taxonomy above was not yet a decision procedure for 2-D: the same sentence is case 1 by its letters and, by an accepted ADR the operator validated twelve days earlier, a correct drawing. A session cannot pick between two operator rulings, so round #1280 escalated it with three costed options rather than building it — and **the operator ruled the same day: *"we refuse the B=D"***. [ADR-531](06-decisions.md#adr-531) carries the reversal, its cost file by file, and the one gap it exposed ([#1288](https://github.com/dcodish/geo_builder/issues/1288)). The escalation is what produced the ruling; it is left recorded here because the collision is the reusable lesson, not the outcome.

The question put to him was short: **when «D = חיתוך AB ו-BC» draws the right point under a second name, is the honest answer the refusal (3-D's behaviour since ADR-3D-183) or the merged label «B=D» plus the notice (#944, shipped)?** Both resolve #944's original complaint — the contradiction between two surfaces — and only one of them can be the tool's answer. He chose the refusal, which makes the rule at the top of this ADR true in all three trees without exception.

**Why an ADR-W rather than three quiet copies.** Three trees now answer one question, and they reached the answer at three different dates by three different routes. The next person to touch any of them needs the rule, not one tree's version of it — and the audit table above is the evidence that "port it" was checked rather than assumed ([[cross-product-disparity-is-a-wiring-smell]] in the operator's own terms). The 2-D collision is the same evidence working in the other direction: the audit found the cell missing, and the locks found out why.

## ADR-W-067 — The fix-round cap is 20 items, and the escalation stop becomes a RATE (#1290, amends ADR-W-028)

**Status:** accepted, 2026-09-20 · **Amends:** [ADR-W-028](#adr-w-028--the-fix-round-cap-is-58-items-with-stop-conditions-35-was-a-phase-1-number-that-has-now-been-measured-767) (which amended [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544))
· **Issue:** [#1290](https://github.com/dcodish/geo_builder/issues/1290) · operator: *"I want to change the number of issues a fix round can fix to about 20"*
**Requirements:** none (internal) · **Design:** none (internal) — this is a workflow contract; the product promises nothing about round size.

**Problem.** The cap has been raised once before on measurement (ADR-W-028: 3–5 → 5–8, ceiling 10, on a
six-round 8% escalation rate) and the same question is back with thirteen more rounds behind it. The queue
now arms faster than 5–8 items a round consumes it.

**The measurement.** Aggregating the `stats:` lines of the last nineteen rounds that carry one — the format
exists to be read exactly this way, never by re-reading prose (#1280, #1244, #1228, #1200, #1193, #1181,
#1173, #1169, #1144, #1141, #1135, #1131, #1061, #1056, #1006, #1001, #998, #992, #988):

```
picked=102  escalated=10   → 9.8%
```

Materially unchanged from ADR-W-028's 8%; no crashed rounds; the largest round yet run, #1131's nine items,
ran clean on one escalation. What did NOT survive contact is ADR-W-028's *cost* model. It priced an item at
"≈ 8–10 min fixed overhead, linear, **walling around 10**". Measured against the round's own landing commits:

| round | items | first → last landing | per item |
| --- | --- | --- | --- |
| [#1244](https://github.com/dcodish/geo_builder/issues/1244) | 7 | 20:02 → 23:05 | ~26 min |
| [#1131](https://github.com/dcodish/geo_builder/issues/1131) | 9 | 17:39 → 23:16 | ~37 min |

≈ **30 min/item** — three times the estimate, and still linear. There is no wall at 10; there is a clock. A
20-item round is an **8–11 hour** run, which is an overnight shape, and overnight unattended rounds have been
permitted since [ADR-W-054](#adr-w-054--unattended-overnight-rounds-adr-w-012s-phase-2-opened-with-a-hard-boundary-at-the-deploy). The constraint that actually bound the cap turns out to be
the operator's play sitting and reconciliation risk — the two ADR-W-028 §3 already named — not the machine.

**Decision.**

1. **A round picks up to 20 work items. One number, no band.** A bundle of issues sharing one root cause
   still counts as ONE item, and the cap still never forbids a correct bundle (the ADR-W-012 operator ruling
   stands). The hard ceiling and the working band collapse into the same number: ADR-W-028 §2 already had to
   fight "3–5" being read as a floor of 3, and a two-number rule invites that reading back. **Fewer is always
   fine and composing small is never a defect** — a round with two eligible items runs rather than waits to
   fill up.

2. **The escalation stop becomes a rate: finalize when escalations reach a QUARTER of the items attempted so
   far, minimum 2.** This is the load-bearing half of this ADR, and without it the cap raise is nominal.
   ADR-W-028's stop was "the second escalation finalizes the round". At the measured 10% rate a 20-item round
   *expects* two escalations — `P(X≥2 | n=20, p=0.1) = 0.61` — so three rounds in five would truncate around
   item 10–14 and the cap would have moved on paper only. The threshold was written as an absolute because
   the round size was fixed; once the size moves it has to become a rate, because **that is what the stop was
   always measuring.** Its stated intent is staleness: "two plans failing contact with the code in one round
   says the queue's plans are going stale". 2-of-7 is a 29% failure rate against a 10% baseline — a real
   signal. 2-of-20 is 10% — the baseline itself, i.e. no signal at all.

   The quarter reduces to the old rule at the old band (2-of-8 = 25% → stop, exactly ADR-W-028) and scales
   honestly above it: 3 of 12, 5 of 20. `P(X≥5 | n=20, p=0.1) = 0.043` — it stays quiet when the queue is
   healthy and still fires promptly when it is not. The floor of 2 keeps a single escalation from ever
   stopping a round, and the rate is evaluated over items *attempted*, so two stale plans out of the first
   two still stop immediately, as they should.

   Everything else about the escalation exit is untouched: an escalated item is still a GOOD outcome, the
   docs/17 template still goes on the issue, `auto-ok` → `needs-operator`, and the stop is still a stop and
   not a failure — the `stats:` line records it.

3. **The ~2-items-per-chokepoint rule does NOT scale, and is now usually the binding constraint.** It is a
   property of the chokepoint, not of the round: items touching one seam rebase over each other and each
   one's full-suite run can break the previous one's scenario. That risk is unchanged by how many *unrelated*
   items ride alongside. A 20-item round therefore wants ~10 distinct chokepoints, and most compositions will
   land below 20 for this reason rather than for the cap. Say so at composition time instead of discovering
   it at item 14.

4. **The play sitting is sized by the operator, not by the round.** ADR-W-028 §4's split stands — `batch
   (landed on main)` and `individual (PRs)` are separate sections, and PRs were never a batch. A full-20
   round's batch sheet is a long sitting; an ATTENDED round should still compose to what he can play in one,
   and the unattended overnight route (ADR-W-054) is where the top of the range belongs, since its sheet is
   read in a different session anyway.

**What this does not change.** Eligibility (`auto-ok` + a concrete plan, [ADR-W-014](#adr-w-014--batch-approval-one-operator-okay-arms-a-round-auto-ok-may-be-transcribed-with-an-audit-comment-548) and its Am. 1), the
worktree-per-item isolation, the full per-item gates, the escalation exit itself, the landing routes, the
live ledger opened at composition ([ADR-W-013](#adr-w-013--the-round-issue-is-a-live-ledger-opened-at-composition-not-an-end-of-round-report-547)), the `stats:` line, the P1-stops-a-round and
one-live-round-at-a-time guards, the re-measure-before-reading-the-plan duty ([ADR-W-064](#adr-w-064--a-fix-session-re-measures-the-issue-before-it-reads-the-plan-and-a-divergence-is-the-expected-case-1252)), and the
deploy boundary on unattended rounds (ADR-W-054).

**What would reverse it.** The same way it was raised: the `stats:` lines. If the escalation rate across
20-item rounds runs materially above 10%, or a round is stopped by the rate more than occasionally, the
queue's plans — not the cap — are the problem, and that is a triage finding, not a number to tune.

## ADR-W-068 — Every fix round ends with a PUBLISHED HTML report and play sheet (#1291, completes ADR-W-054)

**Status:** accepted, 2026-09-20 · **Completes:** [ADR-W-054](#adr-w-054--unattended-overnight-rounds-adr-w-012s-phase-2-opened-with-a-hard-boundary-at-the-deploy) (whose artifact clause was never written into the skill) · **Extends:** [ADR-W-013](#adr-w-013--the-round-issue-is-a-live-ledger-opened-at-composition-not-an-end-of-round-report-547)
· **Issue:** [#1291](https://github.com/dcodish/geo_builder/issues/1291) · operator: *"also at the end of the fix-round i want an html report and the test cases i need to run"*
**Requirements:** none (internal) · **Design:** none (internal) — the report is a workflow surface; it makes no promise to a student.

**Problem.** A round's output has lived in two text surfaces: the round issue (the durable ledger,
ADR-W-013) and the chat report (standing rule 5). ADR-W-054 already decided a third — *"each round
republishes a single Artifact play sheet … and the sheet stores the operator's per-case verdict in the
artifact database"*, so a later session reads verdicts with `read_db` instead of asking him to retype them
— but it decided it **inside an ADR about unattended overnight rounds, and never wrote it into
`.claude/skills/fix-round/SKILL.md`.** A decision that is not in the procedure does not happen: no round
has produced one, attended or not. Meanwhile [ADR-W-067](#adr-w-067--the-fix-round-cap-is-20-items-and-the-escalation-stop-becomes-a-rate-1290-amends-adr-w-028) raised the cap to 20, which is exactly the size at
which a GitHub issue body stops being a usable play surface.

**Decision.**

1. **Every round — attended or unattended — finishes by publishing ONE Artifact**, and its URL goes into
   the round issue body and the chat report. Publishing is part of Step 5, not a nicety and not optional.

2. **It carries two halves, in this order.**
   - **The round report** — per item: issue → route → commit SHA or PR# · ADR id(s) · the one-line gate
     record · the required **deviations from plan** line; then **Escalated**, **Skipped**, and the
     `stats:` line. This is the ledger made readable, not new information.
   - **The play sheet** — the numbered cases **exactly as standing rule 5 specifies them** (CLAUDE.md,
     operator authority): `T<n>` continuous across every section, a plain student-facing title, the
     **Server** URL *with its path* on every case, the Hebrew utterances, **Look for**, **Before**.
     Grouped by route per ADR-W-028 §4 — batch (landed on `main`) first, then one section per PR.

3. **The Hebrew lines stay copy-pasteable** — one utterance per line, monospace, LTR-safe inside the RTL
   page, with a copy control per case. The whole reason the sheet exists is that he plays from it; a sheet
   he has to retype is worse than the issue body it replaced.

4. **Per-case verdict capture, stored in the artifact database.** Each case takes pass / fail / a note, and
   a later session reads the verdicts with `read_db`. This is ADR-W-054's clause finally implemented, and
   it is what makes an overnight round's output survive the session that produced it.

5. **The artifact is a SURFACE, never a replacement.** The round issue remains the durable ledger and the
   validation signal is still closing it. All three copies — issue, chat, artifact — carry the **same case
   list**, extending Step 6's existing rule that the chat copy is the same list and not a summary: two
   versions that differ is how a case gets skipped.

**What this does not change.** The round issue opened at composition (ADR-W-013), the `in-round` →
`awaiting-play` swap as the execution-finished marker, the `stats:` line as the machine-greppable record,
standing rule 5's content and its running-server requirement (one port per unmerged PR), and the deploy
boundary on unattended rounds (ADR-W-054).

**Why not just a local `.html` file.** He reads a round's output in a different session and often on the
other PC ([[work-pc-cross-machine]]). A file in the worktree is gone when the worktree is; a published
artifact has a URL that outlives the session and a database that can hold his verdicts. That was
ADR-W-054's reasoning and it is unchanged — only its reach is, from overnight rounds to all of them.

## ADR-W-069 — The input's live preview typesets MATHEMATICS, in every builder (#1152)

**Status:** accepted, 2026-09-20 · **Issue:** #1152 (bug, P2, `workspace` + `analytic`) · operator report 2026-09-16 · round #1292
**Requirements:** [02c](02c-requirements-analytic.md) / [02b](02b-requirements-3d.md) — the input strip · **Design:** [28](28-product-unification.md) §the preview seam
**Third surface of** [#1082](https://github.com/dcodish/geo_builder/issues/1082)'s ruling, after [#1097](https://github.com/dcodish/geo_builder/issues/1097) chased it into a second panel

**The report.** Typing «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9»: *"on data input — the bidi text should also be MathML so the squared needs to show nice."* The strip under the box already repairs the bidi; it rendered that repaired sentence as plain text, so `(x-3)^2` kept its caret a few pixels above a fact row showing a real superscript — the student's own equation, two ways, in two elements.

**Root cause: sibling drift.** The mechanism shipped in the oldest tree and the younger ones were written from the older template. The shared chassis was already ready for it — `shell/frame/InputArea.tsx` types the seam as `preview?: (text: string) => ReactNode | null`, *"a string, or a rendered node"* — so no shared-component change was needed, only the callers.

**Re-measured at pickup, and the scope is smaller than the issue's table.** The issue listed three trees; `src-analytic/App.tsx` has been fixed since it was filed, and fixed correctly (isolate, then typeset). Only `src-complex` and `src3d` remained. The issue's own note asked for exactly this re-confirmation.

**The two traps, both now locked.**

1. **Isolate first, then typeset.** 2-D's line typesets the RAW string. Copying it verbatim into an RTL-Hebrew product would typeset unisolated text and could reorder the equation — the very thing the strip exists to prevent. Both adopters pass `isolateLtrRuns(…, true)` output to `MathText`; the isolate characters ride through untouched and the Hebrew stays Hebrew.
2. **The trigger changes, deliberately: presence of MATHEMATICS, not presence of a bidi change.** `inputPreview` returns `null` when isolation changes nothing, so a pure-LTR equation like `(x-3)^2+(y-4)^2=9` had **no strip at all**. It gets one now. That is a product choice and it is the one worth naming: the strip stops being *"a bidi repair"* and becomes *"what you typed, typeset"*.

**Dependency cleared.** The issue sequenced itself behind #1125 (`shell/math.tsx` was a VALUE grammar, so `√` survived as a glyph). #1125 is closed, so the strip typesets roots as well as powers and this does not ship a preview that is right for one and wrong for the other.

**What is deliberately not changed.** 2-D still typesets the raw string. It is the tree the mechanism came from, it ships, and whether its own line should isolate first is a question about 2-D rather than about this port — the lock excludes it **by name and with that reason**, so the exclusion is visible rather than an accident of how the assertion was written.

**Consequences.** `src-complex/App.tsx` and `src3d/App3.tsx` (+the `hasMath`/`MathText` import, the preview expression). `shell/__tests__/issue-1152-typeset-preview-parity.test.ts` (13): every builder routes its preview through `hasMath` and `MathText`; every builder that joined via this port isolates BEFORE typesetting; and the trigger itself is **called, not described** — the rows fix what `hasMath` answers for the strings the ruling is about, so a change that narrowed it fails here instead of silently emptying four previews. A fifth builder is one line in `APPS`.

## ADR-W-070 — A leading SIGN belongs to the technical run; a maqaf does not (#1296)

**Status:** accepted, 2026-09-21 · **Issue:** #1296 (bug, P2, `workspace`)
**Requirements:** none (internal — this restores a promise the display was breaking, it does not change one) · **Design:** [28](28-product-unification.md#5a-how-this-is-executed--branch-strategy-and-the-work-items)
**Extends** [ADR-W-016](#adr-w-016)'s shared bidi core with the one case its span selection never had

**The report.** Operator, 2026-09-20, typing `(-2,4)` into the analytic tool: *"I cannot enter the coordinates in a normal way. the bidi keeps interfering and i dont know how to get around it"*.

**There was nothing to get around, and that is the defect.** The string was always correct — `parseLine` received `(-2,4)` and parsed it, and the stored fact holds it verbatim. Only the DISPLAY was wrong, which is exactly why he could not type his way out of it: every correction he made was to something that was already right.

**The class.** *A technical run that OPENS with a non-CORE character loses that character to the paragraph direction.* `flush()` selects the span as `[first CORE … last CORE]` and then grows it with two loops — partner-debt and balanced-hug — **both of which only ever move over a DELIMITER, and both of which require adjacency to the current span.** The right edge additionally has a trim-back and `liveTail`; the left edge has nothing else. So a sign between `(` and the first digit blocks the hug permanently, and `(`, `-` and `)` all sit outside as bidi neutrals for the UBA to resolve to RTL.

**Measured before**, and it was never analytic-only — the span logic is copied three times and all three copies were identical here:

```
shell  "נקודה (-2,4) …"   ->  נקודה (-⟦2,4⟧) …        ✘      "נקודה (2,4) …"  ->  נקודה ⟦(2,4)⟧ …   ✔
2-D    "הזווית היא -37"   ->  הזווית היא -⟦37⟧        ✘      "הנקודה (2,-4)"  ->  הנקודה ⟦(2,-4)⟧   ✔
3-D    "וקטור (-1,2,3)"   ->  וקטור (-⟦1,2,3⟧)        ✘
```

An **interior** minus was always fine; only a leading one. «וקטור (-1,2,3)» is everyday 3-D vocabulary, so this was live in three shipped products, not only in the undeployed one where it was reported.

**Why a blanket "absorb a leading minus" would have been wrong, and what the discriminator actually is.** `-` in a Hebrew sentence is also the **maqaf** of a particle, and there the old behaviour was already correct: «ציר ה-x», «ו-B(6,8)», «מ-9», «ל-l1», «מ-A» all keep the hyphen with the Hebrew. Measured across thirteen rows, every correct one has the `-` **immediately preceded by a Hebrew letter** and every broken one has it preceded by an opening delimiter, by whitespace, or by the start of the line. That is the whole rule, it needs no lookahead into meaning, and it is the display-side twin of [#975](https://github.com/dcodish/geo_builder/issues/975), where the parser learned the same distinction about the same character.

The gap's first character is the awkward case: a gap is closed by a Hebrew letter and the next begins right after it, so every gap but the first is preceded by one — and the first by nothing. `gapAfterHebrew` carries exactly that, which is what makes «-5 הוא הערך» absorb while «ה-x» does not.

**Deliberately NOT in `BASE_CORE`.** A CORE character can START a run on its own; putting `-` there would isolate the maqaf away from its own word and break every correct row above. The sign is a left-edge EXTENSION of an existing run, never a reason to open one.

**Order is load-bearing.** The extension runs **above** the hug loop, so `(-2,4)` first becomes the span `-2,4` and the hug then sees `(` and `)` adjacent and absorbs the pair — the same path `(2,4)` already took. Below the hug loop it would be too late. One character, never a loop: `--5` is not something a student writes, and repeating would start eating the maqaf.

**`+` is included with no measured case**, stated plainly because the repo's rule is that a fix is sized to a class: a run opening with `+` is broken identically and by the same line of code. A SPACED operator («שווה + 5») is deliberately still outside — the sign must be immediately adjacent — because a detached operator is genuinely ambiguous and no case was measured.

**Ported to all three copies, and that was the scope decision.** [ADR-W-016](#adr-w-016) leaves `src/i18n/bidi.ts` and `src3d/i18n/bidi.ts` in place until Track B migrates those apps, so fixing the shared core alone would have left the class live in 2-D and 3-D where it is measured above — the half-fix docs/17 forbids. The drift net is **one fixture table asserted by all three kits**, which is what the three-copy situation actually needs and what a per-tree lock with its own rows would not have given.

**The guard rejected the obvious shape of that net, and was right.** The first draft was a single test in `shell/__tests__` importing all three kits — and `server/__tests__/isolation.test.ts` refused it: `shell/` may never import a product tree ([ADR-W-016](#adr-w-016) rule 2), and its scan covers a tree's tests as well as its sources. The structure it forced is better: the ROWS live once in `shell/__tests__/fixtures/issue-1296-rows.ts` and each tree asserts them against its own kit, which keeps the products importing `shell/` — the allowed direction — while the table still exists in one place. When Track B migrates 2-D and 3-D onto this core, the three test files collapse into one.

**A product difference the shared table nearly erased, and now records instead.** The first run of that table failed one row: 3-D renders «נתון הישר l1: 2x-y+8=0» as TWO islands (`declSplit`, its textbook layout) where shell and 2-D render one. That is a documented parameter of `makeBidi`, not a regression — the test row was wrong, not the code. It is now asserted per kit, with the sign rule additionally exercised inside a split declaration, so a future Track B migration has to decide about the split deliberately rather than lose it to a passing test.

**Measured after**, all three kits: the ten sign rows absorb (both `-` and `−`, the vector row, and the line-initial case), the seven maqaf rows are unchanged, and «הערך שווה ל-(-5)» — the same character twice in one line, one out and one in — proves the rule is positional rather than a property of the character. Two properties are asserted over every row: isolation changes **display only** (stripping the controls returns the input exactly, so nothing can reach the parser or the fact list — #531/#751), and it is **idempotent**.

**Consequences.** `shell/bidi.ts` (+`SIGNS`, +`gapAfterHebrew`, +the left-edge extension above the hug loop). `src/i18n/bidi.ts`, `src3d/i18n/bidi.ts` (the same rule, ported). `shell/__tests__/fixtures/issue-1296-rows.ts` (the shared rows + the per-tree suite; the isolate characters written by code point, never literally, per the core's own rule) and three thin locks — `shell/__tests__/`, `src/i18n/__tests__/`, `src3d/__tests__/issue-1296-leading-sign.test.ts` (71 tests total): the three row tables per kit, the display-only and idempotence properties, and the declaration-split difference asserted on both sides. The 1,037 pre-existing bidi locks across the three trees pass untouched, which is the evidence that the left-edge rule is surgical.

## ADR-W-071 — A cross-product wiring guard asserts BEHAVIOUR, never a source location (#1315)

**Status:** accepted, 2026-09-21 · **Issue:** #1315 (bug, P1 trunk-honesty, `3d`)
**Requirements:** none (internal — no student-facing behaviour changes) · **Design:** [28](28-product-unification.md)
**Supersedes** the source-scanning half of [#1152](https://github.com/dcodish/geo_builder/issues/1152)'s parity guard · **applies** [ADR-W-053](#adr-w-053) to a guard that was itself the reproduction

**How it surfaced.** `main` was RED on `6144da4f` and nobody had reported it. Found while gating unrelated work; `origin/main` was at the same commit, so every session's `test:full` was failing.

**And the exit code lied.** `npm run test:full` exited **0** while `reports/suite-verdict.json` said `"green": false`. That is precisely the case [ADR-W-033](#adr-w-033) exists for, and it is why this went unnoticed: a session reading the exit code would have committed and reported green.

**The product was correct the whole time.** `src3d/render/FactRow3.tsx`'s `inputPreviewNode3` does `hasMath` first and hands `MathText` isolated text — both of #1152's requirements. Commits `3e4fd992`/`4991355b` had **extracted** the preview decision out of `App3.tsx` into its own module, which is the right move and the one ADR-W-053 asks for.

**The class.** *The guard asserted that a decision lives at a particular SOURCE LOCATION, rather than that the product makes it.* It read 400 characters after `preview={` in each `App*.tsx` and required the literal substring `hasMath(s)`. So **any legitimate extraction breaks it**, and it would have done the same to the other three the first time one of them tidied the same prop. The guard punished the correct refactor; 3-D merely got there first.

Its docblock half-saw the tension — *"the DECISION under test is never restated here"*, true of `hasMath`, which it really did call — but the ROUTING was still source text, and the routing is the half that broke.

**The constraint that produced the bad shape is real.** `shell/` may never import a product tree ([ADR-W-016](#adr-w-016) rule 2), so one shared test genuinely cannot call four previews. [#1296](https://github.com/dcodish/geo_builder/issues/1296) hit the identical wall an hour earlier and its answer generalises: **the rows live once in `shell/__tests__/fixtures/`, the assertions live per tree.** Products importing `shell/` is the allowed direction.

**What was built.** All four previews extracted into callable functions (3-D already was) — `src/render/inputPreviewNode.tsx`, `src-complex/render/inputPreviewNodeCx.tsx`, `src-analytic/render/inputPreviewNodeAnalytic.tsx` — and four thin locks running one shared `previewTypesetSuite`. The source scan is **deleted**: once the behaviour is asserted there is nothing left for it to add, and leaving it would re-break on the next extraction.

**The replacement is strictly stronger, and that claim is itself locked.** A builder that keeps the inline `hasMath(s)` text but hands `MathText` the RAW string passes the old scan and fails this one. `issue-1152-suite-bites.test.tsx` proves it by running the real checks against deliberately broken stubs — a raw-string preview, one that never typesets, one that typesets everything, one that isolates without typesetting — and asserting each is caught, plus a correct stub reporting nothing. **A green lock proves nothing until you know it can go red**, and that mattered here because the thing being deleted could pass while the product was wrong.

The checks are a pure `previewFaults(preview, opts)` that BOTH the per-tree suites and the meta-lock call. A meta-lock with its own copy would prove only that the copy bites — the same reproduction trap this ADR is about, one level up. (The first attempt did exactly that: it tried to inject fake `describe`/`it` into the fixture, collected nothing, and "passed" three broken stubs. Extracting the checks is what made it real.)

**Behaviour preserved exactly, including one that looks wrong.** 2-D hands `MathText` the raw string and #1152 excluded it by name. That exclusion is now a parameter, `isolatesFirst: false`, rather than a silent gap — and it was NOT fixed here, because a behaviour change smuggled into an extraction is the worst kind. Measured and filed as [#1316](https://github.com/dcodish/geo_builder/issues/1316): the mechanism is confirmed, the symptom has not been looked at, and the lock's flag is the one-line switch waiting for the answer.

**THE CLASS REPEATED TWICE MORE, which is the finding that matters most here.** The full suite came back red a second time with `src-analytic/__tests__/bidi-wiring.test.ts` and `src-analytic/__tests__/issue-1215-preview-typeset.test.ts` — **two further source scans of the same prop**, in a different tree, that nobody knew were coupled to it. `#1215`'s even said so in its own comment: *"A source scan, like `bidi-wiring.test.ts`: this seam is what a refactor drops silently."* So this is not one badly-written guard; it is a HABIT, and the extraction is what made it visible. Both are converted the same way — call the function, assert what `MathText` actually receives — and both now import `isTypeset`/`textOf` from the shared fixture rather than growing a third copy. `previewDir`, still a genuine one-line wiring prop, stays a scan: that file's subject really is wiring, and the fix is not "delete every scan" but "scan wiring, call decisions".

A sweep for the remaining `readFileSync(App…)` tests found no others touching the preview; 3-D's `bidi3.test.ts` already asserts behaviour.

**And the complex tree refused where the module was first put.** `src-complex/render/` may import only `[value, scene]`, and a preview composing `i18n` with `shell/math` is not that — `import-direction.test.ts` was right to refuse it. It lives in `ui/` beside `askText.tsx`, which is the same shape (presentation, importing `../i18n`, returning a `ReactNode`). Worth recording because the four trees do NOT agree on where this module belongs, and the layer guard is the thing that says so per tree.

**Consequences.** Three new preview modules + the three Apps rewired to call them (and their now-unused imports dropped — `tsc` found all three). `shell/__tests__/fixtures/issue-1152-preview-rows.ts` (rows, `previewFaults`, `previewTypesetSuite`; isolate characters written by code point, per `shell/bidi.ts`'s rule). Four per-tree locks (42) + the meta-lock (5); `src-complex`'s lives in `ui/__tests__/` for the layer reason above. `shell/__tests__/issue-1152-typeset-preview-parity.test.ts` **deleted**, and `src-analytic`'s `bidi-wiring` + `issue-1215` scans converted to behaviour. `isTypeset`/`textOf` exported from the fixture so the analytic locks call them.

## ADR-W-072 — Two distinct named points are never OPENED on top of each other, in every builder (#1273; cross-product ruling of 2026-09-20)

**Status:** accepted, 2026-09-21 · **Issue:** #1273 (bug, P2, `analytic` — the display half; #1254 is the naming half) · operator, 2026-09-20 (T18): *"even if they do fall on the same point by chance, but not necessarily because there is a degree of freedom, the system should not show them on top of each other. It should automatically look for a different config and show them differently"* — and, the same day: *"the 2d and 3d tools should follow the same logic about points being on the same location"* · round #1332
**Requirements:** [02](02-requirements.md) FR-ALT-2 / [02c](02c-requirements-analytic.md) R61 · **Design:** per product — [04](04-design.md) `firstSatisfyingSeed`, [04c](04c-design-analytic.md) the configuration search

**The rule, once, for three trees.** Where the figure has a configuration that keeps its distinct named points apart, the tool OPENS on that configuration — by itself. It is a **preference below validity, never a requirement**: a figure whose every configuration stacks two labels — a coincidence the givens force — is still drawn, and refusing such a statement at its source is the naming half (#1254 analytic, #1274 2-D, ADR-3D-183 3-D). The tolerance is relative to the figure's own span, never an absolute epsilon (ADR-AG-021; ADR-W-048's family).

**Who complies, measured 2026-09-20/21 and recorded so no tree re-derives it:**

| tree | a NEW letter named where a point already is | two EXISTING points that fall together by chance |
| --- | --- | --- |
| 2-D | notice only → #1274 | a separating configuration is preferred first — `firstSatisfyingSeed` ranks with `separatedView`/`pointsDistinct`, a coincident one remembered and used only if nothing else turns up ([ADR-486](06-decisions.md#adr-486), #942) ✔ |
| 3-D | refused — `point-coincides` ([ADR-3D-183](06b-decisions-3d.md#adr-3d-183)) ✔ | — |
| analytic | structural refused (#1175); positional → #1254 | **this round: [ADR-AG-138](06c-decisions-analytic.md#adr-ag-138)** — the 2-D ranking ported into `drawableAt` ✔ |

**One deviation from #1273's own lock list, recorded.** Its fourth lock said «הציגו תצורה אחרת» *"keeps offering every configuration, including stacked ones — the student asked"*. That is the filing session's inference; the operator's sentence is *"the system should not show them on top of each other"*, and the walk shows configurations through the same search the opening does. So a stacked configuration is not offered while a separated one exists within the budget; it remains admissible to every knowledge gate (the preference is display-only, like spread — ADR-AG-128). Flagged reversible on the play sheet: if he wants the stacked one reachable on request, the walk gets a "raw" mode, not the opening.

**Consequences.** Analytic: ADR-AG-138 (this round). 2-D: none — ADR-486 already is this rule. 3-D: none for the chance case (it has no sampled points that can fall together without a naming statement, which it refuses).
