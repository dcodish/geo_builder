# Experiment Ledger

Append-only index of every comparative run. One row per `(family, methods, benchVersion)` run. Governed by [`PROTOCOL.md`](PROTOCOL.md) — pre-register the hypothesis + threshold **before** running (add the row as `pending`, fill the result after). Newest at the top.

Columns: **Date** · **Family** · **Methods compared** · **Bench** · **Pre-registered hypothesis (metric ⋅ threshold)** · **Headline result** · **Verdict** · **Artifact**

| Date | Family | Methods | Bench | Hypothesis (pre-registered) | Result | Verdict | Artifact |
|---|---|---|---|---|---|---|---|
| _pending_ | EF-1 · 1-D root finder | bisection *(classic)* vs Brent / TOMS 748 | BENCH-v1 | fewer `fnEvals` per root, **≥30%** median, with **identical roots** & 0 correctness regressions | — | `pending` | — |

<!--
Row template (copy, fill, keep newest on top):
| 2026-07-NN | EF-1 · 1-D root finder | bisection vs brent | BENCH-v1 | fnEvals ↓ ≥30%, identical roots, 0 regressions | −41% fnEvals median · roots ≡ · 0 regressions · wall −18% (i7-xxxx) | adopt | results/EF-1/BENCH-v1__bisection-brent__2026-07-NN.json |
-->

## Verdict legend

- **adopt** — passes the correctness gate **and** meets the improvement threshold → promote via a new ADR + the standard Definition-of-Ready gate.
- **reject** — fails the correctness gate, or the improvement isn't worth the added complexity/risk. The negative result is the justification for keeping `classic`.
- **inconclusive** — noisy or regime-dependent; needs a tighter benchmark or more seeds before a call.
- **pending** — pre-registered, not yet run.
