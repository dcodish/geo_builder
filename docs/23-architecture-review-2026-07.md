# 23 — Architecture review, 2026-07-24 (commissioned)

_Status: **findings + recommendations — decisions pending operator.** Commissioned by the operator 2026-07-24 ("fresh review from an outside point of view … make sure the base of this whole project is solid"). Method: four independent full-depth reviews (engine · parser · derived layers/tests · ADR defect-class meta-analysis over all 390 2-D + 71 3-D ADRs), run blind to each other, then cross-checked — the sharpest engine claims were re-verified against the source by hand. This is the sibling of the 2026-07-06 review that produced [docs/17](17-design-rules.md); like it, nothing here is implemented — the operator picks what to schedule._

---

## 1. Verdict

**The foundation is sound.** All four reviews, run independently, converge on the same shape:

- The **engine core** — the dependency-graph data model, DOF-classified points, constraints-as-checks vs `solve` directives, branch indices — has absorbed two months of intense mechanism growth **without forking**. Every rescue mechanism composes *on top of* the same model. Layering is real: zero `src/engine` → store/parser/render/React imports (verified by grep, not by claim).
- The **self-verification discipline is the load-bearing wall**: every rescue (settle, recruit, lend, co-drive, scale, barrier retry, HOIST) is try-and-verify against a full `evaluate` + the vacuous-satisfaction gate + the driven-constraint re-verify ([evaluate.ts:975–998](../src/engine/evaluate.ts)). Mechanisms can *fail to rescue* but structurally *cannot commit a lying figure*. Given the product's honesty charter, this is the correct invariant, enforced at the correct chokepoints — and it is **why** the system has survived this growth rate.
- The **derived-state discipline genuinely holds** under adversarial checking: positions never stored, undo partialized to facts+seed, every derived layer keyed to the exact facts it was computed from. No desync vector was found.
- **Most defect classes are converging.** Detection honesty, the edge/crossing universe, perf, atomicity, reference-binding, and mirror-drift all have real code chokepoints, and their post-mechanism members are refinements *landing at the chokepoint*, not re-breaks (§4).
- **Most raw ADR volume is capability breadth** — the sheer variety of Israeli-textbook Hebrew — which is the product working, not the architecture failing.

The weaknesses are **concentrated and identifiable** — three defect-*generators* that the record itself has already diagnosed but not yet paid for (§3), plus a set of size-and-seam risks that are cheap to fix now and expensive after ten more mechanisms (§5). None of them is rot in the core.

## 2. The framing question: compiler or interpreter?

[docs/11](11-architecture-as-compiler.md) already gives the nuanced answer — "a compiler **front-end** feeding a **constraint-based interpreter**" — so the label was never simply "compiler." But the doc is stale (2026-06-13, before the entire solver-mechanism era) and the review found the framing **earned one real, expensive design mistake**:

- **ADR-009 (`commandConflict` = redefinition error) is compiler semantics, and it became the single largest bug class in the project's history.** In a compiler, re-defining a symbol is an error. In a language of *accumulating assertions about one figure*, a second mention of an id is almost never a redefinition — it is a **given**. That one framing decision generated ADR-075, 099, 115, 119, 124, the `fn34ptei` prod incident, then 284, 291, 347, 375 — and the 3-D replays 3D-047/057. The M1 mechanism is precisely the retreat from ADR-009's semantics, paid for one object-kind at a time (~24 members across both products).
- **docs/11's phase-boundary rule ("the parser must not know about coordinates") is dead, deliberately and correctly, and the doc doesn't know it.** `ParseContext` now reads drawn positions to resolve *deictic* references ("the big circle", "the right circle", the touch point) — the right call, locked by emitted assertions (`set-radius-order`) so sampling can't swap the referent. A future session following docs/11 as written would refuse or contort exactly these features.
- **"The fact list is the source program; replay recompiles it" is half-true.** The stored artifact is a *mix* of source (utterances) and IR (lowered commands), because source is not deterministically recompilable (LLM steps, cost). The ADR-241/242/314/321 complex — edits re-lowered against the wrong context, saved files as parser-output snapshots, drift audits — is the cost of that mix; a compiler recompiles from source, this system audits its own stale IR.

