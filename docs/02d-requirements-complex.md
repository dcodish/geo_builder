# 02d — Functional Requirements: the complex-numbers Builder

_The contract for `src-complex/`, live at `/complex-builder/`. Registered in [`DOCS.json`](../DOCS.json)
as the `complex` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)).
Decisions: [06d](06d-decisions-complex.md) (`ADR-CX-NNN`). Grammar contract: the appendix
*Grammar families* below. Build plan (history): [docs/27](archive/27-complex-numbers-tool.md)._

## What this document owns

A student types the givens of a bagrut **complex-numbers** question (שאלון 572, פרק ראשון Q3) line by
line and **the Gauss plane draws itself — the drawing the exam never prints.** Same charter as every
sibling: **the student types the givens, the tool reproduces the figure and verifies claims — it never
solves the exam question.**

**Contract, not catalogue.** The sentence families the language is built from are the appendix
*Grammar families* below (moved from docs/27 §10 and §10b), which is the authoritative grammar contract.
What parses today is the catalogue, [`src-complex/parser/catalog.ts`](../src-complex/parser/catalog.ts),
the coverage map. The formula
sheet is [docs/29](29-complex-formula-reference.md) — **byte-matched against the formula table by a
test**, so it cannot drift. This document owns what the product promises: what is exact, what a number
on screen means, what may never be dropped, and how a claim is answered.

Shared surfaces — suite chrome, the ask lane and data panel, save/load, export, bidi — are
[02w](02w-requirements-workspace.md). Quality attributes are
[03](03-nonfunctional-requirements.md).

IDs are stable references, and their areas are letters-only so the FR-resolution guard can see them
(`FR-[A-Z]+-\d+`). "Must" = the product is dishonest or broken without it; "Should" = desirable;
"Later" = not yet.

## The figure

- **FR-GP-1 (Must)** — **The Gauss plane is always drawn.** The exam prints no diagram; producing it is
  the product's reason to exist. Every stated number appears on the plane, not only in a panel.
- **FR-GP-2 (Must)** — **The ordered fact list is the source of truth and the figure is derived.**
  Positions are never stored, so undo cannot desync. *(The suite-wide architecture, stated here because
  it is a promise about correctness, not only a design choice.)*
- **FR-GP-3 (Must)** — **A display transform never reaches the parser or the engine.** The
  polar↔cartesian toggle and the `n` stepper are **view state** — outside the store and outside undo — so
  changing how a number is *shown* can never change what was *stated*. *(ADR-CX-001 D3.)*
