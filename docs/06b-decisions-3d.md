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
