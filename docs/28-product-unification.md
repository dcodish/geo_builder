# 28 — Product unification: making three tools feel and behave like one

> **Status: WORKING DRAFT — not accepted, not scheduled, nothing here is executable.**
> No ADR has been written for it. The operator asked for a draft to iterate on before any of it is
> committed to; tracking issue [#648](https://github.com/dcodish/geo_builder/issues/648).
> §8 carries what is still open.
>
> **§4 was ruled on by the operator on 2026-08-16 and is no longer a fork** — separate builders at
> separate links, one learned interface, a toolbar switcher. That ruling added a second row family
> to §6 (interaction contracts), which is the draft's main change since the first pass.
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

## 4. RESOLVED — separate builders at separate links, one learned interface

**Operator ruling, 2026-08-16:**

> *"i will eventually have 4 or maybe even more builders that should all look and feel the same but
> in reality they are accessed via different links. we might have a toolbar on the ui to switch
> between them but thats it. so from a user pov he should be familiar with the tool and how to use
> it and what to expect."*

**Decided.** Each builder keeps its own entry, build, `dist-*`, and prod path. There is **no
merge into one app with modes** — that option is rejected, not deferred. Navigation between builders
is an ordinary link in a shared toolbar.

This is the low-risk branch, and it leaves the operator's *"I cannot afford impacting the 2-D and 3-D
in prod"* constraint intact: no product's URL, bundle, routing or deploy topology changes.

**Three consequences that shape everything below, and the third is not obvious:**

1. **The product switcher is itself a shared shell surface** — already named in ADR-W-016's rule-1
   seed list. It must be **data-driven, never import-driven**: `shell/` may not import a product
   tree (a forbidden edge in `BOUNDARIES.json`), so the roster of builders is configuration — name,
   URL, icon, per locale — handed in by the caller. Four-plus builders is exactly the case where a
   hand-maintained roster drifts, so the roster wants one home and a test that every declared
   product appears in it.

2. **The bar is "familiar", not "identical".** The engines differ by design (§2) and always will.
   A student who has used the 2-D builder should find the 3-D one's *frame* already learned — the
   same header, the same input box and palette behaviour, the same fact list, the same
   configuration cycling, the same save/load, the same error voice — while the *subject matter*
   inside is different. That is a statement about the shell and about interaction behaviour, not
   about geometry.

3. **"What to expect" makes UX consistency a testable contract, not a style guide.** This is the
   part that changes §6. If a student learns *"press this to see another configuration"* in 2-D and
   the complex builder either lacks the control, places it elsewhere, or makes it mean something
   subtly different, the tool has broken the promise the ruling makes — and nothing in the repo
   would currently catch it. The correctness doctrine (§1c) and the interaction contract are two
   row families of one mechanism, and this ruling is what puts the second family on the list.

**What was rejected, recorded so it is not re-litigated:** one app with modes (one URL, one bundle,
a mode switcher). It buys a shared session and cross-builder figures, and costs a change to both
shipped products' entry, routing, store bootstrap and deploy topology — precisely what ADR-W-016 was
written to avoid while they are stable, and it cannot be delivered incrementally.

**One rule kept anyway, because it is free:** `shell/` should not *assume* a single product per page.
Nothing plans to exploit that, but writing the frame parameterized rather than hard-wired costs
nothing today and is the difference between "we chose not to" and "we cannot".

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
**Only after complex has proved `shell/` in prod.** One surface at a time, each its own PR and its
own revert unit, sibling builds green at every step, tokens first (the highest-visibility,
lowest-risk surface), then the frame + switcher, then the rest of the seed list.

Under the §4 ruling this phase is bounded: it changes what the shipped products *import*, never
their entry, routing, bundle or prod path.

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

**Two row families**, per the §4 ruling. The correctness family was always the point; the
interaction family exists because *"the user should be familiar with the tool and what to expect"* is
a promise that four-plus builders can break silently.

### Family 1 — correctness contracts

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

### Family 2 — interaction contracts (the §4 ruling's half)

What a student learns once and expects everywhere. Each row is *"this control exists, is reachable
the same way, and means the same thing"* — or an explicit `n/a` with a reason.

- **The utterance input**: same position, same submit behaviour, same symbol palette (shared
  vocabulary + per-builder extension, the operator's ruling on
  [#525](https://github.com/dcodish/geo_builder/issues/525)), same live preview, same RTL/bidi
  handling of the student's own text ([#482](https://github.com/dcodish/geo_builder/issues/482)).
- **The fact list**: same place, same enable/disable, same edit and undo semantics, same rule that
  restating a known fact adds no row ([#613](https://github.com/dcodish/geo_builder/issues/613), the
  operator's *"true to all tools"*).
- **"Show another configuration"**: present wherever the builder has free DOFs, same label, same
  meaning — cycle an unstated choice, never change a stated one.
- **The DOF cue**: same place, same semantics for "fully determined".
- **The commands/coverage panel**: driven by that builder's own catalog, presented identically.
- **Save / load**: one envelope shape, one naming convention, one load audit, one file-suffix
  convention per builder.
- **Error voice**: a refusal names the conflicting *statement*, never internal state — the same
  sentence shape in every builder.
- **The product switcher**: same position, same roster, in every builder.

An `n/a` here is normal and healthy — "show another configuration" means nothing in a builder with
no free DOFs. What the matrix forbids is the *unexamined* cell: a control that exists in three
builders and was simply never considered in the fourth.

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
from complex and split per surface. The §4 ruling caps how far it can go: imports change, entry
points and deploy topology do not.

**The cost of waiting**, stated so the choice is symmetric: ADR-W-016's own argument is that a third
copy *"re-drifts on the first divergent edit — which already happened"* and turns the later
unification into a three-way reconciliation. Analytic would make it four-way. Every complex slice
landing now is written against no shared floor.

---

## 8. Open questions — must be answered before this becomes a plan of record

**Answered 2026-08-16 — kept here as the record:**

- ~~One app, or separate builders?~~ **Separate builders at separate links, with a toolbar
  switcher** (§4). One app with modes is rejected, not deferred.
- ~~Does `shell/` own the app frame, or only its parts?~~ **The frame**, which follows from the
  ruling rather than being decided separately: a switcher in every builder's toolbar is a frame the
  builders share, not a widget each one hosts. *Flagged as a reading of the ruling — correct it here
  if the intent was narrower.*

**Still open:**

1. **What is the visual target?** Adopting the 2-D look (the only documented design system, and the
   token source ADR-W-016 names) — or a new one designed once for all four-plus builders? The draft
   assumes the former; the latter is a design project, not a refactor, and the §4 ruling
   ("all look and feel the same") raises the stakes without settling which look wins.
2. **§6: derived or hand-maintained rows**, and does the matrix start with one family or both?
   Starting narrow is cheaper; starting narrow also means the first run's failure list understates
   the real gap.
3. **Does phase 2 block on phase 1?** They are independent. Running phase 2 first means the failure
   list exists before any code moves.
4. **When products disagree, does the stronger mechanism become an obligation?** Complex's span
   accounting vs the older `dropped*` families: is `satisfied:` satisfied by *any* mechanism that
   holds the property, or does the best-known mechanism become the bar? The draft assumes the
   former — the latter turns every improvement into N-1 obligations, which would make improving
   anything expensive.
5. **Where does the switcher's roster live**, and what pins it? (§4 consequence 1 — configuration,
   not imports; four-plus builders is where a hand-maintained roster drifts.)

---

## 9. What this document does NOT propose

- Merging or sharing any engine code (§2).
- Changing `BOUNDARIES.json`'s copied-never-shared rule for `engine`.
- Touching `src/` or `src3d/` in phases 1–2.
- A big-bang refactor. Every phase is independently revertible, and phase 3 is per-surface.
- **Any change to the products' URLs, entry points, bundles or deploy topology.** Ruled out by §4:
  the builders stay separate apps at separate links, and the switcher is a link in a shared toolbar.