- **FR-GP-4 (Should)** — **The cartesian view reads in radicals, not decimals, when each part is
  readable.** `2cis120` reads «z₁ = -1+√3i», `2cis45` reads «√2+√2i», and `z^5 = 100`'s real root
  reads «⁵√100». Each part (real, imaginary) is judged on its own: a part that needs **at most one** root
  sign stays exact; a part that needs **two or more** (a nested root «√(2+√2)», a sum «(√6+√2)/4», a
  root times a sum «⁵√100·(√5-1)/4») is shown as a decimal. One label carries one sign, so if EITHER part
  is a decimal the whole reading is the decimal with `≈` (`cis18` reads «≈ 0.95+0.31i»). A value with no
  radical form this product knows (cos 20°) keeps its decimal with `≈`, so the display never invents an
  exact value. A part that is zero is not written: «-2», «2i», never «-2+0i». The polar view is
  unaffected. *(Operator, #1404 and its 2026-09-25 ruling; realised — [ADR-CX-046](06d-decisions-complex.md#adr-cx-046).)*
- **FR-GP-5 (Must)** — **The inside/on/outside count is of the OTHER numbers.** A stated polygon shades
  its interior, and the strip under the canvas counts the plotted numbers against it, never its own corners
  (they lie on it by definition). A corner that is also a solution of an equation («z^3 = 8», then the
  triangle z1z2z3) is one of the numbers asked about and still counts. A polygon with nothing else to count
  shows no strip. *(Realised — [ADR-CX-053](06d-decisions-complex.md#adr-cx-053), #1425.)*

- **FR-GP-6 (Must)** — **The grid covers what is on screen.** In both views the gridlines, rings, rays and
  axis numbers span the whole visible canvas, at every zoom and on a canvas wider than it is tall, and
  their step grows as the view zooms out. *(Realised — [ADR-W-094](06w-decisions-workspace.md#adr-w-094), #1465.)*

## Exactness and configuration

- **FR-CN-1 (Must)** — **The multiplicative core is answered EXACTLY, not numerically.** Products,
  quotients, powers and roots are decided by exact linear algebra over ℚ rather than by iteration, so a
  modulus or argument the givens force is reported without drift. Sums, areas, distances and series are
  the numeric residue. *(Realised — [ADR-CX-006](06d-decisions-complex.md).)*
- **FR-CN-2 (Must)** — **NO CAS.** The exact core is bounded linear algebra over two vector spaces.
  Anything wanting general symbolic algebra is refused and escalated to the operator, never approximated.
  *(Operator authority.)*
- **FR-CN-3 (Must)** — **Branches are the exam's «כל האפשרויות».** The integer `k` in an angle equation
  enumerates a real solution set, and "show another configuration" walks that set — so a question asking
  for *all* possibilities can be seen, not just described. **A numeric equation's roots are
  configurations too**: `z1² − 4z1 + 13 = 0` (one NUMBER z₁ that is a root) is two drawings, and the
  button walks both. *(Amended — [ADR-CX-049](06d-decisions-complex.md#adr-cx-049); the fresh-letter
  `z² − 4z + 13 = 0` is a solution set since [ADR-CX-050](06d-decisions-complex.md#adr-cx-050), FR-CN-6.)*
- **FR-CN-4 (Must)** — **A default is a starting value, never a fixed one.** An unstated magnitude is a
  free degree of freedom: it must move on "another configuration" or when a later given forces it. Free
  DOF has **one** definition — the nullspace dimension — read by the cue, the knowledge gates and the
  sampler alike, so the three can never disagree. *(The complex form of [ADR-052](06-decisions.md#adr-052).)*
  A sign-free parameter's SIGN is part of its freedom (FR-CN-7): it is sampled, never assumed positive.
  *(Amended — [ADR-CX-045](06d-decisions-complex.md#adr-cx-045).)* A free polygon's starting drawing
  reads as the shape it names: «משולש ABC» is never a sliver and «מרובע ABCD» is convex, while every vertex
  stays free. *(Amended — [ADR-CX-052](06d-decisions-complex.md#adr-cx-052), #1424.)*
- **FR-CN-5 (Must)** — **A second mention of a name is a GIVEN, not a redefinition.** Re-stating `z1`
  adds information about the existing number; it never silently replaces it. *(Realised —
  [ADR-CX-005](06d-decisions-complex.md), [ADR-CX-009](06d-decisions-complex.md).)*
- **FR-CN-6 (Must)** — **The solutions of an equation on a bare letter ARE its indexed names.** `z³ = 8`
  plots z₁, z₂, z₃ (in argument order from the principal solution), every one a name the student can
  write in the next sentence. **The spelling does not matter**: `z³ − 8 = 0`, `z³ + 8 = 0`, `2z³ = 16`
  read exactly as `z³ = …`. **A polynomial equation up to degree 4** in a fresh letter, with number
  coefficients, is a solution set too: `z² − 4z + 13 = 0` plots z₁ = 2+3i and z₂ = 2−3i (in argument
  order), exactly where the roots allow — `|z₁| = √13`. A repeated root is one solution. A letter
  that already carries an index (`z1² − 4z1 + 13 = 0`) is ONE number, never a set, so no doubled
  subscript (z₁₁) is ever printed. A polynomial whose coefficients name other numbers or parameters, or
  of degree 5 or more, keeps the one-point reading of FR-CN-3. A number the student already named z₂ is a claim that it is ONE OF the
  solutions (set membership, [ADR-CX-044](06d-decisions-complex.md#adr-cx-044)): if it is, it keeps its
  place and the unstated names take the remaining solutions in argument order; if it is not, the
  equation is **refused**, naming the student's statement, in either entry order. So a question that states z₁, z₂… and then solves an equation over them is refused
  unless those numbers are its solutions (operator ruling, #1367, with the §2b part ד cost shown).
  The bare letter then names the SET, not a number: any later line that uses it (`z = 1+i`, `|z| = 2`,
  or a second equation such as `z^3 = 1` after `z^3 = 8`) is **refused**, and the refusal says that the
  letter names that equation's solutions. It never says the two statements contradict each other.
  Combining two equations on one letter is not offered (operator ruling on #1428, 2026-09-27; #1466).
  A QUESTION about the bare letter (`Re(z)`, `|z|`) is asked of every solution: it prints when they all
  agree (`|z| = 1` for `z³ = 1`, `Re(z) = 2` for `z² − 4z + 13 = 0`), and otherwise says the value
  differs between the solutions and names one to ask about.
  *(Realised — [ADR-CX-042](06d-decisions-complex.md#adr-cx-042),
  [ADR-CX-048](06d-decisions-complex.md#adr-cx-048); amended — [ADR-CX-050](06d-decisions-complex.md#adr-cx-050), #1434.)*

- **FR-CN-7 (Must)** — **A real parameter's sign follows its use.** A parameter that stands as a
  SIZE — a modulus (`|z1| = 9r`), anything inside `|…|`, a circle's radius, a measure's value, a scale
  factor multiplying a complex number (`z2 = r·z1`) — is **positive**. A parameter in any other use — an
  additive term (`z1 = a + b·i`), a power equated to a number (`u^5 = -32`), a number equal to it
  (`z1 = u`) — is **any real**: `u^5 = -32` gives u = −2, and «z1 = a + b·i · z1 ברביע השני» holds with
  a < 0. An even power of a negative (`u^4 = -16`) has no real solution and is refused. Mixed use is a
  size. The value shown carries the sign (`u = -2`, and `u = ±2` when the configurations disagree).
  *(Operator ruling 2026-09-24; realised — [ADR-CX-045](06d-decisions-complex.md#adr-cx-045).)*
- **FR-CN-8 (Must)** — **A letter declared complex is complex in every line.** «u מספר מרוכב» /
  «u is a complex number» makes u, u₁, u₂… complex exactly as z and w are, in every line before or
  after it: `u^5 = 32` then draws the five roots u₁..u₅ in either order. The declaration is a TYPE, not
  a number: on its own it draws u as a free number, and deleting it returns u to a real parameter. A
  letter used where only a real can stand (a size such as `|z1| = 9r`, a radius, a length, an angle)
  cannot also be declared complex. The refusal names that statement, in either order. A letter the
  figure SOLVED as a real parameter carries a note under its first line saying so and teaching the
  declaration, and only when that declaration would be accepted. *(Operator proposal, #1405; realised —
  [ADR-CX-047](06d-decisions-complex.md#adr-cx-047).)*
- **FR-CN-9 (Must)** — **A true given is never refused as a contradiction, and «could not decide» is
  never «wrong».** Typed numbers relate to each other exactly: «z1 = 2+3i · z2 = -2+3i · z1·z2 = -13» is
  accepted, and so is every true product, quotient, power, conjugate, rotation and rational rescale of
  typed numbers; a false one is still refused, naming an earlier line. A claim over exactly-typed
  numbers is decided exactly — «w ממשי» for w = (2+3i)(2−3i) holds, 3+4i and 3−4i are conjugates. When
  the engine genuinely cannot decide (a direction with no exact relation to the others, such as
  1+√2i), a given is accepted and listed as undecided, and a claim reads «unknown» — never a refusal,
  never ✗. *(#1481, operator ruling P1; realised — [ADR-CX-057](06d-decisions-complex.md#adr-cx-057).)*
- **FR-CN-10 (Must)** — **The symbolic cartesian form reads as the textbook writes it.** **⚠ Ruled to change (2026-10-07, ADR-W-118 B6/D1 · #1862):** the canvas shows the number as the student typed it (its polar form in the polar view) and the computed values go to the data panel — a letter the student did not value is never replaced, so «z₁ = a+bi» does not become «z₁ = 3+bi» on the canvas. The text below describes the code until that ships. «z1 = a+bi»,
  «z = x+yi», «z1 = a-bi», «z1 = a+ib», «w = c+di» define a number from two real parameters, with no
  `*`. The number reads «z₁ = a+bi» in the cartesian view while a and b are free (the polar view prints
  no value), «z₁ = 3+bi» once a = 3 is forced, and exactly as the literal 3+4i once both are. A glued
  `i` whose other letter is a complex number («zi») is ambiguous and is refused with the explicit
  product offered («z*i»); `pi` is never read as p·i. *(#1365, operator ruling 2026-09-24; realised —
  [ADR-CX-058](06d-decisions-complex.md#adr-cx-058). Counting the number's freedom as two rather than
  four is #1410, closed and parked in the icebox.)*
- **FR-CN-11 (Must)** — **The trigonometric form is the same number as cis.** «z1 = 2(cos45 + i sin45)»,
  «z1 = √2(cos45 + i·sin45)», «z1 = cos45 + i sin45» (r omitted is 1), with `i·sin`, `i*sin`,
  `sin45·i`, the `°` or without it, a signed or parenthesised angle, and a symbolic one
  («r(cosθ + i sinθ)»), read exactly as «2cis45» / «r cis θ» does — the same facts, and the student's
  line stays as typed. A form whose two angles differ («cos45 + i sin30») is refused naming both angles,
  never read as either. Angles are read the way `cis` reads them: degrees (radians such as `π/4` are
  read by neither). *(#1534, operator ruling 2026-10-04; realised —
  [ADR-CX-059](06d-decisions-complex.md#adr-cx-059).)*

## Knowledge and claims

- **FR-KN-0 (Must)** — **Everything the polar reading can say is askable.** «arg w» (also «arg(w)»,
  «הארגומנט של w») is a question like «|w|»: answered from the exact argument carrier when the
  direction is fixed in every configuration, withheld (with the reason) for a free direction, and a
  solution-set letter reports its spread; the argument of a number KNOWN to be 0 says 0 has no
  direction, never «not determined». Every question may carry a frame — «מהו …», «חשבו את …», «what is …»
  before, «?» / «= ?» after — for every ask kind alike, and a statement in a frame is never recorded as a
  given. *(#1437; realised — [ADR-CX-055](06d-decisions-complex.md#adr-cx-055), Amendment 1.)*

- **FR-KN-1 (Must)** — **⚠ Ruled to change (2026-10-07, ADR-W-118 B12 · #1867):** a quantity with two possible values shows both, joined by «או», as in every other tool — here too for a question about a solution-set letter (FR-CN-6). The text below describes the code until that ships. **A number printed on screen is knowledge**: invariant across every valid
  configuration, with its gauge pinned. **The figure shows everything; the panel prints only what was
  asked for, and only what is known.** A value true of the current drawing but not forced by the givens
  is not printed. *(The product's statement of the suite rule [FR-DP-3](02w-requirements-workspace.md).)*
  Invariance is ASKED, never counted: the value is compared across every configuration, so a value two
  roots share prints (`Re z = 2`) and one they do not is withheld as differing. When the tool cannot
  prove it has found every configuration it says so — «ייתכן שיש לערך כמה אפשרויות — הוא אינו נקבע
  בוודאות» — and prints nothing. *(Amended — operator ruling 2026-09-27,
  [ADR-CX-049](06d-decisions-complex.md#adr-cx-049).)*
- **FR-KN-2 (Must)** — **A claim is the student's answer: verified, never obeyed.** A claim never
  reshapes the figure to become true. **⚠ Ruled to change (2026-10-07, ADR-W-118 B14/D3 · #1870):** a line
  that asks the student to PROVE something («הוכיחו כי …») is refused like in the other builders
  ([FR-SU-15](02w-requirements-workspace.md)); a bare statement keeps its claim check.
- **FR-KN-3 (Must)** — **A claim gets one of THREE verdicts, and the third is not optional:**
  - **holds** — the givens force it, decided exactly;
  - **refuted** — the givens forbid it, decided exactly;
  - **unknown** — *not decidable from what has been stated.*

  The third exists because **a claim about a direction the givens leave free is not wrong, it is
  unanswered** — and marking it ✗ would tell a student their correct answer was incorrect because they
  had not finished entering the question. In a product whose defining interaction is entering a problem
  **line by line**, that distinction is the difference between a tool that checks a student and one that
  contradicts them out of its own incompleteness. *(Realised — `src-complex/model/claim.ts`. The 3-D
  builder refuses a claim its givens do not determine ([02b FR-CL-1](02b-requirements-3d.md),
  [ADR-3D-260](06b-decisions-3d.md#adr-3d-260)); the operator deferred a three-valued verdict for 3-D
  ([#909](https://github.com/dcodish/geo_builder/issues/909)); amended 2026-10-07, #1861.)*
- **FR-KN-4 (Must)** — **The engine states WHAT happened; the reading layer words it.** A verdict carries
  a structured reason code, not a sentence, so the same fact reads correctly in Hebrew and English and
  the wording can improve without touching the engine. *(Realised — `model/why.ts`, #716.)*
- **FR-KN-5 (Must)** — **⚠ Ruled to change (2026-10-07, ADR-W-118 B6/D1 · #1862):** a letter the student did not value is never replaced on the canvas — `|z₂| = 18r` stays «18r» there, and its value (10) is in the data panel. The text below describes the code until that ships. **A real parameter is visible.** Every parameter the figure mentions is listed
  in the data panel: its exact value when the givens force it (`u^5 = 32` → `u = 2`), «חופשי» when they
  do not. It can be asked (`r`, `9r`), and wherever a solved parameter would print inside another value,
  its value is printed instead (`|z₂| = 18r` with r = 5/9 reads 10). An accepted given never leaves
  nothing on screen. *(Realised — [ADR-CX-043](06d-decisions-complex.md#adr-cx-043), #1389/#1390.)*

## Input honesty

- **FR-LN-1 (Must)** — **Nothing stated is ever silently dropped.** Every non-filler token span in the
  student's line is claimed by the parse, or the line is **refused**. There is exactly one mechanism —
  span accounting — and **no `dropped*` gate is ever added**: the 2-D history shows those accumulate as
  per-symptom patches and still leave holes ([ADR-CX-009](06d-decisions-complex.md) §2).
- **FR-LN-2 (Must)** — **A refusal names the student's statement**, never internal state
  ([FR-SU-5](02w-requirements-workspace.md)), and reads correctly in an RTL sentence with LTR
  mathematics inside it ([FR-WI-2](02w-requirements-workspace.md)).
- **FR-LN-4 (Must)** — **Radicals are input, carried exactly.** «√3 + i», «sqrt(3)», «√(x)», «³√8» /
  «ⁿ√x» and «√2cis45» parse; a root of a rational literal is an exact magnitude (the modulus exponent
  vector), so «√3 + i» IS 2·cis30° and «|z₁| = √2» pins the modulus exactly — never a decimal
  approximation of a stated radical. **A closed radical literal always reads with a value**: one radical
  term per part («1 + √2i», «√5 + 2i», «(1+√2i)/3») is a known number — exact cartesian form, exact
  modulus, and the argument in degrees when the angle table has no exact turn — exactly as «3+4i» is.
  **A root sign over a negative number refuses in every spelling** («√-3», «√(-3)», «√(0-4)», «∛(-8)»);
  the imaginary number is written «i√3». «cis» follows ANY modulus («√(2)cis45», «(√2)cis45»,
  «sqrt(2) cis 45»). A superscript that opens an operand before √ is the root's index («³√8»); one
  attached to an operand stays its power («x³», «2³√8»). The word «שורש» before a number or a
  parenthesis is the √ sign («שורש 3», the 2-D #105 ruling); «שורש של 3» is refused with the √
  spelling of the student's own line and a pointer to the √ button (the 2-D #246 guidance). The √
  palette chip wraps the selection. *(#1435; realised — [ADR-CX-056](06d-decisions-complex.md#adr-cx-056),
  amendment 1.)*
- **FR-LN-3 (Should)** — **Series are in scope**, being part of the corpus question rather than an
  extension of it. *(docs/27 §2.)*

## Non-goals

- **Solving the exam question.** The tool draws and verifies; the student solves.
- **A CAS** (FR-CN-2).
- **Importing from a sibling.** `src-complex/` never imports `src/` or `src3d/`; the `shell/` tree is the
  one sanctioned shared code, and the `engine` layer is copied-never-shared, always
  ([`BOUNDARIES.json`](../BOUNDARIES.json), [ADR-W-016](06w-decisions-workspace.md#adr-w-016)).
- **Regressing a sibling.** Capability grows here and the shipped products never regress — checked by
  `npm run check:siblings`, not promised ([ADR-W-017](06w-decisions-workspace.md#adr-w-017)).

## Appendix — Grammar families (moved from docs/27 §10 and §10b, #1861)

**The input language is a contract of generic sentence FAMILIES**
([ADR-CX-003](06d-decisions-complex.md#adr-cx-003), extended by
[ADR-CX-007](06d-decisions-complex.md#adr-cx-007)). Operator directive (2026-08-14): the language supports
the corpus's questions *"and all families of them"*, *"not only these specific formats"*. A question
that fits no family is a family-level addition to this appendix first, never a one-off parser rule. Every
family carries at least two corpus witnesses, so none is speculative.

**The tables are the contract; the catalogue is the coverage.**
[`src-complex/parser/catalog.ts`](../src-complex/parser/catalog.ts) types every entry by its family id
(`parser/families.ts`), and a guard test reads each entry in Hebrew and English. So which families work
today is a lookup in the catalogue, not a claim of these tables.

Two principles cover most of the surface:
- **P1 — One sentence form; the engine decides whether it drives or checks.** «שטח OZ₁Z₂Z₃ הוא 150r²»
  pins a degree of freedom in one question and is a checkable statement in another. The grammar has ONE
  form per relation. Whether it drives or checks is the engine's degree-of-freedom decision, never a
  second phrasing (the 2-D principle, verbatim).
- **P2 — Display typography normalizes at the parse seam.** Students paste from exam PDFs. Unicode
  subscripts (`Z₁`), superscripts (`Z₂³`), `°`, `−`, `·` and invisible bidi controls normalize before the
  grammar sees them ([ADR-448](06-decisions.md#adr-448), [ADR-3D-144](06b-decisions-3d.md#adr-3d-144)).
  `Z₁Z₂³Z₄` and `z1*z2^3*z4` are the same line.

### The core families (F1–F13)

| # | Family (generic form) | Canonical Hebrew (one witness) | Corpus witnesses |
|---|---|---|---|
| F1 | **Declarations**: k names as complex numbers; real parameters with a domain (`≠ 0`, `> 0`, `טבעי`, an interval). **Implicit typing ([ADR-CX-004](06d-decisions-complex.md#adr-cx-004))**: z- and w-family names (`z`, `z2`, `z10`, `w1`…) are complex WITHOUT a declaration, and the first reference creates a visible free number; other letters (a, d, m, n, r, t…) are real parameters by the same exam convention. **A declaration types a letter family for the whole figure (FR-CN-8, [ADR-CX-047](06d-decisions-complex.md#adr-cx-047))**: «u מספר מרוכב» makes u, u₁, u₂… complex in every line, before or after it; a size or an angle cannot be declared complex | `Z1 ו-Z2 מספרים מרוכבים` (optional for z/w) · `r ≠ 0` · `π/2 < α < π` | §2b, 2020, 2022, 2023 |
| F2 | **Value definitions**: `name = expr`. A literal is cartesian (`3+4i`, or from two real parameters with a glued `i`: `a+bi`, `a+ib`, `x+yi`, FR-CN-10, [ADR-CX-058](06d-decisions-complex.md#adr-cx-058)), polar (`r cis θ`) or trigonometric (`r(cosθ + i sinθ)`, read as the same number as cis, FR-CN-11, [ADR-CX-059](06d-decisions-complex.md#adr-cx-059)). Radicals are input, carried exactly (`√3 + i`, `³√8`, `√2cis45`, FR-LN-4, [ADR-CX-056](06d-decisions-complex.md#adr-cx-056)). Components and angles may be expressions in real parameters; six operations, the conjugate, integer and symbolic `kn+c` powers | `w = (z1/2)^(4n)` · `z1 = (2a²+5a+4) + (2a²+3a+2)i` · `z1 = a+bi` · `z1 = 2(cos45 + i sin45)` · `z1 = √3 + i` | §2b, 2018, 2020, 2022 |
| F3 | **Modulus relations**: `\|A\| ⟨cmp⟩ rhs`, where rhs is a number, a parameter expression or `k·\|B\|`; chained equalities; cmp ∈ {=, <, >, ≤, ≥, ≠} | `\|Z1\| = 9r` · `\|z1\| = \|z2\| = r` · `2\|z_A\| = \|z_M\|` | §2b, 2018, 2024 |
| F4 | **Argument relations**: signed sums and integer multiples of `arg` terms against an angle or each other, any comparator. An inequality is a BRANCH SELECTOR | `arg Z1 − arg Z2 = 90` · `arg Z2 < 45` · `לשניהם אותו ארגומנט` | §2b, 2018, 2024 |
| F5 | **Location givens**: a quadrant; on an axis or half-axis; on a stated line or ray; on a circle; inside, on or outside a region | `Z2 ברביע הראשון` · `C על הישר y=x` · `על ישר העובר דרך ראשית הצירים` | §2b, 2011, 2018, 2023 |
| F6 | **Objects**: a segment between numbers; a polygon of any arity over represented points (the origin `O` is always available); a circle by centre and radius, or circumscribed (`מעגל חוסם`) | `הקטע Z1Z2` · `המרובע OZ1Z2Z3` · `המעגל החוסם את המשולש ABC` | §2b, 2015, 2023 |
| F7 | **Measures** (driving or checked, P1): length or distance, perimeter, area, modulus, argument; the right side a number or a parameter expression | `אורך Z1Z2 = 15r` · `שטח OZ1Z2Z3 הוא 150r²` · `היקף … = 60r` | §2b, 2018, 2023 |
| F8 | **Equations and solution sets**: an equation is ABOUT its letter, in every spelling (`X^n = expr`, `z³ − 8 = 0`, `2z³ = 16`). A FRESH bare letter whose right side uses only numbers already stated enumerates the solution set as X₁..Xₙ in argument order, and the bare letter then names that set: a later line that uses it is refused, saying so (FR-CN-6; [ADR-CX-005](06d-decisions-complex.md#adr-cx-005) as amended by [ADR-CX-042](06d-decisions-complex.md#adr-cx-042), [ADR-CX-048](06d-decisions-complex.md#adr-cx-048) and [ADR-CX-050](06d-decisions-complex.md#adr-cx-050)). A stated Xₖ must be one of the solutions, matched by set membership, or the equation is refused ([ADR-CX-044](06d-decisions-complex.md#adr-cx-044)). An indexed letter (`z1² − 4z1 + 13 = 0`), an existing free letter, or an equation that brings a new name into being on its right side is ONE number constrained by the equation, its roots the configurations (FR-CN-3, [ADR-CX-049](06d-decisions-complex.md#adr-cx-049)); a determined letter makes it a checked statement. Solutions are selected by quadrant, argument range or ordinal; an enumeration ask (`כל האפשרויות`) is the branch surface | `Z^5 = Z1·Z2³·Z4` · `z0 הוא הפתרון ברביע הרביעי` · `(z3)² = 2i — שתי האפשרויות` | §2b, 2018, 2020, 2023, 2024 |
| F9 | **Sequences**: geometric or arithmetic over ℂ; term positions in any order (`בהתאמה`); a term defined by the others; the ratio or difference as a derived (multi-branch) value; sums of consecutive terms, including a symbolic count `kn` | `Z1 ו-Z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא Z4` · `מנת הסדרה — כל האפשרויות` · `w + w² + … + w^(4n)` | §2b, 2015, 2024 |
| F10 | **Number-type claims**: real, pure imaginary, conjugates of each other | `w מדומה טהור` · `z1 ו-z2 צמודים זה לזה` | 2018, 2020, 2022 |
| F11 | **Classification claims**: triangle types (שווה-שוקיים, שווה-צלעות, ישר-זווית), quadrilateral types (the 2-D Hebrew lexicon: מקבילית, מלבן, ריבוע, מעוין, טרפז, דלתון), a regular n-gon, including over a solution set | `OZ2Z3Z4 מקבילית` · `הפתרונות קדקודים של משושה משוכלל` | §2b, 2015, 2018, 2020 |
| F12 | **Quantified claims**: `לכל n טבעי`, a minimal or existential n, and COUNT claims over a set against a region (`כמה … בתוך / על / מחוץ`) | `לכל n, w1 ממשי` · `ה-n המינימלי שעבורו…` · `פתרון אחד על המרובע, אחד בתוכו, שלושה מחוצה לו` | §2b, 2013, 2022, 2023 |
| F13 | **Loci**: `המקום הגאומטרי` of the points satisfying an equation in z (and z̄) from the closed list of locus shapes; locus-type claims (`הוא מעגל`) | `\|z − p\| = m` · `המקום הגאומטרי … הוא מעגל` | 2022, 2024 |

### The extended families (G1–G9, the eleven-exam re-reading)

Re-reading eleven exams of the 2020–2025 booklet against F1–F13 found nine with at least one statement no
family covered; five of the new families carry three or four independent witnesses each.

| # | Family (generic form) | Canonical Hebrew (one witness) | Corpus witnesses |
|---|---|---|---|
| G1 | **Polynomial equations over ℂ** beyond `X^n = expr`. A polynomial of degree 2–4 in a fresh letter with number coefficients (complex ones included) names ALL its roots X₁..Xₙ, in argument order, exact where a small power of the modulus is rational; a repeated root is one solution (FR-CN-6, [ADR-CX-050](06d-decisions-complex.md#adr-cx-050)). The forms: quadratic and quartic, factored, an **affine base** `(z+c)^n = e`, a **leading coefficient** `c·z^n = rhs` (a binomial of any degree is the power shape). A polynomial whose coefficients name another number or a real parameter, or of degree 5 or more that is not a binomial, keeps the one-point reading of FR-CN-3 | `z² − (1+i)z + 2i + 2 = 0` · `z⁴ − 2z² + 4 = 0` · `(z+i)² = 2 + 2√3i` · `i·z⁶ = 1/64` | 2021 חורף ב, 2021 קיץ ב, 2022 נבצרים, 2021 חורף א — **4** |
| G2 | **Generative point-set asks**: complete the polygon from its known vertices, list the numbers representing a vertex set, sample a witness on a locus | `מצאו את שיעוריהם של שאר קדקודי המשושה` · `רשמו את המספרים המרוכבים המתאימים לקדקודי המצולע` · `תנו דוגמה למספר הנמצא על המקום הגיאומטרי` | 2020 קיץ, 2021 חורף ב, 2023 מיוחד ×2 — **4** |
| G3 | **Intersection as a constructor**: line ∩ circle, line ∩ locus, locus ∩ circumscribed circle, naming new points, **selected** by quadrant, ordinal or exclusion (`בשתי נקודות אחרות`) | `הישר AO חותך את המעגל בנקודות C ו-D` · `הישר y = x חותך את המקומות הגאומטריים` | 2021 חורף ב, 2022 נבצרים, 2023 מיוחד — **3** |
| G4 | **Transform over a point SET**: multiply every element of a set by `w`; constrain the image (orientation, coincidence with another set); **solve for the multiplier** | `כופלים כל אחד מהפתרונות במספר מרוכב קבוע w` · `מתקבל מלבן שצלעותיו מקבילות לצירים` · `קדקודי I מתלכדים עם קדקודי II — מצאו את w` | 2020 קיץ ב, 2021 חורף א, 2023 מיוחד — **3** |
| G5 | **Incidence on a regular n-gon**: stated points ARE vertices, driving the integer `n`; per-vertex existence and uniqueness; vertex-count equality between two polygons | `נתון כי D, C, B הן קדקודים של המצולע` · `לכל קדקוד קיים קודקוד אחד בדיוק ש…` · `מספר הקדקודים של II שווה למספר הקדקודים של I` | 2021 חורף ב, 2021 חורף א, 2023 מיוחד — **3** |
| G6 | **Equation synthesis (inverse F8)**: write an equation whose solution set is a given point set | `כתבו משוואה שפתרונותיה הם 12 המספרים` | 2021 חורף א, 2021 חורף ב — **2** |
| G7 | **Sums over a SET, and of an expression in the terms**, not only consecutive sequence terms | `z₁·z̄₁ + z₂·z̄₂ + … + z₁₀·z̄₁₀` · `סכום המספרים שהתקבלו הוא אפס` | 2024 חורף, 2021 חורף א — **2** |
| G8 | **Real-parameter algebra**: sign claims, parameter ratios, ratios of two measures, answers demanded symbolically. **⚠ Ruled to change (2026-10-07, ADR-W-118 B14/D3 · #1870):** a line that asks to prove («הוכיחו כי …») is refused as in the other builders (FR-SU-15, FR-KN-2); the sign claim is then typed as a bare statement, which keeps its claim check | `a·b > 0` (the exam: `הוכיחו כי a·b > 0`) · `מצאו את היחס b/a` · `מצאו את היחס בין השטחים` · `הביעו באמצעות a ו-b` | 2021 קיץ ב ×3, 2020 חורף — **2 exams, 4 statements** |
| G9 | **Non-linear loci**: a locus in `z²` that falls outside the closed locus list; `z̄` with a squared modulus and moduli of constants on both sides | `\|z² − i\| = \|z² + 3i\|` → `y = −1/(2x)` · `\|6 − z̄ − 8i\|² − \|10i\| = \|9+12i\|` | 2023 מיוחד, 2024 חורף — **2** |

**Deferred, and named** (a deferral is recorded, never silent): **G10** Re/Im extraction of a solution
set into *ordered* real parameters (`נסמן את החלקים הממשיים … a₁ < a₂`, 2022 נבצרים) · **G11** a symbolic
degree: `z^n = 2^n` with `n` itself the unknown, pinned by an area equation *in n* (2020 קיץ ב) · **G12**
locus fitting, the inverse of F13: solve for `p, m` so an infinite point family lies on `|z − p| = m`
(2022 חורף).

**A stated non-goal.** 2021 קיץ מועד ב Q3 is the one sampled question a picture barely helps: a quartic,
a factored polynomial in two real parameters, `הוכיחו כי a·b > 0`, and every answer demanded `באמצעות a
ו-b`. The product's thesis is that the figure answers the question, and this exam is the honest
counterexample. It is recorded as a limitation; it does not drive a parameter-algebra subsystem nothing
else needs.
