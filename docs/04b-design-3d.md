# 04b — Design: the 3-D Space Builder (`src3d/`)

_How the 3-D product is built. Registered in [`DOCS.json`](../DOCS.json) as the `3d` product's design doc
([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02b](02b-requirements-3d.md). Decisions are [06b](06b-decisions-3d.md);
the build plan and its corpus reading are [docs/20](20-space-vectors-tool.md). This is the *how*.

## Shape

| Layer | Size | What it is |
|---|---|---|
| `engine/` | 22 files, ~13,900 lines | `Vec3` core, solids, the apply reducer, `derive3`/`resolve3`, the solver, the relation disposition map, the operand resolver |
| `parser/` | 7 files, ~5,700 lines | `parse3.ts` (context-free rules), `catalog3.ts` (the coverage map), `llmShared3.ts` (the 3-D prompt) |
| `render/` | 9 files, ~2,500 lines | Orthographic-orbit SVG: `scene3.ts` (pure) + `Figure3.tsx`, plus vector notation |
| `store/` | 5 files, ~1,500 lines | Zustand + `zundo`, derive-on-demand, keep-prior-on-error, `.geo3.json` save/load |

The tree **copies patterns from `src/`, it never imports them** — 2-D and 3-D geometry differ in kind, so
an abstraction over both would leak ([`BOUNDARIES.json`](../BOUNDARIES.json), operator authority). The
shared chrome ([04w](04w-design-shell.md)) is the one sanctioned shared code.

## The parser is context-free — deliberately, and it is the better architecture

`parse3.ts` has **no `ParseContext`**: rules match text and nothing else, and *resolution happens at
apply*. Verified — zero `ParseContext`/`ctx.` references in the file.

This is the opposite of 2-D, where the parser carries figure context, and the divergence is intentional
([docs/17 §3b](17-design-rules.md)). Deciding what a name refers to at **apply** time rather than parse
time is what makes [`FR-SP-5`](02b-requirements-3d.md)'s M1 duality possible: the same utterance drives a
free figure or verifies a determined one, because the decision is taken where the figure is known. A
context-carrying parser has to guess earlier, with less information.

Consequence for anyone adding a rule: **reach for M1 duality before adding a construct.** It is the most
productive pattern in this tree precisely because the seam exists.

**The normalisation seam and case ([ADR-3D-039](06b-decisions-3d.md#adr-3d-039), [ADR-3D-223](06b-decisions-3d.md#adr-3d-223)).**
`normalize3` is the one boundary every rule reads: format controls stripped, primes and minus unified,
script transitions split — and lowercase labels uplifted by `upliftLowercaseLabels`, the ONE chokepoint,
only in positions an anchor proves are labels (the angle glyph/word, a point/vertex noun, the head of a
coordinate definition). New label-demanding positions join that function, never a rule. What no anchor
proves is left to the #353 convention nudge in `scope3.ts` (`upperCasedLabelCandidate3`, consulted by
`App3` before the LLM seam), which teaches the spelling rather than guessing it.

## The solver — a coordinate-injection pivot, not a general CAS

`solve3.ts` handles the case the corpus actually asks for: a gauge-free figure built in the geometric
lane receives **absolute givens mid-session** (a point coordinate, a vector value), and the engine solves
for the **similarity** — translate, rotate, scale — *plus* the figure's free shape dimensions that realise
them. Numerically: least-squares over the dims, Levenberg–Marquardt with a central-difference Jacobian,
seed-rotated multi-start.

This is the concrete meaning of [`FR-VC-3`](02b-requirements-3d.md)'s **NO CAS** bound. Every "symbolic"
feature here is a numeric root-find, a closed form, or a linear solve; anything beyond that goes back to
the operator rather than being approximated. The bound is what makes the answers trustworthy — an
approximate symbolic result would be indistinguishable, to a student, from a correct one.

**A symbolic coordinate lives in one of two structurally different lanes, and the lane decides what can
be expressed.** With a solid present the component becomes a pivot **pin** carrying the full affine form,
exponents included; with no solid it becomes a `coord-sym` point whose components are stored as a
degree-1 `{k, p}`. They are different objects, not one object evaluated two ways — so a capability
present in one is not automatically present in the other, and the narrower lane must **refuse what it
cannot hold rather than narrow it silently**. A lossy lowering is the worst outcome available: it looks
like success and states a given the student never gave. See [ADR-3D-218](06b-decisions-3d.md#adr-3d-218)
(#898), where a component reducer summing coefficients and never reading exponents drew «C(p²,p,0)» as
«C(p,p,0)».

**A letter has one ADDRESS registry, and a pin on it is keyed by the letter.** Six mechanisms can own a
symbol — a vec-def's ratio («SN = k·SC»), a pivot pin symbol (a point/vector/pair injection or an equation
written in the letter, `pinSymsOf`), the algebraic lane's figure parameter (`c.param`), a labelled angle,
a named free component («D(3,p,0)», `partialNames`), and a named on-segment rider parameter
(«E על SA כך ש-SE = t·SA», `riderNames`). `symbolOwnersOf` (`types.ts`) lists a letter's
owners in one place, and every statement addressed to a letter («p = 3», «p חיובי») is applied to each of
them. `symbolPins` is keyed by the symbol's **name**: the relation pins (∥/⟂/length/seg-*) are inherently
vec-def pins and drive a symbol-defined point; the `value` pin is lane-agnostic and each lane reads it back
on its own terms — the vec-def lane as the point's k; the **pivot as a substitution** (`openPinSymsOf` is
the unknown layout — a value-pinned symbol holds no slot, so the layout, the start spread, the seed
anchors, the continuation walk and the DOF cue shrink by it together); the parameter lane as its one
admissible root (`pinningGivens` counts it, and `paramRoots` returns the stated value only if every
geometric pinning given admits it — otherwise the honest `no-roots`, blamed on the statement). A named
component takes a value through the injection command that bound the name (M1). See
[ADR-3D-219](06b-decisions-3d.md#adr-3d-219) (#902), where the pins were keyed by the vec-def **index** that
introduced a symbol, so a coordinate-born letter had no representable pin and «p = 3» refused a letter the
student had used two lines earlier.

**A rider's ratio clause is read by the RIDER, not by the utterance that declared it.** An on-segment
point carries a parameter `t`, and a statement relating its host's parts *determines* `t` in closed form
— no solving. Two shapes exist and both live in `onSegmentRatio.ts`: the host's two **halves** against
each other (`|aR| = k·|Rb|`, `riderPairsT`) and one half against the **whole** host (`|aR| = k·|ab|`,
`riderWholeSide`/`riderWholeT`). Pairs match as SETS, because a length pair is unordered. The parameter is
confined to the OPEN interval: «R על ab» is itself a given, so a coefficient placing the rider at or beyond
an endpoint contradicts the membership in the same sentence and is **refused** — never clamped, and never
dropped. A coefficient written as a LETTER binds the name only (`riderNames`); the rider keeps sampling as
before, and a later value reaches it through the same `symbolOwnersOf` registry as every other lane. See
[ADR-3D-224](06b-decisions-3d.md#adr-3d-224) (#921), where the whole-host shape was readable in no spelling
of the clause, so «E על SA כך ש-SE = t·SA» built a free rider and silently discarded the ratio — while the
same statement typed as its own fact built and pinned correctly all along.

**Both shapes, and either kind of coefficient, are read at ONE chokepoint.** `riderRatioRetarget` sits at
`applyCommand3Inner`'s entry and rewrites a ratio statement into the `point-on-segment3` given it is,
before any stage of the ladder sees it — so the three command shapes the same sentence can arrive as
(`vec-rel`, `length-rel`, the `length-ratio` claim) share one semantics. It used to read only the
**halves** shape and to reject a symbolic coefficient outright, which left the whole-host shape reachable
from parse3's clause rule alone: «E על SA» followed by «SE = t·SA» — the incremental order this product is
built around — refused, and so did its numeric twin «SE = 0.5·SA», one line apart from the halves spelling
that worked. A **letter** coefficient is read in the stated orientation only (`1/t` is not a name, so the
flipped spelling is not guessed at), and reaching an existing free rider it binds the name and nothing
else, exactly as the clause does. See [ADR-3D-231](06b-decisions-3d.md#adr-3d-231) (#932).

**A VALUED parameter's two forms compete on one surface, and the student picks.** `degText` is the one
rule for what an arc reads, so it is also where the choice lands: a symbol whose valuing row is set to
`letter` reads its letter instead of its value, and everything else is byte-identical. The resolver
rides the `App3 → Figure3 → buildScene3` seam that `planeDisplay` and `showObjectAngles` already use.
Which rows OFFER the choice is derived, never listed: `collectWedges` (moved out of `buildScene3` so the
fact list can read it too — one collection, two readers) yields the wedges, `competingArcSymbols` picks
those carrying BOTH a label and a value, and `store/paramChips.ts` puts the chip on the enabled fact
whose `symbol-value` command named such a symbol. The choice itself is `displayMode` in the store,
keyed by that fact's id — and by its INDEX in the save file, because a load re-parses utterances into
fresh ids. See [ADR-3D-233](06b-decisions-3d.md#adr-3d-233) (#925/#937) and the cross-product rule
[ADR-W-047](06w-decisions-workspace.md#adr-w-047).

**A refusal names a cause the figure does not contradict.** When a statement is addressed to a letter, the
two questions *"does the figure carry this letter?"* and *"does this lane expose what the statement asks
for?"* have separate answers and separate codes: `unknown-symbol` for the first, `sign-not-selectable` for
the second. See [ADR-3D-225](06b-decisions-3d.md#adr-3d-225) (#922), where one code answered both and told
a student the figure had never heard of a letter it had just been given.

**Case is taught, never silently accepted — and the two mechanisms divide the work by ANCHOR.** Node
labels are uppercase; lowercase is the vector/parameter/coordinate namespace, so 3-D cannot take a blanket
case-insensitive read. `normalize3`'s uplift (`upliftLowercaseLabels`) lifts a run only where an ANCHOR
proves it is a label — an angle glyph, a point noun, or a `label(…)` coordinate at the sentence start
([ADR-3D-223](06b-decisions-3d.md#adr-3d-223)); everything else is the NUDGE's business, which offers the
corrected spelling and lets the student retype it. A solid noun is deliberately **not** an anchor (the
#353/#498 ruling, reaffirmed 2026-09-07), so «תיבה abcd» is taught rather than auto-lettered. The nudge
lifts any label-shaped run of two or more characters — never a single letter, and never an English prose
word (`NOUN_EN`/`EN_STOP`, reused from `parse3`) — and is PROOF-BASED: it runs only on a failed parse and
fires only if the candidate parses, so a genuine gap is never masked as a style complaint. See
[ADR-3D-226](06b-decisions-3d.md#adr-3d-226) (#924 arm 2), where a four-character cap was one vertex list
too short and sent «תיבה abcda'b'c'd'» to the paid LLM lane.

## Gauge, and why the landing funnel exists

A figure's placement, rotation and scale are a **gauge** — free unless something absolute pins them. The
**landing funnel** classifies which gauge components are *provably* free, and that classification is what
licenses [`FR-SP-4`](02b-requirements-3d.md): a number may be drawn only if it survives the gauge being
resampled. Without the funnel the engine could not distinguish "this length is 5" from "this length is 5
*in the drawing I happen to have chosen*", and printing the second is dishonest.

## Relations as a disposition map

`relationTable.ts` maps each `relation × operand-kind` pair to a status and the actions it licenses
(`drive`, `claim`, or unsupported) rather than scattering that knowledge across rules. Two properties
follow: a relation the engine cannot yet drive is **claim-gated** instead of silently mis-driven, and the
map is enumerable — which is how [docs/26](26-3d-relations-plan.md)'s program could be closed against a
list rather than against intuition.

`operands.ts` resolves operand *thunks*, so a rule names what it wants without knowing how that operand
will be produced.

**A declared action must hold for every spelling of its row, and the SHAPE of a pin kind is not a
semantic rule.** `'angle|segment|segment'` declared `drive-dims` while `apply.ts` delivered it only when
`claim.a1 === claim.a2` — not a geometric condition, but the shape of the one pin kind that existed
(`vangle` = vertex + two rays). Everything else fell through to the claim lane and was refuted against a
sampled figure. The lesson generalises past this row: when a statement fails to fit an existing pin, the
question is whether the relation needs **its own pin kind**, never whether the statement can be turned
away. Reuse is checked on the residual's MEANING, not its field list — `cos-angle` carries the right two
operands and the wrong (signed) quantity, and a drive that targets something other than what its verifier
measures produces figures its own claim then refutes. See [ADR-3D-217](06b-decisions-3d.md#adr-3d-217).

**Vocabulary is not a rule's private property** (#977, [ADR-3D-241](06b-decisions-3d.md#adr-3d-241)).
Two rules read angle statements, and each carried its own inline copy of the angle NOUN and the COPULA.
The copies had drifted before anyone noticed: one accepted a bare `angle ABC` and the other demanded
`the angle ABC`, and neither knew «שווה». The student's sentence was therefore understood or refused
according to which rule happened to read it — a coin-flip they cannot see and cannot learn.

The repair is the one #969/[ADR-498](06-decisions.md#adr-498) reached in 2-D, and it is worth stating as a
rule of thumb rather than an incident: **when two rules must agree about a word, the word gets a name.**
A shared constant makes drift impossible; a comment asking the next author to keep two regexes in step
does not. The corollary for review is cheap to apply — if a rule contains a literal list of spellings,
ask which other rule needs the same list.

Note also what the copula is *for*: nothing. It carries no meaning the tool needs, which is exactly why it
must never be the thing that decides whether a statement is understood.

## The symbol registries — one address, one display, derived from each other

A letter a student names is answered in two places, and they are deliberately different questions.
`symbolOwnersOf` is the **address** registry ([#902](06b-decisions-3d.md#adr-3d-217)): what does this
letter denote — a vec-def's ratio, a pin's open coordinate, the algebraic parameter, an angle mark, a
named component ([#814](06b-decisions-3d.md#adr-3d-175)), an on-segment rider's parameter
([#921](06b-decisions-3d.md#adr-3d-224))? A statement addressed to a letter reaches EVERY owner: that is
what sharing a name means. `figureSymbolsOf` is the **display** registry — which letters the data panel
and the ask lane show — and it is **derived from the address one**
([ADR-3D-230](06b-decisions-3d.md#adr-3d-230)): a letter the student bound is displayable, whatever lane
consumed it. It used to list a hand-written subset, and the subset fell three kinds behind, so «t = 1/2»
vanished from the panel while «p = 3» survived. What varies per owner kind is only HOW the letter is
PRICED, and that lives with the panel, one branch each, each using the resolver that already exists. The
knowledge discipline is shared and unchanged: an undetermined letter reads `?` in every lane.

## Claims

Recorded on `Construction3.claims` at apply and verified in `derive3`, so **a claim cannot escape by
arriving inside a composite command**. `claims.ts` checks each against four deterministic seeds
(`claimSeeds`) — the multi-sample discipline that makes a coincidence refutable.

**A change that orphans a row, and the symbol retry pass ([ADR-3D-220](06b-decisions-3d.md#adr-3d-220), #926).**
`derive3` applies each fact through one `applyFact` (count-delta attribution included) and then re-applies,
in a bounded pass, every row still red with `unknown-symbol` — a statement addressed to a letter («α = 70»,
«p חיובי») introduces nothing, so retrying it after the fold strands no dependent, and only already-red
rows are touched. The store's `remove` / `toggle` / `replaceFact` fold before and after and report, as
`dependents-broken { items, cause }`, every OTHER row the change took from green to red — judged on the
fold's own per-row status, never on a second dependency walk, so the symbol lanes and the point lanes
are one class. `replaceFact` still returns `true` for a committed edit; the report is `lastError`.

## Rendering

Orthographic orbit, with hidden edges dashed the way a textbook draws them, decided by **numeric outward
normals** rather than a painter's-algorithm approximation. `scene3.ts` is pure and React-free;
`Figure3.tsx` mounts it. Vector notation (arrows, pairs) is `notation.ts`; general math text comes from
the shared [`shell/math.tsx`](04w-design-shell.md).

**The stated-angle arc lane ([ADR-3D-221](06b-decisions-3d.md#adr-3d-221), [ADR-3D-222](06b-decisions-3d.md#adr-3d-222),
[ADR-3D-227](06b-decisions-3d.md#adr-3d-227)).**
Vertex arcs are ONE map keyed by wedge — the vertex plus its two ray **DIRECTIONS**, matched order-free
within ±1.5° per ray, so two spellings of one physical corner («∠EAS» and «∠BAS» with E on AB) are one
wedge and draw one arc. Directions, not point ids, and a tolerance predicate, not a rounded key: rounding
puts a quantization boundary mid-wedge and double-draws the corners that straddle it. A wedge whose points
do not resolve falls back to id identity. Every producer — `vangle` pins,
shared-apex `angle-seg-eq` claims, `angleMarks` — feeds it and it emits once per wedge, reading `degText`
(the value once stated, the letter until then; the same rule the object-angle lane uses). A stated angle
between two independent segments (`seg-angle`) is anchored on `meetingPoint` from `rightAngles.ts` — the
one answer the knee uses for "do these meet" — and draws nothing for skew or off-ink pairs. `wedgeArc` is
the one arc geometry (13 points), and its RADIUS is a screen quantity
([ADR-3D-229](06b-decisions-3d.md#adr-3d-229)): a producer records the wedge and a builder, and the
radius is chosen once after the viewport fit as `min(ARC_PX, ARM_FRAC × shortest PROJECTED arm) / k`,
with the value placed a fixed pixel gap outside the projected arc. The arc's ANCHOR takes part in the
fit; its points do not, since they are chosen from `k`. **Every annotation this builder emits is sized
in pixels** — the knee (#374), the witness and vector and axis and point labels, the crossing dots, and
now the arc, which was the last world-sized one.

**Row direction ([ADR-3D-228](06b-decisions-3d.md#adr-3d-228)).** A display row's base direction is a
CONTENT decision and comes from `textDir3` — the shared seam 2-D's box and the shared `InputArea`
preview already use — never from `dir="auto"`, which keys off the first strong character and so gives an
LTR base to every fact opening with a Latin point label. Under an LTR base the isolated technical runs are
neutral objects and the Hebrew words between them reverse against each other, so the row states something
the student did not type. The decision lives in `factRowDir3` (`render/FactRow3.tsx`) beside the content
routing, and an inventory lock bans `dir="auto"` in `src3d/` and `src-complex/` outside editable fields.
Structural renderers carry their own direction: `VecMath` wraps a Hebrew row in an RTL container and emits
each expression as one `<math dir="ltr">` island, so the row orders as Hebrew while the mathematics inside
each island reads forward.

## Known gaps

Recorded here because a design doc that omits its weakest properties is not describing the system.

- **The claim verdict is two-valued** — `verifyClaim` returns a boolean, so "the givens forbid it" and
  "the givens leave it free" both surface as `claim-refuted`. In a product entered line by line that
  tells a student their correct answer is wrong because they had not finished typing, and it contradicts
  [`FR-SP-2`](02b-requirements-3d.md) ("under-determination is welcome") in the claim lane specifically.
  The complex builder solves this with a three-valued verdict.
  **[#909](https://github.com/dcodish/geo_builder/issues/909)** — the requirement in 02b deliberately
  describes today's behaviour, not the desired one.
- **A symbolic line-equation given resolves in ~12 s**, and the *canonical* spelling is the slowest path.
  **[#863](https://github.com/dcodish/geo_builder/issues/863).**
- **The DOF cue does not count the six placement DOFs** the sampler now varies, so the number a student
  sees and the freedom the engine has can disagree.
  **[#370](https://github.com/dcodish/geo_builder/issues/370)** — needs a ruling on the cue's semantics.

## The degeneracy notice (#936, [ADR-3D-234](06b-decisions-3d.md#adr-3d-234))

`degenerateSolids` joins the existing `buildNotices3` channel rather than opening a new one, which buys
the channel's two standing properties for free: it is **derived purely from the construction plus the
resolved sample**, so a typed figure and a loaded one behave identically and undo/redo need no plumbing;
and it needs no submit-path wiring at all.

Three pieces:

- `flatnessRatio(pts)` — greatest out-of-plane deviation ÷ greatest vertex separation. Scale-free, and
  the plane is chosen by the **widest-spread normal** so three nearly-collinear vertices cannot fake a
  collapse.
- `FLAT_BY_DESIGN` — the `polygon3/4/5` V8-g lane, exempt because those kinds never had an extent.
- `causesFor(c, ids)` — the stated `scalarPins` whose points all lie in the solid. This is what makes
  the notice name «זווית BAS = 40» rather than «פירמידה SABCD»: the declaration is not a pin.

`DEGENERATE_FLAT_RATIO` is calibrated against the near-miss family, not against comfortable figures —
the ADR carries the table and the corpus sweep is kept as a lock.
## The stated-magnitude lane (#918, [ADR-3D-235](06b-decisions-3d.md#adr-3d-235))

Three kinds of stated magnitude reach the canvas, and they now share one principle: **what the student
said is drawn where they said it, in amber, in screen space.**

| kind | scene record | shape |
| --- | --- | --- |
| distance | `SceneWitness3` | dashed closest-point segment **+** value |
| angle | `SceneAngle3` | arc **+** value |
| **length** | **`SceneMeasure3`** | **value only** — the segment is already drawn |

`SceneMeasure3` is deliberately the smallest of the three: a position, the text, and the pair it
belongs to. A witness-shaped record would draw a second line over the segment's own ink.

The list comes from `statedLengths` in `engine/dataView.ts`, **exported and shared with the data
panel** rather than re-derived in the renderer — one answer to "what did the student state", so the
canvas and the panel cannot disagree. Keyed by the unordered pair, which is what makes a restatement one
label.

Not gated by `showWitnesses` (a stated given is not a debug overlay) and not gated by edge visibility
(the operator's ruling — see the ADR).
