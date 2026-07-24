# 24 — Foundation hardening plan (robustness · scalability · accuracy · testability · quality)

_Status: **ACCEPTED 2026-07-24 (operator: "create a plan … we can always revert back to this point"). Nothing implemented yet. ⟵ RESUME with Phase 0 on operator go.**_
_Source of findings: [docs/23-architecture-review-2026-07.md](23-architecture-review-2026-07.md) (the commissioned review). Execution route: [docs/22-workflow.md](22-workflow.md) — each slice is a GitHub issue + its own PR branch; umbrella issue tracks the program. Doctrine: [docs/17-design-rules.md](17-design-rules.md) applies to every slice._

---

## 0. The safety spine (why a big fix is safe here)

- **Baseline tag:** `baseline/2026-07-24-pre-hardening` (= the review commit). Every slice's PR description names the tag; a slice that goes wrong is `git revert`-ed (never reset) back toward it. Prod deploys stay tag-gated per RUNBOOK — a bad slice can simply not deploy.
- **Behavior oracle:** the existing net (≈3,900+ tests: 288-scenario corpus + fixtures + validation oracle + b-corpus + shadow matrix) is the definition of "didn't break." Phase 0 *widens* the net exactly where the review found holes **before** any structural change, so the risky phases land on a stronger oracle than today's.
- **One slice = one PR = one revert unit.** No slice bundles with another; a slice's gate is the full suite + `tsc -b` + both builds + its own new class tests. High-risk slices (S3.2, S3.1) additionally run in **shadow/fallback mode** first (see their entries) so the old path remains live until evidence says otherwise.
- **Perf guard (docs/17 §7):** Phase 0 records baseline replay timings of the 3 hardest fixtures; every engine-touching slice re-measures and puts both numbers in its PR.

## 1. Dimension map (operator's axes → slices)