**What the system actually is:** an **incremental, order-normalizing constraint interpreter** (deferral + HOIST assert that a statement's *position* is presentation, not meaning — the opposite of an instruction stream), with **sampled model enumeration as its ground-truth semantics** (truth = "holds in every valid configuration"), fed by a **reference-resolving NL front end** whose meaning legitimately depends on the current model. Nearest relatives: a parametric-CAD kernel / SMT model enumeration, not `tsc`.

**Practically:** docs/17 has already replaced docs/11 as the operative mental model (the meta-analysis found no post-July ADR citing docs/11; dozens cite docs/17). Recommendation R13: update docs/11 to declare M1's assertion semantics, the deictic-ParseContext exception, and the mixed source/IR nature — or demote it explicitly — and refresh [docs/04](04-design.md), which still says (2026-06-10) "renderer/store/parser/UI still pending."

## 3. Why it feels like "we always run into new issues"

The feeling is accurate, and it has **three identifiable generators** — each already named *inside* the ADR record, none of them mysterious:

**G1 — The honesty-gate family grows because the total mechanism is deferred (the record's clearest registry-of-patches).** ~16 `dropped*` gates/members (labels → numbers → words → counts → verbs → relations → nouns → subjects → side-phrases → comparison operators, ADR-390 in the final week), each added after a P1 silent-drop incident, and the family has produced defects *of its own* (ADR-292 Am.'s false block; ADR-374's accounting-as-proxy). ADR-335 states the structural diagnosis: "Every existing gate validates TOKEN PRESENCE, never structure." The complete mechanism — **total span accounting**: every non-filler token span of the utterance must be claimed by the winning parse or the parse is weak — is *named and deferred* in ADR-250. Until it is built, every newly discovered syntactic category of stated content mints another gate.

**G2 — The M2 solver ladder accumulates rungs because assignment is greedy-sequential at its core (the heaviest still-generating class: ~10 members in the 2.5 weeks after ADR-231).** The ladder as it stands: primary → settle-on-frozen-prior → recruit (singleton → minimal → full → steal → lend → co-drive) → anti-collapse retry → orphan re-home → scale rescue → deferral → HOIST → hoist-from-pending. Every rung is individually justified and tested — but each new coupling pattern needs a new rung *because ownership is negotiated per-constraint over a greedy core*. ADR-338 states the root cause from inside: "each `applyStep` EVALUATES before the next constraint is even attached … No mechanism owned a macro's defining constraints as one system" — and notes the joint minimiser already exists; "the gap was purely in the **assignment layer**." Filed residuals #258/#259 confirm the class is open.

**G3 — The parser has no lexical layer, so every rule is an independent chance to re-implement tokenization wrong.** The point-label fragment `[A-Za-z]\d*` is spelled literally **342 times** in parse.ts (plus 163 in parse3.ts); the number grammar exists under three names; the angle-keyword alternation is re-spelled ~21 times; Hebrew morphology (final kaf, single/double-vav, plurals) is handled per-regex, which is how the same spelling class was fixed rule-by-rule in both products and the final-letter trap re-fired ≥3 times *after being recorded as a trap*. The docs/17 §2.2 "proxy-signal" class splits exactly here: its **lexical sub-family** (paren-blind splits, word-count-vs-letter-grouping, `\b` failures — ADR-3D-068/069/071 …) is *structurally generated* by the missing tokenizer, and everywhere a shared atom was introduced (`splitTopLevelTerms`, `LINE_CUT`, `NUMTERM`, `normalizeUtterance`) the class closed and stayed closed. Its **semantic-binding sub-family** (which label plays which role — ADR-275, ADR-119) is inherent to NL→geometry and is actually contained *well* by the existing chokepoints, membership-based binding, honesty gates, and the shadow-matrix guard.

Alongside the generators, one **structural tax**: the 3-D product re-pays 2-D lessons through its own prod users. Of the ~35 recent 3-D ADRs, ~15 are explicit replays of a 2-D class (3D-047 "the M1 class — solid edition" arrived 15 days *after* the 2-D doctrine; 3D-064 rebuilt the whole requirements/config-search layer 2-D had since ADR-106/244/254). Copy-don't-import is right for *code*; the **class inventory** doesn't travel, and nothing makes a keyword/tokenizer/class fix in one tree prompt a sibling audit in the other. The 3-D tree also lacks the 2-D parser's two best defenses: the shadow-matrix ordering guard and the LLM-path honesty-gate battery.

## 4. Defect-class scoreboard (from the full ADR record)

| Class | Mechanism + date | Post-mechanism members | Trend |
|---|---|---|---|
| Detection honesty (ground truth = valid configs) | ADR-256 + M3 shared sampler, 07-08 | ~5, all landing in the one filter chain | ↓ converged |
| Node-definition / universe whitelists | ADR-167 (geometric universe), 07-01 | 2, each self-citing the class | ↓ converged |
| Perf | M3 + §7 rules; ADR-280/290, 07-11/12 | 2, measured | ↓ closed |
| Atomicity / composite validation | per-invariant completion, 07-14/16 | 0 | ↓ likely closed |
| Reference-binding defects (invent vs bind) | ADR-363/367 one-resolver seam, 07-19 | new *forms* landing at the seam | ↓ converging |
| Mirror/copy drift | ADR-346 shared seam + guards, 07-17 | 2 (text-diff guard, admittedly not semantic) | ↓ |
| M1 existing-object lowering | ADR-231, 07-06 | ~8 (2-D) + ~5 (3-D) — a migration backlog across kinds | ↓ per kind, → across kinds |
| Defaults-yield (M4) | ADR-052 + M4 | ~7 — each new shape/solid re-imports it; no mechanical conformance sweep | → |
| Proxy-signal (docs/17 §2.2) | a *discipline*, not a chokepoint | ~8 flat rate; but late fixes now **delete** carve-outs rather than add them | → (lexical half is fixable — G3) |
| **M2 solver ownership** | ADR-231 laws | **~10 in 2.5 weeks** | → **heaviest generator — G2** |
| **Honesty gates** | **none total** (ADR-250 defers the real one) | continuous, one per syntactic category | ↑ **G1** |
| Capability breadth | n/a | majority of all ADR volume | healthy |

The signature of the converged classes: a *real code chokepoint*, with later members landing at it. The signature of the open ones: a principle enforced by discipline/prose, or a mechanism that is a registry of strategies rather than a total function.

## 5. Layer findings (evidence-checked)

### Engine (`src/engine/`) — sound core, governed accretion on the failure path
- **Not an accretion disk yet**: clean core + an increasingly thick but *self-verifying* failure-path shell, largely obeying docs/17. Recent consolidations (one `ancestors()` walker, one sampler pipeline, `carriers.ts`, the fold/tail memo) show the codebase paying accretion *down*.
- **The failure ladder exists as three divergent inlined copies** (verified): `applyStep` conflict branch ([step.ts:384–405](../src/engine/step.ts)) runs settle→recruit but **no orphan sweep, no scaleRescue**; the main branch (437–484) runs orphans→settle→recruit→scale; `applyCoupledStep` (≈527–540) a third variant. Whether the omissions are semantic or drift is undocumented. Mechanism N+1 will be inserted into one copy of three.
- **Recruiter case (C) violates M2's own transactionality law** (verified): its steal *persists even when its verification fails*, and two comments ([step.ts:907–911, 1023–1028](../src/engine/step.ts)) document other stages compensating — mechanisms patching a mechanism, inside docs/17's #1 registered chokepoint.
- **Constraint identity is expressed two incompatible ways** — by object reference (`owned.add(sv.constraint)`, carrier-count Map keys) and by JSON string (`keepTangencyDriven`, `settleOnFrozenPrior`, `drivenConstraintsOf`). Any future `{...con}` clone at a directive boundary breaks the reference-keyed paths **silently**. No `constraintKey()` exists, and no test would catch the failure mode.
- **The engine's top layer lives in the UI store**: `computeFold` (~420 lines: symbol table, four M4 pre-scans, transactional fold, deferral fixpoint, poisoning fixpoint, recursive HOIST) + all the seed/config sweeps sit in [geoStore.ts](../src/store/geoStore.ts) (2,717 lines) beside selection highlighting and undo. The *mechanism* boundary doesn't match the *module* boundary; nothing enforces the engine←store import direction (today it holds by discipline).
- **No cross-layer ladder contract exists**: the order pre-gates → M1 chain → eager pick → evaluate's internal escalation → step ladder → deferral → HOIST → sweeps is emergent from nested code across three files. A new engineer cannot predict which mechanism fires for a given failing constraint.
- **The numeric core has no direct unit tests** (`nelderMead`, `multiStartSolve`, `drivenRoots`, `resolveMixedCarriers`, the collapse barrier): a tolerance/grid regression would surface only as distant scenario flakiness. `checkGivens` — the honesty backstop, ~520 lines, one function — has thin direct coverage relative to its criticality.
- Hotspots past review-size: `applyCommand` (~1,300 lines, 75 cases), `recruitFreeDofs` (~245), `computeFold` (~420), `resolveMixedCarriers` (~200), `checkGivens` (~520).
- Purity: two documented seams — the cooperative wall-clock budget (armed only around view searches; a designed impurity worth stating) and identity-keyed memos (`WeakMap<Construction,…>`) that are correct only under immutability-by-convention, unenforced.

### Parser (`src/parser/`) — a large but unusually well-instrumented rule accretion; **no rewrite justified**
- 9,335 lines; **134 rules in one flat first-match-wins array** where ~⅔ of entries carry prose justifying their *position* (99 ordering comments inside the array; 205 file-wide); **164** keyword bow-outs; 25 `'stop'` escalations.
- **The ordering defense is partly structural and genuinely good**: the shadow-matrix test runs every rule against the corpus, snapshots winners, and hard-gates divergent pairs against a reviewed 42-pair allowlist that `vitest -u` cannot silently absorb. It has **no 3-D counterpart** (ADR-3D-071's silent mis-build is exactly its catch profile).
- **Chokepoints that exist, hold** (8 winner post-passes, `normalizeUtterance`, the honesty batteries on both commit paths); the LLM seam (re-parse + full 9-gate battery on the LLM's output) is the strongest part of the design. The 3-D LLM path has **no gate battery at all**.
- `ParseContext` has grown to 18 fields including a small position-reading geometry engine (tangency classification at 3–5% tolerances) for deictic references — principled, locked by emitted assertions, but the deictic-vs-semantic boundary is unwritten and the tolerances are unregistered magic numbers.
- The 3-D parser independently evolved *better* properties (context-free rules, anchored regexes, a real exported tokenizer, `splitTopLevelTerms`) that never flowed back — the workspace's own controlled experiment favoring apply-time M1 resolution over parse-time context.

### Derived layers, store, tests — correctness holds; size-and-seam risks
- [App.tsx](../src/App.tsx) (2,421 lines): `submit()` is a **410-line orchestration pipeline inside a React component with zero direct tests** — the scenario harness *mirrors* the commit path by hand ("so scenarios can't drift from production" — mirroring-by-discipline is the drift risk it names). The biggest hole in the nets.
- [geoStore.ts](../src/store/geoStore.ts): four subsystems in one file (replay/fold engine, config search, sample core, fact-rewrite) + the actual store. Undo/redo remains structurally safe (verified). One asymmetry: single-fact `update` lacks `replaceGroup`'s settle/seed-advance parity — the ADR-241 class, edit-path edition.
- **Worker seam**: clean and honest (same module both sides, no forked algorithm), but the real `postMessage` protocol/cancel/respawn/12-s-budget path **never executes in tests**, and prod (worker, 12 s) vs tests (sync, ∞) is a thin but real tested-path ≠ shipped-path gap.
- **Detection honesty is genuinely converged**: one shared store sample core (converged → distinct → requirement → cross/extension filters, with the strict→relaxed ladder), engine-side re-filters as deliberate belt-and-braces. The ADR-256/295 program worked.
- **Theorem spine**: coverage/disposition map + b-corpus bucket semantics are better-engineered than most production test infra. Two flaws: the "pure" spine imports the store for `Fact`/helpers (belongs in a leaf module), and table.ts (2,327 lines) holds the evidence-predicate library it was meant to sit on.
- **Test architecture**: 315 test files; the corpus (288 scenarios, one 6,253-line file, append-at-head) is nearing a merge-conflict/authoring ceiling; the **fixtures net is the highest-leverage, lowest-cost net in the repo and is underused (5 fixtures)**. Regression escape routes: the App submit pipeline, the real worker path, Figure.tsx interaction wiring, budget-truncation behavior.
- Server parameterization (never forked) and cross-product isolation test: verified real.

## 6. Recommended program (operator picks; each item would be filed as an issue per docs/22 on approval)

**Tier 1 — the two structural investments that most reduce future ADR volume** (ranked by member-generation rate of the class they retire):

- **R1 — Build ADR-250's deferred mechanism: total span accounting at the winning-parse chokepoint** (closes G1). Every non-filler token span must be claimed by the winning parse, or the parse is refused/escalated. Retires the honesty-gate growth axis (~16 members incl. two P1s in the record's final week) *and* the gates' own false-positive/negative defects; the per-category satisfied-sets the gates already compute are the migration path. Size: significant parser-seam work; risk contained by the existing gate tests + corpus.
- **R2 — Finish ADR-338's direction: joint component solving as the default assignment semantics, not a rung** (closes G2). Partition each step's (and deferred set's) constraints into connected components over shared carriers; solve each component simultaneously from the pre-step basin; derive ownership from the component instead of negotiating it through the recruit ladder. Subsumes most post-231 M2 members (scale rescue, stage-0, soft-order capture, #258) instead of adding rungs beside them. Largest item here; needs its own design pass first (and would carry the Jacobian-based local solver ADR-338 notes `src/` lacks).

**Tier 2 — engine hygiene, cheap now, expensive after ten more mechanisms:**

- **R3 — Extract ONE `runFailureLadder()` and make every stage transactional** (fix case (C) to restore on failed verification; make the conflict-branch omissions explicit parameters). Removes the compensating guards; the three copies can't drift. Risk low-moderate: behavior locked by ~288 scenarios + 468 engine unit tests. *Do this before the next mechanism lands.*
- **R4 — `constraintKey()` identity unification** (or freeze constraints + dev assert reference-uniqueness). ~A day; kills a whole silent-failure class in ownership tracking.
- **R5 — Move the replay orchestration (`computeFold`/`runTail`/deferral/HOIST/sweeps) out of geoStore.ts** into a pure engine-side module; store becomes a thin consumer (~700 lines). Mechanical; the worker seam gets a natural home; add an intra-product import-direction test (engine ← store never).
- **R6 — Write the cross-layer ladder down as a numbered contract** (docs/17 §4 or `LADDER.md`) + a dev-only `lastLadderStage` on results + an integrity test asserting stage order on canonical figures. Near-zero risk; every future ADR says "inserts at stage 4b" instead of re-deriving the order.

**Tier 3 — parser consolidation (no rewrite):**

- **R7 — Extract the lexical atoms** (label-token, label-run, segment-pair, angle-triple, one number grammar folding `num`/`COEF`/`isNumChunk` into `NUMTERM`) and sweep the rules onto them — the ADR-3D-068 move ("convert the unreachable copies so the class can't re-open") applied to the 342-copy label token. Register the atoms in docs/17 §3. Closes G3's lexical half mechanically; shadow matrix + corpus make the sweep safe.
- **R8 — One bilingual keyword lexicon** with morphology handled once (final/medial kaf, vav spellings, plurals, ה/ב/ל/ו prefixes) + a generative stem×morphology test through `parse`. The מאונכים/נפגש/זוית classes each recurred because a stem was re-spelled per rule.
- **R9 — Fence `ParseContext`**: write the deictic-vs-semantic line into docs/17 (position-derived fields exist only to resolve pointing references and must emit a locking assertion); adding a ctx field becomes a registry event; prefer apply-time M1 resolution for statements about existing objects (the 3-D lesson).

**Tier 4 — testability seams + cross-product:**

- **R10 — Extract `submit()` from App.tsx** into a testable `src/app/submitPipeline.ts` (mechanical — it already runs against `useGeoStore.getState()`), then 5–10 pipeline tests (clarification routing, auto-bind loop, stale-re-read race). Closes the biggest net hole and retires the harness mirror.
- **R11 — Port the two missing defenses to 3-D** (shadow-matrix guard; LLM-path honesty gates) **and institutionalize the cross-product sibling audit**: docs/17 §6's sibling-audit line explicitly requires grepping the *other* product tree when a fix touches a keyword set, tokenizer, or binding predicate — the record shows ≥5 classes that paid twice.
- **R12 — Test-economy shifts**: new "builds green + verifies" regressions become **fixtures** (zero authoring) rather than scenarios; split scenarios-corpus.ts per-domain (shards already consume an array); direct unit tests for the numeric core; split the evidence-predicate library out of theorems/table.ts; move `Fact`/helpers to a leaf module.

**Tier 5 — docs:**

- **R13 — Truth-up the architecture docs**: update or demote docs/11 (declare M1 assertion semantics, the deictic exception, mixed source/IR); refresh docs/04 (still says "parser/UI still pending", 2026-06-10); the ladder contract (R6) lands in docs/17.

## 7. What was checked and found sound (no action needed)

Engine layering and purity (grep-verified); the M1 chain living at the apply boundary as docs/17 dictates; `radiusCircleForDistance` matching §2.2's own showcase; the orphan re-home sweep (M2 law i); M3 one-sampler + budgets; M4 pre-scans; derived-state/undo discipline; the detection sample-core convergence; the LLM re-parse seam + 2-D gate battery; server parameterization; cross-product isolation test; the shadow-matrix guard; the fixtures/b-corpus/validation-oracle designs; perf rules implemented as written (deadlines inside innermost loops, failing path cheaper than success).
