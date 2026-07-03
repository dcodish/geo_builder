# Theorem ground truth for the corpus (Phase 6 gate)

_Authored 2026-07-03 by the assistant (operator: "I do not know what the theorems for each question are… that is something I would want you to do"). Each question was solved offline and its solution path mapped to the official bagrut theorem ids ([07-theorem-reference](../07-theorem-reference.md)). **This is test data — it never ships into the app.** Solutions are the assistant's own reasoning; the operator should spot-check any entry that looks off (each carries a confidence note)._

## How to read the three lists (they formalize "help, don't reveal")

- **expectSurfaced** — ids the live feed MUST show from the question's **typed givens alone** (premise-side, per the [stated-vs-derived principle](../16-theorems-plan.md#2-the-one-principle-that-resolves-the-tension)). The corpus test asserts these ⊆ the feed.
- **solutionUses** — every list theorem the full official-style solution needs. NOT a test assertion by itself; it measures **coverage** (how much of the real solution path the feed legitimately anticipates) and is the operator's pedagogy-review aid.
- **mustNotSurface** — the solution's "aha" theorems whose premise is NOT stated in the givens — surfacing them would hand over the step. The corpus test asserts these ∩ feed = ∅.
- Trig apparatus (law of cosines/sines, ½ab·sinγ area) is outside the 1–109 list — it never appears in any list, correctly.

---

## Q1 — parallelogram, isosceles sub-triangle, point on the diagonal (trig sheet #1)

**Givens:** parallelogram ABCD; AB = AC = 3x (so △ABC is isosceles); BC = y; ∠BAC = α; E on diagonal AC with BE = y, CE = x.
**Solution sketch:** (א) y by law of cosines in △ABC *(trig)*. (ב1) △BEC and △ABC are both isosceles sharing ∠C → equal base angles → AA similar → CB/CA = CE/CB → y² = 3x² → y/x = √3. (ב2) substitute → cosα = 5/6. (ג) parallelogram angles via consecutive-sum/opposite-equal + alternate angles on AB∥DC + triangle sum. (ד) BD via law of cosines *(trig)* using the diagonal's context.

- **expectSurfaced:** 22 (AB=AC stated → isosceles base angles, key); parallelogram background bundle 43, 46, 48, 50 (collapsed row); 10 (triangle background row).
- **solutionUses:** 22, 69, 10, 48/50, 4 (alternates across AB∥DC when reading ∠ACD).
- **mustNotSurface:** 69 (the similarity is the "aha" — nothing stated announces two similar triangles), 71.
- _Confidence: high._

## Q2 — parallelogram, two angle bisectors meeting (trig sheet #2)

**Givens:** parallelogram ABCD; AE bisects ∠BAC, CE bisects ∠BCA (E their meet); ∠BAD = 120°; later AE = 3, EC = 5; F = BC ∩ extension of AE.
**Solution sketch:** (א) ∠ABC = 60° (consecutive angles); ∠BAC+∠BCA = 120° (sum); half-sum 60° → ∠AEC = 120°. (ב) AC by law of cosines in △AEC *(trig)* → 7; ∠ACB by law of sines *(trig)*. (ג) AF via △ABF/△AEC relations + alternates on AD∥BC *(trig for lengths)*.

