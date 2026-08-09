# CLAUDE.md — the 3-D Space Builder (`src3d/`)

Guidance for Claude Code when working in the **3-D** product tree. The workspace-wide rules (standing
rules, workflow, commands) are in the [root CLAUDE.md](../CLAUDE.md) and apply here unchanged; this file
adds only what is specific to 3-D.

**This is an orientation file, not a session log.** No history, no status — those live in
[`docs/06b-decisions-3d.md`](../docs/06b-decisions-3d.md) (the tail is the most recent work) and
`gh issue list --label 3d`. A guard test rejects dated progress entries here.

## What this is

A **second app** in this repo for the bagrut **space/vectors** question (Q2): geometric `u,v,w` vectors on
solids, plus algebraic R³ lines and planes. Plan: [docs/20-space-vectors-tool.md](../docs/20-space-vectors-tool.md).
Decisions: [docs/06b-decisions-3d.md](../docs/06b-decisions-3d.md), ids `ADR-3D-NNN`. Issue label `3d`.
Deployed at `themathbible.com/3d-builder/` (admin dashboard at `/admin3`).

Every 2009–2024 space/vectors exam input is expressible; the relations program (docs/26) is complete.
The remaining niche is low-frequency and coordinate-expressible: orthoscheme / dihedral-face-angle.

## Hard boundaries (operator authority — docs/20 §12)

1. **`src3d/` never imports from `src/`.** Patterns are COPIED, not shared. A stray `@/` import would
   typecheck (the alias is repo-wide) while silently coupling the products — `server/__tests__/isolation.test.ts`
   rejects it. `vite.config.3d.ts` deliberately defines no alias.
2. **3-D work never touches 2-D artifacts** — not the 2-D locale files, not `docs/06-decisions.md`, not the
   2-D status text. Decisions go in 06b; orientation updates go in this file.
3. **NO CAS.** Anything needing symbolic solving beyond a 1–2-DOF numeric root-find goes back to the
   operator. Every "symbolic" feature here is a numeric root-find, a closed form, or a linear solve.
4. **No cross product.** The curriculum has none. It may be used internally, never surfaced to a student.

## Where things live

| Module | What it is |
| --- | --- |
| `engine/` | `Vec3` core, solids, the apply reducer, `derive3`/`resolve3`, `solve3.ts` (the pivot: numeric similarity + dims least-squares, LM with central-difference Jacobian, seed-rotated multi-start), `relationTable.ts` (the disposition map), `operands.ts` (the operand-thunk resolver), `arcs`/`baseShapes`/`defaultView`/`notices` |
| `parser/` | `parse3.ts` — **context-free** rules; resolution happens at apply, so there is no `ParseContext` here (deliberately, and it is the better architecture — see docs/17 §3b). `catalog3.ts` is the coverage map with a guard test asserting every entry parses in He **and** En. `llmShared3.ts` holds the 3-D prompt |
| `render/` | Orthographic-orbit SVG: `scene3.ts` (pure) + `Figure3.tsx`. Textbook dashed hidden edges via numeric outward normals. `notation.ts` formats vector notation |
| `store/` | Zustand + zundo, derive-on-demand, keep-prior-on-error. Save/load `.geo3.json` (replay inputs only) |
| `i18n/`, `App3.tsx` | RTL shell, He/En locales |
| `__tests__/`, `fixtures3/` | The suite, and the fixture regression net — **a saved manual session dropped in `fixtures3/` becomes permanent coverage** (all-facts-OK + parser-drift asserted; regenerate seeds with `GEN_FIXTURES3=1`) |

## The model in one page

- **Two lanes.** The *geometric* lane names basis vectors on a solid (`נסמן: AB=u…`) and reasons affinely.
  The *algebraic* lane takes planes and lines by equation, with at most **one** symbolic parameter, pinned by
  a given via root-finding (roots = branches; `no-roots` is an honest contradiction, never a fake point).
