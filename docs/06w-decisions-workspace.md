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
work items** *(superseded — the cap is 5–8 with a ceiling of 10 since [ADR-W-028](#adr-w-028--the-fix-round-cap-is-58-items-with-stop-conditions-35-was-a-phase-1-number-that-has-now-been-measured-767); the rest of this sentence stands)*
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

**Status:** accepted, 2026-08-19 · **Amends:** [ADR-W-012](#adr-w-012--fix-round-autonomous-execution-of-operator-approved-fix-plans-543-544)
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

1. **The working band is 5–8 work items; the hard ceiling is 10.** A bundle of issues sharing one root
   cause still counts as ONE item, and the cap still never forbids a correct bundle (the ADR-W-012
   operator ruling stands unchanged).

2. **Fewer is always fine — the band is not a quota.** "3–5" read as a floor of 3; a round with two
   eligible items must still run rather than wait to fill up. Composing small is never a defect.

3. **Two stop conditions bound a round by evidence, not by the number alone.** The count was one knob over
   three different constraints — machine cost (~6 min `test:full` + a worktree `npm install` ≈ 8–10 min
   fixed overhead per item, linear, walling around 10), the operator's play sitting, and reconciliation
   risk between items. The ceiling covers the first; these cover the third and the real reason a big round
   goes wrong:
   - **Second escalation in one round → finalize.** Land what is done, close the ledger honestly, report.
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
