# 02c — Requirements: the analytic-geometry tool (`src-analytic/`)

**Status: standing — this is the product's requirements contract** ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)).
It says what the analytic product promises; [04c](04c-design-analytic.md) says how it is built, and
[docs/19](archive/19-analytic-geometry-tool.md) is the finished build plan. Where they differ, 02c wins.

**How this document is organised.** By what a student meets: principles and scope, the input language, the
objects a student can state, refusals and honesty, configurations, the canvas and the data panel, the ask lane,
session and chrome, the teacher lane; open rulings and the corpus evidence close it. Each requirement is its bold
promise, at most one ruling quote, up to three examples and a Sources line; the history is in the ADRs cited
(`ADR-AG-NNN` in [06c](06c-decisions-analytic.md)). R numbers are creation order; §1–§9 keep their old numbers so
links resolve. R59, R60, R61, R92 and R122 are each defined more than once, and each set is kept together.

---

## Principles and scope

### 1 — The pedagogy

Everything below is downstream of these. If a requirement and a principle disagree, the principle wins.

**P1 — The tool supplies the figure the exam withholds.** 17 of 20 sampled שאלון 572 Q1s print no drawing. The
siblings *reproduce* a printed figure; this product *produces* the one the question withheld.

**P2 — Text is the only source of givens. The picture is not an input.** **The operator's ruling: an exam that
leans on its drawing to carry a given has a defect, not a gap the tool should paper over.** If the text is
incomplete, the student supplies the missing given.

**P3 — The tool never compensates for an under-specified question.** If the text does not say the centre is in
the fourth quadrant, the tool must not put it there because the picture does
([ADR-052](06-decisions.md#adr-052)'s cardinal sin in disguise).

**P4 — An under-determined figure is drawn, and its openness is visible.** Not refused, not defaulted: a member of
the family is drawn and the DOF cue reports how much is still free.

**P5 — The tool cannot tell "the maths leaves a family" from "the exam left something out", and must not try.** It
reports what is open; the human judges which kind of openness it is.

**P6 — A parametric equation is a FAMILY, not a curve.** One member is drawn and the student cycles; freezing it
would teach a size the exam never gave.

**P7 — Configuration choice belongs to the student.** «הציגו תצורה אחרת» substitutes for the exam's «כמתואר
בציור»; the tool never silently picks a branch and presents it as the answer.

**P8 — Noticing under-specification is a skill worth teaching.** The tool makes a sloppy question visibly sloppy.

### 1a — Scope and non-goals (moved from docs/19 §3 and §9, #1861)

**The formula sheet sets the scope:** the distance formula and the canonical ellipse `x²/a² + y²/b² = 1`; the line,
the circle, the point–line distance and the parabola `y² = 2px` (focus `F(p/2, 0)`, directrix `x = −p/2`) are
expected by heart. No hyperbola appears in twenty sampled exams.

**R173 — NO CAS** ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001) D1; operator authority). The equation layer parses and evaluates, never simplifies, solves or manipulates symbolically; pinning a parameter is a numeric root-find of one or two degrees of freedom. A value that moves with a parameter is never written as an expression in it: «הביעו באמצעות k» is not answered.
- Sources: ADR-AG-001, ADR-AG-072.

**R174 — The curve family is closed: the line, the circle, the canonical parabola `y² = 2px` and the canonical ellipse `x²/a² + y²/b² = 1`.** Each other curve (a hyperbola, a rotated or translated conic, a parabola on the y-axis) is refused by name; adding one is a decision, not a fix. A figure may hold as many parabolas and ellipses as the question does.
- Sources: ADR-AG-018.

