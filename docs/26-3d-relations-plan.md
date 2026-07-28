# 3-D relations — the operand-atom program

**Status: PROPOSED v2 (2026-07-28).** v1 written same day; **v2 supersedes it after a max-effort design
review** that corrected §2 (the single `relate3` command is withdrawn — it would break saves and the
fixtures drift-net), corrected S1's gate (rule identities are preserved, so the shadow snapshot goal is
ZERO diff, not "pure addition"), and **found two live bugs by review alone** (§4, the S0 doors — verified
by probe before being written down here).

Commissioned by the operator: *"since we need all of these relations… we also have [skew]… I want to have
a big task here to just do all of them… I think it's better to have the right generic solution."*

Authoritative for the relation-coverage work. Per-slice decisions go in
[06b-decisions-3d.md](06b-decisions-3d.md); status updates go in CLAUDE.md's 3-D section. Umbrella
issue: **#378**.

## 1. The problem, measured

Four bugs on 2026-07-28 ([ADR-3D-095](06b-decisions-3d.md#adr-3d-095), 097, 098, 100) were one class: *a
relation modelled correctly, exposed through an enumeration that covers a subset of its operand kinds.*
Fixing cells one at a time is what built this table (measured on `main` + #375):

| | two segments | named line ℓ | line & plane | plane & plane |
| --- | --- | --- | --- | --- |
| ⟂ | ✓ | **✗** | ✓ (both plane forms) | **✗** |
| ∥ | **✗** (claim only) | **✗** | ✓ (segment only) | **✗** |
| skew «מצטלבים» | ✓ (claim) | **✗** | — | — |
| intersecting «נחתכים» | ✓ (claim) | **✗** | ✓ named π only | ✓ same-form pairs only (ישר החיתוך) |
| coincident «מתלכדים» | **✗** | **✗** | — | **✗** |
| contained «מוכל» | — | — | **✗** | — |
| angle = v | ✓ | **✗** | ✓ (segment only) | ✓ two eq-planes w/ param only |
| distance = v | **✗** | **✗** | **✗** | **✗** |
| point ON it | — | **✗** | ✓ (planes) | — |

**The pattern: a named line is a second-class operand, and ∥ is thinner than ⟂ everywhere.** The
capabilities largely EXIST — `on-line` is fully built ([ADR-3D-031](06b-decisions-3d.md#adr-3d-031)),
`line-plane-angle` works for a segment ([ADR-3D-027](06b-decisions-3d.md#adr-3d-027)), skew/parallel/
intersecting are built claims for segments (V7-T3, [ADR-3D-010](06b-decisions-3d.md#adr-3d-010)), the
plane∩plane line exists for same-form pairs. What is missing is *reach*, not machinery.

## 2. Constraints that shape the design (why v1's §2 was wrong)

### 2.1 Existing lowerings are FROZEN — commands stay granular

Saved `.geo3.json` files carry lowered commands verbatim and replay them through `applyCommand3`; the
`fixtures3/` drift-net asserts that **re-parsing a stored utterance yields the stored commands**. So:

- An utterance that parses today must keep lowering to the **byte-identical** commands forever. A migration
  to a new command spelling for an existing cell is a breaking change to every save and to the drift-net —
  v1's "single `relate3` command replacing the existing rules" is therefore **withdrawn**.
- New cells lower to the **smallest new engine family that fits**, preferring to widen the atom set of an
  existing family where the frame classifier (§2.3) permits. The command union stays granular because each
  kind has distinct engine semantics (a parameter root-find is not a scalar pin is not a claim); the
  exhaustiveness/whitelist compile guards work per-kind and must keep working.
- The unification therefore lives in three places, none of them the command layer: the **operand layer**
  (§3.1–3.2), the **RELATION_TABLE** (§3.3), and the **battery** (§3.4).

### 2.2 One statement = one semantics; the shadow matrix is the instrument

The shadow-matrix snapshot records the winning RULE per catalog utterance. S1 preserves **rule identities**
(each existing rule becomes a thin wrapper over the shared core), so its gate is a **zero-diff snapshot** —
stronger and simpler than "pure addition". Later slices add rows only (the
[ADR-3D-090](06b-decisions-3d.md#adr-3d-090) discipline).

### 2.3 The frame classifier — the central routing invariant

Every relation *instance* is classified by its **operands**, not its pin kind:

- **gauge × gauge** (two segments of a solid): similarity-invariant → a shape drive (scalar-pin family,
  gauge frozen). Angles never pin scale; lengths/distances do (`scalePinned`,
  [ADR-3D-054](06b-decisions-3d.md#adr-3d-054)).
- **gauge × absolute** (a face against a parametric line): absolute-frame → must be able to ROTATE the
  figure; **excluded from `invariantOnly`** (the [ADR-3D-100](06b-decisions-3d.md#adr-3d-100) lesson) and
  solved as a pivot residual.
- **absolute × absolute** (ℓ against π): the figure is not involved. With a symbolic parameter in either
  operand → a **parameter root-find** (`pinningGivens`/`paramRoots`, roots = branches); with none → a
  pure **claim**.

This is why "extend `cos-angle`'s atoms to lines/normals" is allowed **only together with** operand-aware
`invariantOnly` classification: a scalar pin with an absolute operand silently mis-routed as
similarity-invariant is the collapse-basin/unreachable-constraint bug by construction.

### 2.4 A cell is an ACTION, not a residual

The table's cells map to heterogeneous engine actions. Each supported cell declares one (or two — see M1
below):

`rider` (create a free-DOF point, e.g. a new id on ℓ) · `drive-dims` (shape) · `drive-gauge`
(orientation/placement) · `param-root` (pin the figure parameter; sign-change vs touch-zero root-finding
chosen per residual — ∥ residuals are non-negative and need the minima-scan, the
[ADR-3D-006](06b-decisions-3d.md#adr-3d-006) touch-zero lesson) · `requirement` (open conditions —
skew/intersecting as GIVENS are inequalities/generic-position conditions: sample-and-gate via
`meetsRequirements3`/`firstSatisfyingSeed3` ([ADR-3D-064](06b-decisions-3d.md#adr-3d-064)), never
least-squares) · `claim` (verify on a determined figure) · `refuse` (honest, with a reasoned message).

M1 duality per relation: most cells carry **two** actions (drive when free, claim when determined), routed
at apply exactly like memberships today.

### 2.5 The landing funnel (S0) — one honesty check every path funnels through

[ADR-3D-095](06b-decisions-3d.md#adr-3d-095)'s general-position guard has now been bypassed **four** times:
the projection (#372), the driven path (#375 Am. 1), and the two doors found by this review (§4). Each
bypass had the same cause: per-path boolean proxies (`pivot === null`, `positionPinned`, `rotationSolved`)
standing in for the semantic fact — *which gauge components did the solve actually determine?*

S0 replaces them with **one post-solve stage**: classify each gauge component {translation, rotation,
scale} as *pinned-by-residuals* / *frozen-arbitrary* / *solved*, then sample every non-pinned component
under the clearance guard (world + default-view projection, [ADR-3D-099](06b-decisions-3d.md#adr-3d-099)).
Key classifications the proxies got wrong:

- an `invariantOnly` pivot ⇒ the gauge is **frozen-arbitrary**, not solved — and gauge motion *preserves*
  invariant pins by definition, so the full rigid motion may be sampled freely;
- vector/pair injections pin direction+scale but **never translation** (documented in `dataView` — the
  pivot roots translation at a deterministic origin), so translation must still be sampled;
- a single point pin pins translation only; rotation stays free;
- partial rotational freedom (e.g. spin about the ⟂ line after `planeLinePerps`) is sampled where cheap
  and documented where not — never silently frozen.

**Stated-incidence allowlist:** the clearance guard must exempt contacts the figure ASSERTS (a stated
meet, an on-line rider, the ⟂ crossing) — otherwise S4's intersect-GIVEN fights the sampler forever (the
2-D forced-coincidence lesson, [ADR-123](06-decisions.md#adr-123), 3-D edition). The funnel takes the
construction and derives the allowlist from it; nothing else may edit it.

## 3. The architecture

### 3.1 The operand atom

```ts
type Operand3 =
  | { kind: 'point'; id: Id }
  | { kind: 'segment'; a: Id; b: Id }
  | { kind: 'vector'; name: string }
  | { kind: 'line'; name: string }          // ℓ, ℓ1 — parametric or derived
  | { kind: 'plane-run'; ids: Id[] }        // ABC, ABCD
  | { kind: 'plane-named'; name: string };  // π, π1
```

ONE tokenizer reads an operand from text. Nouns are optional and **non-deciding** — classification is by
what the token IS, since the kinds are known (the [ADR-3D-100](06b-decisions-3d.md#adr-3d-100) lesson); a
noun that contradicts the kind is built-and-corrected via the notices channel, never guessed from.

### 3.2 The resolver returns THUNKS — one seam for five consumers

Drive residuals evaluate operands at **candidate** positions inside the LM loop, not final ones. So the
resolver returns, per operand, a closure:

```ts
resolveOperand(op, c): (at: (id: Id) => Vec3 | null) =>
  { dir?: Vec3; point?: Vec3; normal?: Vec3; d?: number } | null
```

Absolute operands (parametric lines, equation planes) ignore `at` and close over their resolved geometry;
gauge operands recompute from `at` each call (the `planeLinePerps` pattern). The same resolver then serves
the **parser** (classification), **apply** (existence checks), **claims** (`holdsAt` — which now receives
the whole `Resolved3`), the **solver** (residual builders), and the **marks collector** (`rightAngles3`) —
so "what does this operand mean geometrically" has one answer. Where a relation lands in an *existing*
record kind (preferred), the knee/dataView surfacing comes free; a new kind must register with the
collector explicitly (DoD §5.9).

### 3.3 RELATION_TABLE — the program's disposition map

A data structure, not prose: `(rel × lhsKind × rhsKind) → { action(s), status }` with
`status ∈ {supported, planned, out-of-scope, n/a}`. Totality-tested (every combination classified — the
[ADR-235](06-decisions.md#adr-235) pattern), and **the single source of truth**: the battery iterates it,
the catalog references it, a slice "lands" by flipping cells to `supported`.

### 3.4 The battery — one generic test per supported cell

For every `supported` cell, one shared harness asserts: builds from a minimal figure (He + En; operand
order swapped where symmetric; nouns present and absent) · **drives or verifies per its action** (a drive
genuinely moves the figure — asserted non-satisfied *before*, the anti-luck discipline from the
[ADR-3D-100](06b-decisions-3d.md#adr-3d-100) lock) · DOF cue monotone
([ADR-3D-060](06b-decisions-3d.md#adr-3d-060)) · save→load round-trip · **general position: the relation
holds AND every gauge vertex clears absolute objects AND the placement varies across seeds** (this single
property is the funnel's lock — it catches both "guard skipped" and "guard undoes the drive") · a
symbolic-operand variant exercises `param-root` where the cell declares it · unknown references refuse
honestly.

The battery is the instrument that stops the §1 class recurring **inside the engine**, where compile-time
guards cannot see (registration surfaces §5.5–5.10 are runtime concerns).

## 4. S0's evidence — the doors (verified by probe, 2026-07-28)

Both build `lastError: null` and draw ℓ1 through vertex A at **every** seed (`dist(A, ℓ1) = 0.0000`):

- **(a) pair injection:** `פירמידה משולשת` · `l1:x=(0,0,0)+t(m,2m,3m)` · `AB = (1,2,3)` — the pair pin
  fixes direction+scale, translation roots at the origin, and the guard is skipped because
  `pivot !== null` (main) / `positionPinned` counts pairPins (the #376 branch).
- **(b) invariant scalar pin:** the same figure with `זווית BAC = 60` — the pivot runs `invariantOnly`
  with the gauge FROZEN; both proxies read it as placed.
- **(c) branch-only:** `rotationSolved = pivot !== null` is wrong under an `invariantOnly` pivot —
  rotation was frozen, not solved, so it is never re-sampled.

Class sentence: *a boolean per-path proxy stands in for "which gauge components are genuinely free",* so
every new solve path re-opens the coincidence. Filed as its own bug; fixed by the §2.5 funnel.

## 5. Per-slice Definition of Done — the registration surfaces

Every slice's PR checks each item or states why it is n/a:

1. parser wrapper/rule + shadow matrix (S1: zero diff; later: addition only)
2. `catalog3.ts` entries He+En (the guard test auto-covers parseability)
3. `COMMAND_SAVEABLE` whitelist *(compile-guarded)*
4. apply case + `claimRefsError` *(compile-guarded)*
5. engine routing per the frame classifier: pivot trigger · `invariantOnly` · `planeDrive` · `solvePivot`
   early-return *(runtime — battery-covered)*
6. `scalePinned` if the relation carries units (distances do; angles never)
7. `freeDofCount3` accounting
8. funnel interaction: stated-incidence allowlist entries; placement still sampled and clear
9. marks: knees for new 90° sources (free if lowered to existing kinds), dataView/query surfacing
   (*"and show that"* — the operator's words)
10. `pinningGivens`/`paramRoots` arm when either operand can carry the parameter (real exams pin m by
    ∥/⟂/distance — 2010-Q3 is a distance-between-parametric-lines question)
11. fixtures3 drift-net green (automatic, but run)
12. LLM prompt few-shots + `scope3` guidance for the *neighbouring unsupported* forms + triage-mirror
    parity (the 5×-recurred ADR-346 drift class)
13. i18n for every new notice/refusal, both locales
14. budget: each drive states its worst-case multiplier (docs/17 §7)
15. RELATION_TABLE totality still green; cells flipped in the same PR as their battery rows

## 6. Slices

**S0 — the landing funnel** *(bug fix → main route, small)*. The §2.5 stage + the §4 doors as locks +
the allowlist plumbing (empty allowlist for now). Gate: the doors' figures clear; the existing placement
locks (`placement-gauge`, `view-legibility`, `plane-line-perp` Am. 1) still green **through the funnel**,
their per-path guards deleted.

**S1 — atoms + TABLE + battery harness** *(landed 2026-07-28, [ADR-3D-102](06b-decisions-3d.md#adr-3d-102))*.
Operand tokenizer + thunk resolver; RELATION_TABLE seeded with the measured `supported` cells; the battery
over them; `planeLinePerp` migrated as the exemplar. **Amendment vs v2:** the remaining rules migrate
PER-FAMILY in the slice that widens that family's cells (S2/S3/S4) — migrating a rule twice, once for form
and again for function, is waste, and the zero-diff gate is cleanest kept absolute. Gate met: **shadow
snapshot zero-byte diff**, full suite green, battery green. First find: #380 (primed labels rejected by the
seg↔plane family).

**S2 — the named-line column** *(landed 2026-07-28, [ADR-3D-103](06b-decisions-3d.md#adr-3d-103))*.
Point-on-ℓ phrasings → the existing `on-line` command; ∥/⟂/angle for ℓ operands via the classifier
(gauge×absolute → the `lineRels` pivot residual; absolute×absolute symbolic → param-root, gated on a
DIRECTION carrying the parameter; numeric → claim). 14 cells flipped; two root fixes en route (the
table's dead non-canonical literal keys, the never-verified numeric line⟂π). **The `l1=x:`
spelling-tolerance "decision (filed separately)" was never actually filed** — carried forward, not
silently dropped; file it when the spelling recurs in a log. Through-line (`pointLines`) operands stay
claim-only until an exam needs the drive (recorded in the table notes).

**S4 — mutual positions** *(landed 2026-07-28, [ADR-3D-104](06b-decisions-3d.md#adr-3d-104))*.
intersecting / parallel / skew / coincident as first-class statements over the operand pair. The
mechanism follows the CLOSED/OPEN split, not the relation name: the closed three carry a scale-free
residual (signed components — the ADR-3D-006 touch-zero lesson) and drive when both operands ride the
gauge; `skew` is an inequality and lives entirely in the requirement lane, which also carries the open
half of the others (a crossing must land WITHIN the segments). 12 cells flipped. **Operator UX call,
made and then revised in play:** the canvas draws NOTHING (dashed already means *hidden* in this
renderer, so a rung read as a hidden edge) and the DATA PANEL says it in words (there is no standard
symbol for skew — the first cut invented one). The ask widened past the reported case: the panel
reports a relation whether STATED or merely HOLDING, over segments and named lines, ⟂ included. Two root findings en route: a
verdict about LINES is not one about SEGMENTS (coplanar-but-missing is not skew — it let an impossible
given build silently), and «X ו-Y מקבילים» / «X מקביל ל-Y» had two different semantics, now one.
**Out, filed as #386:** the gauge×absolute closed drive (needs the pivot trigger generalized, not a
second parallel array).

**S3 — plane ↔ plane**. ∥/⟂/angle mostly fall out of dir-relations on the resolvers' normals; the
intersection line's mixed-operand cell (named π × point-run) is a tokenizer fix.

**S5 — distances**. point–plane, skew lines, parallel planes: givens (`scalePinned` joins), claims, and
the query lane («המרחק בין…»).

Order: **S0 ✓ → S1 ✓ → S2 ✓ → S4 ✓ → S3 → S5.** S2–S5 are independent once S1 lands;
S4 is promoted because it is the operator's named ask. Rough total: 6–8 focused sessions, one PR per
slice (S0 as a bug fix goes straight to main per the workflow).

## 7. Non-negotiables

- S1 changes no lowering and no snapshot; later slices change the snapshot by addition only.
- M1 duality per relation — verify-only is not finished ([ADR-3D-095](06b-decisions-3d.md#adr-3d-095)
  makes it refuse `claim-refuted` on nearly every seed).
- Every drive path lands through the S0 funnel; **no new per-path guards, ever**.
- Both locales, both orders, nouns non-deciding.
- The chokepoint registry SHRINKS: rule bodies collapse onto the shared core; the lexical/semantic logic
  lives once. (Rule *names* may persist as thin wrappers — the shadow matrix's diagnostic value is worth
  more than the count.)
- Corpus-driven, not speculative: a cell nobody's exam or session needs stays `planned`, and
  `out-of-scope` cells say why (e.g. coincident-as-DRIVER awaits a real exam that needs it).
