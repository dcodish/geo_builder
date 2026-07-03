# Theorem ground truth for the corpus (Phase 6 gate)

_Authored 2026-07-03 by the assistant (operator: "I do not know what the theorems for each question are… that is something I would want you to do"). Each question was solved offline and its solution path mapped to the official bagrut theorem ids ([07-theorem-reference](../07-theorem-reference.md)). **This is test data — it never ships into the app.** Solutions are the assistant's own reasoning; the operator should spot-check any entry that looks off (each carries a confidence note)._

> **Corpus scoping (operator, 2026-07-03):** the original Q1–Q7 were chosen to test **diagram creation**, and Q1–Q4 are **trigonometry questions** (law of cosines) — trig is not this tool's theorem domain. A question with no pure-geometry content is simply **ignored for theorems**; where geometric steps exist we extract just those. So **Q1–Q4 below are secondary** (kept for their thin geometric surfacing entries; not primary gate material), **Q5–Q7 are primary**, and the **booklet corpus (B-series, below) is the baseline going forward** — question 4 of every exam in `חוברת בגרויות 571 2025.pdf` is the geometry question, and all of them are being mined into B-entries.

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
- **mustNotSurface (before the ∠ACD=90° step lands):** 104, 103 — they become key only when that given is typed (this is the plan's step-by-step tier transition in action); 68/71 (the similarity pairing — its premise "two similar triangles" is NEVER stated; it is derived, so it must not surface, independent of any question text per the B1 rule).
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

# B-series — the booklet corpus (question 4 of every exam in `חוברת בגרויות 571 2025.pdf`)

_Mined 2026-07-03 by five parallel agents (each read the PDF pages, transcribed, solved — coordinate-verifying numeric claims — and mapped to catalog ids); reviewed and merged by the assistant. Numbered in booklet order: B1–B8 are the opening sample exams + exams 7–8; from B9 on the number matches the printed exam number. **The booklet's Q4 is the pure-geometry question** (trig lives in Q5), so almost no "(trig — out of scope)" marks were needed. Items flagged for the operator's eyeball are collected in the review checklist at the end of this file._

## B1 — cyclic quadrilateral, tangent at A, double-isosceles forcing AB = AD (booklet p4, PDF p23)

**Givens:** Quadrilateral ABCD is inscribed in a circle. G on side CD with AB = AG and CB = CG. The tangent at A cuts the extension of CD at L and the extension of CB at K. Tasks: (א) prove AD = AG; (ב1) prove △ABK ~ △CDA; (ב2) prove AD² = BK·CD; (ג) show S△LDA / S△KAB = LA/AK. No trig sub-parts.

**Solution sketch:** (א) ∠AGC = ∠ABG + ∠GBC = ∠ABC (isosceles base angles twice, 22); ∠AGD = 180° − ∠AGC (1) = 180° − ∠ABC = ∠ADC (87) = ∠ADG → AD = AG (23). (ב1) corollary AD = AG = AB; ∠ABK = 180° − ∠ABC = ∠CDA (1 + 87); ∠KAB = ∠ACB (107) = ∠ACD (94 + 101, equal chords AB = AD) → AA (69). (ב2) ratio AB/CD = BK/DA with AB = AD → AD² = BK·CD. (ג) ∠KAB = ∠ADB (107) = ∠ABD (22, AB = AD) → BD ∥ KL (5) → equal heights over collinear bases (3) → ratio = LA/AK. (Coordinate-verified.)

- **expectSurfaced:** 87 (quad stated inscribed — key); 105 + 107 (stated tangent — key); 22 (AB = AG, CB = CG stated — key); 1 (background); 91 (background).
- **solutionUses:** 22, 1, 87, 23, 107, 94, 101, 69, 5, 3.
- **mustNotSurface:** 23 (א's converse close); 69 (the ב pairing); 94, 101 (their premise AB = AD is derived in א); 5 (ג's parallel-discovery). Only ONE tangent exists (K, A, L collinear on it) — 108/109 must NOT fire.
- _Confidence: high — coordinate-verified; the only judgment call is 94/101 vs. folding into 100._

## B2 — rhombus, perpendicular bisector meets a diagonal, two circumcenters, BD/AC = r/R (booklet p13, PDF p32)

**Givens:** rhombus ABCD; E, F midpoints of AB, BC; K = diagonals' meet. The perpendicular at E to AB cuts the extension of diagonal BD at G. (א) prove G is the circumcenter of △ABC. Given: GF cuts AC at M, the circumcenter of △BDC. (ב) prove △BKC ~ △MFC ~ △BFG. (ג1) prove MF/CF = BK/CK and MC/GB = MF/CF; (ג2) show BD/AC = r/R (r, R the two circumradii). No trig sub-parts.

**Solution sketch:** (א) perpendicular at the midpoint E = the perpendicular bisector of AB → GA = GB (82); rhombus diagonals ⊥-bisect each other (46 + 56) → BD is the perpendicular bisector of AC → GA = GC (82) → G is the centre (91). (ב) ∠BKC = 90° (56); MF ⊥ BC (98, centre-to-chord-midpoint) + shared ∠C → △MFC ~ △BKC (69); GF ⊥ BC (98) + shared ∠B → △BFG ~ △BKC (69). (ג1) correspondences give MF/CF = BK/CK; composing (with 10) MC/GB = MF/BF = MF/CF (BF = CF). (ג2) BD/AC = BK/CK (46) = MC/GB = r/R. (Coordinate-verified: both ratios = b/a.)

- **expectSurfaced:** rhombus bundle 55, 56 + 43, 46, 48, 50 (collapsed); 82 (a perpendicular at a STATED midpoint = a stated ⊥-bisector — key); 98 (key once "M is the circumcenter" is typed — centre + stated chord-midpoint F); 84, 91 (background).
- **solutionUses:** 82, 56, 46, 91, 98, 69, 10.
- **mustNotSurface:** 69 (the three-way pairing is ב's task); 85 (only ONE perpendicular bisector is drawn — surfacing the concurrency would hand over א's strategy).
- _Confidence: high — fully coordinate-verified. RESOLVED (operator 2026-07-03): "M is the circumcenter of △BDC" is a GIVEN, so 98 surfaces the moment M is typed (no post-ב demotion)._

## B3 — isosceles triangle, two perpendicular medians, centroid, circle around ALKC (booklet p24, PDF p43)

**Givens:** △ABC isosceles (AB = BC); medians AK, CL meet at D; AK ⊥ CL. (א) prove BD = AC. (ב) compute S(BLDK)/S(△ABC). (ג) M = centre of the circle circumscribing ALKC: (1) prove ∠AML = 90°; (2) find AM/AD. No trig sub-parts.

**Solution sketch:** (א) D is the centroid; the third median BN hits AC at its midpoint (15); △ADC right at D with median DN → DN = AC/2 (31); BD = 2·DN (17) = AC. (ב) medians split into six equal areas (16) → S(BLDK) = S/3. (ג1) △ABK ≅ △CBL (SAS 18) → AK = CL → DA = DC (17) → right isosceles → ∠DCA = 45° (22 + 10); central ∠AML = 2·∠ACL = 90° (99). (ג2) with AC = 2: AD = √2 (28); AL = √10/2, R_M = √5/2 → AM/AD = √10/4 (28). (Coordinate-verified: 1/3 and √10/4.)

- **expectSurfaced:** 15 + 17 + 16 (TWO medians stated meeting at D — the median/centroid family, key — mirrors the two-bisectors→80 precedent); 22 + 24 (isosceles bundle); 28 (background once AK ⊥ CL stated); at ג: 99 (central-vs-inscribed, key step-tier) + 87 + 84, 91 (background).
- **solutionUses:** 15, 17, 31, 16, 18, 22, 10, 99, 28.
- **mustNotSurface:** 31 (א's aha — the median-to-hypotenuse object DN is assembled, never stated); 18 (no congruent pair stated); 32 (converse — would hint the same structure).
- _Confidence: high — coordinate-verified; ב may officially route via 17 + area formula (same family, same ratio)._

## B4 — triangle on a diameter, two tangents from an external point, bisector to the chord (booklet p34, PDF p53)

**Givens:** △BCF inscribed in circle O radius R; BF a diameter. From external A two tangents: one touches at B; the other cuts the extension of CF at D; AD ⊥ CD. (א) prove ∠BFC = ∠BAD. Given: K on BC with FK bisecting ∠BFC. (ב) prove KC = CF·BO/AB. (ג) prove KB·AB = 2R². (ד) why S(△BFK) > S(△KFC)? No trig sub-parts.

**Solution sketch:** (א) ∠ABF = 90° (105); ∠BFD = 180° − ∠BFC (1); quad ABFD angle sum (35) → ∠BAD = ∠BFC. (ב) ∠BCF = 90° (103); AO bisects the tangents' angle (109) → ∠OAB = ½∠BFC = ∠KFC → △KCF ~ △OBA (69) → KC = CF·BO/AB. (ג) BK/KC = FB/FC (76) → KB·AB = BO·FB = 2R². (ד) shared height → ratio BK/KC = FB/FC (76); FB is the hypotenuse (103) → FB > FC (14) → greater.

- **expectSurfaced:** 103/104 (diameter stated — key); 105 + 107 + 108 + 109 (TWO tangents from one point stated — full bundle, key; 109 genuinely operative); 76 (key at the step "FK bisects ∠BFC" is typed — the bisector is stated AND drawn, the exact opposite of trig-Q7); 28, 1, 35, 84, 91 (background).
- **solutionUses:** 105, 1, 35, 103, 109, 69, 76, 14.
- **mustNotSurface:** 69 (the ב pairing △KCF ~ △OBA is the aha); the tangent–secant power shortcut for ג is **Appendix (O) — never**.
- _Confidence: high (symbolically verified: KB·AB = 2R² exactly). The second tangent's touch point is unnamed — a figure test must not assume it._

## ~~B5~~ — REMOVED (operator 2026-07-03)

_Removed on the operator's review verdict ("remove this question"). This exam's printed Q4 (booklet p45) is the red-X'd/defaced trapezoid question, excluded from the 2025 focus; the mined substitute (that exam's live Q5 — rhombus + incircle) is dropped from the corpus rather than stand in for a Q4. **Consequence:** the corpus loses one incircle-of-a-named-triangle (80/81) example and its 55-given-announced case; the trapezoid family 39–42 stays uncovered (a fresh trapezoid question from a clean source is the intended fill — see coverage read-out)._

## B6 — diameter, two parallel chords, equal arcs, rhombus AFKC, SAS-similarity → second diameter (booklet p55, PDF p74)

**Givens:** AB a diameter; chords CD ∥ AF; AB meets CD at K; arcs ⌢CA = ⌢AF. (א1) prove ∠FAB = ∠CAB; (א2) prove BK = BD. (ב) prove AFKC is a rhombus. (ג) given BD·AB = CD·AC: (1) prove △BDC ~ △CAB; (2) prove CD is a diameter. No trig sub-parts.

**Solution sketch:** (א1) equal arcs → equal inscribed ∠ABC = ∠ABF (101); right angles on the diameter (103); sum (10) → equal. (א2) ∠DKB = ∠FAB (6) = ∠CAB = ∠CDB (102) → isosceles (23) → BK = BD. (ב) ∠CKA = ∠KAF (4) = ∠KAC → CA = CK (23); CA = AF (94); CK ∥ AF and CK = AF → parallelogram (45); adjacent sides equal → rhombus (59). (ג1) the stated product + equal included angles ∠BDC = ∠CAB (102) → SAS similarity (68). (ג2) correspondence → ∠DBC = 90° (103) → CD a diameter (104). (Coordinate-verified.)

- **expectSurfaced:** 103/104 (diameter stated — key); 92/94 + 101 fold (equal arcs STATED — key); 4/6/8 fold (stated parallels + transversal — background); 2 (crossing at K — background); 102 (key-amber, the Q6 precedent); 84, 91 (background).
- **solutionUses:** 101, 103, 10, 6, 102, 23, 4, 94, 45, 59, 68, 104.
- **mustNotSurface:** 68 (ג's pairing — the equal-angle premise is derived); 45, 59 (the ב chain IS the proof); 23 (borderline, א2's step).
- _Confidence: high — the rhombus and BK = BD verified in general position; ג's given forces the configuration (verified numerically)._

## B7 — three medians, midsegment through the centroid, cyclic AEMD, √3 similarity (booklet p62, PDF p81)

**Givens:** △ABC with medians CE, BD, AF (E, D, F midpoints); M their meet; AM ∩ ED = K; MF = a. For ה: a circle passes through A, E, M, D. (א) prove EK is a midsegment of △ABF. (ב) AK, KM via a. (ג) S_AKD : S_DKM. (ד) prove EK = KD. (ה1) prove △AKD ~ △EKM; (ה2) the ratio. No trig sub-parts.

**Solution sketch:** ED ∥ BC, = BC/2 (62). (א) in △ABF: E a midpoint, EK ∥ BF → bisects AF (63) → midsegment. (ב) 2:1 (17) → AK = 3a/2, KM = a/2. (ג) shared apex over collinear bases → 3:1. (ד) EK = BF/2, KD = FC/2 (62 twice); BF = FC → equal. (ה1) vertical angles (2) + inscribed on chord DM (102) → AA (69). (ה2) KD² = AK·KM → KD = (√3/2)a → ratio √3. (Coordinate-verified, incl. that the cyclic given is a genuine constraint.)

- **expectSurfaced:** 15 (three medians + meet stated — key), 17 (key — premise fully stated), 16 (background), 62 (ED joins two STATED midpoints — key), 10 (background); at ה: 91, 2 (background), 102 (key-amber).
- **solutionUses:** 62, 63, 15, 17, 2, 102, 69.
- **mustNotSurface:** 69 (ה's pairing); 63/64 (the א step — its parallel premise is itself derived via 62); **Appendix A2 (chord products) — never** (the solution derives AK·KM = EK·KD FROM the similarity, exactly like Q6).
- _Confidence: high — all metric claims coordinate-checked._

## B8 — cyclic kite (right kite), BE ⊥ DC, ¼-area similarity → N is the centre (booklet p69, PDF p88, exam 8 — the bagrut source of the ADR-123 operator figure)

**Givens:** kite ABCD inscribed in a circle (AB = AD, BC = DC); E on DC with BE ⊥ DC; BE crosses diagonal AC at N *(N's clause partly clipped in the scan — inferred from the figure; flag)*. Given S_NCE = ¼·S_ACD; kite area S. (א) prove ∠ADC = 90°. (ב) prove AB = NB. (ג) prove N is the circle's centre. (ד) find ∠BCD. (ה) S_ANED via S. No trig sub-parts.

**Solution sketch:** (א) ∠ABC = ∠ADC (37) + cyclic sum 180° (87) → each 90°. (ב) vertical angles (2) + right triangles (10) + AC bisects ∠BCD (38) → ∠BNA = ∠BAN → AB = NB (23). (ג) △NCE ~ △ACD (69, AA: 90° from א + shared ∠C); area ¼ → k = ½ (71) → CN = CA/2; ∠ADC = 90° → AC a diameter (104) → N = centre. (ד) NA = NB = AB → equilateral → ∠BAC = 60° (22 + 10) → ∠BCD = 60° (38). (ה) △ABC ≅ △ADC (SSS 20) → S_ACD = S/2 → S_ANED = S/2 − S/8 = 3S/8. (Coordinate-verified.)

- **expectSurfaced:** kite bundle 37, 38 (shape word + stated equal pairs); 87 (inscribed-quad stated — key, it IS א's key but its premise is fully stated); 28 fold (BE ⊥ DC stated); 2, 10, 84, 91 (background).
- **solutionUses:** 37, 87, 10, 2, 38, 23, 69, 71, 104, 22, 20.
- **mustNotSurface:** 69, 71 (the ג crown — the ¼ given must stay a whisper); **104** (no diameter is STATED — ∠ADC = 90° is what the student proves in א; surfaceable only after א lands — a step-tier transition); 20 (ה's own step); 23 (borderline).
- _Confidence: medium-high — fully verified numerically, but the scan clips N's defining sentence and ב was read as "AB = NB" (confirmed true in general position); eyeball booklet p69._

## B9 — two intersecting circles, cross-tangent chords, emergent parallelogram CEDF (booklet p78, PDF p97, exam 9 — חורף תשפ"א 2021)

**Givens:** two circles intersect at A and B. Chord AD of the right circle is tangent to the left circle at A; chord CB of the left circle is tangent to the right circle at B. The extension of chord AC cuts the right circle at E; the extension of chord BD cuts the left circle at F. (א1) prove △ABC ~ △BDA; (א2) prove ∠CED + ∠FCE = 180°; (א3) prove CEDF is a parallelogram. (ב) AC = 9, BD = 4 — the factor S_△ABC : S_△BDA (booklet answer: 9/4 ✓).

**Solution sketch:** (א1) tangent–chord twice (107) → two angle equalities → AA (69). (א2) two cyclic quads (87 twice) + F–B–D collinear (1) → sum 180°. (א3) co-interior 180° → CF ∥ ED (9); equal alternates from א1 → AC ∥ BD (5); two parallel pairs → parallelogram (definition). (ב) AB² = 9·4 → AB = 6 → ratio (3/2)² = 9/4 (71).

- **expectSurfaced:** 105 + 107 (two stated tangencies); 87 (four stated-concyclic points exist in each circle — GREEN per the B2c rule, even though the quads are never drawn); circle background 84, 91.
- **solutionUses:** 107, 69, 87, 1, 9, 5, 71.
- **mustNotSurface:** 69, 71 (the pairing is א1's task; 71 gifts ב); 5, 9 (the parallel-converses ARE the א3 route); the two-circle line-of-centres + power relations are **Appendix (O) — never**.
- _Confidence: high (ב matches the printed answer). 87 RESOLVED (operator 2026-07-03): surfaces GREEN whenever ≥4 points are stated on a circle — a drawn quad is NOT required (detectShapes also emits "מרובע חסום במעגל" for the concyclic set)._

## B10 — parallelogram, two midpoints, midsegment area, Thales ratio, cyclic-quad refutation (booklet p87, PDF p106, exam 10 — קיץ תשפ"א 2021 מועד א)

**Givens:** parallelogram ABCD, ∠A acute; E, F midpoints of BC, CD; S_△ECF = S. (ב) L midpoint of BE; a line through L parallel to AB cuts BF at M and AD at N. (ג) given BE = EF. (א) S_ABCD via S (answer: 8S ✓). (ב) LM/MN (answer: 1/7 ✓). (ג) can ABFD be cyclic? (answer: no ✓).

**Solution sketch:** (א) EF = midsegment of △BCD (62) → S_CEF = ¼·S_CBD (68/71); BD splits the parallelogram into congruent halves (43 + 20) → 8S. (ב) ABLN a parallelogram (45 → 43); extended Thales in △BCF (73): LM = AB/8; MN = 7AB/8 → 1/7. (ג) FE = ½BC → median equals half the side → ∠BFC = 90° (32); collinear (1); cyclic ⟺ ∠BAD = 90° (87 iff) — contradicts the stated acute ∠A → not cyclic.

- **expectSurfaced:** parallelogram bundle 43, 46, 48, 50; at ב: 73 (the parallel-through-L is a STATED parallel cutting a drawn triangle — step-tier key); at ג: 22 (BE = EF stated).
- **solutionUses:** 62, 68, 71, 43, 20, 45, 73, 32, 1, 87.
- **mustNotSurface:** 32 (the ג aha — its premise is assembled, never stated); 68/69/71 initially. Borderline (deliberately in neither list): 62 — E, F are stated midpoints but the third side BD is an undrawn diagonal; surfacing 62 half-reveals א.
- _Confidence: high (all three booklet answers reproduced)._

## B11 — tangent pair at 90°, circumcircle of the contact triangle, 45° chase to BD = DE (booklet p96, PDF p115, exam 11 — קיץ תשפ"א 2021 מועד מיוחד)

**Givens:** from A two tangents touch the circle at B and C; ∠CAB = 90°; BE, CE chords; the circle circumscribing △ABC cuts chord CE at D. Prove: (א) BD = DE; (ב) △ADB ~ △CEB; (ג) S_△CEB = 2·S_△ADB.

**Solution sketch:** AB = AC (108) + 90° → 45° base angles (22 + 10). (א) tangent–chord → ∠BEC = 45° (107); in ω′ (circumcircle of ABC): ∠BAC = 90° → BC a diameter (104) → ∠BDC = 90° (103) → ∠BDE = 90° (1) → third angle 45° (10) → BD = DE (23). (ב) ∠ADB = ∠ACB (102) = 45° = ∠BEC; ∠DAB = ∠DCB (102) → AA (69). (ג) ratio 1/√2 (28) → areas ½ (71).

- **expectSurfaced:** 108, 109, 105 (two tangents from a point — full bundle), 107; **104** (∠CAB = 90° stated + A on the STATED circumscribing circle — the canonical announcement); background 10, 84, 91.
- **solutionUses:** 108, 22, 10, 107, 104, 103, 1, 23, 102, 69, 28, 71.
- **mustNotSurface:** 69, 71 (the ב/ג pairing); 23 (the א closer — surfacing it next to 104 nearly spells out א).
- _Confidence: high; double-check in the figure: order C–D–E on the chord, and A, C on the same side of chord DB (both needed for the 102 steps)._

## B12 — cyclic quad on a diameter, external perpendicular, arc-midpoint chase, tangent proof (booklet p106, PDF p125, exam 12 — קיץ תשפ"א 2021 מועד ב)

**Givens:** quad ABCD inscribed in circle O; AB a diameter; E on the extension of AD with CE ⊥ AE. (א) prove △CDE ~ △ABC. Given: S_△CDE/S_△ABC = 1/4 and OD ⊥ AC. (ב) prove OC ∥ AD **[SOURCE-TYPO RESOLVED, 2026-07-03: the printed booklet part-ב glyph reads "⊥" (operator confirmed the print) — but ⊥ is geometrically IMPOSSIBLE and the exam's own part ג proves ∥. Two independent proofs: (1) the givens (OD⊥AC, ratio 1/4) force the unique valid inscribed order A=180°,B=0°,D=240°,C=300°, where OC=(0.5,−0.866)=AD exactly — both at −60°, parallel; ⊥ would need C,D on opposite sides of AB, i.e. a crossed quad. (2) part ג asks to prove CE tangent at C, i.e. CE⊥OC; since CE⊥AE=CE⊥AD, tangency holds iff OC∥AD — if ב were OC⊥AD, CE would be ∥OC and could never be tangent. The compilation booklet ("חוברת בגרויות 571") has a print typo in part ב; the original exam says ∥. Corpus keeps ∥.]**. (ג) prove CE is tangent to the circle.

**Solution sketch:** (א) ∠CDE = 180° − ∠ADC (1) = ∠ABC (87); ∠DEC = 90° = ∠ACB (103) → AA (69). (ב) ratio ½ (71) → CD = R; OD ⊥ AC → OD bisects arc AC (97) → AD = DC = R (94); equilateral △ODC (22 + 10) → ∠DAC = 30° (99) = ∠OCA (22 + 10) → alternates equal → AD ∥ OC (5). (ג) CE ⊥ AD and AD ∥ OC → CE ⊥ OC (6) → tangent at C (106). *(Analytically verified: A at 180°, D at 240°, C at 300° satisfies every given.)*

- **expectSurfaced:** 103/104 (diameter stated — key); **87** (quad STATED inscribed — key); 97 (OD ⊥ AC stated: a perpendicular from the centre to a chord — step-tier key); 84, 91, 1 (background).
- **solutionUses:** 1, 87, 103, 69, 71, 97, 94, 99, 22, 10, 5, 6, 106.
- **mustNotSurface:** 69, 71 (א's task + ב's key); **106** (the ג crown — nothing states perpendicular-to-a-radius); 5 (ב's converse — premise fully derived).
- _Confidence: high throughout. ב's target is OC ∥ AD — proven two ways (the forced config + part ג's tangency); the booklet's printed "⊥" is a source typo (resolved 2026-07-03, see the bracketed note above). Operator may verify against the ORIGINAL exam PDF (not this compilation) if certainty is wanted._

## B13 — right triangle on a diameter, doubled cevian, cyclic-quad similarity, tangent at the far vertex (booklet p116, PDF p135, exam 13)

**Givens:** △ABC inscribed, BC a diameter (radius R); G beyond A on the extension of CA with GA = AC; GB cuts the circle at D. Given: S_DBCA/S_GAD = 15. (ד) the tangent at C cuts the extension of BA at E.

**Solution sketch:** (א) ∠BAC = 90° (103) → ∠BAG = 90° (1) → △ABG ≅ △ABC (SAS 18) → AB bisects ∠GBC; corollary BG = BC = 2R. (ב) ADBC cyclic (87) → ∠GDA = ∠GCB (1 + 87); ∠G common → △GBC ~ △GAD (69). (ג) S_GBC = 16·S_GAD → ratio 4 (71) → GA = R/2 → AC = R/2. (ד) tangent ⊥ diameter (105) → △BAC ~ △BCE (69); AB² = 15R²/4 (28) → area ratio 16/15 (71). *(Coordinate-checked.)*

- **expectSurfaced:** 103 (diameter stated — key); 87 (GREEN — all four concyclic points typed and the quad NAMED in the ratio given; per the B2c rule ≥4 concyclic points suffice); 105 at the ד step (tangent typed — step-transition); 84, 91, 10 (background).
- **solutionUses:** 103, 1, 18, 87, 69, 71, 105, 28.
- **mustNotSurface:** 18 (א's device — its right angle is derived); 69 (ב/ד pairings); **Appendix (O) — never**: the two-secants power at G (gifts ג) and tangent–secant at E.
- _Confidence: high (coordinate-verified; א may officially route 27+24 — same verdict either way)._

## B14 — isosceles triangle, two perpendiculars trisecting the base, kite + rectangle-of-feet, cyclic-point existence (booklet p125, PDF p144, exam 14)

**Givens:** isosceles △ABC (BA = BC); D on BC with DK ⊥ AC (K on AC); E on BA with EL ⊥ AC (L on AC); given AL = LK = KC. (ב) EK ∩ DL = G; prove BDGE is a kite. (ג) AC = 45, perimeter of EDKL = 54; find BG. (ד) is there F on LINE BG making BDFE cyclic?

**Solution sketch:** (א) apex altitude BM = median (24); DK ∥ BM (7) → extended Thales (73) → BD/DC = 1/2. (ב) △ALE ≅ △CKD (ASA 19; base angles 22) → BE = BD, EL = DK; △ELK ≅ △DKL (SAS 18) → GL = GK (23) → GE = GD → kite (definition). (ג) ELKD is a parallelogram (45) with a right angle → rectangle (54) → ED = 15, EL = 12; G = the rectangle's centre (46), height EL/2 = 6 (62/63); B, G on AC's perpendicular bisector (83) → collinear with M; BM = 18 (69) → BG = 12. (ד) YES: BG bisects ∠DBE (38, proven kite); choose F with ∠BDF = 90°; △BDF ≅ △BEF (SAS 18) → opposite angles 180° → cyclic (87 iff); F lands beyond G — hence "the LINE BG". *(Coordinate-checked: BD/DC = 1/2, BG = 12.)*

- **expectSurfaced:** 22 (BA = BC stated — key); 24 (isosceles bundle); 10, 28 (background once the ⊥s are stated). Kite 37/38 surface only once the quad BDGE **exists and is detected as a kite in the figure** — i.e. after G = EK ∩ DL is constructed and B,D,G,E form the kite (per the B1 rule: theorems follow detectShapes, NOT a "question target"; the tool never sees the goal text). This lands late naturally because G is a late construction, not because "a proof part was reached."
- **solutionUses:** 24, 7, 73, 22, 19, 18, 23, 45, 54, 46, 62/63, 83, 69, 38, 87 (+ 91 in the alternative ד route).
- **mustNotSurface:** 18, 19 (nothing states congruent triangles); 23; 45, 54, 46 (the ג rectangle identification is the student's derivation); 37/38 **before the kite is built/detected** (not tied to a question part); 69.
- _Confidence: high on all values; medium only on which ד justification the official solution uses (answer certain)._

## B15 — tangent + centre-line from an external point, perpendicular at A, hidden isosceles (booklet p134, PDF p153, exam 15)

**Givens:** circle radius R centre O; from external A: tangent AB at B; line AD through O cutting the circle at C then D; AG ⊥ AD with G, B, D collinear; ∠ADB = α. (ג) AG = 8, AC = ½·DC. (ד) S = S_△BDC.

**Solution sketch:** (א) ∠BOA = 2α (99); △ABO right (105) → ∠GAB = 2α; ∠AGB = ∠ABG = 90° − α (10). (ב) tangent–chord ∠ABC = α (107); ∠A common → △ABC ~ △ADB (69) → AB/AC = DB/BC. (ג) ∠ABG = ∠AGB → AB = AG = 8 (23); AC = R → AO = 2R; Pythagoras (28) → R = 8√3/3. (ד1) ∠DAG = 90° = ∠DBC (103, DC a diameter) → △ADG ~ △BDC (69). (ד2) OB = ½AO → 30° (34); BC = ½DC (33), BD = R√3 (28) → ratio √3 → S_ADG = 3S (71). *(Coordinate-checked: α = 30°.)*

- **expectSurfaced:** 105 + 107 (ONE tangent stated — pair only, NOT 108/109); 103 (the line through O stated → CD a stated diameter — key); 10, 28, 1 (background).
- **solutionUses:** 99, 105, 10, 107, 69, 23, 28, 103, 34, 33, 71.
- **mustNotSurface:** 69 (ב/ד1 pairings); 23 (AB = AG is the hidden aha unlocking ג); **Appendix (O) — never**: tangent–secant power AB² = AC·AD (gives ג in one line).
- _Confidence: high (coordinate-verified)._

## B16 — rectangle, cevian ∩ diagonal, a STATED cyclic quadrilateral (booklet p145, PDF p164, exam 16)

**Givens:** rectangle ABCD; E on AD; CE cuts diagonal BD at F; quadrilateral EABF is cyclic (**stated as a given**). (ב) DE = EA → EF/FC. (ג) S = S_△DEF → S_DFC, S_BFC. (ד) similarity ratio △DAB : △BFC. (ה) DE = a: BD, and the diameter of the circle around EABF.

**Solution sketch:** (א) cyclic → ∠BFC = ∠EAB = 90° (87 + 1) ; alternates (4) → △DAB ~ △BFC (69). (ב) △DEF ~ △BCF (4 + 2 → 69) → EF/FC = DE/BC = 1/2 (43). (ג) shared altitude → S_DFC = 2S; ratio ½ → S_BFC = 4S (71). (ד) ED² = EF·EC (69 via the right angles, 1); EC = ED√3 → DC = ED√2 (28) → BD = ED√6 (28) → ratio √6/2. (ה1) BD = a√6. (ה2) ∠EAB = 90° inscribed in the STATED circle → EB a diameter (104) → EB = a√3 (28). *(Coordinate-verified: the cyclic given forces CE ⊥ BD.)*

- **expectSurfaced:** **87 (the cyclic quad is STATED — the rare given-announced case, key)**; **104** (the stated rectangle's right angle at A sits inscribed in the stated circle — key); rectangle bundle 52 + 43, 46, 48, 50 (collapsed); 4, 2, 10, 28 (background).
- **solutionUses:** 87, 1, 4, 2, 69, 43, 71, 28, 104.
- **mustNotSurface:** 69 (THREE distinct pairings in one question — a strong negative test); **Appendix (O) A5/A6 — never** (altitude-to-hypotenuse geometric mean gives ד instantly).
- _Confidence: high (the hidden cyclic⟺CE⊥BD constraint verified; check the figure's vertex order)._

## B17 — two circles through A,B; chords through one intersection, third side through the other (booklet p154, PDF p173, exam 17)

**Givens:** two circles meet at A and B. Chord AC of the left circle cuts the right circle at D; chord AE of the right circle cuts the left circle at F; segment CE passes through B. (א) prove △ACE ~ △BCD; (ב) given DC = FE, prove △BFE ≅ △BCD; (ג1) prove AC·BE = AE·BC; (ג2) prove AB bisects ∠CAE; (ד) prove ∠DEC = ∠FCE. Pure geometry.

**Solution sketch:** (א) ∠BDC = 180°−∠ADB (1) = ∠AEB (87, cyclic ADBE); ∠C common → AA (69). (ב) same shape on the left circle (1 + 87) + included side FE = CD → ASA (19) → BE = BD, BF = BC. (ג1) the א ratio + BD = BE → AC·BE = AE·BC. (ג2) AC/AE = BC/BE with B on CE → converse bisector-ratio (77) → AB bisects ∠CAE. (ד) two 102-steps chained through ג2.

- **expectSurfaced:** 87 + 102 (four stated concyclic points in each circle — key); 1 (background).
- **solutionUses:** 1, 87, 69, 19, 77, 102.
- **mustNotSurface:** 69 (א's task); 18–21 (ב's congruence is the task); **76/77** (no bisector is stated anywhere — ג2 is where the student PROVES one; surfacing the family gifts it).
- _Confidence: high; double-check the printed similarity correspondence in א (A↔B, C↔C, E↔D)._

## B18 — tangent at the arc-midpoint, secant extension, chords meeting inside (booklet p165, PDF p184, exam 18)

**Givens:** A, B, C on a circle; E = midpoint of arc BC; the tangent at E meets the extension of chord AB at G; chords AE, BC meet at F. (א) prove △ACE ~ △AEG; AE = 3√6, AG = 6: (ב) AC; (ג) prove BC ∥ GE; S_ABF = 2·S_BFE: (ד) AB; (ה) S_ABF : S_AFC. Pure geometry.

**Solution sketch:** (א) equal arcs → ∠CAE = ∠GAE (101); tangent–chord → ∠AEG = ∠ACE (107) → AA (69). (ב) AC = AE²/AG = 9. (ג) ∠GEB = ∠BAE (107) = ∠EBC (101 + 102) → alternates → BC ∥ GE (5). (ד) AF/FE = 2; extended Thales in △AGE (73) → AB = 4. (ה) three similarity steps (69 via 107/6/2+102) → S ratio = BF : FC = 4 : 9. (All five answers mutually consistent numerically.)

- **expectSurfaced:** 92/94/101 (arc-midpoint stated — key); 107 + 105 (tangent stated — key); 2 (chords crossing at F, background); 102, 10 (background).
- **solutionUses:** 101, 107, 69, 5, 102, 2, 73, 6.
- **mustNotSurface:** 69 (א's pairing); 5/7 (ג asks to PROVE the parallel); 73 before ג lands (its ∥ premise is ג's result — step-tier); **A4 tangent–secant power — Appendix (O), never** (the solution derives GE² = GB·GA from the similarity).
- _Confidence: high._

## B19 — right triangle, cyclic quad through the right-angle vertex, tangent hypotenuse (booklet p176, PDF p195, exam 19)

**Givens:** △ABC, ∠ACB = 90°; G on AC, F on AB, H on CB with GCHF inscribed in a circle; AB tangent to that circle at F; GH ∥ AB. (א) prove FG = FH; (ב1) ∠ACF; (ב2) prove △GFC ~ △FBC; the diameter from F cuts AC at E: (ג) prove ∠FEB = ∠FCB. Pure geometry.

**Solution sketch:** (א) 107 + 4 → ∠FGH = ∠FHG → FG = FH (23). (ב1) ∠GFH = 90° (87, opposite the stated right angle) → right isosceles (22 + 10) → ∠ACF = ∠GHF = 45° (102). (ב2) 107 on chord FC + the 45° split → AA (69). (ג) the diameter at F ⊥ AB (105) → ∠EFB = 90°; with ∠ECB = 90° → ECBF cyclic (87) → ∠FEB = ∠FCB (102). (Coordinate-verified.)

- **expectSurfaced:** 87 + 102 (GCHF STATED inscribed — key); 105 + 107 (tangent stated — key); 104 (the stated 90° at C sits inscribed in the stated circle → announces GH a diameter — canonical); 4/6/8 (GH ∥ AB stated, background); 28/31 fold, 10 (background).
- **solutionUses:** 107, 4, 23, 87, 22, 10, 102, 69, 105, 104.
- **mustNotSurface:** 69 (ב2's task); 22/23 on △FGH before א (FG = FH is the thing to prove); 97/94 (the alternative arc route — premise derived).
- _Confidence: high — coordinate-verified._

## B20 — tangent + secant from outside, parallel chords, late centre, concyclic O-C-E-K (booklet p186, PDF p205, exam 20)

**Givens:** from external B, a tangent at C and a secant through E then A; D on the circle with CD ∥ EA; chords ED, AC meet at K. (א) prove △CEB ~ △DCE. ED = 7, AK = 3, S := S_CEK: (ב) S_CKD via S. BC = 35/√32: (ג) S_CEB via S. O the centre: (ד) prove ∠COE = ∠CKE. ∠CAE = 45°: (ה) why are O, C, E, K concyclic? Pure geometry.

**Solution sketch:** (א) 107 + 4 → AA (69). (ב) 4 → equal arcs (100) → ∠AED = ∠EAC (101) → KE = KA = 3 (23) → KD = 4 → S_CKD = (4/3)S. (ג) ratio k = BC/DE = 5/√32 → S_CEB = k²·(7S/3) = 175S/96 (71). (ד) exterior angle (11) + 101 → ∠CKE = 2∠CAE; 99 → ∠COE = 2∠CAE. (ה) both 90° → each circle through C,E with a 90° angle has CE as diameter (91 + 104) → same circle.

- **expectSurfaced:** 107 + 105 (tangent stated — key); 4/6/8 (parallel chords stated, background); 2 (crossing at K, background); 102 (background); 99 (key from the moment O is typed).
- **solutionUses:** 107, 4, 69, 100, 101, 23, 71, 11, 99, 91, 104, 1.
- **mustNotSurface:** 69 (א's pairing); 23 (the KE = KA isosceles is ב's aha); 71 before א lands; **A2/A4 — Appendix (O), never**; 104/91 before the 45° given lands (step-tier, the Q5 precedent).
- _Confidence: high on א–ד; medium on ה's citable closing line ("the unique circle on a diameter" — definition-level; the question says "הסבירו", which tolerates it)._

## B21 — two circles through A,B; the ADR-098/103 operator figure (booklet p196, PDF p215, exam 21)

**Givens:** two circles meet at A, B; C on the right circle; extensions of CA, CB cut the left circle at D, E; F on arc BC; extensions of DE, CF meet at G. (א) prove ∠EDA = ∠CBA; (ב) prove GDAF is cyclic; BC ∩ AF = H, given ∠GEC = ∠CHA: (ג) prove CG/CD = GE/DE; given CE ⊥ AB, CD = 36, DE = 18: (ד) find CG, EG. Pure geometry. _(The same figure and numbers as the operator's live sessions behind ADR-098/103.)_

**Solution sketch:** (א) 87 + 1. (ב) 1 + 102 → opposite angles sum 180° → cyclic (87, converse direction). (ג) the stated angle equality forces ∠FAB = ∠ACB (1, 87, 11, 10); then ∠BCF = ∠BAF (102) → CE bisects ∠DCG → bisector-ratio (76) in △DCG → CG/CD = GE/DE. (ד) CE ⊥ AB → ∠GDC = 90° (א); CG = 2·GE + Pythagoras (28) → GE = 30, CG = 60 (36-48-60).

- **expectSurfaced:** 87 + 102 (stated concyclic sets, both circles — key); 1 (background); 28 (background once CE ⊥ AB is typed); 10/11 fold.
- **solutionUses:** 87, 1, 102, 11, 10, 76, 28.
- **mustNotSurface:** **76/77** — no bisector is stated; that CE bisects ∠DCG is exactly the ג discovery (same sharpness as trig-Q7).
- _Confidence: high — the numbers close exactly (3-4-5), and the figure matches the operator's sessions._

## B22 — cyclic quad, tangent at C, AB = CB, bisecting diagonal (booklet p206, PDF p225, exam 22)

**Givens:** ABCD inscribed; diagonals meet at F; the tangent at C cuts the extension of AB at E; AB = CB. (א) prove ∠EBC = 2∠BDC. Given AC bisects ∠ECD and CD/CF = 7/4: (ב1) prove AC = AD; (ב2) AD/CD; (ב3) S_ABF : S_CBF. S := S_ABF: (ג) S_AEC via S.

**Solution sketch:** (א) 94 + 101 (AB = CB) + 1 + 87. (ב1) 107 + the stated bisector → ∠ACD = ∠ADC → AC = AD (23). (ב2) DF bisects ∠ADC (from א) → 76 → AD/CD = 4/3. (ב3) shared height → 4 : 3 (76). (ג) isosceles altitude (24) + 102 + △EBC ~ △ECA (107 + 69) → S_AEC = (11/4)S. (Cyclic consistency check: 112° + 68° = 180° ✓.)

- **expectSurfaced:** 87 + 102 (stated inscribed quad — key); 105 + 107 (tangent stated — key); 22 + 93/94 (AB = CB stated — key); 2, 1, 10 (background).
- **solutionUses:** 94, 101, 1, 87, 107, 23, 76, 24, 102, 69, 10.
- **mustNotSurface:** **76/77** (the bisector actually used is DF, whose property is DERIVED from AB = CB; the stated bisector AC is not in a 76 configuration); 69 (ג's pairing); **A4 — Appendix (O), never**.
- _Confidence: medium-high — all answers verified numerically; double-check the ב1 tangent–chord side (∠ECA = ∠ADC vs the figure) and whether the official ג goes by trig (either route → 11S/4)._

## B23 — AB diameter, cyclic CEFO, midsegment parallelogram, a common tangent (booklet p218, PDF p237, exam 23)

**Givens:** △ABC inscribed in circle O, AB a diameter; E on BC, F on BO; CEFO cyclic (stated). (א) prove EF = EB. The CEFO circle cuts AC at D with ED ∥ AB: (ב1) prove EDOB is a parallelogram; (ב2) prove OD ⊥ AC. ℓ tangent at C to the big circle: (ג) prove ℓ is tangent to the CEFO circle. Pure geometry.

**Solution sketch:** (א) radii-isosceles (22) + 1 + 87 → ∠EFB = ∠EBF → EF = EB (23). (ב1) 103 (AB diameter) + 6 + 102 + 99 → OD ∥ BC; with ED ∥ OB stated → parallelogram (definition; D, E emerge as the midpoints of AC, CB). (ב2) OD ∥ BC ⊥ AC (103) → OD ⊥ AC (6). (ג) ∠ODC = 90° (ב2) inscribed in the small circle → OC its diameter (104); ℓ ⊥ OC (105) → tangent to the small circle too (106). (Coordinate-verified, incl. the small circle's centre at the midpoint of OC.)

- **expectSurfaced:** 103/104 (diameter stated — canonical key); 87 + 102 (CEFO stated cyclic — key); 22 (radii-isosceles, background); 4/6/8 (ED ∥ AB stated, background); 105 + 106/107 (key from the moment ℓ is typed); 10 (background).
- **solutionUses:** 22, 1, 87, 23, 103, 6, 102, 99, 7, 104, 105, 106.
- **mustNotSurface:** 23 on △EFB before א; 5/7 (proving parallels is ב1's work); **62/63** (D, E ARE the midpoints but nothing states it — a midsegment hint collapses ב); 44/45/47 (the parallelogram characterizations — the proof is by definition).
- _Confidence: high — coordinate-verified; check the print that C sits on the B-side half (forces F on OB, matching the figure)._

---

## Coverage read-out (final — Q5–Q7 + B1–B4, B6–B23; B5 removed)

**Grounded (25 usable questions):** circle block 92/94/97–107 + 108/109 ✓ (87 is the single most exercised id — in ~10 questions, stated-premise AND refutation AND converse-direction); isosceles 22/23/24 ✓; medians/centroid **15/16/17** ✓ (B3, B7); midsegment **62/63** ✓ (B7, B14, + B23 as a sharp negative); Thales **73** ✓ (B10, B14, B18); congruence **18/19/20** ✓; similarity 68/69/71 ✓ (the dominant negative class — ~15 questions); bisector family **76/77/78/80** ✓ with a full CONTRAST SET for 76 (given-announced in B4; must-not-surface in Q7, B21, B22; converse 77 in B17); quad characterizations **44/45/47/54/59** ✓ (mostly negatives — by design); kite **37/38** ✓; ⊥-bisector **82/83** ✓; 30° pair **33/34** ✓; parallel-converses **5/7/9** ✓ (negatives); tangent-converse **106** ✓ (B12, B23); Appendix-(O)-never exercised in ~10 questions ✓. **Still thin (target in the next corpus addition):** parallels 4–9 as a question's MAIN event; trapezoid 39–42 (the removed B5's exam had exactly that as its X'd Q4 — a clean trapezoid question is the intended fill); the incircle-as-a-drawn-object case for 80/81 (lost with B5; 80 still covered via the two-bisectors route in Q2/Q4); Thales-converse 74; rectangle/square characterizations 52/53/60.

## Operator review checklist — RESOLVED (operator verdicts, 2026-07-03/04)

_All 12 review items adjudicated. The corpus above has been amended accordingly._

1. **B12 (booklet p106), part ב — RESOLVED (source typo).** Operator confirmed the printed glyph reads "⊥". But ⊥ is geometrically impossible and the exam's own part ג (prove CE tangent) is satisfiable ONLY if **OC ∥ AD**. Re-read the actual page + re-derived the full figure: the givens force A=180°,B=0°,D=240°,C=300°, where OC and AD are the identical vector (−60°) — exactly parallel; part ג needs CE⊥OC and CE⊥AD, so OC∥AD. The compilation booklet has a print typo in ב. Corpus keeps **∥**. (Operator may cross-check the original exam PDF.)
2. **B8 (booklet p69) — CONFIRMED.** N = BE ∩ AC and ב = "AB = NB" both correct.
3. **B5 — REMOVED.** Operator: "remove this question." Entry deleted; the trapezoid-family (39–42) gap it never filled stays open.
4. **B2 — RESOLVED.** Operator: "it is given." "M is the circumcenter of △BDC" is a GIVEN → 98 surfaces the moment M is typed (no post-ב demotion).
5. **B11 — CONFIRMED.** Order C–D–E on the chord and A,C on the same side of DB both correct.
6. **Pedagogy calls (from the B-section of the review):**
   - **B0 — theorems can DECREASE in relevance as later givens arrive** (relevancy is re-assessed per step, not monotonic); **definitions + Appendix (O) items may appear as SUPPLEMENTAL/extra content when relevant** (previously "structurally never"). Folded into [16-theorems-plan.md](../16-theorems-plan.md).
   - **B1 — the tool never sees the question text**, so there is NO "target shape" concept. Shapes that are **detected in the figure (detectShapes)** surface their theorems; a kite's 37/38 fire when a kite IS detected (e.g. B14 once BDGE is built), not "after a proof part."
   - **B2c — #87 surfaces GREEN whenever ≥4 points are stated on a circle** (drawn quad NOT required); detectShapes also emits "מרובע חסום במעגל" for the concyclic set. Applied to B9, B13.
   - **B3c — non-issue.** "We will never know what the question is, so there is no dilemma" — a given-announced theorem that happens to answer a sub-question is fine; no question-text exception is needed or possible.
7. **B17 (booklet p154) — CONFIRMED.** Similarity correspondence A↔B, C↔C, E↔D correct.
8. **B22 (booklet p206) — CONFIRMED.** ב1 tangent–chord side (∠ECA = ∠ADC) correct.
9. **B23 (booklet p218) — CONFIRMED.** C on the B-side half (F on OB) correct.