**What the tool shows, and what it never shows.**
- An answer the givens determine is shown when asked for, in the data panel, never unbidden on the canvas (R20,
  R21, R25; [ADR-AG-016](06c-decisions-analytic.md#adr-ag-016)). Step-by-step solutions are never shown
  ([ADR-W-118](06w-decisions-workspace.md#adr-w-118) B5: *"we dont solve it for you means we dont show you
  step-by-step solutions"*).
- **The technique trace explains, never plans** ([ADR-AG-062](06c-decisions-analytic.md#adr-ag-062), #1053; R84,
  R100). *(Ruled 2026-10-07: *"the tool shows what equation was used as a final step but not a step-by-step solution for how we got all numbers"* — the trace stays.)*
- The tool grades nothing: there is no claim lane ([ADR-AG-072](06c-decisions-analytic.md#adr-ag-072); operator:
  *"I dont want a validation tool"*).
- **The knowledge gate carries the whole honesty boundary:** a row prints a value only when it is knowledge (R3,
  R25; ADR-052).
- **The gauge is inverted:** coordinates are the answer here (R2), so a pattern copied from a sibling is re-read
  against that ([ADR-W-004](06w-decisions-workspace.md#adr-w-004)).

### 2 — The base model

**R1 — The base is geometry with coordinates, because that is how the bagrut is built.** *(Operator ruling.)* The primitive is the **geometric object**; an equation, a shape noun or a coordinate pair are three ways to *state* one.
- Sources: ADR-AG-006, ADR-AG-009.

**R2 — The gauge starts free and coordinates consume it.** «משולש שווה שוקיים ABC» with no coordinates draws generically; «A(0,0)» and «B(4,0)» progressively anchor it.

**R3 — The honesty gate generalises for free, and must not be duplicated.** *A coordinate is knowledge exactly when the givens fix it*; no new mechanism.

**R4 — `src-analytic/` still never imports `src/`.** The constructive layer is **copied, not shared** (`BOUNDARIES.json`).

**R5 — Staging that keeps R1 inside the NO-CAS line** (ADR-AG-001 D1). V1 reaches tier 3 — unanchored figures with interacting constraints — by transplanting the synthetic engine's small solve core and not its grammar; every construct beyond the core is justified by a corpus question.
- Sources: ADR-AG-001, ADR-AG-009.

---

## Input language and notation

### 3a — Input language and notation (families F1–F15) (moved from docs/19 §10, #1861)

**R175 — The student types the exam's own sentence**. Every canonical form is a phrasing that occurs in the corpus, never an invented command language.
- «נתון מעגל I שמשוואתו (x−3)²+(y−4)²=9, ומרכזו בנקודה K» → that sentence is the input
- Sources: ADR-AG-005.

**The catalog is the coverage map.** [`src-analytic/parser/catalogAnalytic.ts`](../src-analytic/parser/catalogAnalytic.ts)
is the in-app guide, the coverage map (a guard re-parses and builds every entry in both languages) and the only
vocabulary the LLM fallback may emit. The families say what the language is built from; a phrasing parses when the
catalog carries it.

#### Naming conventions

| Object | Convention | Notes |
|---|---|---|
| Point | A capital letter with an optional index: `A`, `M`, `F₁`, typed `F1` | The [ADR-228](06-decisions.md#adr-228) subscript convention. A near-miss spelling of a name the figure has is never silently equated; the refusal offers the figure's name ([ADR-AG-234](06c-decisions-analytic.md#adr-ag-234)) |
| Line | `ℓ`, `ℓ₁`, typed `l`, `l1`; a number («הישר 1», «הישר I»); two points (`AB`); a role (`המשיק`) | **`ℓ` is not a `\w` character**: a line name is never followed by `\b`, only by an explicit lookahead |
| Circle | `מעגל I` / `מעגל II`, a digit (`מעגל 1`), `המעגל שמרכזו M`, or bare `המעגל` when it is the only one | A name is the norm |
| Parabola, ellipse | **Anonymous** by default (`הפרבולה`), or named (`פרבולה I`) | A figure may hold several ([ADR-AG-018](06c-decisions-analytic.md#adr-ag-018)); an unnamed curve's identity is its equation (R44) |
| Axes, origin | `ציר ה-x`, `ציר ה-y`, `ראשית הצירים` (`O`) | Always exist, never declared |

#### The fifteen families

| # | Family | Hebrew (canonical) | English |
|---|---|---|---|
| **F1** | Point by coordinates | `נתונה הנקודה A(2,6)` · `A(−9a,0)` | `point A(2,6)` |
| **F2** | Incidence | `הנקודה A נמצאת על האליפסה` · `M נמצאת ברביע הראשון` | `A is on the ellipse` |
| **F3** | Line by equation | `נתון הישר ℓ1: 4y−3x−20=0` · `משוואת הישר AC היא y=−2x+8` | `line l1: 4y−3x−20=0` |
| **F4** | Line by construction | `D היא נקודת החיתוך של הישר AC עם ציר ה-y` · `דרך A העבירו ישר המקביל לציר ה-x` | `through A draw a line parallel to the x-axis` |
| **F5** | Circle | `נתון מעגל I שמשוואתו (x−3)²+(y−4)²=9` · `מעגל שמרכזו F העובר דרך B` | `circle centred M through B` |
| **F6** | Conic (canonical only, R174) | `נתונה פרבולה קנונית שמשוואתה y²=54x` · `אורך הציר הראשי של האליפסה הוא 4t` | `canonical parabola y²=54x` |
| **F7** | Role | `F1 הוא המוקד הימני של האליפסה` · `AC הוא קוטר במעגל` | `AC is a diameter of the circle` |
| **F8** | Tangency | `הישר y=x משיק למעגל` · `שני מעגלים המשיקים זה לזה מבחוץ` | `the tangent to the circle at A` |
| **F9** | Mutual position | `הישר BM מאונך לציר ה-x` · `AC מקביל ל-MB` | `BM is perpendicular to the x-axis` |
| **F10** | Metric given | `AB = 4√5` · `שטח המשולש KLM הוא 9` | `the ratio of the radii is 1:2` |
| **F11** | Parameter declaration (a domain, not a constraint) | `a הוא פרמטר חיובי` · `0<k<6` | `a is a positive parameter` |
| **F12** | Curve edit (affine) | `מזיזים את המעגל ב-9 יחידות ימינה ו-12 יחידות למטה` | `translate the circle 9 right and 12 down` |
| **F13** | Locus: **asked, not stated** (R87, [ADR-AG-072](06c-decisions-analytic.md#adr-ag-072)) | `המקום הגיאומטרי של P` · `משוואת המקום הגיאומטרי של P` | `the locus of P` |
| **F14** | Branch selector / sweep range | `שיעור ה-y של B קטן מ-6` | `the y-coordinate of B is less than 6` |
| **F15** | Ask (the data panel's lane, R23) | `משוואת BD` · `\|AB\|` · `שטח ABC` | `equation of BD` |

**An inequality is one of three things, and they are not interchangeable**
([ADR-AG-005](06c-decisions-analytic.md#adr-ag-005) D7): a parameter's domain (F11, filters roots), a branch
selector (F14, picks among branches after the solve), or a sweep range (F14, bounds a free degree of freedom).

#### Input normalization

A student types on a keyboard and the exam is typeset. Both reach one internal form at one chokepoint,
`normalizeMath` in `src-analytic/engine/expr.ts`, never per rule: `^2` ≡ `²` and `^3` ≡ `³` ·
`-` ≡ `−` · `*` ≡ `·` · `sqrt(5)` ≡ `√5`. A comparison reads the same as `<=` / `>=` or `≤` / `≥`, and
`pi` reads as `π`. Every glyph the palette offers must parse (R11a).

#### Out of the language

- Any curve outside R174's closed family.
- A request to prove («הוכיחו כי …», «הראו כי …»). It is refused as a claim to prove and never recorded
  as a given ([FR-SU-15](02w-requirements-workspace.md)).

### 8b — Two new input families (F16, F17)

From the «lines and points» corpus (§8), numbered onward.

| # | family | Hebrew | English |
| --- | --- | --- | --- |
| **F16** | Derived point by ROLE | `M אמצע AB` · `M מפגש התיכונים במשולש ABC` · `O מפגש חוצי הזוויות במשולש ABC` · `H מפגש הגבהים במשולש ABC` · `P מפגש האנכים האמצעיים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD` | `M is the midpoint of AB` · `M is the centroid of triangle ABC` |
| **F17** | Segment and NEUTRAL shape noun | `הקטע AB` · `משולש ABC` · `מרובע ABCD` | `segment AB` · `triangle ABC` |

**R37 — a shape noun that carries a GIVEN is not an F17 entry.** Drawing «מקבילית» or «ריבוע» as a plain ring would drop a stated given, so they are refused by name until the constraint layer can honour them; F17 is the *neutral* nouns only.
- **⚠ Superseded by R59 (ADR-AG-035):** the refusal only — «מקבילית», «ריבוע» and every other given-carrying noun now build with their givens from the shape registry (`engine/shapes.ts`); F17 is still the neutral nouns.

### 3 — Stating an object

**R6 — The shape noun is OPTIONAL for an equation and LOAD-BEARING for a shape.** *(Operator ruling.)* A bare `y^2=54x` builds; «מקבילית ABCD» *is* the given — it carries AB ∥ DC.
- Sources: ADR-AG-019, #1037.

**R7 — When a noun IS given with an equation, it is checked against the fit and a mismatch is named.** For every noun and family, named or anonymous; by operator ruling, a circle under the ellipse noun is the a = b ellipse.
- «נתונה פרבולה I שמשוואתה x²+y²=16» → refused, «המשוואה … מתארת מעגל, לא פרבולה»
- «נתונה אליפסה שמשוואתה x²/9−y²/16=1» → "that is a hyperbola, and this tool does not draw those"
- Sources: ADR-AG-170.

**R8 — Coordinates are written `A(2,6)`.** *(Operator ruling: comma, not semicolon.)* The exam's `A(2;10)` also parses; the comma stays the taught form.
- Sources: ADR-AG-187, #1618.

**R9 — Picture references are recognised and ignored.** They parse to **nothing**, inline or trailing, and never fall through to `not-handled` (ADR-3D-214 D2).
- «כמתואר בציור», «לפי הציור», «ראו ציור»
- Sources: ADR-3D-214.

**R10 — Anaphora.** «למעגל זה», «המעגל» resolve to an object introduced without a name.

**R11 — Notation.** Primes (`A'`, `F₁'`) and subscripts (`F₁`, `l1`).

**R11a — the PALETTE offers only what the grammar reads**. A chip the parser refuses is worse than no chip. The set: `²` `³` `√()` `·` `π` `ℓ` `≤` `≥` `≠` `|x|` `d_{}` `x_{}` `⊥` `∥` `∠` `°` `α` `β` `γ` `δ` `θ` `<` `S_{}` `⌢{}`, each driven through the real grammar under a totality guard; a chip never changes how a Hebrew line isolates.
- Sources: ADR-AG-122, #1129, #511, ADR-AG-212, #1696, ADR-AG-215, ADR-AG-216, ADR-AG-214, ADR-AG-220, #1622.

**R19 — A shape noun stands alone, and constraints arrive afterwards.** *(Operator: "the idea of order is not relevant since the diagram should either respect all input or refuse to build.")* Any consistent given set builds the same figure in any order; a line the figure cannot honour is refused in full.
- «משולש ABC» then «משוואת הצלע AB היא y = x−1» → the triangle, then constrained
- «M אמצע AB» above «A(0,0)» · «B(4,0)» → M at (2, 0)
- Sources: #1242, ADR-AG-133, #1339, #1340, ADR-AG-156, ADR-W-089.

**R31 — A point's COMPONENTS are addressable and comparable: `Ax > Bx`.** *(Operator ruling.)* The typed form of «שיעור ה-x של קדקוד A גדול משיעור ה-x של קדקוד B».

**R31a — SEMANTICS first, because it decides correctness.** A strict comparison is a **selector** among configurations that satisfy the givens; an equality (`Ax = Bx`) constrains.
- Sources: ADR-AG-005.

**R31b — NOTATION HAZARD, to be measured against the corpus before it ships.** `Ax` already means `A·x`, and `Ax + By + C = 0` has uppercase coefficients (ADR-AG-006 D2, #339).
- Sources: ADR-AG-006, #339.

**R31c — The chosen notation is `x_A`, with the Hebrew phrase as the PRIMARY input.** Both parse and the catalog teaches the words; `A(x)`, `Ax` and `xA` were rejected on collisions.
- Sources: #511.

**R32 — NEAR-MISS INPUT is understood from context where the figure makes it unambiguous, and TAUGHT. Never silently accepted, never guessed, never outsourced.** *(Operator ruling, general.)* `xA` is understood, built **and shown as `x_A`** (ADR-W-030, #778). Ambiguous — a point `A` and a parameter `a` both declared — is refused naming the format; never escalated to the LLM (ADR-3D-214).
- Sources: ADR-W-030, #778, ADR-052, ADR-3D-214.

### The exam's own sentences

**R124 — a given typed in the exam's own frame is understood as the given; a proof target is refused, with a reason**. *(Operator: "refuse and explain that this is not a proof engine".)* A line copied as printed — a given-prefix, a figure reference, «A(2;10)», «∢», the shape as context or predicate, the origin, «בהתאמה», two givens on one line — is the bare given it states, accepted whole or not at all. A request to prove is never drawn (FR-SU-15, ADR-W-107).
- «טרפז ישר זווית ABCD (AB ∥ CD, AB ⊥ AD)» → the shape and its givens
- «הוכיחו כי …» → refused as a claim to prove
- Sources: ADR-AG-187, #1618, #1616, #1666, FR-SU-15, ADR-W-107.

**R114 — the tool never accepts a sentence a textbook would not print; it teaches the one it would**. The textbook sentence is pre-filled for the student to confirm, only when it would be accepted; the exam's imperatives («העבירו», «הורידו», «בחרו») are taught the same way.
- «הוסף C מחלקת את AB ביחס 3:2» → pre-fills «C מחלקת את AB ביחס 3:2»
- «העבירו משיק למעגל בנקודה C» → «המשיק למעגל בנקודה C»
- Sources: ADR-AG-150, #1353, ADR-W-030, ADR-AG-206, #1620.

**R89 — a notation the tool WRITES is a notation it READS**. And a sentence the tool OFFERS (a crossing ring) must be one worth writing.
- `x_A = 5`, «x של A הוא 5» → read; `y` stays free
- «קדקוד A(1,2)», «מרחק של C מ-AB» → read
- Sources: #1127, #1134, ADR-AG-130, #1235, ADR-AG-021, ADR-052.

**R135 — a sentence draws what it names, the extent belongs to the statement, every list and paste is read, and a tangency states its circle**. A pair named in a sentence is drawn («הישר BC» the line, «BC» the segment); «על BC» follows what the figure draws; text pasted from the screen reads as typed.
- «BC משיק למעגל בנקודה B» → BC drawn
- «A, B, C על המעגל» → three points on the circle
- «טרפז ישר זווית ABCD חסום במעגל» → refused, offering «מלבן ABCD חסום במעגל»
- Sources: ADR-AG-198, #1639, #1640, #1636, #1641, #1643, #1554, #1619.

---

## Objects and freedom

### Points

**R38 — a construction may not reference a point the figure does not have.** «M אמצע AB» before `A` exists is refused, naming the missing point (ADR-052, ADR-297); so a parent always precedes its dependent.
- **⚠ Superseded by R143 (ADR-AG-210):** in part — «M אמצע AB» with A and B new now builds, minting them as free points (a later line that declares them is used first, R19); the refusal stands only where 2-D refuses too («AB = 2CD», «AB:BC = 2:3», «AD גובה לצלע BC»).
- Sources: ADR-052, ADR-297, ADR-AG-013.

**R39 — a derived point contributes NO new degree of freedom.** The midpoint of `A(-9a,0)` and `B(3,4)` leaves 1 DOF, and its coordinates are knowledge exactly when its parents' are.

**R57 — the segment noun is optional, and naming a segment introduces its endpoints**. Unknown endpoints are introduced as free vertices, because the sentence NAMES the segment; mentioning a missing point («M אמצע AB») still refuses.
- **⚠ Superseded by R143 (ADR-AG-210):** the last clause only — «M אמצע AB» with missing points now builds, minting them as free points.
- «EF» ≡ «הקטע EF»
- Sources: ADR-AG-033, #1028.

**R53 — a point can be placed ON an object, and the NOUN says whether that is bounded**. Either way `D` has one DOF and moves under «הציגו תצורה אחרת»; a bound consumes no freedom. A point already placed off the object is refused.
- «D על הצלע BC», «D על הקטע BC» → between B and C
- «D על הישר BC» → anywhere on the line
- Sources: ADR-AG-029.

**R58 — a point can be placed in a QUADRANT**. A REGION: the point keeps both degrees of freedom and moves inside it; a point placed elsewhere is refused.
- «C ברביע השלישי», «C is in the third quadrant»
- Sources: ADR-AG-034.

**R68 — stating where an existing point is, is a given about it**. True → accepted; false → refused naming the statement; on a movable figure the figure moves until it holds.
- «M(3,2)» after «M מפגש התיכונים במשולש ABC»
- «שיעור ה-x של M הוא 3» → y left open
- Sources: ADR-AG-042.

**R108 — a derivation stated about a point that ALREADY EXISTS is a condition on it**. *(Operator: "can I define points A and point B and say that point M is [the midpoint]?")* A constraint, not a redefinition; an exact restatement is already known, a false one refused naming the sentence.
- «M אמצע AB» when `M` already exists
- Sources: ADR-AG-144, #1320, #1046.

**R143 — a sentence that names points or a circle the figure does not have yet builds as it does in the 2-D tool**. *(Operator: "accept new letter with same logic the 2d tool has".)* An unlettered centre is never «O» until named.
- «AB קוטר» · «OB רדיוס» → O is the centre
- «BD⊥AC», «M אמצע AB», «AB = 5» with new letters → free points, as in 2-D; «AB = 2CD», «AD גובה לצלע BC» still refused, as in 2-D
- Sources: ADR-AG-210, #1670, #1686.

### Lines and crossings

**R44 — an anonymous curve's identity is its EQUATION**. All unnamed curves share one content-derived namespace; a NAMED curve is identified by its name.
- «הישר x-y+2=0» and «x-y+2=0» → one line
- Sources: ADR-AG-019.

**R47 — a relation is between two DIRECTIONS, and one definition serves them all**. Between a segment, a side, a named line or an axis, either way round; a stated slope is the same algebra, refused over a vertical segment.
- Sources: ADR-AG-024.

**R50 — a NAME can be a geometric claim, and the tool honours it**. Giving the equation of «הישר AB» puts A and B on it (introducing them, free along it, if new); «הישר ℓ1» asserts nothing about any point.
- Sources: ADR-AG-026.

**R51 — the NOUN is optional wherever the NAME is present**. A name is an identity (R44), and «1» and «I» are ONE name (operator ruling, ADR-AG-170 Am. 2).
- «משוואת AB היא y=2x» ≡ «משוואת הישר AB היא y=2x»; «l1: y=2x» ≡ «נתון הישר l1: y=2x»
- «ישר I» after «ישר 1» → refused: keep the notation already in use
- Sources: #1072, ADR-AG-170, ADR-AG-168.

**R56 — a curve minted to CARRY a point is not drawn**. Stating the curve on its own line draws it, as a recorded change; the carrier stays in the data panel.
- **⚠ Superseded by R66 (ADR-AG-041):** the panel clause only — an anonymous carrier gets no data-panel row (`panelListsCurve`); its dependency shows on the point, `B = (x_B, x_B)`. It is still not drawn.
- «נקודה B על הישר y=x» → B is (t,t); no line drawn
- Sources: ADR-AG-032.

**R80 — a line can be CONSTRUCTED through a point**. The direction is copied from AB, a named line or an axis; no freedom is added, and a missing anchor is introduced with its DOF.
- «דרך P עובר ישר מקביל ל AB»
- Sources: ADR-AG-057, ADR-052.

**R95 — a name that denotes a line denotes it to every question, and to every surface**. Its equation, slope and the distance from a point to it can all be asked, whether it was drawn as a line, a segment or a side.
- Sources: #1148, #1139.

**R107 — a line may be created through a point with its direction UNKNOWN**. One degree of freedom, its equation withheld until a later given pins the direction; a named one is crossed and referred to like any line.
- «דרך N עובר ישר», «דרך M עובר ישר l4»
- Sources: ADR-AG-144, #1319, ADR-AG-057.

**R109 — the exam's own line names: a NUMERAL names a line**. *(Operator ruling: a digit MAY name a line or a circle; the student is copying the exam.)* «II» is a numeral, never a phantom point; «הישר AA» is refused.
- «נתון הישר 1: 2x-y+8=0» → the panel says «ישר 1»
- «נקודת החיתוך של הישר 1 עם הישר 2» → refers
- Sources: ADR-AG-144, #1298, #1318, #1072.

**R109 amendment (2026-10-04, [ADR-AG-234](06c-decisions-analytic.md#adr-ag-234), [#1750](https://github.com/dcodish/geo_builder/issues/1750)).** «1» and «l1» stay different names; a near-miss refusal names the one meant, only when that sentence would be accepted.
- «הישר 1 עדיין לא הוגדר. … באיור יש את הישרים l1 ו-l2. התכוונתם ל-l1?»
- Sources: ADR-AG-234, #1750.

**R112 — one line, one row: a curve stated twice is ONE object, however it is spelled**. Identity is the EQUATION; a second name is refused naming the holder; «l3» beside «ישר 3» gets a notice that they are two lines.
- «נתון הישר 1: 2x-y+8=0» then «נתון הישר 2x-y+8=0» → «כבר ידוע»
- Sources: ADR-AG-147, #1342, #1153, ADR-AG-183, #1350.

**R110 — the SIGN of a derived quantity is a stated given, honoured as a selector**. A wrong-sign configuration is never drawn; with no freedom left it is refused on the sentence. «m<0» stays a parameter declaration.
- «שיפוע הישר l5 שלילי», «the slope of l1 is negative»
- Sources: ADR-AG-144, #1323.

**R73 — a crossing can be NAMED**. Two crossings are both listed (R72) and «הציגו תצורה אחרת» moves between them.
- «P נקודת החיתוך של המעגל I עם ציר ה-x»
- Sources: ADR-AG-048.

**R85 — an intersection sentence can say WHICH crossing it means**. Two named crossings are two different points, and the ordinal CHOOSES in a stated order (along the straight from its first letter; left to right for a pair of conics). A two-point sentence names both, the button swapping the assignment.
- «נקודת החיתוך הראשונה של הישר AB עם המעגל I»
- «הישר l1 חותך את המעגל I בנקודות A ו-B» → A the first root
- *"should always swap if there are more than 1 option"*
- Sources: ADR-AG-065, ADR-AG-157, #1268, ADR-AG-185, #1512, #1539, ADR-AG-197, ADR-AG-236, #1416.

**R119 — incidence reads in the exam's orders, over its operands**. A coordinate-only point is named P₁, P₂ … and says so. The verb draws its lines and point, the noun the point alone (2-D's rule, ADR-592). «…בנקודות A ו-B» awaits the operator's root-assignment ruling.
- **⚠ Superseded by R85 (ADR-AG-185):** the last sentence only — «…בנקודות A ו-B» was ruled (#1512, option a) and is built: the sentence names both crossings, assigned as R85 says.
- «הישר CD עובר דרך P», «הצלע BC נמצאת על הישר y=x-4», «הנקודה (-3,7)»
- «AC ו-BD נפגשים בנקודה M» → lines and M; «M מפגש AC ו-BD» → M alone
- Sources: ADR-AG-164, #1281, #1495, ADR-AG-168, #1429, ADR-AG-230, #1609, #1512, ADR-AG-241, #1751, ADR-592.

**R167 — two lines of any kind meet at a named point**. Bisectors, altitudes, medians, perpendiculars, tangents and named lines; parallel or repeated lines are refused.
- «<line> ו<line> נפגשים בנקודה E», with «חוצה זוית B», «הגובה מ-A», «האנך האמצעי לצלע AB» as lines
- «E נקודת החיתוך של X עם Y», «X חותך את Y בנקודה E»
- Sources: ADR-AG-224, #1715, #1727.

### Circles, tangency and conics

**R63 — a letter after «מעגל» is the centre; a NUMERAL is the circle's own name**. A circle named by a centre letter stays anonymous; «נתון מעגל 1» with no equation is still refused (a gap).
- *"the rule of I, II, III for circle names AND 1,2,3 are ok … any other capital letters would become the name of the center"*
- «נתון מעגל O שמשוואתו (x-3)²+(y-5)²=25» → O at the centre
- Sources: ADR-AG-038, ADR-AG-118, #1257.

**R70 — a circle can be given by its centre, and pinned by TANGENCY**. Free centre and radius; tangency to an axis makes the distance the radius, with the side unasserted.
- «נתון מעגל O», «מעגל O משיק לציר x», «משיק לשני הצירים»
- Sources: ADR-AG-045.

**R79 — a centre the student NAMED carries its value**. The equation is read, not solved; a parametric centre stays open, with one label.
- «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» → `O(3, 5)`
- Sources: ADR-AG-055, ADR-052.

**R90 — a circle's CENTRE can be given a letter, by clicking it or by saying so**. It names and never asserts; offered only where a name is missing, never on an anonymous circle. Circle-only.
- «O מרכז המעגל I», or clicking the centre mark
- Sources: #1109, #1529, ADR-AG-179, ADR-AG-048.

**R117 — a circle can be stated by the points it passes through, or by its diameter**. *(Operator ruling: the circle is COMPUTED from its points.)* No equation and no invented centre letter; refused by name for collinear points or an ambiguous circle.
- «מעגל ABD», «המעגל העובר דרך הנקודות A, B ו-D»
- «BD קוטר במעגל», «נתון מעגל שקוטרו BD»
- Sources: ADR-AG-160, #1464, #1324.

**R120 — a circle can be pinned by tangency to a LINE, in every order**. The distance from the centre to the line is the radius; «לצלע» bounds the touch to the side, and the side the circle sits on is not asserted. Equation-only circles and circle-to-circle tangency are refused by name.
- **⚠ Superseded by R122 (ADR-AG-167) and R132 (ADR-AG-195):** the last sentence, in part — two circles stated by their centres can be tangent, and a line can touch an equation-only or computed circle (`tangent-curve`); still refused by name: such a circle touching an axis, or in a circle-to-circle tangency.
- «מעגל M משיק לישרים l1 ו-l2», «הישר l1 משיק למעגל M»
- Sources: ADR-AG-165, #1501, #1503.

**R122 — Radius, focus, directrix and perimeter are sayable and askable in the exam's spellings, and a stated value outside its quantity's range is refused.** Every role is askable in the same words; a radius ≤ 0 is refused («חייב להיות גדול מ-0»); «R=5» is not a radius given.
- «נתון מעגל O שרדיוסו 5», «היקף המשולש ABC הוא 12»
- «מוקד הפרבולה הוא (2,0)» → pins the parabola
- Sources: #1432, ADR-AG-169.

**R122 — two circles can be stated tangent, and which touch is a configuration until the student says**. Sum or difference of radii, cycled by «הציגו תצורה אחרת» until «מבחוץ»/«מבפנים» pins it; concentric circles are never tangent (operator ruling).
- «מעגל M משיק למעגל K», «מעגל O ומעגל M משיקים מבחוץ»
- Sources: ADR-AG-167, #1504.

**R123 — a canonical circle's centre is the point O, unless a letter is already there**. *(Operator: "for canonical circles only, the center is O automatically unless user mentioed a letter".)* A real point, drawn and listed, row «הכלי קרא לנקודה O»; a student's letter at the origin wins.
- «x²+y²=16» → `O(0, 0), r = 4`
- Sources: ADR-AG-184, #1270.

**R130 — the exam's sentences about the circle the figure has are understood**. Points on it, crossings at named points, its centre named and placed, its regions; any circle's centre can be named, by sentence or click.
- «המעגל חותך את ציר ה-x בנקודות B ו-C» → two points, which is which a configuration
- «מרכז המעגל M נמצא על ציר ה-y», «הנקודה B נמצאת מחוץ למעגל»
- Sources: ADR-AG-193, #1619, #1598.

**R131 — a polygon inscribed in a circle, a circle inscribed in a polygon, the points where its sides touch, and «חד זוויות»** Every shape noun can be inscribed (a cyclic parallelogram is drawn as a rectangle); the converse touches every side; «חד זוויות» holds in every configuration.
- «מרובע ABCD חסום במעגל שמרכזו M»
- «במשולש AOB חסום מעגל שמרכזו C» → C where the bisectors meet
- Sources: ADR-AG-194, #1619, #1554.

**R131 amendment — a quadrilateral's incircle on a named centre, the side list, and the sentence with no letters**. The sentence with no letters is lettered by the tool (ABCD), as in 2-D.
- «במרובע ABCD חסום מעגל O», «מעגל M משיק לצלעות AB, BC, CD ו-DA»
- Sources: ADR-AG-242, #1554, ADR-W-108.

**R132 — a tangent at a named point, the tangent as an object, tangency to any circle, and chords**. *(Operator, #1616 ruling 4: "Chord: yes.")* The touch is perpendicular to the radius at every configuration; «המשיק» refers to the drawn tangent.
- «הישר BC משיק למעגל בנקודה B», «המשיק למעגל בנקודה A»
- «הישר y=kx+10 משיק למעגל x²+y²=25» → the values of k, cycled
- Sources: ADR-AG-195, #1619, #1430, #1616.

**R132 amendment — tangents FROM a point, in every spelling 2-D reads**. Unnamed touch points are T then S; a point inside the circle is refused.
- «מנקודה P יוצאים שני משיקים למעגל»
- Sources: ADR-AG-233, #1430.

**R133 — «המעגל» is the circle the figure has**. *(Operator: "The student stated ONE circle twice.")* With two or more circles «המעגל» is refused as ambiguous.
- «נתון מעגל שמרכזו M» then «משוואת המעגל היא (x−3)²+(y−1)²=10» → one circle, M at (3,1)
- Sources: ADR-AG-196, #1633, #1619.

**R139 — every circle can be named in a sentence, a diameter works on every circle, and the data panel never shows the tool's own symbols**. A computed circle by its role or centre; an open equation shows «—», never an internal symbol.
- «D על המעגל החוסם את המשולש ABC», «A על המעגל שמרכזו M»
- Sources: ADR-AG-203, #1659, #1665, #1663.

**R140 — a chord, diameter or radius sentence introduces the points it names, and a chord or diameter typed before any circle draws the circle**. *(Operator ruling: as the 2-D tool does.)* New points join the circle free; a diameter's ends are antipodal; with no circle, the circle is drawn.
- after «A(3,4)» on x²+y²=25: «AB קוטר במעגל» → B at (−3,−4)
- Sources: ADR-AG-204, #1669, #1670.

**R162 — the circle and tangent sentences of the 2-D tool build here too, and two fresh circles are named by order**. *(Operator, on #1688: "first mention names one".)* Two circles keep their stated relation always.
- «מעגל סביב O רדיוס 5», «מעגל O שהיקפו 6π» (radius 3)
- «שני מעגלים נחתכים בנקודות A ו-B», «AB משיק משותף חיצוני / פנימי לשני המעגלים»
- Sources: ADR-AG-219, #1622, #1693, #1688.

**R163 — arcs, sectors, semicircles and the diameter from a point build as they do in the 2-D tool**. *(Operator ruling: analytic gives 2-D's verdict, and the arc rows are ported.)* An arc's measure is its central angle.
- «קשת AB = 40 במעגל O», «⌢{AC} = 60°»
- «חצי מעגל שקוטרו AB», «גזרה AOB בזווית 80»
- Sources: ADR-AG-220, #1622.

**R74 — a conic is named by its KIND**. A figure holding two of a kind refuses the reference rather than inventing an ordinal.
- «הנקודה A נמצאת על האליפסה», «P על הפרבולה»
- Sources: ADR-AG-049.

### Shapes, cevians and derived points

**R59 — a shape noun carries its givens, and adding a noun is adding a ROW**. A contradiction is reported, not drawn; «שטח ה<noun>» names any of them.
- «מקבילית ABCD» → `AB ∥ DC` holds; likewise «ריבוע», «מעוין», «דלתון», the trapezoids and special triangles
- Sources: ADR-AG-035.

**R59 — a crossing with a DRAWN PIECE exists only on the piece, and the figure decides what is a piece**. *(Operator: "a root outside the segment is not a lesser configuration — it is not a configuration".)* A side is a segment whatever word named it.
- «P נקודת החיתוך של הצלע CA עם המעגל» → only the roots on CA
- Sources: ADR-AG-135, #1232, #1069.

**R62 — a diagonal is an object, and a concurrency point has a verb**. Vertices are optional when the figure has one shape to mean, refused otherwise.
- «אלכסוני המרובע ABCD נפגשים בנקודה O» ≡ «O מפגש האלכסונים במרובע ABCD»
- Sources: ADR-AG-037, ADR-AG-182.

**R75 — naming a shape draws it**. With its noun's givens, absorbed if already there; «שטח ABC הוא 6» draws nothing.
- «שטח המשולש ABC הוא 7» → the triangle drawn
- Sources: ADR-AG-050.

**R93 — what a shape noun leaves UNSTATED is the tool's assumption, and stating it is new information**. Naming a pair settles it and is recorded; a noun that states the pair makes a restatement «כבר ידוע».
- «טרפז ABCD» · «BC מקביל ל-AD» → the figure rotates
- Sources: #1159.

**R126 — a trapezoid keeps exactly one pair of parallel sides, or the page says it no longer does**. *(Operator: "when i wrote c=90 it accepted but then i got a rectangle.")* When the givens force a parallelogram, an amber warning names the trapezoid and the forcing line.
- «טרפז ישר זווית ABCO» · «∠C = 90» · «∠O = 90» → «הטרפז ABCO כבר אינו טרפז…»
- Sources: ADR-AG-189, #1627, ADR-157, ADR-165.

**R103 — a named cevian ACTUALLY REACHES its side, and may reach the side's extension**. D on BC and the role's property, in every configuration; the foot is on the LINE, beyond the side for an obtuse triangle.
- «AD גובה לצלע BC»
- Sources: #1232.

**R103a — the TRIANGLE may identify the side, and the cevian's target may be written with a maqaf**. The apex must be a vertex of the triangle, or the sentence is refused by name.
- «AD תיכון במשולש ABC» ≡ «AD תיכון ל-BC»
- Sources: #1165, #1222, ADR-052.

**R103b — the angle bisector is the third cevian, and a cevian may leave its target or its foot to the figure**. *(Operator rulings: the 2-D tool's verdict is the reference; a reserved name is said.)*
- «CE חוצה זווית C במשולש ABC», «AD חוצה את הזווית BAC»
- «תיכון מ-A במשולש ABC» → foot named M, «הכלי קרא לנקודה M»
- «OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה»
- Sources: ADR-AG-209, #1284, #1222, #1240, #1263.

**R103c — the tool's letters are 2-D's, and «תיכון ליתר» never assumes the right angle**. **M** for a midpoint, **H** for a foot (F is the focus letter here); with only «משולש ישר-זווית ABC», «תיכון ליתר» ASKS which side is the hypotenuse.
- Sources: ADR-AG-211, #1620, #1222, #1281, #1689.

**R137 — a piece named by its role is understood wherever a side is, and the role is honoured; a length given draws the pairs it names**. *(Operator: "when i write הישר BC מקביל לציר ה-x — accepted. when i write המיתר BC מקביל לציר ה-x — its rejected".)*
- «המיתר BC מקביל לציר ה-x», «אורך השוק BC הוא 6»
- «OC = 15, BC = 3» → both drawn; «d_{OC} = 15» → nothing drawn
- Sources: ADR-AG-200, #1651, #1652, #1620, #1637.

**R141 — the perpendicular from a point and its foot, the line through a point that cuts a side, and «האנך» as a reference**. *(Operator ruling: the analytic tool behaves as 2-D for plane geometry.)* An unnamed foot is named by the tool.
- «האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D»
- «המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D»
- Sources: ADR-AG-207, #1620, ADR-AG-229, #1727, ADR-AG-213.

**R142 — diagonals, extensions, the midsegment and a point on a side with a condition read as the 2-D tool reads them**. *(Operator ruling: the same experience as 2-D.)*
- «E על המשך הצלע BC» → E past C
- «הנקודה E נמצאת על צלע BC כך ש-AE = AC»
- «קטע האמצעים לצלע BC במשולש ABC» → midpoints M and N
- Sources: ADR-AG-208, #1620.

**R160 — the shapes and points the 2-D tool reads build the same here**. *(Operator ruling: the same experience as 2-D.)*
- «מחומש משוכלל ABCDE», «ריבוע ABCD שצלעו הוא 1», «מלבן 4 על 6»
- «נקודה E על AC ב-40%», «AB בין 5 ל-9» → «5 < AB < 9»
- Sources: ADR-AG-217, #1622, #1621, ADR-AG-216.

**R161 — lengths, angles, crossings and congruent or similar triangles read as the 2-D tool reads them**. *(Operator rulings: the same experience as 2-D.)* **x and y are never a length here** (ADR-AG-222).
- «△ABC ≅ △DEF», «△ABC ~ △DEF»
- «AB = 3a» → a free length; «AB = 3x» → refused, saying why
- Sources: ADR-AG-218, #1622, ADR-AG-222.

**R165 — the equation of a median keeps the median; position words between points choose the configuration; an obtuse triangle is obtuse at one vertex, any of the three**. *(Operator rulings.)* Screen directions are the analytic tool's own reading, because its axes are fixed.
- «משוואת התיכון AD היא y=x» → the line and the median
- «A ו-D על ציר ה-y (D מעל A)», «C מימין ל-B»
- «משולש קהה זווית ABC» → obtuse at one vertex, cycled
- Sources: ADR-AG-222, #1662, #1706, #1707, #1708.

### Measures, angles and ratios

**R49 — a length is a VALUE the student can do arithmetic with**. One capability; a combination needing a negative length is unsatisfiable, naming the statement.
- «AB = 10», «AB + BC = DE», «2·AB = 3·CD», «AC² + BC² = 1250»
- Sources: ADR-AG-025.

**R65 — a measure can be compared to another measure**. Areas and lengths mix in one expression.
- «שטח ABC גדול פי 3 משטח CEF», «AB גדול ב-2 מ-BC»
- Sources: ADR-AG-040.

**R88 — a RATIO between two lengths is a given the student can state**. The bare colon relates existing points; the keyworded divider mints the point. An n-way chain is refused by name.
- «AC:CB = 3:2»
- «C מחלקת את AB ביחס 3:2» → C minted on AB
- Sources: #1124.

**R106 — a given that DETERMINES a parameter is honoured**. *(Operator: "one design pass over the solver … so a student can build the whole 572 figure".)* **An unpinned parameter is never moved by the solve**; an unused declared symbol is marked «(לא בשימוש בשרטוט)».
- «N על הישר l3» on `(k+1)x+2y−12+5k=0` → `k = 2`, in the panel
- Sources: ADR-AG-144, #1317, ADR-AG-047, #1343.

**R115 — an angle can be stated by its SIZE and in RATIO to another angle**. Each holds at every configuration and consumes a degree of freedom.
- «∠ABC = 60», «60 מעלות», «∠ABC = 2∠ACB»
- Sources: ADR-AG-153, #1331.

**R115 amendment (2026-09-25, [ADR-AG-158](06c-decisions-analytic.md#adr-ag-158), [#1407](https://github.com/dcodish/geo_builder/issues/1407)).** When exactly two edges meet at the vertex; otherwise it asks for three letters.
- «זווית C = 60», «∠B = 2∠C»
- «זוית C=200» after «משולש ABC» → refused, as «זווית ACB = 200» is
- Sources: ADR-AG-158, #1407.

**R115 amendment 2 (2026-10-05, [ADR-AG-243](06c-decisions-analytic.md#adr-ag-243), [#1445](https://github.com/dcodish/geo_builder/issues/1445); operator ruling 2026-09-27).** The tool says «הובן כ-∠ABC»; with no single shape it lists every angle at the vertex.
- after «משולש ABC» · «BD חוצה זווית B»: «זווית B = 30» → ∠ABC
- Sources: ADR-AG-243, #1445, #1407, ADR-590.

**R150 — the ratio of two measures, and the area notation S_{…}, as givens**. *(Operator ruling: the same experience as 2-D.)* A ratio pins only what it states.
- «היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5»
- «S_{ABC} = 13», «DO/DE = 2/3»
- Sources: ADR-AG-214, #1621.

**R151 — an angle named by a Greek letter, and the tan or cos of an angle, read as givens**. The Greek letter is a free value; «sin∢ACB = 1/2» is not read.
- **⚠ Superseded by R170 (ADR-AG-227):** the sine clause only — «sin∢ACB = 1/2» is read now, as a choice between its two angles, cycled.
- «∢ABC = α», «α = 30»
- «tan∢BAO = 2», «cos∢ACB = 3/4»
- Sources: ADR-AG-215, #1621.

**R152 — a coordinate stated about a vertex, and an order between measures, read as the 2-D tool reads them**. Not read: «D מעל A», «C מימין ל-B» (awaiting a ruling) and «משולש קהה זווית ABC».
- **⚠ Superseded by R165 (ADR-AG-222):** the «Not read» sentence only — all three are read now: position words are ruled (#1706) and choose the configuration, and an obtuse triangle is obtuse at one vertex, cycled (#1708).
- «שיעור ה-y של הקודקוד B קטן מ-6» → chooses B's position
- «AB < BC», «20 < ∢ABC < 60», «זווית ABC קהה»
- Sources: ADR-AG-216, #1621.

**R164 — an order between angle names, an angle named by a label, and an area label on an empty canvas build as they do in the 2-D tool**. A point's name or an indexed name is never a value.
- «α < β», «20 < α < 60»
- «נסמן זוית BAM כ-A1» → ∠A1 in the panel
- Sources: ADR-AG-221, #1622, ADR-AG-238, #1701, ADR-AG-244, #1785.

**R170 — a trig given is written as its angle and indicates a slope; sin is a choice between two angles**. *(Operator ruling: "translate it to an angle and write it down".)*
- «tan∢BAO = 2» → «63.43°»
- «sin∢ABC = 0.5» → «30° או 150°», cycled
- Sources: ADR-AG-227, #1719.

---

## Givens and honesty

### 9 — What a REFUSAL owes the student ([ADR-AG-017](06c-decisions-analytic.md#adr-ag-017))

**A rule that recognised the student's sentence owes an answer about that sentence.** A stated given never
vanishes, a message names the STATEMENT rather than internal state, and "I did not understand" is never said about
a sentence the tool parsed.

**R41 — a shape noun ASSERTS its vertex count, and the assertion is checked.** In the noun typed and in the construct named.
- «משולש ABCD», «מפגש התיכונים במרובע ABC», «משולש ABA» → refused

**R42 — `x` and `y` name the PLANE and cannot be a point's unknown.** Decided at the point of entry, never dropped by omission.
- «M(3,y)» → refused, naming «M(3,t)»

**R43 — a refusal names what it collided WITH, not only that it collided.** In the construct's own corpus noun, never in internal terms.
- a name clash → «M is already the centroid»

**R104 — a rule owns only what it PARSED; a sentence it recognised by its noun alone reaches the fallback**. *(Operator: "I would expect the llm escape to assist in cases of minor deviations".)* A refusal the tool genuinely owns never goes to the model.
- «פרבולה I: y^2=2x», «נתון מעגל I - x^2+y^2=16» → «לא הצלחתי להבין»
- Sources: ADR-AG-139, #1272.

**R111 — a word the tool does not know is REFUSED in a value slot, never absorbed as parameters**. **A stated magnitude is never silently reinterpreted**; juxtaposed parameters (`2a`, `25k²`) are kept.
- «שיפוע הישר l1 הוא tan(30)» → refused, never `t·a·n·30`
- Sources: ADR-AG-145, #1321.

**R171 — a condition on x or y is never taken for a parameter; until a curve can be drawn in part, it is refused and says so**. Nothing of the line is recorded; a condition on another letter is a domain. Drawing part of a curve is #1846.
- «y = 2x + 1, x > 0», «x הוא פרמטר» → refused, saying why
- «y = ax + 1, a > 0» → a domain
- Sources: ADR-AG-246, #1832, #1846.

**R45 — a statement that adds nothing is SAID, not silently swallowed or silently duplicated**. Informational, never an error; a restatement that NARROWS is recorded.
- a repeated given → «זה כבר ידוע…», no second row
- «a הוא פרמטר» then «a<13» → recorded
- Sources: ADR-AG-020.

**R54 — a given the figure already ENTAILS is said, not recorded**. A given true only at the current sample is not this case.
- a given a determined figure satisfies → «זה כבר נובע מהנתונים שכתבתם», no row
- Sources: ADR-AG-030.

**R125 — "already follows" is said only about a given that is true in EVERY configuration of the figure**. *(Narrows R54.)* A given true in one drawing and false in another chooses between them and is recorded; when unsure, the tool records.
- the square of exam 15 Q5: «שיפוע הצלע BC הוא -1/2» → B(2,4), C(10,0); «…הוא 1/2» → the mirror
- Sources: ADR-AG-188, #1629.

**R48 — a given is checked whether or not the figure had freedom to spare**. Whether a carrier was free to move is a fact about the solver, not about whether the given holds.
- Sources: ADR-AG-024, #1062.

**R97 — a given the tool accepted is DRIVEN, or it is refused; it is never quietly ignored**. This is the honesty invariant at the level of the SOLVE: an unmeasurable quantity is a fault, never a zero residual.
- «המרחק מ-A לישר l1 = 5» → drives the figure, or is refused naming the sentence
- Sources: #1201.

**R98 — a position carries at most one name, and a second naming is REFUSED, never silent**. Renaming is the student's action; the same letter again is a no-op.
- «P מרכז המעגל I» then «O מרכז המעגל I» → refused, naming P
- Sources: #1153, ADR-052.

**R55 — an object that cannot exist is REPORTED once the figure has no freedom left**. Silent while another configuration may yet have it (ADR-AG-008).
- the circumcentre of three fixed collinear points → named as not existing
- Sources: ADR-AG-031, ADR-AG-008.

**R105 — a given set that holds only in a degenerate limit is REFUSED, never drawn as a needle**. Thinness is never the test; an exact solution is.
- «משולש ABC» · «AB = AC» · «∠ABC = 90» → refused at every configuration
- a stated 1° apex → drawn
- Sources: ADR-AG-143, #1334, ADR-537.

**R172 — givens that force a declared polygon flat are refused, and the refusal says why**. *(Operator, ADR-W-115: "a flat line is not a triangle".)* Never «לא נמצאה תצורה», never drawn flat; amends R105's message and R64's pinned arm (ADR-AG-129).
- «משולש ABC» · «AB = 5» · «BC = 3» · «AC = 8» → refused, naming the polygon
- 5, 3, 7.9 → drawn
- Sources: ADR-AG-247, #1849, ADR-W-115, ADR-AG-129.

---

## Configurations

### 4 — Parameters, families and choice

**R12 — A parameter is normal, not an edge case.** An unknown parameter is never a reason to refuse: sample it inside its domain and draw.

**R13 — Three cases, decided by whether the KIND is invariant over the domain:**
- kind invariant (`y² = 2px`, `p ≠ 0`) → draw it; the parameter is a free DOF
- degenerate at isolated values (`p = 0`) → excluded from the domain (`vacant`, not an error)
- **kind varies over the domain** (`x² + a·y² = 1`) → **OPEN — needs a ruling**; never silently draw and name the sampled kind

**R14 — Every unstated choice is a DOF, discrete or continuous.** *(Operator ruling, on «אחד המוקדים».)* Continuous ones resample, discrete ones cycle — one mechanism (ADR-481).
- «אחד המוקדים», which axis crossing is `A` → discrete; «E נקודה על האליפסה» → continuous
- Sources: ADR-481.

**R15 — The tool never has to work out that an ambiguity is harmless.** No special case for "this one happens not to matter".

**R16 — `isKnowledge` must vary the DISCRETE choices too, not only the continuous parameters.** Judged over **one configuration pool** of 24 drawable configurations; an unconfirmed value shows «בודק…», never a provisional number (operator ruling B′).
- Sources: ADR-AG-180, #1473.

**R17 — A stated shape noun may narrow a parameter's domain.** **OPEN:** intended, or should a stated kind never constrain? (beside ADR-AG-005 D7's three domains)
- «נתונה אליפסה שמשוואתה x²+a·y²=1»
- Sources: ADR-AG-005.

**R18 — The DOF cue is visible**, as in the siblings («דרגות חופש: 1»). **OPEN:** passive reporting only, or may the tool prompt?

### Choosing and cycling configurations

**R46 — a free magnitude is sampled across everything the student left open, SIGN INCLUDED**. Later configurations reach the other sign within a few presses; degenerate values are avoided (ADR-052).
- Sources: ADR-AG-022, ADR-052.

**R118 — a comparison of coordinates chooses the configuration**. It consumes no freedom; an unsatisfiable comparison is refused, naming the sentence.
- «שיעור ה-x של B גדול משיעור ה-x של D», `x_B > 3`, «שיעור ה-x של B חיובי»
- Sources: ADR-AG-161, #1462.

**R134 — a value is printed only when the drawings whose givens hold agree on it, and «הציגו תצורה אחרת» always reaches another drawing when there is one**. *(Operator: «הציגו תצורה אחרת» "should always swap if there are more than 1 option".)* A drawing that breaks a given is never a source of a value.
- «משולש AOB ישר זווית» with its incentre free → A «(x_A, 0)», C «—»
- «המעגל משיק לציר ה-x» then «…חותך את ציר ה-x בנקודות B ו-C» → refused
- Sources: ADR-AG-197, #1642, #1638, #1635, #1634, #1539.

**R169 — a value the givens fix up to two choices shows both**. *(Operator ruling: "if there are 2 options, we always show up to 2 options".)* More than two, or a moving value, shows «—».
- 9/4 as printed → «שיפוע AB: -2 או 2»
- Sources: ADR-AG-226, #1716.

**R72 — a value with two roots is listed as BOTH**. Never one alone, never a dash, the drawn one marked.
- «C נמצאת על הישר 4x-y-9=0» with «שטח המשולש ABC הוא 7» → `(1, -5) או [(3, 3)]`
- Sources: ADR-AG-047.

**R91 — a shape noun promises a RING, and every configuration drawn honours it**. A crossed or collapsed ring is never drawn or offered; a concave or thin one is honest.
- Sources: #1158, #1166, ADR-052.

**R92 — among the configurations it MAY show, the tool opens on one that is not a sliver**. A preference, never a requirement; coordinates that force a bad ring refuse the line (operator ruling), never «לא נמצאה תצורה».
- «משולש ABC» → not a 1.4° wedge when a 25° triangle is two presses away
- Sources: ADR-AG-128, #1174, ADR-AG-129, #1170, ADR-AG-008.

**R92 — a point may be NAMED before it is PLACED**. Two degrees of freedom, a free point and not a default; this is what R87 stands on.
- «נקודה M», «נתונה נקודה M», «point M»
- Sources: #1136, ADR-052, #1171.

**R64 — a shape is never drawn collapsed**. It costs no freedom: only the drawing is filtered.
- «דלתון ABCD» → B and D never together
- Sources: ADR-AG-039.

**R60 — an unstated choice CYCLES, and the student can consume it**. A stated right angle settles it at every configuration.
- «משולש ישר-זווית ABC» → cycles all three seats
- «זווית B ישרה», «∡B = 90», «∠ABC = 90» → seat B
- Sources: ADR-AG-035, #1330, ADR-AG-142.

**R60 amendment (2026-09-21, [ADR-AG-146](06c-decisions-analytic.md#adr-ag-146), [#1333](https://github.com/dcodish/geo_builder/issues/1333)).** **A length is named by a WHOLE name, never a letter pair from inside a word.** A non-right angle value remains out of scope.
- **⚠ Superseded by R115 (ADR-AG-153):** the last sentence only — a non-right angle value is a given now («∠ABC = 60», «זווית ABC = 37»); the whole-name rule stands.
- «angle ABC = 90», «ANGLE ABC = 90»
- Sources: ADR-AG-146, #1333.

**R60 / R115 amendment (2026-09-24, [ADR-AG-155](06c-decisions-analytic.md#adr-ag-155), [#1407](https://github.com/dcodish/geo_builder/issues/1407)).**
- «זוית», «מעויין», «שוה» → read as «זווית», «מעוין», «שווה»
- Sources: ADR-AG-155, #1407.

**R60 — a crossing that lands on a point the figure ALREADY HAS is refused, naming it**. The crossing is affirmed and the name refused; a line crossed with itself gets an owned refusal (operator ruling).
- «P נקודת החיתוך של הישר AB עם הישר CD» where it is `B` → refused, naming B
- Sources: ADR-AG-125, ADR-W-066, #1175, #1255, ADR-AG-140, #1273.

**R60 — two positions the solver cannot tell apart are ONE position, and a determined point's locus is that point**. *(Operator: "a cluster inside solver resolution is not an option set".)* The tolerance derives from the solve's own stopping rule.
- «המקום הגיאומטרי של M» on a determined M → «נקודה · (4, 0)»
- Sources: ADR-AG-136, #1259, #1227.

**R61 — a value is called KNOWN only if it holds across configurations that actually DIFFER**. A value the student GAVE stays known; a determined figure keeps reporting.
- Sources: ADR-AG-126.

**R61 — two distinct named points are never opened on top of each other**. *(Operator: "It should automatically look for a different config and show them differently".)* A preference below validity; closer than a hundredth of the frame counts as stacked.
- Sources: ADR-W-072, ADR-AG-138, #1254, #1526, ADR-AG-181.

**R61 — a circle marks its centre**. Its value shows only when the givens fix it; the centre owns no letter (amended by R123).
- Sources: ADR-AG-036.

---

## The canvas and the panel

### 4a — Data entry and what the canvas shows

**R20 — The canvas carries what the student's givens state; what is DERIVED from the figure is in the data panel.** *(Operator: "Anything that is derived from the figure should stay in the data panel".)* The canvas is the question, the panel the answer. Recorded exception (ADR-W-118 B7): a computed circle centre's coordinates, when the givens determine them.
- **⚠ Ruled to change (2026-10-07, ADR-W-118 B7 · #1863):** a parabola's focus and directrix and an ellipse's foci are marked on the canvas, with their values when determined. Until that ships, the canvas marks none of them.
- Sources: #1563, ADR-AG-016, ADR-W-118, ADR-AG-036, #1863.

**R21 — A derived equation IS often the exam's answer, and showing it — in the data panel (R20) — is correct.** *(Operator ruling: "for a student the answer is meaningless without the way".)* The panel's equation is a CHECK on the student's own working (precedent: ADR-3D-032).
- Sources: ADR-AG-016, ADR-3D-032.

**R22 — The equation display doubles as a DETERMINACY signal, and that is the pedagogy.** *The moment the equation appears is the moment the student learns their givens were sufficient.*

**R28 — The data panel is an INVENTORY of everything the figure determines — distances and equations — exactly as in 2-D, 3-D and complex.** *(Operator ruling.)* The shared panel sections in `shell/` are reused (#671).
- Sources: #671.

**R29 — The analytic-specific row types are EQUATIONS and COORDINATES.** Every line's and curve's equation and every point's coordinates are first-class rows.

**R30 — Three panel behaviours carry over unchanged from the siblings, and need no new design:** Per-row knowledge gating; on request («חשב ערכים»), not on every keystroke; invalidated by the next fact. **OPEN — what bounds "all"?** (open ruling 7).

### The data panel's rows

**R52 — a length the figure KNOWS is shown, on the surface that matches its provenance**. In the panel when it is knowledge, `—` while it moves; a length the student's given pinned is also drawn on the segment, a derived one is not.
- Sources: ADR-AG-028.

**R66 — a point on a line shows what the line makes of it**. The dependency, not a value; the carrier gets no row of its own.
- «B על הישר y=x» → `B = (x_B, x_B)`
- Sources: ADR-AG-041.

**R67 — the panel shows every drawn segment's SLOPE**, under the same honesty gate as every other row: «אנכי» for a vertical segment, an open row while it can change.
- Sources: ADR-AG-041.

**R71 — a curve the givens have not fixed shows its equation**. The row names what the figure depends on; no value is printed.
- «נתונה פרבולה שמשוואתה y²=2px» → `y^2 - 2·p·x = 0`
- Sources: ADR-AG-046.

**R94 — a value the student stated exactly is DISPLAYED exactly**. Small rationals, where the value is knowledge; a decimal the student typed stays theirs (#723).
- slope of «y=(4/3)x» → `4/3`, not `1.33`
- Sources: #1120, #723.

**R99 — a panel heading names what the rows ARE, in the student's own word**. A heading is a promise about its rows.
- «משוואות» / «Equations», not «עקומים» (`kind: 'curve'`)
- Sources: #1147.

**R100 — an answer and its working are separate rows, and the working can be folded away**. The working shows by default and folds (#1053); the measure menu offers only non-zero questions.
- Sources: #1206, #1207, #1053.

**R102 — a curve row states an EQUATION, and its derived properties fold beneath it**. **The given is never replaced by something derived from it**; properties fold beneath, one line per fact.
- circle → «מרכז המעגל: (3, 4)» and «r = 5»
- parabola → «מוקד: (27/2, 0)» and «מדריך: x = -27/2»
- Sources: #1212, #1023, ADR-AG-232, #1597.

**R113 — a display name reads in the right order, whatever its script**. A Hebrew noun with a digit is an island in a left-to-right row; the input box has its own open question (#1296).
- «ישר 3: 3x + 2y − 2 = 0», never «3 :3 ישרx + 2y − 2 = 0»
- Sources: ADR-AG-149, #1344, #1296.

**R116 — a line's angle with the positive x-axis is shown and can be asked**. In [0°, 180°), only when the givens fix it.
- «הזווית בין הישר l1 לציר ה-x» → α, with m = tan α
- Sources: ADR-AG-154, #1322.

**R136 — the data panel's option rows read in order, and a loaded figure keeps the student's own words**. *(Operator: "the −2 is not shown correctly".)* A loaded file shows every row as saved, an AI-built row as the student's sentence.
- `A = [(3/5, 4/5)] או (4, -2)`, never `(2- ,4)`
- `AB: 2 · זווית עם ציר ה-x: 63.43°`
- Sources: ADR-AG-199, #1644, #1632, #1637.

### Marks and framing on the canvas

**R40 — a derived point can SHOW THE CONSTRUCTION that defines it.** *(Operator ruling.)* Dotted, behind one «הצג בנייה» toggle, off by default; each median's parts labelled `2x`/`x`. Decoration, never an object (ADR-297). An altitude's knee is drawn only when the student STATED it (ADR-AG-237); other labels open (ADR-AG-014).
- *"if the angle is calculated as 90 we don't show it since its derived"*
- Sources: ADR-297, #1241, ADR-AG-237, ADR-AG-014.

**R166 — a stated length is written where it can be read**. Away from the figure, in its blue, never over a label, point, side or the axis numbers; stable across «הציגו תצורה אחרת».
- «AO = 3» → «3» beside AO
- Sources: ADR-AG-223, #1717.

**R168 — what the student stated about a length, an angle, an area or an arc is written on the figure, as in the 2-D tool**. *(Operator ruling: the canvas shows the inputs, the panel the computed values — ADR-W-047.)* A stated right angle is a knee, never «90°»; an area writes «S=13» inside (ADR-W-118 B9); each value sits at its mark (ADR-AG-228); a computed value is never written. Known gap: #1806.
- «∢ABC = 30» → «30°»; «tan∢BAO = 2» → «63.43°»
- «AB = 3a» → «3a»
- **⚠ Ruled to change (2026-10-07, ADR-W-118 B2 · #1805):** a stated equality draws no mark at rest; it stays in the givens list, and is drawn only in an opt-in relations layer. The text below describes the code until that ships. A stated equality marks both members: «AB = AC» one tick on each, «∢ABC = ∢ACB» one arc on each; a second equality class draws two.
- Sources: ADR-AG-225, #1714, ADR-W-047, #1241, ADR-AG-237, #1806, ADR-W-118, #1805, #1865, #1733, ADR-AG-228.

**R25a — the object the student asked for is ON SCREEN**. A collapsed trace does not widen the frame, and the frame stays put across «הציגו תצורה אחרת» (ADR-AG-137).
- *"fit once, then the frame is the student's"*
- Sources: ADR-AG-120, #1198, ADR-AG-137, #1262.

**R127 — the whole figure is always on the canvas**. *(Operator: "the full shape is always in the canvas".)* A frame that must change widens just enough, never shrinks or jumps; both axes keep one scale (#1225). Supersedes R25a's re-fit rule for a press.
- Sources: ADR-AG-190, #1624, #1225.

**R83 — the canvas can be moved and aimed**. Drag pans, the wheel zooms about the cursor, the grid stays crisp, ↺ restores the framing.
- Sources: ADR-AG-060.

**R101 — a figure the student opens is visible**. A stale view is never carried over: a loaded save that looks empty reads as data loss.
- Sources: #1209.

---

## The ask lane and the locus

**R23 — TWO SURFACES, ONE GRAMMAR: the main input CONSTRUCTS, the data panel ASKS.** *(Operator ruling.)* The surface, not the wording, decides; one catalog serves both lanes.
- «מעגל חוסם את ABC» in the main input → drawn; in the data panel → calculated, not drawn

**R24 — An ask is a DRY-RUN construction: built internally, evaluated, discarded.** It never mutates the figure; it rides ADR-AG-002's ask channel (#741), on the shape of 2-D's `dryRunOutcome`.
- Sources: ADR-AG-002, #741.

**R25 — An ask obeys `isKnowledge`, the honesty gate the canvas also passes** (the canvas is gated by provenance as well, ADR-AG-016). An undetermined answer is *open*, never a seed's value.
- Sources: ADR-AG-016.

**R26 — A queried object that cannot exist refuses honestly, and is never a silent blank.**
- the circumcircle of a collapsed triangle; a tangent from a point inside a circle → refused honestly

**R27 — Queries persist with the figure.** A saved figure carries what was built and what was asked.

**R69 — the data panel can be ASKED**. **A thing is askable because it is sayable**; an unanswerable question says why.
- «AB», «שטח ABC», «AB + BC», «משוואת הישר ℓ1»
- Sources: ADR-AG-044.

**R96 — every spelling of one question gets one answer, and the operands decide the roles**. Roles come from what an operand IS; crossing lines have no distance and are refused saying why (operator ruling); a BOUND is never an equality.
- *"`d_{AB}` should also work for questions. as well as `|AB|`"*
- «המרחק בין C ל-AB» ≡ «המרחק בין AB ל-C»
- `d_{AB}` · `|AB|` · «אורך הקטע AB» → one term
- Sources: #1151, ADR-AG-132, #1205, ADR-AG-119, #1128, ADR-AG-127, #1260, #1149.

**R95a — and what a line can be ASKED, its row SHOWS**. A vertical line says «אנכי»; an open line gains no slope (ADR-052); fractional slopes read `y = -x/2 + 7/2` (#1180).
- a determined line → its explicit form `y = mx + b` and its slope
- Sources: ADR-AG-121, #1219, #1180, #1023, ADR-052.

**R121 — A three-letter ANGLE is askable, with a method hint.** No worked formula (operator ruling: outside the curriculum); a STATED angle gets no hint.
- «זווית BMC» → the value, and «ניתן להשתמש בשיפועי הישרים או במשפט הקוסינוסים»
- Sources: #1331, #1409, #1525, ADR-AG-176.

**R84 — an answer shows the move that produced it**. Never the bare formula, never the arithmetic worked through.
- `AB = 5` → `d = √((4-1)² + (5-1)²)`
- Sources: ADR-AG-062.

**R86 — a measurement can be reached by CLICKING, and a distance is shown as a construction**. Each offer is the sentence the student could have typed; the answer row stays until ✕ (ADR-AG-067).
- clicking a point → its coordinates and its distance to each named line, drawn as a perpendicular
- Sources: ADR-AG-066, ADR-AG-067.

**R87 — a point the givens leave one degree of freedom has a מקום גיאומטרי, and the tool draws it, names it and prints its equation when it can determine it**. **It is asked, not stated.** The trace draws whenever the point has one free DOF; the kind is named when invariant; the equation prints only when the set is; every component is drawn, and only where the givens allow. **The tool never grades** (ADR-AG-072 §6, amending ADR-AG-001 D1).
- «נקודה P» · «PA מאונך ל-PB» · «המקום הגיאומטרי של P» → trace, kind, equation
- *"there should be 2 lines for this loci and both should appear since they are the answer together and not just one of them"*
- Sources: ADR-AG-072, #1301, ADR-AG-141, ADR-052, ADR-AG-166, #1500, #1508, ADR-AG-245, #1817.

---

## Session and chrome

**R76 — a crossing can be clicked, and it adds the SENTENCE**. The ring commits the sentence typing would add; a curve's equation is a name, conics included (ADR-AG-056, ADR-AG-061).
- clicking → «P נקודת החיתוך של הישר AB עם הישר CD»
- Sources: ADR-AG-054, ADR-AG-056, #1092, ADR-AG-061, #1096, #1100.

**R77 — the session can be SAVED, and a load says what it restored**. A line that no longer builds is NAMED, never dropped.
- `<name>-analytic.json`, replayed through the real parser
- Sources: ADR-AG-055.

**R78 — the input panel never reorders what the student wrote**. Every surface isolates the runs; the live preview TYPESETS what it shows (ADR-W-070, #1152, #1082).
- «(x-3)^2+(y-4)^2=9» never becomes «2+(y-4)^2=9^(x-3)»
- Sources: ADR-AG-055, ADR-W-070, #1152, #1082.

**R81 — the chrome is the suite's**. The suite's row and order; undo and redo cover every edit; the givens list mutes, edits and deletes (ADR-AG-177).
- «הציגו תצורה אחרת» opposite «בטל · בצע שוב · נקה הכל»
- Sources: ADR-AG-058, ADR-AG-177.

**R82 — the givens list is typeset, like the data panel**
- `(x-3)²+(y-5)²=25`, not `(x-3)^2+…`; editing shows what was typed
- Sources: ADR-AG-059.

**R128 — a point's letter can be changed, and everything that names it follows**. *(Operator: "if a letter is changed, change all inputs and data panel items accordingly".)* Nothing moves; one «בטל» undoes it.
- «שנה שם A ל-G» → «משולש GBC»; a taken letter → refused, quoting its line
- Sources: ADR-AG-191, #1154.

**R129 — two letters can be swapped; a taken letter offers the swap; the tool's own letters can be changed; a changed letter does not move the drawing**. *(Operator: "if a letter is occupied, it offers to switch letters".)* Amends R128's last sentence: a tool-chosen letter is renamed through the student's sentence.
- «החלף בין A ל-B», "swap A and B"
- Sources: ADR-AG-192, #1631, #1303.

**R138 — a clicked segment can be hidden or dashed, and a clicked unnamed centre takes the letter the student types**. *(Operator: "click on a segment and hide it like we have in 2d".)* Persisted with the figure; a canonical centre stays O (R123).
- a clicked segment → «הסתירו קטע», «מקווקו»
- a clicked unlettered centre, typed M → «M מרכז המעגל x²+y²=16»
- Sources: ADR-AG-201, #1653, #1598.

---

## The teacher lane

### 7 — The teacher lane ([ADR-AG-010](06c-decisions-analytic.md#adr-ag-010))

Teachers are a named secondary audience ([01 §Audience](01-vision.md)). A question that prints no figure leaves the
teacher nothing to project either. Ruled by the operator.

**R33 — Worksheet authoring is in scope, on the mechanism that already ships.** The clean image (FR-HS-5) and the `.docx` question page (FR-HS-11, [ADR-251](06-decisions.md#adr-251)), from `shell/`, good enough for a class — played, not assumed.
- Sources: FR-HS-5, FR-HS-11, ADR-251.

**R34 — Live demonstration is a design condition, not a feature.** «הציגו תצורה אחרת» and R22's signal are designed **for projection**: the cycle visible as a *change*.

**R35 — No teacher mode, no role, no separate surface.** A teacher uses the student's tool ([02 §Actors](02-requirements.md)).

**R36 — The teacher lane is gated by expressiveness, not by chrome.** Paid for at ADR-AG-009's B3 gate, not before.
- Sources: ADR-AG-009, FR-HS-10.

**Offered and NOT taken — a corpus question library** (FR-HS-10): not rejected on the merits, not in scope now.

---

## Open rulings

### 6 — Open rulings

1. ~~**R8** — semicolon coordinates: parsed-but-untaught, or refused?~~ — **parsed**: `A(2;10)` ≡ `A(2,10)`
   ([ADR-AG-187](06c-decisions-analytic.md#adr-ag-187)); amended 2026-10-07, #1861.
2. **R13** — a parametric equation whose *kind* changes with the parameter: what does the tool do?
3. **R17** — may a stated shape noun narrow a parameter's domain?
4. **R18** — DOF reporting: passive only, or may it prompt?
5. ~~**R20** — equation toggle: a single global «הצג משוואות» is likely enough now that R21 makes it a legibility control rather than a gate. Per-object display only if a case demands it.~~ — resolved by [ADR-AG-016](06c-decisions-analytic.md#adr-ag-016): a derived equation is in the data panel, not on the canvas; amended 2026-10-07, #1861.
6. ~~**R5 / 5b** — where V1 stops: tier 2 vs tier 3~~ — **tier 3, by transplant**
   ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)). Still open: **part ג of 5b in or out.**
7. **R28** — what bounds "all computable" in the data panel: pairwise, named-only, or grouped?
8. ~~The conic-slot removal needs its own ADR superseding the slot decision.~~ — done by
   [ADR-AG-018](06c-decisions-analytic.md#adr-ag-018), which supersedes ADR-AG-005 D6's one-parabola-one-ellipse
   slot; amended 2026-10-07, #1861.

[ADR-AG-072](06c-decisions-analytic.md#adr-ag-072) §5 partly answers R13 (a locus's kind shows when invariant) and
R18 (the locus lane is triggered by one free DOF); whether either generalises is the operator's to say.

---

## Corpus evidence

### 5 — Capability inventory, from the corpus

Two שאלון 572 questions, read for what the FIGURE needs; each need is now a requirement above.

#### 5a — Parallelogram + tangent circle (`A(3;5)`, `B(7;8)`, r=5, area 13)

Two of seven givens are coordinates and the rest synthetic: an equation-first model cannot express it, so R1 is not
a preference.

#### 5b — Canonical ellipse `x²/a² + y²/b² = 1`

Nearly every named point is *derived*, and symbolic parameters are the normal mode; two ellipses in one figure since
[ADR-AG-018](06c-decisions-analytic.md#adr-ag-018) (#1026). Part ג is a parameterised family: **א and ב in scope, ג
deferred — OPEN.**

#### 5c — Triangle by SIDE EQUATIONS + parabola with a pinned parameter

A polygon arrives three ways (shape noun, derived vertices, side equations) and only an object-first model holds
them; D on `y²=2px` pins `p` through geometry, the pin ADR-AG-006 did not claim; part ב grows part א's figure
([ADR-AG-003](06c-decisions-analytic.md#adr-ag-003)).

#### 5d — Right triangle from a vertex, a hypotenuse equation, and an ORDER given (no figure)

With no picture the exam states everything, labelling included — the positive proof of P2. It needs 2-D's seat
channel (ADR-163), an exclusion (#507) and a **named result that crosses parts**, beyond ADR-AG-003.

### 8 — The «lines and points» corpus, and what it changes

About forty exercises from the topic being taught now — midpoints, medians, areas, sides by equation
([docs/19 §2](archive/19-analytic-geometry-tool.md) has the 572 corpus).

#### 8a — What it contains, by frequency

Shape nouns (~20), sides by equation (~18), points on objects or in regions (~14), midpoints (~11), area as a pin
(~10); fewer named points than 572, «צלע» for «ישר», no conics.

#### 8c — What this corpus says about the roadmap

It confirms R1 independently and put midpoints first ([ADR-AG-013](06c-decisions-analytic.md#adr-ag-013)). **OPEN —
the 471 ↔ 572 profile split** ([ADR-AG-012](06c-decisions-analytic.md#adr-ag-012) did not settle it).
