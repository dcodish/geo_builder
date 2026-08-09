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
- **Current state is read from the live sources only**: the ADR-log tails, `gh issue list`, and
  `docs/DEPLOY-LOG.md`. The older narrative logs (`09-implementation-plan.md`, `09b-status-log.md`,
  `PROJECT-MEMORY.md`) are labelled as background that lags, never as current status.
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
