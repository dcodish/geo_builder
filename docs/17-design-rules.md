# Design rules — how to fix bugs in this codebase without degrading it

**Audience: the AI assistant (or human) working in this repo in a future session.** This document has
authority: it was commissioned by the operator (2026-07-06) after a review found that even
well-intentioned, test-locked fixes were accumulating special cases faster than they were removing bug
classes. CLAUDE.md's "root cause over symptom — NEVER PATCH" rule says *what* is required; this document
says *how to comply* — how to recognize that you are about to patch, where the general mechanisms live,
and what "done" means. When this document and your instinct disagree, follow this document or stop and
ask the operator.

## 1. The prime rule, operationalized

Every reported bug is an **instance** of a **class**. Your fix is judged by whether the class can still
happen, not by whether the instance is green.

Before writing any code, write one sentence of the form:

> "A **⟨category of statement⟩** about a **⟨category of object/state⟩** is **⟨wrongly handled how⟩**."

If your sentence names a specific figure, utterance, letter, or ADR-numbered feature ("Q11's second
tangent…", "when the word מעגל appears…"), you have described the instance, not the class. Widen it
until it names categories. Two real examples from this repo's history:

- Instance: "`O על ED` errors ''O' is already defined' when O is the incircle centre."
  Class: "**Any statement about an existing object** is executed as a **re-creation** instead of being
  **lowered to a constraint** on the existing object." (This class produced ADR-075, ADR-099, ADR-115,
  ADR-119, ADR-124, and the 2026-07-06 report — five separate sessions each fixed one member and left
  the class alive.)
- Instance: "`O1M=9` typed after the tangents fails over-constrained."
  Class: "**A given that pins a DOF** does not **transfer the DOF's existing obligations** to another
  free DOF — so satisfiability depends on entry order." (This class produced ADR-104, ADR-229, ADR-230,
  and finding F1 of the 2026-07-06 review.)

The grep test: after stating the class, **search for its siblings** (`grep` the codebase for the same
shape of code; scan `logs/debug-log.jsonl` for the same error family — the ADR-115 log-class audit is
the exemplar). A true class fix usually closes bugs nobody reported yet. If your fix couldn't possibly
close an unreported sibling, it is a patch.

## 2. Tripwires — you are patching if…

Stop and re-derive the class if any of these is true of the diff you are about to write:

1. **You are adding an `if`/carve-out/case to a chokepoint list** (§3). Growing one of those lists is
   the single most reliable patch signal in this repo's history.
2. **Your routing predicate encodes the observed failure condition, not the semantic fact.** Example of
   the disease (pre-consolidation ADR-230): routing a distance given by `radius.via === 'free' &&
   solve !== undefined` — "free AND busy" is *the state we happened to crash in*, not *what the
   statement means*. The semantic predicate is "this distance IS a radius" (`|centre·P|` with P on the
   circle) — true regardless of solver state. If your predicate would change meaning when an unrelated
   feature changes the solver's internal state, it is a symptom predicate.
3. **The same student utterance would mean two different things depending on hidden engine state.**
   One statement = one semantics. Engine state may change *how* it is satisfied, never *what* it asserts.
4. **You are adding a keyword bow-out** (`if (/circle|מעגל/.test(s)) return null;`) to stop rule A
   claiming rule B's input. Word-presence is not semantics; the fix is compound parsing or precedence
   with a leftover guard (ADR-024), never dropping a stated magnitude (see §6, honesty).
