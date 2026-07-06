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