- **CLAIMS are the student's answer, never a driver.** A claim is verified across several seeded
  configurations and refused `claim-refuted` when wrong. `apply` RECORDS every claim into
  `Construction3.claims` and `derive3` verifies all of them, so a claim cannot escape via a composite command.
- **M1 duality — a statement about an EXISTING object is a given, not a re-creation.** The same utterance
  drives a free figure or verifies a determined one, decided at apply. This is the single most productive
  pattern in this tree; reach for it before adding a construct.
- **Defaults yield to statements ([ADR-052](../docs/06-decisions.md#adr-052)).** Never invent an unstated
  property: a prism not stated right is **oblique**; a qualifier the parser recognises must be one it can
  lower (`statedQuadBase` / `statedTriShape` are the one vocabulary — a position-local qualifier test is
  how gaps hide).
- **Gauge vs knowledge.** A figure's placement/rotation/scale is a gauge, sampled freely **unless** something
  absolute is present (an equation plane, a parametric line, a coordinate point, a pin) — the landing funnel
  classifies which gauge components are provably free. Consequently: **a number drawn on the canvas must be
  seed-invariant knowledge.** One drawing's values are not a given, and printing them is dishonest.
- **Under-determination is welcome.** An unstated dimension stays a free, resampled DOF while the pinned
  parts stand still.

## Recurring traps (each one cost a session)

- **`ℓ` is not a `\w` character** — never write `\b` after a line name; use an explicit lookahead. Line names
  are digit-indexed (`ℓ1`/`ℓ2`, typed `l1`/`l2`); no primes.
- **Hebrew morphology gates must admit every spelling**: `מאונ[ךכ]` (both kaf forms — the final-ך gate
  silently rejected the plural `מאונכים`), `זו?וית` (single and double vav), `ניצבים?` (the yod). A keyword
  gate that admits one spelling is a silent drop. Two entries are **optional prefixes** rather than
  spellings and are the easiest to forget: the **definite article** (`ה?מישור` — «B על מישור π2» is the
  same sentence as «B על המישור π2») and the **subject noun** (`הנקודה B` / `נקודה B` / `B`). Use the
  shared tokens `HE_PLANE` / `HE_LINE` / `HE_SEG` / `HE_SUBJ` / `IS_AT` in `parse3.ts` — do not re-spell
  a noun gate inline.
- **A relation is stated in more than one FRAME.** The same fact comes verb-headed («ℓ חותך את π בנקודה A»)
  or noun-headed («A נקודת החיתוך של ℓ עם π»), and a rule carrying one frame silently drops the other on a
  capability the engine already has. Vocabulary lives in `CROSS_HE_VERB` / `CROSS_HE_NOUN` (+ En); reach
  for both frames when adding a rule.
- **`PLANE_NAME` contains its own capture group**, so positional match indices SHIFT when a pattern grows
  an alternation. Use **named groups** (`(?<id>…)`) in any rule with more than one operand — a rule that
  reads `m[m.length - 1]` is dodging this rather than fixing it, and it read a point id of `"1"` out of
  `π1` the first time the pattern widened.
- **The prime `′` normalises to `'`** at the parse seam; canonical form everywhere downstream.
- **A non-negative residual never changes sign**, so a descent stalls short of a touching root — use a
  minima-scan plus ternary search (`touchZeroRoots`), or make the residual signed.
- **A guard bound to a code path rather than to the event it guards will be bypassed.** Several defects here
  shared exactly that shape; where a guard is cheap, make it total.
- **An enumeration is not a rule.** Repeatedly, a correct rule was applied to a whitelist one member short.
  Prefer deriving the set from the construction over listing the kinds you remembered.

## Commands

- Dev: `npm run dev`, then open **`/3d.html`** (the 2-D app is at `/`)
- Build: `npm run build:3d` (own config `vite.config.3d.ts`, base `/3d-builder/`, output `dist-3d/`; the
  deploy renames `3d.html` → `index.html`)
- Tests: `npm run test:3d` (this tree + the shared `server/` tests); one-shot `npm run test:run:3d`.
  The full suite (`npm run test:full`) is still the bar before any commit.
