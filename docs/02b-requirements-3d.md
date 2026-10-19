# 02b — Functional Requirements: the 3-D Space Builder

_The contract for `src3d/`, live at `/3d-builder/`. Registered in [`DOCS.json`](../DOCS.json) as the
`3d` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)). Decisions:
[06b](06b-decisions-3d.md) (`ADR-3D-NNN`). Build plan (archived history): [docs/20](archive/20-space-vectors-tool.md)._

**How this document is organised.** Requirements are grouped by what a student meets: the two lanes and the
space model, reading a statement (read, asked, refused), the vector and equation lanes, claims, rendering, and
coverage. Ids run in order within a topic and never change when a block moves. Each requirement is its promise,
at most a few examples, and a **Sources** line: the reasoning, incidents and tests live in those ADRs and
issues (`ADR-3D-NNN` in [06b](06b-decisions-3d.md), `ADR-W-NNN` in [06w](06w-decisions-workspace.md), bare
`ADR-NNN` in [06](06-decisions.md)).

## What this document owns — and what it deliberately does not

The product answers the bagrut **space/vectors** question (שאלון 572 Q2): vectors in the geometric
approach on solids, the algebraic R³ lane of planes and lines, and the solids they live on. Same charter
as its siblings: **the student types the givens, the tool reproduces the figure and verifies claims — it
never solves the exam question.**

**This is a contract, not a catalogue.** The construct inventory is
[`src3d/parser/catalog3.ts`](../src3d/parser/catalog3.ts), machine-checked to parse in **both** Hebrew and
English; re-listing constructs here would create a second copy that *can* drift. This document owns the
layer above: what the figure promises, what a claim means, what may never be invented, and how the tool
refuses. Shared surfaces — the suite chrome, the ask lane and data panel, save/load, export, bidi — are
[02w](02w-requirements-workspace.md). Quality attributes are [03](03-nonfunctional-requirements.md).

