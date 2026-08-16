# 28 — Product unification: making three tools feel and behave like one

> **Status: WORKING DRAFT — not accepted, not scheduled, nothing here is executable.**
> No ADR has been written for it and no issues have been filed. The operator asked for a draft to
> iterate on before any of it is committed to. §8 carries the questions that must be answered
> before this becomes a plan of record; §4 is a genuine fork, not a recommendation with a preferred
> branch already chosen.
>
> Drafted 2026-08-16. Every number in §1 is measured at `main` @ `397e8e5`, not estimated.

---

## 1. The problem, measured

The operator's report (2026-08-16):

> *"we now have 3 tools but each has its own ui and look and feel is a bit different so they don't
> feel like one tool… should we continue on this route or step back a sec and do some ordering and
> ensure we have a robust product that doesn't fix one item in 2d just to realise we should have
> also done it on other tools, or worse — we fix in one tool and break in another."*

That is three distinct complaints, and they have three different answers. Measured:

### 1a. The chrome genuinely diverges

| surface | `src/` (2-D) | `src3d/` (3-D) | `src-complex/` |
| --- | --- | --- | --- |
| design tokens | `ui/theme.ts` | **none** | **none** — a third palette in `styles.css` (warm stone vs the siblings' slate) |
| inline hex colours in the app file | **194** | 42 | on a third styling stack (CSS file, not TS tokens) |
| `ui/` directory | `Modal.tsx`, `symbols.ts`, `theme.ts` | `symbols3.ts` only | no `ui/` at all |
| i18n bootstrap | `i18n/index.ts` | `i18n/index3.ts` | `i18n/index.ts` — ~25 lines, written **three times** |
| bidi isolation | in the format layer | `i18n/bidi.ts` | absent |

[ADR-W-016](06w-decisions-workspace.md#adr-w-016) recorded the behavioural half on 2026-08-15: the
load audit (ADR-242 / ADR-3D-087 — complex has neither), save naming (ADR-274/286 — complex's store
comment claims a convention its code does not implement), the in-app privacy note (NFR-SE-3, absent
in a publicly linked product), the build stamp, usage logging, and the palette-as-assertable-module,
whose whole point `src-complex` reversed on day one by re-inlining it. **Each has now been
implemented-or-forgotten three times.**

This is the half the operator can see. It is also the half that is already decided and simply not
built — see §5 phase 1.

### 1b. The engine does NOT meaningfully duplicate

| tree | engine LOC (excl. tests) | reasons about |
| --- | --- | --- |
| `src/engine` + `src/replay` | ~15,300 | 2-D points, circles, chords, constructive DOF |
| `src3d/engine` | ~10,900 | vectors, planes, solids, LM solve |
| `src-complex/` (model+solve+replay) | ~4,900 | log-polar carriers, exact ℚ arithmetic |

A circle-circle intersection and a plane-normal resolution are not the same code wearing different
names. [ADR-W-003](06w-decisions-workspace.md#adr-w-003)'s *engine is copied, never shared* is
**correct and this draft does not propose changing it.** Sharing that layer is the speculative
generality ADR-W-003 was written to prevent, and [ADR-W-004](06w-decisions-workspace.md#adr-w-004)
already states why copying is right there: *"the check IS the mechanism."*

### 1c. The doctrine is duplicated in PROSE — which is the real defect

The thing that actually produces "we fixed it in 2-D and should have done it in 3-D too" is neither
chrome nor engine. It is the layer between them: the *contracts* every product is supposed to
honour — honesty gates, ADR-052 DOF accounting, M1 drive-or-check duality, the solve ladder,
requirement gates, branch/configuration cycling.

Measured evidence that it transfers only by human memory:

- **51 distinct 2-D ADR ids are cited from the 3-D log**, across **70** "the 2-D…" references. The
  3-D log is substantially a re-derivation of 2-D decisions.
- **The honesty-gate family is asymmetric, and nobody can currently say which gaps are deliberate:**

  | tree | gates | names |
  | --- | --- | --- |
  | `src/parser` | **18** | `droppedCirclePredicate`, `droppedComparison`, `droppedCompoundRelation`, `droppedConstructNoun`, `droppedGivenNumbers`, `droppedGivenRelations`, `droppedGivenVerbs`, `droppedMidsegment`, `droppedNewLabels`, `droppedRadiusSymbol`, `droppedRegionSubject`, `droppedShapeNoun`, `droppedWordRelations`, `statedConvexity`, `statedDims`, `statedRadiusSymbols`, `statedSideLength`, `statedVerbOperands` |
  | `src3d/parser` | **8** | `droppedConstructNoun`, `droppedGivenNumbers`, `droppedNewLabels`, `droppedShapeNoun`, `droppedTriShape`, `statedQuadBase`, `statedTriShape`, `statedTriShapeWord` |
  | `src-complex/` | **0 of this family** | uses **total span accounting** (`parser/span.ts`) instead |

  Some of the 2-D↔3-D gap is legitimate — 3-D has fewer construct families. But **no artifact
  records which of the ten missing gates are deliberate and which are oversights.**
  [#555](https://github.com/dcodish/geo_builder/issues/555) is one confirmed oversight: the sequence
  gate is absent in 3-D, and its 2-D twin was a **P1** that committed the negation of a stated
  betweenness under a green ✓.

- **The solve ladder is documented twice** ([LADDER.md](LADDER.md), [LADDER-CX.md](LADDER-CX.md))
  and **3-D has no ladder document at all**, despite every 3-D mechanism ADR being required to name
  the stage it inserts at.

**A finding worth stating on its own, because it inverts the obvious framing:** `src-complex`'s zero
`dropped*` gates is not a hole. Total span accounting — every non-filler token span claimed or the
parse refuses — is a *structurally stronger* mechanism than eighteen post-hoc vetoes, and it fails
closed. On the property "no stated magnitude is ever silently dropped", the three products rank
**complex > 2-D > 3-D**, and the newest product has the best answer. Any conformance artifact must
therefore be written over **properties, not implementations** (§6), or it will force the two shipped
products' weaker mechanism onto the one that got it right.

### 1d. "Fix in one, break another" — already solved this morning

[ADR-W-017](06w-decisions-workspace.md#adr-w-017) (2026-08-16) added `npm run check:siblings`: a diff
refusal on shipped siblings' files (escape hatch is a *reason*, `ALLOW_SIBLING_EDIT="why"`, not a
flag) plus the sibling builds run regardless of the diff, to catch shared-surface breakage the diff
cannot see. ~10 seconds.

**This draft proposes nothing here — that half is done.** It closes *breaking* a sibling. It does
nothing about *forgetting* one, which is §1c and the substance of this document.

---

## 2. What must stay per-product, permanently

Recorded so that no phase below is read as proposing otherwise:

- **Engine, model, solver, replay, scene, parser rules and catalogs** — copied, never shared
  (ADR-W-003, ADR-W-004). The sibling *audit* spans the trees; the *code* does not.
- **Locale files, ADR logs, fixtures, deploy targets, CI lanes, save-file suffixes** — per-product
  by [docs/22 §9](22-workflow.md).
- **A product never imports another product's tree.** `BOUNDARIES.json` is the authority and
  `server/__tests__/isolation.test.ts` reads it.

---

## 3. The three layers, and the honest verdict on each

| layer | duplicated? | verdict |
| --- | --- | --- |
| **Engine** | No — different mathematics | **Leave alone.** Copying is correct. |
| **Chrome / shell** | Yes, three times, visibly | **Share it.** Already decided (ADR-W-016), not built. |
| **Doctrine / contracts** | Yes, in prose only | **Make it enumerable and checkable.** No mechanism exists today. |

---

## 4. THE OPEN FORK — one app, or three that match?

**This is the operator's decision and the draft deliberately does not pick.** It changes what phase 3
even means.

### Option A — three builds sharing chrome
Each product keeps its own entry, build, dist and prod path (`/geo-builder/`, `/3d-builder/`, …).
`shell/` makes them look identical and behave identically at the edges: same header, same tokens,
same save/load audit, same privacy note, same palette behaviour.

- *Buys:* the visible complaint, at low risk. No change to any product's URL, deploy, or bundle.
- *Costs:* a student with a geometry question and a vectors question still visits two addresses.
  "One tool" is a resemblance, not a fact.
- *Prod risk:* lowest. Compatible with the operator's *"I cannot afford impacting the 2-D and 3-D in
  prod"* constraint essentially unchanged.

### Option B — one app with modes
One URL, one bundle (or lazy-loaded per mode), a mode switcher. The products become *modes* of one
Builder; `shell/` becomes the app itself rather than a library it imports.

- *Buys:* genuinely one product. A shared session, one save-file envelope, one commands panel that
  can say "this belongs to the 3-D mode", plausibly cross-mode figures later.
- *Costs:* touches both shipped products' entry, routing, store bootstrap and deploy topology —
  exactly what ADR-W-016 was written to avoid doing while they are stable. Bundle size, and a
  regression in one mode is now a regression in *the* product.
- *Prod risk:* high, and it cannot be delivered incrementally in the way Option A can.

### Option A→B (the fork's third branch)
Do A now; keep B possible by writing `shell/` so it owns the app frame rather than being decoration.
The cost of keeping B open is a rule, not code: **`shell/` may not assume a single product per page.**

*My read, offered as input and not as the decision:* the operator's complaint is aesthetic and
consistency-shaped ("look and feel is a bit different", "don't feel like one tool"), which A answers
in full. B answers a question nobody has yet asked — whether a student wants one address. **A→B**
costs nothing extra today and forecloses nothing.

---

## 5. Proposed order of work

Phased so that each phase is independently valuable and independently revertible. **Nothing here is
scheduled; §8 must be answered first.**

### Phase 1 — build `shell/`, complex consumes it *(already decided; just not built)*
[#617](https://github.com/dcodish/geo_builder/issues/617), slice S0 of the complex rebuild
(ADR-W-016). Creates `shell/`, the `BOUNDARIES.json` edges, and the CI lane. **Zero risk to 2-D and
3-D: neither tree changes.**

Urgency independent of this document: `ci.yml` contains **zero** occurrences of "complex" while S1,
S2, S3 and the engine switch have all merged into that tree. Four slices have landed unguarded.

*Gate:* isolation + docs-hygiene green; 2-D and 3-D bytes unchanged; `check:siblings` clean.

### Phase 2 — the doctrine conformance matrix
The new mechanism. Design in §6. Independent of §4 — it is worth building under either option.

*Gate:* the matrix's first run is expected to FAIL, and that failure is the deliverable — it names
every contract a product does not answer for. Nothing is fixed in this phase; unexamined cells become
issues.

### Phase 3 — the shipped products adopt `shell/`
**Only after complex has proved `shell/` in prod**, and its shape depends on §4. One surface at a
time, each its own PR and its own revert unit, sibling builds green at every step, tokens first
(the highest-visibility, lowest-risk surface).

*Gate:* per surface — `npm run test:full`, both sibling builds, and an operator play of both shipped
products before the next surface starts.

### Phase 4 — analytic geometry starts on the shared floor
`src-analytic/` is deliberately last ([ADR-CX-001](06d-decisions-complex.md) D5). If phases 1–3
land first, it is the first product that never has to re-derive the doctrine or re-implement the
chrome — which is the whole return on this work.

---

## 6. The conformance matrix (phase 2, design sketch)

**Not shared code.** A shared *checklist with teeth*: the contracts listed once, each product
answering for itself, a missing answer made loud instead of invisible.

**Shape.** One manifest — properties as rows, products as columns; each cell is one of:

| cell | meaning |
| --- | --- |
| `satisfied: <mechanism>` | the product honours the property, naming the code that does it |
| `n/a: <reason>` | the property cannot arise here (e.g. a 2-D-only construct family) |
| `absent: <issue#>` | a known, tracked gap |
| *(unset)* | **fails the test** — nobody has looked |

The fourth state is the entire point. Today a 3-D gate that nobody thought about is
indistinguishable from one deliberately omitted; this makes them different objects.

**Properties, not implementations** (per §1c's finding). Rows are written as claims about behaviour:

- *No stated magnitude is silently dropped.* — 2-D `satisfied: 18 dropped*/stated* gates`;
  3-D `satisfied: 8 gates` + the unset cells that fall out of the 2-D list; complex
  `satisfied: total span accounting, fails closed`.
- *A statement whose point SEQUENCE is its semantics is not reordered by the LLM seam.* — 2-D
  `satisfied: restoreStatedSequences`; 3-D `absent: #555`; complex `unset`.
- *Every unstated magnitude is a free DOF, never a fixed default* (ADR-052).
- *A recognized ambiguity surfaces a typed refusal rather than declining to the LLM lane*
  (ADR-3D-131 / [#519](https://github.com/dcodish/geo_builder/issues/519)).
- *An error message names the conflicting statement, never internal state* (ADR-276).
- *Restating a known fact adds no row* — the operator's 2026-08-16 ruling on
  [#613](https://github.com/dcodish/geo_builder/issues/613), explicitly *"true to all tools"*, and
  the first contract to enter the matrix already scoped cross-product.
- *A saved file replays to the same figure; positions are never stored* (ADR-232).
- *The load audit reports what it could not restore* (ADR-242 / ADR-3D-087).

**Where it lives.** `server/__tests__/` — the `isolation.test.ts` precedent, so it runs in **every**
per-product lane and a product cannot skip its own row by staying in its lane.

**Precedents in-repo, so this is not a new pattern:**
- [ADR-W-003](06w-decisions-workspace.md#adr-w-003) — classification is **total**; an unclassified
  directory fails the test.
- [ADR-W-006](06w-decisions-workspace.md#adr-w-006) — a mirror's contract is **derived** from the
  mirrored source, never enumerated by hand.
- [ADR-W-017](06w-decisions-workspace.md#adr-w-017) — an unrecognised path is **shared, never
  inert**; unknown-by-default must mean "check it".

**Explicitly NOT this:** a shared honesty-gate *implementation*. That would drag `src-complex`'s
stronger span accounting down to the older products' post-hoc vetoes, and it would put engine-layer
code in a shared tree, which §2 forbids.

**Open sub-question:** derived or hand-maintained? ADR-W-006 argues derived, but the properties above
are not mechanically extractable from code — a hand-written row set with a mechanical
*completeness* check (every product answers every row) may be the honest compromise. §8 Q4.

---

## 7. Risk, and the operator's standing constraint

> *"i cannot afford impacting the 2d and 3d in prod… i will later have this unification discussion."*
> — operator, 2026-08-15, recorded verbatim in ADR-W-016

Phases 1 and 2 respect this **completely**: phase 1 changes zero lines of `src/` or `src3d/` by
construction, and phase 2 adds a test that reports, and changes no product behaviour.

Phase 3 is the first phase that edits shipped products, which is why it is gated on prod evidence
from complex and split per surface. Under Option B, phase 3 is a different and much larger animal —
another reason §4 must be answered before phase 3 is scoped, though **not** before phases 1–2 run.

**The cost of waiting**, stated so the choice is symmetric: ADR-W-016's own argument is that a third
copy *"re-drifts on the first divergent edit — which already happened"* and turns the later
unification into a three-way reconciliation. Analytic would make it four-way. Every complex slice
landing now is written against no shared floor.

---

## 8. Open questions — must be answered before this becomes a plan of record

1. **§4: Option A, B, or A→B?** The one that changes the shape of everything downstream.
2. **Does `shell/` own the app frame, or only its parts?** (Header, error/notice banners, DOF cue,
   About/privacy modal, product switcher — ADR-W-016's rule-1 seed list includes the frame; that
   only matters under A→B or B.)
3. **What is the visual target?** Adopting the 2-D look (the only documented design system, and the
   token source ADR-W-016 names) — or a new one designed once for all three? The draft assumes the
   former; the latter is a design project, not a refactor.
4. **§6: derived or hand-maintained rows**, and does the matrix start with the honesty family alone
   or the full contract set? Starting narrow is cheaper; starting narrow also means the first run's
   failure list understates the real gap.
5. **Does phase 2 block on phase 1?** They are independent. Running phase 2 first means the failure
   list exists before any code moves — which is arguably the better order for deciding §4.
6. **Who owns the doctrine rows** when products disagree — e.g. complex's span accounting vs the
   older `dropped*` families? Does a stronger mechanism in one product become an obligation on the
   others, or is `satisfied:` satisfied by any mechanism that holds the property?

---

## 9. What this document does NOT propose

- Merging or sharing any engine code (§2).
- Changing `BOUNDARIES.json`'s copied-never-shared rule for `engine`.
- Touching `src/` or `src3d/` in phases 1–2.
- A big-bang refactor. Every phase is independently revertible, and phase 3 is per-surface.
- Any change to the products' URLs or deploy topology — unless §4 resolves to Option B, which is
  precisely why §4 is a question and not an assumption.
