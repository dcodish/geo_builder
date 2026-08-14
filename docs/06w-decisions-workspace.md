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
work items** where a bundle of issues sharing one root cause counts as ONE item (operator ruling: the
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