5. **You are writing a UI hint that tells the student to work around the engine** ("try entering the
   givens first"). A hint documenting a hole is a confession, not a fix.
6. **Your test locks the reported figure only.** A scenario for the operator's exact sequence is
   *required* (CLAUDE.md rule) but it is the floor. The class fix needs a class test: the same relation
   in permuted entry order, mirrored slots (`FD ⟂ AB` as well as `DF ⟂ AB`), the other rules that share
   the mechanism.
7. **You cannot say what NEW capability the engine gained.** A root fix adds or repairs a mechanism
   ("existing-id commands lower to constraints"); a patch adds an exception ("this figure no longer
   errors"). If the honest commit message is the second form, do not commit it.

When a tripwire fires and the correct fix looks large or unclear: **stop and present the operator the
class, the mechanism you believe is missing, and the scope options.** Do not ship the patch "meanwhile"
— a shipped patch removes the pressure that gets the mechanism built, and its test then *defends* the
patch against the mechanism.

## 3. Chokepoint registry — lists that must not silently grow

These are the places where per-case exceptions have historically accumulated. **Adding an entry to any
of them requires an ADR that first argues why the governing mechanism (§4) cannot absorb the case.**
The list itself is the smell: each is a point where a general decision is being made by enumeration.

| Chokepoint | Governing mechanism |
| --- | --- |
| `commandConflict` per-kind carve-outs (`src/engine/step.ts`) | M1 existing-id lowering |
| Parser per-rule "existing object" guards (tangent/incircle/chord/inscribe rules in `parse.ts`) | M1 |
| `recruitFreeDofs` case ladder (A–F) and its experiment ordering (`src/engine/step.ts`) | M2 carrier ownership |
| `keepTangencyDriven` / `applyRadiusGiven` routing (`src/engine/apply.ts`) | M2 |
| Keyword bow-outs between parser rules (`return null` on a word test) | parser precedence + leftover guard (ADR-024) |
| Sampling loops (any new `for (seed…) replay/evaluate`) | M3 one sampler, budgeted |
| Hard-coded defaults in shape macros (apex choice, right-angle vertex, equal pair) | M4 defaults yield to statements |
| Inline lexical fragments in parser rules (label token, number grammar, keyword morphology) | `src/parser/lexicon.ts` atoms + the `lexical-ratchet.test.ts` ceilings (S2.1 of docs/24 — counts may only go DOWN; compose new rules from the atoms) |

## 3b. ParseContext — the deictic/semantic fence (S2.4 of docs/24)

`ParseContext` (parse.ts) is a **registry**: adding a field is an ADR-worthy event, exactly like the
§3 lists. Its fields split into two regimes with different rules:

- **Semantic fields** are derived from the CONSTRUCTION (objects/constraints), never from drawn
  coordinates: `circles, centrePoint, points, circleMembers, concentric, neighbors, onSegment,
  midpointOf, lines, tangentAuxes, polygons, autoCenters, radiusSymbols, angleAliases,
  commonTangents, radiusOrder`. These may inform meaning freely.
- **Deictic fields** are derived from the DRAWN SEED's positions and exist **only to resolve
  pointing references** — what the student is looking at: `circleSizes` («הגדול/הקטן» first
  assignment), `circleXs` («הימני/השמאלי»), `circlePairPositions` (tangency classification, 3%
  tolerance), `circlePairTouches` («נקודת ההשקה», 5% tolerance), `parallels` (opposite-base
  resolution, ~0.3° tolerance — structurally justified for a trapezoid but measured positionally).

**The three laws of deictic fields:**
1. A deictic resolution must **emit a locking assertion** so sampling can never swap the referent
   afterward (the `resolveSizeQualifier` → `set-radius-order` precedent; a pointing word both refers
   AND asserts — the #102 ruling). A deictic read with no lock is a bug: the referent can silently
   change on "show another configuration".
2. Deictic fields never decide SEMANTICS of a non-pointing statement. If a rule wants coordinates to
   decide what a statement *means*, stop — that is the §2.2 tripwire, parser edition.
3. Prefer **apply-time M1 resolution** over a new ctx field when the statement is about an existing
   object (the 3-D parser's architecture: context-free rules, resolution at apply — it never needed
   a ParseContext at all). A new deictic field needs an ADR arguing why apply-time can't own it.

The tolerance constants (0.03 / 0.05 / 5e-3) are part of this registry — changing one changes parse
results and needs the same scrutiny as a rule change.

## 4. The designed mechanisms (where the general answer lives)

> **The cross-layer solve ladder is written down in [docs/LADDER.md](LADDER.md)** (S0.2 of
> [docs/24](24-foundation-hardening-plan.md)): the exact stage order from pre-gates to seed sweeps,
> with the `StepResult.ladder` trace as its observable and `ladder-contract.test.ts` as its lock.
> Every future mechanism ADR states "inserts at stage N.x" and updates that file.

**M1 — Existing-id lowering.** A command that would create an object whose id already exists is not a
conflict and not a re-creation: it **lowers to constraints on the existing object**, derived from the
command's own defining incidences (point-on-X → membership/collinearity constraint; derived point →
its defining incidences as constraints; circle re-statement → resize, ADR-011 family). Reuse semantics
(base corners, moves, line reuse) stay. The lowering lives in ONE place at the apply boundary — never
in individual parser rules. A parser rule may still choose a *better decomposition* when it knows the
target exists (ADR-115's dual), but correctness must not depend on every rule remembering to.

**M2 — Carrier ownership and handoff.** Every scalar DOF has at most one owning constraint at a time
(its `solve` directive). Three laws: (i) **pinning a DOF** (a size given, a freeze) must *re-home* the
obligations it owned via a general orphan sweep — satisfiability must not depend on entry order
(ADR-104's promise); (ii) **recruiter experiments are transactional** — a failed trial restores the
carrier state it mutated, exactly; (iii) **routing is by semantics** (§2.2) — what a given *is*
determines where it lands; the solver's current busy-state only determines what re-homing follows.
Bakes/freezes (ADR-229) must preserve or restore the directives of subsystems they did not deliberately
retire.

**M3 — One sampler, shared and budgeted.** Detection layers (shapes, relations, anything future) consume
ONE shared, facts-keyed sample set; no layer runs its own `for (seed) evaluate` loop. Every search loop
(seed sweeps, resample, config search) has a wall-clock budget, and a *failing* solve must cost no more
than a small multiple of a succeeding one (divergence early-out). A determined figure (0 shape DOF,
single variant) is sampled once, not N times. New solver features must state their worst-case
multiplier (restarts × seeds × passes) in their ADR.

**M4 — Defaults yield to statements (ADR-052 / ADR-114 / ADR-163).** Any unstated choice the engine
makes (apex, right-angle vertex, equal pair, configuration) is soft: it must yield to an explicit
statement, be varied by "show another configuration", or both. A default that survives a contradicting
statement is asserting a given the student never gave.

## 5. Diagnosis protocol (before any code)

1. **Reproduce from the log** (`logs/debug-log.jsonl` locally; the production sink records submits
   only) through the real `parse-with-context → facts → replay` path — a scratch script, not the UI.
2. **State the class** (§1) and **grep for siblings**.
3. **Locate the mechanism**: which of M1–M4 (or which missing mechanism) should own this? If the answer
   is "none — it's genuinely local", say so in the ADR and prove it by showing the class has one member.
4. **Decide scope with the operator when in doubt** (CLAUDE.md rule 4). Present: the class sentence,
   the mechanism, what the full fix touches, what the interim state is if deferred. Never present a
   patch as one of the options.

## 6. Definition of done

- The **mechanism** is fixed or created; the chokepoint list did not grow (or an ADR justifies why).
- **Class tests**, not just the instance: entry-order permutations for anything touching M2; slot/order
  mirrors for anything positional; both locales for anything parsed.
- The **operator's exact sequence** is a scenario in `src/__tests__/scenarios.test.ts` + indexed in
  `docs/test-scenarios.md` (non-negotiable, CLAUDE.md).
- **Sibling audit** recorded in the ADR: what you grepped, what you found, what you fixed or filed.
- **Honesty invariants hold**: no stated magnitude is ever silently dropped (a given parses to a
  constraint, escalates, or errors — it never vanishes); everything the student stated is visible on
  the figure (labels/marks); error messages name the conflicting *statement*, not internal state.
- **ADR names the class**, the mechanism, and the root cause in one paragraph; the commit message
  states the root cause (CLAUDE.md rule 5).
- Full suite green, build clean, no `.only`/skips (readiness gate).

## 7. Performance rules (so speed doesn't rot back)

- Any loop that calls `replay`/`evaluate` more than once takes a deadline parameter. No unbudgeted
  sweeps (the 2026-07-06 review found `resample` frozen for 28 s on a hard figure because it was the
  one loop without a budget).
- The failure path must be cheaper than the success path, never ~10× dearer: solvers early-out on
  divergence; searches check their deadline *inside* the innermost replay loop.
- New layers never add a second sampler (M3). If you need samples, take the shared set.
- Before adding a solver feature, measure one `replay` of the hardest locked scenario before/after and
  put both numbers in the ADR. A correctness feature that doubles replay cost needs the operator's
  sign-off, not silence.

## 8. Escalation template (when the right fix is too big for the session)

Post to the operator, verbatim structure: **Class** (one sentence) · **Mechanism** (which of M1–M4, or
the missing one) · **Full fix** (files, risk, rough size) · **What stays broken meanwhile** (honest) ·
**Recommendation**. Do not attach a patch. The operator decides; "the big correct fix is always the
right thing" (CLAUDE.md) — the only acceptable deferral is the operator's explicit one.
