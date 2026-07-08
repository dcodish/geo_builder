# 572 space-question coverage audit (2009–2024)

_Produced 2026-07-08 by a full sweep of every 572 exam in `C:\Users\User\Dropbox\Math\בגרויות\572` (~42 papers, 2009–2024). Goal: for each exam, does the 3-D builder support the **inputs** (the givens/construction)? We do NOT solve the questions. Drives the [V8 roadmap](20-space-vectors-tool.md#14-v8--full-legacy-572-coverage)._

## Structure finding
The 572 paper is a general 5-unit exam (שאלון שני). Chapter 1 = analytic geometry, vectors, trigonometry-in-space, complex numbers; Chapter 2 = growth/decay + functions/calculus. **The 3-D builder's target is ONE question per exam** (usually Q2, occasionally Q3): the solid/vectors OR R³ lines/planes OR trig-in-space item. Out of scope for BOTH tools: Q1 2-D analytic geometry (loci/conics — coordinate algebra, not construction), the complex-number question, and all of Chapter 2.

## Era split
- **2018–2024 (modern):** almost fully wired already — this was the tool's build corpus. Gates that reproduce end-to-end: 2018, 2019-קיץ, 2020-קיץ, 2021-חורף-א, 2021-קיץ-ב, 2022-חורף, 2023-א/ב/מיוחד, 2024. Only **2022-נבצרים** was deferred (the D3 coupled-symbol case — now greenlit → slice V8-c).
- **2009–2017 (legacy):** the SAME curriculum topic (students still study from these), and the source of nearly every gap below. In-scope.

## Gap list (grouped; exam frequency in parens)

### Tier 1 — high frequency
- **G1. Plane DEFINED by ⊥/∥ to a line/edge through a point** (~6: 2009-ב `π ⊥ SC` thru F; 2011-חורף plane `AEL ⊥ AA'`; 2013-חורף `π ⊥ AB` thru B; 2015-קיץ `π ⊥ ℓ` at A; 2012-קיץ-ב `π ∥ AB` thru C; 2017-חורף plane `∥ CD` thru K,P). Genuinely unbuildable today — the dual of the existing line⊥plane. **#1 gap.**
- **G2. A plane cuts an EDGE/segment → a point on it** (~4: 2009-ב E,D on SA,SB; 2011-חורף K on CC'; 2017-חורף Q on OC; 2018-קיץ-ב `המשך AK` ∩ plane). line∩plane exists; plane ∩ bounded-edge does not.
- **G3. "Intersection of the diagonals" of a face/base as a named point** `מפגש האלכסונים` (~4: 2018-קיץ-ב, 2019-קיץ-ב, 2019-קיץ, 2021-חורף-א). No first-class phrasing. Easy win.

### Tier 2 — moderate frequency
- **G4. More solids:** parallelogram-base pyramid (2012-חורף ABCDT, 2013-קיץ SABCD); general/oblique parallelepiped `מקבילון` (2011-חורף); right pyramid with a triangular/equilateral base (2012-קיץ-ב, 2014-קיץ, 2020-קיץ-ב); prism with an equilateral base / "all edges equal" (2013-קיץ-ב, 2018-חורף); triangular pyramid with 3 mutually-⊥ edges at a corner / orthoscheme (2017-חורף).
- **G5. Trig-in-space FACE givens:** dihedral angle between a lateral face and the base (2012-קיץ-ב 70°/40°); height-to-a-NAMED-face `גובה הפירמידה לפאה BDC` (2014-קיץ-ג); altitude within a face (2012-קיץ-ב `EL` of face EDC). `heightOfSolid` today only does ⊥-to-base.
- **G6. Angle/cos between two NAMED vectors as a given** (2013-חורף cos = √35/10; 2014-קיץ-ב cos∠ACB = 3/4; 2013-קיץ ∠ASB = β). `vangle` is a vertex angle only.
- **G7. Two-symbol vector combination** `AF = t·A'C + m·A'B` (2013-קיץ-ב) + the 2022-נבצרים `t`+height coupling → the **D3 coupled-symbol** work (slice V8-c).

### Tier 3 — niche / low frequency
- **G8.** Common perpendicular of two lines `d ⊥ ℓ ∧ d ⊥ ℓ'` (2010); projection `היטל` of a line onto a plane (2012-חורף).
- **G9.** Chained equal dot products `u·v = v·w = u·w` (2012-קיץ-ב).
- **G10.** A vector forms EQUAL ANGLES with two vectors (2016-קיץ AE with AB, AD).
- **G11.** Angle bisector in 3D `OD bisects ∠AOC` (2015-קיץ).
- **G12.** A point positioned so a DERIVED solid becomes a right pyramid (2019-חורף KOBCD; 2019-קיץ-ב TABCD).
- **G13.** A circle lying in a plane in R³, tangent to a line (2016-קיץ-ב). A sizable feature for one exam.

## Scope decisions (operator, 2026-07-08 — all IN scope)
- **S1. Pure 2-D plane-vector questions** (2010-Q2 quad/pentagon; 2013-חורף; 2014-קיץ-ב triangle-altitude vectors; cevian ones) → **in scope**, handled as a degenerate z=0 lane (slice V8-g).
- **S2. Circles in a plane in R³** (G13) → **build it** (slice V8-i).
- **S3. Apex-first solid naming** (`SABC`, `EABCD`, `ABCDT`) — recurs constantly in legacy exams → **make first-class** (detect the apex; slice V8-a).

## Confirmed SUPPORTED today (no action)
coordinate injection; midpoint; on-edge ratio (`AK = 2KA'`, `AE:EC = 2:1`); centroid `מפגש התיכונים`; foot ⊥ to a plane/line; line∩plane point; plane∩plane line; membership on a plane (on/above/below); on-axes/origin + sign givens; vector basis naming; coordinate vectors; length relation `|EN| = (√6/4)|w|`; dot product = value (incl. `= 0` ⇒ ⊥); symbol values `k = ½`; vec-defined & span points; the cevian pair; rectangle completion; volume/area/angle CLAIMS; parametric line + one symbol; plane by equation + a parameter; angle between planes; skew/∥/intersecting mutual-position.

## Method note
Givens extracted by 6 parallel visual-PDF reads (one per era-batch); each transcribed the space question's construction/givens verbatim and ignored the `מצאו/הוכיחו/חשבו` asks. `2009-2017.pdf` (a 95-page compilation) duplicates the individual year files → skipped. **`807.pdf`** (112 pages) is a DIFFERENT exam form (שאלון 807, space-geometry heavy) present in the folder — NOT analysed here; a potential future terminology goldmine if the operator wants 807 coverage.
