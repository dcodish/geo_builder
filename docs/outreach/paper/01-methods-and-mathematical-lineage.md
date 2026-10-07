# 01 — Methods & Mathematical Lineage

_Last updated: 2026-07-02. Grounded by reading the engine source on that date (file:line references below are to that state)._

**The question this answers:** *Are there known mathematical / optimization methods used in Geo Builder that we can cite as "we used X," or is the engine invented?*

**The verdict:** the engine is **not invented mathematics.** It is a **composition of well-established, individually citeable methods**. The contribution is in the **architecture and the incremental / pedagogical framing** — a constructive dependency model tuned for a student adding facts one at a time — **not** in any new algorithm. We should say exactly that in a paper, and we can legitimately name every method below.

---

## 1. Named methods actually in the code

Each row is a method that is genuinely running in the engine, with the citeable name and the source location. (Do not list a method here unless it is actually in the code.)

| Method (citeable name) | Where in the engine | What it does for us |
|---|---|---|
| **Bisection with grid bracketing** | `src/engine/geometry.ts:115` `solveParam` — scans a fixed grid (256 steps) for sign changes, bisects each bracket (~60 iterations) | Drive a **single** free DOF so a constraint residual → 0 (e.g. slide G until ∠GBA = 37°). Each sign-change bracket is a solution *branch*. |
| **Nelder–Mead simplex** (derivative-free optimization) | `src/engine/evaluate.ts:592` `nelderMead(cost, seedU, …)` | The **multi-DOF joint** constraint solve. |
| **Nonlinear least squares** (formulation) | `src/engine/evaluate.ts:541-551` — cost = Σ (normalized residual)² | The objective the multivariate solver minimizes. |
| **Coordinate descent** | `src/engine/evaluate.ts:594-608` — per-DOF `argMin` sweep over each bounded carrier's full range | A globally-informed restart seed (explores all branches of each 1-D carrier). |
| **Gauss–Seidel iteration** | `src/engine/evaluate.ts:610-629` — "binding-aware" sweep: solve each carrier on the constraint *it* drives, others held | Decouples chained constraints (D on line AC, then E on line DB). |
| **Tikhonov / L2 regularization** | `src/engine/evaluate.ts:553-559` — objective `+ λ‖u − seed‖²` (λ=1e-3); also `:287` | Minimal-change / **stability**: pulls the solution toward the previous configuration so the figure doesn't jump. |
| **Multi-start global optimization** | `src/engine/evaluate.ts:589+` — near-seed + grid + binding restarts, best wins | Escaping local minima; branch selection. |
| **Topological sort of a DAG** | `src/engine/evaluate.ts` — dependency ordering | Evaluate objects parents-before-children. |
| **Fixed-point iteration** | `src/engine/evaluate.ts:819` — repeat sweep `while (progressed)` | Resolve interleaved point/line/circle dependencies to a stable state. |
| **Closed-form analytic geometry** (orthogonal projection; line–line, line–circle, circle–circle intersection; circumcentre) | `src/engine/geometry.ts:68` `footOnLine`, `:97` `lineLineIntersect`, `:165` `lineCircleIntersect`, `circumcenter` | The 0-DOF derived points — ruler-and-compass constructibility, no iteration needed. |
| **Seeded PRNG (mulberry32) + FNV-1a hashing** | `src/engine/sample.ts:96` `mulberry32`, `:106` `hashId` | Deterministic, reproducible sampling of free DOFs (so replay/undo stay consistent). |

**Explored but reverted:** a **Halton low-discrepancy (quasi–Monte Carlo) global multi-start** for the genuinely under-determined case — a real named method; it did not converge in high (~8) DOF and was removed. Worth one sentence in related work as "tried, insufficient here."

---

## 2. The field it belongs to (the strongest framing)

The whole engine is an instance of **Geometric Constraint Solving (GCS)** — the academic field underlying parametric CAD (SolveSpace, Siemens D-Cubed, FreeCAD). Position the paper here.

- **Degree-of-freedom (DOF) analysis.** `rawMovableDof` / `dofRemoved` / `freeDofCount` (`src/engine/sample.ts:362-415`) is textbook **Kramer-style DOF analysis** deciding whether a constraint *drives* a free DOF or merely *checks* a determined one. **This is the most accurate single label for the core idea.**
- **Combinatorial rigidity theory / Laman's theorem.** The DOF bookkeeping — 2 per point, minus each constraint, minus the **4-DOF similarity gauge** (`similarityGauge`, `src/engine/sample.ts:389`) — is exactly the rigidity-counting framework. "Rigid up to similarity" = quotient by the similarity group (2 translation + 1 rotation + 1 scale), which is why a fully-determined shape reads **0 shape-DOF** even though it has 4 placement DOF.
- **The multiple-solution / root-identification problem.** Our "branches" and "show another configuration" are the well-studied *solution-selection* problem in GCS. The reflection-DOF encoding handles the discrete chirality/mirror ambiguities.

---

## 3. What is genuinely ours (do NOT overclaim)

Be precise so a reviewer trusts the paper. We did **not** invent an optimization algorithm and must not claim one. The contribution is *systems / architecture*, not mathematics:

1. The **hybrid constructive + numeric** architecture: objects that decompose to a closed-form construction are evaluated analytically in topological order; **only the residual constraints** hit the numeric optimizer.
2. The **incremental, order-independent** DOF model built for *pedagogy* — a student adds facts one at a time — including **event-sourced replay** (the ordered fact list is the source program; positions are derived, never stored) and **deferral to a fixpoint** for order-independence.
3. The specific **DOF-recruitment-past-a-free-carrier** walk and the **reflection-DOF seed encoding** — clever engineering, but not named textbook algorithms.

### A defensible point of differentiation

Mainstream GCS numeric cores use **Newton–Raphson / Levenberg–Marquardt** (they need derivatives). We deliberately use **derivative-free** methods (bisection, Nelder–Mead, coordinate descent, Gauss–Seidel) because our residuals pass **through constructions** and are not cheaply differentiable. That is a legitimate, distinguishing engineering choice worth stating explicitly.

---

## 4. Ready-to-adapt prose (for the Methods section)

> Geometric constraints are solved by a hybrid constructive/numeric scheme. Objects admitting a closed-form ruler-and-compass construction are evaluated analytically in topological order over the dependency graph, iterated to a fixed point to resolve interleaved dependencies. Remaining constraints are handled by degree-of-freedom analysis (following Kramer): a constraint with a single free carrier is solved by bisection on its scalar residual, while coupled constraints are reformulated as a nonlinear least-squares problem and minimized with a derivative-free multi-start optimizer (Nelder–Mead, with coordinate-descent and Gauss–Seidel restarts), regularized (Tikhonov) toward the previous configuration to guarantee minimal-change stability. Degrees of freedom are counted modulo the similarity gauge, in the spirit of combinatorial rigidity theory.

---

## 5. Open questions / to verify before submission

- [ ] Confirm exact bibliographic details for every reference in [`references.md`](references.md) (the Scholar Gateway / Consensus connectors need auth first).
- [ ] Decide whether to frame the numeric solve as "nonlinear least squares solved *derivative-free*" (accurate) vs. just "constraint optimization" (vaguer) — the former is a cleaner contribution-differentiator.
- [ ] Measure and report solver cost (iterations / wall-clock) on the corpus if the paper makes a performance claim — several ADRs note the coupled figures are ~1.5 s per replay.
- [ ] Cross-check the DOF-count-modulo-similarity claim against a rigidity-theory statement (Laman is *generic* 2D rigidity; our gauge is the *similarity* group, not the isometry group — state the distinction precisely).
