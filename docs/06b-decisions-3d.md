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

