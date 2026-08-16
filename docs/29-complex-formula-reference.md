# 29 — The complex-numbers formula sheet (the official one, transcribed)

_The 5-unit bagrut formula sheet (`5-MATH-Formula_NEW.pdf`, p. 4 — **מספרים מרוכבים**) carries **exactly
three** formulas for this topic. This file is their transcription, and it is the **source of truth**
for `src-complex/formulas/table.ts`: an integrity test byte-matches every `statement` in that table
against this document, the same docs/07 ↔ `THEOREM_TABLE` discipline the 2-D tree uses
([ADR-CX-017](06d-decisions-complex.md#adr-cx-017))._

> **Why a transcription and not a rewrite.** The student is allowed this sheet in the exam. A tool that
> surfaces a *paraphrase* teaches a formula they will not find when they look down at the page in front
> of them. So the wording here follows the sheet, and the test refuses a drift in either direction.

## The three formulas

### CX-F1 — כפל בהצגה קוטבית (polar multiplication)

```
r₁(cos α + i·sin α) · r₂(cos β + i·sin β) = r₁·r₂·[cos(α + β) + i·sin(α + β)]
```

Moduli multiply, arguments add. This is the formula behind every rotation picture in the app: `w = z·u`
turns `z` by `arg u` and stretches it by `|u|`.

**Surfaced when** the figure contains a product of two numbers.

### CX-F2 — משפט דה־מואבר (De Moivre)

```
[r(cos α + i·sin α)]ⁿ = rⁿ·(cos nα + i·sin nα)
```

The previous formula applied n times. It is what makes a power's argument a *multiple* of the base's —
and therefore what makes the power cycle finite when the argument is a rational part of a turn.

**Surfaced when** the figure raises a number to an integer power.

### CX-F3 — שורשים מסדר n (the n-th roots)

```
z_k = ⁿ√R·[cos(φ/n + 2πk/n) + i·sin(φ/n + 2πk/n)],  k = 0, 1, …, n−1
```

The n solutions of `zⁿ = R(cos φ + i·sin φ)`: one modulus, n directions evenly spaced round the turn.
These are the app's **configurations** — «show another configuration» walks exactly this k.

**Surfaced when** an equation `Xⁿ = …` produced more than one configuration.

## What the sheet does NOT carry

The conjugate, division, `|z|`, and the cartesian↔polar conversions are **assumed understanding**: they
are not on the sheet, so they are not detection targets here either. Adding them would mean the app
teaching, as "the formula sheet says", something the sheet does not say — which is the same class of
dishonesty as printing a sampled value as knowledge.
