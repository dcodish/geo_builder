# Comparative Experiment Protocol — method A vs B vs C

_Last updated: 2026-07-02. The methodology for evaluating alternative methods/algorithms for any pluggable element of the engine, in a way that yields **reproducible, paper-quality comparisons and justifications**. Companion to the architecture in [`../adr-draft-solver-experiment-harness.md`](../adr-draft-solver-experiment-harness.md) (that ADR is the *harness*; this is the *method + record-keeping* the harness implements)._

> **The one sentence.** Turn "we tried method B" into: *on a fixed, versioned benchmark, B beat/lost to A by a measured effect size, under a correctness gate, reproducibly, with the environment and losses recorded* — a claim a reviewer accepts.

---

## 1. Where this sits

This is the **comparative layer** on top of the existing correctness nets — it does not replace them, it *reuses* them as ground truth:

| Existing net | Role here |
|---|---|
| Givens verifier ([ADR-053](../../06-decisions.md#adr-053), `verify.ts`) | correctness signal for **every** figure (verified vs. amber) |
| Invariants campaign ([ADR-047](../../06-decisions.md#adr-047), `campaign.test.ts`) | correctness for under-determined figures (relations hold) |
| Coordinate-validation campaign ([ADR-109](../../06-decisions.md#adr-109), `src/validation/`) | correctness for the 0-shape-DOF slice (exact match to an independent oracle) |
| Additive-stability property | a method must not make points jump |

The comparative layer adds the **cross-method dimension**, the **cost/robustness metrics**, and the **provenance ledger**. It is dev/CI-only; nothing here ships.

---

## 2. Experiment families (the pluggable elements)

Each swappable element of the code is an **experiment family** with: a seam, a frozen baseline, a method registry (`classic` + challengers), a metric profile, a benchmark subset, and a results ledger. New families follow the same template — the framework is extensible by design.

| ID | Element | Seam | Methods (classic → challengers) |
|---|---|---|---|
| **EF-1** | 1-D driven-DOF root finder | `solveParam` (`geometry.ts`) | bisection+grid *(classic)* → Brent, TOMS 748, Newton (AD) |
| **EF-2** | multivariate joint constraint solve | joint solve (`evaluate.ts`) | Nelder–Mead+CD+Gauss–Seidel *(classic)* → BOBYQA, Gauss–Newton/LM (AD) |
| **EF-3** | global / under-determined search + "show another" | sampler / `findValidConfig` | seeded multi-start *(classic)* → CMA-ES, basin-hopping, Halton QMC *(reverted — kept as a comparison point)* |
| EF-4 *(future)* | decomposition / DOF recruitment | `recruitFreeDofs` | current constructive recruit → graph-decomposition |
| EF-5 *(future)* | branch / solution selection | branch-index policy | nearest-root *(classic)* → continuation-tracked |

---

## 3. Principles (what makes a comparison paper-grade)

1. **Reproducibility.** Fixed, versioned benchmark; fixed seed set; deterministic engine; recorded environment. Anyone re-runs the same `(bench, method, seeds)` and gets the same numbers.
2. **Ceteris paribus.** The seam guarantees the *only* variable between runs is the method under test — everything else (graph build, topo order, branch handling) is shared. (This is the whole reason we don't fork the repo.)
3. **Correctness is a gate, not a metric.** A faster-but-wrong method is **disqualified**, full stop. The gate: verifier-green **+** oracle-agreement (0-DOF slice) **+** invariants (under-determined) **+** stability preserved, with **zero regressions vs. the baseline on any figure**.
4. **Machine-independent headline metric.** Report **function-evaluations / solver-iterations** (deterministic, portable) as the primary cost number. Wall-clock is secondary and is *always* reported with the hardware and repetition statistics — never a bare millisecond count.
5. **Statistical honesty for stochastic methods.** A stochastic method (CMA-ES, multi-start) is run over **many seeds**; report the **success rate + distribution** (median, IQR, min/max), never a single lucky run. Deterministic methods need one run for correctness; timing is still repeated (K reps, warm-up discarded, report median).
6. **Report the losses.** Where the challenger is worse (e.g. slower on trivial figures), show it. The **full** benchmark, never a hand-picked subset. A mixed result is a valid, publishable finding — it justifies *not* adopting something.
7. **Pre-registration.** State the hypothesis and the improvement threshold **before** running (recorded in the ledger row). This is what stops post-hoc rationalising a number into a "win."
8. **Ablation.** When a method is composite, isolate each part's contribution rather than crediting the bundle.

---

## 4. The benchmark

A single **versioned** dataset every method runs against, so a result row is comparable across time. `BENCH-v1` = the union of:

- **Determined slice** (unique ground truth): the coordinate-validation corpus (ADR-109) — correctness via the oracle.
- **Under-determined slice**: the invariants-campaign diagrams + the real operator **scenarios** (`src/__tests__/scenarios.test.ts`) — correctness via verifier + invariants.
- **Hard set** (where challengers should earn their keep): the ~7 s reflection figure (ADR-166), coupled slow replays (area-ratio, ADR-123), and the genuinely under-determined ~8-DOF case (the reverted Halton case).

Each benchmark version is **hashed and committed**; a result JSON records which `benchVersion` it ran against. Bumping the corpus → new version, old results stay interpretable.

---

## 5. Metrics (precise definitions)

Per `(method, figure)`:

- **Correctness** — `verified` (givens verifier), `oracleMatch` (0-DOF: distance to the matched oracle config ≤ tol, else N/A), `invariantsHold` (bool). Aggregate → pass-rate + **regression count vs. baseline (must be 0)**.
- **Cost** — `fnEvals` (residual evaluations), `iterations`, `wallClockMs` (median of K reps, warm-up discarded).
- **Robustness** — `converged` (bool); on the hard set: success rate; count of figures needing "show another"/reflection search to reach a valid config.
- **Quality** — final residual norm (how well the constraint is satisfied) and distance-to-oracle (0-DOF).
- **Stability** — additive-stability property holds (bool).

Aggregations: a per-figure table + a summary (medians, totals, **win/loss/tie vs. baseline**, per-regime breakdown).

---

## 6. Decision rule (adopt / reject / inconclusive)

1. **Hard gate (correctness).** challenger pass-rate ≥ baseline **and** zero new regressions **and** stability preserved. Fail → **disqualified**, ignore its speed.
2. **Improvement.** Meets the **pre-registered** threshold — e.g. "≥30% fewer `fnEvals` with identical roots," or "converges on the hard set where baseline does not" — and the loss profile is acceptable.
3. **Verdict.** `adopt` / `reject` / `inconclusive`, recorded with the numbers. **Adoption is then its own gated change** (a new ADR + the standard [Definition of Ready](../../08-testing-strategy.md#definition-of-ready-the-gate)); the experiment justifies it, it does not perform it.

---

## 7. Records & provenance (how A vs B vs C accumulates)

Every run emits three artifacts (committed → travels via Dropbox, auditable):

1. **Raw result** — `results/<family>/<benchVersion>__<methodSet>__<YYYY-MM-DD>.json` (per-figure rows + summary + full env metadata). Schema in [`results/README.md`](results/README.md).
2. **Human/paper report** — a generated comparison table (`.md`/`.html`) — a direct paper-figure/table candidate.
3. **Ledger row** — one append-only line in [`LEDGER.md`](LEDGER.md): date · family · methods · benchVersion · pre-registered hypothesis · headline result · verdict · link.

Provenance every row carries: baseline **tag + commit**, harness version, **benchVersion**, seed set, Node version, OS/CPU, date. Without these a timing number is not a claim.

---

## 8. From a result to a paper claim

A claim must cite: benchVersion, N figures, the metric + effect size, the correctness-gate outcome (zero regressions), and the environment. Template:

> On `BENCH-v1` (N figures), method B reduced 1-D root-finding evaluations by **X%** (median) vs. the bisection baseline, with **identical roots** and **zero verifier/oracle regressions**; wall-clock **−Y%** on {hardware}. On the trivial-figure subset B was **Z% slower** (reported, not adopted there).

Negative and mixed results are written up the same way — they are the justification for *keeping* the classic method.

---

## 9. The workflow (the loop)

1. Register the challenger in the family's seam (`src/engine/solvers/…`, never imported by production).
2. **Pre-register** hypothesis + threshold as a `pending` row in `LEDGER.md`.
3. Run the harness over `BENCH-vK`.
4. Harness writes the result JSON + report, flips the ledger row to a verdict.
5. Review against §6.
6. `adopt` → open an ADR and promote via the standard gate; `reject`/`inconclusive` → the negative result stays on the record (equally valuable).

**Apparatus-first (non-negotiable):** before trusting any verdict, the harness must demonstrate `classic ≡ classic` at machine-ε — a differential rig that can't show "no difference when there is none" produces meaningless verdicts (the ADR-109 load-bearing-test principle).
