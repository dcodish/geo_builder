# 11 — Architecture as a Compiler Pipeline (revised: an incremental constraint interpreter)

_Last updated: 2026-07-24 (truthed-up by the [docs/23](23-architecture-review-2026-07.md) review — S4.3 of [docs/24](24-foundation-hardening-plan.md)). Original 2026-06-13._

A lens, not a new design — and the 2026-07 review found the lens **earned one expensive mistake and went stale in three places**, so this revision states the corrected model. What the system actually is: an **incremental, order-normalizing constraint interpreter** (deferral + HOIST assert that a statement's *position* in the list is presentation, not meaning — the opposite of an instruction stream), with **sampled model enumeration as its ground-truth semantics** (a relation is "true" when it holds in every valid configuration), fed by a **reference-resolving NL front end** whose meaning legitimately depends on the current model. Nearest relatives: a parametric-CAD kernel / SMT model enumeration — not `tsc`. The operative doctrine for day-to-day work is [docs/17](17-design-rules.md); this doc is the phase map.

**The four corrections (read these before applying the old lens):**

1. **Re-mention is assertion, never redefinition.** The original lens mapped `commandConflict` to a compiler's "redefinition error" (ADR-009) — in a language of *accumulating assertions about one figure*, a second mention of an id is almost always a **given**. That single framing decision generated the largest defect class in the project's history (~24 members across both products) and M1 (docs/17 §4) is precisely the retreat from it. The correct model: statements are constraints on one growing model; ids are names, not declarations.
2. **The phase boundary "the parser must not know about coordinates" is dead — deliberately.** The parser resolves *deictic* references («המעגל הגדול», «הימני», «נקודת ההשקה») from the drawn seed, under the three laws of docs/17 §3b (position-derived fields only for pointing references, every deictic read emits a locking assertion). The boundary that still holds: coordinates may resolve *reference*, never decide the *semantics* of a non-pointing statement.
3. **The stored artifact is a mix of source and IR, not "the source program".** Facts carry both the utterance and the lowered commands, because source is not deterministically recompilable (LLM steps, cost). Consequences the compiler frame hides: edits re-lower against their *position's* prefix context (ADR-241), saved files are parser-output snapshots audited for drift on load (ADR-242/314/321). A compiler recompiles from source; this system audits its own stale IR — by design.
4. **The solve ladder is part of the semantics.** Constraint satisfaction runs through an ordered cross-layer ladder (pre-gates → M1 chain → eager pick → evaluate escalation → failure ladder → deferral → HOIST → seed sweeps), written down in [docs/LADDER.md](LADDER.md). "Which mechanism fires" is observable (`StepResult.ladder`) and contract-tested.

> If you're new to the codebase, read [04-design](04-design.md) for the layer map and [docs/17](17-design-rules.md) for the working doctrine; this doc is a way of *seeing* it.

---

## 1. The phases, mapped to our modules

| Compiler / interpreter phase | What it does here | Where | Key decision |
|---|---|---|---|
| **Lex / tokenize** | keyword matching, filler stripping, `labelRun` reads point labels | `parser/parse.ts` | — |
| **Parse** (surface → IR) | `utterance → Command[]` via ordered rule choice (PEG-like) | `parser/parse.ts` (`RULES`) | [ADR-002](06-decisions.md#adr-002) |
| **The IR** | `Command[]` — a flat instruction stream (`square`, `point-on-segment`, `set-ratio`, `circumcircle`) | `engine/types.ts` (`Command`) | [ADR-001](06-decisions.md#adr-001) |
| **Semantic analysis / type-check** | `commandConflict` (redefinition), over-constraint & coincidence checks | `engine/step.ts`, `engine/evaluate.ts` | [ADR-009](06-decisions.md#adr-009) |
| **Evaluate / execute** | topological eval of the dependency DAG → coordinates | `engine/evaluate.ts` | [ADR-001](06-decisions.md#adr-001) |
| **Constraint solving** | a constraint drives a free DOF (`solveParam` finds the roots) | `engine/solve.ts`, `geometry.ts` | [ADR-014](06-decisions.md#adr-014) |
| **Back-end / codegen** | evaluated model → SVG primitives; swappable | `render/scene.ts`, `Figure.tsx` | [ADR-004](06-decisions.md#adr-004) |
| **Driver / incremental rebuild** | fact list = source program; `replay` recompiles it | `store/geoStore.ts` | [ADR-010](06-decisions.md#adr-010) |

So: a **front-end** (NL → IR) feeding a **constraint-based interpreter** (IR → a dataflow DAG → numerical evaluation), with a **retargetable back-end** (the renderer).

---

## 2. The decisions this lens explains

Several choices in the ADR log are textbook compiler/PL moves once you see them this way:

- **Constructive engine over the old template matcher ([ADR-001](06-decisions.md#adr-001))** is the canonical lesson: *a structured IR composes; ad-hoc pattern-matching dead-ends.* The template solver recognised whole shapes (peephole pattern-matching on the surface); the new engine has a real IR whose instructions compose (an inscribed shape is just `circle` + `on-circle`×n + `polygon`).

- **Parser-first, LLM-fallback ([ADR-002](06-decisions.md#adr-002), [ADR-023](06-decisions.md#adr-023))** is a two-tier front-end. The LLM is a **source-to-source desugarer**: it lowers freeform language into *canonical surface syntax*, which the real parser then re-parses. That's why we re-parse its output instead of trusting it — the deterministic grammar stays the single source of semantic truth (and the engine never knows which path produced the `Command[]`).

- **Deterministic ids (`seg-AB`, `circle-O`)** are **interning / hash-consing**: the same construct maps to the same node, so re-issuing a command is idempotent — i.e. common-subexpression elimination. (And resizing a circle re-states the same node, [ADR-026](06-decisions.md#adr-026)-adjacent.)

- **The store's replay model ([ADR-010](06-decisions.md#adr-010))** is **event-sourced re-evaluation**: the ordered fact list is the source program, `replay` recompiles it, positions are never stored, undo = recompile a prefix. A time-travel build system, not a mutable scene graph — which is *why* state and coordinates can't drift apart.

- **Swappable renderer ([ADR-004](06-decisions.md#adr-004))** is a **retargetable back-end**: the engine emits a target-independent model; lowering it to SVG (or Mafs, or PNG export) is codegen.

- **Anti-half-parse guard ([ADR-024](06-decisions.md#adr-024)) and the inscribed/incircle disambiguation ([ADR-027](06-decisions.md#adr-027))** are **grammar-ambiguity resolution** — the same class of problem as a parser choosing the right production for a token that two rules could claim.

---

## 3. Where it's *more* than a compiler

Two divergences are the heart of the product, and both are why a plain "interpreter" framing undersells it:

1. **There's a solver inside.** `set-angle` / `set-ratio` driving an on-segment `t` ([ADR-012](06-decisions.md#adr-012)/[ADR-014](06-decisions.md#adr-014)) is constraint propagation, not imperative execution. This makes the engine part **parametric-CAD kernel / equational language**, closer to a spreadsheet's recalc + a tiny equation solver than to `tsc`.

2. **Output is deliberately non-deterministic.** A line∩circle / circle∩circle has 0/1/2 solutions; the branch index selects one; "show another configuration" enumerates the next. A compiler emits *one* output; we emit *one model from a space of valid models* — like an SMT solver returning a model, or Prolog backtracking. The "alternatives" feature is **model enumeration**.

And it's **live, not batch**: incremental, interactive, re-evaluated on every fact — a live-programming environment / notebook, where "correct" means *satisfies the constraints*, not *matches a fixed target*.

---

## 4. Why the lens is useful as this grows

The payoff is that new features have an obvious home once you ask "which phase is this?":

- **Theorems (Phase 6)** are a **static-analysis pass.** `detect(figure)` runs over the evaluated value-graph and emits diagnostics — exactly like lint rules over an IR. The [pedagogy](10-pedagogy.md) "construction → theorem" trigger map is the rule set; "definite vs possible" is diagnostic severity; tracing a theorem to the facts that triggered it is **provenance / source-mapping**.

- **The `Command[]` layer is the home for any normalization/optimization pass** — dedup, canonical ordering, constant-folding a fully-determined sub-figure, or rewriting a verbose LLM emission into a tighter form. Today there's none; when we want one, it goes *between* parse and evaluate, touching neither.

- **New input surfaces are new front-ends** onto the same IR: a palette/menu, drag-to-construct, or a different language all just need to emit `Command[]`. The engine is agnostic — that agnosticism is the contract.

- **New constraints are solver cases, not new machinery** ([ADR-014](06-decisions.md#adr-014)): add a residual + refs + description; the driver and over-constraint check are unchanged. (`ratio` in [ADR-026](06-decisions.md#adr-026) was exactly this — one residual, no new point kind.)

- **Export / alternate render targets are codegen back-ends** ([ADR-004](06-decisions.md#adr-004)): PNG/SVG export (FR-HS-5) is lowering the same model to a different target.

**The one rule the lens enforces:** keep the phase boundaries clean. The parser must not know about coordinates; the engine must not know which parser produced its `Command[]`; the renderer must not reach back into the engine's internals. Every time we've honoured that (engine-agnostic input, swappable renderer, derived-not-stored positions) the system stayed easy to extend; the boundaries are the asset.

---

### Pointers

- [04-design](04-design.md) — the actual architecture this re-frames.
- [06-decisions](06-decisions.md) — the ADRs cited above.
- [10-pedagogy](10-pedagogy.md) — Phase 6 as a static-analysis pass over the value-graph.