| Axis | Slices |
|---|---|
| **Robustness** (no silent breakage, mechanisms can't drift) | S0.2 ladder contract · S0.5 constraintKey · S1.1 one transactional ladder · S1.2 module boundaries · S3.2 joint solving |
| **Scalability** (adding vocabulary/features stops minting new defect members) | S3.1 span accounting (G1) · S3.2 joint solving (G2) · S2.1/S2.2 lexical layer (G3) · S2.3 cross-product travel · S4.1 test economy |
| **Accuracy** (nothing stated is ever silently dropped or wrongly solved) | S3.1 · S0.3 numeric-core tests · S2.2 morphology-once · existing verifier/oracle (already strong — unchanged) |
| **Testability** | S0.3 · S0.4 submit extraction · S4.1 fixtures-first + corpus split · S4.4 worker smoke (optional) |
| **Quality** (a new engineer/session can predict the system) | S0.2 · S1.2/S1.3 splits · S2.4 ParseContext fence · S4.2 leaf modules · S4.3 docs truth-up |

## 2. The phases

Sequencing rule: **net first, consolidation second, big fixes last** — each phase reduces the blast radius of the next. Sizes: S ≈ part of a session, M ≈ a session, L ≈ 2–3 sessions, XL ≈ needs its own design pass + multiple sessions.

### Phase 0 — Baseline + widen the net (no semantic changes)

| Slice | What | Size | Gate |
|---|---|---|---|
| **S0.1** | Tag `baseline/2026-07-24-pre-hardening`; record baseline replay timings of the 3 hardest fixtures into the umbrella issue. | S | tag pushed; numbers recorded |
| **S0.2** | **Write the cross-layer ladder contract** (review R6): a numbered stage list (pre-gates → M1 chain → eager pick → evaluate escalation → step ladder → deferral → HOIST → sweeps) as docs/17 §4b or `docs/LADDER.md`, documenting the CURRENT behavior including the three-copy divergences and case (C)'s persistence *as found*; + dev-only `lastLadderStage` on step results; + an integrity test asserting stage order on ~5 canonical figures. This is the faithful "before" map that S1.1 is verified against. | M | contract merged; integrity test green |
| **S0.3** | **Characterization tests for the numeric core** (R12 part): `nelderMead`, `multiStartSolve`, `drivenRoots`, `argMin`, `collapseBarrier`, `resolveMixedCarriers` strategy selection — lock current tolerances/grids/dedup so solver regressions get a local failure point instead of distant scenario flakiness. | M | new unit files green; no source changes |
| **S0.4** | **Extract `submit()` from App.tsx** into `src/app/submitPipeline.ts` (R10) + 5–10 pipeline tests (clarification routing, auto-bind loop, stale-store re-read race, gate wiring); retire the scenario harness's hand-mirror comment by pointing the harness at the real pipeline. Mechanical — it already runs against `useGeoStore.getState()`. | M–L | pipeline tests green; harness uses the real path |
| **S0.5** | **`constraintKey()` identity unification** (R4): one canonical key (or frozen constraints + dev assert of reference-uniqueness); sweep the reference-keyed and JSON-keyed sites onto it; a test that a `{...con}` clone at a directive boundary is either safe or loudly rejected. | S–M | class test proves the old silent failure now fails loudly |

### Phase 1 — Engine consolidation (robustness)

| Slice | What | Size | Gate |
|---|---|---|---|
| **S1.1** | **One `runFailureLadder()`** (R3): unify the three inlined copies ([step.ts:384–405 / 437–484 / ≈527–540](../src/engine/step.ts)); every stage transactional — **fix case (C) to restore on failed verification** and delete the downstream compensations; the conflict-branch omissions (no orphan sweep / no scaleRescue) become explicit parameters — kept if S0.2's investigation shows intent, removed if drift. Class tests: transactionality (removing a restore fails a test), same figure through all three former entry points. | L | S0.2 contract updated to the unified form; full suite green with any behavior deltas listed + justified in the PR |
| **S1.2** | **Move replay orchestration out of geoStore.ts** (R5): `computeFold`/`runTail`/deferral/HOIST/`firstSatisfyingSeed`/`meetsRequirements`/`findValidConfig`/`searchResample` + the sample core → engine-side `src/engine/replay/` (pure, already-extracted functions; fold caches move intact); store thins to state+actions; **add an intra-product import-direction test** (src/engine never imports src/store — the mechanical guard the review found missing). | L | store ≤ ~1,000 lines; direction test green; zero behavior delta (memo tests bit-identical) |
| **S1.3** | *(optional, after S1.2)* Finish the store/App split (configSearch/factRewrite modules; App sidebar components). Quality-only; schedule when convenient. | M | — |

### Phase 2 — Parser lexical layer (accuracy; closes G3)

| Slice | What | Size | Gate |
|---|---|---|---|
| **S2.1** | **Extract the lexical atoms** (R7): exported builders for label-token, label-run, segment-pair, angle-triple, and ONE number grammar (fold `num`/`COEF`/`isNumChunk` into `NUMTERM`); sweep `parse.ts` + `parse3.ts` rules onto them (the ADR-3D-068 move: convert even currently-unreachable copies so the class can't re-open); register the atoms in docs/17 §3; **add a guard test that greps rule source for re-inlined fragments** so a fresh copy is a red test, not a review catch. | L | shadow matrix + full corpus byte-stable (or deltas justified); guard test green |
| **S2.2** | **One bilingual keyword lexicon** (R8): verb/noun stems with morphology handled once (final/medial kaf, vav spellings, plurals, ה/ב/ל/ו prefixes); generative stem×morphology matrix test through `parse`. The מאונכים/נפגש/זוית recurrences become structurally impossible. | L | matrix test green both products |
| **S2.3** | **Cross-product defenses travel** (R11): port the shadow-matrix guard to `parse3`; add the `dropped*` honesty-gate battery to the 3-D LLM commit path; write the cross-product sibling-audit requirement into docs/17 §6 (a fix touching a keyword set / tokenizer / binding predicate greps the OTHER product tree — files the sibling issue). | M | 3-D shadow snapshot committed; 3-D gate tests green |
| **S2.4** | **Fence `ParseContext`** (R9): the deictic-vs-semantic doctrine line in docs/17 (position-derived fields only for pointing references, must emit a locking assertion); register the 18 fields + the 3%/5% tolerances; new ctx fields become ADR-worthy registry events. | S | docs/17 section merged |

### Phase 3 — The two structural investments (the "big fixes"; closes G1+G2)

| Slice | What | Size | Gate |
|---|---|---|---|
| **S3.1** | **Total span accounting** (R1, the deferred ADR-250 mechanism): every non-filler token span of an utterance must be claimed by the winning parse, else refuse/escalate. **Rollout in shadow mode**: the accountant runs alongside the existing ~16 gates, logging divergences over (a) the full catalog+corpus, (b) a prod-log replay via the log-triage harness — flipped to enforcing only when divergence = 0 on the corpus and the prod-log false-refusal list is operator-reviewed. Then the per-category gates become thin views over span accounting (deleted one by one, each deletion proven by its old tests still passing). | XL (design ½ session + L build) | shadow-mode divergence report; gate-family growth stops (the scoreboard §3) |
| **S3.2** | **Joint component solving as the DEFAULT assignment semantics** (R2, ADR-338's direction): partition each step's (and deferred set's) constraints into connected components over shared carriers; solve each component simultaneously from the pre-step basin; ownership *derived* from the component. **Staged with the ladder as live fallback**: (a) component partitioning + ownership derivation, observable via `lastLadderStage`; (b) joint-first with automatic fallback to the S1.1 ladder on failure — corpus must build identically or better, hardest-fixture timings within budget; (c) rung retirement one at a time (scale rescue, stage-0, steal/lend…), each retirement proven by the rungs' own tests passing under joint-first. Carries the Jacobian-based local solver ADR-338 notes `src/` lacks. **Needs its own design doc + ADR before code; operator sign-off on the design.** | XL (design 1 session + multiple build sessions) | corpus parity report per stage; rung count monotone ↓ |

*Order within Phase 3: S3.1 first (parser-side, contained, independently valuable), S3.2 second (benefits from S0.2+S1.1's unified instrumented ladder — replacing one documented ladder is far safer than replacing three implicit ones).*

### Phase 4 — Test economy + docs (continuous, interleave freely)

| Slice | What | Size |
|---|---|---|
| **S4.1** | Fixtures-first policy (new "builds green + verifies" regressions become `.geo.json` fixtures, scenarios reserved for bespoke checks — write the rule into docs/08 + CLAUDE.md); split `scenarios-corpus.ts` into per-domain files concatenated by the shards (kills the append-at-head merge hotspot). | M |
| **S4.2** | Leaf-module hygiene: `Fact`/`groupKey`/`commandPointIds` → `src/store/fact.ts` (theorem spine stops importing the store); evidence-predicate library out of `theorems/table.ts` → `theorems/evidence.ts`; single-fact `update` gains `replaceGroup`'s settle/seed-advance parity (the ADR-241 edit-path sibling). | M |
| **S4.3** | Docs truth-up (R13): docs/11 updated to the interpreter framing (M1 assertion semantics, the deictic exception, mixed source/IR) or explicitly demoted; docs/04 refreshed to the real current architecture; S0.2's ladder contract cross-linked. | M |
| **S4.4** | *(optional — operator decides; new CI dependency)* One Playwright smoke spec for the real worker path: submit a hard figure, cancel mid-search, assert recovery + the 12 s budget behavior. | M |

## 3. Program scoreboard (how we'll know it worked)

Measured at each phase boundary; recorded in the umbrella issue:

1. **G1 closed:** no new `dropped*` gate is ever needed again — the next newly-discovered syntactic category is caught by span accounting (S3.1's shadow log proves it pre-flip).
2. **G2 closed:** new coupling patterns solve without new rungs; ladder rung count is monotone non-increasing after S3.2(b).
3. **G3 closed:** zero new lexical-family members; the S2.1 guard test makes a re-inlined fragment a red test.
4. **Robustness:** the S1.1 transactionality class tests stand; the import-direction test stands; `constraintKey` test stands.
5. **Perf:** hardest-fixture replay within 1.25× of the Phase-0 baseline at every phase boundary (docs/17 §7 discipline).
6. **Testability:** submit pipeline + numeric core have direct tests; scenario-corpus file count > 1; fixtures count growing faster than scenario count.
7. **Cross-product:** every class-ADR since program start either audited the sibling tree or filed the sibling issue (spot-checked at phase boundaries).

## 4. Decision points reserved for the operator

1. **S3.2 design sign-off** — the joint-solver design doc/ADR before any code (the one genuinely high-risk item; the staged fallback keeps it revertible at every step).
2. **S3.1 flip to enforcing** — reviewing the prod-log false-refusal list before span accounting starts refusing real input.
3. **S4.4 yes/no** — Playwright as a new CI dependency.
4. **Pacing vs. the live queue** — P1s always preempt (docs/22); recommended default: one hardening slice per session-block, interleaved with the normal fix queue, Phases 0→1→2 in order, Phase 4 opportunistic.

## 5. Execution mechanics (per docs/22)

- Umbrella issue: **foundation hardening program** (label `debt`, apps `2d`+`3d`) holding the slice checklist + scoreboard; each slice files its own issue on start (`debt`, priority per its content) and lands as a PR branch `feat/<issue#>-slug` from a worktree, `Closes #NN`.
- Slices touching engine semantics (S1.1, S3.x) get the operator play-gate; mechanical/net slices (S0.x, S4.x) can self-merge per the workflow's normal rules after gates pass.
- Every slice's ADR names the class it closes and the chokepoint it shrinks (docs/17 §6); a slice that would *grow* a chokepoint list is mis-scoped — stop and re-derive.
