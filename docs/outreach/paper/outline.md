# Paper Outline (evolving)

A working skeleton for the paper / thesis chapter. Not committed to a venue yet; restructure freely. The point is to give every result and theory note a home so nothing is orphaned.

## Working title

*Geo Builder: a constructive degrees-of-freedom engine for incremental natural-language geometry construction* (placeholder).

## The argument in one line

Representing a figure as a **DOF-classified dependency graph** — rather than matching whole-shape templates — is what makes **incremental building, adaptation, alternatives, and stability** possible; and each of those "features" is a **consequence of the representation**, not a bolted-on mechanism.

## Sections

1. **Introduction** — the interaction (a student describes a construction in Hebrew/English and watches it form one constraint at a time); why existing tools (template matchers; and, differently, DGS like GeoGebra) don't support *this* incremental, natural-language, alternative-aware flow; contributions.
2. **Related work**
   - *Solver side:* Geometric Constraint Solving; DOF analysis (Kramer); rigidity theory (Laman); how production GCS differs (Newton/Levenberg–Marquardt). → draws on [`01-methods-and-mathematical-lineage.md`](01-methods-and-mathematical-lineage.md).
   - *Interaction side:* dynamic geometry systems; natural-language geometry input.
3. **Architecture** — the compiler-pipeline lens (front-end ‖ LLM desugarer → IR → constraint interpreter → retargetable renderer; event-sourced replay driver). → [`../11-architecture-as-compiler.md`](../11-architecture-as-compiler.md).
4. **The representation** — free / on-object / derived points; the dependency DAG; the DOF ledger and the similarity gauge; "no fixed assumptions."
5. **Evaluation & constraint solving** — topological + fixed-point evaluation; drive-or-check; the numeric core (bisection; derivative-free nonlinear least squares; multi-start; Tikhonov regularization for stability); over-constraint detection. → the Methods prose in [`01-*`](01-methods-and-mathematical-lineage.md).
6. **Alternatives as model enumeration** — branches + seeded resampling + reflection DOFs; why this falls out of the representation.
7. **Order-independence & stability** — replay with deferral; persistent parameters.
8. **Correctness / verification** — the givens verifier (runs in production) + the independent closed-form oracle (dev/CI); the machine-epsilon agreement result.
9. **Pedagogy** — what the construction→theorem model teaches. → [`../10-pedagogy.md`](../10-pedagogy.md).
10. **Results** — corpus coverage (bagrut Q1–Q7), test counts, the oracle sweep, bilingual coverage.
11. **Limitations & future work** — under-determined partial figures; the reverted global solver; Phase 6 (theorems).

## Headline results to feature (verify current numbers at write-time)

- Worst oracle residual ~**5.6e-15** over a **13,760-figure** differential sweep (0-shape-DOF slice).
- Full **bagrut Q1–Q7** figure corpus reproduced.
- ~**1,700** automated tests green.
- Bilingual (He/En), offline-first parser with an LLM fallback that re-parses to canonical syntax.

## Figures (already drafted)

See the talk deck [`../presentation/geo-builder-algorithms.html`](../presentation/geo-builder-algorithms.html): pipeline, the worked-example DOF dependency graph, the DOF ledger, the four algorithm listings, the verification stack. These are paper-figure candidates (re-render as TikZ for a paper if needed).