- **expectSurfaced:** 80 (TWO bisectors of the same triangle stated and drawn → incenter concurrency, key — the operative objects exist); 78; parallelogram bundle 43, 46, 48, 50; 10 (background).
- **solutionUses:** 50 (or 48), 10, 4 (AD∥BC alternates in ג).
- **mustNotSurface:** — (this question's steps are angle-chasing; nothing hidden to protect).
- _Confidence: high._

## Q3 — rhombus, ratio point on a side, perpendicular on the extension (trig sheet #3)

**Givens:** rhombus ABCD, side k; E on AD with AE:ED = 2:3; ∠ADC = α; CE = k+2; F on the extension of AD with CF ⊥ DF, DF = k − 5/2.
**Solution sketch:** (א) ED = 3k/5 (ratio arithmetic). (ב) law of cosines in △EDC *(trig)* → cosα in k. (ג) ∠CDF = 180° − α (linear pair); right △DFC → cos/Pythagoras *(trig)* → k, α. (ד) area ABCF = rhombus + triangle pieces *(trig area formula)*.

- **expectSurfaced:** rhombus bundle 55, 56 + parallelogram bundle 43, 46, 48, 50 (collapsed rows — a rhombus states both); 1 (linear pair, background) once F-on-extension is stated; 28 (right-triangle background) once CF⊥DF is stated.
- **solutionUses:** 1, 28 (or pure trig in the right triangle).
- **mustNotSurface:** — (trig-dominated; no geometric "aha").
- _Confidence: high._

## Q4 — right triangle, two internal bisectors → incenter (trig sheet #4)

**Givens:** △ABC, ∠C = 90°; AD bisects ∠BAC and BD bisects ∠ABC (D their meet); BD = 12√2, AD = k; later AC = 7k/5, BC = 24k/5.
**Solution sketch:** (א) acute angles sum 90° → half-sum 45° → ∠ADB = 135° (triangle sum twice). (ב) AB by law of sines in △ADB *(trig)*. (ג) Pythagoras: (7k/5)² + (24k/5)² = AB² → k, AB. (ד) area ABD *(trig formula)*. (ה) distance D→AB: D is the **incenter** (both bisectors) — equidistant from the sides; or 2·S_ABD / AB.

- **expectSurfaced:** 80 + 78 (two bisectors stated → incenter, key); right-triangle background 28, 31 fold (∠C=90° stated); 10 (background).
- **solutionUses:** 10, 28, 78/80.
- **mustNotSurface:** — (78/80 are legitimately given-announced here; the insight IS the given).
- _Confidence: high._

## Q5 — isosceles triangle inscribed, arc midpoint, 90° inscribed angle (circle sheet #2)

**Givens:** △ABC inscribed in circle O radius R; D = midpoint of arc BC; AB = AC; AC = 8R/5; later ∠ACD = 90°; S_ABC = 768.
**Solution sketch:** (א) ∠BAC (inscribed on arc BC) = ½∠BOC (central); D bisects the arc → ∠DOC = ½∠BOC → equal (99 + 92). (ב) △ABC ~ △OCD: AB=AC and OC=OD=R (two isosceles) with equal apex angles → SAS-similar (68; 22 supplies the base-angle structure). (ג) area ratio = (8R/5 : R)² = 64/25 (71). (ד1) ∠ACD = 90° inscribed → AD is a diameter → A,O,D collinear (**104**). (ד2) right △ACD: CD = √((2R)² − (8R/5)²) = 6R/5 (28, with 103 justifying the right angle on the diameter). (ד3) S_ACD = ½·AC·CD. (ה) numbers via 71.

- **expectSurfaced:** 92/94 (arc-midpoint D stated → equal arcs ↔ chords/central angles, key); 22 (AB=AC stated, key); 99 (inscribed-vs-central — announced by the arc-midpoint-plus-inscribed configuration, key); **104 (the moment "∠ACD = 90°" is stated — an inscribed right angle announces a diameter, the operator's canonical "obvious" case)**; circle/triangle background 84, 91.
- **solutionUses:** 99, 92, 22, 68, 71, 104, 28, 103.
- **mustNotSurface (before the ∠ACD=90° step lands):** 104, 103 — they become key only when that given is typed (this is the plan's step-by-step tier transition in action); 68/71 (the similarity pairing is the ב "aha" — but note the question TELLS the student to prove it, so surfacing after ב's objects exist is acceptable; keep out of the initial feed).
- _Confidence: high on ids; medium on the ב SAS-vs-AA route (either way 68/69 + 22)._

## Q6 — diameter ∩ chord at a half-radius point, similar triangles, dropped perpendicular (circle sheet #3)

**Givens:** circle O radius 4; diameter AB and chord DE meet at C; C = midpoint of radius OB; ED = 7, EC < CD; later DF ⊥ AB with foot F.
**Solution sketch:** (א) △ACD ~ △ECB: ∠DAC = ∠DEB (inscribed on the same arc BD, 102) + vertical angles at C (2) → AA (69). (ב) the similarity's proportion gives AC·CB = EC·CD (6·2 = 12); with EC+CD = 7 → CD = 4 = R → OD = CD → △OCD isosceles. (ג1) DF: right △CFD or △OFD → Pythagoras (28) with the ⊥-from-centre structure (97 bisects nothing here — F is not the chord's midpoint; plain Pythagoras). (ג2) AD: △ADB is right at D (AB is a diameter — 103) → Pythagoras/derived lengths. (ג3) BE: △AEB right at E (103 again) → Pythagoras.

- **expectSurfaced:** 103/104 (diameter stated, key); 2 (two chords crossing stated → vertical angles, background); 102 (two inscribed angles configuration present, key-amber per authoring); circle background 84, 91, 97/98 fold.
- **solutionUses:** 102, 2, 69, 103, 28.
- **mustNotSurface:** 69 (the א pairing is the proof task itself); the intersecting-chords power relation is **Appendix (O)** — must never surface by hard rule (the solution derives it FROM the similarity, which is why א precedes ב).
- _Confidence: high; ג1's exact triangle choice is medium (either route is Pythagoras)._

## Q7 — inscribed triangle, tangent, isosceles, bisector-ratio chain (circle sheet #8)

**Givens:** △ABD inscribed in circle O; the tangent at D meets the extension of AB at E; F on AB with DE = FE; later AB is a diameter; DF = DB; R = 5.
**Solution sketch:** (א) tangent–chord: ∠EDB = ∠DAB (107); △DEF isosceles (22) → ∠DFE = ∠DEF-side base angle; exterior angle of △ADF at F: ∠DFE = ∠DAF + ∠ADF (11); combine → ∠BDF = ∠ADF, i.e. DF bisects ∠ADB. (ב) AB diameter → ∠ADB = 90° (103) → ∠FDB = 45°. (ג1) ∠DAE via the isosceles DF=DB (22) + angle chase. (ג2) DO bisects ∠ADF: OD = OA radii → isosceles → base angles (22) + the א result. (ג3) **76 twice**: in △ADF, DO bisects ∠ADF → AO/OF = AD/DF; in △ADB, DF bisects ∠ADB → AF/FB = AD/DB; DF = DB glues them → AO/OF = AF/FB. (ד) numbers: right isosceles pieces + 105 (tangent ⊥ radius) as needed for OF.

- **expectSurfaced:** 107 + 105 (tangent stated, key — a stated tangent announces the tangent pair); 103/104 (the moment "AB diameter" is stated, key); 22 (DE=FE stated → isosceles, key); triangle background 10, 11 fold.
- **solutionUses:** 107, 22, 11, 103, 76, 105.
- **mustNotSurface:** **76** — the bisector-ratio double application is the question's crown step; nothing in the givens states a bisector (the student PROVES DF is one in א). If the feed showed 76 it would gift ג3. This is the sharpest no-reveal case in the corpus.
- _Confidence: high._

---

## Coverage read-out (for the plan's §5 matcher set)

The seven questions ground: circle block 92/94/97–99/102–105/107 ✓, isosceles 22 ✓, similarity 68/69/71 (mostly as *mustNotSurface* — good negative tests), bisector family 76/78/80 ✓, parallelogram/rhombus bundles 43–58 ✓, backgrounds 1/2/10/11/28/31 ✓. **Uncovered families needing new corpus questions:** congruence 18–21, midsegment 72/73 (Thales), quad characterizations as C-theorems (44/45/47/57–60), medians/centroid 15–17, parallels+transversal 4–9 as the main event, perpendicular-bisector 82/83, cyclic-quad 87. Source for the next ~10–15: the two PDFs already in this folder (`חוברת בגרויות 571 2025.pdf`, `דף שאלות עבודת קיץ.pdf`).
