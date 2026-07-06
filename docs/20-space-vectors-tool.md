# 20 — Space/vectors tool (3-D): the detailed plan

_Drafted 2026-07-06 on operator request: "a detailed plan for the 3-D space solution (vectors — regular + algebraic), a separate URL and functionality that supports the type of questions a bagrut has, with good 3-D rendering." This realises the "third tool" parked in [19-analytic-geometry-tool.md](19-analytic-geometry-tool.md) §7. Grounded in a fresh corpus reading (four 572 exams, §2), the official curriculum + formula sheet (§3), and a chassis inventory of the existing repo (§7). Status: **ACCEPTED, decision-complete — D1–D5 resolved by the operator (2026-07-06, §10). V0 + V1 BUILT same day ([ADR-3D-001](06b-decisions-3d.md#adr-3d-001), [ADR-3D-002](06b-decisions-3d.md#adr-3d-002) — gates met: orbitable textbook solids; 2020-Q2 א–ב + 2023-Q2 א–ב reproduce end-to-end with claims verified, wrong answers refused); ⟵ RESUME with V2 (algebraic lane, gate 2022-Q2).**_

The existing tool (Geo Builder, `/geo-builder`) is **synthetic plane** geometry. The analytic tool (doc 19) is **coordinate plane** geometry. This is the third: **space** — vectors in the geometric approach (וקטורים בגישה גאומטרית: arrows on a solid, a named basis, dot products) and the algebraic approach (R³ coordinates, parametric lines, plane equations, angles and distances), plus the solids they live on. Same charter as the sibling tools: **the student types the givens, the tool reproduces the figure and verifies claims — it never solves the exam question.**

---

## 1. Positioning — a separate URL, a sibling in this repo

A **separate app at its own URL** — **`themathbible.com/3d-builder/`** (D1, resolved) — a **sibling in this same repo**: shared `node_modules`, one test suite, shared chassis code (store pattern, parser rule-pipeline, i18n/RTL, LLM-proxy handler, debug log, analytics), its **own entry + build config + deploy directory** on themathbible.com. The student picks the tool by topic — these are different bagrut questions (Q1 analytic vs **Q2 vectors/space** in פרק ראשון of שאלון 572/582).

Why a separate tool and not a mode: the center of gravity — a 3-D engine, a symbolic vector layer, an equation layer, and a 3-D renderer — shares almost no *content* with the 2-D engine (see the reuse table, §7). What transfers is the **architecture**, which transfers almost entirely.

## 2. Corpus reading — what a bagrut Q2 actually is

Sampled 572 exams (שאלון 035582, פרק ראשון; the vectors question is **Q2** in all four): 2024 חורף, 2023 קיץ א, 2022 חורף, 2020 קיץ.

| Exam | Setup (what the student is GIVEN) | The asks | Lane |
|---|---|---|---|
| **2024 חורף** | Line `x=(−1,5,−11)+t(m−1,5−m,−2)` + plane `3x+my+(m+6)z+4=0`, parameter `m` in **both** | show ℓ∦π for every m; ℓ⊥π pins m; find the cut point A; true/false: "exactly one plane contains ℓ and passes through (5,−5,−9)" (catch: the point is ON ℓ) | pure algebraic — no solid |
| **2022 חורף** | Planes `z−3=0`, `ay+z−8=0`, given angle between them 45° | pin a; `A(2,−2,6)` on one plane → **drop a perpendicular** to the other → foot B → |AB|; plane∩plane line ℓ (parametric form); perpendicular from B to ℓ → foot C; **area of △ABC** | pure algebraic, strongly *constructive chain* |
| **2020 קיץ** | Right triangular prism ABCA′B′C′ (figure printed); M mid B′C′; K on AA′ with `AK=2KA′`; **נסמן** `AA′→=w, KC→=v, KB→=u` | express `AM→` via u,v,w; `KP→=αu+βv` → find α,β; then coordinates injected (`v=(10,−5,0), u=(5,5,−5), P(0,4,6)`) → why P ∈ plane KBC; equation of plane KBC; coordinates of K | **mixed** — geometric first, coordinates injected mid-question |
| **2023 קיץ א** | Cube ABCDA′B′C′D′ (figure printed); `AB→=u, AD→=v, AA′→=w` | prove diagonal CA′ ⊥ plane BC′D (dot products); E = centroid of △BC′D → express `CE→`, prove E,C,A′ collinear; then coordinates injected (`A(3,n,p), C(4,3,0), D(0,0,0)`, **"z of C′ is positive"** — branch disambiguation!) → coords of A, C′; plane∩plane line ℓ (BC′D ∩ face BCC′B′); parametric form of a **plane** containing ℓ and not cutting the x-axis | **mixed** — same arc |

**The archetypes.** Two of four are purely algebraic (no solid at all); two are mixed, and both mixed ones follow the *identical* arc: **decompose over a named `u,v,w` basis on a solid → coordinates injected mid-question → analytic finish.** No sampled question is coordinate-free end-to-end.

**Recurring machinery** (the construct set the engine must own): named solid with lettered vertices (cube, right triangular prism) · point on segment by ratio / midpoint / centroid (מפגש התיכונים) · named basis vectors (`נסמן AB→=u…` — always exactly three) · vector-expression claims (`AM→ = …u + …v + …w`) · parametric line · plane by equation (incl. axis-parallel degenerate forms `z−3=0`) · **parameters inside coefficients** (m, a, n, p) pinned by a stated relation (⊥, angle=45°) · foot of perpendicular onto a plane / onto a line · line∩plane point · plane∩plane line · branch selection by a sign given ("שיעור ה-z חיובי") · metric asks (length, triangle area) · parametric form *of a plane* (2023 ה).

**Stable vocabulary** (for the parser): `וקטור`, `נסמן`, `הבע/הביעו באמצעות`, `סקלרים`, `מישור`, `משוואת המישור`, `הצגה פרמטרית`, `ישר החיתוך`, `ניצב/מאונך ל־`, `מקביל ל־`, `הזווית בין המישורים`, `הורידו/העבירו אנך`, `חותך אותו בנקודה`, `שיעורי הנקודה`, `אמצע הקטע`, `מפגש התיכונים`, `אלכסון`, `קובייה`, `תיבה`, `מנסרה ישרה`, `פירמידה`, `נמצאות על ישר אחד`, `מערכת צירים`, `ציר ה-x`.

## 3. Curriculum + formula-sheet scope (the contract)

From `תכני לימוד יב – 5 יחידות` (vectors = **50 hours**, the largest י"ב topic) and the official formula sheet (p. 4):

1. **Geometric vectors** (8h) — directed segments, equality, add/subtract/scalar-multiply, vector-space axioms; physical motivation (forces) is examinable.
2. **Linear dependence & uniqueness** (10h) — combinations; `a·AB→` spans the line; combos of two span the plane; uniqueness of representation → **segment-ratio proofs** (the classic geometric Q).
3. **Dot product** (8h) — `u·v=|u||v|cos α`; angles, lengths; vector proofs of space theorems (line⊥plane iff ⊥ two non-parallel lines in it; three-perpendiculars).
4. **Algebraic R³** (12h) — coordinates; ratio division; parametric line; plane **both** parametric and `ax+by+cz+d=0`; mutual positions; **all** the distances (point/line/plane/parallel/skew) and **all** the angles (line–line, line–plane, plane–plane).
5. **Solid-geometry applications** (12h) — spatial trig in cylinder/cone/sphere/prism/pyramid: angles, lengths, areas, volumes.

Formula sheet gives exactly: `|u|=√(u₁²+u₂²+u₃²)`, both dot-product forms, point–plane distance, parallel-planes distance, `sin β = |n·u|/(|n||u|)` (line–plane), `cos α = |n₁·n₂|/(|n₁||n₂|)` (plane–plane), and the solids volume/area formulas.

**Two consequences for design:** (a) **there is no cross product** in the curriculum or on the sheet — normals come from the equation form or from perpendicularity conditions, so the tool must never *display* a cross-product step (internally it may compute one); (b) projections/feet are *constructions*, not quoted formulas — exactly the constructive-chain shape the corpus shows.

## 4. The two lanes and the pivot

- **Lane G (geometric / "regular" vectors):** no coordinate system. Objects live on a solid; the figure has free dims (ADR-052 carries over verbatim: an unstated edge length/height is a free DOF). Vectors are **symbolic expressions over a named basis** `u,v,w`; claims (`AM→ = u + ½v − w`, `CA′ ⊥ plane BC′D`, collinearity) are verified.
- **Lane A (algebraic):** an absolute coordinate frame with drawn axes. Points are pinned coordinates, lines are parametric, planes are equations; parameters in coefficients are free DOFs pinned by stated relations; feet/intersections are derived points.
- **The pivot (mixed questions):** the figure starts gauge-free in Lane G, then coordinates arrive mid-session ("נתון: v=(10,−5,0)…"). Injection **pins the gauge**: the engine solves for the rigid placement (+ scale if unstated) of the existing solid so the named vectors/points take the stated coordinates, with any leftover parameter (`n, p`) staying symbolic until a later given pins it, and branch givens ("z of C′ positive") selecting among the discrete solutions. Both sampled mixed exams need exactly this, so **the pivot is a first-class engine feature, not an edge case.**

In R³ the gauge is 7-DOF (3 translate + 3 rotate + 1 scale); Lane G figures are drawn modulo this gauge (the DOF cue subtracts it, the ADR-101 idea transplanted), Lane A figures are gauge-pinned by their coordinates.

## 5. Product definition — what the student does, per ask type

Same charter: **reproduce & verify, never solve.** Concretely, per the corpus ask types:

| Exam ask | Tool behavior |
|---|---|
| "Express AM→ via u,v,w" | The student *types their answer* (`AM = u + ½v − w`); the tool verifies it against the figure (numerically across sampled free dims — a wrong coefficient fails some sample) and marks ✓/✗. It never prints the decomposition unprompted. |
| "Show ℓ ⊥ π / find m" | The student types the relation as a given (`הישר ניצב למישור`) → the engine **pins m** and redraws; or types `m=4` → verified as a check. Contradictions surface as over-constrained, as today. |
| "Find the cut point / foot / intersection line" | These are *constructions* the student states (`הורידו אנך מ-A למישור… חותך ב-B`); the tool builds them and shows coordinates/parametric form **as measure labels** the student can toggle — the figure IS the answer check. |
| "Prove E,C,A′ collinear / P ∈ plane KBC" | Stated as a claim → verified (green/amber), exactly the ADR-053 givens-verifier idiom. |
| "Length / area / angle" | Measure labels on demand (`הצג את AB`, `הצג את שטח ABC`), values live under orbit/resample. |
| "z of C′ positive" | A branch given → selects the configuration; "show another configuration" cycles the remaining free branches/dims only. |
| True/false structural claims (2024 ד) | Out of v1 scope as a *decided* verdict; the tool supports the *investigation* (the student can add "the point on ℓ?" as a membership check). |

Everything else transfers: fact list with enable/edit/delete, undo/redo, "show another configuration" (resample free dims + cycle branches), the verifier semantics (green = VERIFIED), save/load, image export, catalog/commands panel, bilingual RTL input.

## 6. Architecture

### 6.1 Engine — `src3d/engine` (new package, same philosophy)

- **Substrate:** `Vec3 {x,y,z}`; pure `geometry3.ts` (dot, norm, projections, line/plane intersections, point–line/plane distances, angle formulas — the formula-sheet list, closed-form).
- **Objects:** `Point3` (free / on-segment `t` / on-face / derived), `Segment3`, `Line3` (anchor+dir, parametric), `Plane3` (stored as normal+d, *presented* in whichever form the student gave), `Solid` — the named family **cube / box (תיבה) / right prism over a given base / right pyramid / parallelepiped** as parametrized constructs whose unstated dims are free DOFs (this is the polygon-family idiom, not the banned template-matcher: solids are *constructs with DOFs*, not matched templates). Cylinder/cone/sphere are D4.
- **Derived points:** midpoint, ratio point (`AK=2KA′`), centroid, foot-on-plane, foot-on-line, line∩plane, plane∩plane→`Line3`, segment∩plane. All closed-form, 0-DOF, branch-indexed where multivalued.
- **Constraints:** ⊥/∥ (line–line/line–plane/plane–plane), angle equals, distance/length equals, membership (point on line/plane), collinear, coplanar — each `driveOrCheck`: drives a free DOF (a solid dim, an on-segment `t`, **or a symbolic coefficient parameter**) when one is available, verifies when determined. The good news from the corpus: 3-D bagrut constructions are far more *deterministic* than plane-geometry ones — mostly closed-form chains plus a 1–2-DOF root find, nothing like the 2-D constraint soup, so `solveParam`-class machinery suffices; no freeze-and-co-drive port needed for v1.
- **Symbolic parameters:** `m` appearing in a direction vector AND plane coefficients is one shared free scalar DOF; a relation pins it (root-find over the closed-form residual); multiple roots = branches ("two possible values of a" in 2022 is literally `branchCount=2`).
- **Evaluate/replay/verify:** the topological evaluate, ordered-fact replay, stability rule (adding a fact never perturbs prior choices), over-constraint honesty, and the givens verifier all transplant as patterns.

### 6.2 The symbolic vector layer (new core #1) — "linear algebra lite", NOT a CAS

Represents a vector as a **rational-coefficient linear combination over named atoms** (`AM→ = 1·w + ½v` where atoms are the declared basis u,v,w — corpus shows always exactly 3). Operations: add/scale/normalize-to-basis; **dot products expand bilinearly over a Gram matrix** `G[i][j] = uᵢ·uⱼ` derived from the solid (cube: G diagonal; prism: from its dims/angles — entries may be symbolic in free dims). That is enough to *verify* every geometric-lane ask in the corpus: decomposition claims (compare canonical coefficient triples), ⊥-to-plane (dot with two independent in-plane vectors ≡ 0 across samples), collinearity (proportional coefficient triples), ratio claims. **Verification is numeric-first** (evaluate the expression at sampled free dims; exactness to tolerance across the samples), with the symbolic form used for *display and echo*, never for open-ended symbolic solving. **Explicit non-goal: no general CAS, no symbolic equation solving beyond 1–2-DOF numeric root-finds.** (This is the same "small heart, hard boundary" call as doc 19 §6's option (a).)

### 6.3 The equation layer (new core #2)

Parse and pretty-print: parametric line `x=(a,b,c)+t(d,e,f)`, plane `ax+by+cz+d=0` (incl. degenerate/axis-parallel and parameterised coefficients `(m+6)z`), parametric plane (2023 ה), point tuples `(2,−2,6)` incl. symbolic components `(3,n,p)`. Internally everything normalises to anchor+dir / normal+d; the *given form is remembered* so echo/labels match the student's textbook form. Far smaller than doc 19's conic CAS — these are linear objects only.

### 6.4 Rendering (new core #3) — "good 3-D rendering" = textbook-grade wireframe you can orbit (D2)

The recommendation: a **custom SVG projection renderer**, not a WebGL scene-graph library. Reasoning:

- What a bagrut figure looks like — and what the student must match — is the **textbook wireframe**: solid visible edges, **dashed hidden edges**, translucent plane patches, vertex labels with primes, right-angle marks at feet, angle arcs at plane–line angles. That is a *hidden-line-style* rendering, which WebGL libraries do **not** give for free (three.js dashes and occlusion-based hidden-line edges are custom work anyway), while shaded/lit solids — the thing three.js IS good at — is not the target look.
- Scenes are tiny (≤ ~20 vertices, ≤ ~15 faces). A pure pipeline `scene3.ts: Construction + positions + camera → 2-D primitives` (project → classify each edge visible/hidden against the solid faces → split at occlusion boundaries → emit styled polylines/patches/labels) re-runs at 60 fps trivially, so **orbit-by-drag is fully interactive**.
- It preserves everything the 2-D renderer's craft bought: DOM-free unit tests (`react-dom/server`, no jsdom/WebGL context), the pure scene-builder / dumb-React-SVG-map split, crisp text + RTL labels, the label-placement pass, PNG export via the existing SVG path, zero new heavy dependency (three.js + controls ≈ 600 KB).
- **Camera:** orthographic (textbook look) with the classic ¾ view as the home orientation; orbit (drag), zoom, reset — replacing 2-D pan/zoom. The fit-with-hysteresis idea (F4 stability) applies to the projected points unchanged. "Show another configuration" resamples the figure; **orbit is a camera concern and never changes the figure** — two clearly separated controls.
- The renderer stays **swappable** (the scene-builder emits primitives, exactly like today), so a WebGL "solid view" toggle can be added later without touching the engine — but it is explicitly out of v1.

Axes rendering (Lane A): the three axes with arrowheads + labels, drawn behind the figure; grid deliberately omitted (bagrut space figures don't use one).

### 6.5 Parser & input — new grammar on the transplanted rule pipeline

The `Rule`-list architecture, first-match-wins, `'stop'` half-parse guard, `ParseContext` figure hints, catalog coverage map, and LLM fallback transplant as-is. New content:

- **Tokens:** the point token grows **primes** (`A′`, accepting keyboard `A'`, normalised to one form); **lowercase single letters are vector names** (`u,v,w` — disjoint from point tokens by case, so no ambiguity); vector arrow notation accepted and optional (`וקטור AB`, `AB→`, plain `AB` inside a vector-context rule).
- **Symbol palette additions:** `′`, `→` (vector arrow), `( , , )` tuple scaffold, `x=…+t(…)` line scaffold, `ax+by+cz+d=0` plane scaffold — same UX as the existing `∠`/`△`/`S_{}` buttons.
- **Rule families:** solids (`קובייה ABCDA′B′C′D′`, `תיבה`, `מנסרה ישרה משולשת`, `פירמידה`); basis naming (`נסמן: AB=u, AD=v, AA′=w`); ratio/midpoint/centroid points; vector-expression claims (`AM = u + ½v − w`, `KP = αu + βv` with Greek scalars); equations (line/plane/point tuples, parameterised); relations (⊥/∥/angle-between/membership); the constructive verbs (`הורידו אנך…חותך ב־`, `ישר החיתוך בין…`); measure asks (`הצג את |AB|`, area, angle, distance point–plane); branch givens (`שיעור ה-z של C′ חיובי`). Freeform escalates to the shared LLM proxy with a space-tool system prompt.

### 6.6 App shell, URL, deploy (D1)

Same repo, **second Vite entry**: `space.html` + `src3d/` (shared `src/` chassis modules extracted as needed), a second build config (or env-switched `base`) producing its own dist deployed to `httpdocs/3d-builder/` → **`themathbible.com/3d-builder/`**. The LLM fallback reuses the standalone proxy process with a path-keyed system prompt (`/3d-builder/api/parse` — one more Plesk `ProxyPass` line, stored in Plesk's additional-directives field per the workspace CLAUDE.md gotcha). Debug log + analytics (`__BUILD__`) reused with a tool tag. The App shell is a rewrite-following-the-template of `App.tsx` (that file is 1,835 lines of 2-D-typed code; the layout, fact-list UX, palette, panels are the template — and the rewrite is a chance to extract the shared shell components both apps use).

## 7. Reuse table (from the chassis inventory)

| Chassis piece | Verdict |
|---|---|
| Store (`Fact[]` source of truth, replay, zundo, enabled/status, verifier violations, save/load-as-replay-inputs) | **Pattern, near-verbatim skeleton** — swap the engine import |
| Parser rule pipeline + catalog + clarifications + LLM fallback client | **Pattern, transplants directly** — 100% new rule content |
| LLM proxy (`server/parseHandler.ts` + standalone) | **Verbatim structure** — second prompt + path |
| i18n/RTL, Modal, debug-log proxy, analytics stamp, fixtures-net idea | **Verbatim** |
| `transform.ts` / `scene.ts` / `Figure.tsx` | **2-D-coupled; the split (pure scene-builder → dumb SVG map) and fit-hysteresis transfer as concepts** into the new projection pipeline |
| `src/engine/*` | **Not reused** — new `Vec3` substrate; and deliberately *less* solver machinery than 2-D needed |
| Test strategy (scenario tests from operator sessions, corpus gates, stability regression, definition-of-ready) | **Verbatim as doctrine** — incl. docs/17 design rules |

## 8. Phased build plan (gates in the 09-plan style; each gate = tests green + build clean)

- **V0 — walking skeleton. ✅ BUILT (2026-07-06, [ADR-3D-001](06b-decisions-3d.md#adr-3d-001)).** Second entry/build/URL; `Vec3` core + cube/box/prism constructs with free dims; SVG projection renderer with orbit + labels + **dashed hidden edges on convex solids**; store clone; parser rules for solids + midpoint/ratio points. **Gate:** type `קובייה ABCDA′B′C′D′` → a textbook-grade orbitable cube; prism likewise; stability + resample of free dims work; DOM-free render tests green. **Gate met** — 46 src3d tests, `tsc -b` + `build` + `build:3d` clean; pyramid deliberately deferred (its "right" default needs the ADR-052 treatment).
- **V1 — Lane G (geometric vectors). ✅ BUILT (2026-07-06, [ADR-3D-002](06b-decisions-3d.md#adr-3d-002)).** Basis naming (`נסמן`), the symbolic layer (§6.2) + Gram matrices from solids, vector-expression claims verified, ⊥/collinearity/membership claims, centroid. **Gate:** 2020-Q2 א–ב and 2023-Q2 א–ב reproduce end-to-end as typed utterance sequences (scenario tests). **Gate met** — both sequences He+En through the real submit path; claims verified across 4 seeded configurations, wrong answers refused; the span point solved closed-form (no Gram machinery even needed — evaluated coordinates + one Cramer decomposition suffice); aux segments auto-draw and dash per the textbook interior rule.
- **V2 — Lane A (algebraic substrate).** Axes; coordinate points; parametric lines; planes by equation (+ translucent patch rendering with a sensible drawn extent); derived feet/intersections; measure labels (length, area, angle, distances). **Gate:** 2022-Q2's full constructive chain reproduces (angle-45° pins `a` with its two branches; foot B; line ℓ echoed in parametric form; foot C; △ABC area verifies).
- **V3 — parameters + branch givens.** Shared symbolic coefficients as free DOFs pinned by relations; sign/branch givens; the honesty rules (over-constrained, "no value of m satisfies…"). **Gate:** 2024-Q2 reproduces (m pinned by ⊥; cut point A shown; the ∦-for-every-m fact expressible as a probe).
- **V4 — the pivot.** Coordinate injection onto a gauge-free Lane-G figure (gauge solve + leftover symbolic components + branch selection). **Gate:** 2020-Q2 ג and 2023-Q2 ג–ה complete — **all four corpus questions reproduce end-to-end**, the doc-09 "Q1–Q7 reproduced" moment for this tool.
- **V5 — breadth + polish.** Catalog filled + example chips; save/load (`.geo3.json`, schema-versioned); image export; DOF cue (modulo the 7-DOF gauge); LLM fallback live behind the proxy; widen the corpus to ~10 more Q2s (806/807 papers incl. purely-geometric ratio-proof questions and skew-line distance) as scenario gates. **Gate:** the widened corpus green; deploy to `/space-builder/`.
- **V6 — solids-trig block (deferred but IN SCOPE, D4).** Cylinder/cone/sphere; spatial-trig measures (volumes, lateral areas, angle-in-solid asks) — the curriculum's block 5. Committed scope, not optional: it ships after V5, it just doesn't gate the v1 launch.

Doc-09 discipline applies: each phase lands with its ADRs, scenario tests for every operator-reported issue, and no phase is "ready" until its gate passes.

## 9. Validation corpus & testing

- Seed corpus = the four exams of §2 (add their printed figures to `docs/sample questions/space/`); V5 widens to ~10.
- Test pyramid as today: pure-engine unit tests hardest (geometry3 closed forms against hand-computed values; the symbolic layer against the corpus decompositions); renderer DOM-free (projection, hidden-edge classification — very unit-testable: assert edge X is dashed from camera C); scenario tests replaying typed He/En utterance sequences through the real parse→replay path; parser catalog guard (every supported example parses in both locales); stability regression first-class.
- A **differential oracle** in the ADR-109 style is *cheaper* here (closed-form chains → an independent recompute is straightforward) — plan it from V2, not as an afterthought.

## 10. Decisions — RESOLVED by the operator (2026-07-06)

- **D1 — name/URL: `themathbible.com/3d-builder/`.** Same repo, second entry, deploy dir `httpdocs/3d-builder/`. (Hebrew display name still open — suggestion **בונה מרחב**; pick during V0.)
- **D2 — rendering tech: custom SVG projection** (§6.4) — textbook wireframe, dashed hidden edges, orbit; renderer swappable; three.js shaded view explicitly deferred.
- **D3 — symbolic-layer boundary: NO CAS — the operator marked this as key.** Linear-combination + Gram-matrix "linear algebra lite," numeric-first verification (§6.2). This is a **hard boundary with operator authority**: any future feature that seems to need symbolic equation solving beyond 1–2-DOF numeric root-finds must go back to the operator, not grow a CAS quietly.
- **D4 — solids-trig block: deferred to V6 but IN SCOPE** — committed curriculum coverage (cylinder/cone/sphere, spatial-trig measures), sequenced after the vector lanes; it does not gate the v1 launch.
- **D5 — force/physics vector questions: out of scope for v1**; revisit on corpus evidence.

## 11. Risks & explicit non-goals

- **Symbolic scope creep** is the #1 risk (doc 19's lesson): the boundary is §6.2/D3 — anything needing equation *solving* beyond 1–2-DOF numeric root-finds is out.
- **Hidden-line correctness** on non-convex arrangements (plane patch through a solid): v1 rule = classify against **solid faces only**, patches are translucent and never occlude — matches textbook style and caps the geometry.
- **Prime-letter tokens** ripple through IDs, i18n, and label rendering — decide the canonical form (`A'` vs `A′`) in V0, normalise at the parser boundary, and never store both.
- **The pivot (V4)** is the hardest engine feature; it is scheduled after both lanes stand alone, and both mixed corpus questions gate it.
- **Non-goals:** solving/deriving answers; cross-product display; general polyhedra beyond the named family; a physics engine; 2-D-tool feature parity (theorem feed etc.) in v1 — the theorem/pedagogy analog for space waits until the core tool proves itself.

## 12. Working alongside the 2-D track (parallel-work isolation rules)

The operator fixes 2-D bugs in parallel sessions on this same repo/branch. The plan is additive by design (everything new lives in `src3d/` + `space.html` + its own tests), so **source-level interference is near zero — provided these rules hold:**

1. **No `src/` refactors during parallel work.** §6.6's tempting extractions ("shared shell components", "shared chassis modules") touch exactly the files bug fixes touch (`App.tsx`, `geoStore.ts`, `parse.ts`). During the parallel period the 3-D track **copies patterns, never extracts** — the extraction becomes its own dedicated slice in a quiet window, or never (copy-divergence is acceptable; the chassis inventory already assumed pattern-copy is realistic).
2. **One-time shared-file edits are batched into V0:** `vite.config.ts` (second entry/build config) and `package.json` (scripts) — tiny, done once, then never touched by 3-D work again. i18n: the 3-D app gets **its own locale files** (`src3d/i18n/`), never edits `he.json`/`en.json`.
3. **The append-only docs are the real conflict surface** — `06-decisions.md` ADR numbering (two sessions minting the same next number; precedent: ADR-124's change was committed by a concurrent session), `PROJECT-MEMORY.md`, and CLAUDE.md's status paragraph. Rules: the 3-D track keeps **its own decision log** (`docs/06b-decisions-3d.md`, ids `ADR-3D-001…`) and its own short CLAUDE.md section (added once in V0, updated only there); PROJECT-MEMORY entries stay one-per-session appends (Dropbox/git merge these fine when both sides only append distinct bullets, but commit ordering matters — see rule 4).
4. **Literally-simultaneous sessions on one checkout → the 3-D session works in a git worktree** (own working copy of the branch, merged when its gate is green). Time-sliced sessions (not running at the same moment) can share the checkout since the file sets are disjoint.
5. **The shared test gate:** `npm test` / `tsc -b` now cover both apps, so a broken 3-D work-in-progress would block a 2-D fix's "full suite green" gate. The existing definition-of-ready already forbids landing red; combined with rule 4 (WIP stays in the worktree until green), the main-checkout suite is always green for the bug-fix sessions.

---

**Summary:** a third sibling tool at its own URL; two lanes (geometric `u,v,w` vectors on solids + algebraic R³ lines/planes) joined by a first-class coordinate-injection pivot; three genuinely new cores (a bounded symbolic vector layer, a linear equation layer, an SVG projection renderer with textbook hidden-line style and orbit); everything else transplants from the proven chassis. Build order V0→V5 gated on reproducing the four corpus exams end-to-end (V6 solids-trig committed after). **D1–D5 resolved (§10) — next step: V0 (walking skeleton at `/3d-builder/`) on operator go.**
