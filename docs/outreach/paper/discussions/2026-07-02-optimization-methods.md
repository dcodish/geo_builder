# 2026-07-02 — Known optimization methods vs. "invented"?

**Also this session:** created the [`docs/paper/`](../README.md) folder itself, and (earlier) the talk deck [`../../presentation/geo-builder-algorithms.html`](../../presentation/geo-builder-algorithms.html).

## The question

Operator: *"Are there any known mathematical optimization algorithms or methods that were used here that I can say — I used XXX optimization for. Is this code fully invented, or is it using known methods?"*

## What we did

Read the actual solver code rather than answering from memory — `geometry.ts` (`solveParam`, `footOnLine`, intersections), `solve.ts` (residuals / cost), `evaluate.ts` (the multivariate joint solve), `sample.ts` (seeded sampling, DOF counting).

## Conclusion

**Not invented.** The engine is a **composition of well-established, citeable methods**; the novelty is architectural/pedagogical, not mathematical. Full write-up (with `file:line` for each method, the GCS/DOF/rigidity framing, what's genuinely ours, and ready-to-use Methods prose) promoted to → **[`../01-methods-and-mathematical-lineage.md`](../01-methods-and-mathematical-lineage.md)**.

Headlines:

- **1-DOF constraint drive** = bisection with grid bracketing (`solveParam`).
- **Multi-DOF solve** = derivative-free nonlinear least squares — Nelder–Mead + coordinate descent + Gauss–Seidel, with Tikhonov regularization toward the prior config (this is where *stability* comes from) and multi-start.
- **Derived points** = closed-form analytic geometry (orthogonal projection, intersections).
- **Framing** = Geometric Constraint Solving with **degree-of-freedom analysis** (Kramer) and DOF counting modulo the similarity gauge (**rigidity theory** / Laman).
- **Honest differentiator:** derivative-free by design (residuals pass through constructions), where mainstream GCS uses Newton / Levenberg–Marquardt.
- **Explored & reverted:** Halton quasi–Monte Carlo global multi-start (didn't converge at ~8 DOF).

## Follow-up — should we adopt more advanced methods, and how do we test that safely?

Operator: the sources look old (1960/65) — are there better methods? And: *"we keep the existing which works, I don't want to risk it in any way; implement a change from the table and run all our tests old vs new to see if there's improvement."*

Two conclusions:

1. **Old ≠ obsolete.** Bisection (1817), Gauss–Seidel (1823), Nelder–Mead (1965) are load-bearing, not outdated — and the "better" methods (Levenberg–Marquardt 1944/63, interval Newton 1966) are *also* old. The frontier here is **fit to the problem's structure**, not publication date. The pivot that unlocks the faster methods is **automatic differentiation** (it dissolves the "not differentiable through constructions" reason we went derivative-free) → then Gauss–Newton / LM. Other candidates: **Brent / TOMS 748** (1-D), **CMA-ES** (the under-determined case Halton missed), **continuation / interval / graph-decomposition** (research/future-work). Full ranked table in [`../01-methods-and-mathematical-lineage.md`](../01-methods-and-mathematical-lineage.md) §Advanced (to add) and the deck.
2. **How to test it safely** → drafted an ADR: **[`../adr-draft-solver-experiment-harness.md`](../adr-draft-solver-experiment-harness.md)**. Not two repos — one repo, a frozen `solver-baseline` tag, a pluggable **solver seam** (`classic` = untouched default, experimental solvers never imported by production), and a **differential harness** extending `src/validation/` that runs the whole corpus through each solver. Correctness measured vs. the oracle/verifier (not coord-diff old-vs-new, since output is one-of-many-valid-models); improvement measured on speed/robustness. Apparatus-first: prove `classic ≡ classic` before trusting any verdict.

**State:** ADR drafted, parked in the paper folder to avoid colliding with the concurrent hardening session's ADR numbering. Code work (baseline tag → seam → harness → Brent) waits until that session lands. Next decision for the operator: approve the ADR, then start with steps 1–2 (`classic`-only apparatus).
