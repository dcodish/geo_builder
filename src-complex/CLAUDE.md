# src-complex/ — the complex-numbers Builder

**This is an orientation file, not a session log.** What exists, where it lives, what must never be
done. **No history and no status** — those live in [`docs/06d-decisions-complex.md`](../docs/06d-decisions-complex.md)
(ids `ADR-CX-NNN`; the tail is the most recent work) and `gh issue list --label complex`. A guard test
rejects dated progress entries here ([ADR-W-002](../docs/06w-decisions-workspace.md)).

## What this is

The third sibling product: a student types the givens of a bagrut **complex-numbers** question
(שאלון 572, question 3 of פרק ראשון) line by line and the **Gauss plane** draws itself — the drawing
the exam never prints. Same charter as every sibling: **the student types the givens, the tool
reproduces the figure and verifies claims — it never solves the exam question.** Deployed at
`themathbible.com/complex-builder/`.

The corpus is the יואל גבע 572 booklet, 2020–2025, Q3 of every exam. The plan of record is
[`docs/27-complex-numbers-tool.md`](../docs/27-complex-numbers-tool.md): §10 is the **authoritative
grammar contract** (sentence families), §9 the slice plan.

## The four hard boundaries

1. **`src-complex/` never imports from `src/` or `src3d/`.** Patterns are COPIED, not shared;
   `server/__tests__/isolation.test.ts` reads `BOUNDARIES.json` and rejects a violation, including via
   the `@/` alias — which is why `vite.config.complex.ts` deliberately defines none. The one sanctioned
   shared code is the `shell/` tree ([ADR-W-016](../docs/06w-decisions-workspace.md#adr-w-016)): chrome
   only, parameterized by the caller, never branching on product identity. The `engine` layer is
   copied-never-shared, always.
2. **Complex work never touches 2-D or 3-D artifacts** — their locales, their ADR logs, their status
   text.
3. **NO CAS.** The exact core is bounded linear algebra over ℚ on two vector spaces
   ([ADR-CX-006](../docs/06d-decisions-complex.md#adr-cx-006)). Anything wanting general symbolic
   algebra goes back to the operator.
4. **A display transform never reaches the parser or the engine.** The polar↔cartesian toggle and the
   `n` stepper are view state, outside the store and outside undo (ADR-CX-001 D3).

## The model in one page

- **The ordered fact list is the source of truth**; the figure is derived. Positions are never stored,
  so undo cannot desync.
- **Log-polar is the engine's coordinate system.** `(u, θ) = (ln|z|, arg z)`. Every multiplicative
  operation is *linear* there, so the multiplicative core of the corpus is an exact ℚ-linear system —
  solved by elimination, not iteration. Sums, areas, distances and series are the numeric residue.
- **Branches are integer unknowns.** The `k` in an angle equation is the exam's «כל האפשרויות»;
  "show another configuration" walks the enumerated set.
- **Free DOF is the nullspace dimension** — one definition, read by the cue, the knowledge gates and
  the sampler alike. A default is a *starting* value, never a fixed one ([ADR-052](../docs/06-decisions.md#adr-052)).
- **A second mention of a name is a GIVEN, not a redefinition.** Existing-name lowering lives at one
  apply-boundary seam; rules ask `existingRef()` rather than each deciding
  ([ADR-CX-005](../docs/06d-decisions-complex.md#adr-cx-005), [ADR-CX-009](../docs/06d-decisions-complex.md#adr-cx-009)).
- **Claims are the student's answer, never a driver** — verified, refused when wrong.
- **A number printed on screen must be knowledge**: invariant across every valid configuration, with
  its gauge pinned. The figure shows everything; the panel prints only what was asked for and only
  what is known.
- **Nothing stated is ever silently dropped.** Span accounting is the only mechanism — every non-filler
  token span is claimed or the parse refuses. **No `dropped*` gate is ever added**
  ([ADR-CX-009](../docs/06d-decisions-complex.md#adr-cx-009) §2).

The stage order every mechanism inserts into is [`docs/LADDER-CX.md`](../docs/LADDER-CX.md). **Every
mechanism ADR names its stage and updates that file.**

## The siblings are never harmed — and it is checked, not promised

The operator's standing requirement for this rebuild
([ADR-W-017](../docs/06w-decisions-workspace.md#adr-w-017)): capability grows here, and the two
shipped products never regress. **Run `npm run check:siblings` before every commit in this tree.** It
refuses any change to `src/` or `src3d/` (escape hatch: `ALLOW_SIBLING_EDIT="the reason"`, a reason
rather than a flag) and builds both siblings regardless of the diff, because a shared-surface edit can
break them without touching one of their files. It takes ~10 seconds; it does **not** replace
`npm run test:full`, which is still the gate — the builds prove the siblings compile, only the suite
proves they behave.

## Commands

- `npm run dev` → `http://localhost:5173/complex.html` (dev serves at the ROOT, not `/complex-builder/`)
- `npm run check:siblings` — the sibling-safety check above
- `npm run build:complex` — `tsc -b` then the product build
- `npm run test:complex` — this tree + the shared `server/` tests; one-shot `npm run test:run:complex`
- **`npm run test:full`** — the FULL suite, the bar before any commit and any deploy
