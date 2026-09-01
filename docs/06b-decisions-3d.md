# 06b — Decision log: the 3-D space/vectors tool (`/3d-builder/`)

_The 3-D track's OWN ADR log (ids `ADR-3D-NNN`), separate from [06-decisions.md](06-decisions.md) **by design** — docs/20 §12 rule 3: two parallel session streams must not race on one ADR numbering sequence. Same conventions otherwise: every significant decision gets an entry; the plan of record is [20-space-vectors-tool.md](20-space-vectors-tool.md)._

---

## ADR-3D-001 — V0 walking-skeleton decisions (2026-07-06)

**Context.** V0 builds the second app end-to-end thin (docs/20 §8): entry + build at `/3d-builder/`, `Vec3` engine with cube/box/right-prism constructs, SVG projection renderer with textbook hidden-edge dashing + orbit, store clone, first parser rules. Several small decisions were made while realising it:

1. **Layout: `src3d/` beside `src/`, zero imports between them.** The chassis transplants as *patterns* (store/replay, parser rule pipeline, i18n policy, DOM-free render tests) — copied, never extracted into shared modules while the 2-D bug-fix stream is active (docs/20 §12 rule 1). One repo, one test suite, one `node_modules`.
2. **Build: a second Vite config (`vite.config.3d.ts`), not a multi-page single build.** The two apps need different `base` paths (`/geo-builder/` vs `/3d-builder/`), which one Vite build cannot produce. Entry `3d.html` at repo root → `dist-3d/`; dev needs no separate server (the main `npm run dev` serves `/3d.html`). **Deploy note:** rollup keeps the entry's filename, so the deploy step copies `dist-3d/3d.html` → `httpdocs/3d-builder/index.html` (a rename, nothing more).
3. **Canonical prime is ASCII `'`** (`A'`) everywhere in ids/commands; the parser normalises U+2032 `′` and `’` on input, and the renderer displays `′` typographically. One form stored, ever (docs/20 §11 risk).
4. **The camera is orthographic, orbit-only, and NEVER part of the figure.** `{yaw, pitch}` + zoom live in component state — outside the store, outside undo, outside save (when save arrives). Home view = yaw −60°, pitch 20° (the ¾ textbook view). "Show another configuration" resamples the FIGURE's free DOFs; orbit changes only the viewpoint — two controls, two concepts, deliberately not mixed.
5. **Hidden-edge rule (V0): both-bordering-faces-back-facing, outward normals derived numerically** (flip toward "away from the solid's centroid"), so face-ring orientation can never be a silent bug. Exact for convex solids — the entire V0 universe. Dashed edges are emitted before solid ones so visible lines paint over them at crossings.
6. **Free-DOF policy transplanted (ADR-052 + ADR-101):** a cube's edge is pure similarity gauge → fixed at 1 and rightly NOT resampled (a rescale is invisible after fit); a box's depth/height and a prism's base-triangle shape + height ARE shape DOFs → sampled per `(seed, object-identity key)` — keying by identity, not insertion order, is what makes stability structural (the first-class regression test).
7. **V0 honesty refusals:** `מנסרה` without `ישרה`/right is *not-handled* (an oblique prism is real geometry we don't draw yet — assuming "right" would assert an unstated given); a stated ratio clause that doesn't fit its segment refuses rather than silently dropping the ratio. Both locked by parser tests.
8. **The store derives, never caches:** unlike the 2-D store (expensive replay → derived state cached in the store), V0's `derive3(facts, seed)` is closed-form and cheap, so the figure is computed by `useMemo`/tests on demand. Undo restores `{facts, seed}` and *everything* follows — the derived/undo desync class is impossible by construction. Revisit only if replay ever grows a real solver cost.
9. **Own i18n instance** (`i18next.createInstance` + `I18nextProvider`), own locale files under `src3d/i18n/` — the 2-D `he.json`/`en.json` are never touched (docs/20 §12 rule 2), and the instances can't clobber each other in the shared vitest process.
10. **No new dependencies.** The renderer decision (docs/20 D2) held: the whole app builds on the existing React/Zustand/i18next stack — `dist-3d` is ~69 KB gzipped.

**Gate (docs/20 §8 V0):** `קובייה ABCD` / `cube ABCD` → an orbitable textbook cube (12 edges, exactly the far vertex's 3 dashed); right prism likewise; box/prism/free-t resample under "show another configuration" while stated facts (midpoint, AK=2KA′) hold; stability regression green; 46 src3d tests + full suite green, `tsc -b` + both builds clean.

**Out (deferred to V1+):** pyramid (its apex-above-centroid "right" default needs the ADR-052 treatment properly, not a rushed default), the LLM fallback, save/load, catalog panel, responsive canvas sizing, named basis vectors — the V1 lane.

---

## ADR-3D-002 — V1: the geometric-vector lane (2026-07-06)

**Context.** docs/20 §8 V1: named basis vectors, the bounded symbolic layer, vector-expression claims, ⊥-to-plane/collinearity claims, centroid — gated on 2020-Q2 א–ב + 2023-Q2 א–ב reproducing end-to-end from typed He/En utterances. Both gates pass (`src3d/__tests__/scenarios3.test.ts`).

**Decisions:**

1. **A CLAIM is a first-class fact kind — the student's ANSWER, verified, never a driver.** `{type:'claim'}` commands add nothing to the construction (apply only validates references); the store's `derive3` verifies each claim against the final figure **across four seeded configurations** (`claims.ts` — the multi-sample discipline: a statement true only in one drawing of a free-dim figure is a coincidence and is refuted). A refuted claim is **refused with keep-prior** (`claim-refuted`), so a wrong answer never sits on the figure; a verified claim shows a green ✓ on its fact row. Claim forms in V1: `vec-eq` (`AM = ½u + ½v + 5/3·w` — both sides linear combinations), `perp-plane` (`CA' מאונך למישור BC'D`), `collinear3` (`E, C, A' על ישר אחד`); optional proof-verb prefixes (`הוכיחו כי`, `prove that`) accepted and ignored.
2. **The symbolic layer is exactly docs/20 §6.2 and no more:** `VecExpr = Σ coeff·atom` (atom = declared name or point pair), numeric evaluation, and ONE 3×3 Cramer decomposition (`decompose3`). No Gram-matrix machinery was even needed — coordinates of the evaluated figure serve directly. **NO CAS (D3) held.**
3. **`נסמן: AA' = w, KC = v, KB = u`** lowers to `name-vector` bindings (single lowercase letter → ordered pair; vector arrows `→`/`⃗` stripped in normalisation). The `נסמן`/`denote`/`let` keyword is what separates naming from a `vec-eq` claim — both contain `=`.
4. **2020-ב's `P על AM כך ש-KP = αu + βv` DEFINES P (Greek scalars = unknown coefficients), closed-form:** the complement coefficient of `decompose(K→P(t))` is **affine in t**, so the drive is one division — the V1 embodiment of the "1–2-DOF numeric root-finds only" boundary. Guard rails: apply requires a full 3-vector basis (`need-basis`); a `checkInSpan` post-check at the display seed flags `no-solution` / `not-on-segment` (על means ON the segment — the 2-D ADR-077 principle), refused keep-prior — evaluate's midpoint fallback can never silently ship a wrong figure. **Parser tripwire:** `spanPoint` runs BEFORE `onSegment`, and `onSegment` hard-refuses any Greek-containing utterance — a span condition must never degrade into a silent free point (§6 honesty).
5. **Auxiliary segments auto-draw (FR-IN-7 transplanted):** every pair atom in a claim, the ⊥ segment + its plane's triangle, the centroid's triangle, and the span point's carrier/vector segments are emitted as idempotent `segment3` commands by the PARSER (macro-style lowering; the engine stays dumb; a solid edge is never duplicated). Bare `AM` / `קטע AM` also draws.
6. **Aux-segment dashing = the textbook interior rule:** dashed iff its midpoint is strictly inside a solid (the body would occlude it) or lies only on back-facing faces — so on the 2023 cube, CA′ (space diagonal) and BD (bottom-face diagonal) dash while BC′ (front-face diagonal) stays solid, matching the printed exam figure. Judged at the midpoint — exact for a straight segment vs convex solids.
7. **Verification tolerances are relative** (`1e-7`) — the closed forms are exact to double precision (t = 2/5 asserted to 1e-10 across seeds), so the tolerance only absorbs float noise, never masks a wrong answer (the refuted-claim tests pin this).

**Gate:** both corpus sequences build He+En through the real submit path; wrong answers (`AM = u+v+w`, wrong α,β, false ⊥, false collinearity) refused with `claim-refuted`; answers survive "show another configuration" (prism free dims resample, claims re-verify); E lands at the exact centroid; the aux segments dash per the textbook. **80 src3d tests green, `tsc -b` + `build` + `build:3d` clean.**

**Out (next slices):** the exams' coordinate halves (ג onward — the V2 algebraic lane + the V4 pivot), medians drawn for a centroid, vector-expression measure labels, the catalog.

---

## ADR-3D-003 — named vectors show on the figure: arrow-above + underline notation, direction chevron, auto-drawn segment (2026-07-06)

**Context.** Operator (after the V1 gate): *"when marking a vector w, we should show it with the arrow and underline."* V1 bound names but showed nothing on the canvas — and the named pairs themselves (KC, KB in 2020-Q2) weren't even drawn, since they're not solid edges.

**Decision.** Naming a vector now produces the full textbook marking:

1. **The named pair auto-draws** — `nameVectors` lowers each `XY = n` to an idempotent `segment3` + `name-vector` (the parser-macro convention of ADR-3D-002 §5; an existing edge like AA′ is a no-op). The 2020 exam figure's KC/KB arrows now appear.
2. **A direction chevron on the segment** at 55% of the way from→to (a filled triangle rotated to the screen-space direction) — the vector's orientation is visible on the figure itself.
3. **The name label in vector NOTATION** beside the midpoint (on the side facing away from the figure): the italic letter with an **arrow drawn above** (shaft + head) **and an underline** — drawn as explicit SVG lines (not font tricks/combining characters, which render unreliably), with the standard white halo.

Scene3 emits a new pure primitive (`SceneVector3`); Figure3 is a dumb map over it, per the established split. Label side selection uses the viewport centre (the figure is fit-centred).

**Amendment (same day, operator: "when a vector is AA' the arrowhead should be at A'. In general I want vectors to have a different color so it is clear where they start and where they end").** The mid-segment chevron was the wrong reading of direction — vector direction is TAIL→HEAD, so the marker belongs AT the head. A named vector now renders as **its own coloured arrow**: a teal (`#0d9488`) overlay line along the full from→to segment, an **arrowhead exactly at the `to` point** (A′ for AA′), and the notation label (arrow-above + underline) in the same colour — one colour ties shaft, head, and name together, so tail/head read instantly. The overlay keeps the depth cue: riding a hidden edge or an interior segment (e.g. a named space diagonal) it dashes, in colour. Locked by the updated `scene3.test.ts` (head coordinates ARE the `to` point's; a hidden-carrier vector dashes) + `render3.test.tsx` (coloured element inventory). **83 src3d tests green, `tsc -b` + `build:3d` clean.**

---

## ADR-3D-004 — V2: the algebraic lane (2026-07-06)

**Context.** docs/20 §8 V2: axes, coordinate points, parametric lines, planes by equation, feet/intersections, measures — gated on 2022-Q2's full constructive chain. Gate met (`scenarios3.test.ts`, He+En): π1/π2 typed as equations → the 45° given pins `a` → membership selects the branch → foot B → ℓ echoed parametrically → foot C → |AB|=3 and area=4.5 verify; hand-worked oracles (a=−1, B=(2,−2,3), ℓ: x=(0,−5,3)+t(1,0,0), C=(2,−5,3)) asserted exactly.

**Decisions:**

1. **A plane's coefficients carry ONE symbolic parameter** (`LinExpr = k + p·param`; a second letter refuses `two-params`). The stated angle-between-planes given pins it by **1-DOF root-finding** (grid scan + bisection, roots snapped to clean integers) — squarely inside the D3 no-CAS boundary. The roots ARE the figure's branches.
2. **Branch selection hierarchy:** explicit branch > a membership given (`A נמצאת על אחד המישורים` picks the root where it holds — exactly 2022-Q2's flow, the given IS the disambiguator) > the seed (so "show another configuration" cycles a=±1 when nothing pins it). An **unpinned** parameter is a sampled free DOF (ADR-052 — never a silent fixed default). No roots at all → the angle fact refuses with `no-roots`; a membership satisfiable in no branch → `not-on-plane`.
3. **`resolve3` supersedes bare positions:** the resolver returns positions + numeric planes/lines + the parameter's fate, and the renderer consumes it whole (`buildScene3(c, resolved, …)`) — the Resolved3 object is the single derived artifact, derive-on-demand as before.
4. **The equation layer remembers the student's form** (`PlaneDef.src`) per docs/20 §6.3, and the intersection line is **echoed in parametric form on the canvas** (`ℓ: x = (0, -5, 3) + t·(1, 0, 0)`) — the exam's "מצאו הצגה פרמטרית" ask is answered by the figure itself.
5. **The algebraic overlay renders only when the figure is Lane A** (a plane or coordinate point exists): light coordinate axes sized to the figure, translucent per-plane patches (patches never occlude — docs/20 §11), the drawn line clipped to the figure's neighbourhood, and **right-angle knee marks at every ⟂ foot** (a foot is inherently a stated right angle). The isotropic fit includes the overlay so nothing clips.
6. **Scalar claims** (`AB = 3`, `שטח המשולש ABC = 4.5`) verify like every claim (multi-seed, wrong value refused). **Honest lane boundary:** a numeric size claim on a figure with a free-dim SOLID is a *scale statement*, not a check — refused with `size-on-solid` rather than mislabelled "refuted" (sizes-as-givens on solids are a later slice).
7. **Parser findings worth remembering:** `ℓ` (U+2113) is not a `\w` character, so `\b` after a line name silently never matches — explicit lookaheads only (caught by the gate scenario, fixed at the rule). `pi1`/`π1` normalise to one form; equation parsing is all-or-nothing (a malformed term refuses the utterance, never a partial plane).

**Gate:** the full 2022 chain He+En through the real submit path; wrong |AB|, impossible angle (95°), and nowhere-membership all refuse with their own codes; branch cycling locked. **110 src3d tests green, `tsc -b` + `build` + `build:3d` clean.**

**Out (next slices):** typed parametric LINES + parameters in line directions and point components (2024-Q2 — V3), the coordinate-injection pivot (V4), plane-through-3-points, distances point–line/skew, measure display commands beyond the claims.

**Amendment (same day, operator screenshot: "the visualization of planes is critical. there is no way for a student to see the line between the planes and no way to see where 45 is").** The patches floated apart because each was centred on its own projection of the figure centroid — with few points the projections land far apart and the crossing is left to luck. Root fix, three parts: (1) **intersecting planes' patches are centred on a SHARED focus point ON their fold line, with one patch axis ALONG the fold** — the crossing is geometrically guaranteed on screen, and the patches meet exactly at the seam; (2) **the fold is drawn as an implicit seam line even before the student names ℓ** (a textbook drawing always shows where planes meet; once ℓ is named, the full labelled line replaces it); (3) **a STATED angle-between-planes gets a dihedral arc + its value at the seam** (u₁,u₂ ⟂ the fold in each plane, the arm pair chosen to match the stated value — marked because the student said it, the 2-D stated-angle rule). Locked by the screenshot-state test (`scene3.test.ts`: shared patch centres, 1 seam, `45°` arc) + the gate-chain test (named ℓ ⇒ 0 seams). **111 src3d tests green, `tsc -b` + `build:3d` clean.**

**Amendment 2 (same day, operator: "when point A was located, it didn't show on one of the planes — we should extend the plane to cover points on the plane").** A patch was a fixed square, so a point LYING ON the plane could sit outside it — visually contradicting the membership given. Fix: **each patch's extents grow (asymmetrically, staying anchored on the fold frame) to cover every figure point that lies on that plane**, with a margin; the implicit seam stretches to the union of the two patches' along-fold extents. Only genuine members extend a patch (a point off the plane never inflates it — asserted negatively). Locked in `scene3.test.ts` by point-in-patch-quad assertions on the 2022 chain (A∈π2, B/C∈π1, C∈both, A∉π1). **112 src3d tests green, `tsc -b` + `build:3d` clean.**

---

## ADR-3D-005 — save/load a figure file + the fixtures regression net (2026-07-06)

**Context.** Operator (after approving the plane-visualization fixes): "I want to add the save as and load feature which will help me a lot in testing." The 2-D tool's ADR-232 established the pattern AND the testing payoff; both transplant.

**Decision.** `src3d/store/figureFile3.ts` serialises the session to a portable **`.geo3.json`**: `{schemaVersion, app:'3d-builder', savedAt, seed, facts:[{utterance, cmds, enabled?}]}` — **the file is the replay inputs**: each fact keeps the student's utterance (human-readable) and its lowered commands (load replays the COMMANDS, so parser evolution can't break an old file), the seed reloads the sampled configuration, and positions are NEVER stored (the figure re-derives; a file can't smuggle a stale drawing). The orbit camera is deliberately excluded — it is a view concern outside the figure (ADR-3D-001 §4). Deserialisation is strict and total: shape-invalid → `bad-file`, future schema → `newer-schema`, a foreign app id (the 2-D tool's `.geo.json`) → `bad-file`; never a half-loaded session. Ids are minted fresh on load (session-local). **Load is ONE undoable `set`** — never destructive, one undo restores the prior session. UI: שמירה/טעינה לקובץ buttons + a hidden file input; refusals surface bilingually through the normal error banner.

**The testing payoff — the fixtures net** (`src3d/__tests__/fixtures3.test.ts` over `fixtures3/*.geo3.json`): every file replays through the REAL load path asserting (1) every fact lands OK — claims verified included, and (2) **no parser drift** — each stored utterance still lowers to the stored commands (every 3-D fact is deterministic; no LLM yet). **A manual session's saved figure becomes permanent regression coverage by dropping the file in `fixtures3/`.** Seeded with the three gate figures (2020 prism, 2023 cube, 2022 planes), generated through the real pipeline (`GEN_FIXTURES3=1 npx vitest run src3d/__tests__/fixtures3.test.ts` regenerates); an empty net fails loudly.

Locked by `figure-file3.test.ts` (round-trip incl. disabled facts + a resampled seed, refusal matrix, load-is-one-undo) + the net itself. **125 src3d tests green, `tsc -b` + `build:3d` clean.**

---

## ADR-3D-006 — V3: parameters in lines (2026-07-06)

**Context.** docs/20 §8 V3, gate 2024-Q2: a TYPED parametric line whose direction carries the parameter (`x = (-1,5,-11) + t(m-1, 5-m, -2)`), a plane sharing the same `m` (incl. the parenthesised coefficient `(m+6)z`), the ⟂ given pinning m, the cut point, and the "not parallel for every m" probe. Gate met (`scenarios3.test.ts`, He+En) on the hand-worked oracles: **m = −5 (unique)**, **A = ℓ∩π = (2, 0, −10)**, and (5,−5,−9) lies ON ℓ — the ד investigation resolved by the figure.

**Decisions:**

1. **`Line3Def` gains a `parametric` kind** — anchor and direction as LinExpr triples, evaluated at the parameter (`lineAtParam`); the typed source form is kept for the on-canvas echo. The plane∩plane kind is unchanged; both resolve through one path.
2. **A ⟂ given's residual `|dir(m) × n(m)|` is NON-NEGATIVE — it touches zero without a sign change**, so bisection can't find it: `paramRoots` gains a **minima-scan + ternary-refinement** root finder (`touchZeroRoots`) beside the sign-change one, and candidate roots are **cross-filtered against ALL pinning givens** (angles + ⟂s must agree). Still strictly 1-DOF numeric root-finding (D3). An unpinned parameter remains a sampled free DOF; `pinningGivens` (not just planeAngles) now decides.
3. **The `never-parallel` probe is a CLAIM over the parameter FAMILY, not a configuration**: parallel ⟺ `dir(m)·n(m) = 0`, so the claim holds iff that (normalised) residual has no zero over the scanned range — sign changes AND near-zero touches both refute. Seed-independent by construction; the exam's `−m²+6m−15 < 0 ∀m` verifies, a plane admitting a parallel value refutes.
4. **`line-plane-point` is honest about parallelism**: at the chosen parameter, a parallel line yields NO position and the fact refuses `line-misses-plane` (never a fake point). **`on-line` membership** is a verified given (`not-on-line` when false) — typing `B(5,-5,-9) על הישר ℓ` and having it ACCEPTED is exactly how the student discovers 2024-ד's trap (the point is on ℓ ⇒ infinitely many planes).
5. **Parser:** `parseParamExpr` (component grammar `m-1`/`5-m`/`-2`/`2m`, one letter per figure); `parseLinearEq` handles **parenthesised coefficients** `(m+6)z` (fold-in via replace; a poison marker refuses malformed or mismatched-parameter parentheses — all-or-nothing held); plane names may now be a **bare π** (digits optional); coordinate claims `A = (2, 0, -10)` (distinct from `A(2,0,-10)` creation — the `=` is the discriminator).
6. **Recorded trap:** an earlier poison marker written as `' '` reached the file as a NUL byte and broke exact-match editing — markers must be visible characters (now `§`).

**Gate:** the full 2024 chain He+En through the real submit path; wrong coordinates refused; a point off ℓ refused `not-on-line`; the refutable never-parallel case refused; the parallel cut-point case refused `line-misses-plane`. **145 src3d tests green; `vite build:3d` clean; `tsc` clean on src3d (the tree's only type errors at close were the concurrent session's in-flight `src/parser` edit).**

**Out (V4 next):** the coordinate-injection pivot — gauge-free Lane-G figures receiving coordinates mid-session (2020-ג, 2023-ג–ה), symbolic point components `A(3,n,p)`, sign branch givens.

---

## ADR-3D-007 — V4: the coordinate-injection PIVOT (2026-07-06) — ALL FOUR corpus exams reproduce

**Context.** The plan's hardest slice (docs/20 §4 — "the pivot is a first-class engine feature, not an edge case"): both mixed corpus questions inject absolute coordinates MID-QUESTION onto a gauge-free solid figure. Gate met (`scenarios3.test.ts`, He+En): 2020-ג (`נתון: v = (10,-5,0), u = (5,5,-5), P(0,4,6)` → K=(−3,4,7) and plane KBC `x+2y+3z−26=0` verify) and 2023-ג–ד (`D(0,0,0)`, `C(4,3,0)`, `A(3,n,p)` → A=(3,−4,0); the sign given selects C′=(4,3,5); ℓ = plane BC′D ∩ plane BCC′B′ resolves through B and C′). **With V4, all four corpus exams (2020/2022/2023/2024) reproduce end-to-end from typed He/En utterances — the docs/20 §8 milestone.**

**Decisions:**

1. **A coordinate statement about an EXISTING point is a GIVEN, never an error** (the 2-D M1 principle): `point3` on a taken id lowers to a pivot PIN instead of `already-defined`. Partial pins carry symbolic letters as nulls (`A(3,n,p)` — only x constrains); a NEW point with letters refuses `symbolic-new-point` (under-determined, honest). `נתון: …` parses a whole injection list (vectors + points) in one utterance; `inject-vector` requires a declared name.
2. **The pivot is a numeric SIMILARITY+DIMS least-squares** (`solve3.ts`): unknowns = translate(3) + axis-angle rotate(3) + log-scale(1) + the solids' free dims; residuals = the pins (a vector pin transforms without translation). Levenberg–Marquardt with a central-difference Jacobian, deterministic 8-rotation multi-start (seed-rotated), restart-polish to ~1e-24 err. This is numeric solving (the 2-D engine's category), NOT symbolic — D3 holds.
3. **Under-determination is welcome:** the 2020 prism height is never injected — LM's damping converges to a nearby manifold point, different seeds start elsewhere, so "show another configuration" still varies exactly what the givens never fixed (ADR-052), while K stays put (locked by the gate test).
4. **REFLECTION is the discrete branch:** both orientations (mirror pre-transform) are solved; **sign givens** (`שיעור ה-z של C' חיובי`) select among converged solutions, else the seed cycles them (locked: without the sign given, resample flips C′.z = ±5). An unsatisfiable sign refuses `sign-unsatisfiable`; a pin set no placement satisfies refuses `injection-unsatisfiable` (keep-prior).
5. **Planes THROUGH POINTS** (`plane-through`, Newell normal from final post-pivot positions) join the planes map — patches render, and `plane-plane-line` accepts them (a second resolution pass runs after positions, since point-planes need them). The `plane-eq` claim (`המישור KBC: x + 2y + 3z - 26 = 0`) verifies the student's equation against the named points (any scalar multiple passes; a degenerate point set or zero normal refuses).
6. **Claim tolerance is set by the pivot's numeric floor:** a central-difference Jacobian bottoms out ~1e-6 in loosely-conditioned UNPINNED directions (A.z came back −6e-6 at some seeds), so `REL_TOL` moved 1e-7 → **2e-5** — far above the noise, orders of magnitude below any wrong bagrut answer (≥ 0.5 away). Closed-form figures still verify to ~1e-15.
7. **The pivot transforms GAUGE-frame kinds only** (solid-vertex / on-segment / centroid / in-span); coordinate points and Lane-A derived objects are already absolute. Free on-segment sliders are not solve unknowns in V4 — a pin on one would honestly fail to converge (noted limit).

**Gate:** both chains He+En through the real submit path; wrong K refused; impossible injection refused; the height-stays-free + K-stays-put resample assertion; mirror-branch cycling. **169 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**Out (V5 next):** corpus widening (~10 more Q2s as scenario gates), catalog panel, responsive canvas, LLM fallback behind the proxy, pyramid, image export; 2023-ה (find-a-plane) stays deferred — a construction ask the tool doesn't yet express.

---

## ADR-3D-008 — V5: breadth + polish (2026-07-06)

**Corpus widening (6 more 572 exams read: 2023-ב, 2022-נבצרים, 2021-חורף-א, 2021-קיץ-ב, 2019, 2018).** Findings: (1) **the headline GAP is a point defined by a general vector combination** (`DF⃗ = (k/2)·DB⃗ + k·DC⃗`, `CF⃗ = k·CD⃗`, `A'K⃗ = 4/5·DN⃗` — in 4 of the 6 exams, often with an unknown coefficient later pinned by a ∥-plane condition) — a real driven-mechanism slice, **filed as the V7 headline**, not rushed here; (2) sibling gaps filed: solid-placed-on-axes phrasing, skew-lines justification, plane-through-3-points *asked* (the claim form covers the verify side); (3) **2019 was fully expressible with small additions and became the V5 gate**: a `line-through` two points (`Line3Def 'through'`, resolved from final positions like point-planes, with a FINAL line∩plane fill pass), the colon ratio form (`AE:EC = 2:1`), the **angle-between-segments claim** (undirected, ≤90°) and the **length-ratio claim** (`A'K : A'C = 2 : 3`). Gate met (`scenarios3.test.ts` He+En): the cube pinned by injections, `הזווית בין A'C לבין BC' היא 90` ✓, K = ℓ(A′C)∩plane(BC′D) = (2,4,2) ✓, the ratio ✓.

**The rest of V5:** the **right pyramid** (`פירמידה ישרה ABCDS`/`ABCS` — apex above the base's CIRCUMCENTRE so lateral edges are equal, locked by test; oblique refuses, ADR-052); **`catalog3.ts`** — the user-facing reference/coverage map with the in-app commands panel and the **guard test** (every entry parses He+En); the **LLM fallback** — `llmShared3.ts` builds the 3-D prompt from the catalog, the SHARED proxy selects it by a `tool: '3d'` body field (one endpoint, no new infrastructure; `server/parseHandler.ts` is the ONE place binding both apps — src/ and src3d/ still never import each other), the client (`llm3.ts` + `submitSteps`) re-parses every returned line deterministically, and the **PAR-10 contract test** re-parses every prompt example; **responsive canvas** (ResizeObserver), **PNG image export** (SVG→canvas 2×), and the **DOF cue** (`freeDofCount3`: solid dims + unstated revolution sizes + free sliders + unpinned param; after a converged pivot, dims+7−pins floored — an estimate by design).

## ADR-3D-009 — V6: the solids-of-revolution block (2026-07-06, operator D4's committed scope)

**Corpus reality check:** cylinder/cone/sphere never appear in the 572 papers' Q2 — they belong to the 571 paper. The block ships against **curriculum/formula-sheet canonical numbers** (cone r=5,h=12 → ℓ=13, M=65π, V=100π; sphere R=3 → V=36π=M; cylinder r=3,h=7), with 571-corpus validation filed for later.

<!-- ADR-3D-010 follows ADR-3D-009 at the end of this file -->
**Decisions:** a `revolution` construct (`חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12` — cone/cylinder/sphere, axis vertical): named centre/apex are optional (an unnamed centre stays UNNAMED — no invented labels, the ADR-149 lesson) and **unstated radius/height are FREE sampled DOFs** (ADR-052) that stated numbers pin. Rendering: **sampled outlines** — horizontal circles split front-solid/back-dashed by the eye azimuth, silhouette generators (`±(ẑ×eye)`), the sphere's exact orthographic silhouette (the great circle ⊥ the eye), a dashed axis/height. **Claims:** `נפח החרוט = 100π` / `שטח המעטפת` / `שטח הפנים של הכדור` (π multiplies at parse time), verified from the formula-sheet formulas; **guards at APPLY**: not-exactly-one solid of the kind → `no-such-solid`; unstated sizes → `free-size-claim` (a value on a free-size solid is a scale statement, not a check — never mislabelled "refuted"). Gate: the cone/sphere/cylinder chains He+En + the DOF cue reading 2 (free cone) vs 0 (sized cone).

---

## ADR-3D-010 — V7 T1+T3: vector relations + exam terminology (2026-07-07)

**Context.** Operator: "we need to support all terminology that appear in exams." Plan: docs/20 §13 (T1 vector-defined points · T2 scalar givens · T3 terminology sugar).

**T1 — vector relations (`vec-rel`, the M1 shape).** A pair-LHS vector equation (`AM = ½u+½v+5/3w`, `A'K = 4/5 DN`, `DF = (k/2)DB + kDC'`, `AD = ⅔AB + ⅓AC`) lowers to a NEUTRAL `vec-rel`; **apply decides**: all points known → the V1 vec-eq claim (recorded); exactly ONE unknown point (anywhere — LHS or inside the expression) → a DEFINITION. The relation is AFFINE in the unknown, so 4 residual evaluations determine the affine map and one 3×3 solve places it. A coefficient SYMBOL (`(k/2)`, `k`, `t·BE` — `parseSymExpr`, one letter per relation, `-0` normalised for JSON round-trips) makes it a 1-parameter family: **unpinned k is a FREE sampled DOF (ADR-052)**; a ∥/⟂-to-plane condition (`EF מקביל למישור ABC` — `seg-plane-rel`, apply decides pin-vs-claim) pins it via the existing 1-DOF root finders; **two symbol-relations naming the same point = the cevian intersection**, a closed-form line∩line (must genuinely meet, else `no-solution`). Two unknown points refuse `two-unknowns`.

**The class fix this exposed:** claims created INSIDE composite commands (rect-complete's right angle, vec-rel's claim conversion) escaped derive3's per-cmd verification — twice. Root fix: **apply RECORDS every claim into `Construction3.claims`**, and derive3 attributes them to facts by **count-delta** and verifies them all — a claim can no longer escape verification by being created indirectly.

**T3 — terminology sugar:** on-axes phrasings (`D בראשית הצירים` → a full pin; `A על ציר ה-x החיובי` → a partial pin + sign given — pure sugar over the pivot); the vertex angle form `∠BAC = 90` (lowers to angle-between-segments); mutual-position claims `מצטלבים`/`מקבילים`/`נחתכים` (skew = not parallel ∧ not coplanar); `ABEC מלבן` completes the single unknown corner as the parallelogram point AND records the corner right angle as a claim (a non-right base refuses the "rectangle" honestly).

**Gates (He, En cores):** 2021-חורף-א (C defined by `AD = ⅔AB + ⅓AC` → C=(0,5,−1) ✓, ∠BAC=90 ✓, plane `x+z+1=0` ✓, ABEC rectangle → E=(−3,5,2) ✓); 2021-קיץ-ב (the cevian pair → E=(0,4,0), F=(1.5,3,0) ✓); 2018 (box pinned by on-axes/injections, `A'K = 4/5 DN`, **NK ו-PL מצטלבים ✓**, the false `נחתכים` refused). **282 src3d tests green; `tsc -b` + `build:3d` clean.**

**T2 DEFERRED (the documented remainder of §13):** scalar givens as solve residuals (`|DC⃗|=4`, `∠ADC=120°`, `u·v=24`, `AB=5` replacing `size-on-solid`), the general tetrahedron (`פירמידה ABCD` + `DC ניצב למישור ABC` as a driving given), and the rhombus-base prism — the 2023-ב and 2022-נבצרים chains wait on it. A solver rework, deliberately not rushed at the tail of this batch.

**T2 addendum (2026-07-07, same session) — scalar givens DRIVE the figure.** The `size-on-solid` refusal is retired: on a figure with FREE dims, a scalar statement is a GIVEN (M1) — `length-eq` claims → `length` pins, vertex-form `angle-seg-eq` → `vangle` pins, `seg-plane-rel` (⟂/∥ a plane) → driving pins, plus the new `u·v = 24` dot given and the `BD = (-4,5,12)` PAIR injection. All enter the V4 pivot as residuals (activation widened; acceptance 1e-16 → 1e-12 — the numeric-Jacobian floor rises with mixed scalar residuals; per-residual ~1e-6, far under the 2e-5 claim tolerance). New solids: the **general tetrahedron** (`פירמידה ABCD`, apex free — 5 dims) and the **rhombus-base right prism** (`מנסרה ישרה שבסיסה מעוין`). `נפח הפירמידה ABCD = 64` volume claims (triple product /6). Two traps recorded: (1) the symbol root-find inside the pivot's residual loop would explode cost — during pivot residuals, symbol-pinned points take a CHEAP fixed value (no pin references them; the final evaluation does the real root-find); (2) `vec-defined`/`vec-pair` points were missing from GAUGE_KINDS, so the pivot left them in the canonical frame — E moved, F didn't (caught by the gate). (3) rule order: `נפח הפירמידה ABCD` must run BEFORE the pyramid rule or it builds a pyramid. **GATE: the 2023-ב chain end-to-end** (tetra, DC⊥base pin, k=⅓ via EF∥base, partial+pair+dot injections, B/C/D coords + volume 64 verify) **+ the 2022 rhombus scalar-consistency leg. 301 src3d tests green.** Remaining 2022-נבצרים tail (the t+h-coupled ⊥ condition) still deferred — needs symbols as global-solve unknowns.

---

## ADR-3D-011 — the 4-base pyramid family: rightness and base shape are INDEPENDENT stated givens; "הבסיס" is a first-class plane reference (2026-07-07)

**Trigger (operator):** "how would I enter a pyramid with a square base? how would I say AS is perpendicular to the base?" followed by the correction "**פירמידה ישרה is not the same as a pyramid with a square base**." The old model conflated them: `פירמידה ישרה ABCDS` (kind `pyramid4`) silently baked a **square** base — an unstated given (the ADR-052 cardinal sin), and there was no way to enter a square-base pyramid whose apex is NOT above the centre (the `AS ⊥ base` archetype, apex above a base VERTEX — a standard bagrut setup).

**Decision — two independent axes, each STATED (ADR-052):**
- **Rightness** (`ישרה` / `right`) = apex above the base centre. Without it the apex is fully free (3 dims).
- **Base shape**: square must be stated (`שבסיסה ריבוע` / `with a square base`). Unstated (or stated מלבן) = a **free-aspect rectangle** — the aspect `b` is a sampled DOF that "show another configuration" varies. (A general-quad base is out of scope until an exam demands it — recorded, not silently assumed.)

Four kinds: `pyramid4` right+square (dims `[h]`, unchanged), **`pyramid4r`** right+rect (`[b,h]`), **`pyramid4g`** free-apex+square (`[ax,ay,az]`), **`pyramid4gr`** free-apex+rect (`[b,ax,ay,az]`). Vertex order stays literal across the family (base ring first, **apex last** — same convention as every solid). `פירמידה SABCD` (apex-first naming) is therefore read literally; flagged as a known ambiguity, not guessed at.

**"the base" as a plane:** `AS ניצב לבסיס` / `למישור הבסיס` / `is perpendicular to the base` (and the ∥ mirror) parse to `seg-plane-rel` with the sentinel `plane: []`, resolved at the ONE apply chokepoint to the figure's single solid's base ring (every kind lists its base first); zero or many solids → honest `unknown-plane` refusal. Rules stay pure string→commands — no parser-side figure context needed.

**Solver root-fix (class, not figure):** `AS ⊥ base` on the free-apex pyramid collapsed the whole figure to a point. The ⟂/∥/angle scalar pins are **similarity-invariant** residuals; when they are the ONLY pins, the pivot's translate/rotate/scale unknowns are pure null-space and the normalizer's `1e-12` floor makes **scale→0 a spurious zero-residual basin** that LM falls into. Fix in `solvePivot`: when every pin is invariant (`vangle`/`seg-perp-plane`/`seg-par-plane`, no coordinate/length/dot given anywhere), the gauge is FROZEN to identity and only the shape dims are solved (dims-only jittered multi-start; mirror skipped — also invariant). Mixed cases unchanged (any absolute given anchors the scale). This also protects the lone-`∠ADC=120` class on any solid.

**Locked by** `src3d/__tests__/pyramid-base.test.ts`: all four parse variants (He+En), free-aspect-varies vs stated-square-holds across seeds, the operator scenario (`פירמידה ABCDS שבסיסה ריבוע` + `AS ניצב לבסיס` → S lands vertically above A, AS⊥AB and AS⊥AD to 1e-4), the En mirror + `EF מקביל לבסיס` on midpoints, and the no-solid refusal. Catalog updated (`שבסיסה ריבוע` in both solid examples). A right pyramid + `AS ⊥ base` now refuses honestly (structurally contradictory — apex is above the centre). **308 src3d tests green, `tsc -b` clean.**

**Deployed (2026-07-07):** `10dcff8` → themathbible.com/3d-builder/ — bundle `3d-c0UR1XnA.js`, live 200.

**Am. (2026-07-07, operator: "I get an error and a general pyramid is drawn"):** not a parser bug — a **deploy-pipeline class bug**. `/3d-builder/index.html` was served with NO `Cache-Control` header (the ADR-146 no-cache block covered only `httpdocs/geo-builder`), so browsers heuristically cached the OLD bundle after every deploy; the stale parser hit `not-understood` → LLM escalation → a 4-vertex general pyramid + an erroring step. Fix at the class: the identical `<Directory>` cache block added for `httpdocs/3d-builder` in `vhost_ssl.conf` (backup kept, `apache2ctl -t` + reload; verified: HTML `no-cache, must-revalidate`, hashed assets `immutable`). One hard refresh clears existing stale caches; every future deploy is picked up on the next normal load. *Plesk gotcha applies: a domain reconfigure may drop the hand-added block (same exposure as the existing geo-builder block) — re-append or move both into Plesk's "Additional directives for HTTPS" field.*

**Am. 2 (2026-07-07, operator: "AS perpendicular to base is showing weird") — the needle, and the REAL root cause underneath it.** The apex landed above A but at z≈55 over a unit base: the ⟂ residual is ANGLE-like (length-normalized), so growing the free height also shrinks it, and the unconstrained dim drifted to an extreme. Fix 1: the invariant-only dims solve is **regularised-nearest** (REG 1e-4 pull toward the seed's sampled dims; acceptance on the PRIMARY residuals at 1e-10 — above the regulariser's equilibrium floor, far under the 2e-5 claim tolerance). Fix 2 (honesty): **pin ownership by count-delta** — a fact that contributed ANY pivot pin reads `injection-unsatisfiable` when the pivot finds no placement, never a silent seed figure. That honesty flag immediately exposed the true class bug: **LM's damping used the diagonal as its own scale (`λ·(A[i][i] || 1)`)** — an invariant direction's Jacobian is cancellation NOISE (~1e-10, diagonal ~1e-20), so damping multiplied 1e-20 and admitted ~1e10 steps along pure noise (a lone `DC = 4` stalled at err 2e-4 with tx≈−6.75e9, θ≈−702 rad — catastrophic cancellation). One-line root fix: **absolute damping floor** `λ·max(A[i][i], 1)` (unknowns are O(1): world units, radians, logScale). This is the mechanism behind the V4-era "numeric-Jacobian floor" pain. All 308 src3d tests green bit-for-bit, incl. every pivot gate.

**Am. 3 (2026-07-07, operator: "פירמידה שבסיסה ריבוע says no-such-shape, then works"):** the label-less phrase was OUT of the deterministic grammar (rules key on vertex tokens), so it took the LLM path — the refusal flashed while Haiku round-tripped, then the LLM's invented labels built. Two fixes: (1) **label-less DETERMINED solids get default lettering deterministically** (base ring first, apex last: square/rect pyramid → ABCD+S across all four rightness×base kinds, triangular pyramid → ABCD, cube/box → ABCDA'B'C'D', triangular/rhombus prism) — no LLM, no latency, no cost; bare `פירמידה` (base unknown) stays honestly not-handled; (2) the App **suppresses the refusal while escalation is in flight** (`lastError && !busy`) — an error only shows once it is final. Locked in `pyramid-base.test.ts`. *(Recorded trap: this Bash tool strips one backslash level inside quoted heredocs — a `\b` regex became a literal backspace byte in a rule; scripts with regex escapes go through a Write-tool file, and `grep -c $'\b'` verifies.)* **309 src3d tests green.**

## ADR-3D-012 — the 3-D app gets its OWN dev debug log; height/אנך vocabulary (2026-07-07)

**Operator:** "look at the dev logs for the 3d part — is there separation? I tried AS גובה / AS אנך with no success." **Finding 1: there were NO 3-D dev logs at all** — `logDebug` lives in `src/` and only the 2-D App calls it; every line in `logs/debug-log.jsonl` is 2-D, so 3-D sessions were unreconstructable. Fix: `src3d/debug/sessionLog3.ts` (pattern-COPY per §12, no `src/` import) posts dev events tagged `tool:'3d'`; the shared Vite plugin (`server/logProxy.ts`) routes tagged events to **`logs/debug-log-3d.jsonl`** — full separation at the one sink. App3 logs per-submission `input` events (utterance, parser/llm source, outcome) + `figure` snapshots on every store change (the 2-D App pattern). Production stays a no-op (no `/3d-builder/api/log` route exists; a lean 3-D usage feed is a deliberate later step, not a silent side effect). **Finding 2: the height vocabulary was missing** — `heightOfSolid` rule: `AS גובה (הפירמידה)` / `AS אנך` / `AS is the height/altitude` lower to the ⟂-base sentinel (`seg-plane-rel perp, plane: []`), and `אנך` joins the shared ⟂ alternation (so `AS אנך למישור BCD` / `AS אנך לבסיס` work too). Locked in `pyramid-base.test.ts` (7 phrasings + the operator's exact build). *(Two scripting traps recorded: `String.replace`'s `$'` pattern pasted the file tail — triplicated parse3.ts, caught by line count, reverted; replacements now go through a replacer function. And `git checkout` re-materialised CRLF, breaking `\n`-anchored matches.)* **310 src3d + 61 server tests green.**

---

## ADR-3D-013 — the abs-value length relation |EN| = (√6/4)·|w|, direct parameter assignment, and the rotation-basin pool (2026-07-07)

**Trigger:** the operator's target exam (2026 קיץ מועד ב Q2) — "what commands would I use? specifically, what about abs value?" A pipeline probe found 4 gaps; all closed, gated by `exam-2026-2.test.ts` (the full chain He: square-base pyramid → AS גובה → |AS| = צלע הריבוע → E at ¾SD → SN=k·SC → נסמן → **|EN| = (√6/4)·|w| pins k=½** → injections + positive-axis placements → N/E/plane/volume claims all verify; oracle hand-worked: N=(6,6,6), E=(9,0,3), plane 3x+2y−z−24=0, V=108 both).

1. **`length-rel` — the abs-value LENGTH relation** (|a1b1| = c·|rhs|, rhs a pair or a NAMED vector): syntax `|EN| = (√6/4)·|w|`, `|AS| = |AB|`, `אורך המקצוע AS שווה לאורך צלע הריבוע ABCD`, coefficient with radicals (`evalRadical`: 3/4, √6/4, 2√3). Routing (M1): a symbolic endpoint → **pins the symbol** (new symbolPin rel, root-find = sign-change roots ∪ touch-zero of |resid| — the exam states |EN| at its MINIMUM, a k=½ DOUBLE root that sign-change alone misses); free dims → a driving scalar pin (similarity-INVARIANT — joins the gauge-freeze set); fully pinned → a verified claim. **Bare `AS = AB` now reads as a LENGTH equality** (the bagrut default; it was misread as the vector equation AS⃗=AB⃗ and refuted) — an explicit ⃗ arrow (U+20D7, palette-insertable, `VEC_MARKED`) restores the vector meaning.
2. **`symbol-value` — הציבו k = ½** (`k = 1/2`): pins the named parameter directly, replacing any prior pin on it; an undefined parameter refuses `unknown-symbol` (new error code). x/y/z excluded (coordinates).
3. **Positive-axis phrasing** — `הקודקוד D נמצא על החלק החיובי של ציר ה-x` joins onAxes (partial pin + sign given).
4. **`volume-eq-poly`** — `נפח הפירמידה SENB שווה לנפח הפירמידה CENB` (two tetra volumes equal, no numbers).
5. **Symbol palette** (the 2-D App's affordance, operator-requested): insert-at-caret buttons — ⃗ |·| √ ½ ¾ · ⊥ ∠ ° ′ ℓ π; `normalize3` maps unicode vulgar fractions (½¾¼⅓⅔) to plain fractions so palette input parses.
6. **Root fix (class): the pivot's discrete branches are rotation BASINS, not only the two mirrors** — with A,B pinned and D,S on axes, EACH mirror has two exact placements (D→+x̂ ⇒ S→−ẑ and D→−x̂ ⇒ S→+ẑ); best-per-mirror kept exactly the two sign-violating ones and `S על החלק החיובי של ציר ה-z` read `sign-unsatisfiable` while the true figure existed. With sign givens present, `solvePivot` now keeps EVERY distinct converged solution (deduped by the transform's ACTION on a probe frame — axis-angle wraps make parameter-space dedup wrong), so the sign selector sees the full pool; without sign givens the fast best-per-mirror path stands, previously-green basins untouched.

Also: `heightOfSolid` accepts the exam's exact `המקצוע AS הוא גובה בפירמידה`. *(Recorded trap: a replacement string containing the regex tail `$'` triplicated parse3.ts via `String.replace`'s substitution patterns — all scripted edits now go through a replacer function.)* **324 src3d tests green, `tsc -b` + `build:3d` clean.**

**Am. (2026-07-07, operator: "how would a user enter a vector? … the system should not assume; the steps stage should show the vector in correct syntax"):** (1) **Vector entry needs no symbol in the common cases** — context decides (`נסמן: AB = u`, `SE = ¾SD`, `SN = k·SC` are unambiguously vector); the typeable marker for the one ambiguous shape is the WORD `וקטור`/`vector` (`וקטור AS = וקטור AB`), equivalent to the ⃗ arrow (both set `VEC_MARKED`; the word then strips as decoration in `normalize3`). (2) **Bare `AS = AB` is never guessed** (the earlier length default is REVERSED per operator rule): `parse3` returns a third `ParseResult3` variant `ambiguous-vector-length` (the 2-D ADR-164 clarification pattern) — the store surfaces a specific bilingual message telling the student to write the וקטור form or `|AS| = |AB|`, and it never escalates to the LLM. (3) **The steps list renders vector facts in proper notation** — `factDisplay` decorates vector-command facts only: point pairs get the combining arrow (SE⃗ = 3/4 SD⃗), declared vector names get the textbook underline (u̲), the stored utterance stays the student's words. *(Two more escape-layer traps recorded: the Bash heredoc stripped `\s`→`s` inside a replacement (caught by the catalog guard), and a generated `new RegExp("\d")` string needs doubled escapes — regex literals in generated code from now on.)* **326 src3d tests green.**

**Am. 2 (2026-07-07, operator screenshot `|EN|=|w|*√6/4` + "AB=u without נסמן"):** (1) the coefficient-AFTER form (`|w|·√6/4`) was NOT in the deterministic grammar — the screenshot's green came from a silent LLM round-trip; the product now commutes (`tail` tries prefix- and suffix-coefficient), so both orders parse offline. Radical scoping is fixed grammar, never guessed: `√` binds the single number immediately after it, then one optional `/divisor` — `√6/4` ≡ (√6)/4, `3√2` ≡ 3·√2; an unsupported shape (e.g. `√(6/4)`) refuses rather than misreads. (2) **`AB = u` names the vector without נסמן** — in apply (M1): a bare pair equated to ONE unknown name with coefficient 1 lowers to `name-vector`; a KNOWN name keeps the statement a verified vec-eq CLAIM (`AS = w` twice: name, then true claim; `AB = w` refused). Locked in `exam-2026-2.test.ts`. **328 src3d tests green.**

---

## ADR-3D-014 — the "organize your data" panel (operator-directed derived-data display, opt-in) (2026-07-07)

**Operator:** "I want the area I marked to include some derived sides — EN = 0.2u+0.3v; if |v|=2 is given, show it and v²=4 next to it; coordinates similarly; if we have both, both presentations appear. While this is somewhat against the ADR that says this is not a discovery tool, this is how I want students to get used to organizing their data. We can have a checkbox." **The reveal tension is resolved by explicit opt-in:** a checkbox (default OFF — the student chooses to peek) in a third column (the far-left area in RTL) on the App.

`src3d/engine/dataView.ts` (pure consumer of `Construction3` + `resolve3`): per declared vector and auxiliary segment — **basis decomposition** (`EN⃗ = −1/4·u + 1/2·v + 1/4·w`, a per-seed 3×3 solve over the first three declared vectors), **coordinate form** (`EN⃗ = (−3, 6, 3)`, only when the figure carries an absolute frame — pins/vector-pins/pair-pins; gauge never prints as data), **stated magnitude + its square** (`|w| = 2 · w² = 4`, from driving pins and recorded claims — never a sampled size); plus stable **point coordinates** (`N(6, 6, 6)`). Both presentations show when both exist. **Honesty gate = the multi-sample discipline:** every value is computed at 3 seeds and shown only when it agrees (an under-determined quantity varies with the sample and stays hidden — ADR-052 applied to display). `cleanNum` renders integers/fractions (tolerances sized to the pivot's ~1e-7 numeric floor) else 2 decimals. **Companion parse gap closed:** `|w| = 2` (numeric magnitude of a NAMED vector) parses → new `vec-mag` command → apply resolves the pair and delegates to the ordinary length given (claim when pinned, driving pin when free). Locked by `data-view.test.ts` (the 2026-ב figure: decomp AND coords for EN; stated-magnitude row; the under-determined figure prints nothing). **331 src3d tests green.**

**Am. (2026-07-07, operator screenshot session):** (1) **derived magnitude equalities surface** — `|u| = |v| = |w|` (equal in EVERY sampled configuration — the equality is the fact even while the scale samples; a stated numeric value appends); (2) **a k-dependent vector shows SYMBOLICALLY, not hidden** — EN on an unpinned `SN = k·SC` was correctly suppressed by the stability gate as "varies", but the truth is it's AFFINE in k: `dataView` decomposes at k=0 and k=1 (a value-pin on a cloned construction) and prints the exam's answer shape `EN⃗ = (k − 3/4)·u + k·v + (3/4 − k)·w` (single-free-symbol figures); (3) **bigger canvas** — the page container widens `max-w-6xl` → `max-w-screen-2xl` and the height factor 0.7 → 0.72 (the drawing gains ~30% width on a desktop). Locked in `data-view.test.ts` (the operator's exact session). **332 src3d tests green.**

**Am. 2 (2026-07-07, operator: "the last command changed the drawing correctly but the vector was not calculated on the side"):** the |EN| given pins k at a TANGENCY (double root) — numerically the residual's minimum dips ~1e-9 below zero and splits into two crossings whose exact positions vary per seed (~1e-4), so the 3-seed stability gate "correctly" hid EN. Two-layer fix: (1) **root-finder** — for `length-rel` pins, a near-zero minimum SWALLOWS its adjacent crossing pair and is ternary-refined (the tangency is the true root; distinct far crossings still stand); (2) **display** — a double root is intrinsically only √noise-precise (~1e-4, fundamental to tangency, not solver sloppiness), so the panel's decomposition agreement + fraction snapping run at the matching 2e-3 coefficient class with seed-AVERAGED coefficients (claims keep guarding correctness at 2e-5). EN now reads `−1/4·u + 1/2·v + 1/4·w` the moment |EN| lands. Locked in `data-view.test.ts`. **332 src3d tests green.**

**Am. 3 (2026-07-07, operator prod test):** **coordinates ON the diagram** — when the organize-your-data toggle is on, every point in the panel's STABLE set also gets its coordinate label drawn under its letter on the canvas (`Figure3.coordLabels`, blue, white-haloed). The same 3-seed stability set feeds both surfaces, so the canvas never prints a sampled coordinate: in the operator's session only A and B are determined (the figure still rotates freely about the AB axis — the exam's ג pins that with the D-on-x/S-on-z placements, after which D, S, C, E, N all light up). **332 src3d tests green.**

**Am. 4 (2026-07-08, operator: "not showing for calculated points, for instance S"):** S in that session is genuinely NOT determined (only A,B injected — the pyramid still rotates about the AB axis; the drawing merely sampled S onto the z-axis). But the canvas already commits to ONE valid configuration, so its coordinates are readable data about the DRAWING: coordinate labels now show for EVERY point once a frame exists — **stable = fact (blue), sample-dependent = this drawing's value (gray italic)**, and the gray ones visibly change on "show another configuration" (the distinction teaches itself). The side panel keeps listing facts only. Locked in `data-view.test.ts`. **333 src3d tests green.**

**Am. 5 (2026-07-08, operator: "since u=v=w, S can be determined"):** partially right — |AS| = 12 and S·ŷ = 0 ARE determined; S's direction is not (the base tilts about AB — the reason the exam itself adds "S on the positive z-axis"). The display now says exactly that: coordinate determination is judged **PER COMPONENT** — fully determined = `fact` (blue), partially = `partial` (blue, free components read `?`: **S(?, 0, ?)**, listed in the panel too — partial knowledge IS knowledge), nothing = `sample` (gray italic, this drawing's values). And the equal-magnitudes row appends the **DERIVED** length when the frame pins the scale (`|u| = |v| = |w| = 12` — no stated number needed). Locked in `data-view.test.ts`. **333 src3d tests green.**

**Am. 6 (2026-07-08, operator: "on the positive z-axis means (0,0,+?)"):** exactly — a free component under a STATED sign given now renders `+?`/`−?` instead of a bare `?` (the sign is knowledge; sourced from `signGivens` only, never inferred from sample coincidence). `S על החלק החיובי של ציר ה-z` without a height given reads **S(0, 0, +?)**. Locked in `data-view.test.ts`. **334 src3d tests green.**

**Am. 7 (2026-07-08, operator: "we need S על החלק החיובי של ציר z with different variations — this was why there was no way of knowing S's location"):** the diagnosis loop closes — the exam DID contain the placement given, but the operator's phrasing (`ציר z`, no `ה-`) fell out of the grammar, so S was never pinned and the whole S-determination discussion followed. Root fix at the shared-fragment level: one AXIS reference (`ציר ה-z` / `ציר ה z` / `ציר z` / `ציר־z`), the container word family (`על החלק` / `בחלק` / `בצד`), optional `נמצא/הקודקוד`, En `on the positive part/side of the z axis`; the onAxes rule rewritten around a shared `lower()`. *(The template-literal escape trap struck again — `new RegExp(\`\s\`)` cooks to `s`; the rule now uses regex literals only.)* Locked in `exam-2026-2.test.ts` (7 phrasings). **335 src3d tests green.**

---

## ADR-3D-015 — plane HIGHLIGHT (`מישור ABC`) + a point on / above / below a plane (2026-07-08)

**Operator:** "we need support for מישור / plane. when a user says מישור ABC or מישור ABCD the system should highlight that plane (in a way that covers the points in diagram). If we don't have it, we need to be able to say that a point is on a plane or above/below."

**What already existed:** `plane-through` (a point-run plane, resolved post-pivot by Newell) and the patch renderer — resolved planes draw as translucent patches whose extents GROW to cover every figure point lying on them (the ADR-3D-004 Am. 2 cover rule). But the command was only reachable through compounds (`ℓ ישר החיתוך בין המישור… ובין המישור…`, `הישר A'C חותך את המישור… בנקודה K`, plane-eq claims), membership (`on-planes`) accepted only π-equation planes, and above/below did not exist at all.

**Decision — three layers, all riding existing machinery:**

1. **Bare declaration = the highlight.** `מישור ABC` / `המישור BC'D` / `plane ABCD` (3–4-token run) lowers to the existing `plane-through`; the patch (name label included) is the highlight, and the cover rule already guarantees it spans the named points (locked by a screen-space point-in-patch assertion). **A named plane must be a REAL plane:** derive3 now verifies every `plane-through` — 4 non-coplanar points, or 3 collinear ones, refuse with a new `not-coplanar` error ("the points do not determine a single plane") instead of drawing a best-fit patch that lies. The check covers the compound-created planes too.
2. **On / above / below as one statement family.** `E על המישור ABC`, `E מעל המישור ABC`/`מעל למישור`, `E מתחת למישור ABC` (En on/above/below; π names accept the side forms too) → an idempotent `plane-through` + `on-planes` extended with `side?: 'above'|'below'`. **APPLY decides by id (M1, the 2-D ADR-236 shape):** an EXISTING point pushes a verified membership/side given; a NEW id is CREATED as a free point — new `PointDef` kind `on-plane` (plane + optional side ±1): 2 sampled DOF riding the plane (in-plane frame centred on the run's own points, spread-scaled u,v), 3 with a side (an offset along the normal). Sample keys are id-bound (`onplane-*-<id>`) and only EARLIER points feed the frame — the stability rule holds (locked: adding a later fact never moves E); "show another configuration" slides the point WITHOUT leaving its plane/side. `freeDofCount3` counts +2/+3; in the pivot lane the point rides the gauge transform iff its plane is a point-run plane (an equation plane is Lane-A absolute).
3. **"Above" = the +z side, and a vertical plane refuses.** The side check (derive3, on FINAL coordinates — so it verifies stated points AND guards created ones) orients the plane normal upward; `מעל` requires positive signed distance, `מתחת` negative; wrong side → new `wrong-side-of-plane`; a (near-)vertical plane has no above/below → new `plane-side-undefined`, never a guessed side (ADR-052 honesty). The patch also grows to cover a side-point's ⟂ projection, so the point visibly floats over its own plane.

Root-selection hygiene: memberships with a `side`, or naming a point-run plane, are skipped by the parameter-root selector (`planeAt` reads equation planes only — previously a point-plane name there would have crashed on `.get(name)!`).

Parser: `planeThroughBare` (after the `:`-carrying plane rules) + `pointRelPlane` (before `onSegment`, beside `membership`; π-membership without a side stays with `membership` — one owner). Catalog +5 entries; i18n +3 error strings ×2 locales. Locked by `parse3-planes.test.ts` (21) + `plane-highlight.test.ts` (11, end-to-end through submit → derive3 → buildScene3). **376 src3d tests green (full repo suite 3303 green), `vite build:3d` clean.**

---

## ADR-3D-016 — the 3-D usage dashboard (`/3d-builder/admin`) (2026-07-08)

**Operator:** "we have a dashboard for the geo builder but not for the 3d — so I want to build that."

**What existed:** the 2-D admin usage-analytics dashboard (`server/admin.ts` → `/geo-builder/admin`) — a password-gated Hebrew report (visitors/sessions, daily traffic, parse-outcome breakdown, real-gap + out-of-scope drill-downs, language split, top utterances, recent activity) over `events.jsonl`, written by the 2-D client's lean prod logger (`src/debug/sessionLog.ts` → `POST /api/log` → `server/eventLog.ts`). The 3-D app logged only in DEV (`sessionLog3.ts` was a prod no-op) and had no dashboard.

**Decision — give the 3-D app the SAME dashboard by parameterizing the shared server, never by forking it.** The server is already the one place that binds both apps (parseHandler selects the 3-D LLM prompt by a `tool:'3d'` body tag; the dev log proxy already splits `debug-log.jsonl` vs `debug-log-3d.jsonl`). We extend that seam, respecting the src3d isolation rule (which governs SOURCE imports, not the shared proxy/build-metadata layer):

1. **Turn on 3-D prod analytics.** `sessionLog3.ts` becomes the faithful sibling of `sessionLog.ts`: DEV still fire-and-forgets the full figure snapshot (`tool:'3d'` → `debug-log-3d.jsonl`); PROD now emits a lean `session` marker once per load + one `submit` per FINAL utterance (the pure, unit-tested `analyticsSubmit3` drops `kind:'figure'` snapshots and the intermediate `not-understood` parser step that escalates to the LLM, so an utterance is never double-counted). A `__BUILD__` release id (added to `vite.config.3d.ts`, mirroring the 2-D define) is stamped on every event so the dashboard's release filter works; the App3 submit log now carries `locale` for the language split. Same privacy posture as 2-D — IP hashed + salted, retention prune, no figure/secret payload.
2. **Route 3-D events to their own file.** `handleLog` reads the request body's `tool` tag and appends a `tool:'3d'` event to `events-3d.jsonl` (`EVENTS_3D_LOG_PATH`), 2-D events untouched — the exact analog of the dev log split. The `tool` tag is the routing signal only; it is not duplicated into the stored lean line.
3. **One dashboard renderer, two PROFILES.** `admin.ts` is refactored so `aggregate`/`handleAdmin`/the HTML take a `DashboardProfile` (title, outcome classifier, labels, the two clickable-card bucket keys, an optional sub-breakdown). 2-D behaviour is byte-preserved via a default `PROFILE_2D` (the existing admin tests pass unchanged). `PROFILE_3D` classifies the 3-D outcome space (parser-`ok` → parsed · parser-refusal-code → **refused** · llm-`ok` → llm-built · llm-fail → **not-understood** gap), with the two drill cards being *real gaps to implement* and *reasoned refusals* (the honest `err.code`s — oblique-prism, two-params, claim-refuted, … — each labelled, with a per-code breakdown panel reusing the 2-D scope-breakdown mechanism). An unlabelled refusal code still shows keyed by its raw code, so a new refusal type can never be silently invisible.
4. **Wire the proxy.** `standalone.ts` serves the 3-D dashboard on the DISTINCT `/admin3` path tail (Apache strips the `/3d-builder` prefix, so the two dashboards must differ by tail, not prefix — `/admin3` is checked before `/admin` since `'/admin3'.includes('/admin')`), reading `events-3d.jsonl` with `PROFILE_3D` and base `/3d-builder/admin` (`ADMIN_3D_BASE`). It REUSES the same admin credentials (one operator, one password) but a distinct cookie scope (Path = the 3-D base). New Apache directives in `deploy/apache-3d-builder.conf`: `/3d-builder/api/log` → `/api/log` (body tag splits the file) and `/3d-builder/admin` → `/admin3`. The 3-D LLM fallback already rides the existing `/geo-builder/api/parse` route (src3d/parser/llm3.ts), so no new parse route is needed.

**Tests:** `analyticsSubmit3` one-submit rule (`sessionLog3.test.ts`, 6); `handleLog` tool-file routing (`eventLog.test.ts`); `PROFILE_3D` classification + the two drill cards + the refusal-code breakdown + the rendered 3-D title (`admin.test.ts`). Full repo suite **3314 passed / 4 skipped**, `tsc -b` + `vite build:3d` + `npm run build:proxy` clean.

**Deploy (operator, manual):** rebuild the proxy bundle (`npm run build:proxy`) and redeploy `dist-server/proxy.mjs`; add `EVENTS_3D_LOG_PATH` + `ADMIN_3D_BASE` to the root-only env file; append the two lines from `deploy/apache-3d-builder.conf` to the Plesk "Additional HTTPS directives" and `apache2ctl -t && systemctl reload apache2`; rebuild + redeploy `dist-3d/` so the 3-D SPA starts emitting prod analytics. The dashboard populates as students use the 3-D tool.

---

## ADR-3D-017 — perpendicular declared vectors surface as `u·v = 0` in the organize-your-data panel (2026-07-08)

**Operator:** "for the 3d tool — when u v or w are perpendicular, I want the organized data to show that u times v is 0 and so on."

**Context.** The "organize your data" panel (ADR-3D-014, `engine/dataView.ts`) already derives magnitude equalities among the declared vectors (`|u| = |v| = |w|`, + a stated/derived value) via the multi-sample discipline — a relation is a fact only when it holds in every sampled configuration. Perpendicularity — the other relation a student writes down first when laying out a vector problem, because `u·v = 0` is exactly how a right angle is *used* in the dot-product algebra — was not surfaced.

**Decision.** `dataView` now derives a `u·v = 0` row for each unordered pair of declared vectors that is perpendicular in **every** sampled seed, appended to the same `relations` list (rendered as the panel's prominent top rows; the App is a dumb map over the strings, no App change). Key points:

1. **Being zero is a SHAPE property, its value is gauge.** The raw dot product's *magnitude* varies with the seed's scale (a similarity-gauge figure has no fixed scale), so it is never printed as a number — but *being zero* (the cosine ≈ 0) is scale- and placement-invariant, so the multi-sample gate is exactly right: perpendicular iff `|dot| / (|a|·|b|) < 1e-4` at all three seeds. A degenerate zero-length vector is never called "perpendicular".
2. **Construction-⊥ and stated-⊥ surface identically** — a cube's edge vectors from A, a pyramid's height vs. its base edges, or a solved `DC ⟂ plane` given all read the same, because the derivation looks only at the resolved directions, not at *why* they are orthogonal. No new command, construct, or engine capability — a pure read-only addition to the derived-data view (the panel's stated remit: lean toward showing derived results).

**Tests.** `data-view.test.ts` gains two cases: a cube's three edge vectors report `u·v = u·w = v·w = 0`; a square-base pyramid reports the height's two ⊥ rows while a slanted lateral edge (`s`) is perpendicular to none. Full src3d suite **384 passed**, `tsc -b` + `vite build:3d` clean. No deploy action beyond redeploying `dist-3d/`.

---

## ADR-3D-018 — V8-a: apex-FIRST solid naming is first-class + the diagonal-intersection point (2026-07-08)

_(ADR numbers 016/017 were minted by a concurrent work-PC session — the usage dashboard + `u·v=0` — so this V8-a slice takes 018.)_

**Context.** The [V8 legacy-572 roadmap](20-space-vectors-tool.md#14-v8--full-legacy-572-coverage) (from the [full corpus audit](21-572-coverage-audit.md)) opens with the two cheapest, highest-friction gaps. **(S3)** Legacy exams routinely name a pyramid's apex FIRST (`SABCD`, `EABCD`, `OBCD`, `SABC`) — but the solid template treats the LAST id as the apex (base ring first, [ADR-3D-011](#adr-3d-011)), so an apex-first name silently made a base vertex the apex and every later `SA`/`SM` reference was wrong. **(G3)** The point `E מפגש האלכסונים של הפאה/הבסיס` (intersection of the diagonals of a face/base — ~4 exams: 2018-קיץ-ב, 2019-קיץ-ב, 2019-קיץ, 2021-חורף-א) had no representation.

**Decisions.**
- **Apex orientation at the parse seam** (`orientPyramid`): reorder pyramid ids to `[base ring…, apex]`. The robust signal is an EXPLICIT named base (`שבסיסה ABCD` / `whose base ABCD`) → the apex is the remaining id (handles the non-consecutive `OBCDE` = base OBCD + apex E, where a letter-only heuristic fails). Fallback for a bare name: apex-first iff removing the first token leaves a consecutive alphabetical base run AND removing the last does not (`SABC`→apex S; `ABCDS`/`ABCDT` keep their apex-last reading — regression-safe, idempotent). Solid vertices are read from the **FIRST label run** (`firstLabelRun`), so a `שבסיסה ABCD` clause that re-names the base no longer inflates the vertex count. Pure parser change — no engine/template change; kind selection (square/rect/right) is unaffected by reordering.
- **`diag-intersection` command** — a parallelogram's diagonals bisect, so the crossing = the midpoint of a diagonal (EXACT for the box/cube faces and square/rect/parallelogram bases this curriculum names; a general quad's crossing ≠ midpoint — filed). Apply resolves the face (4 named cyclic vertices, or the `[]` "the base" sentinel → the single solid's `faces[0]`, the [ADR-3D-011](#adr-3d-011) chokepoint) and sets the point as `on-segment` t=½ on the 1st↔3rd diagonal — **reuses the existing on-segment point kind, zero evaluate change**. Three parser forms: a NAMED quad, TWO explicit diagonals (`אלכסון AC … אלכסון BD` → midpoint of the first), or implicit `the base`.

**Locked by** `v8a-apex-diagonals.test.ts` (10: apex-first parse for quad/tri bases + the named-base OBCDE case + the four apex-last regressions; diag-intersection named/sentinel/two-diagonal/En, and the no-solid honest refusal). Catalog +2 (apex-first pyramid, diagonal-intersection point). **398 src3d tests green, `tsc -b` clean.**

---

## ADR-3D-019 — V8-b: a plane DEFINED by ⟂/∥ to an edge + the plane∩edge crossing (2026-07-08)

**Context.** The #1-frequency legacy-572 gap (G1/G2, ~6 exams: 2009-ב, 2011-חורף, 2013-חורף, 2015-קיץ, 2017-חורף). A plane could be defined only by an **equation** (`π: z−3=0`), by a **point run** (`מישור ABC`, Newell), or as a plane∩plane line — but never by the textbook phrasing "**the plane through F perpendicular to edge SC**" or "**through K, P parallel to CD**", and there was no way to place the point where such a plane **cuts an edge** of the solid (only the named-line∩plane `line-plane-point` existed).

**Decisions.** Two new engine objects, both resolved from FINAL positions like a point-run plane (so they ride the pivot correctly):
- **`rel-plane`** (a third `PlaneDef` sibling, `c.relPlanes`): `perp` = through one point, normal = the edge's direction; `par` = through two points, normal = (chord)×(edge dir). `relPlaneFromPositions` computes `{n,d}` from current coordinates; a shared `resolvedPlaneAt` tries equation → point-run → rel. Registered into the resolved `planes` map post-pivot, so it **renders as a patch** with no renderer change (the ADR-3D-004 cover rule grows it over its members). A `∥`-to-an-edge plane needs TWO through-points to be determined — one point (the "∥ a line at a stated angle" form, 2012-קיץ-ב) is deferred to V8-e with the angle constraint.
- **`plane-cut` point** (`{plane, a, b}`): the crossing of any plane (equation / point-run / rel) with segment a–b, `t = −(n·A+d)/(n·(B−A))`; a segment parallel to the plane yields no point (degenerate, skipped). Added to `GAUGE_KINDS` so the pivot transforms it; **zero new solver code** — a pure derived point evaluated in the point loop beside `on-plane`.

Parser: `relPlaneRule` (order-independent through/relation clauses, He+En, unnamed ⇒ π) + `planeCut` (four phrasings). A local non-capturing `PN` plane-name fragment avoids `PLANE_NAME`'s inner-group index shift.

**Locked by** `v8b-plane-def.test.ts` (7: ⟂/∥ parse + the 1-through-point ∥ deferral; plane∩edge four phrasings; the 2009-ב build — plane ⟂ SC through F cuts SA→E=(1,½,1½), SB→D=(1.8,1.2,0), both verified on the plane; a ∥-plane crossing; the unknown-plane refusal). Catalog +3. **411 src3d tests green, `tsc -b` clean.**

---

## ADR-3D-020 — V8-c: a symbol COUPLED to a free dim is co-solved in the pivot (the D3 call) (2026-07-08)

**Context (G7, the headline deferred exam).** 2022 חורף נבצרים Q2: a rhombus prism whose height `h` is a free dim, with `F` defined by `D'F = t·D'A + ¼·D'C` (symbol `t`) and `DF ⟂ plane ACD'`. The ⟂ condition couples `t` and `h`, but the engine solved `t` by a **post-pivot 1-DOF root-find** (`chooseParam`/`symbolPinResidual`) that runs AFTER the pivot has fixed the dims — so no `t` exists for the pivot's arbitrary `h`, the root-find returns ∅, `F` is left unplaced, and the step parked forever. **The operator's D3 ruling (2026-07-08): YES — a symbolic scalar may become an additional unknown INSIDE the numeric pivot solve when coupled to a dim. Still 100% numeric (LM / root-finding), no CAS.**

**Decision — a FAILURE-PATH coupled retry (the happy path is bit-for-bit untouched).**
- `solvePivot` gains an optional `coupled: { defs, pins }`: the coupled symbols are appended to the unknown vector AFTER the dims (`x = [gauge(7), …dims, …symbols]`), and each ⟂/∥-pinned condition becomes a residual (a `perp` adds 2, a `∥` adds 1) evaluated with the symbol **baked into the point** via a `symbolOverride` map threaded through `evaluateSolidsAndPoints`. `PivotResult.symbols` carries the joint solution; `nSym = 0` ⇒ every path is identical to before.
- `resolve3` runs the **normal** solve first (`nSym = 0`). Only if a ⟂/∥-pinned symbol's point is then still **unplaced** (root-find failed) AND free dims exist does it re-solve with `coupled` set and re-apply. So determined figures where the root-find succeeds (2023-ב's `EF∥plane`, 2026-ב's `|EN|`) never enter the coupled path — verified bit-identical.

Gate: 2022-נבצרים builds to the closed form (**t = ¼, |DD′| = 2**, DF ⟂ plane ACD′ verified). A parser robustness fix rode along: `vertexAngleClaim` now accepts the bare Hebrew `זווית ADC = 120` (the `ה` prefix was mandatory — the natural exam phrasing was silently dropped). *(The two-SYMBOL vec-rel form `AF = t·A'C + m·A'B` of 2013-קיץ-ב is a different mechanism — multiple free scalars in one relation — filed for V8-f.)* **Perf:** the coupled retry is a multi-start LM (~16 s for this figure) — acceptable, noted as a target (the ADR-229 precedent). Locked by `v8c-coupled-symbol.test.ts`. **413 src3d tests green, `tsc -b` clean.**

---

## ADR-3D-021 — V8-d: the legacy-572 solid family (equilateral bases + parallelogram-base pyramid) (2026-07-08)

**Context (G4).** The legacy corpus wants solids the template set lacked: an **equilateral-triangle-base** right prism (2013-קיץ-ב, 2018-חורף) and pyramid (2014-קיץ, 2012-קיץ-ב), and a **parallelogram-base pyramid** (2012-חורף ABCDT, 2013-קיץ SABCD). The existing `prism3`/`pyramid3` carry a *free* triangular base (α,β sampled) and `pyramid4*` only square/rect bases.

**Decision — three new `SolidKind`s, following the existing template pattern** (VERTEX_COUNT + DIM_COUNT + edge/face indices aliased to their triangular/quad siblings; `solidDims` + `solidPositions`):
- **`prism3e` / `pyramid3e`** — an equilateral base is the similarity gauge (side 1, α=β=60° ⇒ C=(½,√3/2)), so the ONLY free dim is the height; the pyramid's apex sits above the base centroid (= circumcentre ⇒ equal lateral edges, a right pyramid). Parser: `rightPrism`/`rightPyramid` detect `שווה צלעות` / `equilateral` / `כל מקצועותיה שווים`.
- **`pyramidPar`** — a free-apex parallelogram-base pyramid: base `AB=(1,0)`, `AD=(dx,dy)`, `C=B+AD` (5 dims: the 2nd base edge + the free apex). Parser: `מקבילית` / `parallelogram`, composing with V8-a apex-first naming (`SABCD` → `pyramidPar` with apex last).

**Deferred (documented, low frequency — 1 exam each, expressible via coordinate injection today):** the **oblique parallelepiped** `מקבילון` (2011-חורף — a general non-right box) and the **orthoscheme** (2017-חורף `OBCD`, three mutually-⊥ edges at a corner). The **"all edges equal"** prism (2018-חורף) parses as `prism3e`; pinning height = side is left to a length-equality given.

**Locked by** `v8d-solids.test.ts` (parse for all three He+En incl. apex-first `SABCD`→`pyramidPar` and the plain-vs-equilateral distinction; builds verifying the equilateral base + equal lateral edges, straight prism verticals, and the parallelogram opposite-sides-equal). Catalog +3. **424 src3d tests green, `tsc -b` clean.**

---

## ADR-3D-022 — V8-e: a pyramid's height to a NAMED FACE (2026-07-08)

**Context (G5 core).** 2014-קיץ-ג: `AF גובה הפירמידה לפאה BDC` — the height from apex A drops ⟂ to the plane of face BDC, meeting it at the foot F. `heightOfSolid` (ADR-3D-012) only handled the height to the **base** (a `seg-plane-rel` with the base sentinel — a ⟂ relation, no foot point); a named lateral face + its foot had no representation. `foot-plane` exists but resolves only equation planes (a point-run/face plane isn't in the `planes` map during the point loop).

**Decision — a `foot-face` point kind** `{from, face}`: the foot of the ⟂ from `from` onto the plane through the `face` vertices, resolved INLINE in the point loop from a Newell normal (the same pattern as V8-b's `plane-cut`/rel-plane — the face points are solid vertices placed first). Added to `GAUGE_KINDS` (rides the pivot); apply draws the height segment. `heightOfSolid` gains a `לפאה BDC` / `to face BDC` branch emitting `height-to-face` (the plain base form is untouched — a bare `AS גובה` still means ⟂-to-base).

**Deferred (documented, 2012-קיץ-ב, 1 exam):** the **dihedral angle between a lateral face and the base** (`70°`/`40°`) and the **in-face altitude** (`EL` of face EDC) — these need a face-as-plane reference + a dihedral-given machinery beyond this slice; filed as the G5 remainder.

**Locked by** `v8e-height-to-face.test.ts` (He+En parse; the foot of A=(1,1,3) onto plane BCD=z-plane lands (1,1,0), AF ⟂ the face verified; the plain `AS גובה` base form unchanged). Catalog +1. **429 src3d tests green, `tsc -b` clean.**

---

## ADR-3D-023 — V8-f: vector-relation givens (cos-angle, chained dot products, equal angles, 3-D bisector) (2026-07-08)

**Context (G6/G9/G10/G11).** The legacy corpus states several relations among NAMED vectors that the tool could not express: the **cosine of the angle** between two named vectors OR at a vertex (2013-חורף `cos(w,u)=√35/10`; 2014-קיץ-ב `cos∠ACB=¾`), a **chain of equal dot products** (2012-קיץ-ב `u·v=v·w=u·w`), a vector making **equal angles** with two vectors (2016-קיץ `AE יוצר זוויות שוות עם AB ו-AD`), and a **3-D angle bisector** defining a point (2015-קיץ `D על AC כך ש-OD חוצה-זווית AOC`). `vangle`/`dot-given` covered only a vertex angle in DEGREES and a dot product = a NUMBER.

**Decisions.**
- **All operands are `VecAtom`** (a declared vector OR a point pair — the existing symbolic-layer atom, reused, no new type), so `cos∠ACB` (vertex → pairs `CA`,`CB`) and `cos(u,v)` (named vectors) share one command. `evalRadical` parses the cos value (`√35/10`, `¾`, `0.5`).
- **Three new `ScalarPin` kinds — `cos-angle`, `dot-eq`, `cos-eq` — and their `Claim3` twins.** APPLY decides drive-vs-verify by the M1 shape ([ADR-3D-010](#adr-3d-010)): on a figure with FREE solid dims a relation is a driving GIVEN (a scalar pin → the pivot residual); on a determined figure it is a verified CLAIM. All three residuals are **similarity-INVARIANT** — cos/angle equalities are normalized, and an equality of dot products scales as s² on both sides — so they join the gauge-frozen dims-only solve (`invariantOnly`); `dot-eq` is normalized by the operand-norm product to stay O(1). A chain `u·v=v·w=u·w` lowers to one `dot-eq-chain` command → n−1 pairwise relations; equal angles lowers to `cos-eq(base,a,base,b)`.
- **`bisector-seg` point kind (G11)** `{a,b,apex}`: D rides segment a–b, its t **root-found by bisection** so `cos(apex→D, apex→a) = cos(apex→D, apex→b)` (monotone on [0,1] — one internal-bisector root; a degenerate angle falls back to the midpoint). Reuses the point loop, no solver/CAS — the D3 boundary holds. Added to `GAUGE_KINDS` (rides the pivot).
- **Parser:** `cosAngleGiven`, `dotEqGiven` (before `dotGiven` — a numeric RHS stays a dot-given), `equalAnglesGiven`, `bisectorPoint` (before `onSegment`, or `D על AC` would be read as a free slider and drop the bisector condition). He+En.

**Scope note (the 2-D lane is V8-g).** The pivot solver drives only figures that carry a SOLID; the pure-plane triangle builds of 2013-חורף/2014-קיץ-ב (free points, no solid) reproduce end-to-end only once the z=0 vector lane lands (V8-g). V8-f delivers the capability — parse + drive-on-a-solid + verify + the bisector point — gated on solid-bearing representatives of each gap (a tetra for G6, the apex-first pyramid SABC for G9, the square-base pyramid for G10, coordinate points for G11).

**Locked by** `v8f-vector-relations.test.ts` (parse He+En for all four; cos(u,v)=½ reshapes a tetra to 60°; `u·v=v·w=u·w` equalises the three edge-dot products on SABC; equal angles gives cos(AE,AB)=cos(AE,AD); the bisector lands D on AC at the bisector-theorem ratio t=8/14 with equal angles to OA,OC; a determined-figure cos verifies as a claim). Catalog +5. **449 src3d tests green, `tsc -b` + `vite build:3d` clean.**

## ADR-3D-024 — the `טטראדר`/`tetrahedron` keyword is a triangular pyramid that carries its own base (2026-07-08)

**Context (operator request).** The tool models a general triangular pyramid (`tetra`, free apex, 5 dims) and its right variant (`pyramid3`), but the ONLY trigger word was `פירמידה`/`pyramid`; the transliteration `טטראדר` (and `tetrahedron`) fell through the deterministic grammar as `not-handled` and depended on the LLM fallback.

**Decision.** Fold a `tetraWord` recogniser into the existing `rightPyramid` rule ([parse3.ts](../src3d/parser/parse3.ts)) — **no new engine construct**; it lowers onto the existing `tetra`/`pyramid3` kinds. Unlike bare `פירמידה` (base ambiguous → refused), a tetrahedron IS a triangular pyramid **by definition**, so the word carries its own base: `tetraWord` forces the `tri` branch, so the bare/label-less form parses deterministically to `tetra` (default labels A,B,C,D) instead of refusing. `טטראדר ישר`/`right tetrahedron` → `pyramid3`. A 5-label `טטראדר` is a **contradiction** (a tetra has exactly 4 vertices) → honest `not-handled` (the 5-token pyramid branch is gated `&& !tetraWord`).

**Details.** The Hebrew stem is `טטרא`/`טטרה` (alef or hei) — `/טטר[אה]ה?דר(?:ון)?/` covers `טטראדר`/`טטראהדרון`/`טטרהדרון`; English `/\btetrahedr(?:on)?\b/i`. The `right` recogniser widened `/ישרה/`→`/ישרה?/` so the masculine `ישר` (agreeing with masculine `טטראדר`) also reads as right, the feminine `ישרה` (with `פירמידה`) unchanged.

**Locked by** `tetrahedron.test.ts` (labelled/bare/right/5-label-refusal + end-to-end build, He+En, spelling variants) + a catalog entry (guard test asserts both locales parse). **456 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-025 — V8-g: the 2-D vector lane (z=0) — flat free-point polygons (2026-07-08)

**Context (S1).** Two 572 exams pose PURE PLANE-vector problems on free-point polygons the tool could not build (there was no construct below a solid): 2010-קיץ Q2 (a quadrilateral MKNL + a pentagon ABCDE whose sides' midpoints are MKNL; the identities `QP = ½(KM+LN)`, `QP ∥ EA`, `|QP| = ¼|EA|`) and 2014-קיץ-ב (a triangle with an altitude foot + a cevian, vectors expressed over a basis). Doc-21's scope decision S1: handle these as a **degenerate z=0 lane**.

**Decision — a FLAT polygon is modelled as a "solid" whose dims are its free vertex coordinates.** New `SolidKind`s `polygon3`/`polygon4`/`polygon5` (triangle/quad/pentagon in the z=0 plane): `v0=(0,0,0)`, `v1=(1,0,0)` fix the gauge, the remaining vertices ride the free dims (`2(N−2)` of them: triangle 2, quad 4, pentagon 6 — exactly the shape DOF up to similarity), sampled in convex position. This **reuses every existing mechanism with zero new solver code**:
- the FREE case (2010-Q2) — no givens → the dims sampler places a general polygon; the vector identities are pure AFFINE facts (I verified `QP = P−Q = ¼(A−E) = ¼·EA` for any pentagon) so they VERIFY multi-sample (`vec-eq`/`lines-rel`-parallel/`length-rel` claims — all already built); "show another configuration" varies the shape;
- the DRIVEN case (2014-קיץ-ב SAS: `|CA|=1, |CB|=2, cos∠ACB=¾`) — the metric givens are the V8-f/T2 scalar pins, and the existing PIVOT solves the polygon's vertex-dims against them (a length pin anchors scale via the gauge; a cos pin is invariant). No special path.
- **Double-sided faces** (the ring + its reverse) so that from any viewpoint one face is front-facing → a flat figure never renders fully dashed, while `faces[0]` still resolves `diag-intersection`'s "the base" sentinel.

Also a **triangle-altitude foot** (`foot-seg` point + the `altitude-foot` command): `גובה המשולש לצלע AB הוא CD` / `CD is the altitude to AB` → D = foot of the ⟂ from the apex onto the side (reuses `footOnLine`; the command draws its own segment, so the parser emits NO premature `segment3` referencing the not-yet-created foot — the class bug the gate caught). Cevians ride the existing on-segment/ratio point.

Parser: `planarPolygon` (bare `משולש`/`מרובע`/`מחומש` + En, guarded against the prism/pyramid words and placed AFTER the שטח/מפגש/area consumers of those nouns) + `altitudeFoot`. Catalog +4.

**Deferred (documented):** a flat z=0 polygon renders in the horizontal plane, so at the ¾ home view it reads foreshortened (the camera frame degenerates at a true top-down pitch of ±90°); a **face-on default view for purely-planar figures** is a renderer follow-up (the engine + vector math are exact — the gate tests coordinates). The full 2014-קיץ-ב numeric chain (the specific value of t from the metric givens) rides the driven triangle; only its structural vector expressions are gated here.

**Locked by** `v8g-planar-polygons.test.ts` (parse He+En incl. the no-steal guards; 2010-Q2 part א `QP=½(KM+LN)` on a free quad, part ב `QP∥EA` + `|QP|=¼|EA|` on the pentagon with an independent oracle `QP=¼·EA`; the altitude foot lands on AB with CD⟂AB; a cevian at CE:EB=3:5; and the SAS givens DRIVE the free triangle to `|CA|=1,|CB|=2,cos=¾`). **463 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-026 — prod-log triage fixes: bare revolution solids, `ארבעון`, median, tetra altitude, plane-eq phrasings (2026-07-09)

**Context.** The new `/log-triage` tool (`.claude/skills/log-triage/`, `.claude/agents/log-triage.md`) pulled the 3-D prod log, re-ran every failed utterance against HEAD, and surfaced the genuine LIVE gaps (already-fixed ones auto-dropped — e.g. `טטראדר`, which shipped in ADR-3D-024; those users had a stale cached bundle). Operator approved fixing all but the line↔plane angle (planned separately). All are **root-cause parser/vocabulary fixes, no new solver**:

1. **Bare revolution solids** `כדור`/`חרוט`/`גליל` (no params) now build with FREE sizes (ADR-052). The `revolutionSolid` "binds nothing → refuse" guard was too aggressive; it now refuses only when the noun carries a NUMBER we couldn't bind (a genuine half-read like `חרוט 5` — which dim?), so a truly bare noun is a free-size solid while `חרוט גובה 5` still binds height 5.
2. **`ארבעון`** (the actual Hebrew word for tetrahedron — ADR-3D-024 added only the transliteration `טטראדר`) and **`טטרדר`** (a missing vowel-letter) join the `tetraWord` set (`טטר[אה]?ה?דר` makes the alef/hei optional; `|ארבעון`).
3. **Median in a triangle** `CD תיכון במשולש ABC` (+ `CD תיכון לצלע AB`, En) — no new construct: the foot = the MIDPOINT of the opposite side (the triangle's other two vertices, or the stated side) + a drawn segment (`medianFoot` rule).
4. **Tetra altitude** `DE גובה בטטראדר`/`בארבעון` — a `tetra-altitude` command; apply resolves THE tetra (the ADR-3D-011 sentinel pattern), takes the face opposite `from` (its other 3 vertices), and reuses the V8-e `foot-face` point + draws the altitude.
5. **Plane-equation phrasings** — `planeByEquation` now accepts an UNNAMED plane (`המישור x-y+z=1` ⇒ π) and NO colon (`המישור π2 x-y+z=1`), gated by requiring `=` in the tail so a point-run plane (`מישור ABC`, no `=`) is never stolen (parseLinearEq strictly validates). `angleBetweenPlanes` accepts singular `מישור` (`ה?מישור(?:ים)?`) so `הזווית בין מישור π1 ו-π2 היא 45` parses.

**Locked by** `triage-fixes.test.ts` (the exact prod utterances: parse + build — median D at mid-AB, tetra altitude DE⟂face ABC, bare sphere with a FREE radius; the half-read refusal; regressions on the colon plane-eq + point-run plane). Catalog +5. **488 src3d tests green, `tsc -b` + `vite build:3d` clean.** _(The line↔plane angle `זווית בין הישר AC' לבין המישור ABCD` is planned separately per the operator.)_

**Am. (2026-07-09, operator report — תיבה + `מישור A'B'C'D' הוא x-4y-8z-142=0` not recognized).** The plane-eq phrasing family (item 5) missed two forms, in BOTH plane-equation rules: the bare **`מישור`** (no definite ה — `planeThroughBare` already accepted `ה?מישור`, the equation rules didn't) and the copula **`הוא`/`is`** as the name↔equation separator. `planeEqClaim` (point-run planes) demanded exactly `המישור … : …`; `planeByEquation` (π-named) likewise lacked both. Fixed as a class in the two rules: prefix `ה?מישור`/`(the )plane`, separator `:` **or** `הוא`/`is` (still gated by the strict all-or-nothing `parseLinearEq`, so a point-run plane with no `=` is never stolen — verified: the loosened `planeByEquation` sees the utterance first, fails `parseLinearEq` on the point-run, and falls through to `planeEqClaim`). Locked by `parse3-v4.test.ts` (the exact reported utterance He+En) + `parse3-v2.test.ts` (copula on a π-name). _The drive-as-a-given follow-up the operator then requested is [ADR-3D-030](#adr-3d-030)._

---

## ADR-3D-027 — the angle between a LINE and a PLANE (2026-07-09)

**Context.** The one prod-triage item held for a plan (operator, 2026-07-09): `זווית בין הישר AC' לבין המישור ABCD` — the formula-sheet `sin β = |n·u| / (|n|·|u|)` (n = plane normal, u = line direction). The tool had angle-between-segments and angle-between-planes, but no line↔plane angle. Operator approved the plan.

**Decision — a `line-plane-angle` measure, M1-routed like every other angle** ([ADR-3D-010](#adr-3d-010)):
- On a figure with FREE solid dims it is a **driving GIVEN** — a similarity-INVARIANT scalar pin (`|n·u|/(|n||u|) − sin(deg)`, joins the gauge-frozen dims-only solve); on a determined figure it is a **verified CLAIM** (multi-sample, `|β − deg| ≤ 1e-3`).
- The plane is a **point-run** (normal = two edges at the first vertex, computed inline in both claims.ts and solve3.ts to avoid an evaluate↔solve3 circular import); the line is `b − a`. The line segment auto-draws.
- **The valueless form is a QUERY, not a construct.** `הזווית בין הישר AC' לבין המישור ABCD` (no value) is a "what is the angle" ask outside the reproduce-and-verify charter — the rule requires a value, so it stays `not-handled` (escalates) rather than getting a bespoke clarification (avoiding the App/i18n/store surface for a 1-user edge; never a silent build).

Parser `linePlaneAngle` (He + En, before angleBetweenPlanes/angleSegClaim).

**Locked by** `line-plane-angle.test.ts`: parse He+En + the valueless not-handled; **VERIFIES on a cube** (AC′↔base = asin(1/√3) ≈ 35.264°) and a **wrong value (30°) is refused** keep-prior; **DRIVES a free-dim box** so the angle becomes 30°. Catalog +1. **493 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-028 — V8-h: the common perpendicular of two lines + the projection of a line onto a plane (2026-07-09)

**Context (G8).** 2010-Q3: a line `d ⟂ ℓ and ⟂ ℓ'` (the common perpendicular). 2012-חורף Q3: `BE = היטל הישר TB על המישור ABCD` — the projection of a line onto a plane. Two derived-line constructs the tool lacked.

**Decision — two new `Line3Def` kinds, resolved in a LATE pass** (after the base lines + planes are placed, reading the resolved `lines`/`planes` maps — the pattern of the pointLines / plane∩plane second passes):
- **`common-perp` `{line1, line2}`** — dir = `dir(line1) × dir(line2)` (the cross is internal-only, never displayed — the curriculum has no cross product); anchor = the foot on line1 of the shortest connecting segment (closest-points-between-two-lines, closed form). Parallel lines (cross ≈ 0) yield no unique common perpendicular → skipped.
- **`line-projection` `{line, plane}`** — dir = the in-plane component `dir − (dir·n̂)n̂`; anchor = `footOnPlane(line.anchor, plane)`. A line ⟂ the plane projects to a point → skipped.

Parser `commonPerp` (`הישר d מאונך לישר AB ולישר CD` / `d is the common perpendicular of AB and CD` / `אנך משותף`; a tight two-line-target regex so it never collides with the ⟂-constraint / ⟂-to-plane rules) and `lineProjection` (`BE היטל הישר TB על המישור ABCD` / En). Both **source their lines from through-lines (point pairs)** and the plane from a point-run (or a π-name), created as needed.

**Deferred (documented):** the exact PARAMETRIC ℓ/ℓ' forms of 2010-Q3 (two named parametric lines) wait on a **multi-line-naming** rework — the current single-`ℓ` model (`LINE_NAME = /[ℓl]/`, 9 rules hard-code `name:'ℓ'`) can hold only one named parametric line. V8-h delivers the two constructs on through-line inputs (a cube's skew edges, a slanted edge's projection); the parametric reproduction is a bounded follow-up.

**Locked by** `v8h-lines.test.ts` (parse He+En; on a cube: `d ⟂ AB` and `⟂ A'D'` to 1e-9; the projection of the space diagonal AC′ onto the base lies IN the base plane and is the base diagonal AC). Catalog +2. **501 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-029 — V8-i: a circle lying in a plane in R³, tangent to a line (2026-07-09)

**Context (G13).** 2016-קיץ-ב Q2: a circle centred at O, lying in a plane π, **tangent to a line ℓ₁ at B**, with a second point A (= ℓ₂ ∩ π) lying on it. The tool had no circle in R³ — the biggest single V8 gap (a whole new primitive with its own rendering).

**Decision — a first-class `Circle3` object (centre + plane-normal + radius), resolved from final positions/lines and rendered as a projected ellipse.**
- **`Circle3Def`**: `tangent-line {center, line}` — centred at `center`, in the plane through the centre & the line, **tangent** to it: the touch point = the ⟂ **foot** of the centre onto the line (a `foot-line` point), the **radius** = the centre→line distance, the **normal** = `(foot−centre) × dir` (both in-plane and ⟂). Also `center-plane-radius {center, plane, radius}`. Resolved in a late pass (after lines/planes are placed) into `{center, normal, radius, e1, e2}`; the circle's PLANE is exposed in the `planes` map under its id so a line can intersect it.
- **Rendering reuses `circlePts`** (the V6 revolution-circle sampler): one full outline sampled in the circle's own in-plane basis `e1,e2` — a tilted circle projects to an ellipse, no new renderer primitive.
- **`point-on-circle3`** is a store-verified membership (like `on-line`, not a generic multi-seed claim — the check needs the *resolved* circle the store already holds): on the circle ⟺ `|P−centre| = radius` AND `P` in the plane. `''` = the single circle (ADR-029 implicit reference).
- **A final `foot-line` fill** was added: a foot on a THROUGH-line (a circle's tangent line) resolves after the point loop, so unplaced foot-line points are re-resolved once every line is in the map.

Parser `circleTangentLine` (`מעגל A משיק לישר BC בנקודה F` / En; id `circle-<centre>`, ADR-029; `במישור π` ignored — the plane is derived) + `onCircle3`. The tangent line is a **through-line** (point pair); the exact parametric-ℓ form of 2016-Q2 waits on the same multi-line-naming rework noted in ADR-3D-028.

**Locked by** `v8i-circle.test.ts` (parse He+En; on a cube: circle centred at A tangent to edge BC → centre A, radius 1, plane z=0, touch F = the ⟂ foot with AF⟂BC; `D על המעגל` verifies, `C' על המעגל` refused). Catalog +2. **507 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-030 — a stated plane EQUATION is an M1 GIVEN: it drives the free gauge/dims (2026-07-09)

**Context.** Follow-up to the ADR-3D-026 Am. parse fix — operator: "we need to support also the M1 thing you mentioned." `plane-eq` was verify-only (V4, ADR-3D-007): on a coordinate-FREE תיבה, `מישור A'B'C'D' הוא x-4y-8z-142=0` parsed but refused `claim-refuted` — yet per M1 a statement about existing objects is a GIVEN, and a plane equation on an unpinned solid should PLACE it (the same information-flows-backward shape as coordinate injections and ADR-3D-027's angle).

**Decision — plane-eq becomes a pivot pin AND stays a recorded claim (belt + braces):**
- **`Construction3.planePins`** (`{ids, cx, cy, cz, d}`, wired through the pairPins chokepoint set: clone / solve gate / invariantOnly / evaluate activation / store pin-ownership / dataView `hasFrame`). Apply routes a `plane-eq` claim on a SOLID-bearing figure into a pin **and still records the claim** — the final claim verification is what guarantees EVERY named point, because the pin residuals deliberately cover less (below). A coord-only figure (no solid) keeps the plain verified-claim path (v7-gates 2021 unchanged).
- **Drive is a FAILURE-PATH retry (the V8-c pattern):** the normal pivot solve EXCLUDES plane pins — bit-identical to the pre-change path (locked by the 2020-prism and 2026-מועד-ב gates, whose plane answers ride pinned figures). Only when **nothing else pins the figure** or the pinned solve leaves a stated membership **unmet** (normalized residual > 1e-4) does a joint re-solve WITH the plane pins run; if that finds nothing, the pinned figure stands and the claim refutes (`claim-refuted` — the student-answer semantics). Two experiments dictated this shape: a plane residual joined to an already-rigid figure spawns **junk rotation basins** (one named point dragged onto the plane, the real config outvoted in the sign-selection pool), and a **symbol-defined point (2026's `SN = k·SC`) sits at a PROVISIONAL k during the solve** (the root-find runs post-pivot) — its residual poisoned the joint solve, so `symbolTainted` ids are skipped in the pin residuals (worst case is a failed drive, never a silently wrong figure — the claim backstop refuses).
- **The scale-free class solves PLACEMENT-FIRST (Stage A):** plane pins with no absolute length anywhere (no point/vector/pair injection, no length/dot scalar) leave scale in the null space with a **degenerate attractor** — LM zeroes every residual by shrinking the solid onto a point ON the plane (observed span ~1e-16; a 1e-4 dims/log-scale anchor alone did NOT steer the basin choice). A plane equation is a *placement* statement, so Stage A solves translate+rotate ONLY (scale frozen, dims at the seed's sample — the shrink basin does not exist) and lands exact (err 0); Stage B (the anchored full solve, best-selection on the FULL error so the anchor punishes collapse, acceptance on the PRIMARY residuals so exact solutions always pass) opens scale+dims only if placement alone cannot satisfy the pins (e.g. two plane equations jointly pinning a dim).

Semantics on the operator's case: free תיבה + the equation → the top face lands exactly on the plane, the remaining DOFs stay free and "show another" varies them with membership held (ADR-052); pinned box + a true equation → verifies; a wrong equation → `claim-refuted` keep-prior; contradictory equations → refused.

**Locked by** `plane-eq-drive.test.ts` (drive + non-degeneracy + resample-holds, En mirror, pinned verify + wrong-answer refusal, contradictory pair) and the untouched exam gates (2020 ג, 2026 מועד ב, v7-gates 2021). **515 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**Am. (2026-07-09, operator dev session `rqlu4vkt` — "how can all nodes be calculated? values should be given only if known for sure in all seeds").** The session (תיבה → the plane equation → `B(0,7,6)`) exposed two defects. (1) **The mixed-pin drive accepted a DEGENERATE solid:** with one point injection alongside the plane pins, the retry solve satisfied both givens by collapsing one box dim (B′≡C′ — a zero edge also "solves" the plane residuals), and the claim check's span guard then refuted a jointly-satisfiable figure (the box merely needs height 18 = dist(B, plane)). The scaleFree gate was the wrong boundary — the collapse attractor lives in EVERY plane-carrying solve, so now (`planeDrive`) every such solve is anchored + judged on primary residuals, **and a candidate whose solid carries two coincident vertices is rejected outright** (a geometric general-position filter, semantics-safe for the V8-g coordinate-dims polygon lane where a dim value of 0 is legitimate). The figure now builds with |BB′| = 18 at every seed. (2) **A `sample`-kind canvas coordinate label is not knowledge:** the panel used to stamp every node with THIS DRAWING'S coordinates (gray italic) once any frame existed; per the operator's rule a number on a node must be seed-invariant — the `sample` kind is REMOVED (dataView + Figure3), so an undetermined point carries no label. Emergent win: with the figure solving correctly, the multi-sample gate itself now derives **B′(2, 15, −10) as a printed FACT** (BB′ runs along the plane normal with forced length 18) while A/C/D — genuinely free — print nothing. Locked by the `dev session rqlu4vkt` case in `plane-eq-drive.test.ts`.

**Am. 2 (same session — the operator typed `|BB'|` hoping the sidebar would show the length).** A length QUERY stays not-handled (the ADR-3D-027 charter line), but the sidebar can surface the value without any query: (1) **derived magnitudes** — a vector/segment entry's `|label| = value` row now prints when the length is identical in EVERY sampled configuration (the same gate the `|u|=|v|` class-value already used), not only when stated — so drawing BB′ surfaces `|BB'| = 18` (+ `BB'² = 324`) because the plane given + B force it; (2) that exposed a record-vs-ink conflation: `segment3` on a pair that is a SOLID EDGE used to be a silent no-op (`hasSegment` counts solid edges), so the student's deliberate act of naming `BB'` left no trace for the panel — apply now RECORDS the pair (idempotent only against `c.segments`), and `scene3` skips solid-edge duplicates so the ink still draws exactly once (auto-draw helpers keep the old `hasSegment` semantics — claim aux segments never duplicate edges). Locked in `plane-eq-drive.test.ts` (the `|BB'| = 18` row), `vecExpr3.test.ts` (record), `scene3.test.ts` (no 13th edge). **517 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-031 — a parametric line NAMED BY A POINT PAIR puts its points ON the line (2026-07-09)

**Context.** Operator, from the textbook: `נתון כי הצגה פרמטרית של הישר AB היא x̲ = (0,7,6) + t(0,2,1)` — "keep the data entry quick and simple but not skip anything important. If the student just says ℓ: … we draw that line, but this is different because we want specific nodes on the line." Before this, only the single name `ℓ`/`l` parsed (`LINE_NAME = /[ℓl]/`), only in the rigid `: x =` colon form, and the textbook's pair name AB — which *asserts A and B lie on the line* — was unrepresentable (the multi-line-naming gap noted in ADR-3D-028/029).

**Class.** A line-equation statement whose name is a POINT PAIR carries an extra assertion the single-letter form doesn't: the named points are members of the line. Dropping the name (forcing the student to rename to ℓ) silently drops that assertion (§6 honesty).

**Decision — the pair name lowers to `line3` + one `on-line` per named point; `on-line` becomes M1-dual (the exact ADR-3D-015 `on-planes` shape):**
- **Parser** (`parametricLine`, one rule, no new rule): the name slot widens to `ℓ|l` OR a point pair (primes/digits ride). Phrasings widen to the textbook family — `משוואת הישר AB היא …` / `ה?הצגה ה?פרמטרית של הישר AB היא …` / optional `נתון כי`/`נתון ש` prefix / optional `x =` — and the En mirrors (`the equation of line AB is …`, `a parametric representation of line AB is …`); the quick `הישר ℓ: x = …` colon form is byte-unchanged (and the widened phrasings work for ℓ too). A pair name emits `line3 {name:'AB'}` + `on-line A` + `on-line B`.
- **Engine:** `on-line` apply is now M1-dual — an EXISTING id stays a verified membership given (`not-on-line` refusal, unchanged); a NEW id is **CREATED as a free rider on the line**: a new `PointDef` kind `{kind:'on-line', line}` (1 sampled DOF, ADR-052 — where on the line is unstated), placed in the evaluate point loop as sampled t along the unit direction around the figure-centroid's ⟂ projection (the on-plane rider's sampling, line edition; distinct ids sample distinct t = general position). Riders are Lane-A absolute (a typed equation is world-frame — not in `GAUGE_KINDS`), count 1 each in `freeDofCount3`, and the store's per-fact status pass re-checks membership on final coordinates, so a rider can never silently drift. Renderer: zero change — the line-extent already spans the fitted figure (riders are placed points), and the label prints `AB: x = …`.

Not done (still the documented ADR-3D-028 deferral): rules that *operate on* a named line (⟂-to-plane, cuts-plane-at, foot-on-line…) still hard-code `'ℓ'`; a pair-named line's points are first-class, so those relations are reachable through the points themselves. Full multi-line naming (2010-Q3's ℓ/ℓ′ pair) remains a bounded follow-up.

**Also (same session, the ADR-3D-026 phrasing class):** `signGiven` accepted only the glued article + copula-less form — the operator's `שיעור ה y של A הוא שלילי` failed on BOTH the spaced `ה y` (the on-axes rules already tolerate `ציר ה z`) and the copula `הוא` (~15 sibling rules already carry `(?:הוא\s+)?`). Widened: `ה\s*[-־]?\s*[xyz]`, optional `הוא`/`היא`, En optional `the`. Locked in `parse3-v4.test.ts`.

**Locked by** `named-parametric-line.test.ts` — parse (textbook form, operator-typed form, variants, En mirrors, primes, ℓ-regression) + build (riders ON the line at every seed, general position, DOF = 2, resample keeps membership; M1 verify on an existing anchor point; `not-on-line` keep-prior refusal on an off-line point). Catalog +1. **527 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**Am. (same day, operator screenshot — "the input is not accepted but it should; the canvas shows point B wrong").** The operator replayed the actual exam (תיבה ABCDA′B′C′D′, the face plane `x+4y-8z-142=0`, `B(0,7,6)`, then the AB line equation) and hit two independent defects plus a phrasing gap:
1. **A line equation on an EXISTING point must DRIVE the free figure, not verify-and-refuse.** A is a box vertex; the figure is under-determined (only the face plane + B pinned), so `not-on-line` for A was the M1 failure ADR-3D-030 fixed for planes — the statement is a GIVEN that should flex the free gauge/dims until A rides the line. Root fix with **zero new solver code**: *a point on a line is a point on TWO planes through it* — the `on-line` existing-point branch (numeric parametric line, solid-bearing figure) pushes two `planePins` entries (unit normals e1,e2 ⟂ dir, d = −n·anchor), and the whole ADR-3D-030 machinery (normal-solve exclusion, unmet check, failure-path retry, Stage-A placement, degeneracy filter, store pin-ownership, dataView frame) absorbs them; the `onLines` record stays the final arbiter. Symbolic-component lines and coord-lane figures (2024-Q2 ד) keep the verify-only path byte-identical. **The full exam chain now reproduces:** the line given drives A onto the line; `אורך המקצוע AB הוא 5√5` + `שיעור ה-y של הקודקוד A הוא שלילי` land **A = (0,−3,1)** — the book's part-ב answer.
2. **Canvas MATH labels were bidi-mangled** — `B(0, 7, 6)` rendered `(6 ,7 ,0)` (and B′'s minus sign side-flipped) because the coordinate string inherits the document's RTL base direction; the value was right, the TEXT was visually reordered. Fix at the render seam: `Figure3` wraps every math string (coordinate labels, the line-equation echo) in LRI…PDI isolates (`ltr()`); locked by a static-render test asserting the U+2066 wrapper.
3. **Phrasings** (the ADR-3D-026 class, all locked): `משוואת AB היא …` (no `ישר` — the operator's exact keystrokes, previously an LLM detour), the copula on the wordy length lhs (`אורך המקצוע AB הוא 5√5`), and `של הקודקוד A` in the sign given (the exam wording).

**Locked by** the two `ADR-3D-031 Am.` scenarios in `named-parametric-line.test.ts` (the operator's exact 5-step sequence; the exam part-ב chain to (0,−3,1)) + the bidi render test. **532 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-032 — derived plane equations in the data panel + `M(k,1,3)` (a symbolic point coordinate) (2026-07-09)

**Context.** The operator's continued dev replay of the תיבה exam: (1) "`מישור ABB'A'` draws correctly but I'd expect the equations on the side panel (parametric and standard)" — part ג asks *מצאו את משוואת המישור ABB'A'*; (2) "trying to add `M(k,1,3)` fails — do we support this?" — it was the V4 lane boundary's honest `symbolic-new-point` refusal, but part ד's flow (M with one unknown coordinate, `k הוא פרמטר חיובי`, the 60° angle given pins k) is a **1-DOF numeric root-find** — inside the committed D3 boundary (the V8-c precedent), so the answer should be yes.

**Decision A — a named plane's FORCED equation is derived knowledge (the ADR-3D-030 Am. 2 gate, plane edition).** `dataView` gains `planes`: for every point-run / rel-plane, the resolved plane is canonicalized (unit normal, lead coefficient positive) per sampled seed and prints ONLY when identical across all of them — the standard form integerized to the book shape (`ABB'A': 20x - y + 2z - 5 = 0`, smallest integer scaling with a 2-decimal unit-form fallback) plus a parametric form `x = P₀ + t·u + s·v` when the run's anchor and spanning edges are themselves stable. An under-determined plane prints NOTHING (a sample is not knowledge). App3 renders the rows in the existing LTR list; no engine change.

**Decision B — `M(k,1,3)` is a `coord-sym` point; a given referencing it pins the figure parameter post-pivot.**
- **Parser:** `coordPoint` keeps each symbolic component's LETTER (`syms`); the exam's appositive sign clause (`נתונה נקודה M(k,1,3), k הוא פרמטר חיובי`) and the standalone `k הוא פרמטר חיובי` / `k is a positive parameter` lower to a new `param-sign` command; `angleSegClaim` widens to the exam wording (`גודל הזווית שבין הישר AB ובין הישר AM הוא 60` — optional גודל/ש-prefix/הישר, `ובין`).
- **Apply (M1 split preserved):** an EXISTING id keeps the V4 partial-pin semantics (letters = unconstrained, byte-identical); a NEW id whose symbolic components carry ONE distinct letter becomes `{kind:'coord-sym'}` (LinExpr components) and the letter becomes the figure's single parameter (`two-params` guard); distinct letters stay the honest refusal. A recorded angle/length claim referencing a coord-sym point routes to **`paramGivens`** (never the pivot's scalarPins — M rides a provisional k there and would poison the solve) and is still recorded as a claim (the final arbiter). `param-sign` on an undefined symbol refuses `unknown-symbol`.
- **Evaluate:** coord-sym points place like coord points at the (provisional) parameter value; a **post-pivot 1-DOF root-find** (sign-change + touch-zero over the final pivot-placed positions, cross-filtered, the ADR-3D-006 roots-=-branches semantics) pins k when paramGivens exist — `paramSigns` select the branch, otherwise the seed cycles; no root = `no-roots` keep-prior (the store also exempts a param-pinning length claim from the `size-on-solid` gate). An UNPINNED k stays a sampled free DOF whose sample honours a stated sign (never flags), counted in the DOF cue.

**Gate:** the exam chain end-to-end — BASE (ADR-3D-031 Am.) + `נתונה נקודה M(k,1,3), k הוא פרמטר חיובי` + the 60° given → **k = 2√15** (the book's part-ד answer, "leave a root"), M = (2√15, 1, 3), both ± roots found and the sign given selecting; the panel prints part ג's equation. Honest refusals locked (unknown-symbol, no-roots keep-prior; an under-determined plane prints nothing).

**Locked by** `adr-3d-032.test.ts` (parse, panel, free-k sampling, the k = 2√15 pin, refusals); catalog +1 (`M(k,1,3)` with the sign clause). **541 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**Am. (same session, operator: "when I entered `הזוית בין AB ו AM היא 60` I'm not sure the tool actually did that; I would like to see the angle in the canvas").** Two members: (1) **the utterance didn't parse deterministically** — the common single-vav spelling `זוית` and the bare `ו` connector weren't in the grammar (it either escalated to the LLM or half-failed, hence the uncertainty); the spelling class is fixed across EVERY angle rule in parse3 (`זו?וית` — angle-seg, line↔plane, plane↔plane, vertex form, cos forms, bisector) and `angleSegClaim` gains the `ו` connector. (2) **a STATED vertex angle now draws on the canvas** — `scene3` extends the plane-angle `wAngles` stream with an arc + value at the shared vertex for every stated angle given (vangle scalar pins + recorded shared-apex `angle-seg-eq` claims, which includes the ADR-3D-032 paramGivens; deduped by vertex/rays/value; radius scaled to the shorter ray) — the 2-D tool's stated-angle rule (FR-RN-7): marked only because the student said it. The operator's exact keystrokes are locked in `adr-3d-032.test.ts` (parse + a `buildScene3` assertion that the 60° arc renders). **542 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**Am. 2 (same session, operator: "in a separate input I tried to say that k is positive but it failed with verbal input and with k>0").** The `param-sign` rule demanded the full exam phrase (`… פרמטר חיובי`) — the natural separate-input forms failed. The family widens (rule + the coordPoint appositive tail together): bare `k חיובי`, copula `k הוא חיובי`, the inequality `k>0`/`k > 0`/`k < 0`, En `k is positive` — all lowering to the same `param-sign`; a letter that isn't the figure's parameter still refuses `unknown-symbol` at apply. Locked in `adr-3d-032.test.ts` (all forms + the operator's separate-input flow `M(k,1,3)` then `k>0`). **542 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-033 — a MEMBERSHIP statement about an existing point DRIVES the figure (2026-07-10)

**Context.** Operator, prod session `n6lmx1rj` (the ADR-3D-032 exam box, top face pinned to `x+4y-8z-142=0`, B=(0,7,6), A pinned by the AB line + `|AB|=5√5` + the y-sign, M(k,1,3) with k pinned to 2√15 by the 60° angle): the final exam given **`M על מישור DCC'D'` was refused `not-on-plane`** — "since that plane is not fixed, there is no reason that it will not be possible… the engine seems to think I asked *if* it's on a plane and not to *fit the diagram to match input* (the whole idea of the tool)." Geometrically the operator is exactly right: face DCC'D' contains the AB and AA' directions, so its normal is fixed and its offset is LINEAR in the box's one remaining free dim (the depth) — exactly one depth satisfies the statement (|AD| = 40√3/9 ≈ 7.698).

**Class (§1).** A **membership statement** about an **existing point and a figure-dependent carrier** (a plane named by figure points) is **verified against the sampled figure instead of lowered to a given that drives the free DOFs** — the M1 family. The numeric-carrier members were already closed (ADR-3D-030 plane equations as claims; ADR-3D-031 Am. numeric parametric lines → two `planePins`); the figure-dependent-carrier members were the live class, `on-planes` first among them (ADR-3D-015 had declared "an EXISTING point is a verified given" before the drive machinery existed).

**Decision — memberships join the pivot's drive machinery as a stage-4 failure-path re-solve:**
- **`MemberPin`** (`solve3.ts`): `{id, frozen?, plane? | run?}` — a membership residual the pivot can drive. A **run carrier** (point-run plane) is re-derived from the CANDIDATE positions each evaluation (Newell over the run's gauge-transformed points — the face plane rides the free dims), and its residual is **normalized by the run's own extent, making it similarity-invariant**: collapsing the solid (scale OR a dim) can never zero it "for free" (the ADR-3D-030 collapse-basin class; a cube's `A on BC'D` stays a hard refusal because dist/extent is dim-invariant). A **fixed numeric equation plane** keeps the raw planePins scale. A member that does not ride the gauge (typed coords / a **coord-sym point at its PINNED parameter value**) is passed **frozen**, so the drive never reads a provisional symbol placement (the ADR-3D-030 poison); membership pins ride the full planeDrive guard set (anchor, degenerate filter, primary-residual acceptance, Stage A).
- **Stage 4 in `resolve3`** (after the V8-c retry and the ADR-3D-030 plane drive): the side-less, non-`'any'` memberships whose carrier resolves are checked on the final figure — **only when one is UNMET** does the re-solve run (a figure whose memberships hold is bit-identical; `'any'` keeps its chooseParam branch-selection semantics; a side statement stays an inequality). The parameter root-find and late-plane resolution were hoisted into idempotent closures (`pinParam`/`resolveLatePlanes`) so the stage runs after k is pinned and re-pins it after moving the figure.
- **Warm-started + validated + transactional (M2):** the re-solve starts from the pinned figure's own solution vector (`PivotResult.x`, threaded back as `warmStart`) so the drive PERTURBS the existing basin — branch choices preserved, minimal movement (without it, seed-0's rotation starts landed only a wrong-line-branch basin). Every returned candidate is validated on FINAL positions (memberships hold + sign givens keep + the param root-find survives) and the first fully-good one wins; if none survives, the pre-drive positions/param/pivot are restored exactly and the store's verify pass refuses honestly — a drive can never break a sibling given (`submit` gates only the NEW fact's status, so the engine itself must guarantee this).
- **`memberHolds3`** (exported, `evaluate.ts`) is the ONE membership predicate — shared by the stage-4 unmet trigger and the store's verify pass, so no drive/verify tolerance gap exists. Tolerance moved from `1e-7` absolute to `1e-4·max(1,|p|)` normalized distance — the LM + regulariser equilibrium floor (~1e-5·scale) sits under it; a genuinely off-plane statement is off by whole units.

**Sibling audit (§6).** Closed with the mechanism: the numeric equation-plane membership (`A' על המישור π1` on a free box now drives placement — same stage, `plane` carrier). Excluded by semantics: `'any'` (branch selection), side statements (inequalities — sampled + verified), symbolic-param equation planes (membership SELECTS the branch, chooseParam). Filed: rel-plane carriers (same mechanism, carrier resolution not yet passed through `MemberPin`); an existing point stated onto a THROUGH/pair-named line (unreachable today — the rules still hard-code `ℓ`, the ADR-3D-028 multi-line deferral; the numeric-ℓ case was closed by ADR-3D-031 Am.); `point-on-circle3` on an existing point (2 residuals, extendable the same way).

**Perf (§7).** The drive adds ONE warm-started `solvePivot` per replay, only while a membership is unmet at the sampled dims (steady state for a driven figure): the exam figure's full replay measured 2.9 s → 4.6 s; the warm start makes the first candidate the accepted one at every seed tried. The failure path (impossible membership) costs the same one extra solve, then keeps the prior figure.

**Semantics on the operator's case:** the full session now builds end-to-end — the membership drives the depth to |AD| = 40√3/9 with k = 2√15, A = (0,−3,1), the top face still exactly on its plane, and "show another configuration" keeps M on the face at every seed (a requirement, not a sample). `B על מישור DCC'D'` (satisfiable only by a collapsed box) still refuses `not-on-plane`, and the cube's rigid `A על המישור BC'D` refusal is byte-identical.

**Locked by** `member-drive.test.ts` — the operator's exact sequence (+ the closed-form depth), resample-holds, entry-order permutation (membership typed BEFORE the pinning givens), the no-param coord-point class member, the equation-plane class member, the degenerate-only refusal, the rigid-cube refusal, and the transactional sibling-given guard. **550 src3d tests green, `tsc -b` + `vite build:3d` clean.**

---

## ADR-3D-034 — V8-j: a point positioned so a DERIVED solid becomes a right pyramid (2026-07-10)

**Context (G12) — the LAST legacy-572 slice (V8 complete).** 2019-קיץ-ב Q2: `T נמצאת על הקטע SC כך ש-TABCD היא פירמידה ישרה` (T on SC so TABCD is right); 2019-חורף Q2: `K על EC כך ש-KOBCD פירמידה ישרה`. A point on a segment positioned so the derived pyramid (base = the other 4 vertices, apex = the point) is a RIGHT pyramid — apex directly above the base centre.

**Decision — a driven on-segment point with a CLOSED-FORM t (no CAS, the ADR-3D bisector/span pattern).** A new `right-pyramid-apex` PointDef `{a, b, base}`: the point on segment a–b whose **in-plane offset from the base centroid is 0** (the apex sits directly above the centre). Resolved in the point loop: `centroid = mean(base)`, `n̂ = newellNormal(base)`, `inplane(v) = v − (v·n̂)n̂`; along `P(t) = a + t(b−a)` the offset `o(t) = inplane(a−centroid) + t·inplane(b−a)` is affine → minimise `|o(t)|²` closed-form `t* = −(a₀·d₀)/(d₀·d₀)`, and **place only if the residual ≈ 0** (else the segment never projects through the centroid → the point is left unplaced and the store reports `no-solution`, honest — no fake right pyramid). Added to `GAUGE_KINDS`; apply draws the pyramid's lateral edges + base ring.

Parser `rightPyramidPoint` (He + En; the apex = the on-segment point wherever it sits in the 5-letter name, base = the other 4 — so `TABCD`/`KOBCD` apex-first and an apex-last name both read; runs BEFORE `rightPyramid` so `TABCD … פירמידה ישרה` isn't built as a pyramid solid).

**Locked by** `v8j-right-pyramid.test.ts` (parse He+En incl. `KOBCD`; a square base with S above A → T lands at (2,2,3) directly above O=(2,2,0), TABCD right; an apex off to the side → honest `no-solution` kept-prior). Catalog +1. **555 src3d tests green, `tsc -b` + `vite build:3d` clean.**

**V8 (full legacy-572 coverage) is COMPLETE** — every 2009–2024 exam's space/vectors INPUT is now expressible (documented deferrals: the exact parametric ℓ/ℓ' forms of V8-h/V8-i wait on the multi-line-naming rework; oblique parallelepiped + orthoscheme + the dihedral face↔base angle remain low-frequency coord-expressible items).

---

## ADR-3D-035 — a stated ⟂ between two SEGMENTS / named VECTORS (2026-07-10, issue #14)

**Context — prod report (operator session `4wmcbqbl`, 2026-07-10): "it doesn't understand 2 perpendicular vectors."** On `פירמידה שבסיסה מקבילית` + `SA גובה` + `M אמצע אלכסון BD` (+ `AB=u`, `AD=v`, `AS=w`, `SM` — all ✓), **`SM ⊥ DB` and `SM⊥DB` escalated to the LLM and returned not-understood**. Sibling in session `tgsnh4do` (2026-07-09, cube): `MO ⊥ABCD` / `MO⊥ABCD` — the symbol-form seg⟂**plane** — also not-understood (`perpPlaneClaim` required the word `מישור`/`plane` before the point run). The parser had seg⟂plane, line⟂plane, the common perpendicular, ⟂-feet, and rel-planes — but **no statement form for ⟂ between two segments or named vectors**, although the exact lowering already existed end-to-end.

**Decision — lower to the V8-f `cos-angle` with `cos = 0`; NO new engine construct (the ADR-3D-024/026 fold-onto-existing pattern).** A new parser rule `perpSegGiven`: symbol (`SM ⊥ DB`, `SM⊥DB`, `u ⊥ v`), word (`SM מאונך/ניצב/אנך ל-DB`, `SM is perpendicular to DB`, optional קטע/מקצוע/ישר/וקטור nouns), and plural (`SM ו-DB מאונכים זה לזה`, `הוקטורים u ו-v מאונכים`, `SM and DB are perpendicular`) forms; each operand is a point PAIR or a lowercase named vector (mixed `AB ⊥ w` included; a LONE uppercase letter is a point, never a vector name — `A ⊥ B` stays refused, no half-read). `cos-angle` is already M1 at apply (ADR-3D-023): on a free-dim solid it is a **driving similarity-invariant scalar pin** — the operator's figure flexes its parallelogram base into the forced rhombus (|AB| = |AD|, SM·DB = 0 at every seed) — and on a determined figure a **verified claim** (a false ⟂ refuses keep-prior); both operands auto-draw.

- **`perpPlaneClaim` widened (the sibling):** the plane keyword is now OPTIONAL for a 3–4-point target run (`MO ⊥ABCD`) — unambiguous because a segment is exactly 2 points, a run of ≥3 can only be a plane; word/base-sentinel forms byte-unchanged. `perpSegGiven` runs AFTER it and requires exactly-2-point (or named-vector) operands, so the two are disjoint. In the prod session O was never defined, so the honest outcome there is now `unknown-point O` (was not-understood) — the student learns to define O, and with `O מפגש האלכסונים` the cube claim verifies.
- **Recorded trap (Hebrew final forms):** the rule's keyword gate `/מאונך/` (final ך) silently rejected the plural `מאונכים` (REGULAR כ) before the regex ever ran — the gate is now `מאונ[ךכ]` (the same class `commonPerp` already guarded with `מאונ[כך]`). Keyword gates over Hebrew stems must always admit both kaf forms.

**Locked by** `perp-seg.test.ts` — the exact prod sequences (the pyramid figure with the drive asserted at 3 seeds + the |AB|=|AD| closed form; the cube sibling both without O — honest `unknown-point` — and with O defined — verifies), all parse forms He+En, verify-true/verify-false-keep-prior on a determined figure, and no-theft regressions for the existing ⟂ rules. Catalog +2 (`SM מאונך ל-DB`, `u ⊥ v`). **568 src3d tests green; full suite 3601 green, `tsc -b` + `vite build:3d` clean.**

## ADR-3D-036 — User-named save files with the automatic -vectors suffix (issue #20; the 2-D twin is ADR-274)

**Status:** Accepted (2026-07-11). *Files: `src3d/store/figureFile3.ts`, `src3d/App3.tsx`, `src3d/i18n/locales/*.json`.*

**Decision.** On Save, the app prompts for a file name (bilingual `actions.saveNamePrompt`); `namedFigureFileName3` sanitizes illegal filename characters, strips a typed extension, appends `-vectors` unless already present (`2026summer` → `2026summer-vectors.json`), and falls back to the date-stamped `figure-3d-YYYY-MM-DD.geo3.json` default for an empty/cancelled input. `SAVE_SUFFIX_3D = 'vectors'` is this product's copy of the per-product constant (docs/22 §9 registry — never imported across `src/` ↔ `src3d/`). Load stays content-based (`app` marker + `schemaVersion`), so old `.geo3.json` files keep loading; the `fixtures3/` net is untouched. Locked by the name-builder tests in `figure-file3.test.ts`.

## ADR-3D-037 — A persistent figure NAME (issue #42, the 2-D ADR-286 twin, COPIED per docs/20 §12)

**Status:** Accepted (2026-07-11; issue #42). *Files: `src3d/store/store3.ts` (`figureName`/`setFigureName` — outside the undo slice, reset by `clear`), `src3d/store/figureFile3.ts` (`figureNameFromFileName3` — the `namedFigureFileName3` inverse dropping `.json`/`.geo3` + the `-vectors` suffix; a provenance-only `name` field in the file), `src3d/App3.tsx` (header inline-editable title input `dir="auto"`; save uses the set name — no prompt — and adopts a prompted one; load names the figure from the FILENAME per the operator ruling), locales `actions.namePlaceholder`.*

Same decision shape as [ADR-286](06-decisions.md#adr-286) — one control is both the field and the visible title; the filename wins on load; the embedded `name` is never read back. No docx leg (the 3-D app has no question export). Locked by `figure-name3.test.ts`.

## ADR-3D-038 — Multi-line NAMING: digit-indexed ℓ1/ℓ2 + named-line operands (issue #69, the V8-h enabler)

**Status:** Accepted (2026-07-11; issue #69). *Files: `src3d/parser/parse3.ts` (the widened `LINE_NAME` token + `canonicalLine`, the ~10-rule sweep, named-line operands in `commonPerp`/`lineProjection`), `src3d/parser/catalog3.ts` (+2), `src3d/__tests__/multi-line.test.ts`.*

**Context.** The one substantive remaining 572-coverage item (deferred at [ADR-3D-028](#adr-3d-028): "the single-`ℓ` model can't hold two named parametric lines"): 2010-Q3 gives TWO typed parametric lines and asks about their common perpendicular `d ⊥ ℓ ∧ d ⊥ ℓ'`.

**Diagnosis (the scoping session's finding).** The "single-ℓ model" was a PARSER artifact, not an engine one. `Construction3.lines: Map<string, Line3Def>` is name-keyed end-to-end — `apply` guards `already-defined`/`unknown-line` per name, `evaluate` resolves parametric/plane-plane/common-perp/projection lines by name in its multi-pass sweep, and `scene3` iterates + equation-echoes ALL resolved lines — pair-named lines (AB, CD) already coexisted ([ADR-3D-031](#adr-3d-031)). The parser was the whole gap: `LINE_NAME = /[ℓl]/` (single char — a second line was un-nameable), and ~10 rules CAPTURED the name but emitted `line: 'ℓ'` hardcoded (`coordPoint`'s on-line tail, `circleTangentLine`, `intersectionLine`, `dropPerpToLine`, `parametricLine`'s canonicalization, `linePerpPlane`, `lineCutsPlane`, `neverParallelClaim`, `onLineMembership`, `pointPlanesLine`).

**Decision (operator ruling: digit-indexed, NO primes).**
1. **Token:** `LINE_NAME = /[ℓl][\d₀-₉]*/` — ℓ/l + an optional digit index (`ℓ1`, typed `l2`, subscript `ℓ₂`), canonicalized by `canonicalLine()` to `ℓ<digits>`. Prime forms (`ℓ'`) are NOT in the vocabulary (operator ruling 2026-07-11); bare `ℓ`/`l` stays canonical `ℓ` (the whole existing corpus). Deliberately NOT arbitrary lowercase letters — they collide with symbolic parameters (`m`,`t`,`k`) and named vectors (`u`,`v`,`w`); derived-line names (`d`) stay rule-local as before. The recorded trap holds: ℓ is not `\w` — explicit lookaheads, never `\b`.
2. **Sweep:** every consuming rule binds its MATCHED canonical name.
3. **Named-line operands:** `commonPerp` + `lineProjection` operands are now `(point-pair | LINE_NAME)` — a pair creates its through-line as before, a name references an existing line (`unknown-line` refusal otherwise). The 2010-Q3 form `הישר d מאונך לישר ℓ1 ולישר ℓ2` / `d is the common perpendicular of ℓ1 and ℓ2` parses and resolves closed-form.
4. **No bare-reference policy needed:** every line reference in the grammar is EXPLICIT (a name-less `הישר` matches no rule and escalates) — so no ambiguity seam exists to guard; nothing silently defaults to ℓ anymore.
5. **Boundaries locked, not changed:** a second line carrying a DIFFERENT symbol letter still refuses `two-params` (the docs/20 D3 single-parameter boundary — the existing apply guard, now locked across two lines); a duplicate line name refuses `already-defined` keep-prior.

**Gate.** `multi-line.test.ts` (10): the 2010-Q3-shaped figure — two typed parametric lines + common perpendicular d, ⟂ both and anchored at the closest-points foot, He+En; name-binding proofs (a rider lands ON ℓ2 not ℓ1; a foot lands ON ℓ1; line∩plane crosses via ℓ2 while the parallel ℓ1 honestly refuses); projection of a named line; the two-params + already-defined refusals; V8-h pair-form regressions byte-equivalent. *The verbatim 2010-Q3 exam text is not in the repo — the gate reproduces its documented shape (docs/21 G8); replaying the exact wording when the operator supplies it is a follow-up.*

## ADR-3D-039 — The #72 phrasing batch: connect-imperative, diagonal noun, ink arrow, the אורך disambiguator, ⟂-to-the-base (baseline log-triage)

**Status:** Accepted (2026-07-11; issue #72 — five context-verified prod gaps, operator-approved batch). *Files: `src3d/parser/parse3.ts` (`bareSegment` prefixes, `drawArrow`, `perpToBase`, `lengthRel` bare-pair RHS), `src3d/engine/types.ts` (+`arrows`, +2 commands), `src3d/engine/apply.ts` (`draw-arrow`, `perp-to-base`), `src3d/render/scene3.ts` + `Figure3.tsx` (unnamed-arrow overlay), `catalog3.ts` (+5), `issue72-phrasing.test.ts`.*

1. **`נחבר את D'F` / `אלכסון BD'`** — the connect-imperative and the diagonal noun join `bareSegment`'s prefix set (a diagonal IS a segment — pure ink, no construct; the final-ם slip `אלכסום` admitted per the ADR-3D-035 `מאונ[כך]` precedent).
2. **`חץ A'C`** — a new `draw-arrow` command records an UNNAMED ink arrow in `Construction3.arrows` (a sibling of `segments`, rendered on the ADR-3D-003 vector overlay with the label suppressed) — it never joins the declared basis, so `need-basis` counting is untouched. The vector WORD (`וקטור AB`) deliberately keeps its established normalize3-stripped segment reading.
3. **`אורך AB=BC`** — a bare-pair RHS is accepted in `lengthRel` ONLY behind the explicit length marker (the marker disambiguates the whole utterance); bare `AB=BC` stays the honest `ambiguous-vector-length` clarification — which used to be unanswerable in this compact form.
4. **`אנך יורד מMלבסיס`** (the prod form, fully glued) — a new `perp-to-base {from}` command: apply resolves the base by the seg-plane-rel sentinel rule (single solid, ids first ring), MINTS the first unused label for the foot (parse3 is context-free — the mint must live at apply, deterministic per prefix), and delegates to the V8-e `height-to-face` foot machinery. No solid → honest `unknown-plane: base` refusal.

Locked by `issue72-phrasing.test.ts` (exact prod utterances, parse + build: the box drive, the pyramid foot ⟂-on-base, the no-solid refusal, the basis-untouched arrow).
## ADR-3D-040 — The 3-D guidance register: non-constructive input answers with "what to do instead" (issue #73, the 2-D ADR-289 twin)

**Status:** Accepted (2026-07-11; issue #73 — baseline log-triage, operator-approved). *Files: `src3d/parser/scope3.ts` (COPIED pattern per docs/20 §12 — never shared), `src3d/App3.tsx` (guidance short-circuit BEFORE the LLM escalation + a sky-toned note distinct from the amber error), `src3d/i18n/locales` (`scope.<category>`), `src3d/__tests__/scope3.test.ts`.*

Families, each from verbatim prod utterances: **`valueless-query`** («הזווית בין הישר AC' לבין המישור ABCD», «∠DEF=?», «מצא את הזווית» — the ADR-3D-027 reproduce-verify charter made student-facing: state the value and it is enforced/verified); **`cross-app`** (bare «מעגל»/«מלבן»/«מעוין»/«חסום במעגל» → the 2-D Geo Builder; the message also shows the SUPPORTED in-space circle form); **`bare-solid`** (bare «פירמידה»/«מנסרה» — the deliberate ADR-3D-008 refusal upgraded to say WHAT to add); **`ui-command`** («סימון זווית ישרה D» → state the given «זווית D = 90»).

Analytics: `source:'scope'`, `result:'scope:<category>'` — the PROFILE_3D dashboard already classifies reasoned refusals separately, so guidance events never inflate the real-gap count. **No-theft locked:** every supported catalog3 example (both locales) classifies null; the valued angle forms stay null (they parse).

## ADR-3D-041 — A radical coefficient in a vec-rel; a coefficient bare-pair RHS in lengthRel (issue #55)

**Status:** Accepted (2026-07-14; issue #55). *Files: `src3d/parser/parse3.ts` (`parseCoeff`, `SYM_TERM`, `lengthRel`'s bare-pair tail); `src3d/__tests__/issue72-phrasing.test.ts`.*

**Class.** A radical scalar (`√2`) was unreadable in the pair=pair coefficient position, in two adjacent rules of the length/vector family. `AB=√2·OD` fell to not-handled → the LLM, and `|AB| = √2·OD` (a pipes-marked length statement) rejected its bare-pair RHS.

**Diagnosis correction (the filed plan was mis-scoped).** Issue #55's gap (a) proposed routing `AB=√2·OD` to the `ambiguous-vector-length` clarification. That is **wrong**: a bare pair = **coefficient**·pair is already the NEUTRAL vector lane (ADR-3D-010's `vec-rel`, "apply decides claim-vs-definition") — `A'K = 4/5 DN` parses as a vec-rel today, and widening the ambiguity guard to the coefficient form regresses it (proven: the guard broke 12 tests across V7-T1, the 2018/2026 exam gates, and dataView). `AB=√2·OD` was not-handled only because the vec-rel coefficient parser (`SYM_TERM` + `parseCoeff`) reads `4/5` but not the radical `√2`. Only the BARE c=1 pair=pair (`AS = AB`) stays the length-vs-vector ambiguity — a coefficient already commits to the vector reading (pipes force length, gap (b)).

**Fix (parser-only, src3d — pattern copied, no `src/` import; ADR-266).** (a) `parseCoeff` gains a radical branch (delegates to the existing `evalRadical`) and `SYM_TERM`'s coefficient token admits `√<n>`, so `AB=√2·OD` lowers to `vec-rel` exactly like `A'K = 4/5 DN` — deterministic, no LLM, no new ambiguity. (b) `lengthRel`'s bare-pair RHS (the #72 marker-disambiguated case) now routes through the shared `tail(P)` helper, so a LENGTH-marked LHS accepts a bare pair with OR without a coefficient (`|AB| = √2 OD` → c=√2, `|AB| = OD` → c=1). No-theft holds: an arrowed `AB⃗ = 2·OD⃗` stays a vector claim, bare `AS = AB` keeps the clarification, `|w| = 2` / `|EN| = (√6/4)·|w|` / `AS = 12` are byte-unchanged. Locked by `issue72-phrasing.test.ts` (both gaps + the no-theft matrix); full 3-D slice + `build:3d` green.

## ADR-3D-042 — The 3-D "right triangle" qualifier (issue #116, the 2-D ADR-163/164 twin)

**Status:** Accepted (2026-07-14; issue #116; operator ruling: default = MIDDLE vertex, yields to explicit; secondary bare-מנסרה / quad-right-prism out of scope). *Files: `src3d/parser/parse3.ts` (`rightTriangle` rule); `src3d/engine/apply.ts` (polygon `solid` M1 idempotency); `src3d/engine/types.ts` (`cos-angle.soft`); `src3d/store/store3.ts` (`derive3` soft-default pre-scan); `src3d/parser/catalog3.ts`; `src3d/__tests__/scenarios3.test.ts`.*

**Class.** The 3-D parser had NO handling for the "right triangle" shape qualifier (`ישר זווית` / `right(-angled) triangle`) — the counterpart of the 2-D ADR-163/164 class. `AOB משולש ישר זוית` on an existing prism base built a fresh `polygon3` → `already-defined` (the stated right angle lost); a fresh `משולש ABC ישר זווית` built a plain triangle with NO right angle (a stated relation silently dropped — §6 honesty). Two failure modes, one gap.

**Fix (parser + M1 apply, no new engine construct — src3d only, ADR-266).** A `rightTriangle` rule (before `planarPolygon`) recognizes the qualifier (both `זוית`/`זווית`, He+En) and emits `polygon3` + a right angle at the **middle-named vertex** as a SOFT default, lowered to the existing V7-T3 `cos-angle` (cos = 0) — M1 at apply: DRIVES a free-dim solid (the prism base flexes so ∠AOB = 90) or VERIFIES a determined figure. Two mechanisms carry the M1/M4 semantics: (1) a polygon `solid` whose ids ALL already exist is IDEMPOTENT (references them, no `already-defined`) — a statement about existing points, not a re-creation, so the constraint lands on the prism base; (2) the soft default YIELDS — `derive3` pre-scans for an explicit ∠=90 (a non-soft `cos-angle:0` or an `angle-seg-eq` deg 90) on the SAME three vertices and drops the soft `cos-angle` (M4 defaults-yield, ADR-052) so `∠OAB = 90` moves the right angle to A instead of over-constraining two right angles onto one triangle. Middle vertex is the operator's ruling (often the natural apex/origin). Locked by `scenarios3.test.ts` (the exact prod sequence: prism → right-triangle base, ∠ at O = 90, no already-defined; the explicit-override; fresh He+En triangles). Out of scope (operator): bare oblique `מנסרה` stays the deliberate ADR-052 refusal; a generic 8-vertex quad right prism is a separate feature if wanted.

## ADR-3D-043 — A named angle is a highlightable MARKER, not a valueless-query refusal (issue #94)

**Status:** Accepted (2026-07-14; issue #94, prod session `23mxaquw`; feature PR). *Files: `src3d/engine/types.ts` (`AngleMark3Command` + `Construction3.angleMarks`); `src3d/engine/apply.ts`; `src3d/parser/parse3.ts` (`angleMarker`); `src3d/parser/scope3.ts`; `src3d/render/scene3.ts`; `src3d/engine/dataView.ts`; `src3d/parser/catalog3.ts`; `src3d/__tests__/angle-marker.test.ts` + scenario in `scenarios3.test.ts`.*

**Class (route, don't refuse).** On a right square pyramid `ABCDS` the student typed `∠SDB` (×3) and `∠SDB=α` trying to SEE/NAME the angle; `scope3` classified the bare `∠XYZ` as a `valueless-query` and the tool did nothing. Naming an angle is a pedagogy/visualization act — it should draw the angle, never refuse. The machinery already existed (`scene3.wAngles` draws stated angles; `dataView` derives seed-invariant values); the fix routes a valueless named-angle to it.

**Fix.** A new `angle-mark` command — a pure MARKER: it draws the arc at the middle vertex (+ its two arms) and consumes NO DOF, drives nothing, verifies nothing. `apply` records it in `Construction3.angleMarks` (idempotent per wedge; a later `∠SDB=α` UPGRADES an existing bare marker's display label). Parser: `angleMarker` lowers bare `∠XYZ` → a marker and `∠XYZ = <letter>` → a marker labelled with the letter (α); a NUMERIC RHS stays the driving `vertexAngleClaim` (runs first), a `?`/bare-`=` stays a scope question. `scope3`'s valueless-query pattern now matches only the genuine question forms (`∠DEF?`/`∠DEF=`/`∠DEF=?`), letting `∠DEF` and `∠DEF=α` build. Rendering: `scene3` draws the marker's arc carrying the display label (α) — but NEVER a single-seed numeric value (the ADR-3D-030 knowledge rule). The measure is a `dataView` derivation, printed (`∠SDB = 35.26°` / `α = 35.26°`) ONLY when it agrees across all sampled seeds (a determined figure — the same gate as `|u|=|v|`); an under-determined figure draws the arc with no value. **Decisions settled (the issue's open questions):** the marker is a real undoable fact (the student typed it, expects it in the figure + export); the `α` on `∠XYZ=α` is a pure DISPLAY name, never a driving parameter (safe — `∠XYZ=α` previously just escalated, so no conflict with the ADR-3D-032 parameter-α path). Locked by `angle-marker.test.ts` (routing, determined cube → value, under-determined pyramid → arc-only) + the `23mxaquw` scenario.
## ADR-3D-044 — Right prisms over more bases + the parallelepiped (issue #117)

**Status:** Accepted (2026-07-14; issue #117, operator request; feature PR). *Files: `src3d/engine/types.ts` (6 new `SolidKind`s); `src3d/engine/apply.ts` (`prismBaseN`/`prismRing` generic topology, VERTEX_COUNT/DIM_COUNT); `src3d/engine/evaluate.ts` (`solidDims`/`solidPositions`); `src3d/parser/parse3.ts` (`rightPrism` dispatcher + `parallelepiped`); `src3d/parser/catalog3.ts`; `src3d/__tests__/prism-bases.test.ts` + scenarios.*

**Class.** `מנסרה ישרה` supported only triangular / equilateral-triangle / rhombus bases (+ rectangle as `תיבה`); the operator asked for parallelogram / general-quad / square / regular-n-gon bases and the oblique `מקבילון` (parallelepiped), which bagrut uses. All slot into the existing dims-sampler + pivot with **no new solver code** — a prism is a base polygon translated straight up (a right prism) or by a free lateral vector (the parallelepiped).

**Fix.** Six new fixed-vertex `SolidKind`s: `prism4` (parallelogram base, dims `[dx,dy,h]`), `prism4g` (general quad, `[cx,cy,dx,dy,h]`), `prism4sq` (square, `[h]`), `prismReg5`/`prismReg6` (regular pentagon/hexagon on a unit circumcircle, `[h]`), and `parallelepiped` (parallelogram base + a FREE lateral vector w, `[dx,dy,wx,wy,wz]`). Topology is a single generic helper `prismRing(n)` (base ring + top ring + n verticals; n rectangular lateral faces) keyed by `prismBaseN(kind)`, so `edgeIndices`/`faceIndices` need no per-kind cases. The parser's `rightPrism` becomes a **base-noun dispatcher** (He+En; rhombus stays with `rhombusPrism`, rectangle routes to the existing `box`); a bare `מנסרה ישרה` with no base noun and no labels keeps the honest ADR-052 refusal. `מקבילון`/`parallelepiped` is a first-class rule — allowed despite being oblique because it is a NAMED oblique solid carrying its own free DOF (it asserts no unstated "right" given, unlike bare `מנסרה`). **Scope (documented):** regular prisms are pentagon+hexagon (fixed kinds fit the per-kind-Record architecture); arbitrary-n regular prisms (n≥7 / odd n) would need threading the base count through `solidDims`/`solidPositions` — a follow-up if the curriculum needs it. Locked by `prism-bases.test.ts` (dispatch He/En; square base = unit square with a right corner; parallelogram base's opposite edges parallel; parallelepiped's verticals are ONE shared vector; triangle/rhombus regressions intact) + scenarios (build-clean + DOF cue per base; a size given on a parallelepiped edge verifies).

## ADR-3D-045 — Lowercase point labels in LABEL POSITION parse like their uppercase twins (issue #181)

**Status:** Accepted (2026-07-17; prod log-triage 2026-07-17, 2 users; bug fix on main). *Files: `src3d/parser/parse3.ts` (`upliftLowercaseLabels` inside `normalize3`); `src3d/__tests__/lowercase-labels.test.ts`.*

**Class.** The two products disagreed on a convention the student cannot see: 2-D tolerates lowercase labels everywhere (the `up()` discipline, ADR-299), while `parse3`'s label tokens are `[A-Z]`-anchored — so `∠sdb` was refused and `הקודקוד c נמצא על החלק החיובי של ציר ה-x` burned a paid LLM escalation, on a pure casing slip.

**Why not a blanket `/i`.** 3-D has CASE-SIGNIFICANT tokens 2-D lacks — the axes x/y/z, the figure parameters k/m/t (ADR-3D-032: a lowercase letter IS the parameter), vector names u/v/w, the ADR-304-precedent R vs r, ℓ — so making every rule case-insensitive would create real ambiguities, exactly the trap the issue names.

**Fix (the copied 2-D pattern, per docs/20 §12 — never an import).** `normalize3` gains ONE chokepoint pass, `upliftLowercaseLabels`: a lowercase run (with digits/primes, lists joined by ,/ו/and) is uppercased only where an ANCHOR proves label position — the angle glyph `∠∡∢` or the angle word «זו?וית», or an explicit point/vertex noun («ה?קודקוד», «ה?נקודה/נקודות», En point/vertex). The lone axis letters x/y/z never uplift even in label position (a student's «נקודה x» stays theirs to disambiguate), and after an ENGLISH anchor a run must not be an English function word ("angle of…", "point of intersection"). Everything outside an anchor is byte-unchanged — vector naming (`נסמן: AB=u`), sign givens (`שיעור ה-z`), `k הוא פרמטר`, `M(k,1,3)`, plane equations. New label-demanding anchors join the chokepoint, never per-rule.

**Locks:** `lowercase-labels.test.ts` — the two exact prod utterances ≡ their uppercase twins (the axis `x` in the same sentence survives), list + prime forms, En mirrors, and the no-theft set over every case-significant lane.

## ADR-3D-046 — The 3-D prod sink logs the LLM's committed lines + store actions; the triage replay follows them (issue #182)

**Status:** Accepted (2026-07-17; ADR-346 follow-up — the #84/#189 mirror, 3-D edition). *Files: `src3d/debug/sessionLog3.ts` (`analyticsSubmit3` gains the `action` branch + the llm `commands` field); `src3d/App3.tsx` (log sites); `.claude/skills/log-triage/triage.mjs` (`session3d` follows actions + logged lines); `src3d/debug/__tests__/sessionLog3.test.ts`; `src/parser/__tests__/triage-mirror.test.ts` (the 3-D textual guard).*

**Class.** #84 gave the 2-D sink what a session replay needs (the LLM's committed commands + `action` lines) and stopped at the app boundary — so a 3-D `source:llm, result:ok` row said *that* the LLM built something, never *what*, and every later step of that session was unreplayable. Measured: 15/54 3-D sessions (28%) held an llm-built step; 44 submits (20%) sat downstream of one, permanently `? UNVERIFIED`.

**Fix (parameterize the shared thing, never fork it — the ADR-3D-016 discipline, and docs/20 §12 copying for the app code).**
1. **`commands` on the llm submit:** App3's LLM log site adds `commands: steps` — the canonical LINES `submitSteps` re-parsed onto the figure (3-D's faithful "what committed"; 2-D logs engine command objects — `loggedCommands` in the harness documents both shapes). Same privacy class as the utterance, capped at 900 chars in the lean sink.
2. **`action` lines:** delete / show-another / undo / redo / clear / **load** (a file load replaces the figure — the replay must know) each log one lean line; `analyticsSubmit3` forwards them exactly like the 2-D sink.
3. **`session3d` follows:** clear/undo/redo ride a zundo-like history (the #189 pattern); an llm step our grammar misses replays its logged canonical lines through `parse3` (parser drift caught — the scenarios' mocked-LLM form) while the verdict still reports OUR coverage honestly; delete/show-another/load and pre-#182 llm steps keep degrading honestly.

**Gate (from the issue):** a post-fix 3-D session with an llm-built step replays without `degraded` — the `? UNVERIFIED` bucket empties for new traffic. **Locks:** `sessionLog3.test.ts` (#182 block: commands on llm only, null-steps carry nothing, every action forwarded) + the `triage-mirror.test.ts` 3-D textual guard (App3 must log each action + the commands field; session3d must follow them — the ADR-346 anti-drift discipline).

**Deploy note:** takes effect on the next `dist-3d/` deploy; the harness half is live immediately (it reads whatever fields exist).

## ADR-3D-047 — A statement about an EXISTING object is a GIVEN, never an `already-defined` dead-end (issue #199, the M1 class — solid / derived-point edition)

**Status:** Accepted (2026-07-21; prod log-triage sessions `rk50ew35` / `pbe39l8h` / `pdqq203l`; bug fix on main). *Files: `src3d/engine/apply.ts` (the `solid` + `point-on-segment3` cases); `src3d/parser/parse3.ts` (`rightPyramid`'s `withEqEdges` macro); `src3d/__tests__/m1-redeclare.test.ts`; updated locks in `engine3.test.ts` / `store3.test.ts`.*

**Class (docs/17 — M1, 3-D edition).** 3-D had only partial M1 (ADR-3D-007 coordinate pins, ADR-3D-030/033 membership drives, the #116 flat-polygon idempotency): a re-declared SOLID, a median whose stated foot letter is taken, and a QUALIFIED re-declaration all dead-ended `already-defined`. Prod: `נתון טטראדר שווה מקצועות ABCD` refused after the tetra existed (and, worse, the **qualifier was silently dropped even on a fresh figure** — the plain-tetra lowering never carried the equal edges); `CD תיכון במשולש ABC` refused because D was the tetra apex — the student recovered by hand-renaming to `CE`.

**Fix (three rungs, all riding existing machinery — no new solver code).**
1. **Idempotent solid re-declare:** `applyCommand3`'s `solid` case no-ops when an existing solid has the same kind + the same ids in order (the solid-shaped sibling of #116 and the `segment3` convention). A different kind or a partial overlap keeps the honest conflict error (`store3.test.ts`'s keep-prior lock now uses `קובייה ABCD` → `טטראדר ABCD`).
2. **`point-on-segment3` on an existing id lowers to the vec-rel M1 dual:** numeric `t` → `A→id = t·(A→B)`, all-known ⇒ a multi-seed **verified claim** — a false statement (the tetra-apex median) now refuses `claim-refuted`, naming the real conflict; a true re-statement verifies idempotently. Free `t` (bare membership) → the `collinear3` claim (the ADR-3D-031 on-line shape; betweenness deliberately not asserted without a stated `t`).
3. **`שווה מקצועות` on a tetra is a MACRO** (the 2-D ADR-110 pattern): the solid + five equal-edge `length-rel` constraints — M1 at apply drives a free tetra into the regular one (verified equal across seeds) or verifies a pinned one. On any non-tetra kind the qualifier now DEFERS to escalation — never the silent drop it was.

**Documented rungs not taken (extend on demand, same recipe):** the flat-polygon→solid UPGRADE (`AOB מנסרה ישרה` over an existing triangle AOB — 1 unverified prod row; would need in-place solid replacement) and the remaining derived-point creators (`centroid3`, `diag-intersection`, feet) whose existing-id form should lower to a coincidence claim — no scaffold-point support in 3-D yet, and no verified prod demand. A DRIVE (vs verify) for a free existing point named onto a segment waits on the same re-home mechanism as ADR-3D-033's members. A duplicate re-declare currently records a second (no-op) fact row — cosmetic, the 2-D `dryRunOutcome` dedupe is not copied.

**Locks:** `m1-redeclare.test.ts` — the exact prod sequences (re-typed qualified tetra drives all 6 edges equal; the apex-median refuses `claim-refuted` keep-prior and the student's `CE` recovery builds the true midpoint; pyramidPar re-type no-ops; kind-clash still refuses) + the fresh-figure macro (qualifier never dropped).

## ADR-3D-048 — The un-named `אמצע BB'` builds an auto-labeled midpoint (issue #225)

**Status:** Accepted (2026-07-21; prod session `t0n3ktkt`; feature PR). *Files: `src3d/engine/types.ts` (`MidpointAutoCommand`); `src3d/engine/apply.ts` (`midpoint-auto` case); `src3d/parser/parse3.ts` (the `midpoint` rule's 2-token branch); `src3d/store/figureFile3.ts` (schema whitelist); `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/auto-midpoint.test.ts`.*

**Class.** The named `M אמצע BB'` parsed since V0; the un-named `אמצע BB'` (prod: a cube edge midpoint with no student-given letter) fell through to the paid LLM. The 2-D app closed this in #184 via `freeLabel` at parse time — but `parse3` is deliberately CONTEXT-FREE (App3 mirrors that), so the 3-D twin cannot pick a letter at parse.

**Fix.** A tiny `midpoint-auto {a,b}` command: the parser's existing `midpoint` rule gains a 2-token branch (He `אמצע XY`, En `midpoint/middle of XY`; primes tolerated), and APPLY — which knows the taken ids — picks the first free letter (M preferred, the students' midpoint convention; the 2-D `freeLabel` pattern copied per docs/20 §12) and delegates to the ordinary `point-on-segment3` t=½. Deterministic under replay (the pick depends only on the fact prefix), serializable (schema whitelist +1), no renderer/DOF change (the construction only ever holds the delegated on-segment point).

**Locks:** `auto-midpoint.test.ts` — the exact prod sequence (cube → `אמצע BB'` → M at the true midpoint), M-taken fallback to N, the named form byte-unchanged, unknown endpoints refuse, He+En parse; the catalog guard covers the new entry both locales.

## ADR-3D-049 — A stated angle named by its VERTEX alone + the `ישרה` word-form (issue #251)

**Status:** Accepted (2026-07-21; prod session `38t9c7lv`; feature PR). *Files: `src3d/engine/types.ts` (`VertexAngleCommand` + the `ambiguous-angle` error); `src3d/engine/apply.ts` (`vertex-angle` case); `src3d/parser/parse3.ts` (`vertexAngleClaim` — the word-form + single-vertex branches); `src3d/App3.tsx` + locales (the new error message); `src3d/store/figureFile3.ts` (whitelist); `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/vertex-angle.test.ts`.*

**Class.** `זוית O ישרה` went to the paid LLM, which GUESSES the arms; and even the full triple `הזווית ABC ישרה` was not-handled — the vertex rule demanded a numeric `= 90`, never the word. The 2-D closed the single-vertex class in ADR-164 at parse time via `ctx.neighbors`; `parse3` is context-free, so the 3-D twin resolves at APPLY.

**Fix.** `vertexAngleClaim` gains (a) the `ישרה`/`is right` word-form on the triple (≡ `= 90`, same `angle-seg-eq` lowering — already M1-routed per ADR-3D-023: drives free dims, verifies pinned ones) and (b) a single-vertex branch (`זוית O ישרה`, `זווית O = 60`, `angle at O is right`) lowering to a new `vertex-angle {vertex, deg}` command. APPLY collects the vertex's distinct neighbors over solid edges + drawn segments: exactly two ⇒ delegate to the ordinary ∠PVQ lowering (segments idempotent, the claim drives-or-verifies); anything else ⇒ the new honest `ambiguous-angle` refusal («name all three letters» — a cube corner's 3 edges never gets a guessed angle). No-theft: the #94 marker forms (`∠SDB`, `∠SDB = α`) and the scope3 query guidance are byte-unchanged (a Greek RHS is not a NUM).

**Locks:** `vertex-angle.test.ts` — the prod utterance drives a free triangle to ∠AOB=90 across seeds; a cube vertex refuses `ambiguous-angle` keep-prior; unknown vertex refuses; re-statement verifies; parse forms He+En; marker no-theft. Catalog +1 (`זווית O ישרה`).

## ADR-3D-054 — A derived MAGNITUDE needs the scale pinned, not a coordinate frame (issue #268)

**Operator report (prod, 2026-07-22).** On a right triangular prism — ∠CAB = 90, `AB=u`, `AC=v`, `AA'=w`, `BE = 0.2BC'`, `|u| = 3`, `|v| = 4`, `B'E ⊥ C'E` — «I think that |w| can be calculated yet it is not shown on the side. I entered AA' just to maybe make the tool calc it.»

**It was calculated.** Replayed through the real path, the engine solves the height exactly and identically at every seed (2.500000 at seeds 0/1013/2027/7/99). The panel simply withheld it.

**Root cause.** `dataView` gated the derived-magnitude path on `hasFrame`:

```ts
const hasFrame = c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0;
if (mag === undefined && hasFrame) { /* … multi-sample agreement → derived magnitude */ }
```

`hasFrame` asks *"was a COORDINATE injected?"* — the right question for **coordinates**, since a coordinate without a frame is pure gauge. It is the wrong question for **magnitudes**: a length is gauge only when the figure's SCALE is free, and `|u| = 3` pins the scale absolutely with no coordinate frame anywhere. The figure carried four `scalarPins` and zero coordinate pins, so the branch never ran.

**Why the multi-sample check cannot simply replace it** (checked, and the reason the obvious fix is wrong): the first dim of every solid is the frozen similarity gauge, so a *bare* solid reports a constant length across all seeds —

```
bare cube  |AB| = 1.000000 | 1.000000 | 1.000000     ← gauge, NOT knowledge
bare box   |AD| = 1.326722 | 0.959239 | 0.990628     ← a free dim, correctly varying
```

Dropping the gate outright would print `|AB| = 1` on a bare cube: an invented given, the ADR-052 cardinal sin. A second gate is genuinely needed; it was simply the wrong one.

**Decision.** Extract the classification the solver already maintains — `solvePivot`'s `invariantOnly` enumerates every similarity-INVARIANT pin kind precisely to know when the gauge is null-space — into one exported `scalePinned(c)`, and gate the two MAGNITUDE sites on it (the per-vector derived `mag`, and the class value on `|u| = |v| = |w|`). Coordinates, `pointCoords`, `points` and `planes` keep `hasFrame` — they genuinely need a frame. `solvePivot` consumes the same predicate, so a future pin kind that carries units cannot make the two drift apart (the ADR-167 chokepoint discipline).

Measured after the fix: the operator's prism prints `|w| = 5/2` plus the other forced lengths; a bare cube and invariant-only givens (⟂, a ratio) print nothing; `|u| = 3` alone prints `|u|` only, leaving the still-free `|v|`/`|w|` unprinted.

Locked by `derived-magnitudes.test.ts` (both directions: the forced value prints, the gauge never does).

## ADR-3D-055 — The diagonal-crossing accepts «נפגש» and a TRAILING point (issue #284)

**Operator (2026-07-23).** «אלכסוני הריבוע **נחתכים** בנקודה O» works; «אלכסוני הריבוע **נפגשים** בנקודה O» does not.

**Root cause.** `diagIntersection` (`parse3.ts`) had two independent narrownesses, both exposed by the one phrasing:

1. **The verb set omitted `נפגש`** (meet). It carried `מפגש`/`חיתוך`/`נחתכים` only, so «נפגשים» failed the verb guard outright — the CLAUDE.md `פוגש`/`פגש` shared-intersect-keyword lesson, one form further (and both nun endings, the ADR-3D-035 `קט[ןנ]` discipline: `נפגש` covers נפגשים/נפגשות).
2. **The crossing point was read as the FIRST label**, but «…meet at O» / «…נפגשים בנקודה O» names it LAST. With explicit vertices this SILENTLY MIS-BOUND: «diagonals of ABCD meet at O» built `diag-intersection id=A, face=[B,C,D,O]` — the wrong figure, no error (the §honesty class).

**Fix.** Add `נפגש` (+ broaden `נחתכים`→`נחתכ`) to the verb set, and read a TRAILING marker («בנקוד[הת] X» / «at X») as the crossing id when present, falling back to the first-label idiom («O מפגש אלכסוני ABCD») otherwise. Parser-only; the `diag-intersection`/`point-on-segment3` lowerings and every point-first form are byte-unchanged.

**Not a regression from the measure work** (#282): the angle commits don't touch this rule; «נפגשים» never parsed in 3-D. "Yesterday it was" was the 2-D app, where the same phrasing has always resolved via `line-line-intersection`.

Locked by `v8a-apex-diagonals.test.ts` (+3: the operator's exact «נפגשים בנקודה O», the «נחתכים» form still working, and the point-last explicit-vertices no-mis-bind, He + En).

## ADR-3D-056 — A ⊥ whose arm carries a symbol-defined point DRIVES that symbol (issue #286)

**Operator (session `gnudxdzn`).** «I don't think that EO⊥AS was calculated based on the way it looks on the canvas.» Correct — at the displayed seed `EO·AS` measured 121°, not 90°.

**Diagnosis.** E is defined by `AE = t·AS` (E on edge AS, `t` a FREE symbol) and O is the base-diagonal centre. `EO⊥AS` is one linear equation in t — E should slide to the foot of the perpendicular from O onto AS, t = (O−A)·(S−A)/|S−A|². But `perpSegGiven` lowers ⊥ to a `cos-angle` scalar pin (ADR-3D-035), which the pivot satisfies by reshaping the free solid **dims**, never by solving the symbol. So t stayed randomly sampled and the ⊥ held only when the sample happened to land near the foot — **seed-dependent** (measured: 90° at seeds 0/2/5/…, 121–142° at 1/3/6/7/9/11), and accepted GREEN while violated. The extra givens (`|w|=3`) tighten the dims so the ⊥-via-dims can no longer coincidentally hold; the STRIPPED figure held at every seed by luck. Bound-independent — a plain `|w|=3` triggers it, so the fix lives on `main`, not the measure branch.

**Fix — the ⊥ pins the symbol, not the dims.** A new `symbolPin` kind `seg-perp`/`seg-par` (the seg–seg twin of the existing ⊥/∥-to-plane pins): at APPLY, a `cos-angle`(=0) whose exactly one arm carries a still-unpinned symbol-defined point emits `seg-perp` for that point's def instead of the dims-driving `scalarPin`. The vec-defined evaluator then root-finds the symbol against the pin residual (signed dot → `signChangeRoots`), so E lands on the foot and `EO⊥AS` holds at **every** seed (locked). A subtlety: the pin references points OUTSIDE the vecDef's terms (O, the reference segment) which may be inserted LATER in order, so the placement loop **defers** such points to a 2nd pass once their references exist.

**Scope.** Only the perpendicular (`cos=0`) case, and only when exactly one arm carries the free symbol (the other being the fixed reference); a general stated angle, or both arms symbol-bearing, still take the dims/claim path. The `seg-par` machinery is in place for a future ∥ given. A ⊥ between two DETERMINED segments (a cube's `AB⊥AA'`) is unchanged — still a verified claim.

**Two fix-plan items from #286 not needed after (1):** because the symbol is driven, the ⊥ now holds at every seed, so there is nothing to flag amber (honesty backstop) and the config search never has to skip a ⊥-violating seed. They stay filed as defence-in-depth if a future un-drivable ⊥ appears.

Locked by `perp-drives-symbol.test.ts` (EO⊥AS = 90° across a seed sweep, E on the AS foot, He + En, the stripped no-regression case, and a determined-segment ⊥ still a claim).

## ADR-3D-057 — `המנסרה ישרה` makes an EXISTING solid a right prism (M1), never a re-construction (issue #289)

**Status:** Accepted (2026-07-23; prod session `hz8m4ifk`; feature PR — bundle #289/#290/#291/#292/#271). *Files: `src3d/engine/types.ts` (`make-right-prism` command + `no-prism-to-make-right`/`ambiguous-prism` errors); `src3d/engine/apply.ts` (the case); `src3d/parser/parse3.ts` (`makeRightPrism` rule); `src3d/App3.tsx` + locales; `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/make-right-prism.test.ts`.*

**Class.** `המנסרה ישרה` ("the prism is right") was `not-handled` → the paid LLM, which can only express it as a *re-construction* (`right prism … ABCDA'B'C'D'`), re-declaring the existing vertices → `'A' כבר מוגדר`. A statement about an EXISTING object is M1 (ADR-3D-047), never a rebuild.

**Fix.** A DEFINITE-form parser rule (`המנסרה [היא] ישרה` / `the prism is right` / `make the prism right`) lowers to `make-right-prism` (no target — parse3 is context-free). Geometrically a right prism is a `parallelepiped` (parallelogram base + a FREE lateral vector) with that vector pinned ⟂ base — which IS `prism4`. So apply resolves THE prism-like solid and converts an oblique `parallelepiped` → `prism4` in place (identical ids/edges/faces — both are `prismRing(4)`, so no vertex is re-declared; DOF drops 5→3); an already-right prism is an idempotent no-op; no prism ⇒ the honest `no-prism-to-make-right` refusal; >1 oblique ⇒ `ambiguous-prism`. The base-less CONSTRUCTION form `מנסרה ישרה` (no ה) is untouched — it stays a `rightPrism` "needs a base" refusal, not read as a statement.

**Locks:** `make-right-prism.test.ts` — the definite forms parse (He+En); `מקבילון` → `המנסרה ישרה` becomes a right prism (top face straight above the base, DOF 5→3, no new points); already-right prism is idempotent (no move); the operator sequence no longer errors; no solid refuses keep-prior. Catalog +1.

## ADR-3D-058 — the 3-D LLM fallback must never invent an unstated property (ADR-052 honesty, issue #290)

**Status:** Accepted (2026-07-23; feature PR — the same bundle). *Files: `src3d/parser/llmShared3.ts` (the system-prompt rule + the corrected/added few-shots); `src3d/parser/__tests__/catalog3.test.ts` (the honesty assertions). The 2-D sibling audit is filed as #293 (deferred).*

**Class.** A bare `מנסרה שבסיסה מקבילית` (no `ישרה`) is correctly refused by the deterministic parser (an oblique-vs-right prism is unstated, ADR-052), but the LLM prompt (a) had a few-shot mapping "a prism" → "**right** triangular prism" (inventing rightness AND a base) and (b) had a rule against inventing *points* but none against inventing *properties*. So prod silently upgraded the bare prism to a right one — the cardinal sin (a stated given the student never gave), confirmed live in session `vuttttda`.

**Fix.** `buildSystemPrompt3` gains the property twin of the points rule: "NEVER invent an unstated property … a bare prism with no `ישרה` is NOT expressible — return an EMPTY list," plus "a statement about EXISTING objects is not a re-construction; never re-declare a point/solid." The misleading few-shot's freeform now states "right"; a new refusal example maps a bare parallelogram prism → `[]`.

**Locks:** `catalog3.test.ts` — no `PROMPT_EXAMPLES_3D` entry maps a non-right freeform to a `right … prism` / `מנסרה ישרה` step; the prompt carries the ADR-052 rule; the PAR-10 re-parse contract stays (an empty-steps example is trivially valid).

## ADR-3D-059 — free parallelogram-base solids seed VISIBLY OBLIQUE (issue #291)

**Status:** Accepted (2026-07-23; the same bundle). *Files: `src3d/engine/evaluate.ts` (`solidDims` for `prism4`/`pyramidPar`/`parallelepiped`); `src3d/__tests__/parallelogram-seed.test.ts`.*

**Class.** A parallelogram base's 2nd edge `AD=(dx,dy)` had `dx` sampled centered near 0, so the FIRST sample (seed 0 = the default view) landed `∠DAB ≈ 86°` — a `מקבילית` base rendering as a rectangle, silently asserting a right angle the student never gave (ADR-052: a default must not look like a special case). Operator: "`מנסרה שבסיסה מקבילית` seems to have created a מלבן."

**Fix.** `dx` is sampled strictly positive and bounded away from 0 (`[0.3, 0.6]`) for `prism4`, `pyramidPar`, `parallelepiped`, so with `dy∈[0.6,1.2]` EVERY seed (incl. seed 0) has `∠DAB` in ~[45°, 76°]. Still a genuine free DOF that "show another configuration" varies; heights/lateral DOFs untouched.

**Locks:** `parallelogram-seed.test.ts` — for each solid the base angle is in (38°, 82°) at every seed AND varies across seeds; the old near-90° default no longer occurs.

## ADR-3D-060 — the DOF cue is monotone non-increasing on a ⟂ constraint (issue #292)

**Status:** Accepted (2026-07-23; the same bundle). *Files: `src3d/engine/evaluate.ts` (`freeDofCount3`); `src3d/__tests__/dof-cue.test.ts`.*

**Class.** A driving `cos-angle` (⟂/angle) constraint triggers a pivot solve, and `freeDofCount3` added the whole 7-DOF similarity gauge (`dims + 7 − pinCount`) even when NO absolute pins consumed it — so the "degrees of freedom remaining" cue JUMPED UP by 7 when a ⟂ was added (geometrically impossible; a constraint only removes freedom).

**Fix.** Report SHAPE DOF (the 2-D ADR-101/112 idea) — subtract the free (unpinned) gauge and the driving scalar constraints: `max(0, dims − max(0, pinCount − 7) − scalarPins) + freeT + param`. A ⟂ drive with no absolute pins now DECREASES the cue (pyramidPar+u⊥v: 5→4). Read-only cue, no functional dependency; the only DOF-value-asserting tests are non-pivot figures (cone / prism bases / cube+plane / parametric line) — all still exact.

**Locks:** `dof-cue.test.ts` — the cue is ≤ the prior value at every step of two ⟂ sequences (never +7), and exactly 5→4 / 3→2 for the two drives; the existing DOF-value tests + the 2020/2022/2023/2024/2019 exam gates stay green.

## ADR-3D-061 — a general angle EQUALITY `∠SAB = ∠SAD` (issue #271)

> **SUPERSEDED on reconciliation (PR #282, 2026-07-23):** two sessions independently implemented #271. This
> session's standalone `angles-equal` command was **removed** when PR #282 (the data & measure panel) merged;
> the KEPT implementation is #282's `angle-pair-eq`, documented in **[ADR-3D-063](#adr-3d-063)** — it is the
> version wired to the α-label/bound system (`∠SAB = α` binds α; `60 < α < 90` reads it). User-facing behavior
> is identical. This ADR is retained as the historical record of the decision; the code it describes is gone.

**Status:** Accepted then superseded (2026-07-23; prod 2026-07-22; P1 — silent-drop honesty). *Original files: `src3d/engine/types.ts` (`angles-equal` command — removed); `src3d/engine/apply.ts`; `src3d/parser/parse3.ts` (`angleEquality` rule — removed); `src3d/parser/catalog3.ts`; `src3d/__tests__/angle-equality.test.ts` — removed. See ADR-3D-063 for the kept `angle-pair-eq`.*

**Class.** Stating two angles equal was impossible: `∠SAB = ∠SAD` (and the word/symbol forms) was `not-handled`, and labelling two angles with the same letter (`∠SAB = α` … `∠SBC = α`) produced two cosmetic stickers with NO relation asserted — a stated given silently dropped *and* a drawing that contradicts it (the cardinal sin, hence P1). The engine already had the relation (`cos-eq`), reachable only through the construction wording `AS יוצר זוויות שוות עם AB ו-AD`.

**Fix.** A general `angleEquality` parser rule (`∠PQR = ∠XYZ`, symbol/word, He/En, incl. `שווה ל…` / `equals`) lowers the label-less form to a new `angles-equal` command = ∠(a,b)=∠(c,d) over four free atoms (no shared vertex required), which apply lowers to the SAME `cos-eq` scalarPin (drives a free-dim solid) / claim (verifies a determined one) as `angle-eq`. The chained `∠SAB = ∠SAD = α` draws both angle marks with the shared label; and `angle-mark` apply now ASSERTS equality whenever a label is reused on a different angle (a `cos-eq` to the first twin — transitivity chains the rest), so the solo-label form states the same equality instead of dropping it silently.

**Locks:** `angle-equality.test.ts` — the symbol/word forms (He+En) lower to `angles-equal` (incl. the general non-shared-vertex `∠ABC = ∠SAD`); a free pyramid + `∠SAB = ∠SAD` holds the angles equal in every seed; the solo-label `∠SAB = α` … `∠SAD = α` asserts the same; the existing `יוצר זוויות שוות עם` form is unchanged. Catalog +1.

## ADR-3D-062 — a bare `מנסרה שבסיסה מקבילית` builds an OBLIQUE `מקבילון`, not a refusal (issue #295; amends ADR-3D-058)

**Status:** Accepted (2026-07-23; operator decision; feature — folded into PR #294). *Files: `src3d/parser/parse3.ts` (`parallelepiped` rule guard); `src3d/parser/llmShared3.ts` (the ADR-052 rule text + few-shots); `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/oblique-prism.test.ts`.*

**Class.** After #290 made a bare `מנסרה שבסיסה מקבילית` (no `ישרה`) refuse deterministically (and the LLM return empty), it built *nothing* — but the operator's ruling was "don't default the RIGHTNESS," not "don't build." Per ADR-052 an unstated property is a FREE DOF, so a parallelogram-base prism with no `ישרה` should build with its lateral tilt left free — which is exactly the oblique `מקבילון` (parallelepiped). This makes it a proper build entry point for the ADR-3D-057 "build → `המנסרה ישרה` pins it" workflow.

**Fix.** The `parallelepiped` rule now also fires on `מנסרה`+`מקבילית` (He) / `prism`+`parallelogram` (En) when NO `ישרה`/right word is present → `parallelepiped` (same label handling as `מקבילון`: 8 ids, 4 auto-primed, or the default ABCD). `rightPrism` still owns the `ישרה` form (→ `prism4`, tried first). Only the parallelogram base has an oblique model, so a non-parallelogram base without `ישרה` stays `rightPrism`'s honest refusal.

**Amends ADR-3D-058.** The LLM honesty rule is corrected from "a prism with no `ישרה` is NOT expressible" to "a prism NOT stated right is OBLIQUE — never emit a right/`ישרה` prism the student did not ask for (a parallelogram-base prism with no `ישרה` is `מקבילון`)." The misleading `'a prism whose base is a parallelogram' → []` few-shot becomes `→ ['מקבילון']`; a new genuinely-unexpressible example (`'a prism'`, no base → `[]`) keeps the empty-list lesson. The #290 honesty assertion (no example maps a non-right freeform to a right prism) still holds.

**Locks:** `oblique-prism.test.ts` — `מנסרה שבסיסה מקבילית` / `prism with a parallelogram base` → `parallelepiped` (labelled + default); the `ישרה` form stays `prism4`; a non-parallelogram base refuses; end-to-end the bare form builds oblique (5 DOF) and `המנסרה ישרה` pins it right (3 DOF, top face above the base). Catalog +1; the PAR-10 + #290 honesty contracts stay green.
## ADR-3D-063 — An angle EQUALITY is statable, and a reused label MEANS it (issue #271, the M4 defaults/statement class)

**Operator report (prod, 2026-07-22).** «when I tried saying that angle SAB = angle SAD it failed. I wanted to tell it that angle SAB = angle SAD = alpha (using the symbol).»

**Two symptoms, one class: there was no way to state that two angles are equal.**

```
∠SAB = ∠SAD · זווית SAB = זווית SAD · angle SAB = angle SAD · ∠ABC = ∠SAD   → all not-handled
∠SAB = α  then  ∠SAD = α                                                    → two cosmetic stickers, NOTHING asserted
```

The implicit form is the worse half, because it is **silent**: labelling two angles with the same letter is how a student says "these are equal", and the tool recorded a second display marker, raised no error, and drew `α` on two angles the figure does not make equal. A stated given dropped *and* a drawing contradicting it — the class the 2-D honesty gates (ADR-264/089/250) exist to prevent.

**Root cause.** The relation was already in the engine — `cos-eq` (V8-f/G10), with the M1 dual (drives a free-dim solid, verifies a determined one) — but reachable through exactly ONE phrasing, `AS יוצר זוויות שוות עם AB ו-AD`, because the rule was authored as a *construction* ("X makes equal angles with Y and Z") rather than as the equality a textbook states. And an angle label was a pure display string with no identity to relate.

**Decision.**
- A new command `angle-pair-eq` carrying FOUR independent `VecAtom`s, so a shared vertex/arm is a special case rather than a requirement (`∠ABC = ∠SAD` works). Its apply is the `angle-eq` twin — same M1 routing, zero new solver code. The existing `angle-eq` stays for the construction phrasing.
- Parser `angleEquality3`, both languages, symbol/word forms, plus the chained `∠SAB = ∠SAD = α` which names both. Ordered BEFORE `angleMarker`, which would otherwise claim the left angle and drop the right-hand side.
- **A label BINDS to its angle.** A second `angle-mark` carrying a label another angle already wears asserts the equality (same M1 routing). One binding still just names — no self-equality.
- **A value for a name** (issue #272): `symbol-value` — the existing "give this symbol a value" command — resolves at APPLY against whatever the letter denotes (a vector-def parameter, or now a labelled angle), delegating to the ordinary angle claim so `α = 70` drives or verifies like any stated angle. Every angle wearing the label is pinned; that is what sharing a name means. A letter naming nothing is refused `unknown-symbol`, never invented. This is 2-D's `buildSymTab` insight (ADR-031) in the shape `src3d` already had: resolution happens where the figure is known, because `parse3` is context-free (the ADR-3D-048 pattern).
- Greek letters (α β γ δ θ) and `<` join the 3-D symbol palette — `∠SAB = α` is unusable when the letter cannot be typed.

Locked by `angle-measures.test.ts`; catalog3 +2.

## ADR-3D-064 — A stated INEQUALITY is a REQUIREMENT: the 3-D bound + the configuration-search layer (issue #273)

**Operator (prod, 2026-07-22).** «I wanted to say that 60 < alpha < 90 but I'm not sure if that would have worked.» It did not — `60 < α < 90`, `α > 60` and every spelled-out form were not-handled.

**Why this needed a new layer rather than a new command.** A bound is not an equation: it determines nothing, so it can be neither a `ScalarPin` (no target to reach) nor a `Claim3` (a whole REGION satisfies it). The 2-D app enforces exactly this idea through `meetsRequirements` + a seed search (ADR-106/244/254) — and **`src3d` had no such layer at all**:

| | 2-D | 3-D (before) |
| --- | --- | --- |
| region/inequality constraint | 4 kinds (ADR-039/108) | none |
| valid-configuration search | `firstSatisfyingSeed` / `meetsRequirements` / `findValidConfig` | none |
| "show another configuration" | searches for a config meeting every requirement | `set({ seed: seed + 1 })` — a blind bump |

The one inequality-flavoured thing that existed — a stated plane SIDE (ADR-3D-015) — is enforced *constructively*: an on-plane point is BORN on the stated side (its sampled offset is multiplied by the side's sign), so it can never leave. Elegant, and it does not generalize: the angle in `60 < α < 90` is a nonlinear function of several free solid dims, not a coordinate whose sign can be fixed at birth.

**Decision — build the missing layer, with bounds as its first client.**
- `Construction3.requirements: Requirement3[]` (first kind `angle-bound`), and `meetsRequirements3(c, seed)` — the 3-D sibling of the 2-D predicate. Patterns are COPIED from `src/`, never imported (docs/20 §12).
- `firstSatisfyingSeed3` + `seedForRequirements`: **submit lands on a configuration that satisfies the stated bounds**, and `resample` searches forward for the next one — `store3.ts`'s blind `seed + 1` is gone. A requirement-free figure returns immediately, so every existing figure is unchanged and pays nothing.
- **The measure keeps its DOF.** A bound restricts which configuration may be shown; it never determines a value. So the angle still varies across configurations (locked by a test), and no value is ever reported for it — the ADR-052 discipline.
- No configuration within budget ⇒ the honest `bound-unsatisfiable` refusal with keep-prior, never a drawing that contradicts the given.
- Parser `angleBound3` mirrors the 2-D `measureBound` grammar (ADR-390): one/two-sided, glyph and word forms, both languages, spelled-out angle or a label (resolved at apply, like every other name). An empty window (`70 < ∠SAB < 60`) defers.

**Recorded trap, twice in one night.** A Hebrew keyword gate must admit BOTH nun spellings — `קטן` (m) / `קטנה` (f). The 2-D fix (ADR-390) had to correct exactly this in `CMP_SMALL`, and the guard at the top of *this* rule then reintroduced it: the regex matched fine while a `קטן`-only early-out rejected the utterance before it ran. Write `קט[ןנ]`, as ADR-3D-035 wrote `מאונ[ךכ]`.

Locked by `angle-measures.test.ts`; catalog3 +2.

## ADR-3D-065 — The data-panel QUERY lane (issue #274)

**Operator design (2026-07-22).** «for the data side, i want to see w·v. we don't have this in the engine since it does nothing. so … a separate data entry that … user can add specific sizes he wants to calc (only if stable) and will not garbage the shape builder data entry.»

**Decision.** A SEPARATE input in the data panel where the student asks for a quantity and sees its value WITHOUT touching the figure. A query is a QUESTION, never a fact: `Construction3` is untouched, `replay` never sees it, it never appears in the step list. Stored on the store as `queries: string[]` (in `partialize` → undoable; saved in the `.geo3.json` → a reloaded figure keeps its questions), distinct from `facts`.

**Supported.** `answerQuery` (`src3d/engine/queries.ts`) parses, He + En: `w·v` / `AB·CD` (dot); `|AB|` / `|w|` / `אורך AB` (length — the BARS/word mean magnitude); a BARE pair `AE` or declared vector `w` = the VECTOR itself, its u/v/w decomposition + coordinates (the math convention |AE| = length, AE = the vector — the operator asked for «AE» and meant the vector, not its size); `∠SAB` / `∠(u,v)` (angle); `area ABC` / `שטח ABC` / `S_{ABC}` (area); `volume SABCD` / `נפח …` (solid volume via a centroid-fan of the face rings, or a 4-point tetra). A vector's DECOMPOSITION is frame-invariant, so it is answered whenever the coefficients agree across seeds — even with a free scale — while its coordinates need an injected frame (the `dataView` discipline; the helpers `solve3x3`/`decompStr`/`coordStr` are shared, not re-derived).

**Honesty (the student's own «only if stable»).** A query is answered ONLY when its value is genuine knowledge, decided by two gates: (1) STABLE across sampled seeds — an under-determined quantity varies and reads «not determined»; (2) for a unit-carrying quantity (dot/length/area/volume) the SCALE must be pinned (`scalePinned`, ADR-3D-054) — else «depends on scale» — EXCEPT the one scale-invariant value ~0 (a perpendicular dot is knowledge at any scale). Angles are scale-free, answered whenever the shape is determined. A query naming absent points, or gibberish, says so. Never a sampled number dressed as a fact (ADR-052).

**Folded-in repair — the save whitelist had drifted.** `deserializeFigure3`'s `COMMAND_TYPES` gate was missing **23** command types the parser emits (mostly old: `cos-angle`, `vec-mag`, `circle3`, `diag-intersection`, `angle-mark`, `plane-cut`, …), so any figure using them silently failed to RELOAD (`bad-file`). Queries persist to that same file, so an unsaveable figure would lose its query list too — hence the repair rides here. A behavioural guard test now asserts EVERY command the catalog produces round-trips through save→load, so the whitelist can never fall behind the parser again (filed as #288 for the record).

**«depends on α», not a bare «not determined» (operator, the bagrut Q2 figure).** When a quantity varies BECAUSE it is a function of a free NAMED parameter (α from «∠SAB = α», bounded 60–90 but unpinned), the note names it: `pinFreeMeasures` pins every labelled angle to its bound's midpoint and re-checks — if the value settles once α is fixed, the answer is «depends on α» (t, AE, w·v, EO all report it on that figure, matching the book's α-answers). The tool NEVER solves the relation (t = ⅔cosα needs symbolic algebra, the no-CAS D3 boundary — that is the STUDENT's derivation, not the drawing tool's); it only names the dependency, the pedagogical signal. A figure with no free named parameter stays plain «not determined» (never a false «depends»). The engine figure is verified correct — t = ⅔cosα holds to machine precision across sampled α. A BARE parameter letter «t» from «AE=t·AS» is a SYMBOL query — its solved value (`sym = [(E−A)−Σk·atom]·(Σp·atom)/|Σp·atom|²`), scale-invariant so answered on stability alone. Note the honesty this exposes: on the operator's own figure `t` (and therefore `AE`) read «not determined» — the pyramid's apex is free, so the ⊥-foot `t` genuinely varies (~0.19–0.38 across configurations); once the shape is constrained, `t`→a value and `AE`→its decomposition. Locked by `queries.test.ts` (25): each quantity answered when determined, refused with the right reason otherwise, a query never becomes a fact, add/remove/dedupe, save-load round-trip, and the whitelist drift guard.

## ADR-3D-066 — A relations-only data panel is NOT empty (issue #296)

**Status:** Accepted (2026-07-23; prod 2026-07-23-2 / PR #282; P2 — the panel HID real knowledge). *Files: `src3d/engine/dataView.ts` (`panelIsEmpty`); `src3d/App3.tsx` (the guard); `src3d/__tests__/data-view.test.ts` + `scenarios3.test.ts` (#296).*

**Operator report.** On the free-scale «dd» figure (square-base pyramid, `AE=t·AS`, `EO⊥AS`) the data panel «had data until i asked about AE or t and then all data disappears.»

**Diagnosis (not a crash).** `answerQuery`/`dataView` never throw (a seed sweep 0–40 + the query-offset partners is clean). The `DataPanel` renders `relations ∪ vectors ∪ points ∪ planes`, but the App's empty-panel guard tested only `vectors`/`points`/`planes` and OMITTED `relations` — and `relations` renders ONLY inside the guarded `<ul>`. A free-scale figure correctly suppresses magnitudes/coords as non-knowledge (ADR-3D-054), so as steps accrue `vectors`/`points`/`planes` can legitimately empty out; the moment the last one drops, the guard collapsed the whole panel — hiding the still-valid scale-free relations `|u|=|v|`, `u·v=0` the square base yields. Class: ANY figure whose only derived knowledge is relations (just loading the saved «dd» reproduces it).

**Decision.** One shared predicate — `panelIsEmpty(panel)` in `dataView.ts` (empty ⇔ `relations` ∪ `vectors` ∪ `points` ∪ `planes` all empty) — used by the App's guard, so the guard and the render read emptiness the same way by construction. Not a special-case: it fixes the whole class.

**Sibling (investigated, NOT a bug).** The same session's `t`/`AE` queries read «not determined» while `|AE|` reads «depends on α». Measured across seeds: `EO·AS = 0` always (the ⊥ holds), `|AE| = cos α` exactly (α-only ⇒ «depends on α»), but `t = cos α / |AS|` with `|AS|` free (same α → different t: 0.247 vs 0.327), so `t` is genuinely undetermined — the general pyramid leaves the apex STEEPNESS free (ADR-052; already documented in ADR-3D-065). Confirmed the lever: rebuild as `פירמידה ישרה שבסיסה ריבוע` (apex over O) and `t`→«depends on α». No code change — inventing `t` would violate ADR-052.

## ADR-3D-067 — Parametric vectors for a DRIVEN parameter + stated/forced angle equalities in the data panel (issue #297, PR)

**Status:** Accepted (2026-07-23; feature via PR). *Files: `src3d/engine/dataView.ts`; `src3d/__tests__/scenarios3.test.ts` (#297) + `data-view.test.ts`.*

**Operator (same «dd» figure, after #296).** «why don't I see all the data I should? EO is dependent on t and we should be able to give vectors with the use of parameters.» The panel showed only `|u|=|v|` + `u·v=0`; two categories of stable knowledge were absent.

**1. Parametric vectors for a DRIVEN parameter.** `EO = ½u + ½v − t·w` (and `AE = t·w`) didn't display because `t` is a driven symbol (`EO⊥AS` pins it, `seg-perp`, ADR-3D-056) and `decomposeSym` was gated to a FREE (unpinned) symbol. But `t`'s value is shape-dependent (roams 0.15–0.38 with the free apex), so the vector's numeric decomposition is unstable and the PARAMETRIC form is the ONLY stable representation. Fix: (a) `freeSyms` now admits a constraint-driven symbol, excluding only a `rel:'value'` pin (a value-pinned symbol is a number, not a parameter); (b) `positionsAtK` REPLACES any existing pin on that symbol's def with the k=value probe, so the t=0/t=1 evaluations aren't fought by the `seg-perp` constraint. Safe by construction: `decomposeSym` runs only when the plain `decompose` is null, so a DETERMINED figure (the exam `|EN|=√6/4·|w|` path, k pinned to a value) still shows its numeric decomposition — regression-guarded.

**2. Stated / forced angle equalities.** `∠SAD=∠SAB=α` lowers to a `cos-eq` scalarPin (the pair IS forced; measured equal to machine precision every seed), but the panel printed an angle only when its VALUE is determined — with α free (60–90) it printed nothing. New additive block: group angle-markers equal in every sampled seed; a group ≥2 with a FREE shared value prints the equality `∠SAD = ∠SAB` (the scale-free-knowledge twin of `|u|=|v|`). A determined group is still printed per-marker by the value loop; an under-determined SINGLE marker (the #94 case) still prints nothing.

**3. The QUERY lane shares the panel's engine.** The operator's «AE» query (the data-panel query box) fell through to «depends on α»/«not determined» because `answerQuery`'s `vectorForms` had its OWN numeric-only decomposition, separate from the panel — so a query and its panel row could diverge. Fix: the parametric decomposition is extracted to two exported functions in `dataView.ts` — `basisDecompose` (numeric coefficients across seeds) and `parametricDecomp` (the affine-in-parameter string) — and BOTH the panel (`dataView`) and the query lane (`vectorForms`) call them. `vectorForms` now falls back to `parametricDecomp` when the numeric decomposition is unstable, so «AE» → `t·w` and «EO» → `½u + ½v − t·w`, identical to the panel rows. No duplication: one decomposition engine, two consumers.

**Result.** The «dd» panel now reads `|u|=|v|`, `u·v=0`, `∠SAD = ∠SAB`, `AE⃗ = t·w`, `EO⃗ = ½u + ½v − t·w`, and querying `AE`/`EO` returns the same parametric forms. Locked by scenario #297 + `queries.test.ts` (#297) + the untouched exam/#94 gates.

## ADR-3D-068 — A parenthesised coefficient carrying an internal sign is ONE term: the shared linear-expression tokenizer (issue #299)

**Status:** Accepted (2026-07-24; bug, P2). *Files: `src3d/parser/parse3.ts` (`splitTopLevelTerms` + its four call sites); `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/paren-coefficient.test.ts`.*

**Operator report.** «why can't the engine understand an input such as `AS=(1-t)*u+0.5*v+t*w` or `AS=(1-t)u+0.5v+tw`?» Both returned `not-handled` and escalated to the LLM.

**Class.** *A **term-splitting tokenizer** over a **linear expression whose coefficients may be parenthesised** treats **every `+`/`-` as a term boundary regardless of paren depth**, so any grouped sub-expression carrying an internal sign is shredded before a term regex ever sees it.* Instance-level phrasing ("the `(1-t)` form fails") would have named one utterance; the class names the tokenizer, which is why the fix is one helper and not one rule.

**Root cause.** `parseSymExpr` split its input with `src.split(/(?=[+-])/)` — a paren-blind lookahead:

```
"(1-t)*u+0.5*v+t*w"  →  ["(1", "-t)*u", "+0.5*v", "+t*w"]
```

`"(1"` matches no term grammar, so `parseSymExpr` returned null, `vecEqClaim` returned null, and the utterance fell through to not-handled. **Nothing downstream was wrong**: `SYM_TERM` already matched the intact `(1-t)u` (paren group `1-t`, atom `u`); `parseParamExpr('1-t')` already returned the affine `{k:1, p:-1, param:'t'}`; and `evaluate.ts` already evaluates `coeff.k + coeff.p·kValue`, so a mixed k≠0/p≠0 coefficient was always supported. No CAS boundary is involved — `(1-t)` is exactly representable as the existing `LinExpr`. The V7 lane simply never received a well-formed term.

**Why it survived since V7.** Every cataloged symbolic form — `(k/2)DB`, `kDC`, `2k·u`, `t·BE` — happens to carry no `+`/`-` inside its parens, so the naive split was accidentally safe for the whole corpus. The first student to write the standard interpolation `(1-t)a + tb` hit it.

**Sibling audit (the grep).** `grep -rn 'split(/(?=' src3d/ src/ server/` found **four** copies of the same paren-blind split, all in `parse3.ts`, and **none** in the 2-D app or the server (so nothing to file cross-product):

| Site | Reached by parens today? |
| --- | --- |
| `parseSymExpr` | **yes — the reported defect** |
| `parseVecExpr` | reachable; its `TERM` has no paren group, so such input failed there too (honestly, via the term regex) |
| `parseParamExpr` | no — only ever receives paren-inner content, which `[^()]+` forbids from nesting |
| `parseLinearEq` | no — parens are stripped and a leftover paren hard-fails before the split |

**Decision.** ONE exported `splitTopLevelTerms(src)` — depth-tracked, each term keeping its own leading sign, `null` on unbalanced parens (all-or-nothing, never a half-read) — replaces all four copies. The three provably-unreachable sites are converted too: not to fix a live bug, but so the mechanism has a single implementation and the next grouped-coefficient feature cannot re-open the class at a site someone forgot. Four ad-hoc copies collapsing into one helper means the chokepoint registry **shrank**; no list grew.

**Behaviour delta is provably confined.** A paren-aware split differs from the naive one only on input containing parens with an internal sign — which today is rejected everywhere. At the three converted sites the term grammars have no paren group, so such terms still reject honestly; only `parseSymExpr` (whose `SYM_TERM` does) newly accepts. Full 3-D suite confirms zero movement elsewhere.

**Capability gained.** The affine-in-one-symbol vector lane now accepts the standard textbook interpolation `AS = (1-t)u + tw` (and `(2t+1)v`, `(t-1)u`, pair atoms `(1-t)AB + tAC`, and purely numeric groupings `(1-0.25)u`), in both product forms — `*`/`·` or juxtaposed. An unpinned symbol remains a free sampled DOF (ADR-3D-010/ADR-052); a later ⟂/∥ given pins it as before.

**Locked by** `paren-coefficient.test.ts` (14): the tokenizer itself (top-level breaks, byte-compatibility with the naive split on paren-free input, unbalanced → null); both reported forms; sign mirrors; named AND pair atoms; the two-symbol refusal still standing; the pre-existing V7/`parseLinearEq` forms byte-identical; and the operator's exact input end-to-end through the real store path in **both locales**, plus a semantic gate — `AS = (1-t)AB + tAC` places S on line BC at every seed — and a free-DOF gate proving S is not frozen at one placement.

## ADR-3D-069 — One grammar for a coefficient: the divided symbol inside a sum (issue #300; extends ADR-3D-068)

**Status:** Accepted (2026-07-24; bug, P2). *Files: `src3d/parser/parse3.ts` (`PARAM_TERM` + `parseParamExpr`; the `(k/2)` carve-out DELETED from `parseSymExpr`); `src3d/parser/catalog3.ts` (+1); `src3d/__tests__/paren-coefficient.test.ts` (14 → 18).*

**Operator report (continuing from #299).** «this works but then i run into this issue which is more complex `AM=(0.5+k/6)u+(k+3.5)w+0.5v`. I assume we will also need to support 2 params in a statement»

**Class.** *A **coefficient sub-expression** is read by **two different grammars depending on where it sits** — a whole-paren fast path or the shared term scanner — and the shared one is the poorer, so a form supported in isolation is rejected inside a sum.* The same family as ADR-3D-068 (one notion, two implementations) one level down: 068 was the **split**, this is the **term**.

**Root cause.** ADR-3D-068's tokenizer split the operator's input correctly; each term was then read term-by-term:

```
(k+3.5)w  → ok {k:3.5,p:1}      (k/6)u     → ok {k:0,p:1/6}
0.5v      → ok {k:0.5,p:0}      (0.5+k/6)u → NULL
```

`parseSymExpr` carried a dedicated branch matching `^([a-w])/(\d+)$` — the `(k/2)` form — so a lone divided symbol never reached `parseParamExpr`, whose per-term regex `^([+-])?\s*(\d+(?:\.\d+)?)?\s*([a-w])?$` had **no division and no fraction at all**. Hence `(k/6)u` worked and `(0.5+k/6)u` did not: the moment `k/6` was one term of a sum it fell to the poorer grammar. The carve-out was not incidental to the bug — **it was what hid it**, masking the general path's poverty for the one shape the corpus exercised (docs/17 §2.1: a dedicated `if` at a shared decision point is the reliable patch signal).

**Decision.** Widen the shared grammar and **delete the fast path**. `PARAM_TERM` now reads the rational forms a parameter coefficient actually takes — `5`, `3.5`, `1/6`, `m`, `2m`, `m/6`, `2m/3`, `1/6m` — with a denominator permitted on either side of the symbol (`2k/3` and `1/6k` are the same number and students write both), a zero denominator refused rather than becoming a silent `Infinity`, and a bare sign or lone `/3` rejected. `parseSymExpr` then routes **every** parenthesised coefficient through the one grammar. The chokepoint registry shrank again: 068 removed four duplicate tokenizers, 069 removes the last special-cased coefficient reader.

Everything downstream of `parseParamExpr` inherits the widening for free — parenthesised plane coefficients (`(m+6)z`), parametric line components, and symbolic vector coefficients now all read the same forms.

**The two-param assumption — corrected, and filed separately as #301.** The operator's statement carries exactly **one** parameter, `k` (`u`,`v`,`w` are the declared basis vectors, not parameters); both coefficients are affine in `k` and exactly representable by the existing `LinExpr {k, p}` — `0.5 + k/6` → `{k:0.5, p:1/6}`, `k + 3.5` → `{k:3.5, p:1}`. **No new engine capability was needed for this input**, and none was built. Verified alongside: two *different* parameters in *separate* statements already work at the figure level (`AM = (k+1)u + 0.5w` then `AN = (m+1)v + 0.5w` — distinct free DOFs); the "one parameter per figure" limit lives only in `parseLinearEq`. Genuinely two unknowns in ONE expression (`AM = ku + mv`) remains unsupported — a real boundary in the data model (`LinExpr` is affine in a single symbol) that brushes the no-CAS D3 line, with an existing Greek two-unknown lane (`P על AM כך ש-KP = αu + βv` → `point-in-span`, Cramer). Scoping questions posed to the operator in #301; deliberately not bundled into a bug fix.

**Locked by** `paren-coefficient.test.ts` (18): the divided symbol inside a sum in all four orders/signs; the operator's exact expression decomposed to both affine coefficients; the widened grammar's rational forms *and* its refusals (zero denominator, second symbol, bare `/3`, trailing junk); `(k/2)DB + kDC` asserted byte-identical **after** the carve-out's deletion — the proof that the general path subsumes it; the `parseLinearEq`/parametric-line forms unchanged; and the operator's statement end-to-end through the real store path in both locales.

## ADR-3D-070 — A symbol the constraints have DETERMINED is a number, not a parameter (issue #302)

**Status:** Accepted (2026-07-24; bug, P2). *Files: `src3d/engine/dataView.ts` (`parametricDecomp`'s parameter test); `src3d/__tests__/determined-symbol.test.ts`.*

**Operator report (localhost session `nusn7bus`).** «the `AM⃗=(0.5+k/6)u+(k+3.5)w+0.5v` was accepted but the data panel cannot tell me what SM is.»

**Class.** *A symbol the constraints have nailed to a CONSTANT is still counted as a free parameter, so one determined symbol anywhere in the figure suppresses every parametric row.*

**The figure.** A box with `O` the base-diagonal crossing, basis `AA'=v, AB=w, AD=u`, `AS=(1-t)u+0.5v+tw` (symbol `t`), `SO⊥ABCD`, `AM=(0.5+k/6)u+(k+3.5)w+0.5v` (symbol `k`), then `SM`. Measured over seeds 0/1013/2027/7/33: **`t` = 0.500000 at every seed** (⊥ residual 0 — in a box the base normal is `v`, so `SO`'s `u` and `w` components must vanish ⇒ t = ½), while **`k` roams** (0.20, 0.78, 0.22, 0.39, 0.51). The panel printed `AS = 1/2·v + 1/2·w + 1/2·u` and `SO = −1/2·v` — both stable *because* t is fixed — but `SM` got no row at all.

**Root cause.** `parametricDecomp` counted parameters by inspecting the PIN KIND:

```ts
.filter(({ vd, i }) => vd.symbol && !c.symbolPins.some((p) => p.def === i && p.rel === 'value'));
if (syms.length !== 1) return null;
```

`t`'s pin is `rel:'perp'`, not `rel:'value'`, so it was not excluded → two "parameters" → bail. This is the docs/17 §2.2 tripwire: the predicate encodes a **proxy** (*what kind of pin does it have*) rather than the **semantic fact** (*does this symbol actually vary*). [ADR-3D-067](#adr-3d-067)'s own wording states the intent correctly — "a value-pinned symbol is a number, not a parameter" — it simply tested pin kind. In the #297 figure the driven `t` genuinely roamed (0.15–0.38, the apex being free), so proxy and semantics agreed there and the gap stayed hidden; here a driven `t` is constant and the proxy is just wrong.

**Decision.** Decide it by MEASUREMENT: a symbol-carrying def whose own vector (`from → unknown`) has a *stable* numeric decomposition across the sample seeds is determined — a number. `basisDecompose` already computes exactly that (it is why `AS` prints numerically today), so the predicate is a reuse of the shared sample set, never a second sampler (M3). Value pins stay excluded as before. Then: one roaming symbol → the parametric row; **zero or ≥2 roaming → honest `null`** — two genuinely free symbols is the #301 two-parameter boundary and must never be faked as a single-parameter form.

**Result.** The panel (and, sharing `parametricDecomp` since ADR-3D-067, the query lane) now reports

```
SM = (k + 3)·w + 1/6·k·u
```

matching the closed form `SM = M − S = (k/6 + t − ½)u + (k − t + 7/2)w` at `t = ½` ⇒ `(k/6)u + (k+3)w` — no `v` component, independent of the box dimensions.

**Sibling audit.** `rel === 'value'` appears in `parametricDecomp`'s filter, in `positionsAtK`'s pin replacement (correct — that one *sets* a value pin, it does not classify), and in `evaluate.ts`'s residual (correct — the actual pin semantics). No other site classifies a symbol as free/determined, so this predicate was the only member. The re-typed `AC ו BD נחתכים בנקודה O` failing to parse deterministically was surfaced while reproducing (their figure was file-loaded, so it never bit them) and is filed separately as **#303** — not bundled.

**Locked by** `determined-symbol.test.ts` (8): the operator's figure rebuilt from the logged commands (all facts ok); the measured `t = ½` at every seed with a genuine ⊥ residual < 1e-9 and `k` taking many values; `SM` reported parametrically; the **numeric** closed form verified against the engine at k = 0, 1, 2.5 across three seeds (u-coefficient `k/6`, w-coefficient `k+3`, zero `v`); the panel keeping its pre-existing `AC`/`DB`/`AS`/`SO` rows; and the class cases — a roaming driven symbol still parametric (the #297 regression), a wholly free symbol still parametric, and two roaming symbols returning `null`.

## ADR-3D-071 — Two named diagonals are recognised by LETTER GROUPING, not by counting the word (issue #303)

**Status:** Accepted (2026-07-24; bug — reclassified P3 → **P1 on reproduction**, a silently wrong figure). *Files: `src3d/parser/parse3.ts` (`diagIntersection`); `src3d/__tests__/diagonal-pair.test.ts`.*

**Origin.** Surfaced while reproducing #302: the operator's figure was file-loaded (load replays stored commands, ADR-3D-005), so re-typing its steps is what exposed this. Filed as a phrasing gap; reproduction showed it is worse.

**The real defect — a silently wrong figure.** On a box, `האלכסונים AC ו BD נחתכים בנקודה O` placed **O on the midpoint of edge AB** — distance 0 to mid(AB), 0.663 to the actual face centre — with no error and no amber. The student named the diagonals `AC` and `BD`; the crossing must be the face centre.

**Class.** *The parser decided "are two diagonals named explicitly?" by counting a WORD rather than reading the STRUCTURE.* `twoDiag` was `(s.match(/אלכסו[ןנ]|diagonal/gi) ?? []).length >= 2`, but the Hebrew plural `האלכסונים` names **both** diagonals in ONE word, so the count was 1, the two-diagonal branch was skipped, and the four labels fell through to the named-quad branch — read as the cyclic quad A→C→B→D, whose diagonals are A–B and C–D. Hence the edge midpoint.

This is the third member of the same family in one session ([ADR-3D-069](#adr-3d-069) coefficient grammar, [ADR-3D-070](#adr-3d-070) parameter classification): **a proxy signal standing in for the semantic fact** (docs/17 §2.2).

**Decision.** The distinction is already in the tokenizer — it is how the student GROUPED the letters. `RUN` splits label runs, so `AC ו BD` is **two runs of two** and `ABCD` is **one run of four**; that *is* the semantic difference between "two named diagonals" and "a named quad". `twoDiag` is replaced by that grouping test. The emission is unchanged (`point-on-segment3` at t=0.5 on the first named diagonal), so the M1 existing-id behaviour of ADR-3D-047 is preserved and the diff stays minimal — only the trigger was wrong. `האלכסון AC והאלכסון BD` (the form that already worked, two occurrences of the word) is also two runs of two, so it keeps its behaviour by construction rather than by a second branch.

**Two phrasing seams found by the tests, fixed in the same rule.** (1) `…at point O` did not match the trailing-point marker — the Hebrew `בנקודה` carries the noun inside the word, so the English noun was simply missing; with it unmatched the id fell back to the FIRST label and the rule built a garbage quad. (2) The verb gate spelled the noun `intersection` but not the verb `intersect`, so `…intersect at point O` fell through while `…meet at O` worked.

**Deliberately NOT widened: the noun-less form.** `AC ו BD נחתכים בנקודה O` / `AC and BD meet at O` still defer to the LLM (which lowers them correctly — it is what produced the operator's saved figure). Without the diagonal noun the utterance says only that two segments cross; placing the crossing at the midpoint of the first would assert a parallelogram the student never stated (ADR-052), and two arbitrary segments in R³ are generally skew. A future general "two segments meet" construct would need an apply-time coplanarity/face check — out of scope here, and asserted as deferring so the choice is visible.

**Locked by** `diagonal-pair.test.ts` (8): the Hebrew plural, the hyphenated conjunction with the `נפגש` verb, the per-diagonal repeated word, both English verbs — each checked GEOMETRICALLY at three seeds (O is the AC and BD midpoint, and explicitly **not** the AB midpoint, the pre-fix position); the named-quad, base-sentinel and point-first forms asserted unchanged; and the noun-less forms asserted to defer.

## ADR-3D-072 — A derived vector decomposes in the DECLARED span, whatever its rank (issue #311)

**Status: accepted, 2026-07-25.** Operator (local test, same-day triage → fix): pyramid ABCS, `SD=(2/3)SB`, `F אמצע SC`, `BC=v`, `SB=u`, `FE=u/6-v/6`, segment `DE` — querying DE answered «לא נקבע על ידי הנתונים», though DE = ⅓·v exactly (E and D land at their closed forms at every seed; verified before fixing).

**The class (docs/17 §1):** a derived-vector decomposition over a figure with FEWER THAN THREE declared basis vectors was refused wholesale instead of being solved in the declared span. Three explicit gates carried it: `basisDecompose` (`if (basis.length < 3) return null`), `parametricDecomp` (same), and the query lane's `vectorForms` — which, despite #297's "the query shares the panel's engine", still held its own INLINE copy of the 3×3 solve with its own `length === 3` gate (the panel/query duplication #297 was meant to end had survived in one function). A planar sub-figure — «SB=u, BC=v» with everything happening in plane SBC — is a very common bagrut shape (the V8-g 2-D lane exists because of it), and EVERY panel/query decomposition on such a figure bailed regardless of derivability.

**Fix (rank-aware, honest):** a shared `nBasisSolve` — n=3 keeps the exact `solve3x3`; n=1..2 solve the n×n Gram normal equations and are accepted **only when the residual vanishes** (2e-4·scale — far above solver noise, far below any genuine out-of-span component), so an in-span target decomposes over the declared names and an out-of-span one stays honestly null, never a least-squares guess printed as knowledge. Coefficients pad to the fixed triple every consumer uses; the per-seed agreement discipline is unchanged. `vectorForms` now calls `basisDecompose` (the inline copy DELETED — the chokepoint shrank); `parametricDecomp`'s gate drops to ≥1, so symbolic decompositions inherit the widening for free.

**Locked by** `two-basis-decomp.test.ts`: the operator's EXACT sequence (parse3-driven) → `DE = 1/3·v` in both the query lane and the panel; the `+` variant → `2/3·v` **plus the geometric explanation of the operator's "E was not placed correctly" report — E(+) provably lies ON edge SC at t=⅔ (u+v = S→C forces it), i.e. the placement was CORRECT and is now locked**; an out-of-span target (`SA`) still undetermined; the one-basis collinear case (`SD = 2/3·u`). Full 3-D lane 1,210 → 1,214 green, zero regressions.

## ADR-3D-073 — A vector atom keeps its notation under ANY coefficient syntax (issue #312)

**Status: accepted, 2026-07-25.** Operator: «in FE=u/6-v/6 the u is not underlined like a vector should be». The step-row notation regex (in-component, App3) enumerated SOME expression punctuation as atom boundaries (`[\s,.·+\-=)]` after / `[\s,:=+\-·(]` before) — `/` was missing from the lookahead and `)` + digits from the lookbehind, so `u/6`, `2v`, `(1-t)u` all silently lost the underline. The docs/17 §2.2 boundary class, display edition.

**Fix:** the formatter moved to a pure module `src3d/render/notation.ts` (`vectorNotation`/`factDisplay3`, unit-testable — it was an untested in-component closure) with SEMANTIC boundaries: a declared name styles wherever it is a standalone letter token (no letter before — digits/parens/operators fine; no letter/digit after). A juxtaposed symbol coefficient (`tw` = t·w) is deliberately NOT split — distinguishing it from a two-letter word needs the term grammar, which is the #313 MathML rework's job; this formatter never guesses. Locked by `notation.test.ts` (7): the exact report, digit/paren coefficients, plain forms, embedded-letter false-positive guards, arrow+decoration behavior.

## ADR-3D-074 — WHICH coordinate family a pin determines is semantic, never "was anything injected" (issue #315)

**Status: accepted, 2026-07-25.** Operator: «why does setting DE=(0,2,0) place A in (0,0,0)». Two layers: the VISUAL move is by-design (a pure pair/vector injection fixes direction+scale, never translation; the pivot must draw somewhere and roots the first vertex at the origin — a legitimate ADR-052 starting default, made visible by the frame-mode switch). The BUG (P1, honesty): the panel **printed `A(0, 0, 0)` as a derived fact** — the deterministic gauge origin passes the seed-invariance knowledge gate at every seed, so an invented coordinate printed as knowledge (the ADR-3D-030 Am. 2 principle violated by its own gate).

**The class — ADR-3D-054's second member, coordinate edition:** `hasFrame` («was ANY of pins/vectorPins/pairPins/planePins injected?») is a proxy; the semantic questions are per-family: a POINT coordinate (and a plane equation's d-term) needs **TRANSLATION pinned** — a real point injection; a VECTOR's coordinates (a difference — translation cancels) need the **ORIENTATION pinned** — two independent pinned directions, or a point frame, or being the injected pair itself (its coords are literally the given; a SINGLE pair pin leaves a residual rotation the gauge fixes deterministically, so sibling vectors' coords are still gauge).

**Fix:** `dataView` splits the gate into `translationPinned` (points block + planes block) and — **Am. 1, operator-validated the same hour** — a plain `vectorFrame` for the per-vector coords row: the seeds VARY the rotation/dims gauge, so seed-stability alone correctly distinguishes derivable vector coords from gauge (the operator's screenshot: with only DE pinned, u's coords suppressed while v = 3·DE — parallel to the pin — printed (0,6,0)); the first cut's `orientationPinned` gate was over-conservative and would have withheld that derivable v (the ADR-3D-054 "withheld data" sin, opposite direction). Translation is the ONE gauge the seeds never vary (the pivot's fixed anchor convention), which is exactly why the point/plane families need the explicit `translationPinned` anchor while vectors don't. The query lane's `vectorForms` mirrors both decisions (it had its own `hasFrame` copy). Locked by `frame-gates.test.ts` (6): the operator's exact sequence — no point coordinate prints, DE's own row still shows `(0, 2, 0)`, sibling vectors' coords null, the query lane agrees, and the positive direction (a real `D(0,0,0)` injection re-enables point printing). Full 3-D lane 1,223 green — every exam figure with real point pins prints exactly as before.

## ADR-3D-075 — «X=(x,y,z)» and «X(x,y,z)» are ONE statement; the figure's freedom decides drive-vs-verify (issue #316)

**Status: accepted, 2026-07-25.** Operator (reproducing an exam's part ג on the preview): the book's determining given `D(8,10,-12)` typed as `D=(8,10,-12)` refused «הטענה לא מתקיימת בציור», though it is exactly the statement that determines S (= 3D − 2B = (18,12,−18), the book answer); the no-`=` spelling worked. The docs/17 §2.3 class verbatim: the same student statement meant two different things depending on a spelling detail — `coordsClaim` parsed the `=` form straight to a verify-only claim, while `point3` (no `=`) took the M1 pivot-pin lane.

**Fix (the length-eq M1 twin + the ADR-3D-030 pin-and-arbiter pattern, at the claim APPLY seam):** on a figure with free dims, a `coords-eq` claim naming an EXISTING point lowers to a pivot pin **and stays a recorded claim** — the pin lets the pivot DRIVE the free figure to the stated coordinates; the claim remains the FINAL ARBITER, so an inconsistent statement still refuses with the claim register even where the pivot only best-efforts its pins (the 2020 wrong-K gate held only because of the arbiter — the pin-only first cut regressed it, caught by the lane). Two guards: a DETERMINED figure falls through to the plain claim lane (the V2 verify-your-answer register byte-preserved), and a SYMBOL-defined point (`SN=k·SC`) never pins (its position belongs to the symbol/root-find lane; a pivot pin on it perturbed the 2026-ב |EN|→k chain, also caught by the lane). Parser untouched — the decision is apply-time, where the figure's freedom is known.

**Locked by** `coords-given.test.ts`: both spellings on the exam figure → every fact ok and S = (18, 12, −18) at multiple seeds; a wrong coords claim on the then-determined figure still refuses via the claim lane. Full 3-D lane 1,226 green.

## ADR-3D-076 — Line↔plane angle: phrasing width, α NAMING, and the query kinds (issue #319)

**Status: accepted, 2026-07-25.** Operator (exam part ד.1): «זוית בין SB ומישור ABC היא α» — the ADR-3D-027 statement required `הישר` + `לבין` + a numeric value, so the natural exam phrasing escalated. Three additions, one seam each:

1. **The statement rule widened** (`linePlaneAngle`): the line noun optional (`ישר`/`קטע`/`מקצוע`), connectors `ל`/`ו`/`לבין`/`ובין` (the ו glues to `מישור`), value = a NUMBER (the existing drive/verify M1 lane, unchanged) **or a GREEK LABEL** (α/β/γ/δ/θ). A label NAMES the measure — a mark (`Construction3.linePlaneMarks`), never a driver.
2. **The panel derives the named value**: `α = X°` prints in the relations block when the angle is identical across sampled seeds (angles are scale-free — no scale gate; the ADR-3D-054 taxonomy). Under-determined → nothing prints, honestly.
3. **The query lane gains `line-plane` and `plane-plane` kinds** («הזווית בין SB למישור ABC», «הזווית בין מישור ABC למישור SBC», En mirrors) — both scale-free, answered whenever the shape is determined. The angle math is ONE shared helper pair (`newellNormal`/`linePlaneAngleAt` in dataView) used by the panel, the query lane, and consistent with the claim verifier's formula (`sin β = |n·u|/(|n||u|)`; dihedral = acute acos) — panel and query can't diverge (the #297 discipline).

**Recorded trap (this session, twice):** a bash-heredoc python edit ATE regex backslashes silently — the parser widening no-op'd (old-string mismatch) and the query patterns landed with `\s` (which a JS template literal renders as plain `s`). Both caught by the locks; both fixed by file-based scripts. Lesson: multi-line code edits carrying backslashes go through Write-tool scripts, never inline heredocs — and every replace asserts its old-string was found.

**Locked by** `line-plane-angle-forms.test.ts` (11): the parse matrix (He noun/connector/value variants + En), the exam flow end-to-end (α builds as a mark, the panel prints the closed-form value, both query locales agree, plane↔plane answers), and the under-determined honesty (no print, query refuses).

## ADR-3D-077 — A named plane draws as the FACE or the FULL plane, per display choice (issue #318)

**Status: accepted, 2026-07-25.** Operator: «when I write plane ABC, I would like the option to only draw the ABC plane [the face] and not the entire plane — however I do see value from the entire plane, so we need the option; UI up to you.»

**Design:** a per-plane DISPLAY mode (never geometry): `'full'` (default — today's growing, fold-anchored patch, byte-identical output) vs `'face'` — the patch is exactly the defining point-run's polygon in stated order, its name label at the centroid (the corners are labelled vertices). UI: a compact toggle button on the plane fact's step row showing the mode a click switches TO («פאה בלבד» ⇄ «מישור מלא»). The pref lives in the store like other display prefs (undoable, cleared by `clear`, one-set on load), persists in `.geo3.json` as an optional field with the **absent-means-full** convention (a toggle back to full deletes the key — files never carry redundant defaults; the #288 whitelist untouched since no command changed). An equation plane has no face — `'face'` on it falls through to the full patch. Locked by `render/__tests__/plane-display.test.ts` + `store/__tests__/plane-display.test.ts` (9: grows-vs-exact-corners, ring order, equation fallback, byte-identical full path, toggle/undo/file round-trip/lenient load).

## ADR-3D-078 — A bare prism over the parallelogram FAMILY builds oblique: base noun → מקבילון + the base's own constraints (issue #321)

**Status: accepted, 2026-07-25.** Operator: «מנסרה שבסיסה מעוין — or any other quad is not working and it did before the big fix».

**Root cause (class-first):** the grammar NEVER accepted a bare (no-«ישרה») quad-base prism — `rightPrism` and `rhombusPrism` both gate on ישרה since V0. Pre-bundle, these escalated to the LLM whose few-shot example literally taught upgrading "a prism" → "**right** triangular prism", so «מנסרה שבסיסה מעוין» came back as «מנסרה ישרה שבסיסה מעוין» and built — by silently asserting the unstated rightness (the ADR-052 cardinal sin). The prism bundle removed the invention (ADR-3D-058, #290) but built the honest oblique lane for exactly ONE base — מקבילית → מקבילון (ADR-3D-062, #295) — leaving מעוין/מלבן/ריבוע to dead-end at not-understood (and the LLM's only honest fallback, a plain «מקבילון», would silently drop the stated base shape).

**Design:** the #295 bare-prism branch (in the `parallelepiped` rule) DISPATCHES by base noun across the parallelogram family. A rhombus / rectangle / square IS a parallelogram plus its defining constraints, so each lowers to the SAME `parallelepiped` solid plus a constraint macro (the ADR-110/#199 pattern — **no new engine construct**): rhombus (`מעויי?ן`/rhombus) ⇒ `length-rel |AB|=|AD|` (adjacent sides equal), rectangle ⇒ `cos-angle (AB,AD) = 0` (a right base corner), square ⇒ both. M1 at apply routes each to a driving `ScalarPin` (free dims) and the pivot flexes the seeded base into shape at every seed; `המנסרה ישרה` (#289) still pins the tilt — and the constraint facts survive the `parallelepiped → prism4` kind conversion, landing the right prism over that base (rhombus + ישרה ≡ `prism4r`: DOF 4 → 2). The named «מקבילון שבסיסו מעוין» takes the same constraint. The ישרה forms are untouched (`prism4r`/`box`/`prism4sq` carry their base structurally).

**Bases OUTSIDE the family** (triangle / general quad / n-gon) have no oblique model — a new solid kind (base ring + free lateral vector) is a separate operator-scoping decision (tracked in #321). Until then they get a REASONED refusal: a new `oblique-prism` guidance family in `scope3` (noun anchored to the base-marker/adjectival slot so a failed utterance merely mentioning a triangle near a prism is never stolen from the LLM lane; «מנסרה נטויה» included) with He/En messages saying what works. The triage lane inherits it via its direct `classifyGuidance3` import.

**Honesty ride-along:** the LLM prompt gains the canonical rhombus example + an explicit "never downgrade a rhombus/rectangle/square base to a plain parallelogram" instruction (the property-twin of #290's never-invent rule).

**Filed, not bundled:** re-typing a constraint-macro utterance duplicates its `ScalarPin` (the same exposure as #199's equal-edges macro — the M1 re-declare no-op covers only the solid); the missing 3-D `droppedShapeNoun3` gate is tracked on #304.

Locked by `oblique-prism.test.ts` (#321 blocks: parse shapes both locales, labelled ids threading into the constraint, drive-at-every-seed asserts, the ישרה pin workflow with rotation-safe ⟂ asserts) + `scope3.test.ts` (#321 family + no-theft) + 3 catalog entries (guard-parsed both locales).

## ADR-3D-079 — Coordinate-frame givens: a ring's relation to a COORDINATE plane/axis (#324), affine SYMBOLIC point components left OPEN (#325), the book-register injection prefix (#326)

**Status: accepted, 2026-07-25.** Operator (from a book question they were entering): «I want to be able to support input saying that a plane is on [x], [xz], etc. and that it is parallel or perpendicular to that plane. I want the ability to assign 2 params in a point and leave them open until more data is available to calc them.» The driving snippet: «הבסיס ABCD מונח על מישור שמקביל למישור [xy]. נתונות הנקודות: B(2t, t, k), A(1, 4, -3). t פרמטר חיובי.»

**#324 — `coord-plane-rel`.** A named ring («הבסיס/המישור/הפאה ABCD», En base/plane/face) related to a COORDINATE plane `[xy]/[xz]/[yz]` or axis (`ציר ה-z` / the z-axis) is ONE command with four lowerings, all reducing to the axis ⟂ the named plane: ∥ plane ⇔ the ring SHARES that axis coordinate (`share`, n−1 residuals), ON the plane ⇔ that coordinate is 0 (`zero`), ⟂ plane ⇔ the ring's Newell normal ⟂ that axis (`perp`), and an AXIS object maps dually (∥ axis ⇔ `perp`; ⟂ axis ⇔ `share`; on the axis ⇔ `contains` = perp + through-origin). Apply pushes a `coordPlanePins` entry (a NEW pivot residual family — absolute-frame like injections, extent-normalized so collapse can't cheat, `planeDrive`-anchored, never gauge-frozen) **plus a recorded claim** (the ADR-3D-030 pattern: the claim is the final arbiter — on a DETERMINED figure a false statement refuses `claim-refuted` keep-prior). The compound book phrasing («מונח על מישור **ש**מקביל ל…») resolves parallel-first. **Coordinate letters are LOWERCASE by design** — uppercase X,Y,Z are point labels, so «מקביל למישור XYZ» (plane∥plane, a different future feature) is never stolen.

**#325 — affine symbolic components.** A typed coordinate component may now be `k·sym + c` (`2t`, `t`, `k`, `2t-3`; the shared `COMP` token widened, one `parseComp`). On an EXISTING point the components become symbolic pivot PINS: each distinct symbol joins the pivot as an **extra unknown appended after the coupled symbols** ([gauge 7 | dims | V8-c coupled | pin symbols] — the V8-c mechanism generalized), so `B(2t, t, k)` nets exactly one constraint (x_B = 2·y_B) and the symbols stay **OPEN** — sampled/roaming across seeds — until more data determines them (the operator's requirement; the book's later given `x_B = 4` lands t = 2, B = (4, 2, −3) at every seed). `pinSymbols` rides `PivotResult` → `Resolved3.pivot`, sign givens (`t פרמטר חיובי`) select among pivot solutions (± multi-start spread; the store's `param-sign` status check reads the pivot's solved value), and the DOF cue counts each symbolic component as a constraint and each distinct symbol as an unknown. A NEW single-symbol point gains coefficients for free (`M(2k,1,3)` → the ADR-3D-032 coord-sym LinExpr); a NEW **multi**-symbol point keeps the honest `symbolic-new-point` refusal (no figure to ride), and a pin symbol clashing with the coord-sym figure parameter refuses `two-params` (two mechanisms may not own one letter). Known approximation (pre-existing): `scalePinned` counts ANY point pin as scale-pinning — an all-symbolic pin doesn't truly pin scale.

**#326 — the injection-list prefix** reads the book register: «נתונות הנקודות:», «נתונה הנקודה», bare «הנקודות …», "given the points" — one alternation on the ADR-3D-007 list rule (all-or-nothing item semantics unchanged; symbolic components ride the list).

**Filed not bundled:** `symbol-value` (`k = ½`) does not yet assign a PIN symbol; a dedicated `t = …` data-panel row (the determined value already surfaces through the point's printed coordinates via the multi-sample gate).

Locked by `book-coordinate-givens.test.ts` (15: parse all forms He/En + no-theft, the verbatim book snippet e2e — x=2y at every seed, z forced by ∥+A, t OPEN then determined, sign accepted, claim-refuted on false statements, drive-alone horizontal base, both guard refusals) + 6 catalog entries (guard-parsed both locales) + the save-whitelist entry.

**Am. 1 (same day — operator: «we need to include all kinds of hebrew variants to these inputs. also for t, we should have t>0 and t<0»):** the phrasing family widened. (1) The **ב-preposition register** — «מונח/נמצא/שוכן **ב**מישור המקביל למישור **ה-**xy» (the ה-article on the coordinate letters already resolved via the unanchored object search); «אנכי ל» joins the ⟂ words. (2) **Polygon-noun subjects** («המרובע ABCD מונח במישור [xy]», «המשולש ABC נמצא במישור xy») — the V8-g flat-polygon rule used to claim these and **silently DROP the plane clause**; `coordPlaneRel` now runs FIRST in RULES (safe: only the lowercase-coordinate object admits it) and emits the polygon solid + the constraint, so a first-line statement builds the shape AND honours the clause (an existing polygon re-declare is the ADR-3D-047 idempotent no-op). (3) The **definite bare «הבסיס»** («הבסיס מונח במישור המקביל למישור ה-xy», "the base lies in a plane parallel to the xy-plane") parses with `ids: []`, resolved at APPLY to THE one solid's base ring (`baseRingOf` — base-ids-first is the engine-wide drawing convention; zero/many solids → honest `no-such-solid`; the ADR-3D-048 context-at-apply pattern). (4) `paramSign` gains «הפרמטר t חיובי», «t הוא מספר חיובי», "the parameter t is positive/number"; the comparison forms **`t > 0` / `t < 0` already parsed** (the ADR-3D-032 `[<>] 0` branch now reaching pin symbols) and are LOCKED end-to-end — a sign contradicting the determined value (`t < 0` after t = 2) refuses `sign-unsatisfiable`. Catalog +2; the variants + bare-base e2e + sign locks join `book-coordinate-givens.test.ts`.

**Am. 2 (same day — operator dev test: «the [xy] part worked but the t and k thing dont seem to work»):** the engine was solving correctly on every solid tried; the failures were VISIBILITY and the book's punctuation, plus one real solver-honesty bug the investigation exposed. (1) **The data panel now tells the symbols' story** — a `params` section (`dataView`): a determined pin symbol prints its value (`k = -3` — forced by ∥[xy]+A), an open one prints `t = ?` with a "free parameter — pinned once more data arrives" hint; before, the operator saw only `B(?, ?, -3)` and the typed given seemed to vanish. (2) **A trailing sentence period is decoration** — `normalize3` strips it (book lines end with «.»; «t פרמטר חיובי.» dead-ended to the LLM). (3) **The book states the sign in the same sentence** — «נתונות הנקודות: B(2t, t, k), A(1, 4, -3). t פרמטר חיובי» — the list rule picks up a trailing sign clause; any OTHER meaningful trailing text now DEFERS the whole utterance (the loose tail-scan used to drop it silently). (4) **The ADR-052 conformance bug**: an under-determined pin symbol read as DETERMINED — the LM's soft anchors parked every seed at the same manifold point (`t = 6/5` printed as fact while t was free). Fix in `solvePivot`: each open pin symbol gets a SEED-DEPENDENT soft anchor (the `dims0` mechanism, weight 1e-4), **sign-aware** (a stated «t חיובי» parks the seed-target on the stated side, so the sign filter never fights the anchor); any solve with pin symbols is `anchored` — acceptance moves to the PRIMARY residuals (the planeDrive discipline). A determining given overrides the pull exactly as it overrides dims0 (t = 2 still lands to 5 decimals). Locked: t VARIES across seeds (the openness itself is now asserted), the params rows, and the punctuation forms — `book-coordinate-givens.test.ts` (23).

**Am. 3 (same day — operator screenshot: «t > 0» refused `sign-unsatisfiable`, «what am i doing wrong»):** nothing — a branch-selection bug. On their figure `AB=7` + A(1,4,−3) makes t DISCRETE — (2t−1)²+(t−4)²=49 ⇒ t = 4 or t = −1.6 — two exact solutions sharing ONE gauge. Two gaps compounded: (1) `collectAll` (keep every distinct converged solution so a sign can select) fired only on point `signGivens`, never on `paramSigns` — best-per-mirror kept a single basin, and when both mirrors parked at t = −1.6 the sign had nothing to select from; (2) the solution-dedupe signature probed only the TRANSFORM's action — two symbol roots share the gauge, so even a collected second root was deduped away. Fix: `collectAll` also fires for `nPinSym > 0 && paramSigns.length > 0`, and the signature appends the pin-symbol values (suffix only when `nPinSym > 0` — existing sign-given figures byte-identical). «t > 0» now lands t = 4, B = (8, 4, −3) at every seed; «t < 0» lands −1.6. Locked in `book-coordinate-givens.test.ts` (25). Filed, not bundled: the query lane's definite «נפח המנסרה» (no vertex run) isn't resolved to THE solid — the run form works.

## ADR-3D-080 — A pyramid over EXISTING points is a STATEMENT (right-apex seating), and plane riders land in GENERAL POSITION (operator follow-ups, 2026-07-25)

**Status: accepted, 2026-07-25.** Operator (continuing the ADR-3D-079 example): «I said S is on A'B'C' plane. It is located close to A or on A itself (wrong location in that case). i said SBCD פירמידה ישרה and it was not supported».

**(1) General position for plane riders.** «S על מישור A'B'C'» placed S ON the correct plane (the geometry was right) but the ADR-3D-015 rider samples u,v around the run's centroid with a whole-figure spread and NO separation guard — at the operator's seed S parked ~2 units from a vertex of a 7-unit prism, reading as "on A". Fix at the sampling site (the 2-D ADR-253 general-position pattern): candidate k=0 keeps the LEGACY sample keys (an already-clear figure is byte-identical); when the candidate sits within 0.22·spread of ANY placed point, deterministically step through k=1..11 re-samples and keep the first clear one (else the best-separated). Stability preserved (keys are id+seed-based; only earlier points are read).

**(2) «SBCD פירמידה ישרה» over existing points — the M1 class again** (the solid-statement member ADR-3D-047 didn't cover): every id existed, so the solid apply refused `'B' already-defined`. Now a pyramid-family solid command whose ids ALL exist lowers to a STATEMENT: draw the pyramid's ink (base ring + lateral edges, idempotent — scene dedupes solid-edge ink); a RIGHT kind (`pyramid3/3e/4/4r`) adds the rightness — **a free plane-rider apex is SEATED at the closed-form right-apex** (a new derived `right-apex` point kind: the ⊥ line through the base's centre — triangle: `circumcenter3`, the V5 solid convention; quad: centroid — cut with the carrier point-run plane; carrier ⊥ base ⇒ left unplaced, honest; gauge-frame like its inputs), so S lands exactly where |SB|=|SC|=|SD| on its stated plane, 0 DOF (the ADR-255 reseat pattern: a stated condition is information about where the loose rider belongs); **any other apex takes equal-lateral-edge `length-rel` givens** (apex over the circumcentre ⇔ equal lateral edges), M1-routed — they DRIVE free dims or VERIFY a determined figure (a cube's «BCDA' פירמידה ישרה» refuses honestly; «BDA'A» verifies). A NON-right pyramid statement just draws (no invented rightness, ADR-052). Partial id overlap keeps the honest `already-defined`; non-pyramid solids stay out of scope (noted).

Locked by `right-apex.test.ts` (5: the operator's figure — rider clear of every vertex at 3 seeds; SBCD seats S with |SB|=|SC|=|SD| on the carrier; cube verify/refute/draw-only) — the seating is exact to the pivot floor.

**Am. 1 (same day — operator: «SBCE פירמידה ישרה» → «אין מיקום של הגוף שמתאים לשיעורים הנתונים»):** the APEX of an all-existing pyramid statement is identified **semantically at apply, never by letter position**. «SBCD» worked because B,C,D is a consecutive run, so `orientPyramid`'s apex-first heuristic fired; «SBCE» is not a run (E is a CONSTRUCTED letter — points made by the figure defeat any alphabet heuristic, the class), so the parse fell back to apex-LAST and the statement was read as base S,B,C with apex E — driving |ES|=|EB|=|EC|, which the pivot honestly found unsatisfiable. Fix at the M1 branch: the **unique free plane-rider (or already-seated `right-apex`) among the ids IS the apex** — the ids re-orient around it; with none or several such ids, the template order stands (the cube locks are byte-identical). «SBCE פירמידה ישרה» now seats S over circum(B,C,E): |SB|=|SC|=|SE| exact at every seed. A SECOND right-pyramid statement on the same seated apex (SBCD then SBCE — circumcentres differ) refuses keep-prior, honestly; the refusal currently wears the coarse `injection-unsatisfiable` message — a statement-flavored blame (the 2-D ADR-276 shape) is future polish. Locked in `right-apex.test.ts` (7).


### ADR-3D-081 — a SURD tier for the data panel's number formatter (#269)

The 3-D sibling of the 2-D formatting batch ([ADR-393](06-decisions.md#adr-393)) — kept separate per the ADR-266 product isolation (the two apps' formatters are copied, never shared). `dataView`'s `cleanNum` rendered integers plain, small rationals as `p/q`, and **everything else as a 2-decimal fallback** — so a forced magnitude that the bagrut answers as a radical (`|B'E| = √5`, `|C'E| = 2√5`, `|BE| = √5/2`) read as `2.24` / `4.47` / `1.12`.

Fix: a `trySurd` tier inserted between the rational and decimal tiers — `x = (p/q)·√n` for a small NON-square `n`, ascending `n` so the SIMPLIFIED form wins (`√12` → `2√3`). **Opt-in and tight-tolerance only** (`cleanMag = cleanNum(x, 1e-5, true)`, wired at the magnitude + coordinate sites), so it can never dress up: angles (`∠SDB = 35.26°` stays decimal), plane-equation coefficients (integerized upstream), the loose `cleanCoef` (2e-3 √noise), and a genuine irrational (`π` → `3.14`) all fall through untouched. A false-positive would require a value within `1e-5` of a small-integer-coefficient surd — the same tolerance discipline the existing tiers use.

Locked by `derived-magnitudes.test.ts` (+16: the operator's √5/2√5/√5/2 cases, `√12`→`2√3`, and the no-false-surd set — 5/2, 7/3, π, and the surd-free default `cleanNum`).

### ADR-3D-082 — the P3 3-D parser/query batch: #275/#322/#328

Fourth P3-reduction slice (all 3-D). (#276 — a NEW point on a coordinate axis — is deferred: see below.)

- **#275 — a BARE parametric line «x=(0,2,0)+t(2,-2,0)»** (the textbook's exact notation, no «הישר ℓ:» prefix) escalated to the LLM. `parametricLine` now auto-binds the canonical **ℓ** on a headless `x = (…)` string. Gated to a leading `x = (` + the `+ t(…)` tail, so a plane equation (`x-y+z=1`) is never stolen; a second bare line collides on ℓ at apply — never a silently-minted ℓ2 (the ADR-3D-038 indexed names are the student's to state).
- **#322 — re-typing a constraint-macro utterance duplicated its ScalarPin.** The M1 re-declare no-op (ADR-3D-047) covered only the SOLID; a compound macro (`#199` equal-edges tetra, `#321` rhombus/rectangle/square base) re-emitted its `length-rel`/`cos-angle` on every submit — a second identical pin, dropping the DOF cue once per re-type. Fix at the one PUSH chokepoint: an `applyCommand3` **wrapper** (the reducer renamed `…Inner`) `dedupDeep`s the ScalarPin list — a deep-equal pin is idempotent, mirroring the solid re-declare. Claims are left untouched (derive3 attributes by count-delta; a re-verify is harmless).
- **#328 — the query «נפח המנסרה»** (definite bare solid noun, no vertex run) returned not-recognized while `נפח <vertex-run>` answered. `parseQuery` (which already holds the construction) now resolves a definite solid noun to THE one solid of that kind (`מנסרה`/prism, `פירמידה`/pyramid, `קובייה`/cube, `תיבה`/box — the ADR-029 / ADR-3D-048 definite-reference pattern); zero or several of that kind fall through to the honest note.

**#276 deferred** (a NEW point on a coordinate axis, «הקודקוד D נמצא על החלק החיובי של ציר ה-x»): the parser already emits the `point3` partial-pin; the `symbolic-new-point` refusal is at APPLY. Creating the new point as a free 1-DOF axis rider needs a new **`on-axis` point kind** touching apply / evaluate / solve3 / `freeDofCount3` / `sign-given` — a real mechanism (the sibling of the on-plane ADR-3D-015 / on-line ADR-3D-031 kinds), not a parser tweak. Its own slice; existing-point behaviour is unchanged today.

Locked by `p3-3d-parser.test.ts` (6: the bare-line auto-bind + named-form + plane no-theft; the rhombus-prism re-type dedup; the definite-noun + vertex-run volume queries).

### ADR-3D-083 — a symbol-pin root that COLLAPSES the driven segment is a vacuous zero, not a solution (#332)

**Class.** *A driven symbol root that makes the pin's DRIVEN segment DEGENERATE (the defined point coincident with its reference) is accepted as satisfying the ∥/⊥/length relation, committing a false-green vacuous figure.* The 3-D analogue of the 2-D anti-collapse / general-position principle ([ADR-238](06-decisions.md#adr-238) / [ADR-253](06-decisions.md#adr-253)); the 3-D symbol-pin root-finder had no such guard.

**Instance (prod session `4vx34b8y`, 2026-07-25).** `EM = k·CM` makes E a symbolic `vec-defined` point whose vector EM is fixed in DIRECTION (∝ CM) for every k≠0 — only its length/sign vary with k. `EM ∥ plane BSC` is a symbol pin on k, residual = normalised `dot(EM_dir, n_BSC)`. Because the direction is fixed, that residual is `sign(k)·const` (≈ ±0.527 in the figure) with its **only** zero-crossing at the collapse **k = 0**, where EM shrinks to a point. `evaluate.ts` selected `roots[0]` from `signChangeRoots` with no non-degeneracy filter, bracketed the sign-flip at k≈0, placed E exactly on M, and — because E *does* get a position — the store's `no-solution` guard never fired. All 17 rows read `ok`; `|EM| ≈ 6e-27`. There is no non-degenerate k that satisfies the relation for this figure, so the honest outcome is a refusal.

**Root fix (mechanism, at the chokepoint).** A shared `firstNonDegenerateRoot(c, pin, vd, pos, roots)` returns the first root whose driven segment length exceeds `1e-6 · figureScale` (`pinDrivenSegLen` picks the segment carrying the pin's unknown point — `(a,b)` for ∥/⊥-plane and `length-rel`, whichever of `(a,b)`/`(c,d)` holds the unknown for `seg-perp`/`seg-par`). It replaces the bare `roots[0]` at **both** symbol-pin root-selection sites (the main `vec-defined` sweep and the ADR-3D-056 deferred-seg-pin 2nd pass) — the two places sharing the mechanism. When no non-degenerate root remains, the point is left unpositioned, and the store's existing `seg-plane-rel`/`vec-rel`/`length-rel` post-check converts that to an honest `no-solution` refusal (keep-prior) — never a green zero-length segment.

**Why healthy figures are untouched.** A *valid* root has a driven segment of order the figure scale — orders of magnitude above `1e-6·scale` — so the first root is chosen exactly as before. The collapse it rejects sits at machine-epsilon length. Sibling audit: the guard fires on every direction/length pin family (`parallel`/`perp`-to-plane, `seg-perp`/`seg-par`, `length-rel`), so the V8-f length-rel exams (`|EN| = (√6/4)|w|`), the ADR-3D-056 `EO⊥AS` foot, and the V7/V8 ∥/⊥-plane gates all keep passing — full 3-D + server suite green (1370).

Locked by `symbol-pin-collapse.test.ts` (the exact `4vx34b8y` sequence — the impossible ∥ refuses keep-prior, E never lands on M, and it stays refused across "show another configuration").

### ADR-3D-084 — a stated pyramid/prism BASE-shape noun is never silently dropped for a contradicting default (#304)

**Class.** *A base-shape noun the parser can't build falls to the WRONG quad kind, silently dropping the stated shape's defining constraint and asserting an unstated one — and the LLM commit seam has no gate to catch a base shape lowered to a contradicting kind.* The base-noun member of the honesty-invariant class (§6): every stated magnitude/shape parses to a constraint, escalates, or errors — it never vanishes.

**Instance.** `פירמידה שבסיסה מעוין ABCDS` (rhombus base) parsed to `pyramid4gr` — a free-apex **rectangle** base (types.ts) — so the equal-sides given was lost and a right base angle was asserted the student never stated. Both the oblique (`פירמידה שבסיסה מעוין`) and right (`פירמידה ישרה שבסיסה מעוין` → `pyramid4r`) variants dropped `מעוין`. The pyramid rule had no rhombus branch (unlike the prism, closed by [ADR-3D-078](#adr-3d-078)/#321), so it fell through to the general-quad default, which happens to be a rectangle.

**Root fix — two mechanisms, one per lane.**
- **Parser (deterministic lane).** `rightPyramid` gains a rhombus branch mirroring the ADR-3D-078 prism macro (the ADR-110 constraint-macro pattern, no new engine construct): a rhombus base ⇒ `pyramidPar` + `length-rel(|AB|=|AD|)`, which drives the free parallelogram base into a genuine rhombus (all four sides equal, verified at every seed). The right+rhombus combination has no template (there is no right-parallelogram-base pyramid kind), so it **defers** (returns null → escalates) rather than emit `pyramid4r` and drop the shape. The deterministic lane is now correct by construction — a rule dispatches its base noun or defers; it never emits a kind that contradicts a stated qualifier.
- **Honesty gate (LLM lane).** `droppedShapeNoun3` (honesty3.ts), joined to the existing `droppedNewLabels3`/`droppedGivenNumbers3` battery at the `store3.submitSteps` chokepoint. Scoped to a prism/pyramid construction utterance (a bare `ABEC מלבן` completion or a flat `מרובע ABCD` polygon means something else — the §2.4 word-presence-is-not-semantics discipline), it computes the committed base's properties (`eqAdj` = adjacent sides equal, `right` = a right base angle) from the solid KIND and the explicit `length-rel(c=1)`/`cos-angle(0)` constraints, then refuses when a stated noun's defining property is absent: rhombus needs `eqAdj`, rectangle needs `right`, square needs both; kite/trapezoid have no 3-D base template ⇒ always refuse (never a silent substitute). Command-side generous per the gate doctrine (a false account only suppresses a warning; a false drop would refuse working input).

**Sibling audit.** The prism sibling (`מנסרה שבסיסה מעוין`) was already correct deterministically (ADR-3D-078) and is now *also* covered by the LLM-lane gate. The whole 3-D catalog is proven gate-clean (the `honesty3.test.ts` false-positive net now runs `droppedShapeNoun3` over every He/En entry). **Filed, not bundled (out of scope):** a *parallelogram* right pyramid (`פירמידה ישרה שבסיסה מקבילית`) still silently drops "right" (pyramidPar is free-apex) — a pre-existing ADR-052 drop of the *rightness* adjective, distinct from this issue's base-shape contradiction; and a genuine right-rhombus-base pyramid needs the apex-over-centre construct (the ADR-3D-080 right-apex family) composed with the rhombus macro.

Locked by `pyramid-rhombus-base.test.ts` (the rhombus base builds a true rhombus at 4 seeds; the gate flags rhombus→rectangle, kite, trapezoid, and the prism sibling, passes the correct decompositions and the non-solid `ABEC מלבן`; the `submitSteps` wiring lock refuses a rhombus-base decomposition lowered to a rectangle, keep-prior) + the honesty catalog net; catalog +1.

### ADR-3D-085 — 3-D special-line phrasings never silently mis-build (centroid point-last; the אמצעי / perpendicular-bisector swallow) (#330)

**Class.** *A special-line rule (centroid / median / bisector / altitude) fixes an exact article/word/label-order, and a broader downstream rule (`planarPolygon`, the `midpoint` rule) silently ABSORBS the under-matched utterance — building the wrong figure and dropping the stated point/line.* The 3-D member of the honesty-invariant class (§6): a stated NEW point/line must parse to a construct, escalate, or error — it never vanishes into a bare polygon or a bare midpoint.

**Instances.**
- **Centroid, point-last.** `centroidRule` demanded the centroid point FIRST and the definite `ה` in `התיכונים`. The book/natural point-LAST forms (`תיכוני הפאה SAB נפגשים בנקודה P`, `מפגש התיכונים של משולש SAB הוא P`) missed, and `planarPolygon` — whose `firstLabelRun` reads `SAB` — silently built a bare triangle SAB, the centroid point **P dropped with no error**. (The #332 build only got a correct `PM` because `מפגש תיכונים` happened to escalate to an LLM that emitted the right `centroid3`.)
- **Perpendicular bisector → midpoint.** The `midpoint` rule guarded on the substring `/אמצע/`, which sits INSIDE `אמצעי` (the perpendicular-bisector adjective, `אנך אמצעי`) and `אמצעים` (the midsegment). Every such phrasing was claimed by it and reduced to a bare `midpoint-auto`, dropping the perpendicular-bisector meaning and any named line (`הישר d אנך אמצעי לקטע AB` → the line `d` gone).

**Root fix — widen the specific rules + a leftover guard on the absorbers (the ADR-024 precedence pattern, docs/17 §2.4).**
- `centroidRule` widened to both orders (point-first and point-last), `ה` optional, `פאה`/`משולש`, the construct-state `תיכוני` as well as absolute `תיכונים`, and the English point-last mirrors (`the medians of … meet at P`, `the centroid of … is P`). The centroid signal (medians + a MEETING word) keeps it disjoint from the single-median rule (`CD תיכון…`, medianFoot — no meeting word). The operator's own `P מפגש תיכונים במשולש SAB` now parses **deterministically** (no LLM).
- `midpoint` guard tightened to `/אמצע(?!י)/` — a word-boundary that excludes `אמצעי`/`אמצעים`/`אמצעית`. The perpendicular bisector then escalates honestly (its 3-D CONSTRUCT — a *plane* of equidistant points, not a line — is a **needs-operator** design decision, deliberately not built here; the fix guarantees it is never silently mis-built as a midpoint meanwhile).
- `planarPolygon` gains an ADR-024 **leftover guard**: it bows out of any utterance carrying a derived-construct signal (`תיכונ|חוצ|גובה|אלכסו[ןנ]|median|centroid|bisect|altitude|diagonal`), so a special-line statement a specific rule misses ESCALATES rather than being silently reduced to a bare polygon — closing the class beyond the two reported instances.

**Ride-along (P2 capability, low-risk).** An altitude from a vertex of a NAMED triangle — `CD גובה במשולש ABC` / `CD is the altitude in triangle ABC` — now infers the opposite side from the triangle (mirroring `medianFoot`'s vertex form), instead of escalating.

**Scope note / deferred (for the operator).** The honesty is enforced by leftover guards on the two coarse absorbers (`planarPolygon`, `midpoint`), NOT by a blanket deterministic-lane `droppedNewLabels3` gate: adding a gate to every deterministic `submit` carries a false-refusal risk on inputs outside the test corpus, and the leftover guards already close the reported class at the mechanism. A general deterministic-lane gate remains available if new absorbers surface. Still deferred as P2 (escalate honestly today, no silent wrong build): the bare angle-bisector short forms (`OD חוצה זווית AOC`, single-vertex `AD חוצה זווית A`) — they need a new point-on-bisector construct + the 2-D ADR-261/164 figure-resolution ported — and `גובה מ A` (altitude from a vertex with no side named — needs figure context + an auto-named foot). The perpendicular-bisector construct semantics (plane vs line vs refuse) is **needs-operator**.

Locked by `special-line-phrasing.test.ts` (every centroid phrasing → `centroid3` with P referenced, never a bare triangle; the book point-last form builds green end-to-end; `אנך אמצעי`/midsegment escalate; the plain midpoint and bare polygon still parse; the altitude-in-triangle vertex form).

---

### ADR-3D-086

**A save whitelist must be a TOTAL FUNCTION over the command union, not a maintained list.** *(2026-07-27; issue #288 follow-up; amends [ADR-3D-005](#adr-3d-005))*

**Context.** `deserializeFigure3` gates every loaded command against a `COMMAND_TYPES` set; an unlisted type makes the whole file `bad-file`. Because a `.geo3.json` stores the lowered commands (ADR-3D-005 — replay inputs, never positions), a type the parser emits but the whitelist omits produces the worst shape of failure available here: the figure **saves cleanly and then cannot be re-opened**. Silent data loss on a round-trip, discovered only when the student comes back to their own file.

Issue #288 found 23 such types and restored them, adding a catalog-driven guard: every `COMMAND_CATALOG_3D` example must round-trip through `serialize → deserialize`.

**The finding.** That guard cannot close the class. It reaches only the types some catalog example happens to emit, so a command with no catalog entry stays invisible to it. `inject-pair` — the V7-T2 pair-vector injection (`BD = (-4,5,12)`, emitted by `parse3`, applied by `apply`) — was exactly that: never restored, never caught, the same silent reload failure still live on `main` after #288 was called fixed. The list had already begun drifting again.

This is the docs/17 §2.2 tripwire in its structural form: a hand-maintained enumeration standing in for a property of the type system. The entries were the symptom; **the fact that the whitelist could disagree with the union at all** was the defect.

**Decision.** Replace the `Set` literal with an exhaustive classification:

```ts
const COMMAND_SAVEABLE: Record<Command3['type'], boolean> = { … };
const COMMAND_TYPES = new Set<Command3['type']>(
  (Object.keys(COMMAND_SAVEABLE) as Command3['type'][]).filter((t) => COMMAND_SAVEABLE[t]),
);
```

`Record<Command3['type'], …>` is total: TypeScript requires a key for **every** union member, so adding a command type without classifying it as loadable or deliberately excluded is a **compile error**. The whitelist can no longer fall behind the parser, because it is no longer a list — it is a function over the union, checked by `tsc` on every build. The `false` branch is retained deliberately so a genuinely non-persistable command has an honest home rather than being quietly omitted.

**Consequences.** `inject-pair` now round-trips (the one live gap; `tsc --force` confirms every other member was already classified). The catalog guard in `queries.test.ts` stays — it is a useful behavioural check — but it is no longer the thing preventing drift. Cost is one boolean per command type at the point where a type is introduced, which is where the author already knows the answer.

**Not addressed here.** A file whose commands pass this gate but fail to *build* still reports success and renders an empty canvas — a different failure (honest schema, dishonest outcome), tracked as #309; the 2-D answer is the `loadAudit` of [ADR-242](06-decisions.md#adr-242) and 3-D has no equivalent yet.

Locked by `figure-file3.test.ts` — the `inject-pair` round-trip (asserted failing before the fix) plus a gate-still-gates check on an unknown type.

---

### ADR-3D-087

**A load reports the OUTCOME, not just the schema.** *(2026-07-27; issue #309; the 3-D sibling of [ADR-242](06-decisions.md#adr-242))*

**Context.** Opening a `.geo3.json` ran exactly one check: `deserializeFigure3` validated the schema version, the file shape, and that every command type was whitelisted. On success `loadFigure` committed the facts and set `lastError: null`.

Passing that gate means the file is *well-formed*. It says nothing about whether this build can still **rebuild** the figure. A file saved by a newer build — or one holding a construct whose semantics have since changed — deserializes cleanly and then fails at `apply`. The student got a load that reported success and a **blank canvas**.

The failure was never unknown: `derive3` had already recorded it per fact in `status` (the reproduction lands `{code:'bad-solid'}` with `positions.size === 0`). Nothing looked at it. The load was answering a question — *is this file well-formed?* — that the student had not asked, and reporting the answer as though it were the one they had: *did my figure come back?*

**Decision.** Add `src3d/store/loadAudit3.ts` — a pure, read-only `auditLoad3(facts, seed)` that replays the loaded facts and returns the rows that failed, plus an `unbuildable` flag for the case the issue was filed for (nothing drew at all). `App3.onLoadFile` surfaces it as a persistent amber note, distinguishing "some steps are broken" from "this file does not open in this version", and clears it on the next submit.

**The load itself is unchanged.** A file we cannot rebuild is still the student's file, so it still opens exactly as saved and is never refused — consistent with [ADR-3D-005](#adr-3d-005) / [ADR-232](06-decisions.md#adr-232) (a load is non-destructive; one undo restores the prior session). Only the *claim* changed: the tool stops asserting the figure is fine when it is not.

Only ENABLED rows are audited — a deliberately disabled row is not part of the figure, so its failure is not something the load should warn about.

**Relation to the 2-D audit.** `src/store/loadAudit.ts` (ADR-242) audits a different axis of the same honesty problem: its `dropped` / `drift` findings compare the stored lowering against the *current parser*. That check presumes the figure builds at all. This one asks whether it does — they are complementary, and the 3-D app now has the more fundamental half. Pattern copied, not imported (docs/20 §12). The `dropped`/`drift` half remains available to 3-D if a file ever needs it.

Locked by `load-audit3.test.ts`: the unbuildable case (asserting the pre-fix state explicitly — deserialize ok, `lastError` null, zero positions — so the regression is visible in the test itself), a healthy file auditing clean, a partially-broken file naming the 1-based failing row without claiming unbuildable, a disabled broken row being ignored, and the empty-file edge.

---

### ADR-3D-088

**One relation, every phrasing: the angle operand becomes a shared atom.** *(2026-07-27; issue #337)*

**Context.** The bagrut wording

> נתון שהזווית שבין הוקטור **BE** לבין הוקטור **BC′** שווה לזווית שבין הוקטור **BE** לבין הוקטור **BA′**

reached no rule and fell to the LLM. Not for want of the relation — the engine has had it since V8-f / [ADR-3D-052](#adr-3d-052): `angle-pair-eq`, M1-routed (it drives a free-dim solid, or verifies a determined one). The gap was **purely the parser surface**.

`angleEquality3`'s operand grammar was the glued VERTEX TRIPLE alone (`∠SAB`). An angle written as *"the angle between X and Y"* — the form the textbook uses whenever the arms are named vectors or segments rather than three consecutive letters — was inexpressible in an equality. `angleSegClaim` accepted the between-form but only with a NUMERIC right-hand side; `equalAnglesGiven` reached the same relation but demanded the construction verb `יוצר`. So the relation had three partial doors and none of them fit the sentence.

This is the docs/17 §2.2 class — *one relation reachable through only one phrasing* — the same class ADR-3D-052 closed for the triple form and did not extend.

**Decision (parser only, no engine change).**

1. **A shared angle-phrase atom.** `parseAnglePhrase3` reads ONE angle phrase into its two arm vectors, accepting either surface form: the vertex triple (`∠SAB` → arms A→S, A→B) or the between-form (`הזווית שבין … לבין …` / `the angle between … and …`). The noun prefix — `הוקטור` / `הישר` / `הקטע` / `vector` / `line` / `segment` — is optional and interchangeable, because it says how the student pictures the operand, not which relation is meant. An operand may equally be a declared vector (`u`).
2. **`angleEquality3` parses each SIDE with that atom**, so the two forms are the same operand to the rule and may be mixed across the `=`.
3. **A between-form draws its named segments** (the `angleSegClaim` precedent — the student named them explicitly) and marks a wedge only where the arms share a tail. A vertex triple draws nothing, exactly as before.

**The given-framing prefix.** The corpus sentence opens `נתון ש…`. The shared prefix stripper handled the proof framing (`הוכיחו כי` / `prove that`) but not the given framing — the same class: text that frames a statement without being part of it, and which cannot change what is asserted, since drive-vs-verify is decided by the figure's freedom at apply (M1), never by the wording. So `נתון ש` / `נתון כי` / `given that` joined it, and the function was renamed `stripStatementPrefix` so its name stops under-describing what it does. All 10 call sites inherit it.

**Evidence the widening stole nothing:** the 3-D shadow-matrix snapshot pins the winning rule for every catalog utterance in both languages. After the change, the only diff is the two new entries — **no existing utterance changed which rule claims it**, across all 10 rules that now accept the given framing.

**A regression caught in flight, worth recording.** The first cut of the atom put its triple regex in a plain template literal instead of `String.raw`, so `\s+` collapsed to `s+`. `∠SAB = ∠SAD` still passed (that branch has no `\s`), while `זווית SAB שווה לזווית SAD` silently stopped parsing — a form that had worked for months. The probe caught it because it exercised the must-not-change forms alongside the new ones; the lock now asserts all three spellings explicitly.

Locked by `angle-phrase.test.ts` (11 — both languages of the reported wording, the `נתון ש` framing, noun interchangeability, declared-vector operands, mixed forms, and the unchanged triple / chained-label / numeric-RHS / distinct-point behaviours). 7 of the 11 verified failing against the pre-fix parser; the other 4 are the must-not-change guards. Catalog +1.
### ADR-3D-089 — Obliqueness is a MODIFIER of any prism kind, not a base-specific template (#349)

**Class.** *A property that applies uniformly across a family is implemented as one member's bespoke template, so every other member of the family is unreachable — and the refusal is then rationalized as a geometric limit.* The sibling of ADR-3D-069 (one grammar for a coefficient, where a carve-out HID the gap) and ADR-3D-071 (a proxy signal standing in for the semantic fact): here the proxy was "which KIND is it" for the question "is the top ring translated straight up, or freely".

**Instance (prod, log-triage 2026-07-26).** One user typed `מנסרה שבסיסה משולש` **five times** and `מנסרה משולשת` once, each bouncing off the `oblique-prism` guidance. The operator's reaction — *"we must support מנסרה משולשת and מנסרה שבסיסה משולש. not sure what adr078 would say we dont"* — was right: nothing geometric was in the way.

**Why it refused.** [ADR-3D-078](#adr-3d-078) refused because of an implementation fact, not a geometric one. `solidPositions` built every prism as *a base ring in the z=origin plane plus a copy translated upward*, and the only template whose translation was a FREE vector was `parallelepiped` — hard-wired to a 4-vertex parallelogram base:

```
prism3  (triangle)  base from (α,β)     + (0,0,h)   right
prism4  (par'gram)  AB=(1,0), AD=(dx,dy)+ (0,0,h)   right
prism4g (gen. quad) A,B gauge; C,D free + (0,0,h)   right
parallelepiped      AB=(1,0), AD=(dx,dy)+ w (FREE)  ← the one oblique template
```

Since [ADR-3D-058](#adr-3d-058) forbids inventing an unstated "right" ([ADR-052](06-decisions.md#adr-052)), a triangular base left only two options: refuse with guidance (what shipped) or assert rightness (forbidden). The guidance text even said "no oblique model exists for these bases" — true of the code, misleading about the geometry.

**Root fix.** Obliqueness is **one lateral translation**, so it becomes a flag rather than a kind:

- **`prismBaseDims` / `prismBaseRing`** (evaluate.ts) — the base ring's dims and geometry factored out of the lateral translation, per prism kind, with sample keys and ranges **verbatim** from the branches they replace (so every right prism is bit-identical). This pair *is* the mechanism: every prism, right or oblique, is now `baseRing + one lateral` — `(0,0,h)` or the free `w`.
- **`oblique?: true`** on `SolidCommand`/`SolidObj`. Dims = base dims + `(wx,wy,wz)` instead of + `height` (2 DOF more, counted by the new shared `solidDimCount`). Topology is untouched — an oblique prism has the same ring as the right prism of its kind, which is exactly why the tilt can be a flag.
- **`parallelepiped` is now a spelling, not a kind** — `apply` normalizes it to `prism4` + `oblique` at the one entry point every construction passes through (typed commands *and* loaded `.geo3.json` files), leaving **exactly one oblique code path** in the engine. The evaluator additionally treats the legacy kind as implicitly oblique, so an un-normalized one could never render as a right prism.
- **`make-right-prism` (#289) clears the flag** for any base, replacing the `parallelepiped → prism4` special case. So «המנסרה ישרה» straightens a triangular prism exactly as it straightens a מקבילון.
- **The M1 re-declare path** (ADR-3D-047) now compares obliqueness: the same prism re-declared *right* (`מנסרה משולשת` → `מנסרה ישרה שבסיסה משולש`) is the statement that it is right and straightens it, instead of the idempotent no-op that would have silently dropped the stated rightness (ADR-3D-058). The converse keeps the honest `already-defined` conflict.
- **Parser:** `parallelepiped` → `obliquePrism`, dispatching the SAME base nouns as `rightPrism` with the tilt left free. Non-template bases ride the ADR-110 constraint macros unchanged (rhombus ⇒ `length-rel`, rectangle ⇒ `cos-angle 0`, square ⇒ both).

**Deliberately still refused.** A **regular** pentagon/hexagon base: its only template asserts REGULARITY, which the student did not state — building it would trade one ADR-052 violation for another. The `oblique-prism` guidance family narrows to that plus a base-less «מנסרה נטויה», and its message now leads with what *does* work.

**Locks moved deliberately.** Five test files asserted the old representation (`kind === 'parallelepiped'`) or the old refusal; each was updated with the reason recorded in-file, and every one keeps its *semantic* assertion (a shared lateral vector, the driven base constraints, the DOF counts). The inverted ones are explicit: `oblique-prism.test.ts`'s "a base OUTSIDE the family stays the honest refusal" and `parse3.test.ts`'s "an OBLIQUE prism is refused" now assert the build. `מקבילון`'s sample key changes with its kind, so its seed-0 drawing is a different (equally valid) sample of the same free DOFs — no assertion depended on the values.

Locked by `oblique-any-base.test.ts` (the reported utterances build oblique He+En; the lateral is shared by every vertical edge AND non-vertical; the tilt varies across seeds so it is a genuine free DOF, not a default; «המנסרה ישרה» straightens the triangular prism to a ⟂ lateral and drops exactly 2 DOF; the M1 re-declare straightens rather than no-ops; the DOF cue is monotone; מקבילון unchanged at 5→3 DOF — the proof the general path subsumes the special one; pentagon/hexagon still refused) + the updated #117/#295/#321 locks; catalog +3.

### ADR-3D-090 — Rightness is a MODIFIER of any pyramid base; a base that cannot carry it is CONSTRAINED, not refused (#305, #341, #358)

**Status:** Accepted (2026-07-27). *Files: `src3d/engine/baseShapes.ts` (new), `src3d/engine/notices.ts` (new), `src3d/engine/vec3.ts`, `src3d/engine/evaluate.ts`, `src3d/engine/apply.ts`, `src3d/engine/types.ts`, `src3d/engine/solve3.ts`, `src3d/engine/claims.ts`, `src3d/parser/parse3.ts`, `src3d/parser/honesty3.ts`, `src3d/parser/catalog3.ts`, `src3d/store/store3.ts`, `src3d/store/figureFile3.ts`, `src3d/App3.tsx`, `src3d/i18n/locales/*.json`.*

**Class.** The pyramid twin of [ADR-3D-089](#adr-3d-089): *a property that applies uniformly across a family is implemented inside each member's bespoke template, so the (member × property) pairs nobody wrote simply do not exist — and the resulting gap is then reported to the student as a geometric limit.* There, obliqueness was baked into `parallelepiped`; here, rightness is baked into a kind's **dim parameterization** (`pyramid4r` hard-codes the apex at `(0.5, b/2, h)`), which is why it could not be added by the ADR-110 constraint-macro route the way a base *shape* can.

**Instances.** `פירמידה ישרה שבסיסה מעוין` deferred ([ADR-3D-084](#adr-3d-084)); `פירמידה ישרה שבסיסה מקבילית` silently dropped the stated **ישרה** and built the free-apex `pyramidPar` (#341 — an ADR-052 drop of a stated property); kite, trapezoid and general-quad bases had no pyramid at all (#358). The cross-product was enumerated by hand, so the rhombus and the general quad had prisms and no pyramids.

**Operator ruling (2026-07-27).** «פירמידה ישרה» = *all lateral edges are equal*, i.e. the apex's foot is the base's **circumcentre**, which exists iff the base is **cyclic**. When the stated base is not cyclic, **do not refuse** — constrain it into the cyclic member of its OWN family and **say what it became**:

| stated base | becomes | consumed |
|---|---|---|
| square / rectangle | unchanged (already cyclic) | — |
| rhombus | **square** | the base angle |
| parallelogram | **rectangle** (aspect stays free) | the base angle |
| kite | **right kite** | one angle |
| trapezoid | **isosceles trapezoid** | one leg |
| general quad | **cyclic quad** | one DOF |

**Why this is not an ADR-052 violation.** Nothing is invented: the base noun and «ישרה» *jointly entail* concyclicity, so the added relation is a **consequence of two statements the student made**, not an assumption the tool supplied. The precedent is [ADR-165](06-decisions.md#adr-165) (a constraint that morphs a declared trapezoid is allowed, flagged) and [ADR-123](06-decisions.md#adr-123) (a forced coincidence is allowed **with a notice**). The notice is what keeps it honest.

**Decision.**
- **`baseShapes.ts` — each quad base defined ONCE** (free dims, ring under the A=(0,0), B=(1,0) gauge, circumcentre), with `QUAD_PYRAMIDS` giving the whole family as (base, right?). The five pre-#305 kinds are driven by that same composition and come out **bit-identical** (base dims first, then the top's — the order they were already written in), so the migration moved no figure. That equivalence is the point: the general path *subsumes* the special cases instead of sitting beside them.
- **`ringCircumcentre` for EVERY base**, as the algebraic (least-squares) circle fit — exact for a triangle and for any cyclic ring, and the best-fit centre while the solver is still driving the base cyclic, which keeps the apex continuous and the residual differentiable all the way to convergence.
- **«ישרה» emits its base family's `CYCLIC_FIX`** as ordinary relations (the ADR-110 macro pattern, no new construct for four of the five): right angle for rhombus/parallelogram/kite, equal legs for the trapezoid, and `concyclic` for the general quad.
- **The concyclicity residual is the SIGNED opposite-angle form `cos A + cos C = 0`**, deliberately *not* Ptolemy. Ptolemy's `|AC|·|BD| − |AB|·|CD| − |BC|·|AD|` is non-negative, so it **touches** zero rather than crossing it and the least-squares descent stalls a visible ~1e-3 short — measured, not theorized (the general-quad lateral edges disagreed at the 3rd decimal until the form changed). This is the [ADR-3D-006](#adr-3d-006) touch-zero lesson recurring in a new place.
- **One base vocabulary.** `statedQuadBase` answers "which base did the student state?" for every rule, so a base a rule RECOGNISES is exactly one it can LOWER — the [ADR-3D-084](#adr-3d-084) class (a noun the positive-test chain did not happen to test took the "no noun was stated" path) cannot recur. `droppedShapeNoun3` now reads the same registry instead of keeping its own kind lists, which had kite and trapezoid marked permanently `unsupported`.
- **A new NON-ERROR channel: build notices** (`notices.ts` → `Derived3.notices` → App3). There was no way to say "the step committed, and here is what changed"; `guidanceNote` is refusal-only and an error would be wrong (nothing failed). Derived from the construction, so a typed figure and a loaded one show the same thing, and undo/redo stay consistent. The 2-D `coincidences` notice is the pattern copied (docs/20 §12 — copied, never imported).

**The boundary.** The auto-fix consumes FREE DOFs only. A stated value contradicting concyclicity (`מעוין` + `∠DAB = 60` + `ישרה` — a cyclic rhombus needs 90°) is a genuine over-constraint and refuses, keep-prior. Unstated defaults yield; statements never do (ADR-052 / ADR-114).

**Latent bug closed by the same predicate.** `right-apex` ([ADR-3D-080](#adr-3d-080)) seated a quad-base apex over the **centroid**. Under the ruling that is wrong, and it had never bitten only because square and rectangle were the only quad bases, where centroid = circumcentre; it would have gone live silently the moment an isosceles-trapezoid or right-kite base existed. Both now use `ringCircumcentre3`.

**Locks moved deliberately.** `pyramid-rhombus-base.test.ts` asserted the old representation (a rhombus base as `pyramidPar` + a constraint — it is its own registry base now) and the old refusal ("right + rhombus DEFERS"). The latter recorded a MISSING CAPABILITY, not a desired behaviour; it is inverted with the reason in-file, and the honesty requirement it protected — a stated shape is never silently dropped — is now met by *building* the shape and asserted as such. The shadow-matrix snapshot changed by **pure addition** (50 lines added, 0 changed): no existing utterance changed which rule claims it.

Locked by `right-pyramid-any-base.test.ts` (30: every base × He/En builds with equal lateral edges at four seeds; each base stays in its own family — a kite never renders as a rhombus, a trapezoid's legs equalize while its bases stay unequal, a parallelogram keeps a free aspect; the oblique forms keep a genuinely free apex; the notice fires for exactly the bases that changed and stays silent for square/rectangle; the over-constraint boundary both ways; the legacy kinds' dim vectors unchanged; registry totality; `ringCircumcentre` exactness) + the updated #304 locks; catalog +5.
### ADR-3D-092 — A lowercase NODE label that doesn't parse gets the CONVENTION nudge, not an LLM call (#353)

**Operator ruling (2026-07-26).** *"For the 3D case we can insist on uppercase and give a message asking the nodes to be upper case and parameters as lowercase — except for the plane equation we have open where aX+bY+cZ+D=0 are not nodes"*, and separately: angle measures are **Greek** (a latin `a` is not an acceptable angle label, so `60<a<90` needed no work).

**Instance (prod, log-triage 2026-07-26).** `as=w` — the pair A,S written lowercase — burned an LLM escalation. `AS=w` parses; so do `AM=u+v` and `AB=5` where the lowercase forms fail.

**Relationship to the existing mechanism — stated, because it is a real tension.** [ADR-3D-039](#adr-3d-039) (#181) already ACCEPTS lowercase labels where an **anchor** proves the run is a label (`∠sdb`, `הקודקוד c`); 3-D cannot take a blanket `/i` because x/y/z, k/m/t, u/v/w and R-vs-r are case-significant. A vec-rel's pair LHS is not an anchor, which is exactly why `as=w` fell through. Extending the uplift to that position would have made the input *work* instead of teaching the convention — the operator chose insist-and-teach, so that is what ships; the uplift precedent is recorded here so the choice can be revisited deliberately rather than rediscovered.

**Mechanism — proof, not heuristic.** `upperCasedLabelCandidate3` lifts maximal 2+-character lowercase runs (a SINGLE lowercase letter is far likelier a vector/parameter/coordinate, and lifting it would fight the very convention being taught) and the caller fires the message **only if that candidate actually parses**. So a genuine gap fails either way and is never masked as a style complaint — and no keyword stoplist is needed, which matters because a stoplist would have been wrong: `as` is an English word AND the pair A,S. Plane equations with symbolic coefficients are excluded outright per the operator's carve-out (#339).

The message states both halves of the convention (nodes uppercase; vectors/parameters/coordinates lowercase; angles Greek) and shows the corrected spelling.

**Mirror kept honest (ADR-346).** This is a pre-LLM short-circuit whose trigger is a PREDICATE rather than a `scope` category, so the existing register check could not see it: `session3d` in `triage.mjs` calls the same predicate in the same order, and `triage-mirror.test.ts` gained a guard asserting **both** sides call each predicate-based short-circuit (the 5th drift instance, caught before it shipped rather than after).

**Not built in 2-D**, deliberately — the 2-D grammar already accepts lowercase, so the nudge would be unreachable there; see [ADR-404](06-decisions.md#adr-404).

Locked by `lowercase-nudge.test.ts` (8: the reported case with the corrected spelling; `am=u+v`/`ab=5`; a single letter left alone; the plane-equation carve-out; a genuine gap NOT masked; the #181 uplift still winning where it applies; the pattern register untouched).
## ADR-3D-093 — A knee marks every right angle the figure ASSERTS, not a whitelist of point kinds (issue #307)

**Status:** Accepted (2026-07-24; feature). *Files: `src3d/render/rightAngles.ts` (new), `src3d/render/planeGeom.ts` (new, extracted), `src3d/render/scene3.ts`; `src3d/__tests__/right-angle-knee.test.ts`.*

**Origin.** Operator, 2026-07-24: «when I say that 2 lines are perpendicular, I would like to see a knee, but the knee should also be 3d for viewing it.»

**Half the request was already satisfied.** The knee was never a screen-space square: `scene3` built it in WORLD space — two legs of length `radius·0.07` along the actual arm directions, assembled as a 3-point polyline and projected afterwards — so it already lay in the plane of the arms and foreshortened with the orbit. That mechanism is untouched here; it is now simply fed more witnesses.

**Class.** *The knee was triggered by a whitelist of construction KINDS instead of by the perpendicularity the figure actually asserts.* The collector opened with `if (def.kind !== 'foot-plane' && def.kind !== 'foot-line') continue;`, so **every stated ⊥ drew nothing** — `AB ⊥ AD`, `u ⊥ v` ([ADR-3D-035](#adr-3d-035)), `∠ABC = 90` ([ADR-3D-049](#adr-3d-049)), `perp-plane` claims, `seg-perp` ([ADR-3D-056](#adr-3d-056)) all lower to *relations* and create no point, so the loop never saw them. Measured before the fix: `marks = 0` for all of them. This is the [ADR-167](06-decisions.md#adr-167) shape from the 2-D side — the note there called each addition "the node-definition issue, **again**" — and it violates the docs/17 §6 honesty invariant that everything the student stated is visible on the figure: a stated ⊥ left no trace at all, so the student could not tell from the drawing whether the tool had understood them.

**Sibling audit (the grep test).** The whitelist also silently dropped *constructed* right angles whose kind post-dated it: **`foot-face`** (a pyramid/tetra height to a named face, [ADR-3D-022](#adr-3d-022)) and **`foot-seg`** (a triangle altitude foot, [ADR-3D-025](#adr-3d-025)) — both measured at `marks = 0`. That is the tell that the defect is the trigger's *form*, not a missing feature: two later ADRs each added a right-angle-producing kind and neither could have known to edit a list in the renderer.

**Decision.** A new pure collector `rightAngles3(c, resolved, scale)` enumerates every perpendicularity the construction records — across `scalarPins` (`cos-angle` with cos 0, `vangle` 90°, `seg-perp-plane`), `claims` + `paramGivens` (`cos-angle-eq`, `angle-seg-eq` 90°, `perp-plane`), `symbolPins` (`seg-perp`, `perp`) and **all four** foot kinds — and derives each mark's wedge from the geometry. `scene3` becomes a consumer. Adding a new ⊥-producing construct now needs no renderer edit; adding a new *container* for ⊥ assertions is one line in one place instead of an invisible omission.

**The R³ honesty rule (the 3-D-specific part).** Two lines can be perpendicular WITHOUT meeting — on a cube `AB ⊥ CC'` holds exactly and the segments are skew. A knee there would draw an intersection the figure does not have, so a witness yields a mark only where the arms genuinely share a point: a shared endpoint by id, or a true crossing strictly inside both segments (closest-approach test, tolerance relative to the figure radius — so a square's perpendicular diagonals ARE marked, at their centre). A skew ⊥ is left unmarked and still reported in the data panel. Same rule for ⊥-to-a-plane: the vertex is an endpoint already on the plane, or the crossing inside the segment; a perpendicular that stops short of the plane gets no knee.

**A right angle is a knee, not an arc.** A stated 90° previously drew an arc labelled "90°" through the `wAngles` stream ([ADR-3D-032](#adr-3d-032) Am.). It now draws the knee instead — the textbook mark — with the arc suppressed for exactly 90° and every other stated value unchanged. Duplicate assertions of the same corner (stated twice, or stated *and* constructed) collapse via a rounded WEDGE key — vertex plus the two arm directions — the [ADR-167](06-decisions.md#adr-167) Am. (3) pattern rather than keying by point ids, so the same physical corner named two ways is marked once.

**Locked by** `right-angle-knee.test.ts` (20): every statement form He/En (segments word + symbol, named vectors, vertex angle, ⊥-plane) draws a knee; the knee sits at the shared vertex with unit legs along the arms that are genuinely ⊥; all four foot kinds (incl. the two that drew nothing); **the 3-D property tested operationally** — over four camera orientations each projected leg stays parallel to its projected arm and the corner closes as a foreshortened parallelogram, plus an assertion that the home-camera knee is *not* a right angle on screen (a fake 2-D knee would be); and the honesty set — a skew ⊥ draws no knee while the relation still holds exactly, crossing diagonals are marked at the crossing, a double assertion is marked once, and a figure with no ⊥ draws none.

### ADR-3D-091 — A parametric line's ANCHOR is optional: omitted means the origin (#351)

**Class.** *A grammar requires a syntactic part the mathematics treats as defaulted, so the shortest correct spelling of a construct is unreachable.* The small sibling of [ADR-3D-069](#adr-3d-069) (one grammar for a coefficient): nothing downstream was missing, only the entry form.

**Instance (prod, log-triage 2026-07-26).** `l1:x=t(0,m,2m-2)` — a line through the origin with a symbolic direction — came back not-understood, while the identical line written `l1:x=(0,0,0)+t(0,m,2m-2)` built fine. `parametricLine`'s body regex made the `(a,b,c) +` group mandatory:

```
/^(?:x\s*=\s*)?\(([^()]*)\)\s*\+\s*t\s*[·×*]?\s*\(([^()]*)\)$/
                ^^^^^^^^^^^^^^^^^^^^^^ required
```

Everything else already worked: the `l1`→`ℓ1` canonicalization ([ADR-3D-038](#adr-3d-038)), the affine symbolic components, the single-parameter guard, the point-pair membership lane ([ADR-3D-031](#adr-3d-031)).

**Fix.** The anchor group becomes optional and defaults to `(0,0,0)`; the #275 bare-form gate widens from `x = (` to also admit `x = t(` so the un-prefixed textbook spelling still auto-binds the canonical `ℓ`. The echoed `src` always prints the anchor, so an anchor-less input reads back as the origin it means. One regex, no new construct — the anchor-less form lowers to *byte-identical* commands to the explicit-origin form (asserted).

**Boundaries held.** A plane equation is still never stolen (the `t(…)` tail remains the discriminator), and two distinct parameters in one line stay refused (the no-CAS boundary, D3).

Locked by `origin-line.test.ts` (7: the prod utterance; equality with the explicit-origin lowering; the named/prefixed/bare forms He+En; point-pair membership intact; the anchored form unchanged; no plane-equation theft; the two-param refusal); catalog +1.
### ADR-3D-094 — a NEW point with partially-known coordinates is a `partial` point, never a refusal (issue #276)

**Class (the M1 dual, third edition).** «A membership/partial-coordinate statement about a NEW id refuses instead of CREATING the id as a free rider on its carrier — while the identical statement about an EXISTING id works.» Members already closed: on-plane (ADR-3D-015), on-line (ADR-3D-031). The axis member (prod, log-triage 2026-07-22): «הקודקוד D נמצא על החלק החיובי של ציר ה-x» lowers to `point3 {x:null, y:0, z:0}` + a sign-given; an EXISTING id becomes a partial pivot PIN (works), a NEW id fell through to the `symbolic-new-point` refusal — but with NO symbol letters the nulls aren't under-determination, they are simply UNSTATED components (ADR-052: free DOFs).

**Decision.** A new `PointDef` kind `partial {x|null, y|null, z|null}`: apply's `point3` NEW-id branch routes the zero-letters case there (the one-letter coord-sym and distinct-letters refusal lanes byte-unchanged); `evaluateSolidsAndPoints` samples each null spread-scaled off zero (general position), with a stated sign-given SELECTING the sample's sign — the on-plane `side` pattern, so the requirement holds in every seed by construction and an unsigned axis varies its side across seeds; `freeDofCount3` counts the nulls; the pivot's `satisfiesSigns` SKIPS partial-point givens (Lane-A absolute — the gauge transform doesn't apply, and judging them there would spuriously reject branches; the sampler is the guarantee, and the transactional `signsHold` final check reads true positions either way). No parser change — `onAxes` already emitted the right lowering. Locked by `partial-point-axis.test.ts` (the exact prod utterance across seeds, negative side, En mirror, the sign-less two-sided DOF, DOF count, the EXISTING-point cube lane unchanged, mixed solid+partial, the coord-sym/two-letters lanes byte-unchanged).

### ADR-3D-095 — A solid's placement is a GAUGE only while nothing in the figure is absolute (issue #367)

**Class.** *An unstated choice the engine makes is frozen at a fixed default instead of being sampled, so the default is asserted as a given.* This is M4 / [ADR-052](06-decisions.md#adr-052) in the placement dimension: the conformance smell is a quantity that is genuinely free but appears in no sampler, so "show another configuration" can never vary it and the student reads the default as information.

**Instance (operator, 2026-07-28, playing PR #356).** `פירמידה משולשת ABCD` then `l1:x=t(0,m,2m-2)` drew the line passing exactly through vertex A, and cycling configurations never separated them — *"it seems that A is hard coded at 0,0,0"*. It is:

```
seed 0: A=(0.00,0.00,0.00) B=(1.00,0.00,0.00) C=(0.60,0.57,0.00) D=(0.74,0.43,1.36)
seed 1: A=(0.00,0.00,0.00) B=(1.00,0.00,0.00) C=(0.72,0.70,0.00) D=(0.56,0.38,1.49)
seed 2: A=(0.00,0.00,0.00) B=(1.00,0.00,0.00) C=(0.46,0.66,0.00) D=(0.64,0.41,0.89)
```

Only the SHAPE dims are sampled. A and B are bit-identical at every seed.

**Root cause.** Freezing the placement — first vertex at the origin, second along +x — is *correct* while nothing in the figure carries an absolute frame: placement is then pure similarity gauge, pinning it costs nothing and buys stability. `solvePivot` returns early unless some pin exists, and a typed parametric line creates no pin, so the canonical placement was used verbatim. But a parametric line **is** stated in absolute coordinates, and the moment one exists the solid's position *relative to it* stops being gauge and becomes a real, unstated degree of freedom. Because the canonical origin and a through-the-origin line's anchor are both `(0,0,0)`, the frozen default asserted `A ∈ ℓ1` in every configuration — a given the student never gave.

**Not introduced by #356.** The explicit spelling `l1:x=(0,0,0)+t(0,m,2m-2)` has always parsed and produces the identical figure; #356 only made the anchor-less spelling reachable, and that is the spelling whose anchor lands on the gauge origin.

**Fix.** One predicate, `hasAbsoluteFrameObject(c)` — is anything here stated in absolute coordinates: an equation plane, a typed parametric line, a coordinate point, a coordinate pin? While the answer is NO nothing changes (a bare solid is bit-identical, asserted). While it is YES *and* no pin constrains the placement (the pivot's own entry condition — so the two can never disagree), the placement is **sampled**: a seed-keyed rigid motion (translation scaled to the figure's extent + a rotation about a sampled axis) applied to the gauge-frame points. Scale is deliberately left alone, so the similarity gauge — and every stated length — is untouched; the motion is rigid, asserted by `|AB|` being identical across seeds.

**General position.** Sampling alone is not enough: over 150 seeds of the reported figure the worst vertex-to-line clearance was **0.066** of an edge — visually still "on the line", the very impression the fix removes. The placement now takes the first of up to 12 seeded candidates clearing every absolute object by 0.25 × extent (best-of otherwise, so it always terminates): worst clearance over the same 150 seeds becomes **0.284**. This is the 2-D [ADR-253](06-decisions.md#adr-253) rule ("default placements land in GENERAL POSITION") in the placement dimension.

**Sibling audit.** The class is *not* "lines": grepping for the same question found the renderer asking it independently — `scene3`'s `laneA` enumerated `planes || pins || coord points` and **also omitted parametric lines**, so a figure framed by a line drew no coordinate axes. Both consumers now call the one predicate, the `scalePinned` precedent ([ADR-3D-054](#adr-3d-054)): a new absolute-frame object kind is added in one place or neither. Equation planes and coordinate points are the same class as the line and are asserted as such.

**Deliberately not bundled.** `freeDofCount3` does not count the 6 placement DOFs it now samples, so the cue under-reports on exactly these figures. That is the same honesty family but a different observable — and the operator has ruled on the cue's semantics three times ([ADR-101](06-decisions.md#adr-101), [ADR-3D-060](#adr-3d-060), [ADR-112](06-decisions.md#adr-112)) — so it is filed rather than decided here.

**Stability note.** Adding an absolute object now moves the solid once, because the figure genuinely changes character: what was a shape defined up to similarity becomes a shape placed in a frame. Adding facts to a figure with no absolute object still never moves anything (asserted).

Locked by `placement-gauge.test.ts` (7: the operator's exact sequence with every vertex clearing ℓ1 across 24 seeds; the placement varying and A off the origin; the motion being rigid — `|AB|` unchanged; the no-absolute-object figure still frozen at the canonical placement; a pinned figure untouched by the pivot; an equation plane behaving as the same class; the predicate itself).

### ADR-3D-096 — A canvas echo shows the STUDENT's form while the value is sampled (issue #371)

**Class.** *A number derived from a sampled free DOF is displayed as if it were knowledge.* The rule is the operator's own, set in [ADR-3D-030](#adr-3d-030) Am. 2 when `sample`-kind coordinate labels were removed from nodes: **a number on the canvas must be seed-invariant** — one drawing's values are not information the givens contain. The line echo was never swept into it.

**Instance (operator, 2026-07-28).** `l1:x=t(0,m,2m-2)` echoed `ℓ1: x = (0, 0, 0) + t·(0, 0.736, -0.529)` — *"it translated the m to something I'm not sure by what logic"*. The logic was: `m` is unpinned, so it is a sampled free DOF, and the echo printed the line at whatever value this seed drew. Measured over four seeds of one given:

```
seed 0: t·(0,  0.736, -0.529)     seed 2: t·(0, -1.136, -4.272)
seed 1: t·(0, -2.091, -6.182)     seed 4: t·(0, -1.338, -4.676)
```

**Root cause.** `scene3` built the echo from the RESOLVED numeric line. The student's own form was already on the definition as `src` (it is even written to the save file) and simply unused.

**Fix.** A line whose anchor/direction components carry the parameter (`p !== 0`) echoes `src` while the parameter is unpinned; with no parameter, or once a given pins it, the resolved numbers return — they are knowledge then. The 2024-Q2 figure is the lock on both sides: symbolic while `m` is open, `t·(-6, 10, -2)` once `ℓ ⟂ π` pins m = −5.

**Known residual (recorded, not fixed).** The predicate asks whether a *pinning given exists*, not whether the parameter is thereby *determined*. A degenerate given — `ℓ: x=(1,2,3)+t(m,m,m)` ⟂ a plane with normal (1,1,1), satisfied for every m — makes the root-finder return an arbitrary value that still varies by seed (−25 vs −24.92), and the echo would print it. The deeper predicate is "is this value seed-invariant", which needs the sampled set the renderer does not have; the honest general answer belongs with the under-determined-root problem, not here.

Locked by `parametric-echo.test.ts` (3).

### ADR-3D-097 — A line ⟂ a plane must be DRAWN as perpendicular: the knee and the patch's reach (issue #373)

**Class.** *A rule is stated correctly and applied to an enumeration that is one member short.* Both halves of this report are that shape, and both mechanisms already existed — only their input lists were incomplete. The third instance today, after [ADR-3D-095](#adr-3d-095) (the absolute-frame enumeration) and its renderer twin.

**Instance (operator, 2026-07-28).** On the 2024-Q2 figure, after `הישר ℓ ניצב למישור π` pins m = −5, the canvas showed a small plane patch off to one side, the line passing nowhere near it, and no right-angle mark: *"when we say a line is perpendicular, we should increase the plane or move it so it shows they are perpendicular and include a knee"*. A given whose entire content is "these meet at a right angle" was drawn as a line and a rectangle that never meet.

**Root cause A — no knee.** `rightAngles3` ([ADR-3D-093](#adr-3d-093), "every right angle the figure asserts") sweeps `scalarPins`, `claims`, `paramGivens`, `symbolPins` and all four foot kinds, but never `c.linePerps` — the record a named LINE ⟂ a named PLANE lands in. Measured: 0 marks on this figure. Note the irony: ADR-3D-093 exists precisely because the knee's trigger was an enumeration, and it replaced a whitelist of point KINDS with a sweep over recorded assertions — which was itself still an enumeration, and this record kind was outside it.

**Root cause B — the patch stops short.** The patch-growth sweep states the right rule in its own comment — *a patch must COVER every figure point that lies ON its plane, because a point drawn outside it visually contradicts the given* — and grows for on-plane points and for a side-stated point's ⟂ projection. Where a drawn LINE crosses the plane is equally a point on the plane, and is the one place a line↔plane relation is read; it was not in the sweep.

**Fix.** (A) The sweep reads `c.linePerps`, deriving the wedge from resolved geometry rather than point ids — the crossing as vertex, the line's direction as one arm, `inPlaneDir` as the other (the same second arm every segment-⟂-plane knee uses); a line parallel to the plane has no crossing and draws nothing. (B) The patch grows to include each drawn line's crossing point — general, not ⟂-specific: any drawn line crossing a drawn plane now has its crossing inside the patch.

**Boundaries.** No new construct and no new chokepoint entry; both changes are inside mechanisms that already own the question. The knee still obeys the ADR-3D-093 R³ honesty rule (a mark only where the objects genuinely meet).

Locked by `line-perp-plane-mark.test.ts` (2), **asserted to fail before the fix** (0 knees; the drawn line never entering the drawn patch's screen box) — the knee's vertex verified to lie on both the line and the plane, its arms verified mutually perpendicular with the second lying in the plane.

### ADR-3D-098 — A knee is an ANNOTATION: its size is a screen quantity, not a world one (issue #374)

**Class.** *A screen quantity is derived from a world-space proxy.* A knee is an annotation — the same family as a label, a tick or an arrowhead — and annotations are sized in the drawing, not in the model. Sizing one by a world length only works while that length happens to track the drawing's on-screen extent, and nothing enforces that.

**Instance (operator, 2026-07-28, saved figure `test3`).** A line, a plane, `הישר ℓ ניצב למישור π` — and *"there is no knee"*. There was one, at exactly the right place (the crossing `(2, 0, -10)`, the exam's own point A), drawn **2.11 px × 0.38 px**.

**Root cause.** The legs were `radius * 0.07`, and `radius` is the spread of the figure's **points**. This figure has *no points at all* — its entire content is a line and a plane — so `radius` sat at its floor of 1.5 while the drawing spanned ~10 world units. The proxy fails in both directions: measured pre-fix, the identical annotation drew **30.08 px** on a unit box and **2.11 px** here, a 14× spread. That upper direction is almost certainly the "huge knee" the operator sighted and we dismissed as a one-off (#368) — a far-flung point stretches `radius` and inflates every knee on the figure.

**Fix.** The fit's world→screen scale `k` is computed a few lines below from all the drawn geometry, and marks take no part in computing it (they are deliberately absent from `extras`), so it can be read without circularity. The wedges are still collected before the fit; only their SIZE moves after it, as `KNEE_PX / k` — the world length that draws at a fixed pixel size. Legs still run along the world arm directions, so an arm pointing away from the camera still foreshortens and the knee stays genuinely three-dimensional rather than becoming a screen-space square.

**Honest foreshortening kept.** On this figure the line's own direction projects at 0.179 of unit length — it points nearly at the camera — so its leg draws ~2.3 px against the other's 13 px. That is correct: seen almost end-on, a perpendicularity genuinely is hard to see, and the remedy is the viewpoint (#372), never a distorted mark. Only the *arbitrary* arm is chosen for legibility: a ⟂-to-plane knee's second arm may be any direction in the plane, so it is picked for maximum projected length instead of whatever `inPlaneDir` returned — a guard on the no-points fallback, which takes an arbitrary basis vector. Measured effect here: 0.984 → 1.000, i.e. negligible on this figure; it protects the degenerate case, it is not the fix.

**Also closes** the substance of #369 (marks are excluded from the projection fit): a 13 px annotation cannot escape the 44 px margin, asserted.

Locked by `knee-screen-size.test.ts` (3), **asserted to fail pre-fix** in both directions — 2.11 px on the operator's pointless figure, and 30.08 px on a compact box against the same 10–30 px band.

### ADR-3D-099 — A placement must READ correctly, not merely be correct (issue #372)

**Class.** *A geometric guarantee is enforced in the model and judged in the view.* [ADR-3D-095](#adr-3d-095) made an unstated placement a sampled DOF and guaranteed it clears every absolute object in R³ — necessary, and not sufficient: a line can miss a vertex by a wide margin in space and project straight through it. The student reads the drawing.

**Instance (operator, 2026-07-28, within minutes of ADR-3D-095 shipping).** On the reported figure, screen distance from the nearest vertex to the drawn line, home camera: 51.0 px at seed 0 but **4.9 px at seed 4** and **1.1 px at seed 8** — configurations that draw exactly the coincidence ADR-3D-095 exists to remove, reachable through the very "show another configuration" that ADR-3D-095 added.

**Operator ruling (2026-07-28).** Of the three options offered — score placements against a canonical view, adapt the default camera to the figure, or accept it — **score against the view**. The camera-adaptation route (the ADR-3D-025 face-on idea) stays deferred; it fights the student once they orbit manually.

**Fix, part 1 — the view enters the score.** `src3d/engine/defaultView.ts` holds the canonical viewing direction, and `render/camera.ts` builds `HOME_CAMERA` from the same angles, so the direction the engine optimises for is the direction the student gets (asserted frame-by-frame). Placement candidates are now scored on world clearance **and** separation in that projection. It is deliberately the FIXED default view, never the live camera: scoring against the live camera would re-place the figure as the student orbits, which is worse than the problem it solves. A plane is excluded from the projected test on purpose — it projects to a region, so a point drawn "inside" it is ordinary depth ambiguity, not a claimed coincidence.

**Fix, part 2 — the one that actually dominated.** Part 1 alone moved the worst case only 4.9 → 12.9 px, and a candidate sweep four times wider changed nothing: the projected clearances *were* being satisfied (0.279–0.611 world units) while still drawing at 4 px. The cause was elsewhere. A line's drawn extent was `scale3(ln.dir, reach)` with an **unnormalized** direction — and a direction vector's magnitude is arbitrary (`(0, m, 2m-2)` has whatever length the sampled m gives it), so a line with |dir| ≈ 8 drew eight times too long, blew out the isotropic fit, and shrank the figure into a corner. How much of an infinite line we draw is a presentation choice; it must not depend on how the student happened to scale its direction. Taking the reach along the unit direction moved the worst case 3.9 → **23.8 px**.

**Measured.** Worst screen separation over the seed sweep: **1.1 px → 23.8 px**. The widened candidate search was reverted after measuring it bought nothing once the fit was right (12 candidates, unchanged from ADR-3D-095) — the sweep was fine; the drawing scale was lying to it.

Locked by `view-legibility.test.ts` (3), **asserted to fail pre-fix**: the seed sweep's worst separation, a line's drawn length being independent of its direction's scale, and the engine/renderer view frames agreeing.

### ADR-3D-100 — A POINT-RUN plane stated ⟂ a named LINE (issue #375)

**Class.** *A relation is modelled correctly and exposed through an enumeration that covers a subset of its operand kinds.* Perpendicularity-to-a-plane is a 2×2 over {segment, named line} × {named plane, point-run plane}, and three cells were reachable:

| | named plane `π` | point-run plane `ACD` |
| --- | --- | --- |
| segment `AC` | ✓ | ✓ (`perp-plane` claim) |
| named line `ℓ1` | ✓ (`line-perp-plane`) | ✗ |

**Instance (operator, 2026-07-28).** On a pyramid + `l1:x=t(0,m,2m-2)`, «ACD אנך למישור l1» came back not-understood. Isolated by holding the line name constant: `הישר ℓ1 ניצב למישור π` parses, `הישר ℓ1 ניצב למישור ACD` does not — only the plane's *form* changed.

**Why the parser was the small half.** `line-perp-plane` exists to pin the figure's PARAMETER; its residual reads `planeAt`, i.e. `c.planes` — equation planes. A point-run plane's normal comes from positions. And since [ADR-3D-095](#adr-3d-095) made an unstated placement a free DOF, what must move to satisfy «the face ACD is ⟂ to this absolute line» is the figure's **orientation**. Verify-only was not a cheaper half worth shipping: with orientation free, a sampled placement essentially never satisfies the relation, so it would have refused `claim-refuted` almost every time. *(The issue's first scope note claimed this could route to the existing command; that was wrong and is corrected on the issue.)*

**Built on the [ADR-3D-079](#adr-3d-079) `coordPlanePins` pattern** — the nearest precedent, being likewise a figure-derived plane against an absolute frame: a `planeLinePerps` pin (residual `cross(newellNormal(ring), dir)/(|n||dir|)`, normalized by both so neither a shrinking figure nor an arbitrarily scaled direction vector can zero it for free) **plus** a recorded claim as the final arbiter; **excluded from `invariantOnly`** for the reason recorded there verbatim — an absolute-frame relation must be able to rotate the figure, and with the gauge frozen to identity the residual could never reach zero; and a failure-path drive step (3b) mirroring the plane-equation drive, so a figure already pinned by other givens is bit-identical and only an unmet relation re-solves. Measured on the reported figure: residual 6e-26, misalignment exactly 0 at every seed.

**Parsing by KIND, not by phrasing.** Rather than enumerate orders and nouns, the rule splits on the perpendicularity connective and classifies each side by what it *is* — a run of 3–4 labels is the plane, a line name is the line. Order costs nothing (the [ADR-3D-088](#adr-3d-088) principle), and neither does the noun. That is what makes the operator's own «ACD אנך למישור **l1**» work: they called ℓ1 a plane, but ℓ1 is a line and the kinds are known.

**The noun slip is BUILT and corrected** (operator ruling, 2026-07-28: option A over a guidance refusal). The pin carries `statedAsPlane`, so `buildNotices3` emits a correction — *"ℓ1 is a line, not a plane; read as «מישור ACD אנך לישר ℓ1»"* — derived from the construction, so it survives save/load and undo like every notice. Building it is not a guess: the objects' kinds are known. Silently ignoring the slip would be the dishonest option, and refusing would withhold a figure the tool fully understands.

**Rode along.** The `ניצב`/`מאונך` morphology: `ניצבים?` demands the yod and rejects the bare `ניצב` — the [ADR-3D-035](#adr-3d-035) trap, third occurrence. `holdsAt` now takes the whole `Resolved3` instead of only positions (`evaluate3` is literally `resolve3(...).positions`, so this costs nothing and stops the claim lane being blind to everything the figure resolves besides its points). The #288 save-whitelist guard and the `Command3` exhaustiveness check both caught their omissions at compile time, as designed.

**Boundaries.** The shadow-matrix snapshot changed by **pure addition** (10 lines added, 0 changed): no existing utterance changed which rule claims it. `AC אנך למישור ACD` still lowers to the segment claim and `הישר ℓ1 ניצב למישור π` still to `line-perp-plane`, both asserted. An unknown line is refused, never silently dropped.

**Am. 1 (operator, same session — "l1 is always tied to A").** The drive re-opened the coincidence [ADR-3D-095](#adr-3d-095) had closed. A ⟂-to-a-line relation constrains only which way the figure FACES; where it sits stays unstated, and the pivot's least-squares has no reason to move it — so the figure settled at its canonical origin, which is where A sits and where a line through the origin passes. Measured `dist(A, ℓ1) = 0.0000` at every seed. ADR-3D-095's general-position guard ran only on the `pivot === null` path, so the DRIVEN placement had none. It now runs on both, restricted to what the drive left free: translation is sampled and general-position-checked while the solved orientation is left untouched (re-rotating would undo the student's own relation). Translation cannot break a direction relation, so both properties hold at once — asserted together at five seeds: misalignment < 1e-3 AND every vertex clearing the line (measured 0.59–1.77 where it had been 0.0000, the drive's residual unchanged at ~1e-27). **Boundary, stated honestly:** this fires only when translation is free ENTIRELY — nothing pins where the figure sits and no absolute POINT exists for a length or angle to couple to. A partly-pinned position keeps whatever the solve chose; sampling a subspace of the residual's null space is the general form and is not built here.

Locked by `plane-line-perp.test.ts` (7: the operator's exact utterance driving the figure into place across seeds, the misalignment being genuinely non-zero beforehand so the assertion cannot pass by luck; all seven phrasings and both orders in both locales; the notice fired and not fired; the two no-theft siblings; the unknown-line refusal); catalog +1.

### ADR-3D-101 — The landing funnel: gauge-component freedom is classified, never proxied (issue #379; S0 of docs/26)

**Class.** *A boolean per-path proxy stands in for "which gauge components did the solve actually determine?"* — so every new solve path re-opens the unstated-coincidence bug. [ADR-3D-095](#adr-3d-095)'s guard was bypassed **four times in one day**: the projection (#372), the driven path ([ADR-3D-100](#adr-3d-100) Am. 1), and the two #379 doors — each bypass a different proxy (`pivot === null`, `positionPinned`, `rotationSolved`), each wrong the same way.

**The doors (found by the docs/26 design review, verified by probe before filing).** Both build `lastError: null` and draw a through-origin line through vertex A at every seed: **(a)** `AB = (1,2,3)` — a pair injection pins direction+scale but **never translation** (dataView documents the pivot rooting translation at a deterministic origin), yet `pivot !== null` read as "placed"; **(b)** `זווית BAC = 60` — the pivot runs `invariantOnly` with the gauge **frozen**, which is not solved, yet both proxies read it as placed; **(c)** `rotationSolved = pivot !== null` never re-sampled a rotation nothing had constrained.

**Fix.** One post-solve landing stage classifies each gauge component from the residual families present, **conservatively — a component is sampled only when it is PROVABLY free** (unstated pinning is the lesser evil; sampling a constrained component would undo what the solve established): TRANSLATION is pinned by point pins (even partial), plane-equation pins, memberships, and coordinate-placing coord-plane modes (`zero`/`contains`) — and by nothing else; ROTATION is pinned by any point pin (rotating about the gauge origin would drag a pinned point off its pin — rotation about the pinned point itself is a real remaining freedom, deferred and documented), vector/pair injections, `planeLinePerps`, plane-equation pins, memberships, and orientation-carrying coord-plane modes (`share`/`perp`/`contains`); SCALE is never sampled ([ADR-3D-054](#adr-3d-054) owns it). The candidate loop samples exactly the free components; the three proxies are deleted. Key insight for door (b): a rigid motion **preserves every similarity-invariant pin by definition**, so a frozen-gauge figure may be moved freely — asserted (∠BAC stays 60.0000° across sampled seeds, the pair vector stays (1,2,3) exactly).

**Deliberately deferred, stated:** partial freedoms — rotation about a single pinned point, spin about a ⟂ line — are conservatively treated as pinned; the stated-incidence allowlist (S4's intersect-givens must be exempt from the clearance guard, the 2-D [ADR-123](06-decisions.md#adr-123) lesson) enters when S4 creates the first such contact.

**Blast radius: zero.** The no-pin path samples both components with the same seed keys as before (bit-identical figures); the ⟂-drive path samples translation only, exactly as Am. 1 did; pinned figures sample nothing. `placement-gauge` (7), `view-legibility` (3), `plane-line-perp` (7) all green **through the funnel**; 3-D lane 1581 green.

Locked by `landing-funnel.test.ts` (4, **asserted to fail pre-fix**: both doors' figures with clearance + the surviving injection/angle + genuine variation per component; the point-pinned figure untouched; the Am. 1 behaviour preserved).

### ADR-3D-102 — S1 of the relations program: the operand atom, the disposition map, the battery (#378)

**What S1 is.** The instruments that stop the "enumeration one member short" class ([ADR-3D-095](#adr-3d-095)/097/098/100/101 — five members in two days) from recurring, landed with **provably zero behaviour change**: the shadow-matrix snapshot has a zero-byte diff, every existing lock is green, and the full suite passes untouched.

**Delivered.** (1) `Operand3` (engine/types) — the closed six-kind operand set; (2) `parser/operandToken.ts` — ONE tokenizer classifying a raw side-token by what it IS, noun optional, non-deciding, and *recorded* when it contradicts the kind (the [ADR-3D-100](#adr-3d-100) mechanism, extracted); (3) `engine/operands.ts` — the THUNK resolver `(at) => geometry`: absolute operands close over resolved geometry and ignore `at`, gauge operands recompute per candidate — the one seam docs/26 v2 §3.2 names for solver/claims/apply/marks consumers; (4) `engine/relationTable.ts` — the disposition map `(rel × kind × kind) → {action, status}`, total by construction (explicit cells + reasoned defaults), with `supportedCells()` as the battery's iteration set; (5) `relation-battery.test.ts` — totality test, an **exact-list lock on the supported set** (adding a cell is a conscious diff), the **battery-covered-or-consciously-pending RATCHET**, seven end-to-end battery rows (seg⟂seg He+En drive · plane-run⟂line drive+funnel clearance · line⟂π param-root to the 2024-Q2 m=−5 · seg∥plane-run structural verify · skew accept+refuse · seg↔plane 30° drive · on-plane rider), and the tokenizer unit row incl. the operator's own noun-slip.

**One migration, deliberately one.** `planeLinePerp` (the [ADR-3D-100](#adr-3d-100) rule) now classifies its sides through `readOperand` — behaviour-identical (its 7 locks + the zero-diff snapshot prove it). The remaining relation rules migrate **per-family in the slice that widens that family's cells** (S2/S3/S4), not here: migrating a rule twice — once for form, again for function — is waste, and the zero-diff gate is cleanest kept absolute. This narrows docs/26 v2's S1 wording ("re-express the existing rules") and is recorded there.

**The battery paid on its first run.** It caught that the seg↔plane relation family rejects PRIMED labels in **both** slots (`A'B' מקביל למישור ABCD` and `AB מקביל למישור DCC'D'` both fail while unprimed forms parse — an inline lexical fragment predating the prime convention, the docs/17 §3 lexicon chokepoint). Filed #380, scheduled for S3 where that family migrates anyway.

**Status honesty.** The table's `supported` set is the MEASURED truth of this session's probes, including the uncomfortable rows: parallel|segment|segment is supported *via the plural claim form only*; perp|segment|plane-**named** is `planned`, not supported — the #375 issue's 2×2 asserted that cell ✓ without measuring it, and the table now corrects the record.

Locked by `relation-battery.test.ts` (11) + the zero-diff snapshot + the untouched `plane-line-perp.test.ts` (7). 3-D lane 1592 green.

### ADR-3D-103 — S2 of the relations program: the NAMED-LINE column (#378, closes the #377 core)

**Context.** #377 (operator): *"I tried to add `B על l1` or `נקודה B נמצאת על ישר l1` and that is not supported"* — and the measured matrix behind it: a named line was a second-class operand (point-on-ℓ unreachable although `on-line` was fully built since ADR-3D-031; ∥/⟂/angle against ℓ reachable in exactly one cell each). docs/26 v2's S2 slice: flip the whole column through the S1 instruments.

**Decision — one engine family, routed by the frame classifier.** Every ∥/⟂/angle statement with a named-line side lowers to ONE new command `line-rel { rel, deg?, op: Operand3, line }` + a recorded `line-rel` claim (the final arbiter, the ADR-3D-100 shape). The FRAME CLASSIFIER (docs/26 §2.3) routes each *instance* by its operands, never its pin kind:

- **gauge op** (segment / vector / point-run plane): a pivot residual in `Construction3.lineRels` — the planeLinePerps stage generalised. The operand re-resolves from candidate positions through the ONE operand seam (`resolveOperand`); residuals are magnitude-normalized (collapse-basin-proof); `invariantOnly` excludes the family (an absolute-frame relation must be able to ROTATE the figure — the ADR-3D-100 lesson); the drive is the same failure-path retry as 3b, and the landing funnel treats a driven line relation as pinning ROTATION while translation still samples clear (general position held — battery-asserted ≥0.1 world-unit clearance with placement varying across seeds).
- **absolute op** (a second line / a named plane): a parameter ROOT-FIND when a referenced *direction* carries the figure parameter (`lineDirCarriesParam` / `planeNormalCarriesParam` — an anchor-only or offset-only parameter deliberately does not count, it cannot change a direction relation), joining `pinningGivens`/`paramRoots`/`satisfiesAllPins` with sign-change + touch-zero arms (∥ of two lines is non-negative — the ADR-3D-006 lesson). With no parameter dependence the statement is a pure claim: root-finding over a constant residual would either flood roots or fabricate a `no-roots` refusal for a parameter it cannot constrain.
- **`on|point|line`** needed no engine work at all — only phrasings: `onLineMembership` gains the optional noun on both sides (`B על l1`, `נקודה B נמצאת על ישר l1`, `point B on l1`), M1 duality intact (new id → free rider; existing id → verified/driven given).

**Parser: kinds decide, nouns never.** One rule `lineRelGiven` (⟂/∥, split on the shared connective now extracted as `PERP_SPLIT`/`PAR_SPLIT` — planeLinePerp collapses onto the same const, the chokepoint registry SHRINKS) + `lineRelAngle` (the valued angle form), both classifying sides via `readOperand`. Ownership is preserved exactly: `linePerpPlane` keeps line⟂π (the flipped «המישור π מאונך לישר l1» lands in the new rule and emits the IDENTICAL frozen lowering); `planeLinePerp` keeps plane-run⟂line; a statement with no line-kind side returns null, so every segment/vector rule keeps its cell — the shadow matrix changed by **pure addition** (110 added, 0 changed), zero new shadow pairs. The ADR-3D-100 noun slip generalises: a plane noun on the line side is recorded (`statedAsPlane`) and corrected via a new `line-rel-noun` build notice.

**Two root fixes found by the work.** (1) The RELATION_TABLE's literal cell keys were only matched when written in canonical operand order — `'perp|line|segment'` was a DEAD entry silently falling to the defaults (S1's planned-slice labels were partly fiction). `CELLS` is now re-keyed through `key()` at module init (human order can never matter; duplicate canonical cells throw). (2) A numeric «הישר ℓ ניצב למישור π» (no parameter anywhere) was **never verified** — `linePerps` only fed the root-find. It now records the `line-rel` claim when neither direction carries the parameter, so a false numeric ⟂ refuses `claim-refuted` instead of silently passing.

**Marks.** `rightAngles3` reads perp `lineRels` (segment/vector × ℓ, including a stated 90°): a knee only where the segment GENUINELY meets the line — the R³ honesty rule; a driven-but-clear ⟂ stays unmarked and lives in the data panel.

**Cells flipped (14):** on|point|line · perp/parallel/angle × {segment, vector} × ℓ · perp/parallel/angle ℓ×ℓ · parallel/angle ℓ×{π, point-run} (+ perp ℓ×π gains its claim arm). Battery: 12 new rows (drive rows assert NON-satisfaction before the statement — the anti-luck discipline — plus funnel clearance, placement variation, DOF-cue monotonicity, param roots to closed-form values, claim-refuted keep-prior, the noun-slip notice); vector twins + angle|line|plane-named consciously pending (same seam, cited). Registration surfaces: catalog +13 (He+En, guard-parsed), `COMMAND_SAVEABLE` +line-rel, LLM few-shot +1, scope3 +2 guidance families for the *unsupported neighbours* (`seg-parallel-given` → points at the supported plural claim; `plane-plane-rel` → points at the supported angle-between-planes form; the triage lane imports `classifyGuidance3` directly, so no mirror drift), i18n +3 keys both locales.

**Budget (docs/17 §7).** The gauge lane adds at most one extra `solvePivot` retry on the failure path (the 3b pattern — a figure whose relations already hold never enters); the absolute lane is a bounded 1-DOF scan. No new sampler loops.

**Out (stated).** The `l1=x:` spelling tolerance docs/26 mentions was never actually filed — left out deliberately, pending its own decision. A relation against a THROUGH-line (`pointLines`) stays claim-only (verified on final positions, never driven) — recorded in the table notes; the drive arm arrives when a real exam needs it.

Locked by `relation-battery.test.ts` (35: the exact-list lock, the ratchet, 12 S2 rows) + `right-angle-knee.test.ts` (+2) + the addition-only shadow snapshot. 3-D lane green, `tsc -b` + both builds clean.

### ADR-3D-104 — S4 of the relations program: MUTUAL POSITIONS, closed and open (#378, the operator's skew ask)

**Context.** S2 closed the named-line column for the DIRECTION relations (∥/⟂/angle). What two objects' *mutual position* is — do they meet, miss, run parallel, coincide — was reachable only as a V7-T3 CLAIM over a plural segment pair (`NK ו-PL מצטלבים`). The operator commissioned the program partly for this: *"we also have [skew]… I want to have a big task here to just do all of them."*

**Decision.** Mutual position becomes a first-class STATEMENT — `mutual-rel {rel, a: Operand3, b: Operand3}` — over the general operand pair, routed by the frame classifier like every other relation. Four decisions carry it:

**1. The CLOSED/OPEN split decides the mechanism, not the relation's name.** `parallel`, `intersecting` and `coincident` assert an equality, so they carry a residual and can drive. `skew` asserts two *inequalities* (not parallel AND not coplanar); least-squares cannot express that, and pretending otherwise is how a solver settles in a degenerate basin. So `skew` is carried entirely by the REQUIREMENT lane (sample-and-gate, the ADR-3D-064 layer), and the closed relations put their *open half* there too — that a crossing really lands within the segments. One `Requirement3` member, one predicate.

**2. A verdict about LINES is not a verdict about SEGMENTS.** The first implementation classified coplanar-but-missing segments as `skew`, and a test caught it: two coplanar segments that merely miss are **not** skew — skew means *not coplanar* — and calling them skew both reports a false property and let an impossible given («AB ו-CD מצטלבים» on a flat quad) build silently. Fixed at the source: `mutualPosition` answers about the two LINES (total, mutually exclusive), and `mutualHolds` applies the statement semantics on top, consulting the extents only for `intersecting`. «נחתכים» means the drawn segments cross — the 2-D [ADR-166](06-decisions.md#adr-166) reading, R³ edition.

**3. Residuals are SIGNED COMPONENTS, never magnitudes.** |d₁×d₂| and |w·(d₁×d₂)| are non-negative: they TOUCH zero instead of crossing it, and the descent stalls short — the [ADR-3D-006](#adr-3d-006) lesson, already restated in the `concyclic` branch. The `mutual` pin pushes the cross-product components (parallel/coincident) and the signed triple product (intersecting), all normalized by the operand magnitudes, so they are scale-free and join the gauge-frozen dims-only solve.

**4. One statement, one semantics.** «AB ו-CD מקבילים» and «AB מקביל ל-CD» say the same thing; they had two different behaviours (the plural verified, the singular was refused with a "coming" message). Both now lower to `mutual-rel`, whose apply decides claim-vs-drive per M1. The shadow snapshot freezes the winning RULE, not the lowering, so unifying them cost zero snapshot diff — and the `seg-parallel-given` guidance is DELETED rather than reworded, because guidance for a form the parser handles is a lie.

**Showing it (operator decision, 2026-07-28 — revised during play).** First implemented as a dashed common perpendicular on the canvas plus a data-panel row. The operator rejected the canvas mark on sight, and was right twice over:

- **`strokeDasharray` already means HIDDEN in this renderer** (edges, vectors, curves). A dashed rung therefore reads as "an edge behind the solid" — the opposite of its message. The original decision was taken from an ASCII mockup that never surfaced this collision; the choice was under-informed, and the fault is the question's, not the answer's.
- **The panel row used an INVENTED symbol.** There is no standard notation for skew lines — the textbook writes «מצטלבים» in words — so `AB ⤫ CD` taught a symbol that does not exist, in a panel whose neighbouring rows (`|u| = |v|`, `u·v = 0`) are genuine universal notation.

**Settled: the canvas draws nothing; the data panel says it in WORDS.** And the operator widened the ask past the reported case: *"we should also be able to calc such cases and write them if figure holds them. same of other types of intersections and parallelism and perpendicularity."* So the panel reports the relation whether it was STATED or merely HOLDS — a student organizing their data needs the forced relations they never thought to write down (a cube's `AB` and `CC'` are skew and perpendicular; nobody types that).

Three consequences follow:

- rows are emitted **structured** (`MutualRow {a, b, rel}`), not as formatted strings — with no symbol available, the words belong to the App, in the reader's language, and `dir="auto"` keeps the Latin labels LTR inside a Hebrew predicate;
- the scan's universe is the objects the student **NAMED** (drawn segments + named lines), never every solid edge — a cube's 12 edges are 66 pairs of mostly noise. Pairs sharing an endpoint are skipped: "they meet at B" is not knowledge;
- ⟂ is reported **alongside** a mutual position, not instead of it — two skew lines can be perpendicular, and both facts are true.

**A free vector has no mutual position.** `skew`/`intersecting`/`coincident` against a vector operand are `n/a` with a reason: a free vector has direction and magnitude but no place, so there is nothing for the relation to be true about. Its DIRECTION relations (∥/⟂/angle) stay fully supported — `parallel|segment|vector` and `parallel|vector|vector` are flipped in this slice.

**Cells.** 12 flipped: mutual positions over {segment, line}² (9) + the ∥ gauge cells (`segment|vector`, `vector|vector`) + `parallel|segment|segment` upgraded from claim-only to a driving given.

**Out (stated, filed as #386).** A CLOSED mutual position against an ABSOLUTE named line («AB חותך את l1») has no drive — it is honest (requirement + claim, so a false statement refuses) but M1-incomplete. The residual maths is done; what it needs is generalizing the pivot's trigger from "gauge lineRels" to "relations pinning the gauge against an absolute object", and adding a second parallel array instead would have grown the very chokepoint the program exists to shrink. `skew|segment|line` is unaffected — an open condition is what sampling is good at.

**A new pin kind must DECLARE whether it fixes the scale (found in play).** `AB מקביל ל-DC` on a free quad made the panel print `AB = 1` — a number that is pure gauge (a figure's first dim is the frozen unit) and that the student was never given. `scalePinned` ([ADR-3D-054](#adr-3d-054)) was an EXCLUSION list — `every(p => p.kind === 'vangle' || …)` — so the scale-free `mutual` pin fell through and silently defaulted to "pins the scale". Replaced by a total `Record<ScalarPin['kind'], boolean>`, so adding a pin kind without classifying it is now a COMPILE ERROR — the `COMMAND_SAVEABLE` remedy from #288, applied to the sibling list: *a hand-maintained list drifts; a total function over the union cannot.*

**Budget (docs/17 §7).** The gauge drive is one more residual block inside the existing `scalarPins` loop — no new solve. The requirement adds one `resolve3` per candidate seed, the ADR-3D-064 cost, and only for figures that state a mutual position.

Locked by `mutual-position.test.ts` (15, the pure classifier incl. the bounded/unbounded boundary) + `mutual-rel.test.ts` (17, end-to-end drives, the refusals, the canvas staying clean, the stated AND derived panel rows, the shared-endpoint filter) + `relation-battery.test.ts` (5 new rows, exact-list and ratchet updated). 3-D lane 1708 green, `tsc -b` + both builds clean.

### ADR-3D-105 — S3 of the relations program: the PLANE column (#378)

**Context.** After S2 (named lines) and S4 (mutual positions), the matrix's remaining hole was the plane: `perp|plane-run|plane-run`, `parallel|plane-named|plane-named`, `angle|segment|plane-named` and a dozen siblings were all `planned`. The capabilities existed for *some* spellings — `perpPlaneClaim`, `segParallelPlane`, `linePlaneAngle`, `angleBetweenPlanes` — each reading one operand shape.

**Decision. One rule generalizes the whole matrix.** `lineRelDeviation` already contained the insight without stating it: a relation between two objects reads off the angle between their CHARACTERISTIC vectors — a direction for a segment/vector/line, a NORMAL for a plane — and the reading **inverts exactly when the two sides are of different types**:

| sides | ⟂ means | ∥ means |
| --- | --- | --- |
| dir × dir | the directions are ⟂ ⇒ \|cos\| = 0 | the directions align ⇒ \|sin\| = 0 |
| plane × plane | the NORMALS are ⟂ ⇒ \|cos\| = 0 | the normals align ⇒ \|sin\| = 0 |
| dir × plane | the line runs ALONG the normal ⇒ \|sin\| = 0 | the line lies in it ⇒ \|cos\| = 0 |

Same-type pairs read alike; only the mixed pair flips. So `relDeviation(rel, deg, a, b)` serves every cell, and `lineRelDeviation` becomes literally this with a bare direction as side B. The stated ANGLE follows the same split — between two lines or two planes the ordinary cosine, between a line and a plane the formula sheet's sin β. **The chokepoint shrank: one function replaced a rule per cell, and the new command (`plane-rel`) carries no geometry of its own.**

Routing is the frame classifier, unchanged: gauge×gauge drives (a similarity-invariant `plane-rel` ScalarPin), absolute×absolute is a claim (or the existing `planeAngles` param-root), gauge×absolute is claim-gated — honest (true verifies, false refuses) but driveless, folded into **#386** with S4's identical cells.

**15 cells flipped**, 59 supported in total.

**Three defects found by building it, each the same shape — a guard bound to a PATH instead of to the event it guards:**

1. **The general-position guard ran on only one of the two solve paths.** `degenerate()` opened with `if (!planeDrive) return false;` and was called only from the gauge-solving loop. A similarity-invariant given routes to the `invariantOnly` dims-only solver instead, which never consulted it — so «המישור ABC מתלכד עם המישור A'B'C'» on a box drove its height to **zero** and reported success, because in the collapsed figure the two planes genuinely do coincide. A collapsed solid is not a figure whichever solver produced it: the gate is deleted and the check now runs on both paths.

2. **The landing funnel treated a plane-locked base as free to rotate.** `coord-plane-rel` mode `zero` («הבסיס ABCD שוכן במישור ה-xy») was listed as pinning translation but not rotation — yet lying IN a plane fixes orientation as surely as offset. The moment any absolute object joined the figure, [ADR-3D-101](#adr-3d-101)'s funnel judged rotation free, spun the solid, and tipped the base off the plane it was pinned to. Silent destruction of a stated given, in a figure that still reported green.

3. (Carried from S4's review, same night: `scalePinned` was an exclusion list — see [ADR-3D-104](#adr-3d-104).)

The recurrence is the point. Four times now the mechanism has been *correct* and its APPLICABILITY has been decided by a per-path proxy. Where a guard is cheap and total, prefer the total form: `PIN_FIXES_SCALE` is now a `Record` over the union; `degenerate` now applies unconditionally.

**Out (stated).** `contains` — a segment or line lying IN a plane («מוכל») — is still `planned`; it is a two-residual cell (direction ⟂ normal AND a point on the plane) and no exam in the corpus needed it tonight.

Locked by `plane-rel.test.ts` (16, incl. the pure `relDeviation` matrix and the collapse refusal) + 6 battery rows covering all 15 cells. 3-D lane 1730 green, `tsc -b` + both builds clean; shadow snapshot addition-only (60 insertions, 0 deletions), allowlist unchanged.

### ADR-3D-106 — S5 of the relations program: DISTANCE, the relation that carries units (#378)

**Context.** The last column of the matrix. The curriculum asks for four distances — point→plane, point→line, between SKEW lines, between PARALLEL planes — and the 2010-Q3 exam pins a parameter with one.

**Decision. One function, four formulas, and no special-casing of "they meet".** `distanceBetween(a, b)` dispatches on what each side IS (point / directional / planar) and returns the shortest gap. Objects that intersect are **0 apart** — that is the honest answer, not an error case, and it falls out of the same formulas: the skew-line expression `|w·(d₁×d₂)|/|d₁×d₂|` is exactly 0 when the lines cross; a line piercing a plane is 0 from it. The curriculum's four cases are simply the configurations where the answer is *interesting*, which is why they are the ones textbooks name.

**The one relation that carries UNITS.** Every other relation in this program is an angle or a ratio — similarity-invariant, leaving the gauge alone. A distance is an absolute size, so:

- as a GIVEN it **pins the scale** (`PIN_FIXES_SCALE['distance'] = true`, joining only `length` and `dot`), and drives a free-dim figure to it;
- as a derived QUERY it may be reported **only when the scale is already pinned** — the [ADR-3D-054](#adr-3d-054) discipline. On a bare cube, "the distance from A′ to the base" is stable across seeds and still not knowledge: it is the frozen gauge unit, and printing "1" would hand the student an invented given. The query lane's existing scale gate covers this without a new mechanism, and the two refusals are kept distinct — `scale` (shape known, size free) versus `undetermined` (shape itself free).

**A point-to-point distance is NOT in this family.** It is the magnitude family's (`|AB| = 5`), which already owns it; the parser defers rather than creating a second owner for one quantity. The table records it `n/a` with that reason.

**Routing** is the frame classifier, unchanged from S2/S3/S4: gauge×gauge drives, absolute×absolute is a claim (two typed parametric lines — the 2010-Q3 shape), gauge×absolute is claim-gated (#386).

**11 cells flipped**, 70 supported in total — the matrix's distance row is complete.

Locked by `distance-rel.test.ts` (16: the four curriculum cases as pure geometry incl. the sign-safe anti-parallel plane pair, the drives with per-seed assertions, the scale-pinning fact, both query refusals, and the point-to-point deferral) + 2 battery rows. 3-D lane 1784 green, `tsc -b` + both builds clean; shadow snapshot addition-only, allowlist unchanged.

**The relations program (#378) is COMPLETE**: S0 ✓ S1 ✓ S2 ✓ S4 ✓ S3 ✓ S5 ✓. What remains is recorded, not forgotten — #386 (the gauge×absolute drive, one routing refactor serving every slice's identical cells) and `contains` (S3).

### ADR-3D-107 — Magnitude equality over vector EXPRESSIONS, chained (#393 + #335)

**Class:** a **magnitude statement whose operand is an expression or whose equality is n-ary** had **no deterministic owner** — `lengthRel` reads exactly one `=` between a bar-form atom (`|w|`, `|AB|`) and a value/atom, so `|u|=|v|=1`, `|u|=|v|=|w|`, `|w+u|=|w-u|` and `|2w+3v|=|3v-2w|` all fell to the LLM. The failure was **non-deterministic by construction**: Haiku recognised `|w+u|=|w-u| ⟺ u⊥w` but failed the same expansion on `|2w+3v|=|3v-2w|` (the #335 prod report), and an LLM-invented relation between existing named vectors trips no honesty gate — the class carried a silent-wrong-green tail, which is the reason to remove the LLM from it entirely, not merely the visible miss.

**Mechanism.** One general construct, no special-casing of the ⊥ identity (it falls out):

- **Engine:** `mag-rel` (|e₁| = c·|e₂| — a RATIO, similarity-invariant, `PIN_FIXES_SCALE: false`) and `mag-val` (|e| = value — an absolute size, `true`), each a Command3 + ScalarPin + Claim3 triple. Residuals are the signed magnitude differences (the `length`/`length-rel` forms verbatim, evaluated via `exprAt`, the in-solve twin of the one shared `evalExpr`); claims verify multi-seed through `evalExpr` itself. M1 at apply: free dims ⇒ pin, determined ⇒ claim (`claim-refuted` keep-prior).
- **Normalization at the apply chokepoint** (the parallelepiped precedent, #349): a simple unit-coefficient atom NEVER reaches the mag lanes — a bare named vector with a value delegates to `vec-mag`, a bare pair to the ordinary `length-eq` given, an atom pair to `length-rel` (so `|u|=|v|` inherits length-rel's whole machinery, symbolPins included). One statement, one semantics, whatever spelling produced it.
- **Parser:** `magEquality`, registered **after** `lengthRel` so every form that rule owns keeps its owner byte-identical (asserted). Links split on `=`/«שווה ל»; each is `[c·]|expr|[·c]` (radical coefficients via `evalRadical`, expr via the ONE shared `parseVecExpr` — a symbolic coefficient like `(1-t)u` is rejected whole, the #301 boundary honestly kept) or a NUMBER in any position; contradictory numbers (`|u|=1=2`) reject. A stated value pins every magnitude link (`mag-val`, |e| = v/c); valueless chains lower to adjacent `mag-rel` pairs. Pair atoms auto-draw their segments (the `segmentsOf` idiom).

**Ruling (operator, 2026-07-29):** `|u|=|v|=1`, three-way `|u|=|v|=|w|=1`, and the valueless `|u|=|v|=|w|` are all supported. A valueless chain is a ratio — the common size stays a FREE gauge (ADR-052/ADR-3D-054: `scalePinned` stays false, so the panel never prints the frozen unit as knowledge; asserted).

**Shadow matrix:** one new reviewed pair `lengthRel → magEquality` (allowlisted deliberately — the two lowerings of `|EN| = (√6/4)·|w|` normalize to the SAME length-rel at apply, so the divergence is spelling-deep only); winner snapshot pure addition (the 4 new catalog rows).

Locked by `magnitude-equality.test.ts` (19): the exact #335 prod pair driving `w·u = 0` / `w·v = 0` at every seed, the non-⊥ case `|u+2v|=|u+3v|` holding WITHOUT forcing perpendicularity (proof there is no ⊥ special case), pair atoms on a free tetra, radical coefficients, the chain forms (numeric in any position ≡), keep-prior refusals, and the no-theft byte-identity of every lengthRel form. Catalog +4, save-whitelist +2.

### ADR-3D-108 — The panel bundle: what a stated relation SHOWS (#384 · #395 · #396 · #397 · #398)

Five findings from the operator's PR #390/#391 play session (2026-07-29), one shared theme: **the engine understood more than the UI communicated**. Built as one session because they touch one surface (the data panel, the notices strip, the patch/witness ink).

**#398 (bug) — the query row scrambled Hebrew and dressed a plane as a vector.** Two defects, one row: the query list forced `dir="ltr"` on Hebrew sentences (the ADR-3D-031 Am. 2 bidi class — now per-row `dir="auto"`, math tokens as isolated LTR islands), and the display tokenizers decided token KIND by what the pair regex could bite off — in `ABC` the tail `BC` passed the lookahead and wore an arrow. The run grammar is the semantics (2 labels = pair, **3+ labels = a point-run**): `tokenizeRow` consumes a ≥3-label run as one prose token, and `vectorNotation` gains the lookBEHIND twin of its existing lookahead (digits stay allowed before — `2KA'` is a real glued coefficient). Class fix at both formatter sites, so every consumer (panel rows, fact rows, query rows) inherits it.

**#384 — the panel now reports the S3/S5 columns.** Plane PAIRS (from the objects the student named — `pointPlanes`/equation/rel planes) row as parallel / perpendicular / coincident under the same multi-sample gate as the S4 mutual rows; a plain "intersecting" between planes is deliberately NOT a row (two generic planes always intersect — noise, not knowledge). Stated DISTANCES row as `d(D, ABC) = 6`, computed FROM the figure through the same `resolveOperand`/`distanceBetween` seam the drive reads — the row is confirmation, not an echo. One shared `operandLabel` (exported from operands.ts) names operands everywhere, so a label can never spell two ways.

**#396 — a claim that could never drive says so.** A relation whose BOTH operands are ABSOLUTE (equation planes, typed lines) is entailed by their defining equations — it verifies ✓ and adds nothing; `buildNotices3` emits `redundant-relation` (derived from the construction, so it survives save/load). The boundary is semantic, not solver-state: claims over FIGURE objects stay silent (that is the verify-your-answer register, the tool's charter), and a side whose direction/normal CARRIES the figure parameter is excluded — there the statement pinned the parameter (2024-Q2's «ℓ ⟂ π»), which is real information (belt-and-braces: that path records no claim at all today).

**#397 — the stated distance draws its WITNESS.** `distanceWitness` (operands.ts) returns the closest-point pair whose segment length IS `distanceBetween` — case structure mirrored exactly, locked by |witness| = distance across every curriculum case. The scene draws it dashed **in its own colour** (dashes on figure edges mean HIDDEN — the ADR-3D-104 dash-semantics lesson, so the witness is colour-separated) with the stated value, adds a ⟂ knee at the foot through the standard ADR-3D-093/098 marks pipeline (in-plane arm legibility-rotated; a line foot's arm IS the line), grows the plane patch to cover the foot (the ADR-3D-097 coverage rule), and keeps the witness in the fit. Toggleable (default ON) — «for educational purposes», per the operator.

**#395 — plane patches show/hide.** The #318 display toggle becomes a cycle **full → face → hidden** (`PlaneDisplayMode3` in figureFile3 — the schema owner; absent = full stays the one convention; 'hidden' round-trips save/load). A hidden plane draws no patch, no label and no fold seam — the RELATIONS it takes part in stay enforced. The fact-row toggle now covers planes materialised as RELATION OPERANDS (plane-rel / mutual-rel / distance-rel / line-rel plane-runs), not only «מישור ABC» statements — the operator's tests 1/7/8 ask.

The #318 store lock pinning the two-state cycle was **deliberately updated** to pin the three-state one (its intent — cycling returns to the default with the key DELETED — is unchanged; the ADR-3D-047 updated-lock precedent).

Locked by `panel-bundle.test.ts` (10 — the exact play utterances for rows/notices/cycle/round-trip, the figure-object and param-pinning notice negatives), `witness.test.ts` (8 — |witness| = distance on all five gap cases, scene draw + toggle + knee, hidden patch/seam), and the #398 appends in `vecmath.test.tsx`/`notation.test.ts` (≥3-run prose, primed runs, the digit-prefixed pair regression guard).

### ADR-3D-109 — A stated relation's point-run carrier leaves its trace: patch + knee (#383)

**Class:** the ADR-3D-093/097 enumeration class, two more members — a correct rule applied to a list one member short. (1) "The carrier of a stated relation is drawn" (ADR-3D-015, S3): `plane-rel`/`distance-rel` materialise their plane-run operands, but `plane-line-perp` (#375) and `line-rel` (S2) did not — no drawn plane, so the ADR-3D-097 patch-growth sweep (already general) had nothing to grow to the crossing, and «מישור ACD אנך לישר l1» showed a plane-less line. (2) `rightAngles3` swept every recorded ⟂ — scalarPins, claims, symbolPins, `linePerps`, `lineRels` — except `planeLinePerps`, the record #375 lowers to; even with a patch, the point-run⟂line drew no knee.

**Fix, both at the existing chokepoints:** the two apply cases gain plane-rel's exact idempotent materialisation block (zero new renderer code — the patch, its growth to the crossing, and the fold machinery all follow); `rightAngles3` gains the `planeLinePerps` sweep as the verbatim point-run twin of its `linePerps` block (plane resolved from the ids' positions via the existing `planeFromIds`, `planeN` set so the in-plane arm stays legibility-rotated).

**Verification-sweep provenance (2026-07-29):** re-measured before fixing — S2/S3 had fixed the NEIGHBOUR commands, not these; both holes confirmed live, and the new locks were run against the pre-fix tree and FAILED (2/2), then pass post-fix. The same sweep closed #377 by measurement (10/11 matrix cells delivered by S0–S5; the residual line∩point-run-plane cell filed as #401).

Locked by the `#383` block in `line-perp-plane-mark.test.ts` (the ⟂ twin: carrier materialised + patch drawn + knee ON the line with perpendicular arms; the ∥ twin: patch drawn, NO knee — parallel marks nothing).

### ADR-3D-110 — A stated shape QUALIFIER is read from one vocabulary and always lowers (#424)

**Reported (operator, 2026-07-29):** `ABC משולש שווה צלעות` "is not recognized". It was worse than
unrecognized — it parsed `ok`, committed with no error and no note, and drew a **scalene** triangle
**byte-identical** to the plain `משולש ABC` (measured 1.000 / 1.102 / 1.281 at seed 0 for both). The
operator read the drawing and correctly concluded the tool had not understood; the tool's own report
was a clean ✓. The ADR-052 cardinal sin — a figure contradicting its own givens — with no warning
attached (docs/17 §6).

**Class:** *a stated shape qualifier is read by an inline, POSITION-LOCAL test rather than from one
vocabulary — so which (qualifier × position) pairs work is an accident of which regex someone happened
to write, and an unread qualifier is dropped on the floor.* Measured across the matrix before fixing,
the class was far wider than the report: `שווה צלעות` was tested inline in **three** copies
(`rightPrism`, `obliquePrism`, `rightPyramid`) and so worked there, but not in the flat lane and not in
a non-right pyramid (`פירמידה שבסיסה משולש שווה צלעות` → a scalene `tetra`); `שווה שוקיים` was read
**nowhere** as a triangle qualifier and was therefore silently dropped in **all five** positions. This
is the ADR-3D-069 shape verbatim — *"the carve-out is what HID the gap"* — and the (base × rightness)
enumeration gap of ADR-3D-089/090 in the triangle dimension.

**Second half of the class — the backstop was bound to a PATH, not to the event.** The honesty gates
run only on the LLM seam (`submitSteps`), on the reasoning that "the deterministic path needs no gate
here — the rules parse the utterance itself". That reasoning is exactly what failed: a rule that reads
the shape NOUN and ignores its qualifier loses a stated given precisely as an LLM decomposition can, and
no path-bound gate can see an event that happens on the other path. (The same shape as the four defects
recorded in ADR-3D-105 — *a guard bound to a path rather than to the event it guards*.)

**Fix — the governing mechanism, not a fourth regex.** `statedTriShape` is the triangle sibling of
`statedQuadBase` (#305) and carries its doctrine verbatim: **ONE vocabulary, so a qualifier a rule
RECOGNISES is exactly a qualifier it can LOWER.** All five positions read it, and one
`triShapeCommands` lowers it — the ADR-110/#199 macro pattern, **no new engine construct**: `length-rel`
is already M1-routed, so it drives a free figure and verifies a determined one.

- **equilateral** → all three sides equal, **hard** (the words leave no further choice). `prism3e` /
  `pyramid3e` already ARE the equilateral base and receive no constraints, so those two cells stay
  bit-identical; every other cell carries the qualifier as constraints instead of dropping it.
- **isosceles** → **one SOFT pair** at the apex (M4 / ADR-114 / the #116 ruling already applied to
  `rightTriangle` in this file): "isosceles" asserts only that SOME two sides are equal, and WHICH pair
  is the student's to state (ADR-052). `soft` is added to `length-rel` and `derive3`'s soft-drop
  generalised to it — keyed by the **triangle**, not the pair, because ADR-114's whole point is that a
  soft `|AB|=|AC|` plus an explicit `|AB|=|BC|` would stack into an equilateral triangle nobody asked
  for. One registry per soft kind, so a third slots in without new branching.

**Attachment is by the noun the qualifier was written beside**, not by word presence: a stated quad base
takes its qualifier with it, so `טרפז שווה שוקיים` is an isosceles TRAPEZOID and no triangle reading may
claim it. (The first cut of this fix regressed exactly there — `פירמידה ישרה שבסיסה טרפז שווה שוקיים`
built a triangular pyramid — which is why the matrix is measured, not assumed.) That quad reading is
`quadShapeCommands`, whose constraint is already in the registry as `CYCLIC_MEMBER.trapezoid.fix`
(`equal-legs`), emitted once and never doubled by a right form's cyclic fix.

**Ride-along, same class:** `rightTriangle` claimed `משולש ישר זווית ושווה שוקיים` first and dropped the
second qualifier. It now lowers it too, anchored at the **right-angle vertex** — a right triangle's equal
sides can only be its two legs, so the first-vertex default would demand a leg equal to the hypotenuse.
Measured 1.000 / 1.000 / 1.414.

**The gate:** `droppedTriShape3` runs on **both** commit paths — the one honesty gate bound to the event
rather than to a path. Command side generous per the gate doctrine (any `length-rel` c=1, a `concyclic`
cyclic fix, or an equilateral-by-construction kind accounts), so a false account only suppresses a
warning while a false drop would refuse a working input; asserted false-positive-free over every shipped
form.

**Out of scope, unchanged:** flat QUADRILATERAL shapes (`ריבוע ABCD`, `מעוין ABCD`) still refuse honestly
(`not-handled` → escalate). A refusal is honest, not a lie — that is a feature gap of a different
priority, filed separately.

Locked by `flat-shape-qualifier.test.ts` (26), every assertion **geometric** (side lengths at four
seeds, never "a length-rel was emitted"): the operator's exact utterance; the isosceles default and an
explicit pair overriding it; all five positions × both qualifiers; `משולש ABC` still genuinely scalene;
the trapezoid attachment; right+isosceles; and the gate's own false-positive sweep. Shadow matrix: pure
addition (10 entries, 0 changed winners). Catalog +5.

## ADR-3D-111 — a stated shape qualifier is lowered wherever it is recognised, and never read as a DIFFERENT noun's modifier

**Status:** accepted, 2026-08-08 · **Issue:** #435 (P1) · **Supersedes nothing; extends [ADR-3D-110](#adr-3d-110)**

**Reported.** Prod, 2 distinct users (log-triage 2026-08-08, sessions `u5vrlgt0` / `o7xr8bc5`):
`פירמידה עם בסיס משולש ישר זווית` and `שרטט פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC`. Both
logged `parser/ok`. Neither drew a right angle.

**The class.** *A qualifier is read by an inline, position-local test rather than from one vocabulary, so
which (qualifier × position) pairs work is an accident of which regex someone wrote.* This is
[ADR-3D-110](#adr-3d-110)'s own class statement, verbatim — and ADR-3D-110 built `statedTriShape` as the
ONE triangle vocabulary to close it. It closed the members it enumerated (`שווה צלעות`, `שווה שוקיים`)
and left `ישר זווית` outside, so the class survived in the member nobody listed. The ADR-3D-069 lesson
again: **the carve-out is what hid the gap** — `rightTriangle` lowered the right angle inline, which made
the flat lane look correct and hid that no other position could.

**Two faces, one root.** Because the vocabulary did not own the qualifier:

1. **It was silently dropped.** `statedTriShape` had no right-angled member, so `withTriShape` added
   nothing; and `droppedTriShape3` — the gate ADR-3D-110 built for exactly this — watched only the
   equal-sides words, so nothing warned. Measured: `⊾ = 0` for every pyramid and prism phrasing.
2. **Its words were read by the SOLID.** `rightPyramid` decided its own rightness with
   `/ישרה?/.test(s)` over the whole utterance, so the `ישר` of `ישר זווית` — a word describing the
   **base** — made a free `tetra` into a `pyramid3` (apex over the circumcentre). The controls isolate
   it: `פירמידה SABC שבסיסה משולש ABC` → `tetra`, and adding only `ישר זווית` → `pyramid3`. A property
   the student never stated, asserted with a green ✓ — the [ADR-052](06-decisions.md#adr-052) cardinal
   sin, and precisely the rule [ADR-3D-058](#adr-3d-058) put in the LLM prompt, violated by the
   deterministic parser itself.

**Sibling audit (measured, not reasoned).** The same rightness test appears in three rules. Hebrew was
broken only in `rightPyramid` (`/ישרה?/` admits the masculine `ישר`; the prism rules demand the feminine
`ישרה`). **English was broken in all three** — `\bright\b` cannot tell "right prism" from "right
triangle" — and there it also *diverted the sentence away from the solid rules entirely*: the solid rule
declined, and `rightTriangle` answered with a flat `polygon3`, so `prism with a right triangle base`
dropped the **prism**. A third defect the report did not mention and reasoning alone would have missed.

**Decision.**

- `TriSpec = { equal, right }` replaces the single-valued return: equal-sidedness and right-angledness are
  **independent givens** and the vocabulary answers both at once, so no caller can ask about one and
  silently lose the other.
- `triShapeCommands` lowers both, via the [ADR-110](06-decisions.md#adr-110) macro pattern — **no new
  engine construct**; the right angle is the `cos-angle` (cos 0) `rightTriangle` already used, `soft` so a
  later explicit angle wins (M4). When both are stated the equal pair anchors at the right-angle vertex: a
  right triangle's equal sides can only be its legs.
- A solid's own rightness is tested on `withoutTriQualifier(s)` — the utterance **with the triangle's
  qualifier words removed**. This is a removal, not a keyword bow-out (docs/17 §2.4): the solid still
  answers its own question, on the part of the sentence that is actually about it. It follows from the
  doctrine `statedTriShape` already stated — *a qualifier modifies the noun it was written beside* — and
  fixes He and En with one mechanism.
- `rightTriangle` becomes a **consumer** of the vocabulary (its inline regex and inline `cos-angle` are
  deleted) and gains the solid leftover guard (ADR-024) that `planarPolygon` had and it lacked, so a solid
  sentence can never be answered with a flat triangle.
- `droppedTriShape3` watches the same vocabulary, checking the two givens **separately** — the reported
  figure accounted for the equal pair while dropping the right angle, so a single combined check would
  still have passed it.

**Blast radius.** `prism3e`/`pyramid3e` are equilateral by construction, so their equal half stays
unconstrained and those figures are bit-identical. **The shadow matrix changed by pure DELETION** —
`rightTriangle → planarPolygon` is no longer a divergent pair, because the two rules now agree about the
same sentence: the registry SHRANK (5 pairs → 4), which is the evidence this is a mechanism repair and not
another exception.

**Not fixed here, filed:** the honesty gates run only on the parse seam per rule family; a general
"stated construct noun that no command materialises" gate (`droppedConstructNoun3`) is #438/#440's.

Locked by `right-triangle-base.test.ts` (26), every assertion **geometric** where geometry is the claim —
the base angle is 90° at five seeds for the reported label-less pyramid, the labelled pyramid (with its
isosceles legs verified equal), the prism sibling and the flat lane; plus the (qualifier × position ×
locale) matrix with its no-qualifier controls, the English solid-survives rows, and the gate's own
false-positive row.

## ADR-3D-112 — a polygon's CIRCUMSCRIBED and INSCRIBED circle in R³

**Status:** accepted, 2026-08-08 · **Issue:** #442 (feature) · **Closes the capability half of #440**

**Asked for.** Operator, 2026-08-08: "I still want to be able to have מעגל חוסם וחסום in the 3d tool."
The bug half (#440) was that every inscription phrasing **silently dropped the circle**: `משולש ABC חסום
במעגל` committed a bare triangle byte-identical to `משולש ABC`, and on a pyramid — the operator's real
context, ABC being the base — it added a green step row that changed **nothing at all** (facts 1→2,
`lastError: null`, solids unchanged, no circle, no new points).

**Smaller than #253 implied.** A survey before building found the substrate already in place: `circle3` is
a real command and object with a `Circle3Def` union, `point-on-circle3` exists, `scene3` already samples
an arbitrary world-space circle from two in-plane basis vectors (`circlePts`, the revolution-solid
machinery), and `ringCircumcentre3` was already there from [ADR-3D-090](#adr-3d-090). So this is two new
`Circle3Def` kinds plus parser reach — not a new subsystem.

**Decision.**

- Two kinds, `{kind:'circum', ring}` and `{kind:'incircle', ring}`. Neither carries a `center` point id:
  the centre is DERIVED, and minting a label for it would assert a name the student never gave (the V6
  unnamed-centre rule). Both resolve in the ring's OWN plane, so **a flat V8-g polygon and a solid's face
  are the same case** — one implementation serves the operator's pyramid base and a standalone triangle.
- The circumcircle is `ringCircumcentre3` (exact for a triangle); the incircle is a new closed-form
  `triangleIncircle3` (`I = (a·A+b·B+c·C)/(a+b+c)`, `r = Area/s`) — no solver, no CAS.
- **Roles are assigned by the CONTAINER MARKER** — the noun carrying ב / "in" — wherever it sits, never by
  word order. This is [ADR-245](06-decisions.md#adr-245) ported verbatim, and it is ported *because* 2-D
  learned it the hard way: the order test silently built the CONVERSE for every inverted Hebrew passive,
  in production, for months. It is also what settles the operator's own mixed phrasing `משולש ABC חוסם
  במעגל` — circumscribe VERB, but the ב marker sits on מעגל, so the circle contains. All four phrasings ×
  both locales resolve correctly.

**Honesty boundary.** `incircle` is **triangles only**. Every triangle is tangential; a general
quadrilateral is not, so a best-fit circle for a 4-gon would be tangent to nothing — a figure that lies.
The quad case returns a new `incircle-needs-triangle` refusal with a bilingual message. (The tangential-quad
constraint is a genuine extension, not a defect, and is left unbuilt deliberately.)

**A guidance category RETIRED.** `scope3`'s `cross-app` rule matched `חסום במעגל` / "inscribed in a
circle" and pointed the student at the 2-D app. With the capability built, that guidance became a lie —
the rule this register's own header states ("guidance for something the parser handles is a lie — the #73
no-theft sweep enforces that"). The pattern is removed; the third category retired by SUPPORTING its form,
after S3 and S4. The bare-noun patterns (a lone `מעגל`, `מלבן`, …) stay: those are still 2-D constructions
with no 3-D meaning. The no-theft catalog sweep caught this automatically — the instrument working.

**Blast radius.** Additive: a new `Circle3Def` member, one parser rule ahead of the polygon rules with the
ADR-024 leftover guard on `planarPolygon` (without it the polygon rule re-declares the triangle and drops
the circle — the exact #440 defect), and `circle3` was already save-whitelisted. Shadow matrix: **pure
addition** (4 rows, 0 changed winners, no new divergent pairs).

Locked by `polygon-circle.test.ts` (13), asserted GEOMETRICALLY on the resolved figure at four seeds —
never "a command was emitted": a circumcircle by every vertex being equidistant from the centre AND
coplanar with it; an incircle by the ⟂ distance from its centre to all three sides equalling the radius
and every vertex lying strictly outside; the pyramid-base case with the apex proved OFF the circle and the
solid proved un-redeclared (M1); the quad refusal; a named circle keeping its letter; the #440 no-op
regression; and the scene gaining exactly one sampled outline (0 → 1) — the ink that was missing.

## ADR-3D-113 — a stated OBJECT must materialise: the dropped-construct gate

**Status:** accepted, 2026-08-09 · **Issues:** #438, #440 (bugs) · **Sibling filed:** #456 (2-D), #457 (3-D debt)

**The class.** *A sentence states two objects — a shape and a construct on it. The one rule that recognises
its own noun claims the whole utterance, emits only its own object, and silently discards the rest of the
sentence.* Three independent instances landed in the single triage of 2026-08-08: `cubeOrBox` reading
`תיבה` and never reading `עם אלכסון תיבה` (#438 — typed by **two** prod users as their opening move), the
flat-polygon rule reading `משולש` and discarding `חסום במעגל` (#440), and the pyramid base qualifier
(#435, fixed separately). Not one of the four honesty gates could see any of them: they ask about labels,
numbers, base-shape nouns and triangle qualifiers, and **nothing asked whether a stated object materialised
at all.** A rule can only drop what no gate is watching, so the durable fix is the missing question, asked
once, for every rule at once.

**#440 had already half-moved.** [ADR-3D-112](#adr-3d-112) built the circle and took the utterance off
`planarPolygon` with an ADR-024 leftover guard — which made the **polygon** the newly-dropped half. Measured
at that HEAD: `משולש ABC חסום במעגל` as an *opening* move emitted only `circle3`, referenced A, B, C that
nothing had declared, and refused `unknown-point A`. The same defect, mirrored: the rule that now owned the
sentence read *its* noun and discarded the rest. It survived review because the operator's own context had
the ring already on the figure (ABC as a pyramid base), where the drop is invisible.

**Decision — two halves, and the second is the one that closes the class.**

- **Capability.** `polygonCircle3` declares the ring polygon it names, then the circle: the sentence states
  two objects, so it emits two. The declaration is unconditional and context-free — **M1 owns existence**.
  A flat polygon whose ids all exist is a statement *about* those points, an idempotent no-op
  (`apply.ts`, #116), which is exactly the pyramid-base case and why this cannot re-declare anything. It
  routes the stated triangle qualifier through `statedTriShape`/`triShapeCommands` too, so #424's one
  vocabulary reaches this rule as well. `cubeOrBox` emits the stated space diagonal — the ids it just
  assigned are precisely what naming `A→C'` needs. Only the **unambiguous** solid-qualified form is built
  (`אלכסון תיבה` / `אלכסון קובייה` / "space diagonal"): a bare `אלכסון` on a box could be a FACE diagonal,
  and choosing between them would assert a given the student never gave ([ADR-052](06-decisions.md#adr-052)).
  Naming the endpoints (`אלכסון תיבה AC'`) stays #449.
- **Mechanism.** `droppedConstructNoun3` — a stated construct noun that no command produced. Bound to the
  **event, not to a path**, like `droppedTriShape3` and for the same reason (`src3d/CLAUDE.md`: "a guard
  bound to a code path rather than to the event it guards will be bypassed") — both reported drops were
  GRAMMAR drops, where the LLM-seam gates never run.

**The accounting is the class predicate itself, and that is the whole finding.** The first draft mapped each
noun to the object kind it *should* produce — a diagonal to a segment, a circle to a `circle3`, a height to
an altitude. It **false-flagged 28 working inputs**: `O נקודת חיתוך אלכסוני הבסיס` lowers a diagonal to a
POINT, `AS גובה` lowers a height to a PERPENDICULARITY, `וגובהו 12` carries a height as a FIELD of a
revolution solid. Enumerating the lowerings recreates the enumeration-is-not-a-rule trap this tree's
recurring-traps list already names. The generic question does not:

> a stated construct noun is accounted when the commands carry **anything beyond the bare shape
> declarations** — any non-`solid` command at all, or a `solid` carrying payload past its own identity.

That is one sentence, it is exactly the event ("the rule emitted only its own object"), and it flagged
**zero** of the 1855 3-D tests and zero catalog utterances. Generous by construction, per the gate doctrine:
a false account only suppresses a warning, a false drop would refuse a working input.

**What it turns honest that was silent.** `קובייה עם אלכסון`, `תיבה מלבנית ובה אלכסון` (ambiguous, refused
on purpose) and `פירמידה ABCD עם גובה` — the last being the silent-drop face of **#448**, which stays the
capability. They now refuse naming the lost statement and escalate, instead of committing a bare solid with
a green ✓.

**Sibling audit** (docs/17 §1 / ADR-W-004). **`src/` HAS this class** — measured, not assumed:
`מלבן ABCD עם אלכסונים` commits a bare rectangle, the diagonals gone, and none of 2-D's seven deterministic
gates asks the general question. Narrower than 3-D's only by luck — the other three phrasings happen to be
`not-handled`. Filed as **#456** with the port plan (copied as a pattern per docs/20 §12, never imported),
not fixed here: different product, different lane, different log.

**Blast radius.** Additive. Shadow matrix: pure addition (2 catalog rows, **0 changed winners**). Locked by
`dropped-construct.test.ts` (22), asserted geometrically — the space diagonal by the box identity
|AC'|² = |AB|² + |BC|² + |AA'|² *and* by being longer than either face diagonal, the polygon by the ring
existing and the solid count staying at one; plus the refusals, the M1 no-ops, and the generosity cases that
the 28 false positives came from. `droppedConstructNoun3` joins the catalog false-positive net.

## ADR-3D-114 — the refusal SENTENCE: no path commits partially, so the copy must not say it did

**Status:** accepted, 2026-08-09 · **Issue:** #459 (bug)

**The report.** Operator, testing [ADR-3D-113](#adr-3d-113) before deploy: `פירמידה ABCD עם גובה` returned
*"חלק מהקלט לא הגיע לציור (גובה) — לא נוסף דבר"* — and the reaction was *"the text indicates that part of
the sentence was not added but nothing is drawn at all, so it's not just part."*

**The refusal is correct and does not change.** ADR-3D-113 deliberately refuses the whole utterance rather
than commit a bare pyramid with a green ✓ (the height itself is #448, the capability). All-or-nothing is
the designed behaviour. This ADR is the sentence only.

**Root cause — one string describing an event that does not exist.** `droppedConstructNoun3` shares the
`dropped-given` error code with the four older gates (`store3.ts`), and that code renders a single string
whose two clauses contradict each other: **"part of the input** did not reach the figure ({{items}})
**— nothing was added"**. The lead clause was written for the *number/label* gates, whose mental model is
"a magnitude leaked out of an otherwise-good decomposition". But **all five gates `return` before
committing** — no path has ever added part of an utterance. The lead clause has been inaccurate since it
was written; the construct-noun gate is merely where a reader first noticed, because a dropped OBJECT is
visible in a way a dropped number is not.

So the fix is not "the new gate needs its own string" — that would leave four gates still describing a
phantom partial commit. It is one reword of the shared string, stating the outcome first and then naming
what could not be drawn: accurate for all five gates, no per-gate branching, no new error code.
`{{items}}` still names the student's own words, so the honesty invariant is untouched.

**Sibling audit** (docs/17 §1 / [ADR-W-004](06w-decisions-workspace.md)). `err.droppedGiven` exists **only**
in `src3d/i18n/locales/` — grep of `src/i18n/locales/*.json` finds no counterpart, so 2-D words its seven
gates differently and does not carry this defect. Confirmed by measurement, not assumed.

**Locked** in `dropped-construct.test.ts`: both locales must still carry `{{items}}` and must not contain
the partial-commit phrasing — a property over the copy, so a future rewording cannot quietly reintroduce
the claim.

## ADR-3D-115 — a height is stated by its APEX, not by its segment

**Status:** accepted, 2026-08-09 · **Issue:** #448 (feature) · **Boundary:** #467 (the bare form)

**The ask.** Operator, 2026-08-09: *"I want to be able to support `גובה הפירמידה מנקודה X` just like we
support in the 2-D `גובה מנקודה A`, without having to name the segment (of course we can if user wants but
tool should understand the meaning)."*

**The gap, measured.** Every `גובה` rule in this tree required the student to name the segment FIRST —
`AS גובה הפירמידה`, `CD גובה במשולש ABC`, `DE גובה בטטראדר`, `AF גובה הפירמידה לפאה BDC`. Each of those
builds today. But a bagrut question does not word it that way: it names the **apex** and the **base**, and
the FOOT is a point the question never mentions. So the supported set was exactly the phrasings a student
would not type, and `גובה הפירמידה מנקודה D`, `גובה לפירמידה מנקודה D`, `גובה מנקודה D לבסיס ABC` and
`גובה מ D לבסיס ABC` were all `not-handled`.

**The finding: this is a PHRASING gap, not a missing construct.** The foot nobody names is exactly what
`perp-to-base` has auto-minted since [#72](#adr-3d-035) — it mints the first unused label at apply and
delegates to `height-to-face`. So the whole family lowers onto the existing command and **no geometry was
written for this ADR**. The rule joins `perpToBase` (last, after every segment-named owner), which is why
the shadow matrix shows a **pure addition: 4 new catalog rows, 0 changed winners.**

**One engine change, and it is an honesty fix rather than a capability.** `perp-to-base` gains an optional
`face`. Without it, apply resolves the figure's single solid — correct for `גובה הפירמידה מנקודה D`, and it
still refuses when several solids make the base ambiguous. But `גובה מנקודה D לבסיס ABC` **names** the base,
and resolving `solids[0].ids.slice(0,3)` there would drop the height onto a different plane while reporting
success: the student's own words, silently overridden. A stated base now wins, and a base naming a point
that does not exist refuses instead of inventing it.

**The boundary is the operator's earlier ruling, and the rule enforces it deliberately.** The bare
`גובה מנקודה D` — no solid, no base — he ruled genuinely unclear (#467, guidance rather than a guess). The
new rule therefore requires **a solid noun or a base clause**, and returns null otherwise, so the bare form
keeps falling through to the guidance register. That check is the one thing this rule must not relax: with
both groups merely optional it would happily claim the ambiguous form and start guessing a base. Locked
with the supported phrasings, in the same file, so the two can never drift apart.

**Locked** by `height-from-apex.test.ts` (12): every new phrasing asserted GEOMETRICALLY on the resolved
figure — the foot lies in the base plane and apex→foot runs along the base normal, never "a command was
emitted" — plus the stated-base case built on a face that is *not* the solid's first (the assertion that
would have passed under the old resolution and is the point of the engine change), the ambiguity refusals,
the four segment-named forms keeping their existing owners, and the #467 bare form staying `not-handled`.

**Still open in #448:** `גובה הפירמידה` with **no apex named**. It needs the apex derived from the solid's
vertex layout, which is figure resolution of a different kind, and it is not what was asked for here.

## ADR-3D-116 — the bidi isolation post-processor, ported

**Status:** accepted, 2026-08-09 · **Issue:** #468 · **2-D original:** [ADR-431](06-decisions.md#adr-431)

**Why 3-D needs it at least as much.** The class is an LTR technical run inside an RTL Hebrew sentence,
whose neutral characters the bidi algorithm resolves to the paragraph direction and therefore reverses.
3-D messages are unusually dense with precisely that content: primed label runs (`ABCDA'B'C'D'`),
coordinate triples, plane equations, parametric lines.

**Copied as a pattern, never imported** (docs/20 §12 rule 1) — `src3d/` shares no code with `src/`, and
`server/__tests__/isolation.test.ts` enforces it. The port is deliberate rather than mechanical in two
places:

- **`'` joins CORE.** 3-D labels are primed, so a run ending in `A'` would otherwise be trimmed
  mid-label, leaving the prime outside the isolate.
- **Balanced hugging delimiters are absorbed** — the improvement this port *caused*, since a 3-D
  coordinate triple `(1, 2, -3)` is exactly a parenthesised run. Fixed in the 2-D original too
  ([ADR-431](06-decisions.md#adr-431) Am. 1) rather than left to diverge; the two copies stay identical
  apart from the prime.

**Locked** by `bidi3.test.ts` (189) with the same two properties the original carries, because they are
what make a transform over every user-facing string safe: the **safety** property — stripping the isolates
from any processed message returns the original byte-for-byte, over every leaf of the 3-D `he.json`, with
English untouched — and a bundle-**derived** coverage sweep, so a message added later is checked without
anyone remembering. Plus the primed-label and coordinate-triple cases, which are the two shapes the 2-D
corpus could not have caught.

## ADR-3D-117 — a height from a POINT ALONE is guidance, and permanently so

**Status:** accepted, 2026-08-09 · **Issue:** #467 · **Operator ruling** · **Sibling:** [ADR-3D-115](#adr-3d-115)

**The ruling.** Operator, 2026-08-09: *"גובה מנקודה D in 3d setting should give a message saying there are
several options for this and user should give better input."*

**Why guidance rather than a capability, and why that is not a stopgap.** With no solid and no base named
there is genuinely nothing to drop the perpendicular onto; choosing a plane would assert a given the
student never gave ([ADR-052](06-decisions.md#adr-052)). This is the sharp contrast with its sibling: the
same session BUILT `גובה הפירמידה מנקודה D` and `גובה מנקודה D לבסיס ABC` (ADR-3D-115), because those name
the plane. The bare form never becomes buildable, so the message is the **end state**, not a placeholder —
which is exactly what makes it belong in the guidance register ([ADR-3D-040](#adr-3d-040)) rather than in a
backlog. Before this it fell through as an ordinary `not-handled`, which meant a paid LLM call on input we
have already decided never to build, and a student who learns nothing about how to say it.

**The message names only forms that work today** — `גובה מנקודה D לבסיס ABC`, `גובה הפירמידה מנקודה D`,
`CD גובה במשולש ABC` — all three verified against the parser in this same commit. A guidance message
pointing at a second dead end is worse than no message, and the register's own no-theft sweep does not
catch that (it asserts supported input is not brushed off, not that the advice is buildable).

**The trigger is negative, deliberately.** It matches a height clause that names **no** base, solid, face
or triangle. Every ADR-3D-115 form parses, so the register never sees them — the lookaheads are belt and
braces. They are there because a pattern whose own semantics are wrong is a trap for whoever widens it
next, and they are asserted directly rather than left to the parse order.

**Locked** in `scope3.test.ts`: the five bare phrasings classify `ambiguous-height`, and the eight
ADR-3D-115 / segment-named forms classify null.

**A tooling note worth keeping.** The English pattern initially failed while the Hebrew one passed, and
the cause was a **literal backspace byte** in the source: the rule had been written through a non-raw
Python string, where `\b` is a real escape (`\s` survived only because it is not). Regexes must never be
generated through a layer that owns their escape characters. A repo-wide scan for stray control bytes
came back clean.

## ADR-3D-118 — a parameter's value is knowledge only when the givens leave ONE branch

**Status:** accepted, 2026-08-09 · **Issues:** #479 (P1), #481 · **Operator ruling on priority** ·
**Supersedes the predicate of:** [ADR-3D-030](#adr-3d-030) Am. 2 / #371

**The report.** Operator, 2026-08-09, prod: *"once I wrote the line is parallel to the plane, m was
replaced with a value of −√2. When I ask for another config, I get m = +√2. So the issue is that since
there are 2 possible values, m should not be replaced."* The canvas read
`ℓ: x = (1, 2, 3) + t·(-3.414, -1.414, 0.586)` — one branch's numbers, printed as the line's definition.

**Why this is the honesty class and not a display nit.** `dir·n = (m−2) + m(m−2) + (m+2)(m−1) = 2m² − 4`,
so `m = ±√2`: two genuine configurations, and the drawn direction differs between them. Printing either
one asserts a magnitude the student never gave — the same cardinal sin as drawing a figure that violates
a given ([ADR-052](06-decisions.md#adr-052)). The operator reclassified it **P1** over the P2 this was
filed at, on exactly that reading; recorded here because the precedent it was filed against (#371) was
P2 and the next reader will otherwise see an inconsistency.

**The root cause is a proxy standing in for a property.** #371 established the rule — *a number on the
canvas must be seed-invariant knowledge* — and enforced it with

```ts
const paramFree = !!c.param && pinningGivens(c) === 0 && c.paramGivens.length === 0;
```

which asks **"is the parameter unpinned?"** The property that actually licenses printing a number is
**"is the parameter's value forced?"**. The two coincide only while every pin has a single root, which is
every case the original test corpus contained (the 2024-Q2 line pins `m = −5`). A pin with two roots is
pinned and undetermined at once, so the proxy waved it straight through. This is the tree's own
documented trap twice over: *a guard bound to a code path rather than to the event it guards*, and
*an enumeration is not a rule*.

**The fix publishes the property rather than testing for it.** `resolve3` now returns, alongside the raw
candidate `roots`, the **`branches`** the figure can actually occupy — the roots surviving every
selection given — and `value` is drawn from `branches` by seed. So `branches.length === 1` is not a
heuristic meaning "probably determined"; it is that statement **by construction**, and "show another
configuration" cycles precisely that list. One exported predicate, `paramIsKnowledge(resolved.param)`,
is the only thing call sites ask (the `scalePinned` / `memberHolds3` precedent — a second copy of a
question drifts from the first).

**Why `branches` and not simply `roots.length === 1`.** A **sign** given can cut two roots to one, and
that value *is* knowledge. `adr-3d-032.test.ts` already contains such a figure (`k = ±2√15`, the sign
picks `+`), so the naive predicate would have regressed a case the suite holds — the reason the raw
candidate set is kept as well as the effective one.

**A latent sibling fixed on the way.** Sign givens were honoured on the `paramGivens` path (`pinParam`)
and **silently ignored** on the plane-angle / line-⟂ / line-rel path, so `m הוא פרמטר חיובי` plus a ⟂
given could draw the negative root — a figure contradicting a stated given. Both paths now narrow through
the same pool. Found by asking what `branches` must mean, not by a report; it is the class-first check
docs/17 asks for, and it is why the fix touched the engine rather than the renderer alone.

**#481 — one number formatter.** The canvas owned a private 3-decimal rounder whose comment justified
itself with *"the bagrut answers are clean numbers"*. That is false exactly where the parameter lane
lives: a root of a quadratic residual is a surd by default, which is how `√2` reached the operator as
`1.414`. The canvas now uses the panel's `cleanMag` (integer / `p/q` / surd / 2 decimals). Note the
**boundary this exposes**: a component here is `−2−√2`, a rational + surd *sum*, which no tier can render
and which must not grow one — that is the docs/20 §12 rule 3 no-CAS line. It needs no rendering, because
a figure with an unforced parameter shows `m-2` instead, which states it exactly in the student's own
notation.

**Locked** in `parametric-echo.test.ts`: the operator's three utterances echo symbolically and
**identically at every seed**, with neither `±3.414` appearing; a sign given added on top brings the
numbers back (`roots` 2, `branches` 1); and the pre-existing single-root and no-parameter cases are
unchanged.

## ADR-3D-119 — one symbol registry, and a parameter answers with its SOLUTION SET

**Status:** accepted, 2026-08-09 · **Issue:** #480 · **Sibling:** [ADR-3D-118](#adr-3d-118)

**The report.** Operator, 2026-08-09, prod: *"the side panel for data. When I ask to see m, it's not
recognized. I would expect it either not to give a value since there is more than one option (but say
there is no single value) or, since there are 2 options, give plus minus sqrt 2."* Measured: `m` →
`notUnderstood`, and the panel's params list empty — while `resolved.param` held `[-√2, +√2]` exactly.

**Root cause: three symbol kinds, three fields, and every surface knowing a different subset.** A
vec-def's ratio symbol (`t` from `AE = t·AS`) lives in `c.vecDefs`, a pin's open coordinate symbol
(`B(2t,t,k)`) in `c.pins`, and the algebraic lane's figure parameter in `c.param`. The query lane's
bare-letter rule tested `c.vecDefs.some(...)`; the panel's params loop walked `pinSymsOf(c)`. Neither
knew the third, so the symbol the exam question is actually *about* was the one symbol a student could
not ask for. Not a boundary anyone chose — the tree's documented trap, *an enumeration is not a rule*.

`figureSymbolsOf(c)` now derives the union, and both surfaces consume it; a fourth symbol kind reaches
them by being added there. The bare-letter guard still requires membership in **this figure's** symbols,
so a stray letter in the query box remains `notUnderstood` rather than becoming a silent query.

**The answer is the solution set, not the drawn branch.** The generic query path asks four seeds to
agree — the right question for a measured quantity, the wrong one here: with two branches the seeds
disagree *by design*, and the honest reading of that disagreement is not "undetermined" but "the givens
allow exactly these two". So the parameter is answered from `branches` ([ADR-3D-118](#adr-3d-118)) rather
than by sampling: `±√2` for a symmetric pair (the bagrut shape, and the form the student writes),
`{a, b, c}` otherwise, a plain value at one branch, and an honest «undetermined» when nothing pins it —
which is also exactly what the operator asked for, both halves of it.

**One formatter, `formatBranches`, shared by the panel row and the query answer**, because two
presentations of one symbol are two chances to disagree about it — the drift the `scalePinned` and
`memberHolds3` precedents exist to prevent. It is language-neutral (`±`, `{…}`) since it renders inside
both locales. The panel additionally checks the branch set agrees across its three seeds and reads the
row OPEN if it somehow does not: the set is a property of the *givens*, so seed-dependence there would
mean the value is not knowledge, and the panel's multi-sample discipline should not be bypassed just
because this path could prove it another way.

**Locked** in `queries.test.ts`: the operator's figure answers `±√2`; a single-root figure answers `-5`;
an unpinned parameter answers «undetermined» and reads `m = ?` in the panel; a letter that is not this
figure's symbol stays `notUnderstood`; and panel row and query answer are asserted **equal**, so the two
surfaces cannot drift.

## ADR-3D-120 — noun gates and relation FRAMES are shared vocabulary, not per-rule spellings

**Status:** accepted, 2026-08-09 · **Issues:** #486, #485 (and #401, closed with it)

**Two reports, one shape.** Operator, 2026-08-09, prod: *«B על מישור π2» is not supported* and
*«A נקודת חיתוך של l עם π1» is not supported*. Both name capabilities the engine **already had** — the
membership and the line∩plane point each build correctly when phrased the one way their rule happened to
spell. Measured: `B על המישור π2` parsed and `B על מישור π2` did not; `ℓ חותך את π1 בנקודה A` parsed and
`A נקודת החיתוך של ℓ עם π1` did not. A silent `not-handled` on lowerable input is not merely a miss — it
spends a paid LLM call and teaches the student nothing.

**#486 — the optional prefix is a morphology class, and it was missing from the register.** The tree
documents the trap («a keyword gate that admits one spelling is a silent drop») and lists `מאונ[ךכ]`,
`זו?וית`, `ניצבים?`. The **definite article** and the **subject noun** («הנקודה B») are the same class and
were not in it, which is why they keep resurfacing: `ה?מישור` appeared in some rules and `המישור` in
others, with nothing making the choice deliberate. Fixed as shared tokens — `HE_PLANE`, `HE_LINE`,
`HE_SEG`, `HE_SUBJ`, `IS_AT` — applied across the membership, point-on-plane, point-on-segment and
appositive-tail rules, and both prefixes added to the register in `src3d/CLAUDE.md`. The English side
gained `(?:the\s+)?` where it was equally absent.

**#485 — the FRAME is the second axis, and only the vocabulary had been centralised.** A crossing is
stated verb-headed («ℓ חותך את π1 בנקודה A») or noun-headed («A נקודת החיתוך של ℓ עם π1»). The diagonal
rule had already been through this — its comments record the lesson, *"the intersection verb, in every
form the student writes it"* — but what it centralised was the **words**; each rule still enumerated its
own **frames**, so `lineCutsPlane` carried one and dropped the other. `CROSS_HE_VERB` / `CROSS_HE_NOUN`
(+ En) now hold both, and `lineCutsPlane` lowers either into the same command. **#401 came free**: the
plane side takes a point RUN as well as a π-name, materialising the plane exactly as its two-point-line
sibling does — the issue had said "parser reach only; the engine already accepts it", and so it proved.

**A trap found while widening, worth more than either fix.** `PLANE_NAME` carries an inner capture
group, so operand indices SHIFT the moment a pattern grows an alternation. The old rule read
`m[m.length - 1]`, which dodged the problem rather than fixing it — and the first widening duly read a
point id of `"1"` out of `π1`, caught here only because the probe printed every lowering. The rule now
uses **named groups**, and the hazard is recorded in `src3d/CLAUDE.md` as a rule for any multi-operand
pattern.

**Locked** in `morphology-matrix3.test.ts` — the natural home, since both fixes are "these surface forms
must parse equivalently": article-ful ≡ article-less ≡ bare for plane/segment nouns, with/without the
subject noun, English with/without `the`, and the crossing's two frames × two languages × (π-name,
point-run) asserted to yield the **same commands**. Plus the negative side, because a widened pattern
that poaches its neighbours is the real risk: the diagonal crossing keeps its own rule, and a non-line
operand is still refused. The catalog gained the new forms, so the guard test holds them in He **and** En.

## ADR-3D-121 — the bidi isolation covers the STUDENT'S text, not only the tool's

**Status:** accepted, 2026-08-09 · **Issue:** #482 · **Extends:** [ADR-3D-116](#adr-3d-116) / #468

**The report.** Operator, 2026-08-09, prod: *"data entry in Hebrew mixed with English is hard. During data
entry it is hard to understand what I wrote, and at the end the bidi is wrong."* The fact list showed
`מישור π1 - x+(m-2)y+(m-1)z-5` with the equation laid out against the sentence.

**Root cause: the chokepoint sits at the translation seam, not at the event it guards.** ADR-3D-116
registered `isolateLtrRuns3` as an **i18next post-processor**, reasoning — correctly — that a run is
composed from a template's literals plus a value, so isolation belongs at render, and that one
post-processor covers messages written later without their authors thinking about bidi. All true, and it
covers exactly one class of string: **what the tool says**. What the *student* writes never passes through
`t()`, and their utterances are denser in LTR technical runs than any message, because they *are* the
equations. The guard was bound to a code path (`t()`) rather than to the event (rendering a
mixed-direction string).

**Fixed at the display site**, since the stored fact must stay byte-exact: the fact row isolates
`f.utterance` on the way to the DOM. The function was already safe for this — total, idempotent
(`if (s.includes(LRI)) return s`), and byte-reversible, which its own safety property asserts over every
locale leaf; the new tests assert the same three properties over **student text**, which is the point,
since arbitrary input is a wider corpus than any authored message.

**A vector fact is deliberately left alone.** `VecMath` emits one element per token, so the bidi algorithm
sees structure rather than one neutral run, and feeding its tokenizer characters it has no token for would
trade a layout bug for a parsing one. Recorded as a decision rather than an oversight — and it is the one
part of this ADR that is unverified against a real report, so it should be revisited if a vector row is
ever reported garbled.

**What is NOT fixed here, and why.** The operator's *"during data entry"* half — the input box itself —
needs a ruling, not a patch. Isolate characters cannot be injected into an editable value without
corrupting what the student typed and where their caret sits, and forcing `dir="ltr"` is the fix 2-D
already tried and **reverted** (#118 / ADR-312: it reversed a Hebrew sentence that merely contained a
radical). The recommendation on the issue is the third option — a read-only live preview under the input,
rendered isolated, which is what 2-D ended up with (`#77`/`#40`) and which 3-D has no equivalent of. Left
open on #482 rather than guessed at.

**The 2-D twin has the same structure** (`src/i18n/bidi.ts` is a post-processor too) and is labelled on the
issue. Not fixed here: this ADR is 3-D, the pattern is copied and never imported (docs/20 §12 rule 1), and
2-D's fact rows were not what the operator reported.

## ADR-3D-122 — the ℓ∩π crossing is OFFERED, and the offer is gated on knowledge

**Status:** accepted, 2026-08-09 · **Issue:** #483 · **Depends on:** [ADR-3D-118](#adr-3d-118) (the gate),
[ADR-3D-120](#adr-3d-120) (the sentence a click writes)

**The report.** Operator, 2026-08-09, prod: *"when we now have l perpendicular to π1, I would expect to
see the intersection point between them like we have in the 2d tool. When there is an intersection, give
a dot the user can click and name."*

**What was actually missing.** Not the capability — `ℓ חותך את π בנקודה A` has always lowered to
`line-plane-point` and the engine materialises the point correctly. Measured on the operator's ⟂ figure:
`m` pinned to a single root, both objects concrete, and `positions` **empty**. The student had to know
that sentence and think of it unprompted; nothing on the canvas said a point was there to be had. So this
ADR adds an *offer*, not a construct.

**Naming goes through the ordinary submit path.** A click synthesises a real sentence
(`A נקודת החיתוך של ℓ עם π1`) and submits it, so the result is an ordinary fact — readable in the step
list, undoable, re-orderable, and replayed on load. The alternative (pushing a command, or marking the
point render-only) would have produced a point the student cannot see the origin of and a file that does
not round-trip. This is the 2-D `crossingCommands` lesson (ADR-379), copied as a **pattern** — `src3d/`
imports nothing from `src/`. It also makes [ADR-3D-120](#adr-3d-120)'s noun frame a hard prerequisite
rather than a nicety: the click's own sentence has to parse, in both languages, and the test asserts it.

**The honesty gate is the whole design.** A dot invites the student to name a point, so the point must be
one the *givens* fix and not one this drawing happens to show. `openCrossings3` refuses to offer anything
while the figure parameter is unforced — reusing `paramIsKnowledge` ([ADR-3D-118](#adr-3d-118)) rather
than growing a second opinion about it, so the dot and the canvas echo can never disagree about whether
the figure is determined. The operator's own session is the case that motivates it twice over: unpinned,
the line is a sample of itself; pinned by `ℓ ∥ π1` to m = ±√2, there is no crossing at all.

**"Already named" is decided by POSITION, not by provenance.** Anything standing at the crossing retires
the offer — a coordinate point, a rider, a solid's vertex, or the same crossing named through the verb
frame. Enumerating the ways a point can be born is how the offer would come back as a duplicate dot on
top of an existing point (`src3d/CLAUDE.md`: *an enumeration is not a rule*); a test covers exactly that
path.

**The set is the engine's call, the pixels are the renderer's.** `openCrossings3` lives in `engine/`
because "is this crossing knowledge?" is a statement about the figure, and because the query lane and the
data panel should be able to ask it without a second implementation. `scene3` only projects. A dot is
drawn hollow, dashed and in the plane palette so it reads as *available* rather than as an existing
point, under real points so a named point always wins the pixels, with a transparent 11 px hit target so
it is tappable without enlarging the mark.

**Scope: ℓ∩π only.** It is the case reported, the one with an existing command, and the one whose operands
are absolute. Plane∩plane already has `ישר החיתוך`; segment∩plane has `planeCutsSegment`. Widening the
offer to those is a separate decision about what deserves a dot, not a mechanical extension.

**Locked** in `crossing-dots.test.ts`: the ⟂ figure offers exactly one crossing, and the offered point is
verified to lie on both operands and to be identical across seeds; an unforced parameter offers **nothing
even though the line does cross the plane at the sampled value** (the gate, stated as its own test); the
∥ figure offers nothing; the synthesized sentence parses in He and En, lands the point where the dot was,
and retires the offer; naming the same point through the verb frame retires it too; and a figure with no
algebraic objects offers nothing.

## ADR-3D-123 — a bidi run is bounded by its DELIMITERS and spelled in the tool's OWN alphabet

**Context.** [ADR-3D-121](#adr-3d-121) (#482) extended the bidi isolation to the student's own utterance.
The operator re-tested it the next morning and the fact row was still wrong: «ישר l - x=(1,2,3)+t(m+2,m,m-2)»
rendered with a stray `(` at the far left, and «מישור π1: …» split the plane's name from its digit. The
suite was green throughout.

**Two defects, one root — the run's definition was wrong in both directions.**

*The boundary.* `flush()` selected the run by trimming to the first and last **CORE** character. A closing
delimiter is not CORE, so any run ENDING in one — every parametric line, every trailing coordinate triple —
left that closer outside the isolate. Outside, a lone bracket is a bidi **neutral**: it resolves to the
paragraph direction, is **mirrored**, and is laid out at the far end of the row. The `)` closing `t(…)`
became a `(` at the left margin. The existing absorption loop could never reach it — it only takes a
balanced pair wrapping the span *end to end*, whereas here the opener sits in the middle of the run.
The rule is now: **grow the span over any delimiter whose partner is unmatched inside it**, then hug.

*The alphabet.* `CORE` was hand-authored against a guessed character set while the symbol palette grew
independently inside the JSX, with nothing connecting them. **13 of the 18 characters the tool OFFERS were
absent** — every Greek letter, `ℓ`, `′`, `·`, `½`, `¾`, `<`, the vector arrow. A missing character does not
merely fail to start a run, it **splits** one, because the scan looks for CORE: `π` fell outside and `1: x+…`
began the isolate. π and ℓ are how planes and lines are *named* here, so the gap sat on the tree's most
common utterances. The 2-D mirror had the same hole for twelve characters (`α…θ`, `²`, `^`, `≅`, `~`, `<`, `_`).

**Why the green suite shipped it.** The ADR-3D-121 assertions were `toContain(LRI)`, byte-reversibility,
idempotence, and one-isolate-not-one-per-token. **Every one of them is true of a broken transform.** None
said the isolate *covers* the run — the only property visible on screen. The lesson generalises past bidi:
an existence assertion over a transform is nearly free of content; assert the invariant the user sees.

**The mechanism, not the two characters.** Adding π would have been the patch. The palette moved out of the
JSX into `ui/symbols3.ts` / `ui/symbols.ts` so the vocabulary is a declared, importable thing, and the suites
now assert **palette ⊆ CORE ∪ delimiters**. Adding a button without teaching bidi about it is a test failure,
which is the only version of this fix that survives the next author. `RUN_CORE`/`RUN_DELIMS` are exported
for that test alone; nothing branches on them at runtime.

**Both trees, copied not shared** (docs/20 §12 rule 1). 2-D's `bidiSegments` is also the `.docx` export's
run-splitter ([ADR-431](06-decisions.md#adr-431) Am. 1), so the boundary correction lands in Word output too.

**Half (b) of #482 is still open and still needs an operator ruling** — the input box cannot take isolate
characters without corrupting the caret, and forcing `dir="ltr"` is what 2-D tried and reverted (#118). The
recommendation remains a read-only isolated preview under the input, the 2-D live-math-preview pattern.

**Locked** in `bidi3.test.ts` and `i18n/__tests__/bidi.test.ts`: over a corpus of real utterances, **no CORE
character and no half of a delimiter pair may sit outside an isolate**; the operator's exact line ends at the
paren; `π1` is one run; the sentence's own punctuation still stays outside (the property the fix must not
trade away); and the palette-subset drift lock in both trees.

### ADR-3D-123 Am. 1 — half (b) ruled: OPTION 3, the read-only isolated preview

The operator ruled on the input box (2026-08-10), having also weighed a fourth option raised in session —
a richtext/contenteditable input that could carry isolates inside the editable value. **Ruling: option 3.**
Contenteditable buys marginal UX at a disproportionate defect surface (caret jumps on programmatic edits,
IME/mobile composition around zero-width controls, paste sanitization against the byte-exactness
invariant, undo ownership, React's uncontrolled-component friction); the preview delivers the same
information — the line laid out correctly, visible while typing — with none of it.

**Mechanism.** `inputPreview3` in `i18n/bidi.ts` is the pure seam: the isolated text when isolation would
CHANGE the layout, `null` otherwise — so the preview appears exactly when, and only when, the box is lying
about direction. A pure-Hebrew or pure-LTR line previews as nothing; an English session never sees it.
Container direction comes from `textDir3` — content-decided, never `dir="auto"`'s first-strong-character
(the 2-D #118/ADR-312 lesson, copied). The box itself stays byte-raw; the preview is `aria-hidden`
(a screen reader has the input itself).

**Locked** in `bidi3.test.ts`: mixed-direction lines preview isolated and byte-identical under stripping;
pure-Hebrew and pure-LTR lines preview as `null`; `textDir3` decides by content («C במרחק…» is RTL).

### ADR-3D-123 Am. 2 — the preview's LIVE-TAIL rule

The operator play-tested Am. 1 and "got the same output as I type": mid-way through «…+t(m-2,…» the input
ends in `t(m-`, and the finished-sentence boundary rule — which rightly keeps a trailing `.` outside the
run — left that `-` outside the isolate, where it is a neutral in an RTL paragraph and jumps to the far
left. The preview reproduced the box's lie at exactly the moment it exists to correct.

**The rule split is semantic, not cosmetic:** a *finished* sentence's trailing non-CORE characters are
punctuation (strict rule, unchanged — the fact list and every message keep it); a *live* line's tail is an
incomplete expression by definition, because the cursor sits at its end. `inputPreview3` therefore extends
the final isolate over any non-Hebrew tail. A Hebrew continuation («l מקביל למישור») is never swallowed.

**Locked** as a typing simulation, not an example: at EVERY prefix of the operator's line, the preview
leaves no non-Hebrew tail dangling after the last isolate; the strict rule is separately asserted intact
for the fact list.

### ADR-3D-123 Am. 3 — a DECLARATION's name hugs the noun; its equation is the island

Third round of operator play: "I write הישר l and the rest — the l is placed at the end of the line."
Correct diagnosis. One mega-island for «l: x=(1,2,3)+t(m-2,m,m+2)» puts the run's FIRST character — the
object's NAME — at the island's far edge, visually the end of the RTL row, severed from the Hebrew noun
that names it. Typographically «הישר l» is a noun phrase; only the equation is foreign matter.

**The layout follows from splitting, not from positioning:** name island · separator · equation island.
The separator is then a neutral BETWEEN isolates and takes its natural place in the RTL flow — «הישר»,
`l`, `:`, equation block. No coordinates were harmed; the bidi algorithm does the placement.

**The gate is the decision.** Content-blind splitting is dangerous — a naive dash split renders `x-5=0`
REVERSED. A split fires only when the run OPENS with an algebraic OBJECT NAME (`l`/`ℓ`/`π` + digits — the
lane's naming grammar; axis/parameter letters x,y,z,t,m can never match), followed by a COLON (a colon
after a name IS the declaration form) or a SPACED dash with an `=` beyond it (the operator's
«ישר l - x=…»; an arithmetic minus is unspaced, and a dash phrase carrying no equation — the 2026-08-09
prod line «מישור π1 - x+(m-2)y+(m-1)z-5» — stays one island).

The Am. 2 live-tail rule moved INTO `isolateLtrRuns3` as a mode (`liveTail`) rather than a post-step in
`inputPreview3`, because the split must SEE the tail: mid-way through «l - x=» the just-typed `=` is what
licenses the dash split, and a post-hoc PDI move would hide it.

**Not mirrored to 2-D**: the name-colon-equation declaration is the 3-D algebraic lane's syntax; 2-D has
no equation lane and no construct this rule could match.

**Locked**: the five declaration forms split into the two named islands; the danger corpus does NOT split
(`x-5=0`, spaced `x - 5 = 0`, `m-2`, the no-`=` dash phrase); the preview splits mid-typing the moment the
`=` lands; byte-exactness over the split (two pairs of marks, nothing else).

## ADR-3D-124 — the FREE-standing named plane: declare first, tell later

**Context.** The operator's prod session (#487): *"just writing π2 is not supported. I thought I would
create π2 and then say B is on it."* Every plane in the tree had to arrive fully determined — by equation
(`plane3`) or through named points (`pointPlanes`/`relPlanes`) — so the natural incremental order
(declare, then constrain) was unavailable, and even the LLM could not rescue it: the command vocabulary
had nothing to express "a plane I will tell you about in a moment" (measured live: Haiku returned its
cannot-express marker). This ran against the workspace's defining interaction and the tree's own
under-determination-is-welcome principle.

**Operator rulings (2026-08-10).** (1) A membership naming an undeclared plane **auto-creates** it —
the forgiving flow, chosen over refuse-with-guidance; the accepted, recorded cost is that a typo'd name
conjures a plane, bounded by (2): **the noun is required** — «מישור π2» declares, a bare «π2» line stays
not-understood, and every membership phrasing carries the noun by grammar, so no bare-symbol path can
create anything. (3) A free plane draws as a patch that **visibly resamples** until pinned.

**The model.** A free plane is a `planes` entry whose `PlaneDef` carries `free: true` — deliberately NOT
a fourth map: every existence check, operand resolver and renderer sees it without enumeration edits,
and the flag gates the consumers that need its numbers as knowledge. Its 3 DOFs (unit normal 2 +
offset 1) are ADR-052 free DOFs: `resolveFreePlane` honours whatever the figure PINS exactly and samples
the remainder per seed —

- a MEMBERSHIP of an existing point pins the offset and each member-chord constrains the normal; three
  non-collinear members determine the plane (the stability lock: it stops resampling); a contradictory
  fourth refuses `not-on-plane` at submit (keep-prior);
- «ℓ ⊥ π» pins the normal outright; «ℓ ∥ π» removes one normal DOF — these `linePerps`/`lineRels`
  entries are EXCLUDED from the parameter machinery for a free plane (`paramLinePerps`), because there
  they pin the PLANE, not the parameter (measured hazard: «l(m) ∥ π2» would otherwise root-find m
  against the placeholder);
- a stated ∥/⟂ plane relation (claim-gated by the S3 disposition map) pins through the SAME resolution,
  after which the recorded claim verifies green — the M1 duality: one sentence drives a free object or
  verifies a determined one;
- a LATER equation (`plane3` on a free name) replaces the free def outright — M1, the plane3 edition.

**The count is the sampler.** `resolveFreePlane` returns its remaining-DOF count with the resolution;
`Resolved3.freePlaneDofs` carries it and `freeDofCount3` adds it — one source for both, so the ADR-052
conformance smell (sampled but uncounted) cannot re-open.

**Placement coherence.** Free planes resolve BEFORE the point pass (riders and feet read a real plane,
never the placeholder), with one re-run from `resolve3` when a mid-pass member moved a plane (the
ADR-3D-033 re-evaluation pattern). The #367 placement funnel stays conservative per its own doctrine:
a free plane pinned to FIGURE CONTENT (a plane-run relation) pins the placement's rotation — sampling it
would rotate the run out from under the pin; memberships already pinned both components via the existing
lists. A free plane pinned to ABSOLUTES, or pure-sampled, leaves placement sampling untouched.

**Honest boundaries.** `plane-angle` and `never-parallel` on a free plane refuse the new
`plane-not-determined` (their machinery reads equations; pinning orientation from a dihedral angle is
the recorded follow-up). The data panel surfaces a free plane through the EXISTING multi-sample
stability gate: while it resamples nothing prints; once pinned its forced equation appears — the exam's
«מצאו את משוואת המישור» moment, honest by construction. `chooseParam`'s membership root-selection skips
free planes (no parameter rides them).

**Shared with #253 by design.** The mechanism (declare-free → sample → pin-by-accumulated-givens →
report DOFs from the resolution) is the shape the free circle needs; #253 should reuse
`resolveFreePlane`'s structure rather than grow a sibling.

**Locked** in `free-plane.test.ts` (declaration forms He/En; bare-«π2» refusal; auto-create ≡
declare-then-ride byte-identically; per-pin-level DOF counts; the three-member stability regression;
∥/⟂/equation pinning with green claims; the coexisting-parameter guard — m = 4 survives a free plane;
round-trip) and `fixtures3/free-plane-487.geo3.json` (the operator's incremental order through the real
load path).

### ADR-3D-124 Am. 1 — bare «π2» declares (ruling 2 reversed from play)

The operator play-tested the PR and found the deliberately-rejected bare form taking the OTHER door:
«π2» alone escalated to the LLM, which emitted the declaration and drew the plane anyway. So the
original ruling 2 was not preventing creation — it was routing it through a paid, non-deterministic
call to the same outcome, which is the worst of both options. Ruling reversed (2026-08-10): *"anything
that starts with pi is commonly referred to as a plane"* — the notation IS the noun, and the
deterministic parser owns it. The noun-carrying forms all still parse; «נתון π2» rides along. The
original concern (an accidental bare symbol conjuring geometry) is retired by the observation that it
was being conjured regardless — now it is at least free, instant, and reproducible.

**Locked**: «π2», «π», «pi2», «נתון π2» → `free-plane` deterministically; the shadow-matrix snapshot
carries the bare corpus entries with `freePlaneDecl` as winner (nothing shadowed).

### ADR-3D-124 Am. 2 — «absolute» and «self-determined» are two questions (#500)

The operator's first prod session with the free plane typed «π1», «π2», «π1 ניצב ל-π2» and got the #396
redundancy notice: *"the relation was verified ✓ — but it already follows from their definitions, so the
given adds no new information."* On that figure the sentence is **false in both halves**: two bare-declared
planes have no defining equations for anything to follow from, and the stated ⟂ is the only thing orienting
them relative to each other. The figure, the drive and the ✓ were all correct — only the explanation lied.

**Root cause — one predicate answering two questions.** `isAbsolute` (`engine/operands.ts`) is the FRAME
classifier: *does relating a gauge object to this one require the figure to move?* The #396 notice needed a
different property: *are this object's numbers knowledge before any relation is stated?* Until #487 the two
were extensionally equal — every `plane-named` was an equation plane — so one predicate served both and no
one had to name the distinction. The free plane separates them: it is absolute (named, not built from point
ids — the frame classifier is right about it) and **not** self-determined (its orientation comes from
precisely the ∥/⟂ relations `resolveFreePlane` pins it with). #487 gated every consumer that reads a free
plane's coefficients as knowledge — `evaluate` ×8, `apply` ×3, `dataView` — and `notices.ts` was the missed
one. The carries-param escape hatch could not save it: the placeholder's coefficients are all `p: 0`.

**The fix names the distinction rather than testing for the symptom.** `isSelfDetermined(c, op)` joins
`isAbsolute` at the operand seam, with the doc comment separating the two meanings so the *next* consumer
picks deliberately; `buildNotices3` is its first caller. The remaining seven `isAbsolute` sites were audited
(`apply.ts:987/1012/1033`, `evaluate.ts:502/747/1078`, `solve3.ts:247`) and all genuinely mean gauge-frame:
each decides drive-vs-claim, and routing a free plane's relation into the claim lane is exactly what makes
`resolveFreePlane` see it. No behaviour there changes. Consequence, and correct: a free plane pinned by
three memberships is still `free`, so a relation stated against it is the verify register with no notice —
consistent with the #396 ruling that figure objects never notice.

**Adjacent check** (the fix plan called for it): a DISTANCE stated against a free plane refuses
`claim-refuted` — the plane's pin sources are an enumeration and distance is not on it, so information the
student gave becomes an accusation that they are wrong. Filed [#508](https://github.com/dcodish/geo_builder/issues/508)
(P2 feature), not folded in here — it is a capability, not this defect.

**Locked** in `panel-bundle.test.ts`: the operator's exact three utterances → no notice; a free plane ∥ an
equation plane → no notice; a typed line ⟂ a free plane (the `line-rel` lane, whose own suite scenario was
firing the false notice unasserted) → no notice; and the positive control that a free plane REPLACED by its
equation makes a later relation genuinely redundant, notice restored. The two equation-plane and
figure-object controls from #396 stay green.

### ADR-3D-125 — the declaration gate fails CLOSED: an unread word is content (#498)

The docs/17 §1 sibling audit run while fixing the 2-D #497 found the same class alive here, and the
verification was blunt: «משולש ישר זוות ABC» → `["solid"]`, the right angle silently dropped under a
green ✓, against «משולש ישר זווית ABC» → `["solid","cos-angle"]`. One transposed letter, and the tool
drew a figure the student did not describe and told them it was right.

**Root cause — the same one, because the pattern was copied.** Every leftover guard in this tree
enumerates KNOWN vocabulary: `planarPolygon`'s bow-outs for the special-line and inscription families,
`rightTriangle`'s prism/pyramid bow-out, the honesty gates' noun lists. An enumerating guard **fails
open on a word it has never met**, and a typo of a significant modifier is by definition such a word
(the `src3d/CLAUDE.md` register: *an enumeration is not a rule*). The products copy the ADR-024 leftover
discipline by design (docs/20 §12), so they copied its defect too — this is the second half of one
finding, not two bugs.

**The mechanism.** `declLeftover` is the fail-closed half: after a rule has consumed its own vocabulary
and its labels, every surviving TOKEN must be POSITIVELY harmless — declaration vocabulary
(`DECL_VOCAB`, one list covering the solid nouns, base nouns, qualifiers and base clause the family
reads), a construct noun the honesty gates own (`CONSTRUCT_NOUNS`), a neutral connective/request word,
or a prosthetic-prefix remnant. A digit is a magnitude this family cannot express; an unclaimed label is
an object it did not build; an unrecognised word is a statement nobody read. All three DECLINE, which is
the escalation path — the LLM's job is typos, while a silently narrower figure lies. The asymmetry is
the whole argument: growing the neutral list costs one unnecessary LLM call; a gap in an enumerating
denylist costs a WRONG FIGURE under a green ✓.

**Applied as a combinator, not per rule.** `gated(rule)` wraps the seven declaration rules in the RULES
array and reads the claimed labels back off the commands the rule emitted (the `droppedNewLabels3`
trick), so the gate needs no per-rule plumbing and a rule that later grows a branch inherits it instead
of having to remember it. The wrapper inherits `fn.name` — the shadow matrix identifies rules by it, and
an anonymous wrapper would have blinded the very instrument that measures this change.

**Division of labour, made explicit.** A noun that IS known vocabulary but produced no object stays
`droppedConstructNoun3`'s business — «אלכסון» on a bare box keeps the honest refusal ADR-3D chose for it
rather than being diverted to a paid escalation. `CONSTRUCT_NOUNS` therefore moved into `parse3.ts` and
is imported by `honesty3.ts`: one list, so a noun the gate lets through is exactly a noun the honesty
gate is watching, and neither can assume the other covers it.

**Two folds, one observed and one half-supported.** «זוות» → «זווית» is the reported misspelling,
folded at `normalize3` (the ADR-405 chokepoint's 3-D twin) so the whole ישר-זווית family reads it
deterministically; unobserved variants are NOT enumerated — they hit the gate and escalate. «מעויין» →
«מעוין» came out of the closure: the plene spelling was HALF-supported — `statedQuadBase` reads
`מעויי?ן` while `rhombusPrism` and `rightPrism`'s rhombus bail-out spell only the defective form, so
«מנסרה ישרה שבסיסה מעויין …» fell through to the TRIANGULAR default and lost the stated base (a refusal
only because `droppedShapeNoun3` caught it downstream).

**What the closure flushed out.** (a) The tetra word «ארבעון» ends in FINAL nun — the first draft of
`DECL_VOCAB` spelled a medial stem and the corpus caught it within one run, the recorded kaf/nun class
striking the very list written to respect it. (b) «תיבה abcd» was pinned in `lowercase-nudge.test.ts` as
"parses via the #181 uplift" on a false premise: «תיבה» is not an uplift anchor, so nothing ever lifted
`abcd` — `cubeOrBox` found no uppercase run, took the label-less branch and auto-lettered A,B,C,D,
discarding what the student wrote (harmless only because abcd ≡ ABCD; «תיבה klmn» would have drawn
ABCD). It now routes to the mechanism #353 built for exactly this — the nudge, free and instant, with
the corrected spelling. (c) The 2-D `labelRun` trap has no 3-D twin: `RUN` is uppercase-only, so a
lowercase English word can never shadow a label run here.

**Measured, not asserted.** The shadow matrix removed **two** divergent shadow pairs
(`areaClaim → planarPolygon`, `volumeEqPoly → rightPyramid`) and added none — the coarse declaration
rules stopped claiming sentences that were never theirs. Catalog guard (387 rows, both locales) and the
honesty false-positive net (395 rows) stay green.

**Locked** in `issue-498.test.ts`: both folds with their word-boundary guards, the operator's exact
utterance emitting the right angle, the escalation family (unfolded typos, unknown adjectives, a bare
magnitude, an unclaimed label), the keep-parsing corpus (request verbs, the given-marker's feminine
inflection, the adjectival «מלבנית», the final-nun «ארבעון», both locales), and the construct-noun
boundary that must NOT escalate.

### ADR-3D-126 — The gate battery's predicates, and three spellings the rules did not admit (#457, #463, #494, #380)

A P3 batch over two clusters that turned out to share one sentence: *a rule spells ONE form of something
the student writes in several.*

**#457 — the accounting is a MULTISET.** `droppedGivenNumbers3` asked *"does this VALUE appear among the
payloads?"* as a proxy for *"is this OCCURRENCE consumed?"* (docs/17 §2.2). They differ exactly when a number
REPEATS: one account then vouches for every occurrence. In 2-D that shipped — «ריבוע במידות 4*4» committed
size-less because the square's own `ids.length === 4` paid for both stated 4s. Here the class was LATENT (the
array-length account is a vertex count, 8 or 4, which rarely collides with a stated magnitude), and latent is
not fixed: a new rule whose payload carries a value the utterance states twice reopens it silently. Ported
per ADR-W-004 — the honest reading of a sibling audit is that the same predicate is the same defect wherever
it is written.

**#463 — «תיכון» ends in FINAL nun.** `ן` (U+05DF) is a different character from `נ`, and this tree folds no
final letters — it spells both forms everywhere else. The diagonal alternative got it right (`אלכסו[ןנ]`);
the median did not, so `תיכונ` matched only the PLURAL and the singular a student actually types was
ungated. Same fix, plus: the gate now reports the student's WHOLE WORD rather than the regex stem
(`אלכסו[ןנ]` on «אלכסונים» yielded `אלכסונ` — an error naming our own pattern instead of their statement,
which the honesty invariant forbids).

**#494 — a DETACHED clitic re-binds.** `ל ב מ ה ש כ` are prefixes and every gate spells them glued
(`ל?מישור`, `ב-?`), so «מקביל ל π1» was not-handled while «מקביל לπ1» parsed. The spaced form is not a typo:
a Hebrew writer separates the prefix exactly when the operand is a SYMBOL rather than a word, because «לπ1»
looks wrong — so the failing spelling is the natural keystroke in precisely the figures that need it, and it
was escalating to the LLM, burning a paid call for a non-deterministic answer (the silent-cost failure, not
a visible one). Folded at `normalize3`, one level below the ADR-3D-120 shared-vocabulary seam, so a rule
added later inherits it. «ו» is deliberately excluded — it is the conjunction between labels, not a prefix.

**#380 — a plane run is THREE OR FOUR labels**, the `RUN_3_4` shape used everywhere else. The ∥ rule spelled
three inline and REJECTED a box face outright; the ⟂ rule matched an optional fourth label and then
DISCARDED it, committing the triangle ABC for a stated ABCD under a green ✓. And the truncation was covering
for a refusal one layer down: `apply`'s claim branch demanded `plane.length === 3`, so the honest 4-point
form would have returned `no-solution`. Both halves are fixed — the parser carries every label the student
named and draws the ring at that arity, `apply` accepts a run of 3 or more (the claim's geometry needs three
points; the rest of a well-formed run lie on it by construction). **The filed diagnosis blamed PRIMED
labels; measurement says primes were always fine** (`A'B' ⟂ ABC` parses) and the arity was the cause —
recorded because a plausible wrong hypothesis is the part of a bug worth remembering.

**Locked** in `input-tolerance.test.ts`, whose clitic property is DERIVED from the catalog rather than
enumerated: a Hebrew word whose leading clitic can be removed to leave a word the catalog itself uses
standalone is a prefix+noun, so the generator needs no vocabulary of its own and grows with the corpus.

### ADR-3D-127 — Two owners for "clear", one owner for precision (#336, #491)

**#336** — "clear the session" spans the store (facts / queries / plane display / figure name) and
`App3.tsx`'s own state (the command input, the guidance note, the query box). The button was wired to the
store half only, so the text the student had just cleared stayed on screen. 2-D closed exactly this in #146
by routing its button through one handler resetting both owners; 3-D never received the fix — the same
defect, a product apart, which is the recurring cost of copying patterns rather than sharing them (and still
the right trade, per docs/20 §12). Display and language preferences stay untouched: clearing a figure is not
a request to put the panels back.

**#491** — #481 correctly replaced the canvas's private 3-decimal rounder with the panel's shared formatter,
and inherited its 2-place fallback along with it, coarsening `-0.586` to `-0.59`. That was collateral, not
intent. Precision is a property of the SURFACE — a canvas has room a panel row does not — so the decimal
fallback is now the caller's to choose while every exact tier stays shared; asking for more places can never
trade away a surd. What this deliberately does NOT do is make a mixed triple uniform: `(-0.586, √2, 3.414)`
prints the one component that HAS an exact form as that form. Rendering all three as decimals to look tidy
would assert that none of them are exact, which is false, and the alternative — growing `trySurd` into a
general symbolic form for `√2−2` — is the docs/20 §12 no-CAS boundary. **Flagged for the operator as a
presentation call**: the mixed rendering is a pedagogy question, and only the precision half was a defect.

### ADR-3D-128 — Reading the figure: a latin angle label refused with guidance, a flat figure read face-on, and the leftover spin spent on legibility (#394, #5, #385)

**#394 — a deliberate NON-feature gets a reasoned refusal.** «60<a<90» reached prod (2026-07-28) and
died as a silent not-understood. Operator ruling (2026-07-29, re-affirming earlier ones): lowercase
latin is this product's vector/parameter namespace (`u,v,w`, `t,k,m`), so admitting it as an angle label
would collide with it — the answer is to tell the student what to use instead. The guidance offers both
supported forms: name the angle by its vertices («∠ABC», whose bounds already work, ADR-3D-064) or use a
Greek label from the palette («60 < α < 90», ADR-3D-063). Two guards keep it honest — the register only
runs on a FAILED parse, so the sign givens («t > 0») can never be stolen, and the RESERVED letters are
excluded by name, so «60<t<90» stays an honest gap rather than being answered with advice about angles.
**Deliberately not extended** to «זווית a»: the #181 anchored uplift already owns a single letter after
an angle noun (it reads as point A, and «angle b = 60» builds the vertex angle at B), so steering that
to "use ∠ABC" would describe something the tool did not do.

**#5 — a purely planar figure is read FACE-ON.** The ¾ view exists to give a SOLID depth cues; a flat
figure has no depth to cue, so the same view only foreshortens it — a square in `z = 0` reads as a
parallelogram, which is the shape this tool spends its life not drawing unless the student said so (the
V8-g flat lane is full of these). `planarNormal` answers "do all points lie on one plane" scale-relative
to the figure's own spread, and `faceOnView` turns that normal into view angles, clamped below the pole
because the orthographic frame is `cross(forward, z)` and degenerates at ±90° — precisely the top-down
case a `z = 0` figure asks for. The camera FOLLOWS the figure until the student orbits, at which point it
is theirs; the reset button returns it to following. **What did not change is the engine's scoring
direction** (#372): orbiting is a view concern (docs/20 §6.4), and letting a flat figure's own plane feed
back into placement scoring would make the geometry depend on the camera, which that module forbids.

**#385 — the leftover rotation, spent on legibility.** A driven «AB מאונך לישר ℓ1» pins ONE rotational
DOF, and the funnel conservatively froze rotation entirely (the documented ADR-3D-101 deferral). But
rotation about ℓ's own direction PRESERVES the relation exactly — the angle a vector makes with an axis
is invariant under rotation about that axis — so a whole circle of placements satisfies the given, and
which one is drawn was pure luck of the seed. **Measured on this figure, before: `[78.8, 78.8, 78.8,
81.8, 76.4, 79.6, 1.2, 81.1]` — seed 6 drew a true perpendicular as 1.2°, i.e. very nearly PARALLEL.**
The relation was correct and the drawing lied about it, which is the ADR-3D-098/099 rule.

The subgroup is offered only when the rotation-pinning records are ALL line relations sharing ONE
direction; two non-parallel lines have no common preserving spin, and every other pin kind keeps the
conservative freeze. Candidates are ranked clearance-first (never draw a false coincidence) and
legibility-second, and with no spin axis the legibility term is 0 for every candidate, so the ranking
reduces exactly to the previous clearance-only rule — which is why no existing figure moved. **After:
worst deviation ~12°, most seeds within 5°.** Stated as an improvement, not a guarantee: the sampler
takes the best of a bounded number of candidates under a clearance floor.

The `faceOnView` test flushed out a defect in its own subject — the function read `asin(z)` off a raw
normal, which is only an angle for a unit vector, and `planarNormal` returning unit vectors is exactly
why that would have gone unnoticed.

### ADR-3D-129 — The RUNNING parameter of a parametric line is the student's letter (#422)

«l1:x=(4,5,-1)+m(k, 1,0)» was not understood, while the same line spelled with `t` builds end-to-end —
the engine, the sampler, the echo and the save whitelist all support it. **Only the grammar rejected the
student's choice of letter.**

**Root cause — two letters, two roles, and only one of them ours.** A parametric line carries a RUNNING
parameter outside the parens and a FIGURE parameter inside a component:

- the **running** parameter (`m` here) is a BOUND variable — the student picks it and its identity means
  nothing to the figure;
- the **figure** parameter (`k` here) is a free DOF the givens later pin, which `parseParamExpr` already
  reads correctly.

The grammar fixed the bound one at the literal `t` in two places (the body match and the anchor-less bare
gate), so the identical geometry with the two letters swapped between roles had no rule. This is the
[ADR-3D-038](#adr-3d-038) shape — *"the single-ℓ model was a PARSER artifact"*, where ten rules hard-coded
`ℓ` for a name that was the student's to choose — and the same family as ADR-3D-069/070/071.

**No new engine concept.** Position decides the roles unambiguously: a constant scale on a direction
vector is meaningless, so the letter outside the parens can only be the running parameter. The charset is
`[a-w]`, mirroring `PARAM_TERM`'s, which keeps the axes out — «x = x(1,0,0)» can never be read as a line.

**A genuine collision is DEFERRED, not guessed.** «m(m-1, 5-m, -2)» uses one letter in both roles; which
the student meant is not ours to decide, so it escalates rather than building a figure on an assumption.

**The echo speaks the student's notation.** Both echo sites — the parse-time `src` and the canvas's
numeric form — rewrote the letter back to `t`, telling the student their own line in a notation they did
not use. The letter now rides on `Line3Command`/`Line3Def` as an optional `runner`, recorded ONLY when it
differs from `t`, so every existing `.geo3.json` loads and re-saves byte-identically (the save whitelist
is per-command-type, so the field rides along with no whitelist change). It is display-only: nothing
reads it as geometry, which is the honest encoding of a bound variable.

**Left open** (the issue's own sub-question, unanswered): whether a GREEK running parameter (`λ`) should
parse. Greek letters currently mean something else here — the unknown scalars of the `point-in-span` lane
— so admitting one would need a ruling rather than a regex.

**Locked** in `line-param-letter.test.ts`, verified to fail 5-of-9 before the fix: the operator's exact
utterance; m/s/t yielding an identical line bar the echoed letter; the figure parameter still read from
the components; the 2024-Q2 form byte-identical AND carrying no `runner`; the anchor-less #351 form; the
same-letter collision deferred; the axis letter refused; and the echo carrying «m» at every seed.

### ADR-3D-130 — A VALUE literal is one atom and one reader, and they travel together (#510)

«|BD'| = √48» parses and the operator uses √ routinely; «C(√2,1,0)» refused. The tool OFFERS √ and ½ on
its own symbol palette and accepted them in one slot while refusing them in another — the
offered-but-unsupported asymmetry #493 was filed on, in a different position.

**The filed plan was to widen the shared `NUM` atom, and measurement says that would have been worse than
the bug.** About 47 rules compose from `NUM` — angles, ratios, radii, volumes, degree values — and every
one reads its capture with `+` or `parseFloat`. A widened atom without a widened reader turns «√48» into
**`NaN` inside a committed figure**, which is a silent wrong number where the defect was an honest
refusal. So the mechanism is a PAIR: `VAL` (the lexical atom) and `literalValue` (its reader), introduced
together and composed into the places the report names — the coordinate component, the vector injection,
the pair injection. The injection LIST already composed from the component atom and inherited the fix for
free, which is the argument for shared atoms working as intended.

`literalValue` delegates to **`parseCoeff`**, the reader this family already had (the vec-rel coefficient
lane: `5/3`, `0.5`, `½`, `√2`, `2√3`, `√6/4`). A second evaluator would have been a second set of
malformed-input and rounding rules to keep in step — the chokepoint discipline of docs/17.

**A malformed literal DECLINES rather than becoming an unknown.** «1/0» matches the atom lexically and
evaluates to nothing. Before `VAL`, anything matching `COMP` parsed, so the rules read a null component
as SYMBOLIC — left ungated, the student would state a value and the figure would claim not to know it,
the honesty invariant inverted. `unreadableComp` makes those rules decline, all-or-nothing.

**The symbolic branch keeps `NUM` deliberately.** Widening a coefficient or offset runs into the affine
`SymComp` model itself, which is #509's territory and needs a design ruling rather than a lexical change.

**Follow-up, filed not done:** migrating the remaining `NUM` consumers onto `VAL`, each with its reader,
rule by rule. That is a ~47-site retype whose failure mode is a silent `NaN`, so it wants daylight and its
own gate run — not a late sweep riding on this one.

**Locked** in `value-literals.test.ts`: the whole accepted family with its values; the same literals
reaching a vector, a pair and a list injection; the decimal forms byte-identical; the symbolic branch
untouched (incl. `C(p^2,…)` still refused, deliberately); and the malformed-literal refusal. Catalog
entry added, so the in-app commands panel documents it.

### ADR-3D-131 — a recognized ambiguity is a TYPED refusal, never a decline (#516; amends ADR-3D-129)

Operator play of ADR-3D-129 (2026-08-11): the must-refuse control «l1:x=m(m-1, 5-m, -2)» **built** — the
fact list showed the student's utterance while the canvas echoed `ℓ1: x = (0,0,0) + t·(m-1, 5-m, -2)`,
the outer `m` silently reinterpreted as `t`.

**Root cause — a refusal implemented as a decline is not a refusal.** The `params.has(runner)` guard
worked exactly as designed, but it declined via `return null`, and the pipeline maps every untyped parse
failure to `not-understood` — the one code the App **escalates to the LLM lane**. The lane whose job is
to guess then resolved precisely the ambiguity the guard had refused to resolve: Haiku canonicalized the
input to the `t` spelling and the canonical line re-parsed and built. ADR-3D-129 chose this deferral
deliberately (*"the LLM lane is where an ambiguous form belongs"*) — this ADR reverses that ruling. The
two readings are geometrically different (same-letter `x = m·(m-1, 5-m, -2)` is a quadratic curve, not a
line), so the build asserted a reading the student never stated. Not a regression: pre-#422 the utterance
was equally `not-handled` and equally escalated — prod builds it the same way today.

**Class:** *a statement the parser recognizes as ambiguous is declined as not-understood instead of
refused with a clarification, so the escalation lane resolves the ambiguity by guessing.* The correct
chokepoint already existed — the typed refusal channel (`ambiguous-vector-length`), which surfaces a
clarification and never escalates.

**Mechanism.** The guard records the letter (`PARAM_CONFLATED`, reset per parse); `parse3`'s fallthrough
— reached only when NO rule matched, so nothing is ever stolen from a rule that legitimately owns the
utterance — surfaces `{ ok: false, reason: 'param-roles-conflated', letter }`. The store maps it to its
own error code (only genuine `not-handled` may become `not-understood`), the App renders a clarification
naming the letter and its two roles (he + en), and the escalation gate (`err.code === 'not-understood'`)
never sees it.

**Sibling audits.** In-product: the vector-length ambiguity already used the typed channel; this was the
outlier. Sibling product: `src/parser/parse.ts` has a RICH typed-refusal union (ambiguous-angle/-circle/
-container, tangents-exhausted…) but also several recognized-ambiguity declines that reach the LLM
(deferral comments at parse.ts:259, 330, 894, 899) — same class shape, filed as a 2-D audit issue rather
than fixed here (different product, different lane).

**Locked** in `line-param-letter.test.ts`: the operator's exact utterance returns the typed reason with
the letter (both anchor forms, any letter); the store surfaces `param-roles-conflated` and commits
nothing; the ADR-3D-129 controls still build with the student's runner.

### ADR-3D-132 — knowledge gates derive their absolute sources from the construction (#517)

Operator play (2026-08-11): «C(√2,1,0)» + «B(½,1,0)» built green, but no coordinate labels appeared on
the canvas, the data panel read «אין עדיין נתונים יציבים להצגה», and the query «CB» answered «לא נקבע
על ידי הנתונים» — though both points are fully pinned and the engine held the exact positions at every
seed. Reproduced identically with plain decimals: pre-existing prod behavior, not a #510 regression.

**Root cause / class:** *a knowledge gate derives "determined-in-principle" from a private enumeration of
absolute sources instead of the construction's own classifier.* A FRESH coordinate point lands in
`c.points` as kind `'coord'` (apply.ts) — `c.pins` holds only coordinate statements about EXISTING points
— and three gates enumerated pin lists alone: `translationPinned = c.pins.length > 0` (dataView), the
private `vectorFrame` composites (dataView + queries, drifted copies of each other), and `scalePinned`
(solve3). The engine's own `hasAbsoluteFrameObject` knew all the sources; the display gates re-derived
weaker private predicates — the `figureSymbolsOf` lesson (*an enumeration is not a rule*), cross-file
edition.

**Mechanism.** One shared reader, `absolutePointCount` (types.ts — a leaf, importable everywhere), and
shared predicates in evaluate.ts: `translationPinned3` (pins ∪ absolute points; pair/vector injections
still deliberately do NOT count — the #315 constraint, operator-validated), `vectorFramePinned3` (one
composite for the panel and the query lane, so they can never disagree again), and `scaleKnown3`.
`hasAbsoluteFrameObject` now composes from the same reader.

**The scale split — deliberately TWO questions.** `scalePinned` (solve3) answers the SOLVER's question —
"may the pivot freeze the gauge?" — and bare coordinate points never enter the pivot's residuals, so they
must NOT unfreeze it (collapse-basin risk). `scaleKnown3` answers the KNOWLEDGE question — two absolute
points state the distances among them as absolutely as a `length` pin — and counts them, **gated on
`c.solids.length === 0`**: a solid's first dim is the frozen similarity gauge, so a DETACHED cube's
|AB| = 1 is seed-stable without being knowledge, and a categorical gate cannot tell which subgraph a
magnitude lives in. Withhold rather than lie (ADR-052); the mixed-figure refinement is per-quantity
anchoring, out of scope here. Probing this hazard exposed that the PINS path already prints a detached
frozen gauge today (`קובייה` + `A(1,2,3)` → |AB| answers 1) — pre-existing, filed as its own P1, not
silently fixed under this ADR.

**Sibling audit.** 2-D is healthy: its `scalePinned` (sample.ts) derives from the full constraint set and
already counts `pinned free-points >= 2` — the exact analog of `absolutePointCount >= 2`. The 3-D gate
was the outlier. The solver-internal composites in evaluate.ts (gauge classification at 1084/1152/1389)
ask different, solver-local questions and were deliberately left alone.

**Locked** in `data-view.test.ts` (two bare injected points print as facts; a detached solid's gauge
never prints) and `queries.test.ts` (`CB` answers in coordinates, `|CB|` answers, the detached solid's
|AB| still refuses `scale`). The operator's exact √/½ utterances join these locks on the #510 branch
(PR #515), where the literal grammar lives.

### ADR-3D-133 — an undriven SCALE parks at the seed's target, post-hoc (#518)

`קובייה ABCDA'B'C'D'` + `A(1,2,3)`: the query «|AB|» answered **1** at every seed and the panel would
print it — but one pinned vertex determines only translation, and the cube's edge is genuinely free. A
number the student never stated printed as knowledge (the ADR-052 cardinal sin), reachable in prod
through any pin that does not actually determine size. Found by ADR-3D-132's hazard probing; the
operator's ruling (2026-08-11): *"there should be a degree of freedom there… whatever mechanism we have
for all of our tools should be applied here — I don't see any reason that this should even be a
question."*

**Root cause — one solved DOF was exempt from the standard mechanism.** The law (ADR-3D-079 Am. 2):
*"a value the sampler never explores is a default masquerading as determined."* Every DOF the pivot
solves varies with the seed when undetermined — rotation via seed-rotated starts, dims via the seed's
`dims0`, open pin symbols via `symAnchorTargets` — except the gauge's logScale, which an undriven solve
left exactly at its start (0, zero gradient) at every seed. Seed-stable without being knowledge, and the
multi-sample stability gate structurally cannot see a DOF the sampler never varies. That is why
«vector AB» refused honestly (rotation varies) while «|AB|» lied (scale never did).

**Mechanism — the base solve is UNTOUCHED; an undriven scale is parked post-hoc.** An accepted solution
whose logScale never left its start (|logScale| < 1e-9 — the zero-gradient signature; a driven scale was
MOVED by its residuals) is re-solved from that warm point with the scale HARD-pinned (weight 1e3) to a
seed-hashed target, and the park is kept only if the PRIMARY residuals stay exact — a secretly-driven
scale makes the park fail and be discarded, so a determined figure is structurally unreachable. Applied
at both acceptance sites (the per-mirror best, and each collected branch of a sign-selection pool).

**Why not an in-solve anchor — two full-suite calibrations ruled it out.**
1. *Not the starts:* moving every start's logScale to the seed value shifted convergence basins and cost
   hard figures real solution branches (a mirror branch gone → a ± choice printed as fact; a sign branch
   gone → `sign-unsatisfiable` on a satisfiable figure; a drive failing at one seed).
2. *Not a soft anchor at any weight:* at the dims' 1e-4 the pull measurably displaced determined
   coordinates (~2e-5 off integer — `cleanNum` stopped snapping); at 1e-6 it stalled LM on TANGENTIAL
   constraint directions — a quadratic root (2023-Q2's A.z² = 0) progresses at the same error magnitude
   as the anchor's floor, so LM read "no improvement" and stopped at z ≈ 1e-3, and the claim gate
   refused a correct figure. An anchor that shares the objective fights LM termination; a post-hoc pin
   cannot.

The plane-drive lane's own REG_SF·logScale pull (the ADR-3D-030 anti-collapse punishment) is untouched
— weakening it 100× admitted the shrink basin back on real plane-eq figures. The deliberately-frozen
lanes stay categorical-gated: invariantOnly and Stage A never solve scale (`scalePinned`/`scaleKnown3`
own them), and the no-pivot canonical lane keeps ADR-101's frozen first dim — hence ADR-3D-132's
`scaleKnown3` solids guard STAYS; the mixed-figure per-quantity refinement remains open.

**Perf (docs/17 §7):** back-to-back same-conditions cold-resolve of the 2026-ב exam figure: 136.46
(baseline) vs 137.33 ms (parked) — noise; the base solve is byte-identical and the park is gated to
undriven scales. (An earlier +41% reading was ambient-load contamination; corrected on #520, whose
structural LM tail-burn analysis for the anchored lanes still stands as filed perf debt.)

**Sibling audit.** In-product: the other solved DOFs already comply (this reuses their law). 2-D: its
solver has no similarity pivot of this shape; magnitudes gate on the constraint-derived `scalePinned`
(sample.ts), which counts pinned points — no undriven-solved-scale lane to exempt.

**Locked** in `queries.test.ts`: |AB| refuses on the pinned-vertex cube; the mechanism itself (the edge
length varies across seeds while A holds (1,2,3) exactly); and the determined exam figure still answers
|AB| = 12 exactly.

### ADR-3D-134 — a refusal names the cause it actually FOUND (#492, #425)

Two operator reports, one class. In both the engine's refusal was **correct in substance** and its
*explanation* named the wrong cause — because the explanation was picked from an **enumeration of
kinds** while the finding itself was general (docs/17: *an enumeration is not a rule*). The tool knew
more than it said, which is the honesty invariant running in reverse.

**#492 — «the claim doesn't hold in the figure — check your computation».** On
`ℓ: x=(1,2,3)+t(m+2,m,m-2)` + `π1: x+(m-2)y+(m-1)z-5=0` + `ℓ ∥ π1`, the residual is
`d·n = 2m² − 4m + 4 = 2((m−1)² + 1)` — strictly positive, so **no real m exists**. The engine had
already computed exactly that (`paramRoots` returned nothing while `pinningGivens` was 1), yet the
refusal blamed the student's arithmetic and scoped itself to *this drawing*, implying another
configuration might work. None can. Root cause: `no-roots` was gated on `cmd.type` being
`plane-angle` or `line-perp-plane` — the only pinning kinds when it was written. S2 (#378) added the
line relations to `pinningGivens` and never joined that list, so the statement fell through to the
claim verifier, whose register is *verify-your-answer*. The operator read the refusal as a regression;
it was not (the transposed twin `t(m-2,m,m+2)` gives `2m²−4`, roots ±√2, and still builds — the
ADR-3D-118 branch pair).

**#425 — «no placement matches the given coordinates» on a figure with no coordinates.** Triangular
pyramid, equilateral base, `∠DAB = 120` then `∠DAC = 53.13`: impossible in R³, since ∠BAC = 60° and the
spherical triangle inequality forces ∠DAC ≥ 60°. The engine reproduces that bound exactly (60.1
accepted, 59.9 refused) — the solver was never at fault. Root cause: the pivot guard was **deliberately
widened to every pin kind** (its own comment says so) while the message it emits stayed the
injection-specific one. The student was told to check coordinates they never entered, and *not* told the
one thing that mattered.

**Mechanism — gate the refusal on the PROPERTY, and split it where the guard splits.**
1. `no-roots` now fires when a fact **owns a pinning given** (`pinningGivens` + `paramGivens`, tracked
   by the same count-delta discipline that already attributes claims and pins), so a pinning kind added
   later is covered the day it is added. It is hoisted **above** the claim pass, and that pass is
   SKIPPED in this state: with no valid parameter value there is no configuration to verify against, so
   every param-dependent claim would "fail" and earlier, innocent facts would be marked refuted too. A
   claim cannot be refuted by a figure that has none.
2. The pivot refusal splits the way its guard does: a **coordinate** pin (`pins`/`vectorPins`) keeps
   `injection-unsatisfiable`; every other pin kind reports `givens-contradict`.
3. Both payloads **name the statements** — the parameter, the refused utterance, and the givens it
   fights with (capped at three with a visible «…», never a silent truncation). This is the honesty
   invariant's own requirement: name the conflicting *statement*, never internal state.
4. Blame lands on the **newest** owner alone (ADR-276). The previous loop marked every pin owner, so a
   saved file showed four red rows accusing statements that were satisfiable until the last one arrived.

**Deliberately not changed.** The `size-on-solid` boundary and the V2 verify-your-answer register are
byte-preserved — a claim that merely fails at *this* configuration still reads `claim-refuted`. The
pivot-lane claim pass was examined for the same "no configuration to verify against" argument and left
alone: no measured case reaches it, and widening it would be a change with no evidence behind it.

**Scope check (the whole 3-D lane ran):** exactly two tests moved, both ours, both asserting the old
bare `{ code: 'no-roots' }` payload — and both now carry the correct symbol and statement. No case
changed *whether* it refuses; only *what it says*. That is the evidence the generalisation was
faithful.

**Locked** in `refusal-honesty.test.ts`: the operator's two #492 figures side by side (the impossible
one refuses `no-roots` naming m; the satisfiable twin still pins ±√2), the residual-level discrimination
(`roots` empty vs two) so the lock is the finding and not the wording, the #425 feasibility boundary
(65/61/60.1 accepted — 59.9/55/53.13 refused), the absence of any coordinate in that figure, a
coordinate contradiction still reading `injection-unsatisfiable`, and single-statement blame.

### ADR-3D-135 — the √ reader accepts a PARENTHESISED radicand, at the shared atom (#513)

`|BD'| = √48` parsed; `|BD'| = √(48)` did not. Parenthesising a radicand is the ordinary way to write
it and nothing in the UI signals that the bare spelling is the required one: the log shows the operator
taking **four attempts and two paid LLM escalations** to state one magnitude, with the fallback once
answering `dropped-given`.

This is the **third** instance of paren-blindness in a scalar reader (#299, #300), and the issue's own
recommendation was to fold it into #509's arithmetic-expression reader rather than add a fourth local
branch. **Operator ruling (2026-08-11): fix the shared pair now, leave real arithmetic to #509.** The
distinction that makes this not-a-patch: `√` has exactly ONE lexical atom and ONE reader, deliberately
paired by #510 (*"a widened atom without a widened reader turns √48 into NaN inside a committed
figure"*). The fix adds the paren form to a single shared `RADICAND` fragment consumed by `VAL`,
`SYM_TERM` and `evalRadical` together, so every slot composing from them — length givens, coordinate
components, coefficients — gains it in one place. `SYM_TERM` was folded in for exactly this reason: it
already reads through `parseCoeff` → `evalRadical`, so leaving its private spelling behind would have
recreated the drift on day one.

`√(4·3)` still refuses honestly — a radicand needing arithmetic is #509's ruled Option-B reader, not a
fourth private branch here. `radicandValue` returns null on a zero denominator and `evalRadical` rejects
a negative radicand, so a malformed magnitude refuses rather than reaching a figure as NaN.

**The lexical ratchet caught the first draft, and was right.** Composing `RADICAND` from inline
`\d+(?:\.\d+)?` copies pushed parse3's number-fragment count 24 → 26, and the docs/24 S2.1 guard failed
the suite. That is exactly the defect the ratchet exists to stop — *the fix for a lexical bug inlining a
fresh lexical copy* — so the fragments were composed from a new `UNUM` atom instead, which `NUM`,
`VAL`, `SYM_TERM`, `RADICAND` and both radical readers now share. Net **24 → 14**; the recorded ceiling
moves DOWN, per the ratchet's own rule (lower when you sweep, never raise).

**Locked** in `input-tolerance.test.ts` (the cluster's third member): the operator's exact utterance,
agreement with the spelling that already worked, the family across coefficient/divisor/fraction
radicands, the same atom serving a coordinate component (`C(√(2),1,0)` ≡ `C(√2,1,0)`), the honest
refusal of `√(4*3)`, and byte-identical behaviour for every form that already parsed.

### ADR-3D-137 — the diagonal noun carries its solid (#449)

`אלכסון AC'` built; `אלכסון תיבה AC'` did not. **2 users**, filed F2 from the 2026-08-08 log triage and
operator-approved then. `bareSegment`'s prefix admitted the diagonal noun but nothing after it, so the
label group had to match `תיבה`, the rule declined, and every occurrence of the phrasing burnt a paid
LLM call for a segment the tool draws natively.

**No new construct.** A space diagonal IS a segment (the #72 ruling), so the command is the existing
`segment3` and both phrasings lower to byte-identical output. The fix widens the prefix by an optional
SOLID qualifier — `תיבה`/`קובייה`/`מנסרה`/`פירמידה`, with or without the definite article — kept as one
shared fragment rather than a spelling inlined into the rule, plus the English
`(space|body|main) diagonal (of the box)` forms.

**Ordering was the only real risk and it is structurally absent:** `bareSegment` is the LAST rule, so
every other lane has already had its chance, and `cubeOrBox` returns null on a two-token utterance —
a solid DECLARATION (`תיבה ABCDA'B'C'D'`) can never be read as a diagonal. Locked as a no-theft test
rather than argued.

The catalog gains the phrasing (it is both the user-facing reference and the coverage map), which
enrolls it in the catalog corpus gates automatically.

**Locked** in `issue72-phrasing.test.ts` alongside gap 2, whose remainder this is: both phrasings emit
the same command, every solid noun with and without the article, the English forms, an end-to-end build
drawing the diagonal as ink on a real box, and the no-theft case (the box declaration and a plain
segment untouched).

### ADR-3D-138 — a stated DISTANCE pins a free plane's offset; no free plane accuses the student (#508)

Found by the #500 fix session as the adjacent check that issue's plan called for:

```
פירמידה משולשת ABCD
מישור π2                       → free plane declared (#487)
המרחק בין A למישור π2 הוא 5    → ✗ claim-refuted, the fact NOT committed
```

`claim-refuted` reads *your stated distance is wrong*. Nothing was wrong with it. The plane simply had a
**sampled** offset that nothing had tried to move — and the missing pin was itself the reason for the
accusation. Sibling of ADR-3D-134's pair, and worse than #492: there the statement was at least
unsatisfiable; here it is perfectly satisfiable and the tool called it false.

**Root cause — the pin set was an enumeration.** `resolveFreePlane` honoured exactly two sources,
memberships and ∥/⟂ relations: the kinds that existed when #487 landed. Anything else that constrains a
plane and is not on that list silently became a refuted claim (docs/17 — *an enumeration is not a rule*;
the same shape as #500, where the notice classifier was the missed consumer of the same flag).

**Two halves, and the second is what closes the class.**
1. **The capability.** A distance from a known point pins the OFFSET exactly: with a unit normal,
   `|n·p + d| = value ⟺ d = −n·p ± value` — precisely the DOF the resolver samples when no member fixes
   it. Which SIDE of the point the plane sits on is a genuine unstated choice, so it is a sampled
   BRANCH (ADR-052): "show another configuration" flips it, and the normal keeps its two free DOFs, so
   the figure still visibly varies while the stated distance holds exactly at every seed.
2. **The class.** A claim about a plane whose relevant DOF is still SAMPLED can never be *refuted* — the
   configuration it "fails" in is one the tool invented, not one the student stated. It now degrades to
   the honest `plane-not-determined`, naming the plane. So a constraint kind this resolver does not yet
   pin costs a refusal, never a false accusation. The guard reads the claim's plane references by a
   STRUCTURAL walk rather than a switch over claim kinds — an enumeration is what the issue was filed
   on, and a claim kind added later must not quietly escape it.

**Two mechanisms had to follow the pin, both found by measurement, not by reading.** The pin was
correct and the drawn distance was still wrong (6.75 at seed 0), because the offset is pinned to a
POINT and two later stages move points:
- *The free-plane resolution is now a bounded FIXPOINT.* #487's two fixed passes assumed the dependency
  ran one way (planes read positions, then riders read planes). An offset pin makes it genuinely mutual,
  so the loop re-runs the point pass only while the resolution actually moved something, and exits on
  `moved === false` — which is what guarantees planes and positions agree. The cap only bounds a figure
  that will not settle, where behaviour is exactly today's.
- *The landing funnel (ADR-3D-101) treats it as pinned.* A distance-pinned plane ties the figure to
  where a point SITS, so sampling translation would slide that point off the plane just fitted to it,
  and rotation about the gauge origin moves it too. The funnel's own doctrine settles it exactly as it
  did for #487: *a component is sampled only when PROVABLY free*, and neither is. Only the slide
  PARALLEL to the plane is genuinely free; partial freedoms stay conservatively pinned, the documented
  ADR-3D-101 deferral.

**Deliberately left open, and honest about it.** A SECOND distance is real information (it would
constrain the normal) that this resolver does not pin — it refuses `plane-not-determined` rather than
pretending. Filed as follow-up rather than half-built.

**Scope check:** the whole 3-D lane (128 files, 2480 tests) passes with **zero** tests moved — including
`free-plane`, `landing-funnel` and `member-drive`, the three that own the mechanisms touched.

**Locked** in `free-plane-distance.test.ts`: the operator's exact sequence committing and holding to 1e-6
at eight seeds, the DOF cue reading 2 (offset pinned, orientation free), both sides reachable across
seeds, the orientation still resampling, the same result with no solid in the figure, the second-distance
case reading `plane-not-determined`, a DETERMINED plane still producing an ordinary `claim-refuted` (the
guard did not swallow real refutations), and the unpinned + membership lanes unchanged.

### ADR-3D-139 — a marker that names a point BINDS its own label, or the rule declines (#530, P1)

Prod session `rsqkx2` (2026-08-11): «אלכסוני A'B'C'D' נחתכים בנקודהS» — an ordinary missing space. Prod
answered `already-defined`, which was a **cover story**: the utterance did not fail to parse, it parsed
into a **different figure**. The marker regex required `\s+`, did not match, and the code fell back to
the token list — A′ became the crossing point and the quad **B′C′D′S**, a face the student never wrote,
was assembled from letters lifted out of two different roles. Only the accident that A′ already existed
turned it into a refusal; on a figure where it does not, this **builds a plausible wrong figure**, which
is the P1 line in docs/22.

**Root cause — an unanchored positional fallback after an optional marker.**
`const [id, ...rest] = trailing ? [...] : toks` — when the marker fails, `id` silently becomes the FIRST
label. The comment directly above that line records the same fallback biting once before, for the
English point-last form: *"with it unmatched, the id fell back to the FIRST label and the rule built a
garbage quad."* **That fix widened the marker VOCABULARY and left the fallback armed.** Fixing the
spelling again would have been the third patch on the same line.

**The fix is structural, and the vocabulary fix rides on top of it — not instead of it.**
1. *Structural:* marker word present ⇒ `id` comes from the marker or the rule **declines** (escalates —
   the LLM may still read it). It can never be sourced positionally. This closes the class including the
   mistypes nobody has typed yet, which is why the lock is a PROPERTY over the rule (*for any utterance
   carrying the crossing marker, the parse binds the marker's own label or returns null*) and not two
   more strings.
2. *Vocabulary:* the marker is now ONE shared fragment, `AT_POINT` = `בנקוד[הת]\s*`, used by all nine
   sites that name a point this way. Hebrew glues the noun into the word, so «בנקודהS» is a keystroke
   slip rather than a malformed sentence.

**The sibling audit the issue asked for found a second, quieter member.** `circleTangentLine` read the
same marker with its own `\s+` spelling into an OPTIONAL capture: «מעגל שמרכזו O משיק לישר AB בנקודהK»
committed a tangent circle with `touch` undefined — **the student's K silently dropped, with a green ✓**.
Not a wrong figure, but a lost given, and the honesty invariant forbids both. It is fixed by the shared
fragment. `centroidRule` and the four anchored cut-readers were checked and are safe by construction
(the label is a required capture in a fully-anchored sentence regex, so a failure is a decline), and they
gained the tolerance anyway.

**A real gap this exposed, filed rather than fixed here (#535).** `droppedNewLabels3` DOES report the
dropped `K` — but the deterministic submit path never asks it. Its guard comment reasons that *"the
rules parse the utterance itself, so the deterministic path needs no gate"*; the tangency case falsifies
that assumption, since a rule parsed the utterance and dropped a label. Turning the gate on for the
deterministic path is a change with a real false-positive surface (the ADR-430 measurement pattern), so
it is scoped separately rather than bolted onto a P1.

**Locked** in `at-point-marker.test.ts`: the reported utterance building the operator's figure (S at the
midpoint of A′C′), the invented quad asserted absent by name, the PROPERTY over nine marker spellings,
a marker-without-a-readable-label declining, the no-marker point-first forms still reading positionally,
spaced ≡ glued at all eight remaining sites, and the tangency label no longer dropped.

### ADR-3D-140 — the angle OPERAND cluster: derive the operand, don't enumerate it (#522, #523, #524, #512, #534, #8)

Six issues, one diagnosis. In each, a statement whose **twin builds** was refused the moment one
coordinate of it changed — its NUMBER (singular → plural), its NOUN (מישור → פאה), its VALUE FORM
(45 → α), or its PLANE KIND (ABC → [xy]) — and one layer down, the moment a free plane's stated angle
was anything but the two endpoints the pin set happened to list. Every one is docs/17's *an enumeration
is not a rule*, in the operand grammar rather than the refusal layer (ADR-3D-134's cluster) or the pin
set (ADR-3D-138's).

**#522 — number.** `NOUN` spelled the singular only, so `readOperand('המישורים ABC')` could not strip
its noun and classified as no operand at all. Because the seam is SHARED, that single omission refused
the plural form across angle, ⟂, ∥ **and** distance simultaneously — which is what makes it one defect
and not four. Plurals are now an optional SUFFIX on each atom exactly as `ה?` is an optional prefix, and
the CONJOINED subject (one noun heading two operands, with a plural predicate) is read once by
`readOperandList` / `readRelationSides` at the seam. A per-rule fix here would have been the enumeration
mistake again, one level up.

**#524 — noun.** `פאה`/`בסיס` are how a bagrut question names the two planes of a dihedral: by role in
the solid, not by point run. A face and a base ARE point-run planes, so nothing in the engine was
missing — pure operand vocabulary, inherited by every relation family at once. `PERP_SPLIT` gained the
feminine agreement «מאונכת» in the same breath: a predicate must be admitted wherever its subject can
be, and `פאה` is feminine (∥ already carried its full set; ⟂ carried only the plural).

**#523 — value form.** #319 gave the α NAMING form to `linePlaneAngle`'s value reader alone, so «…היא
α» worked for exactly one operand pairing and refused the moment either side changed kind. The angle
sentence is read by three parallel rules split by operand kind, so a value form added to one of them is
a divergent shadow pair by construction. One `ANGLE_VAL` atom now serves all three, and a general
`relMarks` carries a named angle over ANY operand pair. The panel derives its degrees through
`angleBetweenOperands` — **extracted from `relDeviation`**, so the value PRINTED and the value TESTED
cannot disagree (the `memberHolds3` precedent) — under the same knowledge gate as every derived value:
a named angle the givens do not determine shows its name and no number.

**#512 — plane kind.** A coordinate plane existed only as a special-cased tail inside the #324 rule,
whose subject must be a point-ring, so ~8 unrelated-looking refusals were one missing member of the
operand set. `Operand3` gains `plane-coord` and `axis`; they are the one kind whose geometry is
figure-independent, so the resolver cannot fail. `isPlanar` is shared for the same reason the set is.
The point-run cell lowers to the EXISTING `coord-plane-rel` command rather than a second spelling of one
relation.

**#534 — the pin set, again.** `resolveFreePlane` honoured `perp` and `parallel` and dropped `angle`.
But those two ARE the line↔plane angle at its endpoints — «ℓ ⊥ π» is β = 90° (n ∥ û), «ℓ ∥ π» is β = 0°
(n ⊥ û) — so the code enumerated the ends of a continuum and refused everything between. With |n̂| = 1,
sin β = |n̂·û|, so the normal rides a CONE about the line at half-angle (90° − β); the half-angle is
knowledge and the SPIN is not, so the spin is sampled and "show another configuration" walks the family.
The endpoints now fall out of the general case instead of standing beside it.

**#8 — and the exam gap closes on the vocabulary.** With #524 landed, «הזווית בין הפאה SBC לבסיס ABCD
היא 60» drives the pyramid to exactly 60° with no new geometry at all. The in-face altitude likewise
needed only the definite article and a trailing naming triangle on a construct that already existed.
The apex-form remainder («הגובה מ-S לצלע BC») belongs to #343 and is left there.

**Two hazards, both found by measurement and fixed rather than shipped.**
1. *The shadow-matrix HARD gate earned its keep.* The moment the plural noun became readable,
   `planeRelAngle` could claim «הזווית בין המישורים π1 ו-π2 היא 45» — which `angleBetweenPlanes` owns
   with a different lowering (the parameter root-find and branch choice ride on it). The winner had not
   changed, but two rules reading one sentence differently is a trap waiting on rule order. Resolved by
   an explicit deferral, so **the pair is gone rather than allowlisted**.
2. *A new operand re-created ADR-3D-138's false accusation.* Routing coordinate-frame relations through
   the ordinary claim lane made «BD' ⊥ מישור [xy]» come back `claim-refuted` — yet it is satisfiable
   (rotate the box until the diagonal stands vertical); nothing drives the figure's PLACEMENT, which is
   the pivot's lane (#386). `hasAbsoluteFrameObject` now counts the frame itself (it had enumerated the
   absolute objects that can be DECLARED and missed the frame), `Resolved3` publishes
   `placementSampled`, and a frame claim judged against a placement the funnel INVENTED reports
   `placement-not-fixed` — what is actually missing — instead of blaming the student. A parse-time
   refusal was tried first and rejected: it also deferred pairings that verify perfectly well.

**Left open, deliberately:** the standalone «מישור [xy]» declaration (it needs the operator's ruling on
whether it should DRAW a reference plane), the axis relation cells, and a driving pin for
gauge×frame ⟂/∥ — filed as #537 rather than half-built.

**Locked** in `angle-operand-cluster.test.ts` (37 tests): every row of #522's table as a
singular≡plural pair, #524's four namings plus the feminine predicate, #523's six pairings carrying the
label with the numeric twin still driving and the determined/under-determined split, #512's parse table
with the four #324 baselines asserted byte-identical and both sides of the placement guard, #534's angle
holding to 1e-6 across five seeds with the spin resampling and both endpoints unchanged, and #8's
dihedral driving to 60° with the altitude foot on BC and ⟂ to it.

### ADR-3D-141 — the FREE-standing named LINE: «ישר k» / bare «l1», pinned by stated relations (#552)

The #487 free plane, line edition, and deliberately the same architecture at every layer. A student can
now declare a line before anything about it is known — and a relation can conjure one — with its 4 DOFs
(direction 2 + anchor 2) sampled per seed until givens pin them (ADR-052: an unstated direction or
position is a free DOF, never a default).

**Naming (operator request, 2026-08-13).** Convention names (`l`, `l1`, typed or ℓ-form, canonical
`ℓ<digits?>`) may stand BARE — the ℓ-prefix marks a line exactly as the π-prefix marks a plane
(#487 Am. 1). Any other single-letter name takes the NOUN («ישר k», «line k»), which is the student
STATING the kind — the parser stays context-free and never guesses, so a bare «k» stays not-handled.
At the operand seam this adds the one token the closed set cannot classify by shape alone (a single
lowercase letter is both a vector name and an arbitrary line name): the noun breaks the tie **only
there**, which does not touch the ADR-3D-100 mechanism — a noun still never overrides a decisive shape.

**Creation (`free-line`, the on-planes ruling-1 shape).** «l⊥BCK» / «l ∥ BCK» / «B על הישר l1» on an
undeclared CONVENTION name auto-creates the free line (`withFreeLines`, bounded by `FREE_LINE_TOKEN`);
a non-convention name must be declared first — a typo refuses (`unknown-line`), never conjures. This
supersedes #375's blanket unknown-line refusal for convention names only; its honest half (arbitrary
names refuse) is retained and locked. Name clashes — a defined line, a through-line, a plane, or a
named VECTOR (`ישר u` beside vector `u`) — refuse `already-defined`.

**Resolution (`resolveFreeLine`).** Pins: ⊥ plane pins the direction outright; ∥ plane leaves one
in-plane spin DOF; ∥/⊥ segment/line/vector pin/constrain likewise; a stated line↔plane or line↔line
ANGLE puts the direction on a CONE — the #534 lesson applied from birth, with ⊥ and ∥ falling out as
the cone's endpoints rather than standing beside it. An EXISTING point stated on the line pins the
anchor (M1); two members ARE the line. Riders are placed by the line, never pins. The anchor of a
crossing relation (⊥ / non-zero angle) is seated ON the related plane so the stated meeting is visible
— still exactly 2 sampled DOFs, measured in-plane. `dof` is returned by the same code that pinned
(the ADR-052 conformance rule), published as `freeLineDofs`, and joins the cue.

**Routing (the load-bearing part).** `planeLinePerps` / `lineRels` entries whose line is FREE pin the
LINE, never the figure's gauge or the parameter — `isFreeLine3` / `figurePlaneLinePerps` /
`figureLineRels` filter them out of every pivot/gauge/parameter consumer (evaluate + solve3), exactly
as `paramLinePerps` already excluded free-PLANE targets. Free planes resolve BEFORE free lines each
fixpoint pass, and `resolveFreePlanes3`'s pin-gathering skips free-line directions: when both are free
the plane LEADS and the line follows, deterministically — the mutual read cannot oscillate. Free lines
join the #508 bounded fixpoint (a pinning member placed mid-pass re-runs the point pass).

**Honesty.** The store's #508 class guard gains its line half: a claim judged against a free line whose
DOFs are still sampled reports `line-not-determined` ("pin this line first"), never `claim-refuted`.
The canvas echo for a free line is its NAME alone — a printed equation would assert sampled numbers
(the ADR-052 canvas rule; the free plane's patch is the precedent). `hasAbsoluteFrameObject` does not
count a free line (only parametric lines carry absolute data), so declaring one never flips the
placement lane. Saves round-trip (`COMMAND_SAVEABLE`).

**Locked** in `free-line.test.ts` (30 tests: both name shapes He+En, the operator's glued «l⊥BCK»,
∥ and cone pins holding to 1e-6 across five seeds with the residual DOFs resampling, member pins, the
two-member 0-DOF stability, cube-untouched stability, clash and typo refusals, the name-only echo, the
round-trip), the updated #375 lock (auto-create vs honest refusal split), the seeded fixture
`free-line-552.geo3.json` (the operator's exact sequence), and the catalog rows (guard-tested He+En).

**Am. 1 (operator play, 2026-08-13) — free objects must hold against FINAL positions.** On the
operator's coordinate-injected prism (A(0,0,0), B on the x-axis, |u|=3 …) «l⊥BCK» was refused
`line-not-determined`. Root cause, and it is a CLASS that predates the line: free planes and lines
resolve pre-pivot (the rider pass needs them), but the PIVOT and the LANDING FUNNEL then move every
point to its stated coordinates — and nothing re-read the free objects afterwards, so the claim was
verified against a direction pinned in the canonical frame, failed, and the guard blamed the student's
correct statement. #487's tests never combined a free plane with an absolute-frame figure, which is
where the plane half hid. Fixed at the root by `reresolveFreeObjects3`: after positions are final
(post-pivot, post-funnel, post-`resolveLatePlanes`, after through-lines), free planes then lines
re-resolve from them and exactly their own DEPENDENTS re-seat (riders — same sample keys, so a gauge
figure is byte-identical — feet, line∩plane crossings; the plane-plane/derived-line passes run after
and read the corrected objects). The figure itself never re-runs: the free subtree reads the figure,
never the reverse. The rider placement routines moved from pass-local closures to module level
(`seatOnPlaneRider` / `seatOnLineRider`) so the re-seat is the SAME code, not a copy. Locked by the
#557 pivot tests in `free-line.test.ts` (verified red without the fix) and the plane twin in
`free-plane.test.ts`.

## ADR-3D-142 — The pyramid height: apex-less «גובה הפירמידה» + the imperative/relative-clause frame (#503)

The #448 remainder, orphaned by PR #469's auto-close and re-filed by triage; scope operator-approved
(the 2026-08-08 F1 item, 2 users, one row LLM-defeating). Two pieces, no new geometry:

1. **Apex-less.** «גובה הפירמידה» / "the height of the pyramid" emits `perp-to-base` with **no
   `from`**; apply derives the apex from the figure's single solid by the engine-wide layout
   convention — base ids first, apex LAST (exactly when `baseRingOf` covers all-but-one id). Several
   solids keep the honest ambiguity refusal; a solid with NO derivable apex (prism/box) refuses
   `bad-solid` — and the parser gates the apex-less form to the PYRAMID noun anyway, so «גובה
   המנסרה» keeps escalating rather than guessing a vertex (ADR-052).
2. **The imperative + relative-clause frame.** «שרטט גובה לפירמידה שיוצא מהקודקוד D לבסיס הפירמידה»
   (the prod utterance, verbatim): an optional leading imperative (`שרטטו?|ציירו?|העבירו?|נעביר|הוסיפו?`
   / draw), «ש?יוצא מ…» as a FROM variant, and the base clause may carry the solid noun («לבסיס
   הפירמידה» — today only bare «לבסיס» or «לבסיס ABC» matched). Each is the recurring
   stated-in-more-than-one-FRAME gap, not a construct.

The rule moved to NAMED capture groups (the src3d convention — its positional read was one
alternation away from the `π1`-reads-as-point-"1" trap). Boundaries held: the #467 bare «גובה
מנקודה D» (no solid, no base) still falls to guidance; the ADR-3D-115 apex-stated forms and the
segment-named owners are byte-identical (locked).

Locks: `height-from-apex.test.ts` — the apex-less trio (He definite/של + En) geometric
(foot-in-base-plane + apex→foot along the normal), the prod imperative row, the exact prod SESSION
pair («פירמידה עם בסיס משולש ישר זווית» → «גובה הפירמידה»), «גובה המנסרה» refused, two-solids
ambiguity refused, and the #448/#467 suites unchanged. Catalog: the two new rows (He + En).

The shadow-matrix snapshot moved ADDITIVELY only — the four new catalog rows won by `perpToBase`,
their intended owner; no existing row changed hands (the ADR-3D-137 no-theft evidence).

## ADR-3D-143 — Bare «מנסרה ABCA'B'C'»: the base arity is derived from the label run (#392)

Prod (log-triage 2026-07-28, 1 user; operator approved 2026-07-29 — "ABCA'B'C' should create a
triangular base"): «מנסרה ABCA'B'C'» was not-handled while «מנסרה משולשת …» built. A 2n-label run
with a primed-mirror second half FULLY determines the base arity — no unstated assumption is needed —
so requiring the base noun was pure ceremony.

Decision: in `obliquePrism`, when NO base noun is present, a run of 2n labels (n = 3..4) whose second
half mirrors the first with primes derives the kind — n=3 → `prism3`, n=4 → `prism4g` — as the
GENERAL triangle/quad (deriving a parallelogram or regularity would assert a property the student
never stated, ADR-052), oblique by default (ADR-3D-089), «המנסרה ישרה» composing as the #289 M1
make-right. Mismatched runs — odd count, unmirrored primes, a primed head, n≥5 (the regular-base
boundary) — keep the honest not-handled/guidance. The derived read lowers byte-identically to the
spelled-out «מנסרה משולשת ABCA'B'C'» (locked), and the shadow-matrix snapshot moved additively only.

Locks: `prism-label-arity.test.ts` (the He/En 6- and 8-label runs → kind/ids/oblique; the tilt
genuinely FREE across seeds; «המנסרה ישרה» composing; four mismatch refusals; byte-identity to the
stated-base form). Catalog: the bare-run row (He + En).

## ADR-3D-144 — Invisible bidi controls strip at the ONE parse seam: display transforms can never reach the parser (#531)

Prod (session `rsqkx2`, twice in one day): a leading U+2066 — injected by the app's OWN display
transform (`isolateLtrRuns3`, ADR-3D-116/121) into the fact list the student selects and copies, a
workflow the tool itself teaches (#525) — made the fully-supported «מישור x+2y-2z+28=0» refuse and
burn a paid LLM call, with nothing visible for the student to act on. `parse3` normalized the prime
at its seam and nothing else; the 2-D seam already stripped these controls, so the class was a 3-D
gap (checked, not assumed — per the issue's own instruction).

Decision: `normalize3` — the one boundary every rule, honesty gate, scope register and LLM lane
reads — strips U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, ALM and BOM, folds NBSP → space, and
collapses doubled spaces (the same paste paths carry both; the prod log's «מישור  x+…»). Never
per-rule and never in the UI: paste from a PDF or another RTL editor carries the same controls. The
stored fact stays RAW and re-parses through the same seam, so save/load round-trips to one parse.
The restored invariant, stated in `isolateLtrRuns3`'s own byte-reversibility contract and now
consumed for the first time: **display-layer transforms can never reach the parser.** The 2-D half
(NBSP was its one gap) is ADR-448 in the 2-D log.

Locks (`bidi3.test.ts`): the assertion that would have caught it — the ROUND-TRIP property
`parse3(isolateLtrRuns3(u)) ≡ parse3(u)` over the whole catalog, He + En — plus the exact prod rows
under a leading isolate and the NBSP/double-space row.

## ADR-3D-145 — «המרחק מ X ל-Y» joins «המרחק בין X ל-Y» at the distance rule (#529)

Found while fixing #508 and filed rather than bundled: «המרחק מ A למישור π2 הוא 5» was `not-handled`
— a paid LLM escalation per use, on the framing that MATCHES the imperative forms the tool already
accepts («אנך יורד מ-M ל…», «גובה מ A ל…») — while «המרחק בין …» parsed. The #494/#513 class: a rule
spells ONE form of a subject students write in several, and the cost is silent.

Decision: the S5 distance rule's subject framing gains the «מ» branch (glued «מA» per the #494 clitic
fold, dashed «מ-A», and the optional «מהנקודה» noun) beside «(ש)בין»; the En side already carried
from/to and is now LOCKED against the He pair. Sibling measure rules checked once per the plan: the
angle family's «בין» has no natural «מ…ל» spelling — no change there, recorded so the check is not
re-done. Catalog gains the «מ» row (He + En); the shadow-matrix snapshot moved additively only (both
new rows won by `distanceGiven`).

Locks: `distance-framing.test.ts` — byte-identical lowering across the framings for point→named-plane
(the prod row), point→point-run-plane, point→line, segment→segment, the dashed spelling, and the
En pair.

## ADR-3D-146 — the NAMED new foot: a ⟂-to-plane statement with exactly one new letter CREATES the foot (#579)

Prod (2026-08-14): «SO גובה הפירמידה» refused «O not recognized» — apply's `seg-plane-rel` disposition
ran `missingPoint` over both endpoints and treated the student's named NEW foot as a missing reference,
while every sibling height rule (`height-to-face` «SF גובה הפירמידה לפאה BDC», `tetra-altitude»
«DE גובה בטטראדר», 2-D's ADR-263 «CD גובה לצלע AB») creates the named foot. The class: a ⟂-to-plane
statement naming its segment, where exactly ONE endpoint is a not-yet-defined label, is uniquely
determined — refusing it as a reference error executes a creation as a lookup (mirror image of the
canonical M1 class).

Decision: one branch at the existing chokepoint — in `case 'seg-plane-rel'`, when `rel === 'perp'`,
exactly one endpoint unknown, the other defined, and the (already-resolved) plane has ≥3 points, the
command delegates to the `height-to-face` funnel with the unknown letter as the foot id (⟂ is symmetric,
so SO and OS both work). No parser change; foot, drawn segment and verification come free through the
funnel the unnamed «גובה הפירמידה» mint (ADR-3D-142) already uses — named and unnamed converge on one
mechanism. Honest refusals preserved: ∥ with a new letter and both-letters-unknown determine nothing and
still refuse; both-exist paths (symbol pin / driving pin / claim) are byte-unchanged. 2-D checked in the
triage: the class is not present there (ADR-263 + freeLabel discipline already create named feet).

Locks: `height-from-apex.test.ts` #579 block — the operator pair «פירמידה ABCDS שבסיסה ריבוע» +
«SO גובה הפירמידה» asserted geometrically (O exists, not E; foot-face from S; foot in base plane;
S→O along the base normal; SO drawn), the He/En mirrors and the reversed «OS», the preserved refusals,
and the unchanged E-mint; fixture `fixtures3/named-foot-579.geo3.json` (full verifier + drift net).

## ADR-3D-147 — the label/number honesty gates run on the DETERMINISTIC submit path too (#535)

The `submitSteps` comment reasoned that the deterministic path needs no label/number gate ("the rules
parse the utterance itself; the LLM round-trip is where meaning can leak"). #530 falsified it: a rule
CAN match an utterance and still drop part of it — an optional label capture that goes unfilled
(«מעגל שמרכזו O משיק לישר AB בנקודהK», the K glued to the noun) committed a partial figure with a
green ✓, and `droppedNewLabels3` returned the dropped K when asked — nobody asked it on that path.
The specific instance was fixed (ADR-3D-139); this closes the generator.

Decision: `store3.submit` now runs `droppedNewLabels3` + `droppedGivenNumbers3` (prior label context
from `derive3(facts, seed).construction`, the same call `submitSteps` already makes) beside the
event-bound `droppedTriShape3`/`droppedConstructNoun3` it already ran. Measurement-first per the
ADR-430 pattern: the gates ran over the catalog corpus (asserted clean in `honesty3.test.ts`, both
locales, strictest empty-prior setting), every stored fixture session, and the full 3-D suite. ONE
false positive surfaced and was fixed at ITS root in the gate: the RHS zero of a standard-form
equation («המישור ENB: 3x+2y-z-24=0») is the form's notation, never a stated magnitude — it had only
ever passed by payload coincidence (a normal with 0-components paying for it), which is why the
catalog rows never flagged. The 2-D twin was checked and needs NO change: `submitPipeline` runs
`droppedNewLabels`/`droppedGivenNumbers` (+ six sibling gates) on the deterministic route before
every commit (ADR-089/ADR-250) — the issue's premise of a 2-D split was stale.

Locks: `store/__tests__/deterministic-honesty-gate.test.ts` — the wiring lock (a mocked dropping
parse must refuse `dropped-given` keep-prior on BOTH a lost label and a lost number; M1 context
stays green) plus a fixtures-wide false-positive net replaying every stored session's gate calls
with true prior context; `honesty3.test.ts` gains the standard-form-zero row (exempt RHS zero,
still-accounted coefficients).

## ADR-3D-148 — plane-run materialisation is ONE rule; the claim carriers join it (#584)

Operator, playing round #582 on the ADR-3D-147 chain: «המישור ABS: x=0» built green but drew no
plane and offered no show/hide tick — *"whenever we reference a plane … we need to apply the logic
of showing the plane and having the tick."* The rule already existed (#383/ADR-3D-109: a statement
referencing an explicit point-run plane materialises it into `pointPlanes`, giving it the patch,
the fold/extent/seam logic and the full/face/hidden cycle) — but it lived as a hand-copied block in
five command cases, and the CLAIM carriers never got a copy: `claim: plane-eq` (the reported case),
`coord-plane-rel`, `line-plane-angle`, and `mutual-rel`'s plane-run operands (which the App3 toggle
already enumerated — a toggle with no patch behind it). The `src3d/CLAUDE.md` trap by the book: an
enumeration is not a rule.

Decision: one helper (`materializePlaneRun` in apply.ts — idempotent, an equation plane of the same
name wins) replaces the five copies and is called from every carrier of an explicit stated run.
Boundaries kept deliberately: the bare «הבסיס» coord-frame form names no plane and the solid's base
is already visible as its face — not materialised; `seg-plane-rel` («CA' מאונך למישור BC'D») stays
ring-edges-only per #380's existing choice (its plane is typically a solid's face; the same helper
is one line away if the operator ever wants patches there). The App3 fact-row toggle enumeration
gains the same carriers.

Locks: `plane-run-materialize.test.ts` — the operator's exact chain end-to-end (green + `ABS` in
`pointPlanes` + a resolved plane to draw), the coord-frame and line-plane-angle siblings, the
bare-base exclusion, and idempotency beside a prior «המישור ABS» plane-through.

## ADR-3D-149 — the inscription ring names itself; the flat lane's quad nouns face the honesty gate (#586, #587 part)

Operator, playing round #582/#584: *"we should have add the option of writing «מעגל חוסם את ABCD»"*,
and separately *"«ABCD ריבוע» also fails … but the error message says it doesn't recognize it."* Two
reports, one lane — the flat polygon rules and their vocabulary.

**The framing half (#586).** `polygonCircle3` hard-required a polygon NOUN before it would read the
ring, so the bare-run form died at the gate while «מעגל חוסם את ריבוע ABCD» worked. The ring is what
identifies the polygon; the noun is decoration. The noun is now OPTIONAL, and its container marker
(ב / "in") is read off the RUN when no noun carries it — the bare-run twin of `בתוך ה?<noun>`.

**The arity half (#586, latent).** The rule's arity map enumerated משולש/מרובע/מחומש, so any other
noun `POLY_WORDS_HE3` admits (ריבוע, מלבן, …) passed the gate and emitted the circle ALONE — the #440
half-drop re-opened on the nouns the map forgot, refusing `unknown-point A` as an opening move. The
kind now comes from the RING'S LENGTH; a stated noun only has to AGREE with it, and a contradiction
(«מעגל חוסם את משולש ABCD») refuses rather than picking a half to believe. *An enumeration is not a
rule* (`src3d/CLAUDE.md`), applied for the third time in this file's history.

**The silent-drop half (#587's "must not survive").** The flat lane carries `TriSpec` only, so
«המרובע ABCD הוא ריבוע» parsed to a bare `polygon4` with ריבוע DISCARDED and drew an arbitrary
quadrilateral with a green ✓ — the #424/#330 class, quad edition, invisible to every gate
(`droppedTriShape3` is triangles-only; `droppedShapeNoun3` scoped itself to solid BASES). Decision:
`droppedShapeNoun3` is bound to the EVENT, not to the solid context — a stated quad noun whose
defining property no committed command carries is a dropped given wherever it was written. It now
also runs on the DETERMINISTIC path (the ADR-3D-147/#530 doctrine: a grammar rule drops exactly as
an LLM decomposition can), and `מקבילית` joins the watched nouns — it was omitted only because every
solid whose base it names carries it structurally, which the same `built.has` test still answers.

Consequence, stated plainly: the quad shape nouns still do not BUILD on the flat lane. They now
refuse honestly, naming the qualifier they could not lower, instead of committing a wrong figure —
the interim #587's own plan called for. The capability half (lowering each family to its constraint
set) is escalated on #587: it needs constraint sets authored fresh (the solid lane realises quad
bases *structurally* via `quadBaseRing`/solid kinds, so there is no macro to mirror) and a ruling on
`rect-complete`, which owns «ABCD מלבן» today with corner-completion semantics no other quad noun has.

Locks: `issue-586-bare-run-circle.test.ts` — the operator's exact pair on the pyramid figure
(«פירמידה ABCDS שבסיסה ריבוע» → «מעגל חוסם את ABCD», every base vertex on the circle at four seeds,
the apex off it), bare-run circum/incircle with En mirrors, byte-identical lowering against the noun
forms, the opening-move arity sibling, the noun/run contradiction refusal, and the silent-drop
refusals with the generic-noun and triangle-lane controls proving the gate did not over-reach.

## ADR-3D-150 — the 3-D canvas declares its base direction at the SVG root (#549)

Operator, on a triangular-prism screenshot: *"note the C' is not written correctly"*. It rendered `′C`
— and the screenshot shows `′A` and `′B` too: **every** primed label was mirrored, not one letter.

Cause: the app shell is RTL Hebrew (`documentElement.dir = 'rtl'`), SVG `<text>` INHERITS the
document's CSS `direction`, and `displayLabel` maps `A'` → `A′` with U+2032 PRIME — a bidi-NEUTRAL
character (class ET). As the trailing character of an LTR run under an RTL base direction it resolves
to the paragraph level and is placed visually BEFORE the letter.

The interesting part is not the bug but why the existing bidi work missed it. #468/#482 fixed this
class by wrapping individual text nodes in a local `ltr()` isolate (LRI…PDI) — witness values, line
forms, coordinate labels. That is an OPT-IN pattern: every new `<text>` has to remember. The point
label — the most common primed run on the canvas — never did.

Decision: declare `direction: 'ltr'` once on the `<svg>` ROOT. The canvas is technical LTR content
throughout (Latin labels, Greek names, digits, math), so one declaration covers every current and
future text node, and the failure mode "a new node forgot to opt in" stops existing. This is 2-D's
`mathSvg.tsx` rule (`direction: 'ltr'` on its SVG text, locked by `mathSvg.test.tsx:47`), **copied
rather than imported** — the product trees never share code (boundary rule 1), so the pattern travels
and the code does not.

Deliberately NOT `unicode-bidi: bidi-override` (which 2-D uses on its own text runs): at a ROOT that
would force a strong-RTL run to lay out character-by-character LTR. `direction` alone sets the base
level and leaves the bidi algorithm to handle any Hebrew run correctly. The per-node `ltr()` isolates
stay — harmless and still correct under an LTR base — so nothing regresses on the nodes that had it.

Locks: `render3.test.tsx` — the root `<svg>` tag itself carries `direction:ltr` (asserted on the root
tag, not anywhere in the markup), the operator's primed prism renders `A′ B′ C′`, and the absence of
`bidi-override` is asserted so the stronger property is never quietly added.

## ADR-3D-151 — the query lane's missing kinds: a bare POINT and a PLANE, answered through the panel's own derivations (#496, #317)

Two operator reports, one gap. #496 (2026-08-10): *"when A is declared, I would expect to see its
values … when I enter A, it should understand what I want."* #317 (2026-07-25, exam part ב.2
«מצאו את משוואת המישור שעליו מונח הבסיס ABC»): the only route to a plane's equation was to enter
«מישור ABC» as a FACT — changing the figure in order to ask a question about it.

`parseQuery` carried ten kinds and neither of these. The asymmetry in #496 is the sharp part: a bare
LOWERCASE letter was already answerable (`symbol`, ADR-3D-119/#480), so the student could ask for «m»
but not for «A» on a figure where A is the more natural question.

Decision: both kinds answer through the derivation the ארגון נתונים panel ALREADY uses, never a
private formatter (the #481 lesson, restated). Concretely:

- **point** → `dataView(c, seed).pointCoords[id]`. Not a copy of its logic — the call itself. That
  brings the per-component stability judgement for free (a coordinate prints only when identical in
  every sampled configuration), the partial form when only some components are forced, the stated-sign
  upgrade to «+?»/«−?», and the #315 translation anchor, none of which can now drift out of step with
  the panel.
- **plane** → `canonicalPlaneEq`, extracted from the panel's planes block and now called by both. A
  NAMED plane is read from the resolve; a bare point RUN is derived from the ring's own positions
  (Newell normal), so «מישור ABC» needs no declaration and asking changes nothing. The #315
  translation gate is applied explicitly here, because cross-sample agreement alone does not catch it —
  an unanchored figure can still be placed identically at every seed.

**Amendment 1 (operator, 2026-08-15, playing the PR):** *"whenever giving a plane, always give both
representations if possible."* Correct, and it exposed the first version as an incomplete reading of
this ADR's own rule: a plane has TWO standard representations, the panel has always printed both rows,
and answering with only the equation meant the query and the panel still disagreed about the same
plane — the exact divergence the shared-derivation decision exists to prevent. The parametric half is
therefore extracted too (`parametricPlaneForm`), and the panel's block now calls it rather than
spelling it inline; the query appends it to the equation. *"If possible"* is the honesty half and is
load-bearing: the parametric form requires a stable ANCHOR and stable spanning edges, and an
equation-given plane has no run at all — in those cases the equation stands alone rather than a sampled
parametrisation being invented to fill the slot.

The guidance register gains both forms (ADR-428's spirit: the lane must teach what it accepts).
`evalQuery`'s switch lists them explicitly as non-numeric rather than letting a future kind fall
through as a silent `undefined`.

Not done here, deliberately: whether the data panel should be OPEN by default when the figure has
stable values to show (#496's other half). That is a UX call for the operator, and it is orthogonal —
the query lane now answers the question either way.

Locks: `query-point-plane.test.ts` — the phrasing family for each kind, English mirrors, the
undetermined refusals (a bare cube's vertex, an unanchored plane), a non-point letter still reading
`notUnderstood`, the vector lane unaffected, asking not mutating the figure, and — the load-bearing
one — **panel-vs-query agreement asserted directly**: every point the panel prints must equal its own
query answer, and a declared plane's panel row must equal its query answer.

## ADR-3D-156 — the data panel is bidi: no list-wide `dir`, direction per row (#559)

Operator, playing PR #557: *"The panel is not bidi — Hebrew text should be RTL and aligned to the
right."*

The «ארגון נתונים» list carried `dir="ltr"` on the whole `<ul>`. In the RTL Hebrew app that made the
math-only rows (relations, points, planes, params) hug the LEFT edge, while the Hebrew `mutual` rows —
which already carried their own per-row direction from #398 — hugged the right. **One panel, two
edges.** The query list immediately above it had been fixed exactly this way (#398/ADR-3D-108); the
data panel predates that fix and kept the override it removed.

**Decision — the #398 shape, applied to the list that never got it.** The `<ul>` carries no `dir` at
all and follows the app. Direction is decided per row, by what the row contains:

- **Hebrew-bearing rows** (`mutual`) take `textDir3(line)` — **not** `dir="auto"`. That distinction is
  the whole point: these rows routinely START with a Latin point label («AB ו-CD מצטלבים»), and `auto`
  keys off the FIRST strong character, so the Hebrew sentence would take an LTR base and reorder into
  garbage. This is the 2-D ADR-312/#118 trap, and `textDir3` (any Hebrew letter ⇒ RTL) is the answer
  this tree already copied for it.
- **Math-only rows** are wrapped in a `MathRun` span carrying `dir="ltr"`, so the MATH lays out LTR —
  that is how mathematics is written in either locale — while the ROW keeps the app's direction and
  therefore sits on the same edge as every other row.

Putting the direction on the CONTENT rather than the row is the load-bearing detail: setting `dir` on
the `<li>` would also reset its `text-align` to that direction's start, which is precisely how the
panel ended up with math on one edge and Hebrew on the other. The two facts — "the math reads LTR" and
"the row sits on the app's edge" — have to be independent, and the inner span is what makes them so.

The `params` hint also loses its physical `mr-1` (a LEFT margin, wrong in an RTL list) for the logical
`ms-1`, and its now-redundant `dir="rtl"`.

Locks (`bidi3.test.ts`, 6): the `<ul>` carries no `dir` (the defect itself); the mutual rows use
`textDir3` and **no** row falls back to `dir="auto"`; each math-only row family is wrapped in
`MathRun`; `MathRun` sets `dir` on a span and not on the row; and no physical `ml-`/`mr-` margin
survives in the panel. The assertions read the MARKUP with JSX comments stripped — this tree has no DOM
harness, and the defect *is* the markup, so the source is the honest thing to assert.

## ADR-3D-157 — a derived line echoes numbers only when they are KNOWLEDGE (#611, P1)

Operator, playing round #596: on a pyramid `SABC` with planes `ABC` and `SBC` and their intersection
line, the canvas printed «ℓ: x = (0.678, 0.467, 0) + t·(-0.568, 0.823, 0)» — while the app's own status
line read **«דרגות חופש שטרם נקבעו: 5»**. One sample of an under-determined figure, shown as the given.
*"the guideline is never show values unless they are fixed."*

This is the canvas honesty rule inverted — the figure asserting a given the student never stated, which
is the same cardinal sin as drawing a figure that violates the givens. P1.

**Root cause: the honesty gate was an ENUMERATION OF LINE KINDS, not a rule.** `scene3.ts` decided the
echo by `def.kind`, with two suppressing branches — free lines (#552) and symbolic parametric lines
(#371/#479) — **each added by a report, each bound to a code path**. Every kind nobody had written a
branch for fell through to the unconditional numeric echo: `plane-plane` (the one reported),
`through`, `common-perp`, `line-projection`. Two of the tree's standing lessons at once — *"an
enumeration is not a rule"* (src3d/CLAUDE.md) and *"a guard bound to a code path rather than to the
event it guards will be bypassed"* (docs/17). The event is **"are these numbers knowledge?"**, and
nothing was asking it. Three reports, one missing rule.

**Decision — one predicate, asked of the engine, that both special cases were instances of:**

```ts
const numbersAreKnowledge = laneA && freeDofCount3(c, resolved) === 0;
```

`laneA` (`hasAbsoluteFrameObject`, already computed here) because without an absolute frame the
figure's placement and scale are a GAUGE, so printed coordinates are arbitrary even for a fully
determined shape; zero free DOF because anything still free will resample. Both are read from the
engine rather than re-derived in the renderer — the #479 lesson.

That the DOF term is *the same number the UI already shows the student* is the property worth having:
the canvas and «דרגות חופש שטרם נקבעו» can no longer contradict each other.

**A STATED given is not a derivation.** The rule turns on provenance, not on kind:

| line | echo |
| --- | --- |
| `parametric`, all-numeric — the student typed it | **always** the numbers: their own given, printed back |
| `parametric` carrying an unforced symbol | the symbolic `src` (unchanged, #371/#479) |
| `through` / `plane-plane` / `common-perp` / `line-projection` / `free` — DERIVED | numbers only when forced; otherwise the bare **name** |

The `free`-line branch stops being a special case and becomes this rule's default; a derived line that
later becomes determined gets its numbers back on its own, which is #371's "once the givens determine
the parameter the numbers ARE knowledge" generalised from one kind to all of them.

**Deliberately conservative.** `freeDofCount3 === 0` is a whole-figure test, so a free DOF that does not
actually touch a given line withholds numbers that would have been true. For DISPLAY that is the
correct asymmetry — withholding a true number costs a little information; printing a false one is the
honesty violation. It is also exactly what the `free`-line branch already did unconditionally.

Locks (`issue-611-echo-knowledge.test.ts`, 12): the operator's exact figure echoing the bare «ℓ» at four
seeds, with its under-determination asserted as a precondition and the planes/line still drawn; one case
per derived kind (`plane-plane`, `through` + `line-projection`, `common-perp`), each asserting the lines
actually EXIST first — an empty list would pass vacuously, which is how a class test lies; the **property**
that no line form carries a digit on any under-determined figure, with a counter proving the sweep was not
empty; and the four regressions this must not cause — a numeric parametric line echoing verbatim, a
symbolic one still echoing its `src`, a determined absolute figure DOES print its derived line's numbers,
and a free line still showing only its name.
## ADR-3D-152 — a stated flat QUAD SHAPE is ONE command with three apply arms (#587)

Operator, playing round #582/#584: on «פירמידה ABCDS שבסיסה ריבוע», *"«ABCD ריבוע» also fails (in
this case ABCD is already a square — but the error message says it doesn't recognize it)."*

The flat-quad lane had **no shape semantics**. `planarPolygon` detected its kind from משולש/מרובע/מחומש
alone, so «ריבוע ABCD», «ABCD ריבוע» and «ABCD הוא ריבוע» were `not-handled` — an LLM burn on a
construct the engine already has — while the one form that *did* parse, «המרובע ABCD הוא ריבוע»,
read the ring and **discarded the qualifier**, drawing an arbitrary quadrilateral with a green ✓. The
#424/ADR-3D-084 silent-drop class, quad edition. [ADR-3D-149](#adr-3d-149) closed the silent half by
making the honesty gate refuse; this ADR is the capability half it was standing in for, and it
**supersedes that interim refusal** — the two utterances now build.

An earlier fix-round escalated rather than shipping the issue's original plan, which rested on a false
premise: it said to *"mirror the constraint sets the solid base-shape macro already emits"*, and the
solid lane emits none — a stated quad base selects a KIND whose ring `quadBaseRing` generates
**structurally** (`QUAD_BASE_DIMS.square = 0`). The escalation also found the real blocker: `rect-complete`
already owned «ABCD מלבן» with *corner-completion* semantics, so shipping a lowering beside it would
leave מלבן behaving unlike its five siblings. **Operator ruling (2026-08-15): option (a)** — one command,
three arms, `rect-complete` absorbed. *"option a is the correct way to go as it fixed the base issue."*

**Decision.** `{ type: 'quad-shape', base, ids }`, applied in three arms dispatched on how many of `ids`
already exist. The dispatch lives at **apply**, never in the parser, because `parse3` is context-free and
only apply knows which corners are on the figure:

- **two or more unknown** → a DECLARATION: declare the `polygon4` (itself the carrier of the four free
  dims) and lower the family's constraint set, which takes away exactly the dims the family fixes.
- **exactly one unknown** → complete that corner from the family's own definition, then lower — today's
  `rect-complete` behaviour, now for four nouns rather than one.
- **all four known** → a STATEMENT about existing points, lowered identically and M1-routed to
  verification. This is the operator's own case, which previously refused `already-defined`.

`rect-complete` survives as a command type so `.geo3.json` files written before this still load; it
delegates to `{ base: 'rectangle' }`. **The grammar no longer emits it** — its rule lowers to the general
command, which is what keeps `planarPolygon` (which now claims the same three phrasings) from registering
as a divergent shadow. One semantics, reached by two rules.

**The constraint sets** are authored fresh against `quadBaseRing`'s definitions, using only proven M1
drivers, and their arithmetic is the evidence they are right: the flat `polygon4` carries 4 free dims
(A, B are the gauge), so each family's constraint count must be `4 − QUAD_BASE_DIMS[base]` — and it is,
in every row. That agreement is asserted as a test, not checked by hand.

| base | constraints | count | free dims left | `QUAD_BASE_DIMS` |
|---|---|---|---|---|
| square | \|ab\|=\|bc\|, \|bc\|=\|cd\|, \|cd\|=\|da\|, ∠abc = 90° | 4 | 0 | 0 ✓ |
| rectangle | ∠dab = ∠abc = ∠bcd = 90° | 3 | 1 | 1 ✓ |
| rhombus | \|ab\|=\|bc\|, \|bc\|=\|cd\|, \|cd\|=\|da\| | 3 | 1 | 1 ✓ |
| parallelogram | ab ∥ dc, ad ∥ bc | 2 | 2 | 2 ✓ |
| kite | \|ab\|=\|ad\|, \|cb\|=\|cd\| | 2 | 2 | 2 ✓ |
| trapezoid | dc ∥ ab | 1 | 3 | 3 ✓ |
| quad | — | 0 | 4 | 4 ✓ |

The two ∥ families use `mutual-rel` + `parallel`, never `cos-angle` with `cos = 1`: at cos = 1 the
residual sits at a maximum, its derivative vanishes, and the descent stalls — the ADR-3D-006 lesson.

**Two deliberate narrowings, each honest rather than convenient:**

1. **The generic `מרובע` keeps its old path.** It states nothing beyond four-sidedness, which the plain
   `polygon4` declaration already says; routing it through the new command would have swapped the
   declaring command — and with it #586's bare-run byte-identity lock — for no semantic gain. The six
   SHAPE nouns lower; the generic noun does not.
2. **Corner completion covers the parallelogram family only** (square, rectangle, rhombus,
   parallelogram). The issue's plan said to complete every family "as the parallelogram point", but that
   is only the fourth vertex for those four: a KITE's is the reflection of `b` across the axis `ac`
   (a different closed form — filed as #601), and a TRAPEZOID or general QUAD **does not determine the
   corner at all** (one free DOF the student never stated). Completing those anyway would assert an
   unstated given, which is the ADR-052 cardinal sin, so they refuse and name the corner. The refusal is
   the correct answer there, not a shortfall.

**The honesty gate needed one change, and the plan predicted none.** That prediction assumed the
family's constraints would be visible in the parsed command list; the option-(a) ruling moved the
lowering to apply, so they are not. `droppedShapeNoun3` therefore accounts the **carrier** — a
`quad-shape` command whose base is the stated noun — which is the same question asked of the command
that actually answers it, and squarely inside the gate's "command side is GENEROUS" doctrine.

**Locks** (`issue-587-quad-shape.test.ts`, plus `fixtures3/quad-shape-587.geo3.json`): the operator's
exact pair green with nothing re-created and nothing moved; every framing (noun-first, labels-first,
copular, definite-copular, He + En) parsing to the same command; each family's constraint set holding
as measured GEOMETRY at four seeds, non-degeneracy asserted first; the DOF table above against
`QUAD_BASE_DIMS`; a false statement on a coordinate-pinned ring refused and its true twin green; all
three arms including completion for a non-מלבן noun and the ADR-052 refusal for an underdetermined one;
`rect-complete`'s three frozen phrasings byte-identical to each other and to the general rule's output;
the legacy command still applying for old saves. Catalog + shadow-matrix snapshot additive.
## ADR-3D-158 — a shape is what it says, and ONLY what it says (#612, #615)

Two halves of one rule, found together while the operator played PR #604.

**#612 — the student's side.** On «פירמידה ABCDS שבסיסה ריבוע» every following quad noun committed
green: «ריבוע ABCD» twice, then «מלבן ABCD», then «מעוין ABCD». Measured: 9 scalarPins, 1 claim,
`notices: []`. The statements were absorbed as DRIVES on a base whose ring is generated structurally
with `QUAD_BASE_DIMS.square = 0` — so they could drive nothing and verify nothing. Inert, with a ✓ that
told the student something had happened.

The cause is that M1's routing question — `freeDims(next) > 0`, *does the figure have free dims* — is
not the question that matters here, which is *can this constraint change anything*. On a structurally
square base the first is yes (the apex still has dims) and the second is no.

**Operator ruling (2026-08-15): "naming error".** So arm 3 asks first what the ring is ALREADY KNOWN to
be, and splits three ways:

| the ring is known to be | the student says | outcome |
| --- | --- | --- |
| square | «ריבוע» | **redundant** — a notice, and the figure is returned untouched |
| square | «מלבן» / «מעוין» / «דלתון» | **naming error** (`shape-less-specific`), naming both shapes |
| rectangle (aspect still free) | «ריבוע» | **drives**, unchanged — the statement ADDS information |

The third row is the one that had to be got right: refusing it too would mean a student could never
SPECIALISE a shape they had drawn, which is ADR-052 upside down. "Naming error" is about a statement
LESS specific than the figure, never one that is more.

"Known" is **structural, never measured** — a solid's base kind (the ADR-3D-090 registry answers it) or
a shape stated earlier and recorded on the construction. A ring that happens to be square at the current
seed is deliberately NOT known: refusing a student on the strength of one sampled configuration is the
class of dishonesty this whole tree is built to avoid.

The hierarchy lives in ONE table, `QUAD_IMPLIES`, including the **exclusive TRAPEZOID** reading the
Israeli curriculum uses — a parallelogram is deliberately not a trapezoid. That table is the entire
content of the ruling, so the two questions ("is this redundant?", "is this a mis-naming?") cannot drift
apart.

**#615 — the tool's side, found while building the above.** ADR-3D-152 lowered the flat quad shapes to
constraint sets ONLY, so the ring's remaining dims came from `polygon4`'s generic sampling and the solver
stopped wherever the residual hit zero. Measured over five seeds: **«מקבילית ABCD» drew at 89.4° — a
rectangle — and «טרפז ABCD» drew right-angled, both at seed 0**, the drawing every student sees first.
ADR-052 forbids precisely those renderings, in as many words, and `quadBaseDims` implements the rule
carefully for the SOLID lane. The two realisations had agreed on DOF arithmetic (asserted) and diverged
on appearance (not asserted).

Shipping #612's refusal without this would have held the student to a rule the tool breaks itself.

`quadDrawnDegenerate` is the flat lane's version of that discipline, and it is deliberately **not** just
"some more specific shape holds": a RIGHT TRAPEZOID is not a narrower `QuadBase` at all — there is no
such member — yet `quadBaseDims` names it explicitly. The lattice alone would have missed exactly the
case the screenshot showed, so each row mirrors that function's own comments.

**It is a PREFERENCE, not a requirement, and that distinction is load-bearing.** The first implementation
made it a hard `requirement`, and an existing lock caught it immediately: «מקבילית ABCD» + «ריבוע ABCE»
(a square sharing three corners) became `bound-unsatisfiable`. The student had said something perfectly
consistent — the givens FORCE the parallelogram to be right-angled — and the tool refused the figure. So
the seed search now runs **two tiers in one sweep** (the ADR-267 lesson: never a second full pass): a
seed that also draws every stated shape visibly as itself wins outright; otherwise the first merely-valid
seed is remembered and returned when the sweep ends. A forced figure draws at exactly the seed it always
would have.

Locks (`issue-612-615-shape-naming.test.ts`, 20): the operator's exact sequence — redundancy notice with
the figure provably untouched (no pins accumulated, no point moved), and the naming error for מלבן /
מעוין / דלתון naming both shapes; the ADD-information direction still driving, and becoming a naming
error only afterwards; `QUAD_IMPLIES` asserted as a table including the exclusive trapezoid; each of five
nouns drawing visibly as itself at the store's own chosen seed and across three resamples; the
right-trapezoid sibling specifically; and the preference yielding for both forced-givens cases.
## ADR-3D-153 — `ישר החיתוך` is ONE rule, and a colliding line name auto-indexes (#333)

Operator: *"I think we dont have a solution for `ישר החיתוך`. we need this construct."* and *"I cannot
create 2 such lines. on the second line i get `'ℓ' כבר מוגדר בציור`."*

The construct was **fully built end-to-end** — engine `plane-plane-line`, `planePlaneLine` in evaluate,
the parametric echo, two catalog entries. What failed was the grammar around it, and the failure had a
recognisable shape: **two sibling rules carried one relation**, each with its own hand-rolled connective
grammar. The named-π rule accepted `בין המישורים π1 ו-π2`; the point-run rule accepted only
`בין המישור X ו/ל בין המישור Y`. Which natural phrasing worked was therefore an accident of which rule
the sentence happened to hit, and four independent narrownesses fell out of that one cause — measured
live from the report and two prod sessions (log-triage 2026-07-28, one user typing the same sentence
three times hunting for the syntax): the `ומישור`/`למישור`/`עם`/`של` connectives, the plural
`המישורים` over point-runs, an uppercase `L2` name, and **no line name at all**, which is what that user
typed twice. The same "enumeration one member short" class as ADR-3D-095/097/100, with the fix precedent
already in the tree: ADR-3D-103 extracted the shared connectives and the registry *shrank*.

**Decision (Part A).** One rule. `pointPlanesLine` is deleted; `intersectionLine` reads both operand
kinds. The registry is one rule smaller than before, which is the outcome that tells you the
generalisation was real.

Its tail reader is deliberately **total rather than enumerated**. Once the head has committed the
sentence to "this is an intersection line", the operands are the only Latin/Greek tokens left — so
stripping the Hebrew words (a different script entirely) and the English function words leaves exactly
the two plane operands, in order. A connective nobody thought to list can no longer cost a student the
construct. A run of 3–5 labels is a point-run plane (a `פאה` face included, since a face is just a run);
a π name is a named plane; a sentence yielding anything other than exactly two operands, or the same
plane twice, escalates rather than building something the student did not say.

Uppercase `L2` is accepted **inside this rule** (operator ruling 2026-08-13): the sentence itself
declares the token a line, so the uppercase+digit point-label convention (`O1`) is not in play here and
stays authoritative everywhere else — asserted as a lock, not left to reading.

**Decision (Part B) — naming, per the operator ruling of 2026-07-25.** The line name is now OPTIONAL on
the command, and collisions auto-index instead of refusing:

- no name stated → the next free `ℓN` (students name the RELATION, not the result — the ADR-3D-048
  `midpoint-auto` pattern);
- name stated and free → it is used;
- name stated, taken, **same plane pair** → an idempotent M1 no-op: one line, said twice;
- name stated, taken, different pair → the next free `ℓN`, **with a notice naming both names**.

All of it at APPLY, never in the parser: only apply knows which names are taken, and `parse3` is
context-free. The notice is derived from a `requested` field stored on the line def rather than emitted
as an event, so it survives reload and undo like every other notice in `buildNotices3` — the notices
doctrine, kept.

Locks (`issue-333-intersection-line.test.ts`, 32): the full phrasing battery from the issue AND the three
prod utterances, He + En; every connective reaching byte-identical commands (the phrasing carries no
meaning); π operands emitting no `plane-through` while point-runs emit two; uppercase `L2` and lowercase
`l2` canonicalising alike; the uppercase ruling NOT leaking (a bare `L על AB` is still a point); the
operator's exact two-`ℓ` sequence coexisting as `ℓ` + `ℓ1` with the notice; the idempotent restatement,
including with the operands in the other order; the nameless form building with NO rename notice; explicit
`ℓ1`/`ℓ2` unchanged; an undeclared π still refusing honestly. Catalog gains three phrasings; the shadow
snapshot's only deletions are the retired rule's name.
## ADR-3D-154 — the panel's relation scan is ONE universe, ONE loop (#577, #558)

Operator (prod, 2026-08-14): a figure holds a plane ABCD and a vector FG that are geometrically
parallel, and the data panel shows no parallelism row. Operator (2026-08-13, playing PR #557): *"the
book says that if l is perpendicular to BCK it is perpendicular to B'C', but the data panel doesn't
show this."*

Two reports, one cause. The panel's derived-relation detection was **two hand-built loops** — an S4
block over drawn segments + named lines (ADR-3D-104), and a #384 block over planes (ADR-3D-108) — so
**a pair whose two sides sat in different loops could never be asked about**. That is an enumeration,
not a rule, which is the trap `src3d/CLAUDE.md` names.

Three live cells fell out of that one cause: **linear × plane** had no code path at all (`mutualSides`
requires both sides linear, so a plane could never enter S4); **declared vectors and ink arrows** were
in no universe whatsoever; and a named line could not meet a solid's **undrawn edge** (#558).

The irony that proves these are capability, not breakage: the STATEMENT lane already supports the mixed
cell completely — `relDeviation` implements the dir×plane reading (ADR-3D-105) and a typed «FG מקביל
למישור ABCD» verifies and drives correctly. Only the panel's passive detection never asked the mixed
question. The ADR-3D-108 theme again: the engine understood more than the UI communicated.

**Decision: not a third loop.** The universe is built ONCE and PARTITIONED into linear and planar
sides, and a single double loop dispatches on the two sides' kinds — linear×linear to the unchanged S4
path, planar×planar to the unchanged plane path, linear×planar to the new `relDeviation` reading. A
future operand kind is then an entry in the universe, not another loop. The mixed math is not
re-derived: it is the same `relDeviation` the verifier uses, so a typed relation and a passive row can
never disagree about the same pair.

**Flood control, three rules, because the universe grew:**

- an undrawn SOLID EDGE earns a row only against a **named line** (#558's gate) — one line × ~12 edges,
  never the 66 edge×edge pairs a cube would otherwise produce;
- an edge pair reports only the informative relations (∥ / ⟂ / coincident); a `skew`/`intersecting` row
  on every undrawn edge is noise, the #384 precedent;
- a linear object whose endpoints all lie in a plane's **own defining run** is contained by
  construction — the linear×planar twin of the shared-endpoint skip.

**`contained` is its own row.** A segment with |cos(dir, normal)| = 0 and zero offset lies IN the plane;
reporting that as plain 'parallel' would be a false statement. This also delivers the `contains` cell
ADR-3D-105 left planned. Decided at arming, operator free to override at play.

**Wording.** A mixed row is asymmetric — «FG מקביל למישור ABCD», never the symmetric «מקבילים», which
misreads for a plane — so `MutualRow` carries `mixed` and the linear side leads. The App picks the key;
it never re-derives the kind from the labels.

**A regression this nearly introduced, caught by an existing lock and worth recording:** unifying the
loops made it tempting to hoist the shared-endpoint skip to the top. That skip is a LINEAR notion — two
segments from one vertex obviously meet there — while two PLANES sharing two points do not meet
trivially at all, and hoisting it silently dropped «המישור ABC מאונך למישור ABD» (planes sharing A and
B). It is scoped to the linear×linear branch, with a lock of its own.

**Deduplication.** One physical object gets one row: a declared vector and the segment over the same
endpoints are the same object, kept under the name that was typed. In practice a declared vector always
HAS a drawn twin, because declaring it leaves ink — the vector's entry in the universe is what makes the
two agree rather than race.

Locks (`issue-577-panel-scan.test.ts`, 15): the reported vector∥plane cell; the mixed flag and side
order; segment⟂plane; `contained` distinguished from `parallel`; the multi-seed knowledge gate (a free
tetra earns no row); all three flood-control rules including edge×edge silence; the #558 cell on an
UNDRAWN edge plus the pre-#558 drawn-edge workaround agreeing; and the S4 and plane×plane columns
asserted unchanged, the plane pair sharing two points among them.
## ADR-3D-155 — the view gauge has THREE components: orbit, zoom, and pan (#533)

Operator (prod): with a box carrying `AC=(10,0,0)`, the solid renders in the top third of the canvas
and the lower half is empty — *"when the shape is positioned in such a place, it is not possible to
see the shape - i need a drag option to drag the shape as is"*.

**Root cause: the view had no translation term at all.** `Figure3` owned exactly two gauges, and
`scene3.ts` hard-pins the content bounding-box centre to the viewport centre — so **where the solid
lands is a function of the content bbox, not of anything the student controls.** Whenever something
else dominates that union the solid is squeezed into a corner: the coordinate axes above all, which
are anchored at the ORIGIN and stretch from `min(0,…)` to `max(0,…)`, so a solid placed away from the
origin roughly doubles the framed extent for free — which is exactly what `AC=(10,0,0)` does. A
growing plane patch or a long parametric line does the same.

And the one framing gesture that existed made it worse: `zoom` multiplies `k` while the centre stays
the bbox centre, so **zooming in magnifies about a point that may be nowhere near the solid** and
drives it further off-canvas. There was no lever that recovered the frame. A missing capability, not
a broken one.

**Decision.** Pan is a screen-space TRANSLATION under an orthographic camera, so nothing is pushed
into the projection: `scene3.ts` stays pure and **untouched**, and every coordinate `buildScene3`
emits is unchanged — including the #483 crossing hit targets, which translate with their marks for
free. `pan: {x,y}` joins `cam` and `zoom` as the third component of one view gauge, on the same tier:
local component state, outside the store and outside undo (docs/20 §6.4). The figure never moves; only
the frame does.

Gestures, per the operator's ruling (2026-08-11) — modifier + secondary drag, no new on-canvas UI:
**left-drag stays orbit and does not move**, because a student who has learned the primary gesture
must not find it repurposed; right- or middle-button drag pans; Shift+left-drag pans (the keyboard
path for a one-button pointer); on touch — where there are neither buttons nor modifiers — a
two-pointer drag pans while one finger still orbits. The canvas suppresses its context menu, or a
right-drag would end in a popup.

**Zoom now zooms about the pointer** (`pan' = q − (q − pan)·r`), which is what turns zoom from the
gesture that loses the figure into a framing tool. The ratio read is the ACTUAL `next/prev`, so at the
zoom clamp it is 1 and a clamped step correctly pans nothing.

**`↺` clears pan too.** One button always returns to a known-good frame — that is what makes free
panning safe to hand a student, and the button lives outside the pan group so a lost frame stays
recoverable by construction.

**Deliberately NOT done:** re-weighting the fit so the solid rather than the union bbox is centred.
The axes must stay visible — showing where the origin sits is the point of drawing them — so the union
fit is a legitimate default. The defect was the absence of a recovery lever, and this supplies it.

**Testing note, and a deviation from the issue's plan worth recording.** The plan asked for gesture
tests (a pan gesture translates the group, `↺` clears pan, a two-pointer drag pans). This tree has no
DOM test harness at all — React is tested DOM-free via `renderToStaticMarkup`, and neither jsdom nor
testing-library is a dependency anywhere in the repo — so a handler-internal decision is one no test
can reach. Rather than introduce a new dependency and a second testing paradigm inside a fix round,
the two decisions worth locking were extracted into `render/viewGauge.ts` as pure functions
(`dragModeFor`, `panForZoom`) and are asserted directly, with the render side asserted structurally.
That is stronger than a gesture test for the arithmetic and weaker for the wiring; the wiring is four
lines and visible in one screen.

Locks (`issue-533-pan.test.tsx`): the full gesture map including left-drag staying orbit; the
zoom-about-pointer invariant asserted as "the point under the cursor maps to itself", the clamped-ratio
no-op, and in/out being exact inverses; exactly one pan group wrapping ALL figure content; the reset
button outside it; and the load-bearing one — `buildScene3` takes no pan parameter and emits identical
scenes, so nothing derived from the scene can drift when the frame moves.
## ADR-3D-159 — a ratio belongs to the RIDER, not to the sentence that declared it (#748)

**Operator report (2026-08-19, prod).** «מקבילון» / «E על AA'» / «AE=2*EA'» — the third line came back
*«הטענה לא מתקיימת בציור — בדקו את החישוב»*. `AE = 2·EA'` is not merely satisfiable, it is **closed-form
determined**: E sits at t = ⅔. The tool refused a correct given and told the student to check their
arithmetic, on the strength of a configuration **it had sampled itself** — the ADR-052 cardinal sin, and
exactly the false accusation ADR-3D-138 exists to kill.

**Root cause — a capability bound to one code path rather than to the concept.** The reading existed and
was correct. `ratioT` had computed `AE = c·EA' ⇒ t = c/(c+1)` since the first 3-D commit (ADR-3D-001/002/003),
and «K על AA' כך ש-AK = 2KA'» is both a locked scenario (2020 קיץ Q2) and an in-app example (`he.json`
`examples.ex4`). But `ratioT` was called **only from inside the `onSegment` parser rule, against the
declaration string**. The same ratio typed as its own fact never reached it: it was claimed by the
`vec-rel` rule, and the M1 claim-vs-drive fork chose *claim*, which refuted.

So the defect was not a missing DOF. A bare «E על AA'» correctly emits `t` **absent** — the free 1-DOF
rider `types.ts` documents — and the seed search samples it. The gap was that no **stated** constraint
could retarget it. Three spellings, three failure registers, one cause:

| stated on its own line | lowered to | before |
| --- | --- | --- |
| `AE=2*EA'`, `AE = 2EA'`, `AE=2EA'` | `vec-rel` | `claim-refuted` |
| `AE:EA' = 2:1` | `length-ratio` claim | `claim-refuted` |
| `\|AE\| = 2\|EA'\|`, `אורך AE = 2*EA'` | `length-rel` (the *drive* path) | `givens-contradict`, `others: []` |

The third row is worth its own note: it reached the drive path and still failed, because `solve3`'s unknown
vector is the 7 gauge unknowns plus free dims and open symbols — an on-segment `t` is not among them, so
the solver reshaped the *box* while E stayed put. **This ADR does not add `t` to the solver**, and does not
need to (below).

**The decision.** The ratio reading belongs to the rider. Two changes, both at chokepoints:

1. **`src3d/engine/onSegmentRatio.ts` — `riderPairsT`, one home for the arithmetic**, imported by both
   parse3 and the apply reducer, so the declaration clause and the standalone fact cannot drift apart.
2. **`applyCommand3Inner` normalizes a rider ratio into the `point-on-segment3` given it is** — at the one
   entry point every command passes through, the ADR-3D-089 `parallelepiped` precedent. `ratioHalves` reads
   all three command shapes into `(pair1, pair2, k)`; one retarget serves them. And inside
   `point-on-segment3`, an existing **free** rider of the same host now takes a stated `t` as a *definition
   update* rather than delegating to the `vec-rel` dual — that dual asked "does it hold?" of a point whose
   whole point is that it has not been placed yet, and refuted the given that was about to place it. An
   enumeration one member short (ADR-3D-095/097/100/#517), in the branch added for ADR-3D-047.

**Why no solver change is needed, and why that is not a shortcut.** `AE = 2·EA'` on a rider of AA' is a
**definition**, not a constraint to satisfy: it fixes `t` in closed form. Adding `t` to the least-squares
unknowns would make a determined quantity into something *searched for*, which is strictly worse — slower,
and approximate where exact arithmetic exists.

**A LENGTH pair is unordered; only a VECTOR pair is directed.** The arithmetic is the same two formulas
either way — for rider R between the host's a and b (`d = b − a`):

- `|aR| = k·|Rb|` ⇒ `t = k/(k+1)`, and the directed `a→R = k·(R→b)`: `t·d = k(1−t)·d` gives the same t
- `|bR| = k·|Ra|` ⇒ `t = 1/(k+1)`, likewise from `b→R = k·(R→a)`

What differs is *which spellings are the same statement*. `|A'E|` and `|EA'|` are the same number, so a
length statement must accept either spelling of either side; `A→E` and `A'→E` are different vectors, so a
`vec-rel` may not. Orientation is therefore the **caller's** business: `riderPairsT` matches both pairs as
sets, and `ratioHalves` marks only `vec-rel` as `directed`, which narrows the candidate rider to the shared
middle letter before the arithmetic runs. The parser's clause is a *length* clause — there is no vector
reading inside «X על YZ כך ש-…» — so it is unordered too.

The non-chain **vector** spelling `AE = 2·A'E` is still not read: as vectors it means t = 2 (E off the
segment), as lengths t = ⅔, and believing either would be a guess. It refuses.

`k > 0` is required, which is also why this family can never drive `t` outside the segment — `k/(k+1)` and
`1/(k+1)` are both in `(0,1)` for every positive k. `not-on-segment` is therefore unreachable from here by
construction, and no dead guard was added to pretend otherwise.

**Amendment (same day, operator play).** The first cut got exactly this wrong: it demanded the directed
chain everywhere, so «|AE| = 2|A'E|» was refused while «|AE| = 2|EA'|» — *the same statement* — built. The
defect was an orientation requirement applied to shapes where orientation carries no meaning, and it hit
every length spelling: `|AE| = 2|A'E|`, `|A'E| = 0.5|AE|`, `אורך AE = 2*A'E`, `AE:A'E = 2:1`, `A'E:AE = 1:2`.
A narrower reading of the honesty argument (*"the vector and length readings disagree, so refuse"*) had been
carried over to spellings that are unambiguously about lengths — the bars, the `אורך` head and the colon
ratio all say so — where there was nothing to disambiguate. All six are now locked, as is the clause twin
«כך ש-AE = 2A'E».

**A rider whose `t` is already stated is left alone.** It falls through to the ordinary claim lane, so
«כך ש-AE = 2EA'» followed by «AE = 3EA'» still refuses — that second statement genuinely contradicts the
first, and `claim-refuted` is the honest register for it. Only a *free* rider is retargeted.

**One thing the triage got wrong, recorded so it is not re-filed.** The `length-rel` row's raw error carries
`others: []`, which looked like a second honesty defect — the student accused of conflicting with nothing.
It is not: `App3` already branches on an empty list and renders `err.givensContradictAlone` («…אין גוף
שמקיים את «{{stated}}» יחד עם שאר הנתונים»), which is accurate. The raw shape is fine and nothing was
changed there.

**Left unbuilt, deliberately:** making `t` a genuine solver unknown. Only a non-closed-form driver would
need it — an angle at the rider, a distance to it — and no such input has been reported. The ratio family,
which is what bagrut questions actually state, is exact without it.

Locks (`issue-748-rider-ratio.test.ts`, 26): the operator's exact three lines with **|AE|/|EA'| asserted at
2**, not merely "no error"; the split form landing every vertex on the one-line form's figure; all fourteen
spellings — both orientations of both pairs across bars, `אורך` and colon, the rider-first
`|EA'| = 0.5|AE|`, the reversed host `A'E = 2EA`; the clause twin; the English mirror;
a prism edge (the class is the rider, not the parallelepiped); stability — adding the ratio moves E and
nothing else; and the honesty set — a contradicting ratio still refuses, an agreeing one verifies, «אמצע»
stays determined, the non-chain form refuses instead of guessing, and a bare membership still invents no `t`.

## ADR-3D-160 — the head of a defining statement is READ ONCE: noun, article, name, separator (#640, #642, #504)

**Context.** The operator typed the exam's own line into prod:

```
ישר l x=(-1,5,-11)+t(m-1,5-m,-2)
```

It appeared in the fact list — built by the **LLM fallback**. The deterministic parser refused it, so a
capability shipped in 2024-Q2 (ADR-3D-006) was reachable in production only through a paid, unchecked guess.
Measured, the body was never the problem: `הישר l: …` and `l: …` parse, `ישר l: …` and `הישר l …` do not.
`parametricLine` had spelled its own head — `(?:הישר\s+|line\s+)?…\s*:\s*` — with the definite article
baked in as a literal and the separator fixed at a colon, while the shared `HE_LINE` token exists in the same
file for exactly this reason.

The measurement also turned up a **second, worse defect the report did not name.** `planeByEquation` was
believed tolerant of the dash form; it is not. The dash fell *into* the equation and became a unary minus, so

```
מישור π1 - x+(m-2)y+(m-1)z-5=0     built  −x+(m-2)y+(m-1)z-5=0
```

— a different plane from the one the student wrote, echoed back to them as their own words. A silent
misreading is worse than a refusal, and no test had ever compared the dash form against the colon form.

**Decision.** A statement that names an object and then carries its **defining body** reads its head through
ONE shared reader — `matchDefHead` + `defBody` — never a per-rule spelling. The head is: an optional noun
(article included, via the shared `HE_PLANE` / `HE_LINE` gates), the name, and a separator drawn from one
list: `:` · a spaced dash · the copula `הוא`/`is` · nothing at all. `parametricLine` and `planeByEquation`
now consume it, so their tolerance cannot drift apart again.

Two rules follow from the reading, and both are typography rather than per-input special cases:

- **A spaced dash after a NAME is a separator; a glued minus is the student's sign.** `π1 - x+…` is a
  labelled body, `π1 -x+…` is a negative coefficient. A leading negative is written glued or after a colon.
- **An equation stated without `= 0` means `= 0`** (#504's remainder). `parseLinearEq` stays the gate — it is
  all-or-nothing and demands a real x/y/z term — so a point-run plane (`מישור ABC`) and a bare free-plane
  declaration (`מישור π2`) can never be read as equations.

**Why a permissive head is safe against first-match-wins.** `parametricLine` runs before `planeByEquation`
and `freeLineDecl`, and the audit comment on #640 flagged widening the separator as the risky half. It is
safe by construction and not by ordering luck: each rule's BODY stays its own strict gate, and a rule whose
body does not match returns null, so the registry simply moves on. A head with no body at all (`ישר l`) is
still the free-line declaration.

**The class, swept.** Every other site that spelled a noun gate inline now uses the shared token: the
line-⟂-plane given and the never-parallel claim both demanded the article (`ישר ℓ ניצב למישור π` was
refused); the never-parallel claim's plane operand rejected the articled form.

**The query lane had the same defect one file over (#642).** `engine/queries.ts` re-spells the Hebrew gates
because it cannot import from `parser/`, and its point head listed the two *coordinate* nouns and forgot the
**subject** noun — so «נקודה A» answered «לא זוהה» while bare «A» answered. Fixed at the gate (`Q_SUBJ`), and
the sweep the plan asked for found three more cells: the length head refused the segment noun
(«אורך הקטע AB»), the volume head refused the solid noun before a vertex run, and the coordinate noun's
suffix gate was `\w*` — **ASCII**, so «קואורדינטות» (the plural the panel itself prints) could never match
while «קואורדינט» could.

**Deliberately NOT done: hoisting the Hebrew gates to a module both trees import.** That is a layering
decision the operator reserved on #642, so the duplication is recorded in code where it lives rather than
resolved by a third copy. It has a real cost: the AREA head still refuses «שטח המשולש ABC», because fixing
that cell needs the polygon vocabulary that only `parser/` holds — filed as #753 rather than copied.

**Consequences.** #504 is closed by this work, not by #509. Its filed premise — *"the component parser
accepts numerics only"* — is disproven: symbolic components have parsed since ADR-3D-006, and what escalated
in prod was the head. It was blocked on #509's scalar carrier since 2026-08-10 and skipped by round #596 on
that basis; nothing in #509 was needed.

Locks: the full article × separator × (numeric | symbolic) matrix, He + En, every cell reaching the *same*
`line3` command and asserted as **deterministic parse, not merely "builds"** (`parse3-v3.test.ts`); the plane
head's separator-vs-sign pair and the `= 0`-less form; the neighbours the permissive head must never steal
(`מישור ABC`, `מישור π2`, `ישר l`); the query lane's noun equality with the bare form, both languages, plus
the plural coordinate nouns and a stray letter still refusing (`queries.test.ts`); and the fixture
`param-line-2024-q2.geo3.json` — the operator's exam session, typed the way the book prints it.

## ADR-3D-161 — the knowledge frame-gate asks the placement funnel's question, not a list of absolute kinds (#639)

**Context.** The operator built the exam's figure in prod — a parametric line, an equation plane, `ℓ ⟂ π`,
and their crossing `A` — and reported: *"point A is not defined or there is no way for me to get point A.
Now we did have an issue like that reported. I thought we fixed it."*

They were right on both counts. The panel derives `m = −5` correctly, `resolve3` holds
`A = (2, 0, −10)` **identically at every seed**, and `src3d/engine/__tests__/lines3.test.ts` has asserted
that number since ADR-3D-006 — while `dataView().pointCoords` was `{}`, the canvas drew no coordinate label,
and the query lane answered **«נקודה A — לא נקבע על ידי הנתונים»**. On the exam's part ג — *«מצאו את שיעורי
הנקודה A»* — the tool held the answer and stated the opposite. The plane equation the student typed was
denied the same way.

**Root cause.** `translationPinned3` gated every point-coordinate and plane surface, and it was
`c.pins.length > 0 || absolutePointCount(c) > 0` — an **enumeration of the absolute sources that happened to
be in front of us when #517 was fixed**. The operator's figure has neither: its absolute frame is an equation
plane and a parametric line. Twelve lines above it sat `hasAbsoluteFrameObject`, which answers correctly, and
which the SOLVER already consults — that is why it samples the placement instead of freezing it. Only the
knowledge gate did not. `src3d/CLAUDE.md`, verbatim: *"An enumeration is not a rule. Repeatedly, a correct
rule was applied to a whitelist one member short."* This is #517's own class, recurring on the members that
were not in the room that day.

**Decision.** The gate asks the question it actually depends on — *is a drawn position CHOSEN or DERIVED?* —
and asks it of the construction:

1. a stated absolute POSITION determines the placement outright (today's first arm, unchanged);
2. with **no** absolute frame object, translation is a pure gauge the funnel freezes, so nothing
   translation-dependent is knowledge (#315's figures are byte-identical);
3. otherwise the frame is absolute, and the only remaining question is whether the figure's **gauge-placed
   content** is being sampled — `placementSampled3(c)` — or whether there is none, which is exactly the
   operator's figure: every object is Lane-A absolute and no vertex was ever placed by convention.

Seed-stability stays the per-quantity arbiter underneath. What changed is *when that arbiter is sound*, and
that is now the funnel's own predicate rather than a second opinion about it.

**One predicate, one definition.** `translationGaugeFree3`, `gaugePlacedIds3`, `freePlaneOffsetPinned3` and
`freePlaneFigurePinned3` were hoisted out of `resolve3`'s body, and `resolve3` now consumes them. The solver
and the knowledge gate therefore cannot drift apart about what "sampled" means — the drift that produced this
bug. (`rotationFree` needs resolved lines and stays inside `resolve3`; it is not needed here, because every
pin it names is also named by `translationGaugeFree3` — rotation-free strictly implies translation-free, so
the funnel's `translationFree || rotationFree` reduces to the pure half.)

**What this deliberately does NOT do.** It does not open the gate figure-wide the moment an equation plane
exists. In the mixed figure — a cube plus the line and the plane — the cube's vertices roam with the sampled
placement and the per-point stability test drops them, while the crossing point is identical at every seed and
prints. A figure whose placement is pinned by a MEMBERSHIP is neither stated nor sampled but **frozen**, so
its coordinates are seed-stable without being knowledge, and the gate stays shut: that case is #611's defect
in the opposite direction, and it is the reason the predicate asks the funnel's question instead of "is there
an absolute object anywhere".

`vectorFramePinned3` rides the same predicate (it already ORed the old one), so the vector family inherits the
correction: a vector between two Lane-A points is knowledge, a cube edge under a sampled placement is not.

Locks (`frame-gates.test.ts`): the operator's exact sequence — `A` reads `(2, 0, −10)` in the panel and from
the query box at seeds 0, 1, 2, 7 and 99, and `מישור π` answers `3x − 5y + z + 4 = 0`; **the over-reach
guard** — in the mixed figure the cube prints nothing while `A1` prints, with the mechanism asserted (the
cube's `A` moves more than 1e-2 between seeds, `A1` less than 1e-9); a figure with no absolute object
unchanged (#315); and the membership-pinned figure staying silent. The exam session itself is a fixture
(`param-line-2024-q2.geo3.json`, ADR-3D-160).

## ADR-3D-162 — a plane named by POINTS is a SET: the run normal is order-free (#571)

**Context.** On a cube, «מישור BB'DD'» — the diagonal plane, named the way a student naturally names it,
by its two vertical edges BB' and DD' — was refused **`not-coplanar`**. The same four points in a
non-crossing order («מישור BB'D'D», «מישור BDD'B'») build fine. B, B', D and D' are perfectly coplanar, so
the message asserted a geometric fact that does not hold: an honesty violation, not a missing convenience.

**Root cause.** `planeFromPointRun` computed `newellNormal` over the **stated** vertex order. The Newell
normal is twice the polygon's SIGNED-AREA vector, so B→B'→D→D' traces a self-intersecting bowtie whose two
triangles have equal and opposite signed area and the normal comes out **exactly 0** (measured on the
cube's coordinates). Resolution returned null, and the store's plane-through verifier reported
`not-coplanar` for want of a resolved plane.

The class: **an order-SENSITIVE computation answering an order-FREE question.** A plane named by points is
a set; every stated order must resolve to the same plane. The verifier's actual honesty guard — every named
point lies on the resolved plane — is order-free already and is untouched.

**Decision.** One shared order-free run normal, `runNormal` in `vec3.ts`, consumed by every student-run call
site: `planeFromPointRun`, the ⟂-pin residuals and the membership residual in `solve3`, the S1 plane-run
operand, the plane claims, the right-apex base and the height's foot in `evaluate`, and the display lane
(`linePlaneAngleAt`, the plane-angle query, the plane query's ring). It takes the largest triple cross
product, which is a function of the point SET, so every ordering gives the same plane.

Two properties are kept deliberately, and they are what make this a replacement rather than a new
behaviour:

- **Orientation.** The stated order still decides the normal's SIGN whenever it says anything (the
  right-hand rule), so every figure that resolves today keeps its exact normal direction — which is what
  «above/below the plane» and the solver's signed residuals read. A self-crossing order says nothing about
  orientation, and there the sign is fixed deterministically by making the dominant component positive
  (stable across iterations and seeds, unlike a first-non-zero rule). No figure that converges today can be
  destabilised, because for all of them the sign still comes from Newell.
- **Refusals.** Collinear and coincident runs still return the zero vector, so every caller's degeneracy
  guard fires exactly as before, and coplanarity is still verified separately — «מישור ABCA'» still refuses.

**Canonical rings keep `newellNormal`.** A solid's faces and a polygon's own ring are built in non-crossing
order, and for those the order IS the shape: it names the edges. Only a run used to NAME A PLANE is the
order-free question.

**The drawn ink (operator ruling, 2026-08-16).** `runRingOrder` reorders the run into the non-crossing ring
around that plane, and the #318 `'face'` patch draws that. Inking B→B'→D→D' would draw a crossed bowtie —
asserting a self-crossing the student never stated. The angles are measured in [0, 2π) from the run's first
point, so a run already stated non-crossing comes back byte-identical and every existing face patch draws
exactly as before.

**Semantic ruling recorded (2026-08-16):** *"a plane between 2 parallel lines is possible and should be
supported."* This is the same plane #532 capability 1 names another way («π1 עובר דרך BB' ו-DD'»); they must
agree, and neither may be half-supported.

Locks (`issue-571-plane-run-order.test.ts`, 9): the operator's exact sequence building with every fact ok;
**stated-order invariance** — six orderings of the coplanar run resolving to one plane identity; the honest
refusal surviving on a genuinely non-coplanar run, which never enters the fact list; a canonical face
keeping its old orientation; the primitives (a bowtie's Newell normal is zero while its run normal is
sound, a non-crossing order keeps its stated orientation and the reversed order is genuinely opposite,
degenerate runs still return zero); and the drawn patch being a SIMPLE ring — with the stated order proven
to self-cross, so the reorder is load-bearing rather than decorative. Fixture:
`plane-run-order-571.geo3.json`.

## ADR-3D-163 — «הורידו שאלה» arrives, and the list is the student's own words (#745)

**Status:** accepted, 2026-08-18 · **Issue:** [#745](https://github.com/dcodish/geo_builder/issues/745)

The question `.docx` export reaches this builder. The composer is shared and product-agnostic
([ADR-W-027](06w-decisions-workspace.md#adr-w-027)); what is decided *here* is what this tree feeds it.

- **The givens are the enabled facts' utterances, verbatim, in entry order** (`src3d/export/questionLines3.ts`).
  The 2-D export omits scaffolding ([ADR-252](06-decisions.md#adr-252)) — a bare segment states no given —
  but that rule is a per-command classification over the *2-D* engine. A second one over `Command3` would
  be new, untested judgement standing between the student's statement and the printed page, and when it is
  wrong it DROPS a given. Operator ruling: verbatim. Revisit with a real figure that prints noise.
- **`bidiSegments3` is now the tree's run-boundary core,** with `isolateLtrRuns3` built on it. The document
  cannot use isolates (Word draws U+2066/U+2069 as boxes) and needs per-run direction instead, so both
  surfaces read the same segmentation — including the #482 Am. 3 declaration split, which reaches the page
  as two islands exactly as it reaches the screen.
- **The inline rasteriser in `App3.tsx` is retired** for the shared `shell/export/svgToPng`. It predated the
  clean-export tagging contract (F3/REN-3) and honoured none of it; image-save and the question figure now
  travel the same path, so a `data-noexport` element cannot leak into one export and not the other.
- The button sits in the tool row beside the image export, gated on there being a given to print — the
  #511 rule that a tool never offers what it cannot honour.

---

## ADR-3D-164 — ONE rule owns the line∩plane crossing, and the offer's candidates are DRAWN INK (#755, #756)

**Context.** Operator, 2026-08-19, prod. Two reports on the same figure:

```
תיבה ABCDA'B'C'D'
E אמצע BB'
מישור ADE
אלכסון AC'
G נקודת חיתוך של AC' עם מישור ADE     ← not-understood
```

and *"when a line intersects with a plane, we have the mechanism of a dot the user can press and give
a letter. this is not triggered here."* One root under both: **the crossing capability was written
against NAMED tokens, while a student's crossing line is drawn ink** — an edge or a diagonal of the
solid, against three of its vertices.

**Part 1 — the parser cell (#755).** Three rules split it, and each generalised one side:

| rule (retired) | line side | plane side | frames |
| --- | --- | --- | --- |
| `lineCutsPlane` | `ℓ`/`l1` only | π-name **or** point run | verb + noun, he + en |
| `planeCut` | two-point segment | π-name only | verb + noun, he + en |
| `segLineCutsPointPlane` | two-point segment, `הישר` REQUIRED | point run only | verb only |

Their union left exactly one square empty — **segment × point-run in the noun frame** — which is the
common case; the named-token forms the grammar did cover are the rarer half. The engine had the
capability all along (`plane-cut` accepts an equation plane, a point-run plane or a rel-plane), so
this was a silent drop on a built capability: the #485 shape again.

The class: *the crossing rules decided their operands by hand-written token shape PER RULE, so each
reached only the operands its author happened to spell.* `lineCutsPlane`'s own header recorded this
one level up — "the vocabulary was centralised but the FRAMES stayed enumerated per rule" — and it was
just as true of the OPERANDS.

**Decision:** one rule, `crossingPoint`, splits on the shared crossing vocabulary and classifies BOTH
operands through `readOperand` — kinds decide, nouns never ([ADR-3D-100](#adr-3d-100)). Roles are
assigned by kind rather than by position, so **either order works without a frame for it**, and the
whole matrix {named line, segment} × {π-name, point run} × {verb, noun} × {he, en} × {either order} is
reachable. A pair that is not line×plane returns `null`, so the segment∩segment and plane∩plane rules
keep their cells — the decline is structural now, by kind, rather than by rule ordering. This REMOVES
two hand-spelled operand vocabularies rather than growing one (docs/17 §3).

**Lowering is deliberately NOT unified.** The two shipped lowerings differ in what they DRAW —
`plane-cut` records the point against a referenced segment; the run-plane path also names the carrier
line, which is what makes a referenced edge or diagonal visible on the figure it was stated about —
and both are asserted by existing tests. Unifying the MATCHING is what fixes the reported defect;
unifying the DRAWING would change shipped figures and wants the operator's eye, so it is filed
separately rather than taken here.

**Part 2 — the offer (#756).** `openCrossings3` looped `resolved.lines × resolved.planes`, and
`resolved.lines` holds only NAMED lines. In a solid figure — nearly every 3-D question — it is empty,
so the mechanism was **structurally dead** however determined the figure was. The plane side was
already general. 2-D's sibling (`resolveDrawnLines`, [ADR-379](06-decisions.md#adr-379)) always derived
its candidates from drawn ink; that is the half the pattern copy left behind.

**Decision:** the candidate set is DERIVED — named lines, plus the solids' own edges, plus the
auxiliary segments, all of them straight carriers already on the canvas. Nothing enumerates the ways a
segment can be born, because both collections live on `Construction3` and every path that draws one
writes there. A named line stays **unbounded** (it is drawn as a full line); a segment is **bounded**,
offered only for `0 < t < 1`, because a crossing outside the ink is not on the figure and a dot there
would name a point the drawing does not show. Every honesty gate is untouched: the unpinned-parameter
gate, position-based "already named" suppression, one dot per location. The clicked utterance is the
segment noun form, which part 1 makes parse — so a clicked crossing stays an ordinary undoable,
savable, replayable fact.

**One correction to the report, measured.** On the operator's own figure the diagonal `AC'` does
**not** cross plane `ADE`: `A` is one of the plane's three defining points, so the segment meets it at
its own endpoint (signed distance of `A` to `ADE` is exactly 0). The dot that was missing there is on
edge `CC'`, which genuinely passes through the plane at its midpoint — and `BB'` crosses too, at `E`,
where the "already named" gate correctly suppresses the offer. The report's diagnosis was right; only
its expected location was wrong, and the tests assert the measured geometry rather than the report's.

**Surfaced, filed, not fixed here:** «G נקודת חיתוך של AC' עם מישור ADE» now parses and builds, and
places `G` exactly on `A` — a point stacked on an existing one, accepted silently. That is the
`line-plane-point` distinctness question (the 2-D [ADR-378](06-decisions.md#adr-378) class), not the
matching defect this ADR fixes.

**Coverage.** `src3d/parser/__tests__/crossing-cell.test.ts` asserts the whole matrix as a product
rather than as instances, plus the operator's exact line and byte-for-byte preservation of the shipped
π-name lowerings; `src3d/__tests__/crossing-dots.test.ts` covers the solid figure end-to-end, the
bounded rule, the surviving honesty gates and a no-dot-explosion bound; and
`fixtures3/crossing-cell-755.geo3.json` locks the operator's session through the real load path.

## ADR-3D-165 — the TYPED crossing binds drawn ink and is bounded by it (#780)

**Context — the operator, playing round #768.** The clickable half of #756 validated. The **typed**
half did not:

```
תיבה ABCDA'B'C'D'
E אמצע BB'
מישור ADE
G נקודת חיתוך של CC' עם מישור ADE
```

`G` landed correctly on the edge — and the canvas grew a **full-height vertical line** labelled `CC'`,
running far above `C'` and far below `C`. `CC'` is already an **edge of the תיבה**; the student was
pointing at drawn ink, not asking for a new object. And «הקטע CC'» — the student explicitly BOUNDING
the operand — produced byte-identical commands, so a stated word was consumed and discarded.

**Root cause: the lowering forked on the PLANE's form, which has nothing to do with the operand.**

```
G … של CC' עם מישור π     → plane-cut                        ← references the segment (correct)
G … של CC' עם מישור ADE   → line-through + line-plane-point  ← mints an unbounded line
```

The `plane-cut` branch was written for π-named planes and the `line-through` branch for point-run
planes, so an accident of how the student named the PLANE decided whether their SEGMENT was
re-created as an infinite line.

That is the [ADR-3D-164](#adr-3d-164) class one step further on. #755 taught the **matcher** that a
student's crossing line is drawn ink; the lowering then converted it back into a named line object,
undoing the fix at the last step. The ADR recorded that unifying the drawing "changes shipped figures
and wants the operator's eye" — this is that eye, and the answer is that it should not draw a new
line. The sharpest evidence was internal: **#756's own offer half already gets it right**, deriving
candidates from the solids' edges and bounding segments to `0 < t < 1` "because a crossing outside the
ink is not on the figure". The two halves of one round disagreed about the same operand.

**Decision.**

1. **A SEGMENT operand lowers to `plane-cut`, whatever form the plane took.** The segment is a
   reference; no line object is minted. One definition of "the lines in this figure", used by both
   paths — which is what #756 built and what the typed path was ignoring.
2. **The crossing is bounded to the ink.** A new status `crossing-off-segment` fires when the crossing
   parameter falls outside the stated segment: the plane cuts the LINE through it, but not the segment
   the student pointed at. Matching the offer's `0 < t < 1` exactly. Previously this could not even be
   detected, because lowering to an unbounded line made every crossing "on" the carrier by definition —
   the honest refusal was hidden by the bug.
3. **A line the student DECLARED (`ישר ℓ`) keeps the unbounded `line-plane-point` route.** Drawing it
   as a full line is correct there. The distinction is drawn-ink-vs-declared-line — exactly the
   question #755 taught the matcher, now asked by the lowering too.

**On «הקטע», and why it is no longer dropped.** The issue asked that the word reach the lowering. It
now does, in the only way that is honest: the bounded, segment-referencing reading it states IS the
default for a segment operand, so the two spellings agreeing is the word being **confirmed**, not
discarded — and the lowering they agree on is the one «הקטע» describes. Before this ADR they agreed on
the lowering it *contradicts*, which is what made the silence a drop. A test asserts both halves (the
spellings match, and what they match on is `plane-cut`).

**Shipped-figure change, recorded rather than absorbed:** `fixtures3/crossing-cell-755.geo3.json` — the
seeded session for #755, which contains the operator's exact sequence — is regenerated. Its stored
lowering loses the `line-through` and its `line-plane-point` becomes `plane-cut`. That diff is the
visible record of the behaviour change this ADR authorises.

Locks: `typed-crossing-ink-780.test.ts` (5 tests — no line object minted, the plane's form no longer
decides how the operand is read, «הקטע» confirms rather than changes, a declared line stays unbounded,
and the operator's figure end to end with `G` strictly inside `CC'`) plus the regenerated fixture.

## ADR-3D-166 — Named view presets: the ALIGN half orbit does not give (#714)

**Operator (2026-08-17):** *"2-D has the rotate and align options. 3-D doesn't — maybe it should."*

**Context.** [docs/28](../docs/28-unification.md) §4a D7 recorded the viewport controls as differing
**by nature** between the builders — 2-D pan/zoom/rotate/flips vs 3-D orbit/pan/zoom/reset (#533) — and
that framing is right as far as it goes: orbit already gives free rotation, so 3-D does not need a
rotate control. What it does not give is the **align** half: snapping to a canonical orientation. A
student reproducing a textbook figure wants the drawing oriented the way the book prints it, and
hunting for "straight on" by dragging is exactly the fiddly thing a preset removes.

**Decision — four named views, defined once, in the orbit's own coordinates.** `VIEW_PRESETS` in
`render/camera.ts` states them as `(yaw, pitch)` pairs, so a preset is literally a camera the student
could have dragged to and nothing downstream needs to know a preset happened.

| preset | camera | what you see |
| --- | --- | --- |
| `front` | eye (0,−1,0) | the **xz** plane — x rightward, z up |
| `side` | eye (1,0,0) | the **yz** plane — y rightward, z up |
| `top` | pitch = `MAX_PITCH` | the ground plane, from nearly straight above |
| `iso` | yaw −45°, pitch atan(1/√2) | true isometric — all three axes equally foreshortened |

Two of those deserve their reasoning recorded:

- **`top` is clamped, not 90°.** Straight down degenerates the frame: `right` is built as
  `forward × ẑ`, which is the cross product of two parallel vectors there. Clamping to `MAX_PITCH` —
  the same limit the UI already imposes on dragging — keeps it a valid frame and, better, keeps it a
  camera the student could have reached by hand, rather than a special case the renderer would have to
  know about.
- **`iso` is not `HOME_CAMERA`.** Home is the ¾ textbook view (−60°, 20°) that the ENGINE also scores
  unstated placements against (#372); isometric is the specific angle at which the three axes are
  equally foreshortened. They are different things and both are offered — and the test asserts the
  equal-foreshortening property rather than the numbers, so it keeps holding if the angles are
  re-expressed.

**Placement — settled by the operator (2026-08-26), and worth recording because the obvious
cross-product answer was the wrong one.** The presets sit **beside `↺` in the canvas control cluster**,
not in the figure-actions row and not in a toolbar tray above the canvas.

The ruling as given: *"any orientation buttons for the shape should appear in the same place."* The
tempting reading was cross-product symmetry — 2-D keeps reset+zoom in the canvas overlay but puts
rotate/flip/align behind a «⟳ transform ▾» toggle in a toolbar row above the canvas
(`src/render/Figure.tsx`), so "the same place" could have meant *2-D's orientation home*. Presented
with all three layouts, the operator chose the canvas cluster: the rule is **all of a figure's
orientation controls in ONE place**, not *3-D copies 2-D's tray*. In 3-D the view controls are `↺`,
zoom and now the presets, and they belong together.

That also happens to be the cheap answer, which is why it needed asking rather than assuming: the
camera state lives in `Figure3`, so the cluster keeps the feature where its state already is, while a
toolbar tray would have meant a new layout row (2-D's `toolbarRow`/`toolbarTray` have no 3-D
counterpart). The decision is the operator's rule, not the implementation's convenience.

Zoom and pan are deliberately **kept** when a preset is chosen: a student who framed the figure did so
on purpose and only asked to turn it — unlike `↺`, which is the one button that returns everything to a
known-good frame (#533).

The labels are i18n-**injected** exactly as `resetLabel` is, and the buttons render only when labels are
supplied, so `Figure3` stays translation-free. The glyphs are decorative; the accessible name is always
the translated label on `title`/`aria-label`.

## ADR-3D-167 — a harvest rule must consume the WHOLE utterance: `injectionList` full coverage + no mid-run binding (#793, P1)

**Report (operator, 2026-08-26, transcribing bagrut Q2).** «נתון: AB = (1,2,3)» committed
`point3 B (1,2,3)` — the stated **pair-vector** given was silently reinterpreted as point coordinates,
and the leading `A` silently dropped. Likewise «נתון: AA' = (k-1, k-7, k+1)» pinned `A'` at symbolic
coords with the first `A` gone, and «נתון: v = (1,2,3) junk u = (4,5,6)` harvested both vectors around
the residue. Both honesty invariants inverted at once, on an existing figure, with no error — P1.

**Root cause (the class, docs/17).** `injectionList` was a **scan-and-harvest rule with no
total-coverage requirement**: it `matchAll`ed items and validated only the *trailing* tail
([ADR-3D-079](#adr-3d-079) Am. 2), so text before the first item and between items was never checked —
silent drop *by construction*. And the item alternation could bind **mid-run**: in `AA' = (…)` the
regex engine skips the first `A` and matches `A' = (…)`; in `AB = (…)` it matches `B = (…)`. The class:
**any harvest rule that commits matched fragments without requiring the whole utterance be consumed
will silently drop or reinterpret stated givens.** Am. 2 had fixed one edge (the tail) of this hole.

**Decision — two laws at the rule, not per-symptom:**

1. **Full coverage.** Every gap — leading, between items, trailing — must be only separators
   (`[\s.,;:]`, plus a bare list conjunction «ו-»/"and", plus Am. 2's sanctioned trailing `paramSign`
   clause). Any other residue ⇒ the rule returns `null` and the whole utterance defers — never a
   partial read. This is Am. 2's own principle extended from the tail to the whole string.
2. **No mid-run binding.** The item regex opens with `(?<![A-Za-z\d'])`, so a label inside a longer
   run can never start an item. «נתון: AB = (1,2,3)» now defers honestly (the standalone form already
   emits `inject-pair`; the prefixed pair item form is the companion feature **#794**).

The conjunction sanction in (1) is deliberate: `נתון: v = (1,2,3) ו-u = (4,5,6)` harvested correctly
before this fix only because the gap was unchecked; a coverage law that refused the natural Hebrew
list conjunction would have turned a working honest input into a refusal. `וגם <residue>` still
defers — the sanction is the bare conjunction token, nothing after it.

**Locks:** the three misparse rows above as refusal unit tests + the conjunction and Am. 2 forms
green (`parse3-v4.test.ts`, `book-coordinate-givens.test.ts`); the operator's exact standalone
utterance stays an honest refusal.

## ADR-3D-168 — one tuple-component grammar: pair/vector injections take SYMBOLIC components (#794; the #325 widening reaching the vector lanes)

**Report (operator, 2026-08-26, the same bagrut Q2 as [ADR-3D-167](#adr-3d-167)).** `AA'=(k-1,k-7, k+1)`
was not-handled (LLM lane also failed), and the exam's remaining vector givens `AB = (k-1, k, 3)`,
`AC = (k+1, 0, k-3)` were equally inexpressible. Missing capability ⇒ feature, PR route.

**The class.** Tuple-component givens must accept the SAME component grammar everywhere. #325
(ADR-3D-079) gave coordinate points the affine `COMP` grammar (`B(2t, t, k)` — each open symbol an
extra pivot unknown), but the widening never reached the vector lanes: the standalone pair rule and
`vectorInjection` still took `VAL` literals, and `injectionList` hard-coded "a vector value must be
numeric". Which tuple accepted a symbol was an accident of which rule read it — the #493/#510
asymmetry, one level up.

**Decision — widen at the existing chokepoints, no new machinery:**

1. **Parser.** All three tuple lanes read components through the ONE `parseComp` / `symStructure` /
   `unreadableComp` path: the standalone pair rule, `vectorInjection`, and `injectionList` — which
   also gains the **pair item** (`AB = (…)`, two labels, `=` mandatory as in the standalone rule),
   tried before the single-label point item and safe only because ADR-3D-167's full-coverage +
   no-mid-run laws hold. The item alternation moved to **named groups** (the shifting-index trap).
   `inject-pair` / `inject-vector` commands carry `x/y/z: number | null` + optional `symExprs`,
   the `point3` shape. Bare distinct letters are PLACEHOLDERS (that component does not constrain) —
   the #325 point register, now uniform: `נתון: v = (10,n,0)`, which used to refuse, parses with
   `y` unconstrained.
2. **Engine.** `vectorPins`/`pairPins` components are `number | null | SymComp`, exactly as `pins`.
   One derivation everywhere (the *enumeration-is-not-a-rule* discipline): `pinSymsOf` spans all
   three pin families — so `param-sign` reaches a pair symbol, the DOF cue counts its unknowns, and
   the params panel prints it; `solvePivot` collects pin symbols from all three lists and evaluates
   vector/pair residual targets through the same `compTarget` (a null component contributes no
   residual). Apply mirrors point3's combine and its one-namespace-per-role guard (a pin symbol
   that is also the figure's coord-sym parameter refuses `two-params`).
3. **DOF accounting made uniform.** `freeDofCount3` counted `vectorPins.length * 3` and did not
   count `pairPins` at all (a pre-existing gap); all three families now count per non-null
   component, and open pin symbols add unknowns as before.
4. **Catalog.** The numeric pair injection (`BD = (-4,5,12)`) was never cataloged — added, with the
   symbolic standalone and list forms; the LLM prompt derives from the catalog, so the fallback
   lane learns the forms for free.

**Why the figure is determined (the exam's own logic):** right prism ⇒ AA'⊥AB and AA'⊥AC ⇒
2k²−6k+4 = 0 ∧ 2k²−2k−4 = 0 ⇒ k = 2 — the structure pins the parameter through the pivot exactly
as `AB=7` pins `t` for point pins. A LONE symbolic pair given leaves its symbol OPEN and
seed-varying (ADR-052; the Am. 2 seed-anchor mechanism applies unchanged).

**Locks:** `issue-794.test.ts` (k = 2 at every seed, exact vector landings, panel `k = 2`,
sign-given pass/refuse, lone-given openness); fixture `prism-sym-pair-794.geo3.json` — the
operator's exact Q2 session; per-lane parser tests in `parse3-v4.test.ts`.

**Out of scope (already filed):** nonlinear components (#509), two symbols in one vec-rel (#301).

### ADR-3D-168 Am. 1 — a discrete root the pool does not carry is invisible to every honesty gate (#797)

**Report (operator, PR #796 play, 2026-08-26).** After two of Q2's three vectors the structure gives
2k²−6k+4 = 0 ⇒ k ∈ {1, 2} — the panel printed **k = 1** as determined, and «show another
configuration» could never show k = 2. Operator ruling: **only a fully determined symbol shows a
value; otherwise «k = ?».**

**Root cause.** The panel's determinedness proxy is seed-invariance, and its ADR-052 safeguard (the
Am. 2 seed-varying anchor) only moves a *continuously* open symbol — a symbol restricted to discrete
roots cannot be pulled off a root, and the solver deterministically landed the near root every seed.
`collectAll` (keep every distinct converged solution) was gated on a sign given being present, so the
pool held one root's gauge variants only. Measured at seed 0: **14 cold solutions, all k ≈ 1** —
and cold wide symbol starts (±1.5/2.5/4) changed nothing, because the gauge-basin skew dominates
regardless of where the symbol coordinate starts.

**Decision — four moves at the solve, all scoped to `nPinSym > 0`:**

1. **`collectAll` for any open pin symbol**, sign given or not — the pool is the admissible set, and
   every honesty gate downstream reads it.
2. **Symbol-axis CONTINUATION, warm and hard-pinned** (the `parkScale` pattern): from one base per
   distinct symbol vector, restart with the symbol displaced (±0.75/1.5/3), first HARD-pinned
   (weight 1e3, 40 iterations — a 1e-4 anchor cannot hold one DOF against the primary gradients)
   so gauge/dims adapt, then RELEASED anchored at wherever the pinned stage settled. A probe
   displacement runs first: a symbol admissible OFF its converged value is continuous — the fan is
   skipped (its openness is already seed-varied by the Am. 2 anchor), so only genuinely discrete
   symbols pay the full fan.
3. **The pool is interleaved round-robin across distinct symbol vectors**, so configuration cycling
   (`pool[seed % n]`) alternates the roots instead of exhausting one root's gauge variants first.
4. **`pivot.symRoots`** exposes the admissible pool's distinct values per symbol (post
   sign-filtering — a sign given that narrows to one root correctly makes it determined), and the
   params panel prints a value only when seed-stable AND a singleton at every sampled seed.

The residual function became per-target (`fFor`) for the continuation's release stage; the cold
starts still use the Am. 2 seed targets unchanged. Honest perf note: symbolic-pin figures pay the
exploration (the heavy book/Am. 3 tests run ~2–3× their prior time); nPinSym = 0 figures are
byte-identical to before.

**Locks:** `issue-797.test.ts` — two vectors read «k = ?» with both roots in every seed's pool and
both reachable across configurations; the third vector returns «k = 2»; the Am. 2/Am. 3 and
issue-794 locks stay green.

**Sibling products:** complex needs neither rotate nor align — that becomes an explicit **n/a** cell in
the conformance matrix (family 2), not a forgotten one (#664).

Locks: `view-presets-714.test.ts` (6 tests — each preset asserted on the FRAME it produces rather than
on its angles, the top clamp and its orthonormality, the isometric equal-foreshortening property, and
the set being complete, in-clamp and mutually DISTINCT so a preset can never become a dead button).

## ADR-3D-169 — a solid statement's SUBJECT is resolved against the declared figure (#766, #765)

**Operator ruling (2026-08-26):** *"If there is only one pyramid, just says the pyramid volume is 11
should be understood. if there is more than one option of a pyramid, we can ask user to be more
specific with the letters they use"*

**Context — a true given told it was false.** On «פירמידה ישרה מרובעת ABCDS», the commonest solid a
bagrut question opens with, the student had **no working spelling at all** for its volume:

| utterance | before |
| --- | --- |
| «נפח הפירמידה ABCD = 11» | ❌ `claim-refuted` — `tetraVol(ABCD)` = 0 |
| **«נפח הפירמידה ABCD = 0»** | ⚠️ **ACCEPTED** — the tool agreed the pyramid has zero volume |
| «נפח SABCD שווה ל 11» | ❌ `not-understood` — the «שווה ל-» copula |
| «נפח הפירמידה ABCDS = 11» | ❌ `not-understood` — noun + 5-letter run |

The refusal message is «הטענה לא מתקיימת בציור — בדקו את החישוב» — *check your arithmetic* — about a
given that is correct. Two honesty invariants inverted at once: a true given called false, and the
degenerate reading accepted as true.

**Root cause.** `volumePolyClaim` gated on *"exactly 4 uppercase tokens + `=`"*, and `claims.ts`
computed `|triple product| / 6`. That formula is correct only for an **actual tetrahedron**, and it
was selected **by letter count**. ABCD is the pyramid's coplanar BASE, so its triple product is 0 by
construction — no value could ever have been accepted, and 0 always was.

The class had already been ruled in 2-D: [ADR-457](06-decisions.md#adr-457) — *a definite shape
reference resolves on the DECLARED kind*. That ADR's sibling-audit line concluded 3-D needed no port
("resolution is at apply over typed operands"); **the measurements above refute it**, and the line is
corrected there as part of this change.

**Decision — one resolver, over the vocabulary, for both consumers.**

`src3d/engine/solidSubject.ts` answers *which solid did the student mean?*, and the CLAIM lane and the
QUERY lane both ask it. They had drifted into two different readings of one sentence: the query lane
already looked a solid up by vertex set and summed its own faces (correct), while the claim lane
assumed a tetra.

- A run identifies a solid when it is that solid's **full vertex run OR one of its faces**. The base
  run is how a question names a pyramid, and reading only the full run is the whole defect.
- **No letters at all** resolves against the noun: one candidate is the answer, several is a question.
  The ambiguity branch **asks for more specific letters and never picks one** — picking would assert a
  given the student never stated (ADR-052), the same shape as 2-D's omitted-vertex angle (ADR-164 /
  ADR-261). New error `ambiguous-solid`, carrying the count.
- Letters naming nothing declared refuse with `no-such-solid`, **naming the student's statement**.
- A four-point run matching no declared solid is **still a tetrahedron** — the pre-existing reading,
  preserved byte-for-byte.
- Nouns map to kind FAMILIES by the kind's own name (`kind.startsWith('pyramid')`), not by a hand-kept
  list, so a `SolidKind` added tomorrow is classified the same day — *an enumeration is not a rule*.
- The volume itself comes from the resolved solid's **own face rings** (centroid fan → tetra sum), one
  computation shared by both lanes.

**The grammar (#765).** The head is read the ADR-3D-160 way: the definite noun (article included), any
run length, and the copula `=` / «שווה ל-» / «הוא». The #642 sweep fixed exactly this class on the
point, length and coordinate heads and left the volume head behind.

One trap, recorded because the first draft fell into it: the noun slot must be an **explicit
alternation of the solid vocabulary**, never a generic `\S+`. A generic word-slot swallows the letter
run — «נפח SABCD שווה ל 11» reads `SABCD` as the noun, the rule then declines, and there is no
backtracking to the noun-less reading — so the widening would have missed the very spelling #765 was
filed for.

**What this does NOT do — and where it goes.** A stated volume still only CHECKS; it does not yet
DRIVE the figure's size, so on a free-scale solid it can still refuse. That is [#754](https://github.com/dcodish/geo_builder/issues/754)'s
half, ruled the same day: a stated magnitude on a gauge-frozen solid PINS the scale, and volume/area
are the same mechanism at a different power. Recorded here so the boundary is not mistaken for an
oversight. Deliberately **not** taken: giving `volume-poly` the `free-size-claim` guard — under that
ruling it would install a refusal for exactly the input the operator has said must be accepted.

**Not ruled, defaulted rather than guessed:** whether the resolved reading is echoed back (the fact
list showing «נפח הפירמידה ABCDS = 11» instead of the student's words). The operator's *"just …
should be understood"* reads as *do not make a fuss*, so the default is **no echo** — the fact list
keeps the student's own words.

Locks: `src3d/__tests__/volume-subject-766.test.ts` — every spelling parses to one claim; the
pre-existing bare 4-letter tetra form is asserted byte-identical; «נפח החרוט» still belongs to its own
rule (the widened head steals nothing); «נפח = 11» names nothing and is not a claim; the base run
resolves to the declared pyramid with a non-zero volume (**the defect, stated**); «= 0» no longer
reads as true; unknown letters refuse by name; two pyramids ask; and the base run and the full run
value identically, which is the two-lanes-one-answer property.
## ADR-3D-170 — a Hebrew↔Latin SCRIPT TRANSITION is a token boundary, at the normaliser (#773)

**Context — found by `/log-triage` on the prod window 2026-08-19…24.** What production saw:

```
[parser/ok]                     קובייה ⁦ABCD⁩
[llm/ok]                        Eעל bb'          ← only the PAID LLM read it
[scope:lowercase-labels] ×3     מישור ace
[parser/ok]                     מישור ACE
```

Measured at HEAD, prefix `קובייה ABCD`: «E על BB'» → `point-on-segment3`; «Eעל BB'» → `not-handled`.
The lowercase labels are a separate, deliberate refusal; the missing SPACE is not deliberate.

And it is not a typo the student can see. Hebrew and Latin runs carry no separator of their own, so
in an RTL box «Eעל BB'» renders indistinguishably from «E על BB'». The tool was refusing something
that looks correct, and paying a model to guess at it.

**Root cause — the #530 class, not generalised.** #530 (a P1) fixed exactly this for «נחתכים
בנקודהS», *at the rule*, by making that rule's own marker separator optional (`בנקוד[הת]\s*`). One
site. Every other He↔Latin boundary in the grammar stayed broken. #494 fixed the MIRROR direction —
a detached clitic, «מקביל ל π1» — at the **normaliser**, and that is the shape that generalises:
`normalize3` is the one boundary every rule, honesty gate, scope register and LLM lane reads.

**Decision.** `normalize3` inserts the boundary, both directions, before the vector-word strip and the
clitic fold (both of those read a space they can only see once the boundary exists — «וקטורSE» must
become «וקטור SE» before the word «וקטור» can be recognised and dropped):

```js
.replace(/([A-Za-z][A-Za-z0-9']*)(?=[א-ת])/g, '$1 ')   // Latin → Hebrew
.replace(/([א-ת]{2,})(?=[A-Za-z])/g, '$1 ')             // Hebrew → Latin
```

**The one guard, and why it is a length bound rather than a word list.** Hebrew's prefixes
ל/ב/מ/ה/ש/כ/ו are written glued to their operand, the whole grammar spells them that way (`ל?מישור`,
`ב-?`), and #494 deliberately GLUES a detached one — so «לAB» must survive. A prefix is **one
letter**, so requiring two adjacent Hebrew letters protects every glued clitic and leaves every WORD
to split.

Recorded because it is the interesting part: the first draft exempted runs composed only of clitic
letters, which reads as the more careful rule and is quietly catastrophic — **«משולש» is spelled
entirely from that set** (מ‑ש‑ו‑ל‑ש), as are «במשולש», «של» and «לכל». The exemption silently
swallowed the commonest noun in the corpus. Nothing about the rule's *statement* revealed that; the
**catalog-wide despacing property** did, on its first run.

Digits are deliberately untouched: «אורך 5ס"מ» is not a label boundary.

**Locks.** `src3d/parser/__tests__/script-boundary-773.test.ts`:

- the reported case builds the identical command to its spaced twin;
- #530's own case is produced by the general rule now, not by the rule-local tolerance;
- both directions split; a glued clitic does NOT (asserted directly, because splitting it would undo
  the #494 fold one line above);
- and the property that makes this a rule rather than a spelling: **for every catalog line, removing
  the space at a Hebrew↔Latin transition parses to the identical commands.** A rule that grows its own
  separator tolerance passes its own test and leaves the class open; this one cannot. The property
  asserts it is non-vacuous (>20 catalog lines actually change under despacing).

**Rule-local tolerances, audited and KEPT.** `AT_POINT`'s `בנקוד[הת]\s*` (#530) and the sibling
optional separators now describe a case the normaliser has already removed, so they are inert rather
than wrong. They are left in place deliberately: they run on the same normalised text, so retiring
them changes no behaviour that any test can observe, while touching a P1's guard for tidiness is
non-zero risk for zero value. The general rule is the one that must hold, and it is the one under
test.

## ADR-3D-171 — a stated MAGNITUDE pins the gauge-frozen figure's SCALE, uniformly (#754; amends ADR-3D-054)

**2026-08-27 · round #800.** Operator ruling (2026-08-26, on the issue): *"I dont see any reason to
refuse this case. a cube can have |AB|=4… the shape might not change at all since the proportion of 1
or 4 are the same."* Until now «קובייה ABCDA'B'C'D'» + «|AB| = 4» refused `size-on-solid` in every
spelling (direct, «אורך», and the declared-vector route), while «נפח הפירמידה ABCD = 11» — after
ADR-3D-169 resolved its subject correctly — fell into the claim lane and was REFUTED: a true given
told the student to check their arithmetic, judged against a size the sampler invented. Both are one
defect: ADR-3D-054 froze a solid's first dimension as the unitless similarity gauge, so a stated
magnitude had nothing to attach to; the claim lane's `freeDims > 0` pin conversion covered `length-eq`
only, so volumes and areas fell through to verification.

**The mechanism — the gauge takes a VALUE, and the value acts on the scale alone.**

1. A new engine seam, `engine/scaleGiven.ts`: the FIRST eligible magnitude statement (`length-eq`,
   `area-eq` over a triangle, `volume-poly`; value > 0) on a gauge-frozen solid figure is recorded in
   `Construction3.scaleGivens` (and in `claims` — the final verification stays the arbiter). At the
   end of `resolve3`, the magnitude is measured on the fully resolved figure and applied as ONE
   uniform factor k to every position (and every position-derived plane offset): a length scales by
   k, an area by k², a volume by k³ (`k = (stated/measured)^(1/power)`).
2. **The shape DOFs are untouched — the binding half of the ruling.** k is recomputed per
   configuration, so «show another configuration» still varies the pyramid's proportions while the
   drawn volume stays exactly 11. The rejected alternative — a scalar pin the solver satisfies — lets
   the residual be absorbed by whichever dim moves easiest (V = 11 at base 1 is a needle of height
   33), silently asserting a proportion the student never stated: ADR-052's cardinal sin. The lock
   asserts the base edge VARIES across seeds while the volume holds.
3. **Eligibility is one shared predicate** (`scaleGivenActive` = recorded given + `scaleGivenSafe`),
   asked identically by the apply-time routing, the resolver's rescale, and the store's refusal
   ladder, so "we print sizes", "the drawing honours the size", and "we refuse" can never disagree.
   `scaleGivenSafe` is deliberately conservative: any absolute object (equation plane, parametric
   line, coordinate/partial point, coordinate-frame pin), a revolution solid, a circle, or any
   scale-fixing pin keeps today's behaviour — that corner is the placement design's (#551), recorded
   there rather than half-solved here.
4. **A second magnitude is CHECKED, never silently accepted.** On a rigid solid the check is exact:
   «|AB| = 4» then «|AC| = 10» on the cube refuses `claim-refuted` naming that statement (the face
   diagonal is 4√2), and a consistent «|CD| = 4» verifies. Against still-free shape dims the check
   would judge the student on a sampled proportion (the #508 false-accusation class), so it refuses
   `size-on-solid` honestly instead — «נפח = 11» then «|AB| = 4» is satisfiable but unbuilt, recorded
   as the surviving corner of that refusal. Once a scale given exists, a later `length-eq` no longer
   enters the pivot as a scale-fixing pin (the two mechanisms would double-apply).
5. **`scaleKnown3` opens on the same predicate**, so the data panel and query lane print real
   numbers the moment the figure has a real size — the exposure #517 built the gate for and the
   refused statement was starving.

**What did not change:** the declared-vector prism route (`|u| = 3` → `mag-val` pin) is byte-identical
— its figures are `scalePinned` and never mint a scale given (locked); the paramGivens (coord-sym)
lane is exempt as before; `size-on-solid` survives — correctly — where a magnitude genuinely cannot
attach (absolute frame present, second magnitude over free dims), so its strings stay.

Locks: `src3d/__tests__/issue-754.test.ts` (the operator's cube sequence at several seeds, spelling
agreement incl. the vector route, knowledge gating both before and after, the contradiction and the
consistent second edge, the volume-exact-while-proportions-vary acceptance property, prism route
unchanged); fixture `fixtures3/cube-stated-size-754.geo3.json`.
## ADR-3D-173 — the 3-D LLM seam gains the SEQUENCE gate (#555; the ADR-441 port)

**2026-08-27 · round #800.** Class, from the #536/ADR-441 sibling audit: a statement whose
point-letter SEQUENCE is its semantics, escalated through the LLM lane, was committed with whatever
sequence the model emitted — `honesty3.ts`'s gate family asks what a decomposition LOST (`dropped*`)
and what it ADDED, never whether it REORDERED. In 2-D this let Haiku alphabetize «ADB» into
«ישר ABD», committing the NEGATION of a stated betweenness under a green ✓ (prod `s0cr31nw`, P1).
3-D order-semantic families: vertex-angle forms (∠SAB — vertex at A), face/plane point-runs
(«פאה SBC»), quad cycle order (ABDC ≠ ABCD), and pyramid runs (apex by position).

**Decision — restore, never refuse, at the one seam.** `restoreStatedSequences3` (in
`parser/honesty3.ts`, beside its sibling gates) is the ADR-441 shape on the 3-D token vocabulary
(`[A-Z]\d*'?` — primes are part of the label, so a respelled top-face run «A'B'C'D'» restores with
its primes intact): a line-run using EXACTLY the labels of a run the student wrote (same multiset)
in a different sequence is the model respelling the student's token — restore the student's spelling
on the CANONICAL LINES before the re-parse and let `parse3` re-derive the semantics. Text-level on
purpose (a command-level comparison cannot tell a grammar-derived reorder from an LLM rewrite);
reversal tolerated (names the same object); an ambiguous multiset restores nothing; pairs exempt.
Applied in `App3.tsx` at the single `escalate3 → submitSteps` seam, with `restored` logged to the
debug sink (the 2-D `restored` field's mirror), and the never-reorder rule added to
`llmShared3.ts`'s prompt with 3-D examples — the gate makes the wrong output harmless, the rule
makes it rarer.

Locks: `src3d/parser/__tests__/issue-555.test.ts` (restored vertex-angle run, reversal, primes,
ambiguity, pair exemption, superset exemption, byte-identical pass-through).
## ADR-3D-172 — a MIXED shape-declaration run has an owner: bind the known, mint the undeclared (#774)

**2026-08-27 · round #800.** Prod (sessions `bg01evje`, `sce6w3j4`): «משולש SEC» on a pyramid whose S
and C exist refused `already-defined: S` — the shape rule claimed the line, the store rejected the
first label that already existed, and the message blamed the apex the student had referenced
CORRECTLY while the actual situation was one undeclared label (E). All-existing bound fine (#116),
all-new declared fine; only the mixed run had no owner, and its accidental failure violated the
honesty invariant that an error names the conflicting statement, never internal state.

**Ruling (2026-08-25) and the class check (2026-08-26)** are on the issue: the mixed run BUILDS —
«משולש XYZ» already builds three free points, so one free point in a partially-bound run is the same
mechanism, and both 2-D (whole family) and 3-D's own «מלבן» lane (quad-shape ARM 2) already behave
this way. The ownership table is now explicit and total in the `solid` case for FLAT kinds:

| the label run is… | behaviour |
| --- | --- |
| all-new | declare a free shape (unchanged) |
| all-existing | bind, positions unchanged (unchanged, #116) |
| **mixed** | **bind the known labels, mint the undeclared ones as free points** |

**The minted point is genuinely free (ADR-052).** A new `PointDef` kind `free3` — three sampled DOFs,
spread-scaled off the placed figure (the `partial` pattern), riding the gauge, counted by
`freeDofCount3` (+3, consistent with #370's count-them ruling) and moving on «show another
configuration» — the conformance lock asserts the seed-spread. For a QUAD/PENTAGON the shape is flat
by its own definition, so a single minted corner is an `on-plane` rider of the known corners' plane
(2 DOFs — planarity is the shape's meaning, not an invented given; `materializePlaneRun` +
the existing rider machinery, per ADR-W-006 hoisted rather than duplicated). A run whose fresh
labels cannot be minted (a flat quad with two unknown corners) refuses naming the UNDECLARED label
(`unknown-point`), never a label that was fine. The ring leaves its ink; sides already drawn as solid
edges are not duplicated.

**Scope honestly bounded:** the mixed arm covers the flat kinds (`polygon3/4/5` — «משולש», «מרובע»,
«מחומש»). A mixed run on a GENUINE solid (a cube's letter run partially colliding) keeps the
`already-defined` conflict — there the collision with the existing figure IS the problem. A shaped
mixed run («משולש ישר זווית SEC») builds the triangle and routes its constraint through the ordinary
M1 lanes; constraints that would need to DRIVE a `free3` point are not yet wired to it — recorded
here rather than half-built.

2-D measured and untouched (its family already builds these; the branch diff carries no `src/` file).

**Am. 1 (2026-08-27, #807 play).** The operator: «מרובע ABCE» after «משולש SEC» was green with the AE
side missing until typed by hand — E already existed, so the quad took the ALL-EXISTING reference
path, a pure no-op since #116. A stated flat shape leaves its VISIBLE trace (ADR-3D-035): the
reference path now draws the boundary ring idempotently (sides already present as solid edges or
segments are skipped, so «משולש SAB» over three pyramid edges stays the byte-identical no-op).

Locks: `src3d/__tests__/issue-774.test.ts` (incl. the operator's exact #807 sequence + idempotency).

## ADR-3D-174 — ONE SYMBOL, ONE OWNER: an equation's letter routes to the mechanism that resolves it (#801, P1)

**2026-08-29 · round #801.** Operator, 2026-08-27, the bagrut prism continued from #794. On the figure
whose panel correctly reads **k = 2** (`מנסרה ישרה משולשת ABCA'B'C'` + `AA'=(k-1,k-7,k+1)`,
`AC=(k+1,0,k-3)`, `AB=(k-1,k,3)`), the exercise's own line:

- **named** — «משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)» → refused **`not-on-line: A`**. A *is* on that
  line at k = 2; the tool blamed a correct given.
- **bare** — «x=(8,-1,-1)+t(k+1,0,k-3)» → **green**, with ℓ drawn at `dir ≈ (0.994, 0, −3.006)`, i.e.
  **k ≈ 0**, while the same figure held k = 2 — and the params panel, which had read «k = 2», flipped to
  «k = ?». A green-checked drawing contradicting the student's own equation at the value the figure
  itself declares: prod honesty, hence P1.

**Class.** *A statement introducing a letter that one mechanism already owns is routed to a SECOND,
independent mechanism instead of to the owner — so one letter carries two values in one figure.* The
3-D engine has exactly two symbol-resolving mechanisms: the **algebraic lane** (`c.param`, a 1-DOF
root-find in `chooseParam`, born from coord-sym points and parameter-carrying equations) and the
**pin-symbol namespace** (`pinSymsOf`, solved jointly inside the pivot, born from point/vector/pair
injections — #794/ADR-3D-168). #794 guarded one direction only (an injection may not steal `c.param`);
the equation side was unguarded, so `line3`/`plane3` set `c.param` for a letter the pivot already held.
Everything else followed mechanically: lines resolve pre-pivot, where the algebraic lane — finding no
given that pins its "new" parameter — **sampled** k as a free DOF (ADR-052, correct for a letter nobody
owns, catastrophic for one already determined); and the existing-point on-line drive (ADR-3D-031 Am.)
is an apply-time lowering to two numeric plane pins gated on the anchor/dir being **literal constants**
— a gate that pattern-matches "is it a literal" instead of asking "will it be known", so it silently
skipped, nothing drove A and C, and the honest verifier then accused the student.

**Mechanism (the fix).**

1. **The letter routes to its OWNER, in one place.** `paramLane(c, letter)` in `apply.ts`: a letter in
   `pinSymsOf(c)` is that pin symbol; only an unowned letter opens the algebraic lane. `line3` and
   `plane3` record it as `sym` on the def (`Line3Def.parametric.sym`, `PlaneDef.sym` — "the `p`
   coefficients are in THIS pin symbol"), and never touch `c.param`. Two *figure* parameters are still
   refused. The third `c.param` site, a NEW coord-sym point, cannot route (there the letter *defines*
   the point's coordinates) and refuses `two-params` — the deliberate asymmetry, stated.
2. **M2 re-homing, so entry order does not decide.** Typed in the other order the equation comes first
   and owns the letter; #794 would then refuse the injection, though the same statements build in the
   other order — satisfiability must not depend on typing order (docs/17 M2 law i). `adoptParamAsPinSym`
   hands the letter to the mechanism that can DETERMINE it whenever the algebraic lane holds nothing to
   root-find over (no plane-angle / ⟂ / line-relation / paramGiven, no coord-sym point): the equations
   are re-marked `sym`, `c.param` is released. Both lanes with a real claim still refuses.
3. **Resolution at the owner's value.** A `sym` object is left OUT of the pre-pivot line/plane maps —
   the honest state, since it has no value until the pivot chooses one — and `resolveSymObjects()`
   fills it from `pivot.pinSymbols` at the end of **every** `applySolutions` (and after a rollback), so
   no accepted solution can disagree with the figure it produced. Riders of such a line are seated
   there too (the FINAL-fill pattern). The algebraic lane's predicates (`lineDirCarriesParam`,
   `planeNormalCarriesParam`, `paramLinePerps`, `chooseParam`'s membership selection) now exclude `sym`
   objects: "carries the figure parameter" means the algebraic lane's letter.
4. **The drive, inside the pivot** (LADDER stage 4 — the ADR-3D-033 membership drive, which was about
   *membership* and merely enumerated planes). `MemberPin` gains `symLine`/`symPlane`: the carrier's
   equation is evaluated at the trial symbol value on every LM iteration, so gauge, dims and k solve
   **jointly** — which is the physics too, an absolute line being exactly what pins a gauge the
   injections left free. On-line residual = `(P − anchor) × dir / |dir|` (three components, length
   units, scale-free). Failure path only, exactly like the plane pins: a figure whose memberships
   already hold never enters, so every other figure is bit-identical.
5. **The funnel learns the same fact.** `translationGaugeFree3` / the `rotationFree` and `spinAxis`
   gates enumerated the lists that pin placement; a pin-symbol membership was in none of them, so the
   landing funnel re-sampled the placement and slid the figure straight back off the line the drive had
   just put it on. They now ask `symMemberDrives(c)` too. (An enumeration standing in for the question
   — docs/17 §2.1; the numeric on-line case was covered only because its lowering happened to land in
   `planePins`.)
6. **One predicate for drive and verify.** The store's on-line check is extracted as `onLineHolds3` and
   the stage-4 trigger aims at it, so a driven membership cannot land inside the drive's tolerance and
   outside the verifier's (the `memberHolds3` discipline).
7. **Display.** The canvas echo asked `paramUnforced`, which reads the algebraic lane; for a `sym` line
   it now echoes the student's own `src` unless the figure is determined (`numbersAreKnowledge`) — the
   #611 rule, one lane over. Prod's display for this figure is unchanged.

**New capability:** an equation may be written in a letter the injections already carry — it resolves at
that letter's solved value, and the memberships it states DRIVE the figure. The two lanes may now also
coexist in one figure (a `c.param` line beside a pin-symbol line).

**Sibling audit.** *3-D:* the plane cell of the same hole was unreported and is fixed with the line
(`מישור π: x+(k-1)y+z-4=0` + «A על המישור π» now resolves at k = 2 and drives A onto it — locked). The
`point3` coord-sym cell refuses, stated above. *2-D (`src/`):* the class needs two mechanisms sharing one
namespace; `src/` has one — `radius-symbol` binds a letter to a circle's radius DOF (`grep symbol
src/engine/apply.ts` → the single `radius-symbol` case; no `c.param`/root-find lane exists). Not present.
*Complex (`src-complex/`):* `param` is an expression-tree node inside one algebra evaluator, no second
resolver. Not present.

**Known limits, recorded not hidden:**

- The re-homing refuses (rather than migrating) when the algebraic lane holds a pinning given for the
  letter — moving a root-find given into the pivot is a real mechanism and is not attempted silently.
- Re-homing acts on the fact SET (a loaded file, a batch derive). Typed INTERACTIVELY in that order the
  equation is still refused at its own step: at that moment k belongs to the algebraic lane, and **that
  lane has no membership drive at all** — «A על הישר ℓ» against a `c.param`-carrying line can only be
  verified, never satisfied. That is the same class one lane over, and it is the algebraic lane's own
  gap (a letter the equations carry is not a pivot unknown), so it is FILED rather than half-built here.
  → Closed by [ADR-3D-178](#adr-3d-178) (#815): the membership is a second DOOR into the same re-homing.
- The remaining slide ALONG a driving line stays unsampled, the funnel's documented conservatism for
  partially-pinned placement (same as today's numeric plane-pin case).

**Perf:** the drive is failure-path only and adds no solve to a figure that already holds; the operator's
figure resolves in ~0.3 s (`derive3`, seed 0). Full 3-D lane 166 files / 3382 tests green.

Locks: `src3d/__tests__/issue-801.test.ts` (the operator's exact named + bare sequences at three seeds,
the order permutation, the apply gate, the plane sibling, the preserved `two-params` refusal) and
`fixtures3/prism-sym-line-801.geo3.json` (the named sequence through the real load path).

## ADR-3D-175 — A NAMED FREE COMPONENT: the letter is a name, not a second solver (#814)

**The class.** *A component the student NAMED is stored as an anonymous free DOF — the name is
discarded at the parser boundary, so no later statement can address it.*

«D(3,p,0)» on a D the solid already made pinned `{3, null, 0}`. The `null` is **right**: the exam
idiom means "D's y is unknown", and ADR-3D-032 / ADR-3D-094 lower it to a free sampled DOF that
resamples with the seed and yields to a stated sign — ADR-052 read exactly. What was thrown away is
that the student called it `p`. With no record of the name, «p חיובי» refused
«הפרמטר p לא הוגדר בסרטוט»: the tool denying a given it had just been given, and an error message
describing its own internal state rather than any conflict in what was said.

**Root cause.** A letter can be three things in this tree, and only two were representable: the
figure parameter (`c.param`, the algebraic root-find), a pin symbol (solved inside the pivot), and —
missing — **a name for a component that is simply unknown**. `param-sign` enumerated the two it knew
and refused everything else, so the third kind reported as non-existent.

**The decision.** Bind the name; change nothing about the solve. `partialNames` records letter →
(object, component) for the free components of all three injection lanes, and «p חיובי» lowers to
`componentSigns` — the branch selection the engine already performs for a coordinate sign given,
keyed on the component the letter names instead of on a point+axis. The parser gains a **name-only**
channel (`syms`) on the vector and pair lanes, the one `point3` always had; `symExprs`, which decides
whether a letter becomes a solver unknown, is untouched.

**The rejected fix, recorded because it is the tempting one.** The obvious reading is that
`symStructure` (#325) withholds `symExprs` for bare distinct letters by lexical accident, and that
emitting them always is the root fix. It is not: it promotes these letters to pivot unknowns and
**breaks the partial-injection exam gates** — 2023 קיץ א Q2 ג–ד («A(3,n,p)», `scenarios3`) and
2023 קיץ מועד ב Q2 («B(p,3,0), C(0,n,0)», `v7-t2`) — because `solvePivot` cannot solve those systems
with two symbols and reports **`givens-contradict` on satisfiable givens**. Measured: 8 failures on
the full suite. That solver weakness is pre-existing and independent of the letter question — the
structured form `B(2p,3,0), C(0,2n,0)`, which always took the pin-symbol lane, fails identically at
HEAD, seed-dependently (seeds 1–3 pass; 0 and 7 do not). #814's regression file reproduces both gates
next to the feature, so the cost of that change is visible where it would be made.

**New capability:** a coordinate stated with a plain parameter — «D(3,p,0)», «v = (3,p,0)»,
«AD = (3,p,0)» — names an unknown the student can then address: «p חיובי» / «p שלילי» / «p > 0» and
the English mirrors select among its roots, and the determined value prints on the figure instead of
«?». Previously only a letter dressed in arithmetic could be referred to at all.

**Naming is not pinning.** An unaddressed named component still resamples across seeds and still
prints «?» — a sample is not knowledge (ADR-052). The binding is inert until a `param-sign` uses it.

**One statement, honoured everywhere its sibling is.** `componentSigns` joins `signGivens` at all
three sites, not one: the pivot's solution filter, the drive's rollback check, and `collectAll` in
`solvePivot` — that last one is what makes the selection hold at EVERY seed rather than wherever the
pool happened to carry both branches. A statement collected in one place and enforced in another is
honoured by luck. The store's `param-sign` verifier likewise learns the third kind of letter, or a
correctly-applied sign reports `sign-unsatisfiable` against a figure that honours it.

**Sibling audit.** *3-D:* the three injection lanes are fixed together through one recorder
(`bindPartialNames`) and one evaluator (`componentValue`, which folds the pair and vector cases into
one since a named vector is a point pair). The coord-sym and pin-symbol lanes are untouched.
*2-D (`src/`):* no symbolic coordinate-component machinery — `grep -rn 'SymComp|symExprs|coord-sym'
src/` is empty; coordinate tuples are a 3-D construct. Not present. *Complex (`src-complex/`):*
likewise empty. Not present.

**Found while fixing, filed not folded:** #816 — with «|u| = |v|» typed *before* the coordinates,
«S(0,0,6)» is refused `injection-unsatisfiable` on plainly satisfiable geometry. Pre-existing at HEAD
(A/B confirmed), a different class (entry-order, docs/17 M2 law i).

**Perf:** no new solve. `collectAll` widens the pool only for figures that state a component sign,
which is the same condition `signGivens` already imposed.

Locks: `src3d/__tests__/issue-814.test.ts` (the operator's exact sequence He + En, both roots, the
selection holding at five seeds, all three injection lanes, the still-refused unknown letter, the
ADR-052 resampling guarantee, the parser's name-vs-register split, and **both exam gates reproduced**)
and `fixtures3/pyramid-named-comp-814.geo3.json` (the figure through the real load path).

## ADR-3D-176 — A COLLAPSED FACE IS NOT A CONFIGURATION, AND NEVER A CRASH (#817, P1)

**The class.** *A free shape DOF is sampled with no general-position guarantee, and the guarantee that
does exist is bound to one WAY OF STATING the shape rather than to the shape itself.*

«פירמידה SABCD שבסיסה מקבילית» + the height + `A(0,0,0) B(0,5,0) S(0,0,6)` drew its base collinear —
`C(0, 9.74, 0)`, `D(0, 4.74, 0)`, every base vertex at `x = 0`, `AD ∥ AB`. A "parallelogram" with zero
area: the operator's *"collapsed 2-D"*. Pressing «הציגו תצורה אחרת» then **crashed the app**.

**Root cause, in three stacked parts.**

1. `requirements` / `quad-general` — the general-position gate — is pushed only by `recordShape`, which
   runs for a **stated quad** («ABCD מקבילית»). A solid that declares the same parallelogram base
   through its own noun («שבסיסה מקבילית») registered nothing: measured on the operator's figure,
   `requirements = []` and `quadShapes = []` beside `solids = [{kind: 'pyramidPar', …}]`. The gate was
   attached to an utterance form instead of to the figure — the tree's recurring class, *an enumeration
   is not a rule*.
2. With `requirements` empty, `seedForRequirements` short-circuited (`length === 0 ⇒ return from`), so
   «show another configuration» was a bare `seed + 1` that could not skip a bad drawing because it was
   never asked to judge one.
3. `auxSegmentHidden` normalized the zero face normal and **threw** (`normalize3: zero vector`), on the
   code path of every resample — turning a bad drawing into a dead app.

Note what part 3 was NOT: `quadDrawnDegenerate`, despite its name, tests only *over-specialisation* (a
parallelogram that reads as a rectangle). It has no zero-area test, so even a registered `quad-general`
would not have caught this. The missing predicate did not exist anywhere.

**The decision.** `solidFaceCollapsed` walks `c.solids` and asks, per face corner, whether the two
incident edges are (near-)parallel — |sin| ≤ 0.02 between them, or a zero-length edge. Judged per corner
rather than by area-over-extent because that is scale-free **and** does not punish a legitimately thin
face: a long narrow rectangle is a fine drawing, a flattened one is not. Derived from the solids, so it
covers every solid kind and every way a base is declared, with nothing to remember.

It joins the **preference** tier (`meetsShapePreferences3`), not the hard one, deliberately: a figure
whose givens genuinely force a flat face must still draw — the #615 two-tier fallback — it just must
not be *chosen* while a real configuration is available. A hard veto here would convert a poor drawing
into `bound-unsatisfiable`, refusing figures the tool can perfectly well show.

And the renderer is made **total**: a face with no area occludes nothing, so it decides nothing and is
skipped. The sibling `hiddenEdgeKeys` already degrades this way (it takes only the normal's sign), and
four other `normalize3` sites in `scene3.ts` are already guarded — this one was missed. The renderer is
a pure consumer of engine output and must survive anything the engine can produce; a bad drawing is a
bug to fix upstream, never grounds to crash. The two halves are independent on purpose: the preference
keeps the drawing honest, the guard keeps it survivable if the preference is ever weakened or a
degenerate figure arrives from another source.

**Perf.** `seedForRequirements` judges collapse on the resolution `derive3` has **already** computed,
so the common (non-degenerate) case still returns `from` without one extra solve; the sweep pays only
when the first candidate really is collapsed. The operator's figure lands on seed 4 instead of 0.

**Not caused by #814.** A/B confirmed: the identical throw at the identical seeds with `src3d/` checked
out at `HEAD~1`. It was live in prod.

**Sibling audit.** *3-D:* the fix is derived from `c.solids`, so the whole quad-base family is covered
at once — locked as a family (parallelogram / rhombus / kite / trapezoid / general-quad pyramids, the
right prism on a parallelogram, and `מקבילון`), none of which registered the gate before. *2-D
(`src/`):* has no solids and no face normals; its degeneracy question is the collinear-triangle one,
already handled by its own requirement machinery. Class not present. *Complex (`src-complex/`):* no
solids. Not present.

Locks: `src3d/__tests__/issue-817.test.ts` — the operator's exact sequence, twelve resamples asserting
both non-degeneracy and no throw, a real-parallelogram assertion, the solid family as a class, and the
render guard exercised against seeds that ARE collapsed (with a companion test asserting at least one of
them really is, so the guard test cannot quietly stop proving anything).

## ADR-3D-177 — THE RELATION READS EVERY FRAME: segment × plane-run ⟂/∥, classified not spelled (#819)

**The class.** *A relation whose operands the engine resolves symmetrically is readable in only ONE
frame, because its rule enumerates operand ORDER and NOTATION instead of deriving them from the shared
operand seam.*

The operator could not state the bagrut construction «דרך AC העבירו מישור המקביל ל-SD וחותך את SB
בנקודה K», nor any rewording of it — `ACK∥SD`, `המישור ACK מקביל ל-SD`, `המישור ACD מקביל ל-SB` all
refused `not-understood`, while the mirror `SB מקביל למישור ACD` built and the named form
`מישור π דרך A ו-C ומקביל ל-SD` built. Nothing was missing in the engine: it resolves this relation
symmetrically and lands K on SB's midpoint, `(0, 5/2, 3)`.

**Root cause, two enumerations.**

1. The segment × plane-run cell was owned by two hand-written rules that each spelled their own operand
   order and notation — `^(LBL)(LBL) מקביל למישור (RUN)$` and its ⟂ twin. Segment first, always. And in
   spelling their own, the twins had **drifted**: the ⟂ rule accepted the `⊥` symbol, an optional plane
   keyword and the «בסיס» sentinel; the ∥ rule demanded the literal «מקביל למישור» and so refused
   `AB∥ACD` outright. Two rules for one symmetric relation is how one of them silently loses a frame the
   other has.
2. `relPlaneRule` read «דרך A ו-C» but not the exam's glued «דרך AC» — the exam writes its two
   through-points as a segment, the way it writes every other pair.

The first is the sharper failure because **the fix already existed**: ADR-3D-140 built
`readOperand`/`readRelationSides` precisely so angle, ⟂, ∥ and distance would stop enumerating operand
shapes. This cell never migrated onto it.

**The decision.** One rule, `segPlaneRel`, owns the cell: it splits on the existing `PERP_SPLIT`/
`PAR_SPLIT` (which already carried every predicate spelling, symbols included) and classifies both
sides through `readRelationSides`, accepting {segment} × {plane-run} in either order. Order-freedom,
the `⊥`/`∥` symbol forms, the plural/noun vocabulary («המישורים», «פאה», «בסיס») and He+En are then
*consequences of classifying*, not cases anyone must remember — which is the whole point of the seam.
`relPlaneRule` additionally reads a glued «דרך AC», and reads the exam's crossing tail as a COMPOUND so
the whole printed sentence is one utterance.

**Honesty on the compound.** A crossing tail that is present but unreadable **refuses the rule** rather
than committing the plane and dropping the point the student named. Getting there took one bug worth
recording: the first tail regex ended the verb with `\b`, and Hebrew letters are not `\w`, so the
boundary never matched and the tail was silently dropped — a stated given vanishing into a green ✓.
That is the trap `src3d/CLAUDE.md` already records for `ℓ`, and it applies to every Hebrew keyword. The
tail is now composed from the shared `CROSS_HE_VERB`/`CROSS_EN_VERB` atoms, never re-spelled.

**The lexical ratchet went DOWN.** `RUN_3_4`, parse3's inline plane-run atom, has no users left — the
plane-run shape now lives once, in `operandToken.ts` (S2.1: counts may only decrease).

**New capability:** the exam's own construction sentence, in either language, in one utterance; and the
⟂/∥ segment–plane relation in either order and either notation, with the ∥ side gaining everything its
⟂ twin had.

**Sibling audit.** *3-D:* the plane×plane (`planeRelGiven`) and plane×named-line (`planeLinePerp`) cells
were already on the seam and are asserted untouched (a plane pair still lowers to `plane-rel`, a
plane×line pair to `plane-line-perp`). The crossing family migrated in #755/ADR-3D-164. What remains
enumerated after this is the distance family's operand pair, which reads through `readOperand` already.
*2-D (`src/`):* no plane operands — the class needs a plane×line relation and `src/` is planar. Not
present. *Complex (`src-complex/`):* no geometric relations of this kind. Not present.

**Deliberately NOT fixed here — #820.** With the frames open, «SD מקביל למישור ACK» after «K על SB» is
now reachable in more phrasings, and it refuses `givens-contradict` on a satisfiable figure: an
on-segment rider's `t` is a SAMPLED free DOF, and the pivot's unknown layout is
`[gauge 7 | dims | coupled | pinSyms]` — `t` is not in it, so the relation is verified against the
rider's sample instead of driving it. That is a new solver capability (rider parameters as pivot
unknowns, a LADDER stage), not a widening of this rule, and it is filed rather than guessed at.

**One behaviour deliberately NOT harmonised.** ⟂ draws the named plane's ring; ∥ never did. Unifying how
a statement is READ must not silently change what it DRAWS, so each relation keeps the figure it drew
before — filed as #821 for an operator ruling (the honesty invariant argues the ∥ side is the wrong one,
but that is a decision about the figure, not a consequence of this fix).

Locks: `src3d/__tests__/issue-819.test.ts` — the exam sentence He + En building to `K(0, 5/2, 3)`, the
compound lowering to both commands, «דרך AC» ≡ «דרך A ו-C», and the MATRIX asserted on lowered commands
(order × notation × noun × locale, the 4-label face, the «בסיס» sentinel, and the two neighbouring cells
proven unclaimed) plus a same-verdict-either-order check on a true and a false statement.

## ADR-3D-178 — THE LETTER REACHES THE MECHANISM THAT CAN DETERMINE IT: the membership door (#815; extends ADR-3D-174)

**2026-08-30 · round #822.** Found while fixing #801: the operator's prism with the line equation typed
FIRST — «מנסרה ישרה משולשת ABCA'B'C'», then «משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)» — was refused
**`not-on-line: A`** at the equation's own step, though the identical fact set builds green in the other
order (that is #801) and derives green as a loaded file (ADR-3D-174 §2's re-homing acts on the SET).
The interactive step refused a satisfiable statement and blamed the point.

**Class.** *A letter carried only by EQUATIONS is never an unknown any drive can solve for, even when
a stated membership is exactly the given that determines it.* The algebraic lane's letter (`c.param`)
is root-found post-pivot over angle / ⟂ / line-relation givens, or — with none of those — simply
SAMPLED (ADR-052, correct for a letter nothing pins). A membership against such a carrier can select a
root (`chooseParam`) but there are no roots here, and it cannot move the figure: the lane has no
membership drive at all (recorded as ADR-3D-174's second known limit). ADR-3D-174 §4 built exactly that
drive — inside the pivot, gauge + dims + symbol jointly — but only for a letter the pivot already owned
through an injection. The mechanism existed one lane over; the letter had no door to reach it.

**Mechanism (the fix).** One body, two doors.

1. **The membership door** (`apply.ts` — `adoptParamForCarrier`). An EXISTING point stated onto an
   algebraic-lane carrier (a parametric line or an equation plane whose `LinExpr`s carry `p ≠ 0` and no
   `sym`) hands the letter to the pivot under the SAME conditions as the injection door: the lane holds
   nothing to root-find over (no plane-angle / ⟂ / line-relation / param given) and no coord-sym point
   defines the letter. The re-homing body `adoptParamAsPinSym` used is extracted as
   `releaseParamToPivot` and shared verbatim — the equations are re-marked `sym`, `c.param` is released.
   A NEW point stated onto the carrier is a rider seated by construction: no drive needed, no door.
   A side given (above/below a plane) is an inequality — sampled and verified, never driven — no door.
   When the lane DOES hold a pinning given the letter stays there and the membership remains a
   verify/selection: moving a root-find given into the pivot is a real mechanism, not attempted here.
2. **One namespace** (`types.ts` — `pinSymsOf`). The pivot's symbol namespace was derived from the
   pins' components only; after either door the letter may live in NO pin — only in the equation object
   whose numbers are in it — and it is a pivot unknown all the same. `pinSymsOf` now also reads the
   `sym` of every parametric line and equation plane, so the unknown layout, `freeDofCount3`,
   `figureSymbolsOf`, the one-owner guards (`paramLane`, the coord-sym `two-params` refusal, `param-sign`)
   and the data panel's symbol surfaces all see one set. `solve3` builds its unknown layout by calling
   `pinSymsOf(c)` instead of re-deriving from the pin lists — the layout can no longer be one symbol
   short of the namespace the rest of the engine reasons about.
3. **The pivot block's entry condition asked one list too few** (`evaluate.ts`). The block that runs
   the pivot and its failure-path drives was entered on `{pins, vectorPins, pairPins, scalarPins,
   planePins, coordPlanePins, figPlanePerps, gaugeLineRels, drivableMemberships}` — `symMemberDrives`
   was missing, so a figure whose ONLY pin-symbol content is a membership never reached the ADR-3D-174
   drive at all. #801 was carried in by its pair pins. Added — an enumeration standing in for the
   question, the `src3d/CLAUDE.md` trap, one more member.

Everything else is bit-identical: the drive is failure-path only (a figure whose memberships hold never
enters); the residual is ADR-3D-174 §4's, unchanged; `resolveSymObjects` fills the line at the solved
value as before.

**What the letter is at the equation's own step.** With prism + equation + the two memberships (A, C
on AC), the pivot solves gauge (7) + k against 2 × 3 residuals of rank 2 each: under-determined, as the
figure genuinely is. k is an OPEN pin symbol — its seed anchor (ADR-3D-079 Am. 2) makes it VARY with
the seed (locked: four seeds, k differs) and the panel prints «k = ?», never a value. The injections
then determine k = 2 and the panel reads «k = 2», identical to the other order.

**New capability:** a membership stated against an algebraic-lane equation object DRIVES the figure and
determines (or partially pins) the equation's letter — in either entry order, interactively. Satisfiability
no longer depends on whether the equation or the injections were typed first (docs/17 M2 law i).

**Sibling audit.** *3-D:* the plane cell («מישור π: x+(k-1)y+z-4=0» then «A על המישור π», injections
after) had the same hole and takes the same door — locked. The new-rider cell (no door) and the
pinning-given cell (lane keeps the letter) are locked as the boundaries. The `on-line` numeric lowering
(ADR-3D-031 Am.) is untouched: a numeric carrier has nothing to re-home. *2-D (`src/`):* one symbol
mechanism (`radius-symbol`), no second lane to re-home to — not present (ADR-3D-174's audit stands).
*Complex:* one algebra evaluator — not present.

**Known limits, recorded not hidden:** the pinning-given cell (a plane angle already root-finding k,
then a membership on that plane) keeps today's verify-only behaviour; moving a root-find given into the
pivot as a residual is the LADDER stage ADR-3D-174 declined too. The slide ALONG a driving line stays
the funnel's documented conservatism.

**Perf:** `derive3` at seed 0 — equation-first full sequence 368 ms, prism + equation alone 346 ms,
injections-first (#801) 310 ms; the drive adds no solve to a figure that already holds.

Locks: `src3d/__tests__/issue-815.test.ts` (the operator's order interactively at three seeds, the
equation-alone step with k varying by seed and «k = ?», the apply gate + namespace, entry-order
equivalence to 3 decimals, the plane cell, the rider boundary, the pinning-given boundary) and
`fixtures3/prism-eq-first-815.geo3.json` (the equation-first sequence through the real load path).

## ADR-3D-179 — A STATED SIGN IS REACHED, NOT HOPED FOR: sign-axis continuation in the pivot (#818; extends ADR-3D-168 Am. 1)

**2026-08-30 · round #822.** The operator's pyramid (2026-08-29, playing #814): «פירמידה SABCD שבסיסה
מקבילית», SA the height, `A(0,0,0)`, `B(0,5,0)`, `S(0,0,6)`, `D(3,p,0)`, `|u| = |v|`, then «שיעור ה-y של D
הוא שלילי». `|AD| = |AB| = 5` forces `p = ±4` and the given selects −4. Measured D.y by seed: 4 → −4,
**1017 → +4**, 2031 → −4. The panel fell back to «D(3, ?, 0)» (honest — the value was not identical
across its samples), and a configuration cycle could land the student on a drawing that contradicts
their own given.

**Class.** *A discrete branch that differs from the found one only in a SHAPE DIM is reached at some
seeds and not others, because the multi-start spreads everything except the dims.* The pivot's cold
starts spread the gauge (eight seed-rotated rotations, ADR-3D-007) and, since #797, walk the pin-symbol
axis (ADR-3D-168 Am. 1); every start takes the shape dims at the seed's ONE sample. The two D positions
are the parallelogram's angle, acute or obtuse — a dim — so whether the pool carries the −4 branch
depends on which basin the seed's sampled angle starts nearest. At seed 1017 the pool held nine
solutions, every one D.y = +4. `satisfiesSigns` then found nothing admissible and **fell through to
the unfiltered pool** (`pool = satisfying.length > 0 ? satisfying : solutions`), drawing the opposite
sign. The figure was measured, not guessed: the pool was dumped per seed before any code was written.

**What the honesty half actually looked like (the plan's half 2, measured).** The fallback was NOT
silent at the store: `derive3` at seed 1017 reported **`sign-unsatisfiable: D`** — the verifier
(`store3.ts`, the `sign-given` branch) already names the statement on final positions. What was wrong
is that the refusal was FALSE — a satisfiable given refused because the solver did not look where the
branch was — and that the store's seed never derived there, so the operator saw «?» and no message.
The fallback drawing under a named refusal is the store's keep-visible convention and is kept; there
was nothing silent to remove. Recorded as a deviation from the plan's wording, not from its intent.

**Mechanism (the fix) — `solve3.ts`, the #797 walk along the axis the student named.** After the cold
starts and the symbol continuation, per mirror: the stated signs are read as CONDITIONS over a candidate
(`signConds` — a coordinate sign given on a point and a sign on a named free component (#814) are one
kind here, exactly as `applySolutions`' filter treats them; a `partial` point is absolute and
sign-honoured at sample time, ADR-3D-094, so it is not a condition). When **no** solution of that mirror
honours every condition, the pivot restarts from each found solution (up to four distinct bases) with
the violated coordinate HARD-pinned at its negation (`1e3 · (value(y) + v)`) while gauge and dims adapt
— 40 iterations, the pinned stage only steers into the basin — then RELEASES anchored at the seed's
targets and collects the result through the ordinary accept/dedup/park path. The value is read from the
candidate's FINAL positions (`atFor`: gauge applied to gauge points, absolute points verbatim — the
same rule `residualsFor` uses for pins). **Failure path only:** a pool that already carries the stated
sign never enters, so every other figure is bit-identical. `componentValue` / `componentSignsHold`
move from `evaluate.ts` to `operands.ts` (re-exported), since solve3 may never import evaluate.

**New capability:** a stated coordinate sign selects its branch at EVERY seed — the #814 lock that had
to be loosened to the drawn position («p שלילי») is tightened back to the panel string `D(3, -4, 0)`.
«show another configuration» walks only sign-honouring drawings.

**Sibling audit.** *3-D:* the pin-symbol sign (`paramSigns`) already has its own walk (ADR-3D-168
Am. 1) and is untouched; the plane-side given (above/below) is a requirement, seed-searched, not a
pivot branch — not this class. A genuinely unsatisfiable sign («D.z חיובי» on a base pinned to z = 0)
still refuses `sign-unsatisfiable`, locked — the walk finds branches, it never invents them. *2-D
(`src/`):* the sampler/solver has no sign-given lane on coordinates (`grep signGiven src/` → none);
its discrete branches are the `branch index` cycled by ADR-052. Not present. *Complex:* branch
selection is the enumerated solution set (#694). Not present.

**Perf:** the walk fires only on the failure path; on the operator's figure at seed 1017 the pool grows
from 9 to 5 admissible (the filter now has something to keep) and the derive stays ~1 s. `issue-814`'s
19 tests: 29.8 s, unchanged in shape.

Locks: `src3d/__tests__/issue-818.test.ts` (both sign forms at a ten-seed battery including the
operator's 4 / 1017 / 2031, the panel string, the positive sign untouched, the unsatisfiable refusal,
six resamples all honouring the sign), `issue-814.test.ts` tightened back to the panel, and
`fixtures3/pyramid-sign-branch-818.geo3.json` saved AT seed 1017 through the real load path.
## ADR-3D-180 — A DRIVEN PLACEMENT IS KNOWLEDGE, AND ITS LEFTOVER FREEDOM IS SAMPLED: the gate asks, the resolver slides (#803; extends ADR-3D-101 and the #639 gate)

**2026-08-30 · round #822.** Operator, 2026-08-27, the #801 exercise continued with its workaround:
«מנסרה ישרה משולשת ABCA'B'C'», the three vector injections (k = 2), then the exam's two line equations
«משוואת הישר AC היא x=(8,-1,-1)+t(3,0,-1)», «משוואת הישר BC היא x=(4,0,2)+m(2,-2,-4)». Every vertex
identical to three decimals at every seed — A = (2,−1,1), … C' = (6,−6,3) — and the query «מישור
A'B'C'» (the exam's part ב) answered **«לא נקבע על ידי הנתונים»**. `A`, «מישור ABC», the ארגון נתונים
coordinates block and the canvas labels were silent the same way; the DOF cue read «2».

**Class — #639's, one member short again.** `translationKnown3` (#639) opened for {a stated absolute
position, a SAMPLED placement, nothing gauge-placed}. This figure has no pin and no coordinate point;
its placement is DRIVEN — the on-line lowering (ADR-3D-031 Am.) put eight plane pins on the pivot and
the pivot solved the placement to the stated absolutes. `translationGaugeFree3` is false *because* of
those pins, so `placementSampled3` is false, and the gate returned false: **the plane pins that pin the
translation absolutely are exactly what closed the gate.** The #639 comment named the law and left this
member out on purpose ("neither stated nor sampled — frozen — reads falsely stable"): true for a
placement frozen at the canonical gauge, false for one the pivot drove.

**Why the gate could not simply open (measured first).** With the gate widened alone, a cube with ONE
vertex on an absolute line printed `A(0, 2, 3)`: the drive settles the slide along the line wherever LM
stopped — the same place at every seed — so stability, the gate's arbiter, would have certified an
unstated position (ADR-052's cardinal sin, #315's shape). The funnel's documented conservatism
(ADR-3D-101: partial freedoms stay pinned) was harmless while the gate stayed shut; opening the gate
makes it a lie. The two halves only work together.

**Mechanism.**

1. **The gate asks the funnel's question** (`evaluate.ts` — `translationDrivenAbsolute3`). A placement
   is not frozen at the canonical gauge when it is sampled, when there is nothing to hide, or when it is
   DRIVEN by a stated relation to an absolute object: equation/numeric-line plane pins, a membership on
   an equation plane, a pin-symbol membership (#801), a coordinate-plane relation that places
   coordinates. A membership on a POINT-RUN plane or a free plane pinned to figure content is
   figure-internal — it closes the funnel but drives nothing absolute — and stays silent (the #611 rule,
   locked). Read by the gate and by the slide stage, so the two cannot disagree.
2. **The resolver SAMPLES a driven placement's leftover translation** — `resolve3` stage 5, after the
   drives, when no absolute position is stated (`c.pins.length === 0`) and the placement is driven. It
   PROBES the applied solution (or the canonical gauge, when every membership already held there — a
   plane through the origin, the frozen case the drive never enters) through `solvePivot`'s new
   `probe` mode: hard-pin the translation's projection on a seeded direction at a seeded step (40
   iterations, the pinned stage only steers), release on the primary residuals, keep only if still
   exact AND actually moved. A fully pinned translation cannot satisfy the projection and snaps back
   on release (|proj| ≈ 0) — the exam's prism is bit-identical. A partially pinned one keeps the
   displacement: the cube slides along its line (A.x varies, A.y = 2, A.z = 3 hold — and the panel
   prints exactly that partial), or within its plane. The probe moves TRANSLATION and ROTATION only
   (the Stage-A shape); scale, dims and symbols stay frozen at the solution's values — the first cut
   opened them and the full suite caught the explode basin (a coordinate-plane «zero» residual is
   extent-normalised, so the walk grew the box to 1e6 with every primary residual still exact). The #518 park / #797 walk pattern on the gauge's
   translation; failure-path in cost (one pinned + one release solve, warm, only on driven figures).
3. **Transactional, and a sign SELECTS the side.** Like stage 4, the slide is an experiment: the seeded
   direction first, its opposite if that side breaks a stated sign (the #818 rule one stage over —
   «שיעור ה-x של A הוא חיובי» on the sliding cube lands on the positive side at every seed), and if
   neither holds every sign and the parameter, the placement stays where the drive left it. The pool
   count and chosen index survive the re-placement (it is not a new pool).
4. **The DOF cue counts the drives** (`freeDofCount3`): a plane pin is one residual per member, a
   pin-symbol line membership two, an equation-plane membership one. The count omitted all of them —
   the fully determined prism read «2»; it reads 0.

**New capability:** a figure placed by line/plane equations alone (no coordinate typed) answers point
coordinates, plane equations in both representations, and populates the coordinates block and the
canvas labels — the exam's part ב answers `x − 5y + 3z − 45 = 0 | x = (3,−6,4) + t·(1,2,3) + s·(3,0,−1)`
with no workaround. And an under-determined driven placement now VARIES on «הצג תצורה אחרת» instead
of asserting the position the solver happened to stop at.

**Sibling audit.** *3-D:* the rotation freedom of a driven placement was already seed-varied by the
multi-start (measured: B, C' differ per seed on the cube+line figure); scale is never sampled
(ADR-3D-054 owns it). `vectorFramePinned3` derives from `translationKnown3` and inherits the fix. The
#367 canonical-placement sampling (frameless-but-absolute) is untouched: it runs when the funnel says
FREE, the slide when it says DRIVEN, the frozen figure-internal case when it says neither. *2-D:* no
absolute frame — `src/` figures are similarity classes; the analogue (a point on a given line with
free position) is the ADR-052 `freeDofs` sampler, already in place. Not present. *Complex:* no gauge.

**Perf:** `derive3` median of six seeds — prism 370 ms (main 361), cube+line 1 ms (0), the ADR-3D-031
box+plane+line exam 20 ms (11). Within noise on the determined figure; +9 ms on the sliding one.

Locks: `src3d/__tests__/issue-803.test.ts` (the prism seed-invariant with the gate open and DOF 0;
«מישור A'B'C'» → the exam's plane in both forms, «מישור ABC» and «A» answering; panel + canvas label
from the same entry; the sliding cube on a line — coordinates vary by seed, the partial `(?, 2, 3)`
prints, the face plane refuses; the sliding cube on a plane — nothing prints; the figure-internal
frozen case silent; the sign selecting the slide's side at six seeds) and
`fixtures3/prism-pin-driven-803.geo3.json` (the operator's sequence through the real load path).
## ADR-3D-181 — NO FRAME IS NOT «לא נקבע»: a frameless plane query reports its shape and names what is missing (#813)

**2026-08-30 · round #822.** Operator, 2026-08-29: «קובייה ABCDA'B'C'D'», «|AB| = 4», «DB», «AB = u»,
«BC = v», «מישור DBB'D'», «AA' = w» — the query «מישור DBB'D'» answered **«לא נקבע על ידי הנתונים»**
while the panel above it printed «w מקביל למישור DBB'D'», «|DB| = 4√2», «DB² = 32», and «שטח DBB'D'»
answered 16√2. The refusal of the EQUATION is right — no coordinate and no absolute object, so the
cube floats and the d-term is gauge (#315). What was wrong is what the student was told.

**Class.** *One message covers two different states, and the lane answers only one of a plane's
properties.* `note: 'undetermined'` was returned both when there is NO FRAME (nothing wrong with the
givens; everything except placement may be known) and when a frame exists and the equation genuinely
varies across samples. To a student the first reads "the tool knows nothing about this plane" — a
false statement about the givens — and it is a dead end: nothing says that the area answers or that
one stated coordinate would produce the equation. The ADR-3D-108 theme (the engine understands more
than the UI communicates) in the query lane; the sibling of #803, where the same gate withheld an
answer for a different reason.

**Mechanism.**

1. **The note is split** (`queries.ts`). `!translationKnown3(c)` returns `note: 'noFrame'` — worded as
   what is missing and what to do: no coordinate system, so no equation; state one point's coordinates
   or a plane/line equation. `'undetermined'` is now only the framed, genuinely-varying case.
2. **The lane answers the properties that ARE knowledge** (`framelessPlane`). For a named point-run
   plane or a bare run, the reply carries the seed-invariant shape facts — `S(DBB'D') = 16√2`, the ring's
   side lengths, and the mutual relations the panel already derives (`w ∥ DBB'D'`) — obtained through the
   SAME lanes the panel and the scalar query use: area and lengths via `answerQuery` itself, relations
   via `dataView`'s mutual table. No second computation, so a panel row and its query answer cannot
   diverge (the #297 discipline already stated in that file); an unpinned scale drops the lengths
   through the scalar lane's own `scale` gate, an unstable relation never appears.
3. **A note may accompany an answer** (`App3.tsx`): the frameless reply shows its facts AND why no
   equation follows. Previously a note rendered only in place of a missing answer.
4. **Scope guard.** The frameless case still refuses the equation and the coordinates — this widens
   what is REPORTED, never what is ASSERTED. Locked: the answer carries no `x`/`y`/`z` frameless.

**Measured while locking, and recorded rather than assumed:** the issue's plan expected one coordinate
(«A(0,0,0)») to make the equation answer. It does not — a cube pinned at one vertex still rotates freely
about it, so the equation is genuinely undetermined and now reads as the FRAMED note (the two states
finally differ to the student). With `B(4,0,0)`, `D(0,4,0)` added it answers `x + y − 4 = 0`.

**New capability:** «מישור XYZ…» on a frameless figure answers the cross-section's area, side lengths
and relations — the classic bagrut ask for exactly this figure — and tells the student what a single
coordinate would add.

**Sibling audit.** *3-D:* the POINT query on a frameless figure already goes through
`dataView.pointCoords` and returns nothing — its `undetermined` is the same double-meaning one message
over; it now reads the no-frame note too? No — deliberately NOT changed here: a point has no frameless
knowledge to report (its only property IS position), so the message would carry no answer; the note
split for points is #370's cue-semantics discussion, not this fix. *2-D:* no equation lane. *Complex:*
not present.

Locks: `src3d/__tests__/issue-813.test.ts` — the operator's sequence (the note, the area and lengths
equal to the scalar lane's own answers, the ∥ relation), the frameless-then-framed progression (one
coordinate → framed «לא נקבע», three → the equation), a bare run, the no-scale case (note alone), and a
genuinely under-determined framed plane still «לא נקבע».
### ADR-3D-177 Am. 1 — ∥ DRAWS THE NAMED PLANE'S RING, exactly as ⟂ does (#821; operator ruling 2026-08-30)

**The ruling.** ADR-3D-177 deliberately did not harmonise what the two relations DRAW and filed #821
for a decision. The operator ruled (2026-08-30): *"if we reference a plane like we say plane ACD is
parallel to AB or just ACD||AB, we should draw ACD. the user has the option of disabling it through
the input panel so this is no problem even if he didnt want it highlighted."* The honesty invariant —
everything the student stated is visible on the figure — applied to the ∥ side; the clutter concern is
answered by the input panel's per-fact visibility toggle, which the student already has.

**The change.** `segPlaneRel`'s `edges` binding emits the ring's edges for BOTH relations. Because the
ring comes from the classified operand (`readRelationSides`), both arities (3- and 4-label faces),
both operand orders, both notations and both locales follow with no further rule — the whole point of
the seam. The «בסיס» sentinel has no run to draw and stays as it was for both. And `||` — the way the
operator actually typed ∥, an Israeli keyboard having no ∥ glyph (the #493 argument) — joins the ∥
splitter's spellings; `ACD||AB` was `not-handled` before.

Locks: `src3d/__tests__/issue-821.test.ts` — the operator's three phrasings draw the triangle, the
matrix (relation × arity × order × notation × locale) always draws the ring, the sentinel stays undrawn,
and the pyramid end-to-end carries the ACD edges in the construction.
## ADR-3D-182 — A PERPENDICULARITY BETWEEN OBJECTS THAT SHARE A VERTEX IS REPORTED: one universe for the panel's derived relations (#811; the #558/#577 class, third member)

**2026-08-30 · round #822.** Operator, 2026-08-29, playing #754: «קובייה ABCDA'B'C'D'», «|AB| = 4»,
then «BC» — *"the data panel adds BC²=16 but doesnt say they are perpendicular and that AB·BC=0"*.
Measured headlessly: `relations = []`, `mutual = []` for the adjacent pair, while the same figure with
«CC'» (perpendicular, sharing nothing) reported `{AB, CC', skew}` + `{AB, CC', perpendicular}`. The ⟂
machinery worked; sharing a vertex was what suppressed it.

**Class.** *The object exists but is outside the universe the derivation scans* — #558 (a named line
could not be compared against a solid edge) and #577 (declared vectors were in no universe at all) were
the same defect, fixed one member at a time; this is the next member, in two lanes at once:

1. **The mutual lane** — the linear×linear flood control `if (A.ids.some(id => B.ids.includes(id)))
   continue;` is justified by POSITION ("two segments from one vertex obviously meet there" — true,
   and a correct reason to suppress the position row) but the `continue` left the branch before the ⟂
   computation, whose own comment states the opposite property (⟂ is a DIRECTION relation,
   independent of position). Adjacent edges of every box, cube and prism share a vertex, so the most
   common perpendicularity in the corpus — the exam's `AB·BC = 0` — was structurally unreachable.
2. **The relations lane** — the derived `u·v = 0` and `|u| = |v|` blocks iterated `c.vectors` only,
   while `addEntry` presents a drawn SEGMENT as a vector (label, decomposition, coordinates, |BC|, BC²)
   in the same panel. Two presentations of one object, only one of which participated; and the perp
   block's comment claimed coverage ("⊥ from construction … surface identically") that did not exist
   for a segment.

**Mechanism.**

1. **The skip is split by what it is about.** `adjacent` now guards only the position row; the ⟂ row
   is computed for every linear pair. Nothing else in the branch changes.
2. **One universe** (`relUniverse`). The derived-relations blocks read declared vectors first, then the
   student's drawn segments and arrows, deduplicated by point pair so «AB = u» + segment AB is one row
   under `u` (locked: no «|u| = |AB|» tautology). Solid EDGES stay out — a cube's 12 edges are 66
   mostly-noise pairs, the ADR-3D-104 flood-control ruling — and a segment the student NAMED is not
   flood. The magnitude class's stated-length lookup reads the pair from the universe entry, so a
   stated «|AB| = 4» still decorates the class. A third scan would have recommitted the class error
   (#577's note); this removes the display-vs-derivation asymmetry instead.
3. **The comment is corrected** at the perp block.

**New capability:** the operator's sequence prints `AB ⊥ BC` (mutual), `AB·BC = 0` and
`|AB| = |BC| = 4` (relations) — the vector-geometry chapter's core statement on the figure the exam is
built on. Controls locked unchanged: «CC'» keeps skew + ⟂, «DC» keeps ∥ and no ⟂; a cube with no named
segment produces no edge×edge flood; two adjacent NON-perpendicular segments (AB, the face diagonal AC)
produce neither a ⟂ row nor a position row.

**Sibling audit.** *3-D:* the linear×planar and plane×plane cells have no shared-endpoint skip (the
#577 note explains why hoisting it dropped «ABC ⟂ ABD» once) — unaffected; the query lane shares the
panel's derivations and inherits both fixes. *2-D:* the theorem-surfacing spine derives relations
over a coordinate-free `MatchCtx` with no universe partition — not present. *Complex:* not present.

Locks: `src3d/__tests__/issue-811.test.ts` — the operator's sequence (three rows, position row still
suppressed), both controls, the no-flood cube, the adjacent non-⟂ pair, the vector/segment dedupe.
## ADR-3D-183 — A DERIVED POINT THAT LANDS ON AN EXISTING NAMED POINT IS NOT MINTED: affirm the geometry, refuse the name (#769; operator ruling 2026-08-25)

**2026-08-30 · round #822.** Surfaced while building #755/#756: «תיבה ABCDA'B'C'D'», «E אמצע BB'»,
«מישור ADE», then the operator's own line «G נקודת חיתוך של AC' עם מישור ADE» — built green and placed
G at (0,0,0), on top of A. A is one of the three points that DEFINE plane ADE, so the crossing of AC'
with it is A itself; `line-plane-point` computed it, `apply` accepted it (free id, existing operands),
and the figure ended up with two named points at one location. The click-offer already got this right
by a different route (`openCrossings3` suppresses a dot within `NAMED_TOL` of a placed point) — the
OFFER lane and the TYPED lane disagreed about one point (the #653 shape).

**The ruling (2026-08-25).** The student made two claims and only one is false: "there is a crossing
of AC' with plane ADE" — true, and the refusal must not deny it; "call it G, a new point" — false, it
is the A already in the figure. So the message AFFIRMS the crossing and REFUSES the name, in the
ADR-W-030 teaching form: the point you asked for is «A», already in the figure; the geometry is right,
but there is no new point here to call «G». This also catches the likely real error — a student
transcribing the problem who wrote AC' almost certainly meant CC', which crosses honestly at t = ½.

**Class-first.** The defect is not in `line-plane-point`: *no* derived-point mint checked distinctness
against existing named points — a crossing, a foot, a midpoint, a plane∩segment cut could all stack
silently. Fixing the reported cell alone would have been the narrow patch the standing rule forbids
(the second one-empty-square-in-a-matrix this month, cf. #755).

**Mechanism.**

1. **One judgement, exported** — `namedPointAt(point, placed)` in `crossings3.ts`: the click-offer's
   own "this position IS an existing named point" test (`NAMED_TOL · max(1, |P|)`, the figure's
   existing distinctness epsilon — no new tolerance, ruling requirement 1), used by the offer lane and
   by the store's verify pass alike (requirement 2, ADR-W-006: derive, never copy).
2. **The check at the mint chokepoint** — the store's verify pass, over every DERIVED (0-DOF) point
   kind: midpoint/on-segment with a stated t, centroid, in-span, right-apex, the four feet, line∩plane,
   plane∩segment, bisector-seg, right-pyramid-apex, vec-defined, vec-pair. Free riders (on-line,
   on-plane, partial, free3) are never judged — two riders on one line are two riders. Provenance is
   DERIVED from the fact list (the first fact naming the id minted it), never from a list of minting
   command types; `c.points` is insertion-ordered (parents precede), so the EARLIER point is the one
   named. The refusal lands on the minting fact as `point-coincides {id, with}`; keep-prior-on-error
   means the point is not minted.

**New capability:** the operator's line refuses naming A, «CC'» still builds at t = ½, «F אמצע AB» after
«E אמצע AB» names E, a height-to-face whose foot is a vertex names the vertex, a plane∩edge crossing at
an endpoint names the endpoint.

**Sibling audit.** *3-D:* the offer lane reads the same helper (locked: no dot at A). *2-D (`src/`):*
measured — «משולש ABC», «E אמצע AB», «F אמצע AB» builds green with E ≡ F and reports it through
`Derived.coincidences = [[E, F]]` (the ADR-378 collector's notice): the 2-D product COMMUNICATES the
coincidence rather than refusing it — a design already in place, not a silent stack; left as is, its
ruling is that product's own. *Complex:* no derived points of this kind.

Locks: `src3d/__tests__/issue-769.test.ts` — the operator's sequence (refusal names A, G not minted),
the CC' sibling at t = ½, the offer-lane agreement, and the class (midpoint, foot, plane∩edge, the
free-rider exemption, a distinct nearby derived point still building).

## ADR-3D-184 — THE PROSE PATH ISOLATES: VecMath's exemption held only where it emitted structure (#482 Am. 4)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 5d (display) · **Round:** #824 · **Operator ruling:** 2026-08-16, transcribed on #482

The 2026-08-16 ruling asked that the student's own text be isolated **"on every surface that echoes user
text: the fact rows, the query rows, the load audit, export."** The fact rows and the input preview
shipped (ADR-3D-121, ADR-3D-123 + Am. 1–3, PR #495). This closes the ruling by measuring the other three
— and only one of them was a gap.

**The gap — the query lane.** ADR-3D-121 exempted `VecMath` rows from isolation on a *stated reason*:
«VecMath emits one element per token, so bidi sees structure rather than one neutral run». That reason is
true of the MathML path and **false of the prose path**: `VecMath.tsx:130` returns the raw string whenever
the tokenizer finds nothing expression-like, and the row then sits as one neutral run under the caller's
`dir="auto"`. The data panel's ask lane renders **every** row through `VecMath`, so the operator's own
reported strings were still reordered there after the fact-row lane was fixed. Measured at `61aa3eb`,
7 of 9 realistic query rows take the prose path and isolation changes the layout of every one:

| row | path | isolation |
| --- | --- | --- |
| «הישר l - x=(1,2,3)+t(m-2,m,m+2)» | prose | would change ❌ |
| «מישור π1: x+(m-2)y+(m-1)z-5=0» | prose | would change ❌ |
| «מישור ABC», «שטח המשולש ABC», «נפח הפירמידה SABCD», «זווית בין ℓ למישור π» | prose | would change ❌ |
| `\|AB\|`, `u·v` | MathML | no-op ✅ |

**Decision — isolate at the RENDER EVENT, which is the #482 lesson itself.** `VecMath`'s prose branch
returns `isolateLtrRuns3(text)`. Not at the call sites: putting it there is exactly the mistake #482
diagnosed (the chokepoint bound to a seam an author must remember, rather than to the event it guards),
and it would have to be repeated for the fact rows, the ask rows and the answers. The MathML branch is
untouched, so ADR-3D-121's reasoning survives precisely where it was true. The function is total,
idempotent and byte-recoverable, so a caller that already isolated loses nothing.

**The other two surfaces needed nothing, and one would have been made WORSE.**

- **The load audit** echoes no student text: the banner interpolates `x.step` — step *numbers* —
  (`App3.tsx:368`), never the utterance `loadAudit3` carries.
- **The export must NOT isolate**, and this supersedes the export leg of the ruling's wording. #464/#465
  already decided it at `questionDoc.ts:157`: *"the browser's fix — U+2066/U+2069 isolates — is WRONG in
  a .docx: Word has no glyph for them and prints visible ⟦LRI⟧ boxes. OOXML's own mechanism is per-RUN
  direction"* — so the export passes `segments: bidiSegments3` and emits one `TextRun` per direction.
  Same segmentation as the browser, different expression. Routing `isolateLtrRuns3` through it, which is
  what the ruling's generic wording asks for, would print literal boxes in the student's Word document.

Locks: `bidi3.test.ts` gains «#482 Am. 4» (5) — the operator's four reported rows asserted to take the
prose path (so the exemption provably left them unprotected), the isolate covering the run and the string
byte-recoverable, the MathML rows still taking the structural path, idempotence, and the mechanism
asserted at the source (this tree has no DOM harness — the #559 precedent).

## ADR-3D-185 — ONE ARC OVER AN OPERAND PAIR: an angle whose sides are OBJECTS is drawn (#542)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 5d (display) · **Round:** #824 · **Operator request:** PR #540 play, 2026-08-11

The geometry was right and the panel was right; the **canvas was silent** for every angle whose sides are
objects. Measured at `61aa3eb`, through the real `buildScene3`:

| figure | the record it produced | arcs |
| --- | --- | --- |
| «הזווית בין הפאה SBC לבסיס ABCD היא 60» | `plane-rel` claim, `rel: 'angle'`, `deg: 60` | **0** |
| «זווית בין ישר ℓ למישור π=45» | `line-rel` claim, `rel: 'angle'`, `deg: 45` | **0** |
| «הזווית בין המישור ABB'A' למישור ABCD היא α» | `relMarks` (#523) | **0** |
| «∠SAB = α» | `angleMarks` (#94) | 1 ← the baseline that worked |

**Root cause:** `scene3` built arcs from `c.angleMarks` — the (vertex, p, q) triple — and from the
numeric vertex givens, and from `c.planeAngles`, the V2 *equation-plane* lane gated on a drawn seam.
Nothing else. The renderer knew ONE KIND of angle and everything else fell outside it — the same shape as
the cluster that produced [ADR-3D-140](#adr-3d-140).

**Decision — the three record kinds do NOT grow three arc builders.** They normalize to an operand PAIR
and share one geometry, exactly as `angleBetweenOperands` (#523) became the one measurement. `objectAngleArc`
takes two `OperandGeom`s and chooses by **what the operands are**, never by which record produced them:

- **plane × plane** — the dihedral. The arc lives in the plane ⟂ to the seam (`intersectPlanes`), centred
  ON the seam: at the shared edge's midpoint when the two runs share one — a face↔base pair sharing BC
  draws where a textbook draws it — else at the seam point nearest the figure's centre.
- **line-ish × plane** — from the line to its PROJECTION onto the plane, centred at their crossing. A
  segment contributes its carrier line, so «segment × plane» needs no case of its own.
- **Refusals are geometry, not special cases:** parallel planes have no dihedral; a line parallel to its
  plane subtends nothing; and a line ⟂ its plane draws **no arc**, because #307 gives every right angle a
  KNEE rather than an arc labelled 90°.

`toward` orients each side into its own operand's material so the arc marks the angle the student can see
rather than its vertical opposite; a stated value additionally selects between the angle and its
supplement (the rule the equation-plane lane already used).

**Honesty, unchanged (#371 / ADR-3D-030 Am. 2):** a stated `60` IS the given and may print; a named angle
draws its NAME and leaves the number to the panel, exactly as the vertex marks do.

**The gate (operator's explicit request).** These arcs appear only while «ארגון נתונים» is open —
`buildScene3` takes `showObjectAngles`, fed from `App3`'s `showData` through `Figure3`. It defaults to
**false**, so no existing caller or test changes behaviour. The vertex arcs are deliberately NOT gated.
The issue left one question open — *whether the flag should gate the numeric text too, or only the arc* —
and this reads it as **the whole mark**: the arc and its value are one object, and an orphaned number
floating where an arc used to be is not a thing the canvas should draw. Flagged for the operator's play.

**The frozen lanes are untouched:** `angleMarks` keeps its own vertex loop (its lowering is frozen) and
`planeAngles` keeps the V2 equation-plane loop — measured empty on all four figures above, so the new
builder cannot double-draw over it. `linePlaneMarks` (#319, also frozen) reaches the shared builder
through its own record rather than being re-spelled.

Locks: `issue-542.test.ts` (14) — the world-space geometry (dihedral at the stated angle with every arc
point on the seam radius, the supplement when that is what was stated, the line↔plane arc centred at the
crossing, operand order irrelevant, `shared` moving the focus onto the edge, `toward` choosing the visible
side, and the three refusals) plus the operator's four rows end-to-end with the gate off and on.

## ADR-3D-186 — THE DIMS ARE SPREAD TOO, ON THE FAILURE PATH: satisfiability stops depending on entry order (#816)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 5 (pivot solve) · **Round:** #826

The operator's exam pyramid refused a coordinate it could satisfy. With «|u| = |v|» typed **before** the
injections, `S(0,0,6)` came back `injection-unsatisfiable`; with the same line typed **after**, the
identical fact set built fully determined. Measured at `12673b7`, the relation-first order **succeeded at
seeds 2, 4, 5, 7, 11, 17, 101, 1013, 2027 and failed at 0, 1, 3** — 9 of 12.

**Root cause — search coverage, not the gate.** `store3.ts:359` reports `resolved.pivot.solutions === 0`
honestly; the pivot genuinely finds nothing. A structural defect cannot succeed at three seeds in four.
The gap is the one this file already names, in the comment shipped with #818: the cold starts spread the
**gauge** (eight seed-rotated starts) and the #797 walk spreads the **pin symbols**, but *"the shape DIMS
start at the seed's one sample in every start"*. When the solution needs a different dims basin, no start
reaches it, and a SEARCH failure is presented to the student as an impossibility — with a message about
coordinates that are, in fact, satisfiable.

**Decision — apply the dims spread this file already has, where it was missing.** `dimStarts` in the
`invariantOnly` branch (`solve3.ts:845`) has used the same three variants since it was written; it simply
never reached the gauge-solving path. So the fix is not a new mechanism:

- the same variants, as **EXTRA** starts crossed with the existing rotations;
- **only when this mirror found nothing.** The success path is bit-identical and costs nothing — verified
  by measuring the pristine build: a figure that already solves prints exactly what it printed before;
- the existing eight starts are **never moved**. The #518 lesson is recorded twice in this file
  (`:878`, `:901`) — shifting the start set costs hard figures real solution branches. Widening a path
  that was about to refuse cannot take a branch away.

**Measured alternative, rejected.** Widening the pool *unconditionally* in `collectAll` — the coherent-
sounding "an incomplete pool understates the admissible set" argument (#797's) — was implemented and
measured: it changed **none** of the panel's cells on this figure. It would have cost every pooled solve
three extra start sweeps to buy nothing, which is the #518 trade in the wrong direction. Reverted.

**What the fix achieves, stated as the invariant.** The two orders are now byte-identical in every panel
cell, at every seed, bare and with either sign — which is docs/17 **M2 law (i)** itself, so the lock
compares the ORDERS rather than pinning values (pinning numbers would pass while hiding a difference in
the cells that read «?»).

**What it deliberately does NOT fix.** Bare (no sign given), the panel prints `D(3, ?, 0)` at seeds 0/1/3
and `D(3, 4, 0)` at seed 17 — **identically in both orders, and identically before this fix.** A
two-branch quantity reading as knowledge at some seeds is the ADR-052 class and lives in `dataView`'s
seed-invariance judgement, not in the pivot: filed as **#827** rather than absorbed here.

Locks: `issue-816.test.ts` (26) — the three seeds that refused now build, the 12-seed sweep clean in both
orders, the two orders printing the SAME panel at every seed bare and with either sign, «p חיובי»/«p שלילי»
selecting ±4 at every seed in the relation-first order (proof the extra starts found real solutions rather
than numerical debris), and a genuinely unsatisfiable injection (`S(0,3,6)`, contradicting `AS ⟂ AB`)
still refused — widening only ever ADDS starts, so a system with no solution still finds none.

## ADR-3D-187 — A PLANE'S TWO REPRESENTATIONS GET A ROW EACH, AND THE PARAMETRIC ONE IS «π» (#823)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 5d (display) · **Round:** #826 · **Operator report:** playing round #822, 2026-08-30

Giving both representations is the 2026-08-15 ruling («whenever giving a plane, always give both
representations if possible») and is not in question. This is how they were PRESENTED:

> `מישור ABC = x - 5y + 3z - 10 = 0  |  x = (2, -1, 1) + t·(1, 2, 3) + s·(3, 0, -1)`

Two defects in one row. The query lane joined the forms with `  |  ` while the panel had always pushed
them as two rows — so the same figure read two different ways on two surfaces. And the parametric form
opened with a bare `x =`, which reads as *the coordinate x* and says nothing about which plane is being
described.

**Decision.**

1. **One representation per row.** `QueryResult` gains `rows?: readonly string[]`, present only when an
   answer has more than one row; `answer` stays the FIRST row, which is a complete answer on its own so
   no non-UI consumer needs a special case. The App renders `rows ?? [answer]` — every single-value
   query is bit-identical.
2. **The parametric form is written against the plane's own symbol**, not `x`. `parametricPlaneForm`
   takes the symbol; the panel and the query lane both pass it.
3. **The symbol is composed ONCE** — `planeSymbols(c)` — and read by both surfaces, so they cannot
   disagree about which plane is π1 (the #653 class: two surfaces answering one question from two
   sources). «π» when the figure has one plane, «π1», «π2» … when it has several, enumerated in the
   panel's own iteration order, which is the authority for *the figure's planes*.
4. **A plane the student NAMED keeps its name** and is never renumbered — and its name is *reserved*,
   so a generated symbol can never collide with a plane the student themselves called π2.

**A query names its plane either way**, and both must reach the same registry entry: «מישור π1» carries
the name, «מישור ABC» carries the RUN. Resolving only the name would have printed «π» in the query lane
for a plane the panel was calling «π1» — the exact disagreement this issue exists to remove.

**Unchanged:** when a plane has no stable parametric form (an equation-given plane has no run at all),
the standard form stands alone rather than a sampled parametrisation being invented — the honesty half
of the 2026-08-15 ruling, untouched here.

**A judgement worth naming: the number follows the FIGURE'S planes, not the printable rows.** On the
ADR-3D-032 figure that means «ABB'A': π2 = …» appears while no «π1» is visible, because π1 is
A'B'C'D', whose run has no stable parametric form and which therefore prints only its standard row. The
alternative — numbering only the planes that get a parametric row, so the first one is always π1 —
reads better in that one screenshot and is *unstable*: whether a plane has a printable parametric form
depends on run stability, so an unrelated plane gaining or losing its own row would RENUMBER this one.
A label that moves under the student is worse than a label that starts at 2, so the enumeration is over
the plane universe. Flagged for the operator's play; if they prefer the other reading it is a one-line
change to the universe passed to `planeSymbols`.

Locks: `issue-823.test.ts` (8) — the operator's own plane answering in two rows with their reported
numbers, no answer string carrying «|», `answer` remaining the complete first row, a single-value query
carrying no `rows` at all, «π =» rather than «x =», two planes numbered π1/π2 with distinct symbols, and
the panel and the query lane agreeing on both the symbol and the parametric text.

## ADR-3D-188 — ONE NOUN VOCABULARY: the lexicon layer gets its first directory, and the AREA head takes its subject noun (#753)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 0 (parse) · **Round:** #826 · **Operator ruling:** 2026-08-19 — *"for #753 - option 1 - the recommended approach"*

«שטח ABC» answered; **«שטח המשולש ABC» did not.** The point, length and volume heads all took their
subject noun in #642's sweep and this one could not — the polygon vocabulary («משולש / מרובע / ריבוע /
מלבן / מקבילית / טרפז / דלתון / מחומש / מצולע», with the adjectival and plural forms a book sentence
uses) lived only in `parser/parse3.ts`, and `engine/queries.ts` **may not import from `parser/`**.

**Root cause — a copy, not a missing regex.** The two files maintained private copies of the same Hebrew
gates and had already drifted **three times**: #640 (the line noun in `parse3.ts`), #642 (the subject
noun in `queries.ts`), and the ASCII-only `\w*` suffix gate found while fixing that one, which could not
match «קואורדינטות». Copying the polygon list in would have been the fourth. Round #752 stopped and
filed this instead, as #642's own audit comment directed: *"If the local fix cannot be made without the
hoist, escalate instead of copying the gate a third time."*

**Decision — the layer `BOUNDARIES.json` had already named, and left empty.** The registry declares a
`lexicon` layer (*"Does it name Hebrew/English vocabulary, or map a noun to a shape?"*) with the note
*"No directory carries this layer yet; it is declared so the split is nameable when one does."*
`src3d/lexicon/nouns3.ts` is the directory that does:

- **It imports nothing.** That is the entire property — a leaf both `parser/` and `engine/` may depend
  on without either depending on the other, so the copy cannot come back.
- **It knows only how words are SPELLED.** What a triangle *means* stays in the layer that builds one;
  nothing here lowers a noun to geometry.
- `parse3.ts`'s `DECL_WORDS_HE` is now **composed** from the leaf's parts (solids, polygons, qualifiers,
  parts) in the order it listed them — the list is unchanged, only its home.
- The AREA head reads `SHAPE_SUBJ` from the same leaf. The noun is **optional**, so «שטח ABC» is
  byte-identical.
- `BOUNDARIES.json` classifies the new directory (the map is TOTAL — an unclassified directory fails the
  isolation test, which is the copy tripwire made mechanical) and its `lexicon` rationale is updated to
  say the layer is now carried. Whether it is shared ACROSS products stays undecided, as ADR-W-003 left it.

**«מישור» is in the gate too**, from the operator's 2026-08-29 session: «שטח DBB'D'» answered 22.63 while
«שטח מישור DBB'D'» did not — and a student who has just typed «מישור DBB'D'» into the fact list writes
exactly that after «שטח». It compounds with #813, where the phrasing that *would* route them to the
answerable area query was the one this gap rejected.

Locks: `issue-753.test.ts` (14) — the six answering forms including both Hebrew nouns and the English
mirrors, «שטח מישור DBB'D'» answering identically to the bare run, the noun staying optional, a non-shape
noun still refused, and the SEAM itself: the leaf importing nothing, the parser holding no private copy,
the query lane reading the same leaf, and the polygon words being present in the composed declaration
vocabulary.

## ADR-3D-189 — CONTAINMENT HAS AN INPUT FORM: the tool can hear the phrase it prints (#614, #532 cap. 2)

**Status:** Accepted (2026-08-30) · **Ladder:** stage 0 (parse) + stage 3 (verify) + stage 5 (drive) · **Round:** #826

[ADR-3D-154](#adr-3d-154) added the panel's «מוכל במישור» row — the right call, because reporting a
contained segment as merely *parallel* is a false statement. The consequence was an asymmetry the
operator hit within minutes of the row existing: a student reads «CD מוכל במישור ABC» in ארגון נתונים,
types that same sentence on another figure, and is refused. [ADR-3D-105](#adr-3d-105) had left `contains`
planned and unbuilt, and the whole relation — both languages, both frames — was absent from the grammar.

**Decision — `contained` is a first-class relation, sharing ONE definition with the panel.**

1. **One predicate.** The panel's containment test was *inlined* at `dataView.ts` — parallel deviation
   combined with a zero gap. It is now `containmentDeviation` in `operands.ts`, and the panel asks it.
   That is the point of the issue rather than a tidy-up: the two lanes cannot drift about what «מוכל»
   means (the `memberHolds3` / `angleBetweenOperands` precedent).
2. **`PlaneRel3` and `lineRels` gain `contained`** — the named-line column belongs to S2 and
   `planeRelGiven` defers it, so a member added to only one lane would silently drop half the forms.
3. **The residual is one more `rel`, not a new mechanism.** The `plane-rel` drive builder already
   emitted direction **and** offset for `coincident`; containment is that shape one operand-kind down:
   a mixed line×plane pair reads its direction in one component plus one offset row (count 2). And a
   PLANAR side contained in a plane **is** coincidence — same statement, so it reuses that residual
   rather than growing a second spelling that could drift from it.
4. **Both frames, both languages, together** (the `CROSS_HE_VERB`/`CROSS_HE_NOUN` precedent — reach for
   one and the other silently drops): verb-headed «מוכל / נמצא ב / מונח על», `is contained in`,
   `lies in/on`; and the container-headed «המישור P מכיל את ℓ», `plane P contains ℓ`, which is
   *directed* and so cannot ride the symmetric splitter table. Both reach the identical command.
5. **Operands:** a segment/pair, a named line, and a point-run — the last being **#532 capability 2**
   («A'B'C'D' מונח על מישור π2»), the same relation rather than a rule of its own. A container that is
   not planar states nothing and is refused instead of being given an invented meaning.

**A pre-existing conflation this uncovered, and had to fix to work.** `solvePivot`'s `invariantOnly`
branch returned `[]` when there were no dims to flex, on the stated intent that the condition would be
*"refused downstream"*. It is not: `store3` reads `pivot.solutions === 0` as unsatisfiable and blames the
newest pin. So a similarity-invariant relation **true by construction** on a shape with no free dims —
«AB מוכל במישור ABCD» on a cube — came back `givens-contradict`. Two states shared one empty answer:
**the #698 class, in the solver.** With nothing to flex the question is decidable immediately, so the
residual is evaluated at the identity — if it already holds, the identity IS the solution; if not, the
relation stays refused exactly as before.

**Not fixed here:** «AB מקביל למישור A'B'C'D'» on the same figure still fails, through a *different* path
(`no-solution` on a point, not this branch) — measured before and after, and untouched by this change.
Filed separately rather than absorbed.

**Deliberately out of scope:** the noun-prefixed operand «משולש ACS מונח על מישור π2» needs the shape-noun
gate that [ADR-3D-188](#adr-3d-188) (#753) hoisted into `src3d/lexicon/` in this same round; the bare-run
spelling that #532 measured works today, and the noun follows once both are on `main`.

Locks: `issue-614.test.ts` (19) — seven spellings across both frames and languages all lowering to one
command, the two frames producing identical commands, the named-line and polygon-run operands, a
non-planar container refused, M1 both ways (a true containment accepted on a no-free-dims figure, a false
one refused `claim-refuted`), **the round trip** (a figure whose panel prints «BE מוכל במישור ABCD»
accepting that exact sentence), the shared predicate being order-independent and rejecting a parallel-but-
offset line, planar containment equalling coincidence, and the ∥ sibling keeping its cell.

## ADR-3D-190 — A HEBREW ROW IS ORDERED AS HEBREW, even when it contains maths (#838)

**Status:** Accepted (2026-08-31) · **Ladder:** stage 5d (display) · **Operator report:** playing `prod/2026-08-31`

> *"also note that the inputs are not shown bidi"*

The fact row for «BE מוכל במישור ABCD» displayed with its operands **swapped** — it read as if `ABCD`
were contained in `BE`. The operator reported it as a containment bug, because that is what the app said.

**Root cause.** `VecMath` wraps a row in `<math dir="ltr">` whenever the tokenizer finds a `pair`/`vec`/
`frac` token, and that wrapper covers the **whole row, prose included**. A Hebrew sentence containing two
point-pairs was therefore laid out left-to-right: `BE` leftmost, `ABCD` rightmost, and a reader scanning
right-to-left meets `ABCD` first. Measured at `f78940c`: «BE מוכל במישור ABCD», «E אמצע AC» and «קטע BE»
all take the MathML path and were all reversed; «מישור ABCD» and «קובייה ABCDA'B'C'D'» take the prose
path and were correct.

**This corrects [ADR-3D-190's own predecessor.](#adr-3d-184)** ADR-3D-184 (#482 Am. 4) fixed VecMath's
prose path and deliberately left the MathML branch untouched, on this reasoning:

> *"The MathML branch is untouched, so ADR-3D-121's reasoning survives precisely where it was true."*

That reasoning — *"VecMath emits one element per token, so bidi sees structure rather than one neutral
run"* — is true of a **pure expression** and **false of a Hebrew sentence containing expression tokens**.
The structure was there; the wrapper was overriding the direction it should have been ordered in. The
tokens were checked and the wrapper around them was not.

**Decision — the wrapper's direction follows the ROW, not the presence of a math token.** `dir` comes
from `textDir3(text)`, the same question the input preview already asks, so the two seams cannot
disagree. A pure expression still reads `ltr` and is byte-identical; a Hebrew sentence orders its islands
right-to-left while each island stays internally LTR — which is what the per-token elements already are.

**Amendment 1 (same day) — the residual risk landed, and the fallback is what shipped.** The paragraph
below predicted that MathML Core's `dir` might not reorder, and the operator's next play confirmed it: the
row was STILL reversed. So prose no longer lives inside the math element at all. A row with **no Hebrew**
is untouched — one `<math dir="ltr">`, byte-identical — while a Hebrew row is split: each expression
island is its own `<math dir="ltr">`, the prose between them goes through `isolateLtrRuns3` (which is what
handles a Latin run the tokenizer left as prose — «ABCD» is four letters and tokenizes as TEXT, not a
pair), and the container carries the row's direction. Ordering is then **HTML's** bidi on a `<span dir=…>`
— the mechanism every other row in this app already uses — instead of MathML's.

The lesson worth keeping: the first fix was verified on the markup and was wrong about the pixels. There
is no browser in this harness (#704), so a display fix asserted on markup alone is a hypothesis until
someone looks.

**The original risk note, kept for the record:** this relies on MathML Core's `dir`, which the same file's
ADR-207 note already depends on for MathML support generally. It could not be verified visually in this
session — there is no browser here (#704).

Locks: `issue-838.test.tsx` (9) — the operator's three rows ordered RTL and their operands in typed
source order, pure expressions still LTR, the prose path never entering the math element, and the
property over the whole command catalog: every advertised utterance renders in the direction its own text
calls for.

## ADR-3D-191 — AN UNSTATED ENDPOINT IS FREE, AND CONTAINMENT TAKES A DEGREE OF FREEDOM (#840, #839)

**Status:** Accepted (2026-08-31) · **Ladder:** stage 1 (apply) + stage 5 (placement) · **Operator report:** playing `prod/2026-08-31`

> *"when i delete the E middle of it doesnt do anything (is yellow). In this case, I think that BE should
> be drawn with a degree of freedom and having it part of ABCD should even limit the degree of freedom
> even more. But it doesn't do any of that."*

Both halves were true, and they are one chain: the segment could not exist, so the relation had nothing
to constrain — which is why [ADR-3D-189](#adr-3d-189)'s containment shipped with a drive that was never
reachable.

**Half 1 — «קטע BE» with no `E` was refused `unknown-point`.** 3-D refused any utterance naming a point
it did not know; it never created one. 2-D does the opposite («נקודה E» → a free point), so the products
disagreed about what naming an unknown point means.

[ADR-052](../06-decisions.md#adr-052) settles it: a student enters only what the question shows, and every
unstated magnitude is a **free DOF**. `E` is unstated, so it is free. `segment3` now mints an unknown
endpoint as `free3` — 3 sampled degrees of freedom that «הציגו תצורה אחרת» resamples.

**Two guards, not one — the second was found by a failing lock.** The first version minted on every
`segment3`, and `v7-t1` went red: many commands emit a `segment3` as a **carrier** («נסמן: AB = u, AC = v»
draws the vector's segment before naming it), and minting there let a NAMING introduce its own subject,
against that test's explicit *"naming needs existing points"*. So the mint is gated on `bare` — the
drawing register, where the student's whole sentence IS the segment. Every other `segment3` in the parser
is a carrier and creates nothing.

**The typo guard is kept, and it is the reason the scope is narrow.** The polygon lane already mints
free corners on exactly this argument (*"«משולש XYZ» already builds three free points"*) and does so only
when the run has at least one KNOWN point. The same rule applies here: «קטע BE» extends from a `B` that
exists, while «קטע QZ» — both ends unknown — is still refused and names the undeclared label. The wider
reading (mint on every mention, as 2-D does) would silently invent both points; that trade was flagged to
the operator on #840 and is **not** taken here.

**Half 2 — containment could only verify, never constrain.** The `plane-rel` pin solves the GAUGE and the
shape DIMS: it moves the whole figure. A free point's position is **sampled**, outside that unknown
vector, so the pin could check «BE מוכל במישור ABCD» and could never bring a loose `E` into the plane —
it came back `claim-refuted`.

#614's analysis pointed at lowering to point memberships, and measurement said one step further: **a
membership on an already-sampled point only verifies it.** What removes the freedom is re-homing the
point — a `free3` endpoint becomes an `on-plane` **rider**, which `evaluate` already places
(`placeOnPlaneRider`) and already counts as **2 degrees of freedom instead of 3** (`evaluate.ts:765`).

**Only a FREE endpoint is re-homed.** A bound one — a solid vertex, a midpoint, a foot — already has an
owner and keeps it; re-kinding it would unbind it from the construction that defines it, and its
containment stays the claim's business. Measured: `B` remains `solid-vertex` throughout.

**Measured result** (the operator's own figure): free `E` moves in three dimensions across seeds
(z = 1.03, 1.11, 0.81); contained `E` sits at **z = 0 at every seed** while still sliding in x and y. The
DOF count drops by exactly one. That is the operator's sentence made literal.

Locks: `issue-840.test.ts` (16) — «קטע BE» building with `E` minted free and genuinely moving, the typo
still caught, a bound endpoint keeping its owner, the containment ACCEPTED rather than refused, `E`
re-homed `free3 → on-plane`, `E` in the plane at five seeds while still sliding inside it, the DOF count
dropping by exactly one, and the two cases that must not change (the entailed midpoint case, and a false
containment on bound points still refusing).

## ADR-3D-192 — A PLANE'S TOGGLE BELONGS TO THE ROW THAT DREW IT, AND A REDUNDANT CONTAINMENT SAYS SO (#842)

**Status:** accepted, 2026-08-31. Closes the half of #839 that [ADR-3D-191](#adr-3d-191) did not —
steps 3 and 4 of that plan, filed as #842 rather than left closed inside a "fixed" issue.

**What the operator actually saw first**, playing `prod/2026-08-31`:

> *"I'm pretty sure that the last one BE מוכל במישור ABCD just drew the plane … by the הסתר מישור
> that was added, make me think it just drew the plane again (which already existed)."*

One reading, two independent defects.

### 3 — the plane toggle asserted something false

Every fact row that so much as **mentioned** a point-run plane grew a «הסתר מישור» chip
(`App3.tsx`, inline in the row's JSX). With «מישור ABCD» already on screen, the containment row got a
second chip for the same plane — and since "hide plane" was that row's *only* affordance, the
statement read as *"this line drew the plane again"*. The chip is a claim about **who made the
plane**; offering it from a row that did not make it is the UI stating something untrue.

**Decision — ownership is derived from the fact list**, in `store/planeChips.ts`:

1. If some fact **declares** the plane («מישור ABCD», a free plane), the first such fact owns the
   chip, *wherever it sits in the list*. Order must not decide ownership.
2. Otherwise the **first fact that names it** owns it — a relation genuinely can be what
   materialised a plane (`materializePlaneRun`), and [#383](#adr-3d-107) requires a stated relation
   to leave a visible trace. Taking the chip away there would strand a plane on screen with no way
   to reach it.

Provenance derived from the fact list, never from a list of "minting command types" — the **#769
(ADR-3D-183) pattern**, chosen for the same reason: a list of kinds goes stale the moment a new
command learns to name a plane, and nothing forces it to be updated.

**Applied uniformly to ∥, ⟂, ⊂, distances, claims and angles** — the third lock in #842 asked which,
and this is the answer. The defect is identical on every relation family; restricting the fix to
containment would special-case the one input the operator happened to report, which standing rule 1
forbids. The locked property is stronger than the report: **each plane is offered by exactly one
row, and every plane mentioned anywhere is still offered somewhere** (narrowing ownership must never
orphan a plane).

### 4 — a statement that changed nothing looked like it changed something

«BE מוכל במישור ABCD» where `B` defines the plane and `E` is the midpoint of `AC` is **true and adds
nothing**. It committed `ok`, drew a ✓, and emitted no notice — and a ✓ alone reads as "something
happened". The precedents are #612 `shape-redundant` and #396 `redundant-relation`; neither covered
this, because #396 requires both sides **absolute** (`isSelfDetermined` ⊃ `isAbsolute`) and a
gauge-riding segment against a point-run plane is never that.

**Decision — a new `containment-redundant` notice, decided STRUCTURALLY.**

The tempting test is numeric: was the containment's residual already zero? That has to be judged at
sampled positions, and a quantity that merely *looks* satisfied across the samples it happened to
draw is **exactly the #827 defect** this round is also fixing — a two-branch value printing as
knowledge because every sample landed in one branch. So the verdict is a structural entailment
instead (`pointEntailedInPlane`): a point is confined to the plane if it is one of the plane's own
defining points, a student-stated rider on it, or recursively a midpoint/on-segment/centroid of
points that are. A structural entailment cannot be wrong about a branch it never looked at.

It is therefore deliberately **conservative and can only under-claim**: when the check returns false
the statement may still be redundant and we say nothing. Under-claiming costs a missing notice;
over-claiming would tell a student their real given added nothing, which is the honesty invariant
itself.

**The trap this had to avoid.** After ADR-3D-191 a containment **re-homes** a free endpoint into an
`on-plane` rider — so on the very figures where the containment did the most work, both endpoints
end up lying in the plane, and a naive "both ends are in the plane" test would report the useful
containment as pointless. The `implied: true` flag (#841) is what separates them: a rider the
*student* stated entails, a rider the *relation* implied does not. Locked as its own test.

**Locks** (`src3d/__tests__/issue-842.test.ts`, 13 tests): the operator's exact four-line sequence;
each plane offered by exactly one row; no plane orphaned; the declaring row wins regardless of order;
a relation that is the only mention keeps its chip; ∥ obeys the same rule; the notice fires for the
operator's figure and **not** for the ADR-3D-191 re-homing case; a midpoint chain still counts (the
class, not the reported point); and seed-invariance at seeds 0/1/3/17/42 — the deliberate opposite of
#827, since a structural verdict must never depend on where the figure was sampled.

**Sibling check (ADR-W-004).** 2-D has no plane objects, so defect 3 has no 2-D twin. Defect 4's
class — *a true statement that changed nothing is silently inert* — does exist there and is already
answered by the `coincidences` notice (ADR-123) and #612's `redundantShapes`; no new 2-D gap found.
## ADR-3D-193 — ∥-TO-PLANE LOWERS TO A CLAIM, EXACTLY AS ⟂ DOES (#833)

**Status:** accepted, 2026-08-31.

**The refusal.** On a cube, with `AB` a bottom edge and `A'B'C'D'` the top face:

```
קובייה ABCDA'B'C'D'
AB מקביל למישור A'B'C'D'      → {"code":"no-solution","id":"A"}
```

True by construction, adds nothing, **refused** — and the refusal named point `A`, which was never
the problem. Reproduced anchored (`A(0,0,0)`, `B(4,0,0)`, `D(0,4,0)`) and un-anchored, so it is not
the gauge case.

**Root cause — a lowering that was never written.** `seg-plane-rel` ends in three branches: a
symbol-pin lane, a driving `scalarPin` when `freeDims(c) > 0`, and — since #380 — a `perp-plane`
**claim** for ⟂. There was no fourth branch for ∥. The code said so out loud:

> `// otherwise: ⟂ is the existing claim; ∥-to-plane as a claim is not yet demanded`

So on a **determined** figure a ∥ statement fell past every branch to the function's final
`return { ok: false, error: { code: 'no-solution', id: cmd.a } }`. Meanwhile `relationTable` had
declared `parallel|segment|plane-run` as `{ status: 'supported', actions: ['drive-dims', 'claim'] }`
the whole time: **the table advertised a claim action nothing implemented.**

This is a different mechanism from [ADR-3D-189](#adr-3d-189), which fixed `solvePivot`'s
`invariantOnly` branch returning `[]` for both "nothing to flex" and "no solution". That one made the
containment twin work on this very figure; this one is the ∥ lane, and was deliberately not swept in.

**Decision.** ∥ lowers to a new `par-plane` claim — the segment's direction orthogonal to the plane's
normal — routed by the same branch that already routed ⟂, with the same degeneracy guard (a run
whose two spanning directions are dependent is not a plane, so the claim is unanswerable rather than
true). The two relations differ only in which claim they name:

```ts
const claim = cmd.rel === 'perp' ? 'perp-plane' : 'par-plane';
```

Keeping one branch for both is the point: a future relation added here inherits the lowering instead
of quietly re-earning the `no-solution` fallthrough.

**A contained segment satisfies it**, and that is the intended reading — ∥ is a statement about
DIRECTION, and the containment reading has its own relation («מוכל», ADR-3D-191/192). Excluding it
would reintroduce a false negative of exactly the kind this ADR removes.

**Honesty, both directions.** The fix must not turn a wrong statement into an accepted one. A false ∥
(«AA' מקביל למישור A'B'C'D'» — `AA'` is perpendicular to that face) is still refused, and now with
`claim-refuted`: the claim was checked and did not hold, which the student can act on, rather than
`no-solution` naming an innocent point. That change of verdict is itself part of the fix.

**Class (docs/17).** *A search or lowering failure presented to a student as an impossibility* — the
#816 family. The locked property is stronger than the report: over the cross product of four segments
× three faces, **no verdict on this lane is ever `no-solution` again**; every answer is a build or a
claim verdict.

**Locks** (`src3d/__tests__/issue-833.test.ts`, 9 tests): the operator's exact two lines; the same
anchored; a side face as well as the top/bottom pair; all four bottom edges at seeds 0/1/3/17; a
false ∥ still refused as `claim-refuted`; ⟂ still lowering and still refuting when false; the
no-`no-solution` cross-product property; and the stated segment still drawn (#821 / V1).

**Sibling check (ADR-W-004).** 2-D has no planes, so this lane has no 2-D twin. The general class —
*a relation table advertising an action no code implements* — is worth a sweep in both products; not
done here, and not claimed to be. Filed as #845 rather than absorbed silently.
## ADR-3D-194 — A COORDINATE IS KNOWLEDGE ONLY IF THE ADMISSIBLE POOL AGREES, NOT MERELY THE SEEDS (#827)

**Status:** accepted, 2026-08-31.

**Measured — the operator's exam pyramid, no sign given.** `|AD| = 5` with `AD = (3, p, 0)` forces
**p = ±4**, and both configurations are reachable («p חיובי» / «p שלילי» each select one, at every
seed, in both entry orders):

| seed | panel, before |
| --- | --- |
| 0, 1, 3, 42 | `D(3, ?, 0)` ✅ honest — the givens do not determine it |
| **17, 99** | **`D(3, 4, 0)`** ❌ printed as knowledge, though −4 holds equally |

[ADR-052](../06-decisions.md#adr-052)'s cardinal sin in its exact stated form — *a value the givens
leave open, printed as a value* — reached through the panel's sampling rather than through DOF
accounting. And the instability is its own defect: «הציגו תצורה אחרת» changes the seed, so the same
figure printed `4` and then `?`.

**Root cause.** The pivot enumerates an admissible pool of placements and picks
`chosen = pool[seed % pool.length]`, so **the branch is a function of the seed**. `dataView` judged a
coordinate by comparing three sampled configurations (`[seed, seed+1013, seed+2027]`). Those three
samples vary the **gauge**; they do not vary the **branch**. When the deterministic pick lands in the
same branch for all three — which it does at some seeds and not others — a branch choice reads as a
fact.

**This is [#797 (ADR-3D-168 Am. 1)](#adr-3d-168) one lane over.** That amendment established, for pin
symbols, that *seed-stability alone is not determinedness*: a symbol restricted to discrete roots
cannot be moved off a root by resampling, so a deterministic root pick reads seed-stable. It fixed
that by exposing `symRoots` — the admissible pool's distinct values — and requiring a singleton.
**Coordinates had no equivalent guard.** The finding was right and was applied to one lane only.

**Decision — the same answer, for coordinates.** `resolve3` now also exposes
`pivot.pointRoots`: the admissible pool's distinct positions per point, post sign-filtering and
gauge-transformed exactly as the chosen solution is. `dataView` prints an axis as knowledge only when
it agrees across the three seeds **and** across that pool at every seed.

**Why not simply sample more seeds.** Because more seeds cannot help: they resample the gauge, and
every sample can still land in the same branch. That is the whole shape of the defect, and it is why
the fix is a different *question*, not a bigger *sample*.

**Cost is confined.** `pointRoots` is computed only when the pool holds more than one solution — with
a single solution there is no branch to miss — so the solver's hot path is untouched on ordinary
figures, and on multi-branch ones it reuses work the sign filter already does.

**The opposite failure is locked against.** A panel that prints `?` for everything is honest and
useless. So the tests assert both directions: with no sign given `D` reads `(3, ?, 0)` at every seed;
with «p חיובי» it reads `(3, 4, 0)` at every seed and with «p שלילי» `(3, -4, 0)` — a stated sign
narrows the pool to one, which is exactly when a value becomes knowledge. The student's own injected
coordinates (`A`, `B`, `S`) still print, and a single-solution figure is untouched.

**Locks** (`src3d/__tests__/issue-827.test.ts`, 7 tests): the operator's exact nine-line sequence at
seeds 0/1/3/17/42/99; the seed-invariance of the verdict (the property that actually failed); both
sign selections; the value returning once a sign is stated; injected coordinates unaffected; a
single-solution figure unaffected.

**Sibling check (ADR-W-004).** 2-D's knowledge gates are #434's territory — *"gates trust
`freeDofCount===0` without measurement"* — which is the same class (a determinedness verdict taken
from one observation) on a different mechanism. That issue is open and armed; this ADR does not close
it, and the connection is recorded there rather than assumed fixed here.

### ADR-3D-194 Am. 1 — the VECTOR lane, found by looking at the app

**2026-08-31, same round.** The point-lane fix above landed, its 7 tests were green, and the 3-D lane
and full suite were green. Then the figure was driven in a real browser under the new #704 harness and
the panel showed this:

```
נקודות     D(3, ?, 0)          ← honest, the fix working
מדידות     v⃗ = (3, 4, 0)       ← the same branch, printed as knowledge
```

`v = AD`, so `v` is exactly as two-branch as `D` is — and at exactly the same seeds (17, 99). The
panel now **contradicted itself on screen**: a student reading both rows learns the value anyway,
which is the whole thing the fix was supposed to prevent.

`stablePair` had the same defect `stableAx` had: it compared the delta across the three sampled
configurations, which proves the delta does not move with the GAUGE and proves nothing about
branches. The fix is the same guard (`branchStablePair`), and it required one change to the data:
`pointRoots` is now stored **one entry per pool solution, in pool order and not deduplicated**, so
two points' entries can be subtracted pairwise. Deduplicating per point had lost the pairing, and
subtracting across branches would invent a delta no configuration actually has.

**`|v| = 5` still prints**, and must: the magnitude is forced by `|u| = |v|` whichever branch holds.
The length is knowledge; the components are not. A fix that suppressed both would be honest and
useless, so the distinction is locked.

**Why this amendment exists at all.** The mechanism was verified and the surface was not — the exact
pattern that shipped two defects on 2026-08-31 and prompted #704. The harness built earlier in this
same round caught it within minutes of the first look, on the very acceptance case the operator was
about to play. That is the argument for the gate, made on its first real use.

Locks grow to 12 tests, including the property rather than the instance: **`D` open ⟺ `v` open**, over
the no-sign figure and both sign selections.

## ADR-3D-195 — ONE vector-notation convention: the name is UNDERLINED, the pair is ARROWED (#849)

**Status:** accepted, 2026-08-31. **Supersedes** [ADR-3D-003](#adr-3d-003)'s notation clause (its
auto-draw, coloured-shaft and arrowhead-at-head clauses stand).

**The rule.** A **declared name** (`u`, `v`, `w`) takes the **underline** only. A **point pair**
(`AB`, `AA'`) takes the **arrow** only. On both surfaces — the step row and the canvas label.

**This is not a new rule; it is a restored one.** The operator set it for the step rows on
2026-07-07 (ADR-3D-014 Am.): *"point pairs get the combining arrow (SE⃗ = 3/4 SD⃗), declared vector
names get the textbook underline (u̲)"*, and re-stated it on 2026-07-25 when an underline went
missing (ADR-3D-073). `src3d/render/notation.ts` has implemented it correctly the whole time and says
so in its header.

**What went wrong.** #313 added the MathML renderer `VecMath.tsx` and gave declared names
**arrow + underline**, with this comment:

```ts
// a NAMED vector matches the canvas convention (ADR-3D-003): arrow above AND underline below
```

That comment is the defect. ADR-3D-003 governs the **canvas label**, not the row. `App3.tsx` routes a
vector fact to `VecMath`, so the wrong convention won and `notation.ts`'s correct implementation
became **unreachable for vector facts** — dead code that looked live. The row has been wrong since
2026-07-25, and the operator reported it as a change of mind when it was a regression against their
own instruction.

**Why the arrow belongs to the pair and not the name.** The arrow *means* «from A to B». A pair has
endpoints to point between; a declared name does not. Marking them differently also does real work
for a student: the row shows at a glance which vectors they NAMED and which are concrete pairs, and
«AB = u» displays both conventions side by side, which is the moment the distinction is worth seeing.

**The canvas half was the only genuine decision**, since ADR-3D-003 explicitly specified
arrow+underline there. Decided rather than returned to the operator (who asked what there was to
decide — a fair question, since "row" and "canvas" name places in the code, not places a person
looks): the instruction was about the NOTATION, not about one renderer, and two surfaces disagreeing
about one object is worse than either convention alone. The supporting reason is stronger than
consistency: ADR-3D-003's own amendment already draws a named vector as its **own coloured shaft with
the arrowhead at the head point**, so direction is already carried by the drawing. An arrow over the
letter was a third marking of the same fact.

**What must NOT be "simplified" away later.** On the canvas the label sits *away* from the shaft, so
it keeps the **underline**. A bare italic `w` beside a teal line reads as a point label. Underline
only — never no mark. Locked as its own test.

**Checked and ruled out:** legibility. Both marks were captured at 3× on the running app before and
after; the underline is clean on the row and on the canvas. This was purely about which convention
applies.

**Locks** (`src3d/render/__tests__/issue-849-notation.test.ts`, 7 tests, plus the updated
`vecmath.test.tsx` and `render3.test.tsx`): a name renders `munder` and **no** `mover`; a pair
renders `mover` and **no** `munder`; both appear in one row with exactly one of each; the underline
survives every coefficient syntax (the ADR-3D-073 boundary class); the canvas label has two lines and
one path — and specifically still has its underline; and, the lock that matters most, **one test
drives `notation.ts` and `VecMath` for the same fact**, so the two renderers can no longer drift
apart in silence. That drift, not either convention, was the actual defect.

**Noticed, not fixed here:** on `AA'` the stretchy arrow spans only `AA`, leaving the prime outside
it, where ADR-3D-003 specifies the whole pair name. Filed as #852 rather than folded in.
## ADR-3D-196 — AN EQUATION INSIDE A HEBREW ROW IS ONE ISLAND, SO IT READS FORWARD (#848)

**Status:** accepted, 2026-08-31. Amends [ADR-3D-190](#adr-3d-190) Am. 1 — the third report on the
same row.

**The symptom.** «נסמן: AB = u, AD = v, AA' = w» rendered with every clause backwards:

```
w̲ = AA'⃗   v̲, = AD⃗   u̲, = AB⃗ : נסמן        instead of        AB⃗ = u̲, AD⃗ = v̲, AA'⃗ = w̲  :נסמן
```

**Root cause.** ADR-3D-190 Am. 1 stopped wrapping the row in `dir="ltr"` and split it into islands
ordered by an RTL container — correct in principle. But it classified **every space as prose**:

```ts
const prose = t.k === 'text' || (t.k === 'op' && t.text === ' ');
```

A space inside an expression is not prose. Treating it as a separator atomised «AB = u» into three
islands — `AB`, `=`, `u` — and three islands in an RTL container are laid right-to-left. The clause
came out reversed. The split went exactly one level too far.

**Why it survived two fixes.** «BE מוכל במישור ABCD» — the row the previous two rounds were tested
against — has *no expression*: one pair, then Hebrew prose. Atomising it changes nothing, so it read
as fixed. **The defect needs an `=` to show.** And every verification was `textContent`-shaped: the
logical text has been correct through all three reports, so a text assertion passed on every broken
build. That is recorded here because it is the transferable part.

**Decision.** A space is prose only when prose stands on one side of it; **between two math tokens it
belongs to the expression.** The whole expression then becomes ONE `<math dir="ltr">` island —
internally left-to-right as mathematics, ordered right-to-left against the Hebrew around it, which is
what ADR-3D-190 set out to do.

Two refinements the first attempt needed, both found by looking at the rendered row rather than the
DOM:

1. **Sentence punctuation stays with the sentence.** With the colon inside the island, «נסמן» sat at
   one end of the row and its colon at the other. `:` `,` `.` `;` `?` `!` directly after a prose token
   are prose. Any *other* operator stays math, so «נתון |AB| = 4» keeps its opening bar with the
   magnitude — the edge the rule must not over-reach into.
2. **A space inside an island is `mspace`, not `<mo>`.** As an operator it carries MathML's spacing on
   both sides; measured, that widened the row past the truncating fact-row container and clipped
   «נסמן» off its leading edge. `scrollWidth` 267 → 253 against a 253px slot.

**Locks** (`src3d/render/__tests__/issue-848-row-order.test.tsx`, 8 tests): the operator's row yields
exactly ONE island; that island carries the whole expression in source order; the Hebrew word comes
first in DOM order (⇒ rightmost under `dir="rtl"`); the colon stays with «נסמן»; «BE מוכל במישור ABCD»
keeps its ADR-3D-190 order; a pure-expression row is untouched; an opening delimiter stays with its
expression; a fraction row stays one island.

**On STRUCTURE AND ORDER, never `textContent`** — stated as a requirement rather than a preference,
because a textContent lock would have passed on all three broken builds.
## ADR-3D-197 — A RELATION NEVER OWNS A PLANE; EVERY DRAWN PLANE IS REACHABLE FROM THE PANEL (#847)

**Status:** accepted, 2026-08-31. **Supersedes clause 2 of [ADR-3D-192](#adr-3d-192).**

**Operator ruling**, playing the round #843 batch and shown a screenshot of their own figure:
*"it doesn't own the plane."*

**What ADR-3D-192 got wrong.** Its rule had two clauses: a DECLARING row owns the chip; *otherwise*
the first row that names the plane owns it. The first clause was the instruction. **The second was my
inference** — reasoned from #383 (a stated relation must leave a visible trace) and from the fear of
stranding a plane. The operator rejected it immediately, and the principle is simpler than the one I
reasoned to: **a relation is a statement ABOUT a plane, never a declaration of one.**

It also produced the inconsistency they hit. «BE מוכל במישור ABCD» gained or lost a button depending
on whether «מישור ABCD» had been typed earlier — the same sentence, two affordances.

**And a second defect that needed no ruling:** a row that is **not `ok`** kept its chip. Deleting
«E אמצע AC» left the containment amber — refused, materialising nothing — still offering to toggle a
plane. Status is now part of the ownership question.

**The coupling, and why it was escalated rather than guessed.** Removing the chip from relation rows
could not ship alone: `App3.tsx` had the **only** control for `planeDisplay`, and `scene3.ts` draws
any plane in `pointPlanes`, which nine relation sites populate. So the removal by itself would have
left «AB מקביל למישור A'B'C'D'» drawing a patch the student cannot dismiss — contradicting #821
(*"the user has the option of disabling it through the input panel"*), and worse for them than the
bug reported. Four options were put to the operator with their costs.

**Decision (operator, option c): a PLANES section in the data panel.** It lists what the **figure
draws** — `resolved.planes`, the renderer's own list — each with the display toggle the chip used to
carry. A plane is therefore reachable however it came to exist, and no fact row needs to pretend it
owns an object it merely mentioned.

Rejected, with reasons recorded: minting a plane fact row from a relation (one utterance would become
two rows — new here, and it needs answers for undo, save/load and deletion semantics); click-to-toggle
on the canvas (the better end state, but 3-D has no click-to-edit surface at all yet — worth revisiting
when it does); and not drawing an undeclared plane at all (it reverses #821, the operator's own ruling).

**Locks** (`issue-847.test.ts`, 7 tests; `issue-842.test.ts` updated): no relation row carries a chip
in any family at any status; a DECLARED plane keeps its chip on its own row; a declaring row that is
itself not `ok` owns nothing; every mentioned plane is still reachable — by a row or by the panel;
and the #842 property that no plane is offered twice still holds. The two superseded assertions in
`issue-842.test.ts` were **inverted rather than deleted**, so the rejected behaviour cannot creep back
unnoticed.

Verified in the browser: three clean fact rows, the plane drawn, and «מישורים → ABCD → פאה בלבד» in
the panel; zero page errors.

## ADR-3D-198 — A ∥ / ⟂ THE FIGURE ALREADY IMPLIES SAYS SO (#850)

**Status:** accepted, 2026-08-31. Completes the operator's own follow-up to #833.

**The gap.** [#833](#adr-3d-193) fixed the honesty half: «AB מקביל למישור A'B'C'D'» on a cube was
REFUSED though true by construction, and now builds. It built **silently** — a ✓ and a drawn segment,
which reads as "something happened" when nothing did. Operator: *"this is maybe not build and say
that its already known? what do you think?"*

**How the verdict is reached — and the fork the operator settled.**

Two routes were put to them, with costs:

- **structural** — a per-solid-kind parallel-face rule. Cannot ever over-claim, because it never
  consults a drawn position; narrower (silent on ⟂, whose rightness `parallelepiped` complicates).
- **numeric, multi-sample** — check the relation holds across sampled configurations, reusing shipped
  machinery. Broader; but it is a *sampled* verdict, and [#827](#adr-3d-194) — fixed the same day —
  was exactly a sampled verdict being confidently wrong.

**A correction on the record:** the escalation that framed this claimed the structural route was
blocked because `prismBaseN()` omits `cube`/`box`. True but the wrong predicate — `faceIndices()`
puts base at `faces[0]` and top at `faces[1]` for **every** prism kind, cube and box included via its
final fallback. The structural route was far cheaper than stated. The operator was shown the
correction and **chose the numeric route anyway**.

**Decision — numeric, with the counterfactual made cheap and the #827 guard bolted on.**

The honest question is *would this hold if the student had not said it?*, and the **lowering already
answers it**: `seg-plane-rel` becomes a driving `scalarPin` while the figure has free dims, and a pure
claim once it does not. **A claim with no matching pin constrained nothing** — the figure was
determined by the other facts and this sentence only checked it. So the candidate set is exact and
free; no counterfactual re-derivation is needed.

The operator's numeric gate then confirms it, and `verifyClaim` already **is** that gate — it checks
`claimSeeds`, four configurations. On top of it, `relationHoldsInEveryBranch` walks
`pivot.pointRoots` (built for #827): seeds vary the GAUGE and never the BRANCH, so a two-branch
figure must satisfy the relation in **every admissible branch** before anything is claimed. That is
the concern raised against the numeric route, answered inside it.

**The plane is named as the STUDENT wrote it.** A `perp-plane` / `par-plane` claim stores three
points, because three fix a plane; reporting «A'B'C'» back would name internal state, which is the
honesty invariant's own counter-example. `statedPlaneName` recovers the full run from the figure — a
materialised point-run plane, else the solid FACE those three points open.

**What is never reported:** a relation that DROVE the figure (it is information, not a consequence —
the distinction the whole notice rests on), and a false relation, which still refuses with
`claim-refuted` exactly as #833 left it.

**Perf:** the branch walk is gated behind a candidate claim existing, and `derive3` passes the sample
it had already computed — no extra solve on the hot path.

**Locks** (`src3d/__tests__/issue-850.test.ts`, 9 tests): the operator's sentence builds AND reports;
the plane's stated name; the ⟂ twin; anchored and un-anchored alike; seed-invariance at 0/1/3/17/42;
a driving relation reports nothing; a false relation still refuses; a bare figure reports nothing.

**Note on the family.** This is the fourth "true, and already known" channel (#612 `shape-redundant`,
#396 `redundant-relation`, #842 `containment-redundant`, this). They should converge on one channel
with a per-relation entailment test; filed as **#853** rather than done here, since converging them
is a refactor with no user-visible change and belongs in its own pass.

## ADR-3D-199 — «אלכסוני הבסיס» DRAWS; the point-free arm of an existing construct (#834)

**Context.** Two unrelated prod users, the same lesson, 2026-08-23, on a square pyramid:

```
פירמידה ישרה מרובעת            ✓ solid, concyclic
אלכסוני הבסיס נפגשים בנקודה O  ✓ diag-intersection      ← the construct EXISTS
אלכסוני הבסיס                  ✗ not-handled            ← just DRAW them
הוסף אלכסוני בסיס              ✗ not-handled            ← both users typed this exact line
```

Both refusals escalated to the paid LLM, which built something for one user and failed the other.

**Diagnosis (docs/17 class-first).** Not a missing construct — a **missing ARM of an existing one**. The
base carrier and the diagonal pair both existed and were reachable *only* through the form that names the
crossing: `diagIntersection` requires an intersection verb (`מפגש|נפגש|נחתכ|חיתוך|intersect|meet`), so a
sentence that merely names the diagonals fell past it into `not-handled`.

**Decision.** A `quad-diagonals` command — the point-free twin of `diag-intersection`, same `face`
convention (`[]` = the "the base" sentinel) — lowered to the two diagonal segments and **no point**. Not
minting a crossing is the whole difference: the student named none, and inventing one would put a label on
the figure they never wrote (ADR-052).

**The ruling routes through the existing chokepoint, it does not re-decide.** The operator's ruling —
*"diagonals of base should relate to the bottom base of a shape"* — was **already implemented**: `face: []`
resolves to `c.solids[0].faces[0]`, and `faceIndices()` keeps the base ring first for every solid kind. So
the constraint on this change is that it must reach that same resolution rather than compute a base of its
own. The sentinel logic is now a shared helper, `resolveQuadRing`, called by both commands — a second
resolver is exactly how the two forms would drift apart, and a prism has two candidate rings, so the top
one must never be picked by an independent guess.

**Refusals that stay refusals.** Two solids present ⇒ `unknown-plane: base` — which base is meant is the
student's to say (ADR-052), never a silent pick; naming the ring («אלכסוני EFGH») resolves it. A
non-quad base ⇒ `no-solution` — a triangle has no diagonals, and that is said rather than silently skipped.

**Ownership.** `diagIntersection` is registered first and keeps every sentence with an intersection verb;
this rule additionally declines those explicitly, so ownership does not rest on registry order alone.

**The imperative is tolerated, not ruled on.** «הוסף אלכסוני בסיס» builds, because the neighbouring height
rule already tolerates a leading «שרטטו/ציירו/העבירו» via its `IMP` fragment and consistency beats a
local exception. [ADR-W-030](06w-decisions-workspace.md) (#778) re-decides imperatives for every rule at
once — *state the given, don't command the tool* — and when it lands this fragment goes with the rest.

**Out of scope.** The users' fuller line «קובייה ABCD **עם** אלכסון ראשי» is the shape-plus-construct
family (#461), and «אלכסון ראשי» itself is #836. Neither is touched here.

**Locks.** `src3d/__tests__/issue-834-base-diagonals.test.ts` (15 tests): all four point-free spellings
lower to `quad-diagonals` with the sentinel; «אלכסוני ABCD» names its ring; the crossing form still
belongs to `diagIntersection` and the singular «אלכסון AC'» is still a segment; the diagonals are AC and
BD of the BOTTOM ring on pyramid, prism and box (the prism's top ring being the trap); no point is minted;
re-issuing is idempotent; and both refusals hold.
## ADR-3D-200 — «אלכסון ראשי» NAMES NONE OF FOUR: THE ROLE PHRASE ASKS (#836)

**Context.** Prod session `u1y60bg6` — the user's entire session was one line:

```
קובייה ABCD עם אלכסון ראשי   ✗ not-handled → escalated → the LLM built it
```

A cube or box has **four** space diagonals — AC', BD', CA', DB' — so «אלכסון ראשי» names none of them.
The LLM answered by *picking one*. That is exactly the invented given [ADR-052](06-decisions.md#adr-052)
forbids: the student never said which.

**Operator ruling (2026-08-31).** *"there is more than one אלכסון ראשי so we should ask user to indicate
the letters."*

**Decision.**

- **The role phrase used as a REFERENCE returns a clarify**, `ambiguous-main-diagonal` — a typed refusal,
  never `not-handled`. This is the #516 lesson applied again: `not-handled` is the lane that escalates to
  the LLM, *whose job is to guess*, so **a refusal implemented as a decline is not a refusal**. The rule
  follows the existing `PARAM_CONFLATED` pattern — it records the ambiguity and declines, and `parse3`
  turns the flag into the refusal after the loop, so a later rule may still legitimately own the line.
- **The candidates are named, and DERIVED.** `spaceDiagonals(faces)` reads the solid's own rings: base
  ring `faces[0]`, the opposite ring being the other face of the same size sharing no vertex, and the
  diagonal joining `base[i]` to `top[(i + n/2) % n]`. So a box, a cube and a quad prism all answer from
  one rule, and no cube-shaped list exists to fall out of date. A **pyramid** correctly yields none (its
  apex is adjacent to every base vertex), and an **odd** prism yields none rather than rounding to a
  near-miss and calling it "the main diagonal".
  Naming them is the half that makes the refusal useful: a bare *"which diagonal?"* leaves a student who
  does not know the prime convention no better off.
- **Where the candidates are computed matters.** `parse3` is **context-free by design** — it takes a
  string and nothing else — so it cannot know the figure. The store, which owns the construction, turns
  the parser's typed refusal into the message's candidate list. The parser says *"this is ambiguous"*;
  the layer that can see the figure says *"…and here are the four."*
- **With letters it simply builds — through the EXISTING family rule.** «אלכסון ראשי AC'» is «אלכסון AC'»
  plus a redundant word, so the ROLE qualifier joined `bareSegment`'s own alternation beside the SOLID
  qualifier (#449: «אלכסון תיבה AC'», "space diagonal AC'"). One rule, one lowering — not a parallel path.

  **A first attempt did more and was wrong.** It emitted a `spaceDiagonal` flag so apply could verify the
  pair really is a space diagonal and refuse by name otherwise — the issue asks for that too. It broke
  #449's lock, which pins the exact command for "main diagonal AC'", and the conflict exposed that the
  issue asks for two incompatible things: *"must lower exactly as «אלכסון AC'» does"* and *"verify the
  named pair really is a space diagonal"*. #449 is operator-approved and locked, so **"lowers exactly as"
  wins**, and the validation is not smuggled in beside it. The gap is real and is filed separately: the
  whole qualified family — «אלכסון תיבה AC'», "space diagonal AC'", now «אלכסון ראשי AC'» — accepts any
  pair without checking the claim, so a face diagonal offered to any of them draws silently. Fixing that
  is one decision about the family, not a side effect of this issue — filed as #859 (needs-operator).

**Deliberately NOT touched — the declaration form.** «תיבה מלבנית עם אלכסון תיבה» (#438, two prod users)
keeps building. There the student *declares a figure* and asks for **a** space diagonal indefinitely, and
#438's lock is geometric on purpose — any of the four satisfies the box identity — because none is meant
in particular. This ADR governs a **definite reference** to *the* main diagonal, which is the case that
cannot be answered without asking. The two are different statements that happen to share a noun.

**Out of scope.** The user's full line «קובייה ABCD **עם** אלכסון ראשי» additionally needs the
shape-plus-construct family (#461) and resolves through both once that lands. This ADR covers the
diagonal reference itself.

**No catalog entry.** The clarify message is the teaching surface here, and it names the candidates from
the *student's own figure* — strictly better than a static catalog line that must guess at the lettering.

**Locks.** `src3d/__tests__/issue-836-main-diagonal.test.ts` (16 tests): all four role spellings (He + En)
return `ambiguous-main-diagonal` and never `not-handled`; the derivation yields a box's four pairs, a
pyramid's none and an odd prism's none, and is checked against a solid the parser actually built (none of
its pairs lies on a face); «אלכסון ראשי AC'» lowers to byte-identical commands to «אלכסון AC'» and draws
on a real cube; **the four #449 siblings are asserted byte-identical to before**, so the family rule is
provably extended rather than rewritten; and the three #438 declaration forms are asserted unchanged.
## ADR-3D-202 — THE DECLARED-VS-LOWERED SWEEP: ONE HOLLOW ROW, AND A RATCHET THAT KEEPS IT HONEST (#845)

**Context.** #833 was a ∥-to-plane statement, true by construction, refused `no-solution`. The part worth
generalising was **how it stayed invisible**: `relationTable` declared

```ts
'parallel|segment|plane-run': { status: 'supported', actions: ['drive-dims', 'claim'], … }
```

`claim` was listed; nothing implemented it. The table is the product's own statement of what it can do —
it drives coverage reasoning and reads as authoritative — and nothing forced a declared action to
correspond to code. That is the **mirror-drift** shape (#35 / #501 / #829): *a contract enforced by an
enumerated list rather than a derived one*, and it had produced a student-visible false negative.

**What the sweep actually found — and what the codebase already had.** `relation-battery.test.ts` is
stronger than the issue assumed: it already carries an honesty ratchet, asserting every `supported` cell
is either exercised end-to-end or parked in `BATTERY_PENDING` with a cited reason. So "supported" cannot
mean "nobody ever ran it". **The gap is one level in:** a pending cell says *"covered by a suite over
there"*, and nobody re-checks that claim.

So the sweep drove all **13 pending cells** through the real `submit` path. **12 are reachable. One is
not:**

`angle|segment|vector` — declared `['drive-dims','claim']`, note *"cos-angle with value (V8-f)"* —
is `not-understood` in five phrasings (both `קוסינוס … הוקטורים` operand orders, `קוסינוס … לבין`, and
both degree forms). Two facts pin it as the #833 class rather than a parser wish: its **⟂ twin over the
identical operand kinds** («AB מאונך ל-v») builds, so the mixed segment×vector seam is fine; and **both
single-kind angle cells** build. The table advertises a capability that exists on either side of it and
not in between. Filed as **#862**.

**A finding about sweeps themselves, worth more than the hole.** The sweep's first pass reported *four*
holes. All four were bad probe phrasing — `ל-` where the catalog writes `לבין`, degrees where the V8-f
lane wants `קוסינוס`. A sweep that authors its own utterances measures the author's memory of the grammar
as much as the grammar. Every probe in the locked sweep is therefore cross-checked against `catalog3.ts`
or the suite the table's own note cites, and that discipline is recorded here because the next sweep will
face it too: **an unreachable-looking cell is a bad probe until the canonical phrasing is confirmed.**

**Decision — the sweep is locked, and its finding is a RATCHET.**
`src3d/__tests__/issue-845-reltable-sweep.test.ts` exercises the 12 reachable pending cells, and keeps
`angle|segment|vector` in a `KNOWN_UNREACHABLE` list whose own test asserts the cell is **still**
unreachable in all five phrasings. If someone makes it work, that test fails and the entry must be
deleted — the list cannot quietly outlive the defect it records. A separate test pins the diagnosis by
asserting the ⟂ twin over the same operand kinds still builds.

**Deliberately NOT done here — step 2.** The issue's second half ("make it structural — derive the
supported set from the lowerings") is not attempted. The measured yield is **one** hollow row out of 70
supported cells, so the case for a derivation mechanism rests on one member; and the round that ran this
sweep was scoped to the sweep, with holes filed rather than fixed. The honest sizing the issue asked for
is now available: step 2 buys one known defect plus insurance, and should be judged on that.

**Sibling check (ADR-W-004).** 2-D has no `relationTable`; `src/parser/catalog.ts` is the analogous
authoritative-by-reading surface, and it is already re-parsed by its own guard (every catalog entry must
parse), which is the same property this sweep just established for the 3-D table's pending cells. The
class is present in 2-D only if a catalog entry can parse while its ACTION is unimplemented — not
examined here, and worth its own pass rather than an assertion.

**Locks.** `src3d/__tests__/issue-845-reltable-sweep.test.ts` (14 tests).

## ADR-3D-201 — A DECLARATIVE NOUN PREFIX IS NORMALISED ONCE, AT THE SEAM (#837)

**Context.** Prod sessions `fwynr5ws` + `8p8o74z2` (log-triage 2026-08-30, one user, six refusals across
two sessions on the same prism exercise):

```
AA'=(k-1, k-7, k+1)                            ✓ inject-pair
ישר AA'=(k-1,k-7, k+1)                         ✗ not-handled
משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)    ✓ line3, on-line, on-line
AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)            ✗ not-handled
ישר AC x=(8,-1,-1)+t(k+1,0,k-3)                ✓ line3, on-line, on-line   (#815)
```

**The cost, from the session itself:** five consecutive refusals, then the student **solved for `k` by
hand** and typed `t(3,0,-1)` to get past the tool. They finished with a figure that no longer carries the
symbolic parameter the exercise is about. So the acceptance here is not "the line parses" — it is *the
symbol survives*.

**Diagnosis.** A declarative noun prefix on a statement the grammar already handles. «ישר AA'=…» and
«AC על הישר …» are ordinary textbook noun phrases naming exactly the statement the bare form makes; the
prefix carries no extra given, and the rules match on the statement's shape, so the prefix pushes the
input off every one of them.

The signature is the **asymmetry**: `ישר AC x=…` parses while `ישר AA'=…` does not. #815 added that
tolerance *at a rule*, so it covers whichever lane happened to be fixed. A sixth rule would repeat the
mistake in a new place.

**Decision — a rewrite table at the SEAM, applied only after every rule has declined.**

`NOUN_PREFIX_REWRITES` maps a non-canonical spelling onto the canonical statement and `parse3` re-reads
the line **once** (guarded against recursion):

- `ה?(ישר|קטע) <pair> = …` → `<pair> = …` — the object noun agrees with what the pair already is.
- `<pair> על ה?ישר <equation>` → `משוואת הישר <pair> היא <equation>` — a membership phrasing of the fact
  that lowering already produces, routed to it rather than duplicated.

**Why after the rule loop, and not in `normalize3`.** Reaching that point means nothing parsed, so a
rewrite can only turn a refusal into a parse — it can never alter a form that works today. Normalising
earlier would have put every existing spelling at risk to fix two that do not, and #815's rule-level
tolerance means some rules *expect* the prefix. The lock asserts the canonical forms still parse on the
first pass, so the seam is provably inert for them.

**The seam is deliberately narrow.** `וקטור` is **not** in the strip list: «וקטור AB = …» is a different
statement from «|AB| = …», and the `ambiguous-vector-length` guard exists to keep them apart. Stripping it
as decoration would erase a distinction the tool refuses to guess at. Likewise «ישר ℓ1» and «קטע AB»,
where the noun is the *subject* rather than a prefix, are untouched.

**Explicitly NOT #778.** [ADR-W-030](06w-decisions-workspace.md) governs IMPERATIVE wrappers — «הוסף»,
«שרטט», «סמן» — and its ruling is *state the given, don't command the tool*, i.e. teach them away. There
is no verb here and nothing is commanded; «ישר AA' = (k-1, k-7, k+1)» is how the statement appears in a
textbook, arguably more canonical than the bare form. The right answer is to **parse** it.

**Sibling check (ADR-W-004) — measured, and the class is NOT present in 2-D.** «הישר AB», «ישר AB»,
«הקטע AB», «קטע AB» and «הישר AB מקביל ל-CD» all already lower identically to their bare forms. The 2-D
grammar tolerates the determiner-style prefix wherever it was tried, so there is nothing to port.

**Locks.** `src3d/parser/__tests__/issue-837-noun-prefix.test.ts` (13 tests): six prefixed spellings are
asserted **byte-identical** to their canonical twins; both lanes are covered explicitly, with #815's
already-working lane asserted unchanged, so the asymmetry cannot return; the symbolic `k` survives in
both the injection (`symExprs` all in `k`) and the equation (two direction components parameter-bearing);
`וקטור` and the subject-noun forms are asserted untouched; and the canonical forms are asserted to parse
on the first pass, pinning the seam as inert for them.

## ADR-3D-203 — «אלכסון» IS A CLAIM, AND THE CLAIM IS CHECKED (#859)

**Context.** Found while implementing #836 and confirmed by the operator playing it: the diagonal noun
was **decoration**. On a cube, «אלכסון AB» drew an EDGE and called it a diagonal; «אלכסון ראשי AC» drew
a FACE diagonal and called it a main one. Both silent, both a green ✓.

This is a *silent-wrong-ink* class: nothing refuses, nothing errs, and the logs record a success. It
cannot surface through log triage — only reading the code or looking at the figure finds it. That is an
argument for fixing it, not for deferring it.

**Operator ruling (2026-09-01).**

> *"the term אלכסון should be sure to be a diagonal and this is true for all tools. if the word is used."*

They first proposed a mitigation — a message on **every** use of «אלכסון» asking for explicit nodes — and
withdrew it when shown what it would cost:

> *"correct - we should not do the אלכסון thing i proposed but we need to fix it correctly to support it"*

**Why the message was the wrong shape.** It would have fired on input that is already correct and undone
two features approved in the same round: «אלכסון AC» already names its nodes; «אלכסוני הבסיס» (#834) and
«אלכסון תיבה» (#438) deliberately take no letters; and «אלכסון ראשי» with no letters **already** asks,
naming all four candidates (#836, ADR-3D-200). The *asking* half was done. The missing half was the
opposite: when the letters ARE given, the tool has everything it needs to be sure and never looked.

**Decision — two claim levels, checked where the figure is known.**

| form | claim | refused when |
| --- | --- | --- |
| `אלכסון AC` · `diagonal AC` | `any` — face **or** space | the pair is an EDGE |
| `אלכסון ראשי/המרחב/תיבה/קובייה AC` · `space\|body\|main diagonal AC` | `space` — through the solid | the pair is a face diagonal **or** an edge |

The parser attaches the claim (`Segment3Command.diagonal`); **apply** checks it, because `parse3` is
context-free by design and cannot see the solid. `faceDiagonals()` joins `spaceDiagonals()` in
`baseShapes.ts`, both derived from the same rings so the two answers cannot disagree about what a face is.

`מנסרה` / `פירמידה` qualifiers deliberately yield `any`, not `space`: **a pyramid has no space diagonal**,
so demanding one would refuse the face diagonal the student legitimately drew.

**The guard is half the design.** The check fires only when there is a SINGLE solid and both letters
belong to it. With no solid, several solids, or a pair reaching a derived point, there is nothing to check
against — and *"I cannot tell"* must never become a refusal, or the figure loses ink it is entitled to.
Locked in three tests.

**Also fixed: the PAIR-FIRST order.** «AC אלכסון ראשי» — the spelling the operator actually typed — was
`not-handled`, while every other construct noun in this grammar reads either order. Normalised to the
noun-first form the family rule already owns, so there is one lowering for two word orders, and the claim
travels with it («AB אלכסון ראשי» is still refused).

**Supersedes half of [ADR-3D-200](#adr-3d-200).** That ADR concluded — correctly at the time — that in
«אלכסון ראשי AC'» *"the role word is redundant, not an error"*, and #836's lock asserted the role form
lowered **identically** to the bare one. Under this ruling the role word is **no longer redundant**: it
carries a strictly stronger claim (`space` vs `any`), so «אלכסון ראשי AC» refuses where «אלכסון AC»
builds. What survives from ADR-3D-200 is the part it was really defending — the role word does not change
*which* segment is named — and the lock now asserts exactly that, with the two claims asserted to differ.

Two other locks moved from `toEqual` to `toMatchObject` for the same reason (#449's sibling assertions).
That is not a weakening: what #449 defends is that a qualifier does not change WHICH segment is named,
and that is still pinned. What is deliberately no longer pinned is that the command has no other fields —
never the property #449 was defending, and pinning it would forbid ever enriching the lowering. The two
assertions on forms that make NO claim («קטע AB», a bare pair) stay exact `toEqual`, which is what proves
the claim is attached only where the word appears.

**Stated cost.** This changes the contract of `אלכסון <pair>` (#72 / #449), an operator-approved form that
today draws whatever pair it is given. Under the ruling that is precisely the intent — but a figure where
a student wrote «אלכסון AB» will now refuse where it used to draw. Recorded here rather than discovered
later.

**Sibling check (ADR-W-004).** The ruling says *"this is true for all tools"*. 2-D has no solids, so there
is no face-vs-space distinction to enforce; the analogous 2-D claim is «אלכסון» on a polygon, where the
same principle would mean refusing a pair that is a SIDE rather than a diagonal. Not examined here — it
wants its own pass against 2-D's own diagonal forms rather than an assertion from this one.

**Locks.** `src3d/__tests__/issue-859-diagonal-claim.test.ts` (22 tests): the derivations (a quad's two
crossing pairs, a triangle's none, edge/face/space classification); both refusals by name in Hebrew and
English with the right `kind`; five correct forms still building; «קטע AB» claiming nothing and so drawing
an edge freely; the pyramid staying at the weaker claim; all three guard cases; and the pair-first order
with its claim intact.

### ADR-3D-204 — a free RIDER's parameter is a pivot unknown, not a sample (#820)

**Symptom.** On the operator's bagrut pyramid, «SD מקביל למישור ACK» after «K על SB» refused
`givens-contradict` — the honesty invariant pointed the wrong way, naming the student's own correct
statements («המקצוע SA הוא גובה בפירמידה», «A(0,0,0)», …) as the conflict. The set is satisfiable:
`K = (0, 5/2, 3)`, the midpoint of SB, and the engine reaches that very point through the plane-first
spelling — «מישור π דרך A ו-C ומקביל ל-SD» + «K נקודת החיתוך של π עם SB» (#487/#819).

**Root cause, measured.** The relation lowers correctly: it lands as a `seg-par-plane` **scalarPin**, a
driving given, and reaches `solvePivot`. The pivot's unknown vector was `[gauge 7 | dims | coupled |
pinSyms]`. `K`'s parameter is in none of those lanes — the evaluator SAMPLES it
(`t-K-S-B`, 0.22…0.78) and the pivot then tries to satisfy the relation by moving the *figure*, which
four coordinate pins forbid. No solution, and `store3` blames the newest pin owner.

**The class — the M2 law, in the 3-D solver.**

> A stated relation drove the free carriers the solver happened to know about and was merely VERIFIED
> against the rest, so **satisfiability depended on which side of the relation held the free DOF.**

The free PLANE got its drive in #487 and the free LINE in #552; the rider never did. This is docs/17 M2
(iii) — routing is by semantics, and a given that constrains a DOF re-homes it — and it is why the
plane-carrier spelling of the same geometry succeeded while the rider spelling refused.

**Decision — a fourth unknown lane, with MEASURED membership.**

Unknowns become `[gauge 7 | dims | coupled | pinSyms | riderTs]`. A free on-segment rider (`t`
undefined) joins the lane, and the evaluator places it at the solved value through a `riderTOverride`
threaded beside the existing V8-c `symbolOverride`.

Three properties carry the design, and each is what keeps the lane from being a new source of defects:

1. **Membership is measured, never enumerated.** A rider joins only when moving it along its host
   actually changes a residual — one probe evaluation per rider, against the *live residual set*. A
   structural walk over the constraint families would be an enumeration to keep in sync
   (`src3d/CLAUDE.md`: *"an enumeration is not a rule"*, and every drift in this tree has had that
   shape); this cannot drift, because it *is* the residual set. A figure whose riders no given mentions
   keeps an empty lane and solves bit-identically to before — which is what pays for the lane's cost.
2. **An under-determined rider still varies with the seed.** Each included rider carries the `REG_SF`
   soft anchor at its seed sample, the mechanism `dims0`, the open pin symbols (#325) and the log-scale
   (#518) already use. A determining given overrides the 1e-4 pull; nothing else does. Without it a
   rider the lane admits but the residuals under-determine would park wherever LM's null-space left it —
   a default masquerading as knowledge (ADR-052).
3. **Off the host is not a solution.** «K על SB» is a given like any other, so a candidate with
   `t ∉ [0,1]` is rejected — folded into `degenerate`, which every acceptance site already consults,
   rather than added as a fourth check three call sites would have to remember.

Starts SPREAD the rider across its host (the sample, then 0.2 / 0.35 / … / 0.8) rather than jittering
around the sample: a relation's root in `t` sits anywhere in the segment and the sample's basin is not
privileged. The pool keeps every distinct rider root for the same reason it keeps every pin-symbol root
(#797/#827) — a configuration the pool does not carry is invisible to every honesty gate downstream.

**The sampled `t` now has ONE home.** `riderSampleT` (in `onSegmentRatio.ts`, with the rest of the
rider's arithmetic) is called by the evaluator that draws the point and by the solver that anchors it.
Two spellings of that key would put the anchor on a different configuration than the one drawn — a
disagreement no test would have named. `solve3` cannot import `evaluate` (the dependency runs the other
way), which is why it is not a private helper in the evaluator.

**The DOF cue follows the resolution, not a second opinion.** A rider the pivot drove is no longer
counted free by `freeDofCount3` — it reads `pivot.riderTs`, the resolution's own record of what it
solved. This is the ADR-3D-124 discipline that closed the ADR-052 conformance smell for free planes: the
count and the sampling share one source, so they cannot disagree. Measured on the reported figure the
cue now reads 0 → 1 → 0 across «…figure» / «K על SB» / the relation.

**Sibling check (ADR-W-004).** Not present in 2-D. There a point-on-object's parameter is a first-class
recruitable DOF — the stage-3 `recruitFreeDofs` ladder exists precisely to hand a constraint the free
parameter it needs (docs/LADDER stage 3). 3-D has no recruiter; its pivot's unknown set is fixed at call
time, which is why the same law needed a lane here and nothing there.

**Stated cost.** Figures that DO have a constraint-referenced free rider now solve a larger system and
take the anchored acceptance path (`ACCEPT` 1e-10 on primary residuals, the pin-symbol rule) and the
full-pool collection. Both are the treatment every other open unknown in this solver already gets. The
probe costs one residual evaluation per free rider on figures that reach the pivot at all.

**Locks.** `src3d/__tests__/issue-820-rider-drive.test.ts` — the operator's sequence landing K on the
midpoint (He + En); the plane-carrier spelling reaching the SAME K (the carrier mirror, which is the
claim of the fix); entry-order permutation with the pins after the relation (M2 law (i)); the DOF cue's
0 → 1 → 0; a relation no `t` satisfies still refusing («SB מקביל למישור ACK»); and an unmentioned rider
still sampled and seed-varying.

### ADR-3D-205 — an angle's ARM is an operand kind, not a spelling (#862)

**The hollow row.** `relationTable` declared `angle|segment|vector` **supported**, with actions
`['drive-dims', 'claim']` and the note *"cos-angle with value (V8-f)"*. **No utterance reached it.** Five
phrasings — both `קוסינוס … הוקטורים` orders, `קוסינוס … לבין`, and both degree forms — all returned
`not-understood`. It is the one hollow cell the [#845](https://github.com/dcodish/geo_builder/issues/845)
sweep found (ADR-3D-202), and it was left filed rather than fixed because that round was scoped to the
sweep.

**Root cause — the same enumeration, in two rules.** Nothing was missing from the engine. `cos-angle`
takes two `VecAtom`s and a `VecAtom` is `named | pair`, so the mixed relation was always representable;
the ⟂ twin over the identical operand kinds («AB מאונך ל-v») builds, and both single-kind angle cells
build. What was missing was a sentence, because each of the two VALUE-form angle rules spelled its own
operand shapes:

| rule | what it captured | what it therefore could not read |
| --- | --- | --- |
| `angleSegClaim` (degrees) | two hard-coded point-pair captures `([A-Z]…)([A-Z]…)` | any vector arm |
| `cosAngleGiven` (cosine) | two `[a-w]` letters | any segment arm |

So the mixed pair fell between them in **both** lanes. This is `src3d/CLAUDE.md`'s standing trap — *"an
enumeration is not a rule"* — and it is why the answer is a seam, not a sixth regex.

**Decision — every angle arm is read through the shared operand seam.**

`readOperand` / `readRelationSides` (ADR-3D-140, widened by #522) already classify a side by what the
token IS, strip an optional noun including the plural head form, and handle the conjoined frame. The
angle family now uses it, and a two-line `vecAtomOf` says which of the seam's kinds are *arms*:

- `segment` → `{ kind: 'pair' }`; `vector` → `{ kind: 'named' }`;
- **everything else → `null`**, so a line / plane / point arm declines and the rules that own those
  cells (`linePlaneAngle`, `angleBetweenPlanes`, `lineRelAngle`, `planeRelAngle`) keep them. The decline
  is the load-bearing half: widening a rule's reach is only safe if it still refuses its neighbours' work.

Three call sites converge on it — `angleSegClaim`, `cosAngleGiven`'s between-branch, and
`angleOperand3` (the between-form atom shared by the angle-EQUALITY rule, #337/ADR-3D-088), which had
its own singular-only noun list and so failed «הוקטורים AB ו-v» while the singular twin parsed.

**Two lowerings, chosen by the arms and never by the sentence.** `pair × pair` keeps the frozen
`angle-seg-eq` claim it has always produced — that cell does not move. Any **vector** arm lowers to
`cos-angle` at `cos(deg)`, which is the `angle|vector|vector` cell's own lowering, inherited rather than
re-invented; so «הזווית בין AB לבין v היא 60» and «קוסינוס הזווית בין AB לבין v הוא 1/2» produce the
same command, as one fact stated two ways should.

**Deviation from the issue's suggested seam, and why.** #862 proposed `readRelationSides` verbatim, the
migration ADR-3D-177 performed for the ⟂/∥ segment×plane cell. That is what happens — with a converter,
because `readRelationSides` yields `Operand3` while the angle commands carry `VecAtom`. Naming that
conversion (`vecAtomOf`) rather than inlining it is what lets the *same* two lines state which kinds are
arms for all three rules, instead of each one re-deciding.

**The ratchet did its job, and is now empty.** #845's `KNOWN_UNREACHABLE` entry asserted this cell was
*still* unreachable; making it work failed that test, exactly as designed, and forced the entry's
deletion. The cell moved into `PENDING_PROBES`, where it is checked like every other supported cell, and
the honesty test was rewritten to iterate the map rather than name one cell — so the next hollow row
inherits the same net without anyone rebuilding it. A new guard asserts a cell can never be both probed
and known-unreachable.

**Not converged: `perpOperand`.** The ⟂ family has its own private arm reader, and it is the same
private spelling one lane over. It is deliberately left alone: its cell **works** (that is #862's own
evidence that the mixed-operand seam is fine), so converging it would be refactoring a correct reader
inside a bug fix, and its callers pre-strip their nouns differently. Recorded here so the next pass at
the operand seam knows it is the remaining one.

**Catalog.** «הזווית בין AB לבין v היא 60» / «the angle between AB and v is 60» joins `catalog3.ts`
— the coverage map is where a student finds out the cell exists, and a capability absent from it is
advertised to no one.

**Gates.** Shadow-matrix WINNERS snapshot regenerated: **additions only** (the two new catalog rows, both
won by `angleSegClaim`), **no existing winner changed** — which is the property that snapshot defends.
The HARD allowlist gate passed unchanged.

**Locks.** `src3d/__tests__/issue-862-angle-mixed-arm.test.ts` (15 tests): all five reported frames plus
the two English mirrors building end-to-end; both operand orders reaching the relation; the degree and
cosine frames asserted to carry the SAME value; the exact command list for the mixed form (the pair arm
drawn, the vector arm not re-declared); the two neighbouring cells asserted byte-for-byte unchanged,
including the exam's noun-carrying wording; the line/plane arms still going to their owners; and the ⟂
twin unchanged. Plus the #845 sweep, now with the cell in the probe table.

### ADR-3D-206 — a free plane's pin list becomes a FIT over the stated distances (#528)

**The gap, left open deliberately by #508.** A stated distance from a known point pins a free plane's
OFFSET exactly (`d = −n·p ± value`, the sign a sampled branch). The NORMAL kept its two free DOFs, and a
SECOND distance therefore landed as a claim against a still-sampled normal — which #508's own class guard
turns into `plane-not-determined`:

```
פירמידה משולשת ABCD
מישור π2
המרחק בין A למישור π2 הוא 5    ✅ builds — pins the offset
המרחק בין B למישור π2 הוא 5    ❌ plane-not-determined
```

Refused honestly, never silently wrong — but the second given is **real information**: two equal
distances say the plane is parallel to AB or separates A and B symmetrically.

**The observation that makes it small.** With a unit normal, `n·pᵢ + d = σᵢ·vᵢ`. Subtracting the first
from the rest ELIMINATES `d` and leaves one **affine constraint on the normal** per extra point:

> `n̂·(pᵢ − p₀)/|pᵢ − p₀| = (σᵢvᵢ − σ₀v₀)/|pᵢ − p₀|`

— the same shape as every other orientation fact this resolver already honours. A ⟂ relation and a
member chord are this with the right-hand side **0**; #534's stated line-plane angle is this with
`cos(90° − β)`. So the pin LIST becomes a FIT, and `unitNormalsFor` solves all of them together:

| independent constraints | answer | sampled |
| --- | --- | --- |
| 2 or more | a line intersected with the unit sphere: 0, 1 or 2 discrete normals | 0 |
| exactly 1 | a CONE about the axis at that cosine — the spin is a genuine free DOF | 1 |
| none | nothing to say here; the caller keeps its own fully-sampled path | 2 |

**The side pattern is a discrete branch set**, exactly like #508's single sign: the 2^k patterns are
enumerated, the infeasible ones dropped (a demanded cosine outside [−1, 1] is a plane that does not
exist), and the seed picks among the survivors — ADR-052, so a branch the student did not state is
reachable by «show another configuration» and never silently chosen. The chosen pattern fixes the
OFFSET too, so the normal and the offset come out of one branch and cannot disagree about the side.

**Measured:** the reported sequence builds with both distances holding to 1e-6; the free-plane DOF reads
**3 → 2 → 1 → 0** across «מישור π2» / first distance / second / third, and a determined figure honours
all three exactly. The count is the resolution's own, so the cue and the sampler still cannot drift
(the ADR-3D-124 rule).

**Deliberate boundaries, so the blast radius is nil.** The fit engages only when two or more distances
name the plane, no member already pins the offset (a member's offset would come from a different branch
than the normal), and no parallel relation has pinned the normal outright. Every pre-existing figure
therefore takes the untouched path — which is what makes this a widening rather than a rewrite of a
delicate resolver. The pattern count is capped at 2^6.

**A stated limitation.** An unsatisfiable pair (A and B one apart, at distances 1 and 9) is refused
`plane-not-determined` — literally true, since no pattern pinned anything, and it is #508's honest guard
rather than an accusation. A message that named the CONTRADICTION would be better, and needs a new code
plus i18n; recorded here rather than smuggled in.

**Not taken.** #528 suggests doing this "together with the rest of the recorded-constraint sweep #508
called for (an angle to a plane, a membership of a LINE in a plane)". Those are separate widenings of the
same resolver and are left to their own slice; what they will find is that `unitNormalsFor` is already
the seam they need.

**Locks.** `src3d/__tests__/issue-528-plane-distance-fit.test.ts` (7 tests): the reported sequence in He
and En with both distances exact; the 3 → 2 → 1 → 0 DOF ladder; three distances all honoured; the
leftover spin varying across seeds while both givens hold at every one; #508's single-distance case
unchanged; and an unsatisfiable pair refusing rather than drawing a plane that misses a given.

### ADR-3D-208 — the input BOX takes its base direction from the content, like 2-D (#868)

**Reported** by the operator while playing PR #867: *"the bidi text is biting again on the input"*.

**Measured in a real browser**, the same string «D על AC» in each product's main input:

| product | `dir` attribute | resolved |
|---|---|---|
| 2-D | `rtl` | **rtl** — correct |
| 3-D | `auto` | **ltr** — left-aligned, wrong |

And the consequence that makes it a defect rather than a preference: the live preview **underneath** the
box laid the identical string out RTL. The box was contradicting the very thing the preview exists to
compensate for.

**Root cause.** `shell/frame/InputArea.tsx` exposes a `boxDir` prop whose own doc predicted this exactly:
*"dir='auto' keys off the first strong character, and «AB שווה …» would take an LTR base."* **Only 2-D
passed it.** 3-D passed `previewDir` and not `boxDir`, so its box fell back to `dir="auto"` — and «D על
AC» opens with a strong LTR `D`. Most 3-D sentences open with a point label, so most of them took an LTR
base.

`src-complex` omits it too, and there it is **correct**: the prop's doc says *"absent = auto (the
math-first products)"*, and a complex-numbers line genuinely is math-first. The gap was 3-D's alone — a
sentence product, like 2-D.

**This does not reopen a settled ruling.** [ADR-3D-184](#adr-3d-184) records the operator's 2026-08-10
ruling that *"the input box itself cannot be fixed: isolate characters inside an editable value corrupt
what the student typed and where their caret sits, and forcing `dir='ltr'` is what 2-D tried and REVERTED
(#118)"*. That forbids two specific things — injecting isolates into the editable value, and **forcing**
LTR. Setting the base direction **by content** is neither; it is the opposite of forcing LTR, and it is
what 2-D settled on *after* #118. The typed value stays raw and the preview is untouched.

**Decision.** 3-D passes `boxDir={(s) => textDir3(s)}` — the SAME function it already passes as
`previewDir`, so the box and the preview cannot disagree by construction rather than by discipline.

**Verified in the browser after the change:** «D על AC» → `rtl`, «OD חוצה זווית AOC» → `rtl`,
«AB = (1,2,3)» → `ltr`, and the box now renders the identical layout as its own preview.

**Locks.** `src3d/__tests__/bidi3.test.ts` (3 new): `boxDir` is passed at all; the box and the preview
resolve through the **same named function** (the property, so a future edit cannot split them); and
`textDir3` gives an RTL base to the reported string and its siblings while leaving a pure-math line LTR.
Asserted on the SOURCE, per the #559 precedent in the same file — the defect is the markup and this tree
has no DOM harness.

### ADR-3D-211 — a rename is a rewrite of HISTORY, reached from two entry points and one core (#578)

**Context.** 3-D had no rename of any kind. Operator, prod 2026-08-14: a pyramid-height foot came out `E`
when they wanted `O`, and unlike 2-D there was no way to change it — the whole figure had to be retyped.
2-D has had the mechanism since #539; this ports it. Operator ruling, 2026-08-14: *"if we get to click on
image and change letter in the same interface as the 2d tool has, that is fine. of course the command is
ok too"* — **both** entry points, sharing one core.

**Decision — the same shape 2-D chose, with this product's label grammar.**

A rename is **not a fact and not a command**. It rewrites the ordered fact list in place, so the figure
afterwards is byte-for-byte the figure the student would have had if they had typed the new letter from
the start. That is asserted directly in the lock (same coordinates, point for point), and it is what
keeps the fact list the single source of truth: a rename that appended a "now call E O" fact would make
every later replay depend on a naming event, and undo would have to unwind a name instead of a statement.

**Both halves of every fact are rewritten.** The utterance alone will not do: an LLM-committed `Fact3`
holds `cmds` its utterance never produced (the #305 lane), so re-parsing rewritten text would silently
build something else. The commands alone will not do either: the step row shows the utterance, and a row
still reading «SE גובה» after E became O is a lie about what the figure holds.

**`renameInCommand3` is a recursive STRUCTURAL walk, not a field list.** `Command3` operands nest —
`{kind:'segment',a,b}`, `{kind:'plane-run',ids:[…]}`, claim structures — and a command kind added later
must not quietly escape the rewrite: an enumeration is not a rule (`src3d/CLAUDE.md`). The LABEL GRAMMAR
decides what is an id, so lowercase `type`/`kind`/`rel` values and `π1`/`ℓ` names are untouched for free,
while a point-run plane's name (`"ABCD"`) is rewritten letter by letter — which is what keeps
`pointPlanes` addressable after the rename. `src`/`requested` are carved out as RAW SOURCE (2-D's `expr`
carve-out, same reason): an equation is echoed to the student verbatim and may legitimately hold a
capital that is not a point (#339).

**The PRIME is this product's own boundary problem.** 2-D's guard is `(?!\d)`, enough where a label is
`[A-Z]\d*`. Here `A` and `A'` are two different vertices of the same cube, so the token rule is: match a
whole label, refusing a following (or preceding) lowercase letter, digit or prime, while ALLOWING an
adjacent uppercase — because that is exactly what a run like `ABCD` is. Locked in both directions.

**Two entry points, one action.** The text command («שנה שם E ל-O» / "rename E to O", both verbs, both
languages, primes) is intercepted in the store's `submit` **before** `parse3` — that is where the fact
list lives, and putting it there means the scenario harness and any future caller get it too. The canvas
popover is 2-D's FR-RN-10 ported onto the #483 hit-target pattern (transparent ring, `stopPropagation`
so the click never reaches the orbit drag), and it calls the SAME `rename` action, so the two cannot
drift into two behaviours. The lock asserts they produce identical fact lists.

**A refusal is TYPED, never `not-understood`.** `rename-refused` carries its reason and both letters.
This matters beyond politeness: App3 escalates `not-understood` to the paid LLM lane, so a rename we
understood and declined would buy a guess at a question already answered. `target-taken` is a refusal
rather than a merge — fusing two of the student's vertices is a different operation (2-D's ADR-122
territory) and nobody asked for it.

**The session state around the figure follows the facts.** `queries` («|AB|») and `planeDisplay` (keyed
by the point RUN, «ABCD») are rewritten in the same action. Skipping them would leave a display toggle
addressing a plane that no longer exists and a data-panel row asking about a vanished point — the figure
right, the session around it stale.

**The seed is deliberately untouched.** A letter is a name, not a configuration: the drawing must not
jump because a vertex was re-lettered. This is the stability rule, applied to naming.

**Discoverability — the catalog carries it.** 2-D leaves rename out of its catalog, and that is how this
issue came to be filed: the operator could not find a feature 2-D already had. The 3-D catalog is the
coverage map AND the in-app commands panel, so the two rename forms are listed. The guard test now asks
the honest question — *does the DETERMINISTIC LANE understand this line?* (`parse3` **or**
`parseRename3`) — rather than carrying an exception list, so a catalog entry can never be listed for a
lane that would not in fact read it.

**Locks.** `src3d/__tests__/issue-578-rename.test.ts` (20): the operator's figure end to end; the
rewritten-history property against a natively-typed twin; primes in both directions; the plane-run name
and the nested claim operand following; English and both Hebrew verbs; typed refusals committing nothing;
no fact appended; the seed unmoved; one-step undo; queries + planeDisplay following; the canvas action
and the text command producing identical facts; the token boundary; and the grammar's declines.