> **A note on the id scheme.** The areas below are letters-only (`FR-SP`, `FR-VC`, …) rather than the
> obvious `FR-3D-*`. The FR-resolution guard matches `FR-[A-Z]+-\d+`, so an id containing a digit in its
> area would be **invisible** to it — the enumeration failure [#904](https://github.com/dcodish/geo_builder/issues/904) exists to close.

IDs are stable references. "Must" = the product is dishonest or broken without it; "Should" = desirable;
"Later" = not yet.

## Scope and non-goals (moved from docs/20 §3 and §10, #1861)

**The scope is the curriculum's space/vectors unit** (`תכני לימוד יב – 5 יחידות`; vectors are 50
hours, the largest י"ב topic):

1. **Geometric vectors**: directed segments, equality, addition, subtraction and scalar multiples.
2. **Linear dependence and uniqueness**: combinations, the line and the plane they span, and the
   segment-ratio arguments that uniqueness of representation gives.
3. **The dot product**: `u·v = |u||v|cos α`, angles and lengths, and vector arguments for space theorems
   (a line ⟂ a plane iff it is ⟂ two non-parallel lines in it; three perpendiculars).
4. **Algebraic R³**: coordinates, ratio division, the parametric line, the plane in both parametric and
   `ax + by + cz + d = 0` form, mutual positions, every distance and every angle.
5. **Solid-geometry applications**: cylinder, cone, sphere, prism and pyramid; their angles, lengths,
   areas and volumes. In scope by the operator's ruling D4 (2026-07-06).

Which of these the student can type today is the catalogue ([`catalog3.ts`](../src3d/parser/catalog3.ts))
and FR-SP-7, not this list.

**The formula sheet** gives exactly: `|u| = √(u₁² + u₂² + u₃²)`, both forms of the dot product, the
point–plane distance, the distance between parallel planes, `sin β = |n·u| / (|n||u|)` (line–plane),
`cos α = |n₁·n₂| / (|n₁||n₂|)` (plane–plane), and the solids' volume and area formulas. Two consequences:
- **There is no cross product** in the curriculum or on the sheet. Normals come from the equation form or
  from perpendicularity conditions, so no cross-product step is ever shown to a student, although the
  engine may compute one internally (FR-VC-4; `src3d/engine/vec3.ts`).
- **Projections and feet are constructions** the student states, not quoted formulas.

**The operator's scope rulings** (2026-07-06, recorded in docs/20 §10):
- **D2 — Rendering is a custom SVG projection**: a textbook wireframe with dashed hidden edges, which the
  student orbits (FR-RD-1). The renderer is swappable. A three.js shaded view is **deferred**: the
  product has none, and adding one is a decision.
- **D3 — NO CAS. The operator marked this as key.** It is a hard boundary with operator authority: a
  feature that seems to need symbolic equation solving beyond a 1–2-DOF numeric root-find goes back to
  the operator; it never grows a CAS quietly (FR-VC-3).
- **D5 — Force and physics vector questions are out of scope**, to be revisited on corpus evidence.

## The two lanes

- **FR-SP-1 (Must)** — The product supports **two lanes over one model**: a **geometric** lane, where the
  student names basis vectors on a solid (`נסמן: AB=u…`) and reasoning is affine, and an **algebraic**
  lane of R³ coordinates, parametric lines and plane equations. A figure may use both; the lane is a
  property of the *statement*, never a mode the student must select.
  - Sources: [docs/20](archive/20-space-vectors-tool.md) §4.

## The space model

- **FR-SP-2 (Must)** — **Under-determination is welcome.** An unstated dimension stays a free degree of
  freedom that resamples on "another configuration", while everything the student *did* pin stands still.
  A stated shape is *respected*: a corner the shape does not determine is minted free (and drivable by later
  givens), never refused and never invented at a specific value. **Two figures that share no point** (two
  triangles, a square beside a triangle, a cube beside a triangle) have a free relative size, orientation and
  placement: a length on each builds, a relation between them («AB ∥ DE») is driven, and «הציגו תצורה אחרת»
  varies them (#1855).
  - Sources: ADR-3D-244 (operator ruling 2026-09-11); ADR-3D-355 (#1855, 2-D's behaviour).
- **FR-SP-3 (Must)** — **Defaults yield to statements; nothing unstated is ever invented.** A prism not
  stated to be right is **oblique**. A recognised-but-dropped qualifier is a silent given.
  - Sources: ADR-052 (this is its 3-D form).
- **FR-SP-4 (Must)** — **Gauge is not knowledge.** A figure's placement, rotation and scale are a gauge.
  An unanchored figure is normalised onto the floor, so «הציגו תצורה אחרת» changes only its shape (operator:
  *"Keep it flat on the floor"*). **A number drawn on the canvas must be seed-invariant knowledge** — the
  shared statement is [FR-DP-3](02w-requirements-workspace.md).
  - Sources: ADR-3D-272, #1861.
- **FR-SP-5 (Must)** — **A statement about an EXISTING object is a given, not a re-creation.** The same
  utterance drives a free figure or verifies a determined one, decided when it is applied. This is the "M1
  duality", and these rules hold it:
  - **The FIGURE's freedom decides the side, never the statement's spelling** — an angle between two
    segments is a given whether or not they meet, whichever endpoint each was written from.
  - **An angle sentence means one quantity on every figure:** «∠BAD = θ» is the angle AT A (0–180°);
    «הזווית בין AB לבין AD היא θ» is the angle between the lines (≤ 90°).
  - **A relation to the COORDINATE FRAME drives a free figure on its own** («מישור ABCD מקביל לציר z»);
    a genuinely false one is still refused.
  - **A coordinate restated, or a vector or dot product stated, on existing points is honoured or refused,
    never ignored**, and a coordinate that pins a point's free freedom places the point, whatever it sits on
    («K על AB · K(1,0,0)» puts K at the midpoint).
  - **A length, angle, ratio or ⊥/∥-to-plane given is judged whatever else is on the canvas.**
  - For the coordinate, vector and measure rules: a true restatement stays green, an unstated or symbolic
    component is not checked, and on a solid or a free figure the statement drives instead.
  - **A refusal never tells a student who may be right that they miscalculated:** a given the tool cannot
    yet make hold («|SO| = 4» on a cone of unstated height) is refused as the tool's limit (for a solid's size,
    «… היכולת הזאת נמצאת בפיתוח, ולכן הצעד לא נוסף.», ADR-3D-363); «בדקו את החישוב» is kept for a given the student's own data contradicts.
  - **A cone, cylinder or sphere size is read whole or refused, never cut:** inside the declaration the
    radius and height take a whole number or a decimal («חרוט שרדיוסו 2.5 וגובהו 3»). A size written as a
    fraction or a root («כדור שרדיוסו 1/2», «חרוט שרדיוסו √2 וגובהו 3») is refused with the same «not yet»
    message («הכלי עדיין לא יודע לקבוע את גודל הכדור לפי נתון כזה …»), never drawn as part of its number.
  - **Every other way of stating a cone, cylinder or sphere size gets that one answer, saying the capability is
    in development** («הכלי עדיין לא יודע לקבוע את גודל החרוט לפי נתון כזה — היכולת הזאת נמצאת בפיתוח, ולכן הצעד
    לא נוסף.», the solid's own noun; English "… this capability is in development, so the step wasn't added."): a
    diameter, slant height, volume or area inside the declaration («חרוט שקוטרו 4 וגובהו 3», «…ויוצרו 5», «כדור
    שקוטרו 6», "cone with radius 2 and slant height 5"); any size on its own line, any noun, «הוא» / «=» / bare,
    in Hebrew or English («רדיוס החרוט הוא 2», «גובה החרוט 3», «אורך היוצר 5», "the height of the cone is 3");
    and a volume or area line on a solid whose size is not stated («נפח החרוט 10»). Never the model, never «לא
    הצלחנו לצייר: …», never a slant height drawn as the height. A volume claim on a sized solid still verifies.
  - Sources: ADR-3D-217, ADR-3D-281, ADR-3D-282, ADR-3D-284, ADR-3D-285, ADR-3D-290, ADR-3D-291,
    ADR-3D-292, ADR-3D-293, [ADR-3D-340](06b-decisions-3d.md#adr-3d-340), [ADR-3D-363](06b-decisions-3d.md#adr-3d-363); #909, #1546, #1550, #1560, #1561,
    #1567, #1569, #1573, #1590, #1615, #2076, #2079.
- **FR-SP-6 (Must)** — **A stated new label must land on the figure.** A decomposition that loses a point
  the student named is **refused, naming the label** — never committed with the point missing. A label
  that already exists is context, not a drop.
- **FR-SP-12 (Must)** — **A ⟂-to-plane statement with ONE new letter creates exactly what it
  determines.** When the known endpoint sits **off** the plane («SO גובה הפירמידה»), the new letter is
  the foot of the perpendicular, on the plane ([ADR-3D-146](06b-decisions-3d.md#adr-3d-146), #579). When it
  lies **in** the plane (decided structurally), the new letter is a free point on the normal, its height
  and side free DOF ([FR-SP-2](#the-space-model)) — never minted **on** the known point. **On a flat
  polygon** (a triangle, quadrilateral or pentagon, which has no base), a bare height is the polygon's
  **altitude**, read as 2-D reads it: «משולש ABC · AD גובה» puts D on BC, in the plane, AD ⟂ BC, the knee
  at D; a trapezoid's height drops on its parallel base, another quadrilateral's on the first side not
  touching the apex; a point already on that side («D על BC · AD גובה») is the foot. A height form 2-D
  does not read on a flat figure («AD אנך», a valued height, an apex that is not a vertex) goes to the AI.
  Never a perpendicular to the polygon's own plane.
  **The dropped-perpendicular imperative reads the same base.** «מ-A מורידים אנך לבסיס» / «אנך יורד מ-A
  לבסיס» / «גובה מנקודה A לבסיס» / "drop a perpendicular from A to the base" on a flat polygon builds the
  **altitude** from that vertex — the foot auto-minted **on the side opposite it** (the same side the bare
  height picks) and the segment drawn, as 2-D does — and that altitude can carry a stated length. The foot
  is never minted **on the apex**, and the line is never drawn perpendicular to the polygon's own plane. An
  apex the host names no opposite side for (a free point, or a rider on a side) is **refused**, as 2-D
  refuses it. A SOLID's base is unchanged: the foot drops on the base face.
  **A role stated about a point that already exists is a given about it.** «D על BC · AD גובה לצלע BC» (and «D
  אמצע BC», «AD תיכון לצלע BC» or «AD חוצה זווית A» before it; on a solid's edge «SD גובה לצלע BC»; English "AD
  is the altitude to BC") builds, as 2-D does: a free rider slides to the foot and nothing else moves; a foot
  already fixed (a midpoint, a bisector's foot) makes the free figure yield so that AD ⟂ BC; a figure the givens
  fix is refused naming the statements. A letter that is the apex, an end of the side or a vertex of a declared
  figure («AB גובה לצלע BC») is still refused as already defined. «זווית A» in a bisector sentence at a vertex of
  exactly ONE polygon is that polygon's angle, said aloud with 2-D's note «הובן כ-∠CAB — הזווית של המצולע בקודקוד
  הזה. …»; a vertex with one angle is read silently, and one shared by several faces still asks.
  - Sources: ADR-3D-146, ADR-3D-268, ADR-3D-315, ADR-3D-321, [ADR-3D-367](06b-decisions-3d.md#adr-3d-367); #579,
    #1499, #1907, #1944, #1942 (operator rulings 2026-10-09 / 2026-10-10 / 2026-10-14).

## Reading a statement — read, asked, refused

- **FR-SP-8 (Must)** — **Case in labels: where the anchor proves a run is a label, it is read as one;
  elsewhere the convention is taught, never guessed.** Point labels are uppercase by convention, and 3-D
  carries case-significant tokens 2-D lacks (axes x/y/z, parameters k/m/t, vector names u/v/w, R vs r,
  ℓ), so a blanket case-fold is not available. A lowercase run reads as a label only where an anchor proves
  it (an angle or point noun, the head of a coordinate definition, the single-letter subject of a midpoint statement);
  elsewhere — a SOLID noun included — it is **taught**, never sent to the paid fallback.
  - Sources: ADR-3D-039, ADR-3D-092, ADR-3D-223, ADR-3D-226, ADR-3D-287; #181, #353, #498, #924, #1523,
    #1861.
- **FR-SP-22 (Must)** — **A symbol typed as any of its look-alike glyphs reads as the symbol**
  ([FR-SU-17](02w-requirements-workspace.md)). «AC ⟂ AB» reads as «AC ⊥ AB» (and «SA ⟂ ABC» on a plane),
  «∡ABC» and «∢ABC» as «∠ABC», a keyboard `<` before a run of letters as «∠», «40⁰» / «40º» / «40˚» as
  40°, and «שורש 2», «sqrt(2)», «sqrt2» and «\sqrt{2}» as √2 — in a statement and in a data-panel question alike, since a measure the student
  can state they can ask (FR-CL-4). A comparison is never turned into an angle. The fact row keeps exactly
  the glyph that was typed. A stated length, area or height takes a RADICAL value («AD = √7», «2√7»,
  «√7/2», «√(3/4)») wherever it takes a decimal, as 2-D does: «AD = √7» and «|AD| = √7» are one given.
  The coefficient may be joined to the root by an explicit product, «2*√7» / «2 · √7» / «3*√2/2», as 2-D reads
  it (#2069, [ADR-3D-369](06b-decisions-3d.md#adr-3d-369)); a product without a root («2*7») is not a value.
  An area is stated with «=», «הוא», a bare «שווה» or English "is" («שטח המשולש ABC הוא 6»), the copulas 2-D's
  area reads, and the triangle sign «△ABC» / «▲ABC» declares triangle ABC, as in 2-D.
  So do a stated DISTANCE («המרחק בין S למישור ABC הוא √2», «… הוא 3/2») and a coordinates claim
  («A=(√2,0,0)», «A=(½,0,0)»), which reads exactly the components «A(√2,0,0)» reads (ADR-3D-362, #2081).
  - Sources: [ADR-3D-329](06b-decisions-3d.md#adr-3d-329), #1912; the prime fold ADR-3D-300 is the same
    seam one symbol over; [ADR-3D-337](06b-decisions-3d.md#adr-3d-337), #1827 (the `sqrt` spelling and the
    radical value in every stated-magnitude slot).
- **FR-SP-21 (Must)** — **A letter the tool cannot read is refused by name, never replaced**
  ([FR-SU-18](02w-requirements-workspace.md)). «משולש ДЖФ» recorded a triangle named A, B, C; it is now
  refused quoting Д, Ж, Ф, at the one statement reader submit and the ✎ edit share, before the grammar and
  before the model. A look-alike letter folds to its Latin twin instead («משולש КМО» records K, M, O), and a
  GREEK vertex name («משולש ΓΔΘ», «משולש αβγ») goes to the model as it does in 2-D, where it used to record
  A, B, C. Greek as notation — a measure name, «ΔABC» — is unchanged.
  - Sources: [ADR-3D-328](06b-decisions-3d.md#adr-3d-328), [ADR-626](06-decisions.md#adr-626), #1919.
- **FR-SP-21a (Must)** — **A plane-geometry angle written in radians is refused and taught in degrees**
  ([FR-SU-20](02w-requirements-workspace.md)). «∠ABC = π» recorded an angle mark labelled π; «∠ABC = π/2» and the
  other spellings went to the model. Each is now refused at the one statement reader submit and the ✎ edit share,
  with 2-D's sentence «בגאומטריה של המישור זוויות נכתבות במעלות — למשל ∠ABC = 90». π as a plane name («B על המישור π2») and a space angle
  with a plane operand are unchanged.
  - Sources: [ADR-W-142](06w-decisions-workspace.md#adr-w-142), [ADR-710](06-decisions.md#adr-710), #1837.

- **FR-SP-23 (Must)** — **A point given with TWO coordinates sends the student to the analytic Builder, in
  2-D's words.** «A(0,0)», «A = (1, 2)», «נקודה A(1,2)», «הנקודה E נמצאת ב-(-1,7)», «A(2;10)» and «A = 3,4»
  are a point in the PLANE, which is the analytic Builder's construct — so the answer is the pointer, not
  «לא הצלחתי להבין את הנתון», and it is given before any model call: «מיקום נקודה לפי שיעורים נעשה בכלי
  «גאומטריה אנליטית» …», the same sentence 2-D gives ([FR-SU-5](02w-requirements-workspace.md),
  ADR-W-118 B1). A point with THREE coordinates is this tool's own sentence and is untouched, as are plane
  and line equations. Nothing is added to the figure.
  - Sources: [ADR-3D-330](06b-decisions-3d.md#adr-3d-330), #1954 (operator report 2026-10-09); the 2-D
    rule is ADR-553, #1245.
- **FR-SP-9 (Must)** — **An UNDER-SPECIFIED statement is told what is missing; only an UNSUPPORTED one is
  told the tool cannot do it.** The two are different failures and must not share a voice: a student who
  wrote a sentence the tool understands but cannot pin down needs to know *which detail* to add, while
  "this is not supported" sends them away from a form that works. A clarification names the alternatives
  in the student's notation and never escalates to the LLM lane; the tool asks only when the figure really
  is ambiguous.
  - Sources: ADR-3D-131, ADR-3D-239; #467, #836, #866.
- **FR-SP-10 (Should)** — **One line may declare a solid AND a construct on it.** «קובייה ABCD עם אלכסון AC'»
  builds both; the student writes the sentence they were going to write anyway rather than splitting it to
  suit the grammar. An ambiguous half keeps its question («עם אלכסון ראשי» on a box ASKS — ADR-052).
  - Sources: ADR-3D-237, #893; the 2-D counterpart is ADR-430, #461.
- **FR-SP-11 (Must)** — **A relation the tool reads is read for every OPERAND KIND it is meaningful for.**
  A student who has seen «הישר ℓ מוכל במישור π» accepted expects «C מוכלת במישור π» — the same relation,
  said about a point — to be accepted too, and a frame that serves one kind and silently escalates
  another is indistinguishable to them from the tool not knowing the relation at all. Where a kind has no
  meaning under a relation (a point has no direction) the answer is a **refusal**, never silence.
  - Sources: ADR-3D-100, ADR-3D-189, ADR-3D-238, ADR-3D-298; #614, #963, #1608.
- **FR-SP-13 (Must)** — **A point placement keeps its condition.** «D על BC ונתון כי AD = AC» states two
  givens, and both are honoured: D rides BC and AD = AC drives it. A condition the tool cannot read declines
  the whole line, and a stated pair relation no committed command carries is refused, naming it. The 2-D
  twin is FR-IN-4d.
  - Sources: ADR-3D-296, #1730.
- **FR-SP-16 (Must)** — **A line that loses a part is refused whole, never drawn without it.** A part of the line
  the reading did not read — a vertex locative («משולש ABC שווה שוקיים ב-B», «טרפז ABCD ישר זווית ב-B», «…ב-A» on
  a prism) — refuses the line with 2-D's one-input-per-line message, listing the parts in the student's words
  cut where the reading stops («(1) משולש ABC שווה שוקיים  (2) ב-B»), **even where the drawing happens to agree**.
  «משולש ABC ישר זווית ב-<V>» is taught instead, as the first two items of that SAME one list:
  «כתבו בשורות נפרדות: (1) משולש ABC  (2) ∠ABC = 90°», the angle named at the student's vertex, and anything
  else the line said continuing the list from (3). One numbered list from (1), whatever the line holds —
  never a second list and never a list starting where the student can see no (1); it is the same list and
  the same words 2-D shows. Givens typed after the head on the same line («…ב-B ו-AB = 4», «…ב-B, AB = 4»)
  continue it: «(3) AB = 4», «(4) BC = 3», and after the parts list too («(1) משולש ABC שווה שוקיים  (2) ב-B
  (3) AB = 4») — only when every such given reads on its own line; otherwise the line goes on as before. The ✎ editor refuses the same edits. A scene the statement lives in
  («…במשולש SBC» on a pyramid, «פירמידה SABC שבסיסה משולש ABC») is context, not a part. The 2-D twin is FR-IN-4g.
  - Sources: ADR-3D-316, ADR-W-120; #1888 (operator rulings 2026-10-08); the numbered single list is
    [ADR-3D-331](06b-decisions-3d.md#adr-3d-331) / #1962 (operator ruling 2026-10-10), porting
    [ADR-611](06-decisions.md#adr-611); the trailing givens are [ADR-3D-370](06b-decisions-3d.md#adr-3d-370) / #2088
    (operator ruling 2026-10-14).
- **FR-SP-17 (Must)** — **A role the reading drops refuses the line.** A cevian or ⟂ word the reading did not read
  («AD תיכון לצלע BC שהוא גם גובה», «…שמאונך לה», "…that is also a median") refuses the line whole, never recording AD
  with one role only. The refusal teaches one line per role («כתבו כל תפקיד בשורה נפרדת: «AD is the altitude to BC», ואחר
  כך «AD is the median to BC».») when those lines record on the figure, and otherwise lists the parts («(1) AD תיכון לצלע
  BC  (2) שהוא גם גובה»). The ✎ editor refuses the same edits. A role word stated twice and read once is not a loss.
  Since 3-D places an altitude and a bisector on an existing point (ADR-3D-367), «AD תיכון לצלע BC שהוא גם גובה» and
  «…שהוא גם חוצה זווית A» are taught their two lines, as in 2-D.
  The 2-D twin is FR-IN-4g.
  - Sources: ADR-3D-317, ADR-3D-367; #1904 (operator rulings 2026-10-08, W22), #1942.
- **FR-SP-14 (Must)** — **One coordinate of a point can be stated and asked.** «x_B = 3», «x_{B}=3», «B_x = 3»,
  «שיעור ה-x של (נקודה) B הוא 3», «x של B הוא 3», «שיעור ה-x של B שווה ל-3» and "the x-coordinate of B is 3"
  state B's x and nothing else: on a new B the point is created with x = 3 and its y and z free (they move
  on «הציגו תצורה אחרת»); on a solid's vertex the solid follows; on a typed point a false value is refused
  and a true one stays green. A sign is read too; a letter value («x_B = 2t») is refused by name. The
  question is the statement with its value dropped («x_B», «מהו שיעור ה-x של B?»). The axis letter may be
  typed in capitals: «X_B = 3», «X_{B}=3», «B_X = 3» and «X_B > 0» are «x_B = 3», «x_{B}=3», «B_x = 3» and
  «x_B > 0», as analytic reads them; a digit subscript («X_1») stays a label. A stated component places the figure
  on **that axis only**: after «x_B = 3» on a box, no other point of it reads a coordinate it was merely drawn at
  (A gets no row; B reads «B(3, ?, ?)»), and after «z_A = 2» A reads «A(?, ?, 2)» and «x_A» is not determined. A
  plane's equation prints only when its normal lies along axes the givens place.
  - Sources: ADR-3D-299, ADR-3D-362, #1547, #2081, [ADR-3D-373](06b-decisions-3d.md#adr-3d-373), #2340.
- **FR-SP-15 (Must)** — **A shape's adjective is honoured, and a circle through a polygon passes through every
  vertex.** An adjective stated on a polygon noun («טרפז ישר זווית», «טרפז שווה שוקיים», «משולש ישר זווית», "isosceles
  trapezoid", "right triangle") is drawn, standalone and inside an inscription in either direction; one the noun
  cannot carry («מרובע ישר זווית») is never dropped — the line goes to the model. A quadrilateral in a circle is
  drawn as its family's cyclic member, with a notice when the shape is narrowed, naming the cause in the shared
  family (2-D's FR-HS-14, ADR-W-129: «כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.»;
  a right pyramid over a base it narrows: «כדי שהפירמידה תהיה ישרה, ABCD הוגבל …»; a given typed first is named instead;
  nothing when the declared noun is already the cyclic one, «טרפז שווה שוקיים»); every other forced narrowing the
  givens make is said in the same family, as in 2-D; a right trapezoid in a circle is refused — in one sentence,
  and also when «טרפז ישר זווית ABCD» and the circle («ABCD חסום במעגל», «מעגל חוסם את ABCD», a pyramid's
  right-trapezoid base) are stated on two lines, in either order: the second line is refused, naming both. A
  shape's own condition draws no segment the student did not name. The 2-D twin is FR-EN-14. A circle inscribed in a pentagon
  or hexagon (any spelling, lettered or not) is refused before the model with «הכלי עדיין לא יודע לשרטט מעגל חסום
  במחומש — זו מגבלה של הכלי.» (the noun filled in); nothing is drawn. «משוכלל» / "regular" on a flat polygon is an
  adjective 3-D draws only on a square: elsewhere the line goes to the model, and an answer that drops it is refused.
  A word in an inscription sentence the tool does not read refuses the line, naming it («…לא הצלחנו לצייר: שווה צלעת…»);
  nothing is drawn and the model is not asked. «שוה» reads as «שווה». A shape declaration with a qualifier word no
  reader lowers («משולש שווה ABC», «טרפז ישר ABCD») is not drawn without it: the line goes to the model.
  **The model's answer keeps every shape and role word** ([02w](02w-requirements-workspace.md) FR-SU-21, #1906,
  [ADR-3D-364](06b-decisions-3d.md#adr-3d-364)): a shape adjective or quadrilateral noun, a cevian role word («גובה»,
  «תיכון», «חוצה זווית») or an inscription verb («חסום» / «חוסם») the student typed — spelt right or one letter off
  («שווה צלעת», «מלבנ», «גובח», "isoceles") — that the answer does not carry refuses the step with `dropped-given`
  naming the word as typed («המשפט לא נוסף לציור, כי לא הצלחנו לצייר: שווה צלעת. …»); an answer that keeps it (typo
  fixed) records as before. One role's lowering never pays for another's.
  Both voices of both relations are one sentence (#1975, operator 2026-10-14): a circle named FIRST — «מעגל O חוסם
  את המשולש ABC», «מעגל O חסום במשולש ABC», "the circle O circumscribes triangle ABC" — builds what «משולש ABC חסום
  במעגל O» / «משולש ABC חוסם את המעגל O» build, and the relative clause whose subject is the ring, «מעגל ש-ABC
  חוסם», is the circle INSIDE (as «ABC חוסם מעגל»), never the circle through the vertices. «מעגל שמרכזו O …» names a
  centre point the inscribed circle does not carry, and is refused in both voices.
  A triangle carries both of its circles at once (#2125, as in 2-D): «מעגל חוסם את ABC» and «מעגל חסום במשולש ABC»
  build together, in either order and in every voice, unnamed or named. Stating the same circle again, in any
  spelling, is still answered as already in the figure.
  A circle draws no plane of its own (#2126, operator 2026-10-15): no patch, no label and no «מישורים» row, as a
  triangle draws none and as in 2-D; a plane is drawn only when the student names it («מישור ABC», «π1»), and then once.
  - Sources: ADR-3D-307, ADR-3D-308, ADR-3D-311, ADR-3D-312, ADR-3D-313, ADR-3D-341, ADR-3D-342, ADR-3D-350; #1554, #1792, #1838 (a quadrilateral's incircle), #1844, #1891, #1902, #1918, #1975, #2125, #2126.
- **FR-SP-18 (Must)** — **A trapezoid keeps exactly one pair of parallel sides, or the page says it no longer
  does.** When the givens force a declared trapezoid (flat, or a pyramid's base) to be drawn with both pairs of
  opposite sides parallel, the figure is drawn and an amber warning names the trapezoid while that holds — 2-D's
  words; no cyclic-member notice stands beside it. A pair of its OTHER two sides that the student states parallel
  («טרפז ABCD · AD ∥ BC») becomes the trapezoid's parallel pair, on every route. A trapezoid declared on a ring
  already known to be a shape no quadrilateral is at the same time (a parallelogram, rectangle, rhombus, square
  or kite), or the reverse, is refused naming both shapes. The twin of analytic R126 + R93 and of 2-D ADR-165 /
  ADR-506 / ADR-157. **The same relation as 2-D and analytic, adjective included** ([ADR-3D-345](06b-decisions-3d.md#adr-3d-345),
  ADR-W-131, operator rulings 2026-10-16): an isosceles and a right trapezoid exclude each other («טרפז שווה שוקיים ABCD»
  · «טרפז ישר זווית ABCD», either order, is refused), the refusal names a declared or stated isosceles or right
  trapezoid with its adjective, and what the ring is known to be is what every noun stated over it makes it together.
  A trapezoid adjective stated after «טרפז» narrows the ring and is never said to add nothing.
  - Sources: ADR-3D-313, ADR-3D-345; #1918, #2171.
- **FR-SP-19 (Must)** — **A polygon restated is the polygon already there.** A line that only declares a ring the
  figure already declares — the same letters read from another vertex or the other way round («ריבוע ABCD» ·
  «מרובע ADCB», «משולש ABC» · «משולש ACB»), or the generic word over a named shape («מרובע ABCD» over a square) —
  adds no row and shows the restatement note, exactly as the same line in the same spelling does (#613). A
  reading that changes what a shape says (a trapezoid read so its OTHER pair is named) is a new statement, and a
  crossing order is a different ring (#1927 refuses it). The generic word is only the extreme case: **any** noun the
  declared one IMPLIES — «ריבוע ABCD» · «מלבן ABCD» / «מעוין» / «מקבילית» / «דלתון», «מלבן ABCD» · «מקבילית ABCD» —
  is the same restatement, in any reading, and is never refused as a mis-naming ([ADR-3D-326](06b-decisions-3d.md#adr-3d-326),
  operator ruling 2026-10-10; it was «הצורה כבר ידועה כ־ריבוע — ולכן אינה נקראת מלבן», which a square contradicts).
  A noun that ADDS information still drives (FR-SP-2), and one that EXCLUDES the declared shape is still refused
  naming both (FR-SP-18). The twin of 2-D FR-EN-9 and analytic R45. **Two sibling nouns** («מלבן ABCD» · «מעוין ABCD»,
  «מלבן» · «דלתון», «מקבילית» · «דלתון», either order) build with 2-D's one note, «ABCD הוא כעת ריבוע, שהוא גם מלבן וגם
  מעוין.» ([ADR-3D-345](06b-decisions-3d.md#adr-3d-345)); and the restatement is judged against what EVERY enabled noun
  makes the ring together — «מלבן ABCD» · «מעוין ABCD» · «ריבוע ABCD» adds no row ([ADR-3D-346](06b-decisions-3d.md#adr-3d-346), #2180).
  - Sources: ADR-3D-324, ADR-3D-326, ADR-3D-345, ADR-3D-346; #1953, #1988, #2171, #2180.
- **FR-SP-24 (Must)** — **An unnamed shape noun is read against the figure: a definite one is the drawn shape, an
  indefinite one a new shape.** A definite noun with no letters («המשולש ישר זווית», «המשולש», «המשולש שווה שוקיים»,
  "the triangle is isosceles", «הריבוע») with ONE flat polygon of that size declared does exactly what the same
  sentence naming it does («המשולש DEF ישר זווית» — acts on it, or answers «כבר קיים»), whatever its letters
  («משולש DEF», «משולש SAB» on a pyramid); with two or more it is refused with 2-D's sentence, naming them, with the
  student's own sentence naming the first as the next step («המשולש ABC ישר זווית»); with none it draws on A, B, C as
  before. An indefinite or prefixed noun («משולש ישר זווית», «משולש», «במשולש ישר זווית», "a right triangle»,
  «ריבוע») draws a NEW shape on the first free letters — the letters 2-D gives («משולש ABC» · «משולש ישר זווית» → DEF).
  A solid's faces are not declared polygons here (a definite triangle on a bare pyramid is unchanged). The twin of
  2-D FR-IN-11's definite / indefinite sentences.
  - Sources: ADR-3D-351; #2235 (operator ruling 2026-10-16, card `g2235-3d`); 2-D ADR-654, ADR-685 (#2205).
- **FR-SP-20 (Must)** — **A crossing ORDER of a ring's letters is refused for its order, whatever noun it carries.**
  When two declared rings spell the same four letters in different cyclic orders and either noun is convex whenever
  simple (every quad noun but «דלתון» and the bare «מרובע»), the other order crosses in every configuration — four
  points in convex position admit exactly one simple cyclic order. The line that COMPLETED the pair is refused with
  the shared ring message («הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: …»), in either order and whatever the
  second noun: «ריבוע ABCD» · «מקבילית ACBD» / «טרפז ACBD» / «מלבן ACBD», «מלבן ABCD» · «מקבילית ACBD» — never
  «בדקו את החישוב» and never the contradicting-givens sentence. **Search first, refuse last** (FR-SP-15's rule):
  a «דלתון» or bare-«מרובע» partner may be a dart or concave, so the other order is drawn, and a reordered ring
  nothing contradicts is always drawn. The 2-D twin is FR-EN-16 and the analytic twin is R91.
  - Sources: ADR-3D-322, ADR-3D-327; #1927, #1991.

## Vectors — the geometric lane

- **FR-VC-1 (Must)** — Accept a **named basis** on a solid and reason affinely over it: sums, scalar
  multiples, and the identities a bagrut question asks a student to verify.
- **FR-VC-1a (Must)** — **A statement the student MARKS as being about vectors is read as being about
  vectors, and a vector equation a free figure can satisfy is a GIVEN.** Where `XY = k·ZW` has both a
  vector and a length reading the tool asks which was meant (FR-VC-1, [ADR-3D-249](06b-decisions-3d.md#adr-3d-249)) —
  but a student who has already answered is not asked again: an explicit `→`/`⃗`/`⟶`, or the word
  «וקטור»/`vector`, commits the sentence to the vector lane. Every spelling of the marking is equal; a marked
  statement the figure cannot satisfy is refused. The input strip previews a marked line's notation
  (`DC⃗ = 3AB⃗`) before commit, only for a line the student marked.
  - Sources: ADR-052, ADR-3D-249, ADR-3D-250, ADR-3D-252, ADR-3D-255; #1183, #1185, #1194, #1195, #1312.
- **FR-VC-1b (Must)** — **A vector can START a figure, and the word «וקטור» draws a vector.** The
  vectors unit opens on an empty canvas, so «וקטור AB» must build there: both endpoints are
  introduced as free points ([ADR-052](06-decisions.md#adr-052) — an unstated position is a free DOF
  that moves on «הציגו תצורה אחרת», never a fixed default), and the student can name what they drew
  in the next line («נסמן: AB = u»). Once a figure exists, a pair with two unknown endpoints is refused by
  name. **Not yet:** a vector given only by components, which needs the design in #1188.
  - Sources: ADR-052, ADR-3D-253; #1184, #1188.
- **FR-VC-1c (Must)** — **A stated magnitude on a free vector is a GIVEN, and the figure honours it.**
  After «וקטור AB» the endpoints are free, so «אורך AB = 5» (or «וקטור AB = 5», «AB = 5», «|u| = 5») moves
  them until |AB| = 5 holds, and keeps holding on «הציגו תצורה אחרת». What was not stated keeps varying; a
  conflicting magnitude is refused, naming the statement it conflicts with.
  - Sources: ADR-3D-260, #1311.
- **FR-VC-2 (Must)** — Support **at most one symbolic parameter** in a vector expression, pinned by a
  given through root-finding. Two unknowns in one expression is a known boundary.
  - Sources: #301, superseded by #1551.
- **FR-VC-2a (Must)** — **A POWER in a coordinate component is supported where the solver can pin it,
  and refused BY NAME where it cannot.** On a figure carrying a solid, `C(p², p, 0)` builds and the
  relation `x = y²` holds. With no solid it is refused by name, never accepted with the power discarded.
  - Sources: ADR-3D-218, #898.
- **FR-VC-2b (Must)** — **A student can give a VALUE to any letter the figure carries, whatever introduced
  it.** «p = 3» is honoured whether `p` was born as a vec-def ratio («SN = k·SC»), in a coordinate
  («C(p²,1,0)»), in a vector or pair injection, in a line or plane equation, as the algebraic lane's
  parameter, as an angle label («∠SAB = α») or as the name of a free component («C(p,1,0)», #814). A value
  the figure cannot satisfy is refused naming the statement, an unknown letter as unknown; a stated sign
  («k חיובי») is honoured the same way.
  - Sources: ADR-052, ADR-3D-219, ADR-3D-236; #814, #902, #922, #930.
- **FR-VC-2c (Must)** — **A value whose letter is no longer defined is a fact in error, and the change that
  undefined it says so.** When the row that introduced the letter («∠SAB = α», «C(p²,1,0)», «SN = k·SC»)
  is deleted, muted or edited away, the value row («α = 70», «p = 3», «k = 1/2») stays in the list, is
  marked as not in effect with a reason naming the letter, and the figure does not pretend the value
  applies; the delete / mute / edit is committed as asked but reports the rows it left without effect,
  in the student's wording — never a bare success. It takes effect again by itself when a definition is
  back, and so does any row typed before the points it names, a point-creating row included.
  - Sources: ADR-3D-220, ADR-3D-257, ADR-3D-259, ADR-W-044, ADR-W-089; #926, #1242, #1327, #1339.
- **FR-VC-2d (Must)** — **A SYMBOLIC ANGLE may carry a coefficient, and no copula decides whether a
  statement is understood.** «זווית ABC = 2α» states that the angle is twice the letter's value, and a
  value later given to the letter drives it accordingly — the form a question uses when two angles stand
  in a stated ratio. One letter with different coefficients states a ratio, never an equality.
  - Sources: ADR-3D-052, ADR-3D-241; #977.
- **FR-VC-2e (Must)** — **An angle carries one name; a second name is refused, not relabelled.** A different
  letter for an angle that already wears one («זווית ABC=α» · «זווית ABC=β», either ray order, any host) is
  refused with 2-D's sentence «לזווית ABC כבר יש שם: α (בשורה «זווית ABC=α»). לכל זווית שם אחד — המשיכו עם α.»;
  the same letter with another coefficient («∠ABC=2α» · «∠ABC=3α») is refused in 3-D's conflict sentence
  «הנתונים סותרים זה את זה — אין גוף שמקיים את «∠ABC=3α» יחד עם «∠ABC=2α»». The same letter and coefficient
  again stays already-stated; an unlabelled mark still takes its first name; a letter already naming another
  angle is the FR-VC-2d equality. A saved list holding both lines opens with the second refused. This amends
  FR-VC-2d's relabel (ADR-3D-052's equality rule stands). A 3-D «AB=a» is a vector (X7), so the length half of
  the ruling has no 3-D sentence.
  - Sources: ADR-3D-344; #2054, #2061, #2023 (operator rulings 2026-10-13, 2026-10-14).
- **FR-VC-3 (Must)** — **NO CAS.** Every "symbolic" feature is a numeric root-find, a closed form, or a
  linear solve. Anything beyond that is refused and escalated to the operator, not approximated.
  - Sources: operator authority, D3 above; [docs/20 §10](archive/20-space-vectors-tool.md).
- **FR-VC-4 (Must)** — **No cross product is surfaced to a student.** The curriculum has none; it may be
  used internally, never shown or taught. *(Operator authority.)*
- **FR-VC-4a (Must)** — **What the student STATED about vectors is shown, even when nothing is
  measurable yet.** «נסמן: AB = u» and «DC = 3u» on a free trapezoid are true at every configuration,
  so the data panel lists them in vector notation — `u = AB⃗`, `DC⃗ = 3u` — and leads with them, because
  the panel’s own hint promises «בכתיב וקטורי, בקואורדינטות ובגדלים» in that order and vector notation is
  the one of the three that needs no determined figure at all. Stated only (operator: *"only stated
  vectors. anything else, the user can ask for specifically"*).
  A **component given** is a stated vector too, by pair or by name: «AB = (k-1,k,3)» lists
  `AB⃗ = (k-1, k, 3)` at once, its components **as the student typed them** («1/2» stays «1/2»); a
  component switches to its **value** once every letter in it is known (`AB⃗ = (1, 2, 3)` after «k = 2»),
  and a component whose letter is still open keeps its typed form (`AB⃗ = (2, t, 1)`). "Known" is the
  parameters section's own verdict, so the two never disagree. Operator, 2026-10-14: *"the data panel holds
  the truth. so once k is known, we use it."* Rows are listed in the order they were stated.
  A stated **point** keeps the letter the student wrote on a free axis — «A(1,t,2)» reads `A(1, t, 2)`, never
  `A(1, ?, 2)`, like analytic — and its value once the letter is known; asking «A» answers the same text, while
  a single coordinate («y של A») stays undetermined, since a letter is a name, not a value.
  - Sources: ADR-3D-254, #1196; [ADR-3D-368](06b-decisions-3d.md#adr-3d-368), #2077.

## Equations — the algebraic lane

- **FR-EQ-1 (Must)** — Accept **planes and lines by equation** and by the standard textbook framings, in
  both the verb-headed and noun-headed forms a student actually writes («ℓ חותך את π בנקודה A» and
  «A נקודת החיתוך של ℓ עם π» are the same fact).
- **FR-EQ-2 (Must)** — **Roots are branches.** Where a pinned parameter has several solutions, each is a
  valid configuration the student can cycle, exactly as elsewhere in the suite.
- **FR-EQ-3 (Must)** — **`no-roots` is an honest contradiction, never a fake point.** When a stated
  parameter cannot be satisfied, the figure **refuses and names the statement** — it never invents a
  nearby value to keep drawing. Only a genuinely impossible figure refuses.
- **FR-EQ-4 (Must)** — **A value is shown only when it is the same in EVERY configuration.** When a
  pinned parameter has several roots, an answer (the ask lane), a data-panel row, a verified claim and an
  offered crossing dot are each judged against **every root the student can cycle** with «הציגו תצורה
  אחרת» — never against a subset — so pressing the button can never turn a withheld value into a fact.
  - Sources: ADR-3D-283, #1474.
- **FR-EQ-4a (Should)** — **A point with EXACTLY TWO configurations lists both in the data panel.** When
  the givens leave a point exactly two admissible positions — the same two at every sampled configuration
  (S above or below the plane, «SM⊥ABC» + «|SM| = 4») — the panel prints one row per configuration,
  «S₁(1.33, 7/2, 3.33)» and «S₂(−4.33, 7/2, −2.33)», each row a WHOLE admissible point (components are
  never mixed across configurations), in a fixed order that does not change with the configuration on
  screen. Only two (operator: *"many exams ask questions that have 2 options. but not more than 2"*).
  - Sources: ADR-3D-289, #1506.
- **FR-EQ-4b (Should)** — **A parameter's roots are written as the student writes the answer.** When the
  givens leave a figure parameter two values, the data panel and the ask lane both list them: a pair that
  are negatives of each other reads **«m = ±√2»**; any other pair repeats the symbol after «או», ascending —
  **«m = -2 או m = 4»** — never a set «{-2, 4}». Three or more roots list nothing: the panel reads the open
  **«m = ?»** and the ask lane says the value is not determined (#1861). A point with exactly two
  configurations reads one row, **«S(1.33, 7/2, 3.33) או (-4.33, 7/2, -2.33)»**, and asking «S» answers the same coordinates,
  naming the point once: **«S = (1.33, 7/2, 3.33) או (-4.33, 7/2, -2.33)»**. Every ask answer is the bare value after the
  question («B = (1, t, 2)», «k = 2»), never the label again. A declared basis vector asked by its own name
  answers its coordinates when they are knowledge (**«w = (0, 0, 12)»**) and otherwise «לא נקבע על ידי הנתונים»,
  never its own name; a pair keeps its decomposition («AS = w = (0, 0, 12)»).
  - Sources: ADR-3D-303, #1591, [ADR-3D-336](06b-decisions-3d.md#adr-3d-336), #1867, [ADR-3D-339](06b-decisions-3d.md#adr-3d-339), #1746, [ADR-3D-371](06b-decisions-3d.md#adr-3d-371), #2072.

## Claims — the student's answer, never a driver

- **FR-CL-1 (Must)** — **A claim is verified, not obeyed.** When a student asserts a value or relation,
  the tool checks it against the figure across **several seeded configurations** and **refuses it
  (`claim-refuted`) when it is wrong**. A claim never reshapes the figure. A statement about a part the
  tool sampled that no drive honours is refused as *not yet determined*, naming that part, never as wrong.
  A relation between objects given by equations or coordinates, where one carries the figure's parameter in
  what the relation reads, determines the parameter instead; one that holds for every value leaves it free.
  - Sources: ADR-3D-260, ADR-3D-263, ADR-3D-267, ADR-3D-286; #508, #512, #552, #1311, #1439, #1472.
- **FR-CL-2 (Must)** — **No claim can escape by hiding inside a composite.** Every claim is recorded on
  the construction and verified on evaluation, so a claim arriving as part of a larger command is checked
  like any other. A role noun («אלכסון AB») is a claim too, judged again on the final figure; named
  diagonals that meet in E put E where they meet, and segments that do not meet are refused, naming both.
  - Sources: ADR-3D-203, ADR-3D-246, ADR-3D-297, #1728; the 2-D twin is ADR-569.
- **FR-CL-2a (Must)** — **A segment RATIO is one notation with two separators.** «BE/ED = 1:3» and
  «BE:ED = 1:3» are the same statement and are read identically, in every combination of the two
  separators and with a bare number on the right («AB/BC = 2»); `/` is how a textbook writes it. Both
  terms are positive.
  - Sources: ADR-3D-251, #1163; parity with 2-D's `segmentRatio`.
- **FR-CL-3 (Must)** — **A refusal names the student's statement, not internal state**
  ([FR-SU-5](02w-requirements-workspace.md)).
- **FR-CL-4 (Must)** — **A measure the student can STATE, they can ASK.** Every angle between objects
  (planes by name or by points, named lines, the plural «הזווית בין המישורים X ו-Y») and every
  solid-of-revolution measure (volume, lateral area, total surface) that the tool checks as a given is
  answered as a question with the value dropped: «הזווית בין המישורים π1 ו-π2» → 54.74°, «נפח החרוט» →
  100π.
  - Sources: ADR-052, ADR-3D-279, #1449.

## Rendering

- **FR-RD-1 (Must)** — **Textbook-grade wireframe the student can orbit**, with hidden edges dashed the
  way a textbook draws them, so a solid reads as a solid rather than a tangle of lines.
- **FR-RD-2 (Must)** — **Vector notation renders as notation** (arrows, vector pairs), and mathematical
  text as mathematics — a power as a power, not `p^2`.
  - Sources: ADR-W-040.
- **FR-RD-3 (Should)** — **A number appears on the canvas only when FR-SP-4 permits it** — invariant
  across the sampled gauge.
- **FR-RD-4 (Must)** — **One arc per wedge; the value wins once stated.** An angle the student marked
  draws ONE arc at its vertex whatever combination of records carries it — a name («∠SAB = α»), a value
  («∠SAB = 70»), or both, in either order. A right-angle value draws the knee and no arc.
  - Sources: ADR-3D-221, ADR-W-045, #923.
- **FR-RD-5 (Must)** — **A stated angle is marked where the segments MEET.** «הזווית בין AC' לבין BD' היא
  55» on segments that genuinely cross draws the arc + value at the crossing, exactly as a shared-vertex
  angle draws it at the vertex; a stated angle between segments that are **skew**, parallel, or would
  meet only beyond the drawn ink draws **nothing** on the canvas (the R³ honesty rule — a mark there
  would assert an intersection the figure does not have) and stays in the data panel.
  - Sources: ADR-3D-222, #917.
- **FR-RD-6 (Should)** — **A parameter the student VALUED offers a display choice; one they never
  valued is never replaced.** A bagrut question is worked in parts: part 1 reasons with «α» and a later
  part supplies 70, so which form belongs on the figure depends on where in the question the student
  is — which the tool cannot infer and must not guess. The valuing line carries a chip back to the
  letter; an unvalued letter stays on the canvas. Built for the angle arc; the coordinate lane's panel
  chip is a later adoption.
  - Sources: ADR-3D-233, ADR-W-047; #925, #937.
- **FR-RD-7 (Should)** — **A declared solid is never drawn flat.** When the stated givens collapse a declared
  solid's extent — «פירמידה SABCD שבסיסה ריבוע» with «∠BAS = 40» and «∠DAS = 50», where `cos²40° + cos²50° ≡ 1`
  puts the apex exactly in the base plane, or «פירמידה ישרה SABCD שבסיסה מלבן · AB = 6 · BC = 8 · SA = 5» — the line
  that completes the flatness is refused, either order, naming the statements and the solid in its own noun:
  «לא ניתן: «∠DAS = 50» יחד עם «∠BAS = 40» מתקיימים רק אם הפירמידה SABCD שטוחה — וגוף שטוח אינו פירמידה.» (operator
  ruling 2026-10-07, #1860; it was a notice before). A thin but real solid («∠BAS = 41 · ∠DAS = 50») builds with no
  notice and no refusal. **A declared polygon is never drawn flat:** the line that collapses one («AB = 5 · BC = 3 · AC = 8» on
  «משולש ABC», or an incidence on a rider or on a point that already exists, in whichever order the two are stated — «M על AB · M אמצע BC» and «M אמצע BC · M על AB» alike, #1847) is refused, naming the statements — a straight line is not a
  triangle. **A declared polygon over points fixed by coordinates is never drawn crossed:** when its ring, in the
  order named, crosses itself («A(0,0,0) · B(4,0,0) · C(1,3,0) · D(3,3,0) · טרפז ABCD»), the line that completed it
  — the declaration, or the coordinate typed last — is refused in analytic's words. **The same holds for points a
  SHAPE placed** («ריבוע ABCD · מרובע ACBD», a cube's «מרובע ACBD», the midpoint ring «מרובע ABED», and the ring
  first, «מרובע ABDC · מלבן ABCD»): when the ring crosses at every claim sample and no configuration branch can save
  it, the line that completed it is refused with the same words. A ring a dart could save («דלתון ABCD · מרובע ABDC»)
  is never refused (the operator's "search first, refuse last", 2026-10-09). A ring with a free vertex is
  drawn simple by choice of configuration, never refused. **Nor is one drawn off one plane:** a flat polygon
  declared over points the figure has already PLACED — typed coordinates, a coordinate given, a derived point over
  those, or a solid's vertex — whose vertices do not lie in one plane («A(0,0,0) · B(4,0,0) · C(4,3,0) · D(0,3,5) ·
  מרובע ABCD», «קובייה ABCDA'B'C'D' · מרובע ABCA'») is refused on the line that completed it, naming the
  declaration and the statements that placed its points; a polygon is flat by definition, and the message says
  so — the shape is flat and these vertices are not in one plane («מרובע הוא צורה שטוחה, והקודקודים A, B, C, A'
  אינם נמצאים במישור אחד — ולכן …»). A ring with at least one
  FREE vertex is BUILT, that point driven into the plane — an unstated freedom is never an error; the placed
  vertices do not move unless the noun itself states something about them (a rectangle's right angle).
  - Sources: ADR-3D-234, ADR-3D-309, ADR-3D-310, ADR-3D-314, ADR-3D-319, ADR-3D-322, ADR-3D-325, ADR-3D-356, ADR-W-048, ADR-W-115, ADR-W-121,
    ADR-413, ADR-602, ADR-AG-129, ADR-052; #936, #945, #1815, #1849, #1861, #1923, #1927, #1928, #1935, #1978.
- **FR-RD-8 (Should)** — **A stated LENGTH is drawn beside its segment.** «AB = 5» writes the 5 at AB's midpoint
  on the canvas, not only in the data panel — the honesty invariant *"everything the student stated is visible on
  the figure"* applied to the magnitude lane, which previously held for a stated distance (a labelled witness line)
  and a stated angle (a labelled arc) but not for the commonest kind of all. Stated only, and drawn on a hidden
  edge too.
  - Sources: ADR-3D-235, #918.
- **FR-RD-9 (Should)** — **The freedom cue counts what is actually still free.** «דרגות חופש שטרם נקבעו»
  is an estimate, but an honest one: the six placement DOFs the sampler varies once an absolute object is
  on the canvas are **counted** (they are real — «הציגו תצורה אחרת» moves them), and what a stated
  relation consumes is **measured on the resolved figure, never inferred from a count** — a relation the
  construction already satisfies (a parallelogram's second parallel pair, a kite's mirrored sides)
  consumes nothing.
  - Sources: ADR-3D-247, ADR-3D-248.
- **FR-RD-10 (Must)** — **A stated right angle against a PLANE is the knee.** «π1 ניצב ל-π2», «המישור
  ABC ניצב למישור ABB'», «הזווית בין המישורים π1 ו-π2 היא 90» — and the line × plane spellings at 90°
  («הזווית בין AA' למישור ABC היא 90», «הזווית בין הישר ℓ1 למישור π1 היא 90») — draw the textbook knee:
  for two planes at the seam, one arm in each plane perpendicular to the seam; for a line and a plane at
  their crossing. Always shown (not gated by «ארגון נתונים»), and only where the right angle holds.
  - Sources: ADR-3D-264, #1475.
- **FR-RD-11 (Should)** — **«הצג בניה»: the construction that measures an angle between planes.** Every
  fact row that states an angle between two planes (a value, a letter, or «ניצב») carries a chip, **off by
  default**. When on, it draws the plane angle that measures the dihedral; a line × plane row gets the
  same chip (the height to the plane and its projection). Its points are display names, never facts.
  - Sources: ADR-3D-265, ADR-3D-280; #1476, #1491.
- **FR-RD-12 (Must)** — **A stated angle between OBJECTS is always marked on the figure.** An angle the
  student stated between two planes («הזווית בין הפאה SBC לבסיס ABC היא 60»), between a line or segment
  and a plane («זווית בין ישר ℓ למישור π = 45», «הזווית בין SA למישור ABCD היא 50»), or NAMED with a
  letter («… היא α») draws its arc and its value — or its letter — on the canvas **whether «ארגון נתונים»
  is open or closed**, like a vertex angle, an angle between equation planes, and the FR-RD-10 knee.
  - Sources: ADR-3D-266; #542, #1486.
- **FR-RD-13 (Must)** — **A face or base the student NAMED shows as that face.** A plane first mentioned
  as «הפאה SBC» / «הבסיס ABC» (en *the face / the base*) draws only its polygon by default; «המישור SBC»
  keeps the full patch.
  - Sources: ADR-3D-278, #1485.
- **FR-RD-14 (Must)** — **A plane's display chip lives on the FIRST row that mentions it.** The first
  fact row whose sentence names a drawn plane — a declaration («מישור ABCD») or a relation («מישור ABCD
  מקביל לציר z», «BE מוכל במישור ABCD») — carries that plane's chip («פאה בלבד» …). Later mentions carry
  none.
  - Sources: ADR-3D-281; #847, #1550.
- **FR-RD-15 (Must)** — **A stated angle is painted only where it holds.** A value on an arc, and a right-angle
  knee, appear only while the drawn figure satisfies the given.
  - Sources: ADR-3D-263, ADR-3D-290, #1592.
- **FR-RD-16 (Must)** — **A ⟂ between two segments draws its knee only at a vertex the student named.** A
  shared endpoint («AB ⟂ AC» at A), or a point stated as the crossing («O נקודת חיתוך האלכסונים»). Two
  segments stated ⟂ that cross at an unnamed point («ריבוע ABCD» · «AC ⟂ BD») draw no mark at rest, as in
  2-D; the relation shows in the givens list and the data panel. A line or segment ⟂ a plane keeps its knee.
  An endpoint of one segment that the facts put on the other is a named vertex too («D על BC» · «AD ⟂ BC», «AD
  גובה»): the knee is drawn at D. At a named foot and at a named crossing the knee sits in the corner the
  statement names, as in 2-D — toward the other segment's second-named letter («AD ⟂ BC» → ∠ADC, «AD ⟂ CB» →
  ∠ADB), and at a named crossing toward each segment's second-named letter («AC ⟂ BD» at O → ∠COD) — and never
  moves when the figure is cycled. A right angle already stated as a value there («זווית ADB = 90») keeps its
  own knee and the ⟂ adds none.
  - Sources: ADR-3D-360, ADR-3D-366, ADR-W-118 B2 (Am. 3), #2091, #1946, #2103.

## Coverage

- **FR-SP-7 (Should)** — **Every 2009–2024 exam's space/vectors INPUT is expressible.** The tool
  reproduces the figure and verifies claims for the whole legacy corpus; it does not solve any of it. The
  documented remaining niche is orthoscheme.
  - Sources: [docs/20](archive/20-space-vectors-tool.md) §14; ADR-3D-266; #1861.

## Non-goals

- **Solving the exam question.** The tool draws and verifies; the student solves.
- **A CAS** (FR-VC-3), and **the cross product** as a taught operation (FR-VC-4).
- **Force and physics vector questions** (D5), and **a shaded three.js view** (D2, deferred). See
  *Scope and non-goals* above.
- **Importing from a sibling product.** `src3d/` never imports `src/`; patterns are copied, not shared
  ([`BOUNDARIES.json`](../BOUNDARIES.json)). This is a hard boundary with operator authority, and it is
  mechanically enforced.
