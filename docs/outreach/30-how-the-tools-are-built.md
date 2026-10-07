# 30 — How the tools are built: the mathematics under the four builders

> Outreach material, not a rule or a spec (#1861).

_Written 2026-09-29 as outreach material: a plain-language account of the algorithms behind the four
products, for posts, talks and teacher conversations. It is a **reference**, not a contract — the
mechanisms themselves are specified in [11](../archive/11-architecture-as-compiler.md), [LADDER](../LADDER.md) and
the ADR logs. Every algorithm named here points at the file that implements it, so a claim made in
public can be checked against the code. If a file moves, fix the pointer; if an algorithm is replaced,
fix the claim._

---

## 1. The idea in one paragraph

A student describes a construction in plain Hebrew or English — «ריבוע ABCD», «נקודה G על AD»,
«זווית GBA = 37°» — and the figure is built **one fact at a time**. The pipeline is a compiler:
**natural language → commands → constructive evaluation → rendered figure**. Every object is defined
from earlier objects, so the figure is a dependency graph; every unstated magnitude stays a free
degree of freedom; and a construction with several valid drawings stores a branch index that
"show another configuration" cycles through. The figure itself is never stored — it is recomputed from
the list of facts, so undo can never desynchronise from the drawing.

The language layer is deterministic: a bilingual parser handles the input. When it cannot, an LLM
rewrites the sentence into the parser's canonical phrasing, and the parser checks the result again.
The LLM is a translator; the engine decides what is true.

## 2. The four builders

| Builder | Entry | What a student builds |
| --- | --- | --- |
| **Plane geometry (2-D)** | `/` | Triangles, polygons, circles, tangents, angles, ratios — the bagrut Euclidean-geometry figure |
| **Space geometry (3-D)** | `/3d.html` | Prisms, pyramids, planes, sections, angles between lines and planes, vectors |
| **Complex numbers** | `/complex.html` | Numbers, equations and solution sets on the complex plane — roots, loci, regions |
| **Analytic geometry** | `/analytic.html` | Points by coordinates, lines, circles, parabolas, ellipses, and loci traced by a moving point |

## 3. The algorithms

### Shared by all builders

| Algorithm | What it does here | Where |
| --- | --- | --- |
| **Topological evaluation of a dependency DAG** | Every object is placed only after everything it depends on. A free point has 2 degrees of freedom, a point on a segment 1, a derived point 0 | [src/engine/evaluate.ts](../../src/engine/evaluate.ts) |
| **Levenberg–Marquardt** (damped Gauss–Newton, central-difference Jacobian) | When several constraints act on several points at once, the figure is a nonlinear least-squares problem. LM behaves like gradient descent far from the answer and like Gauss–Newton near it | 2-D [src/engine/solveLM.ts](../../src/engine/solveLM.ts) · 3-D [src3d/engine/solve3.ts](../../src3d/engine/solve3.ts) · analytic [src-analytic/engine/solve.ts](../../src-analytic/engine/solve.ts) (multi-start) |
| **Seeded pseudo-random sampling** (mulberry32 PRNG, FNV-1a hashing) | Unstated magnitudes are *sampled*, not assumed. The same seed gives the same figure, so undo and replay are exact. A relation counts as true only if it holds in **every** sampled configuration | [src/engine/sample.ts](../../src/engine/sample.ts) |
| **Gaussian elimination with partial pivoting** | Linear sub-systems, and the numerical rank of a constraint matrix | [src3d/engine/solve3.ts](../../src3d/engine/solve3.ts) |

### Plane geometry (2-D)

| Algorithm | What it does here | Where |
| --- | --- | --- |
| **Bracketing + bisection** | «∠GBA = 37°» leaves one unknown — where G sits on AD. The range is scanned for sign changes and each bracket is bisected to machine precision, so **every** root is found. Each root is a valid drawing; the configuration button cycles through them | [src/engine/geometry.ts](../../src/engine/geometry.ts) (`solveParam`) |
| **Nelder–Mead simplex** | Inequality givens ("inside the circle", "between B and C") have no smooth zero. A derivative-free simplex minimises the violation plus a penalty for moving, so the figure does not jump | [src/engine/evaluate.ts](../../src/engine/evaluate.ts) |
| **Numerical Jacobian rank** | "Is the figure fully determined?" counts only *independent* constraints. «AB ⟂ BC» after «∠ABC = 90°» is redundant and removes no freedom | [src/engine/dofRank.ts](../../src/engine/dofRank.ts) |
| **Dijkstra's shortest path** | Before drawing, a stated length longer than the shortest path between its endpoints (the triangle inequality, generalised) is proven impossible and refused, naming the conflicting statement | [src/engine/metricFeasibility.ts](../../src/engine/metricFeasibility.ts) |
| **Union–find** | Groups triangles into congruence and similarity classes; merges points stated to coincide | [src/engine/detectShapes.ts](../../src/engine/detectShapes.ts), [src/engine/sideFeasibility.ts](../../src/engine/sideFeasibility.ts) |
| **Shoelace formula** | Polygon areas, and orientation (which way round a polygon is lettered) | [src/engine/geometry.ts](../../src/engine/geometry.ts) |

### Space geometry (3-D)

| Algorithm | What it does here | Where |
| --- | --- | --- |
| **Levenberg–Marquardt** | The pivot solver for solids whose dimensions are pinned by stated lengths and angles | [src3d/engine/solve3.ts](../../src3d/engine/solve3.ts) |
| **Numerical matrix rank** | How many independent scalars a set of givens actually pins | [src3d/engine/solve3.ts](../../src3d/engine/solve3.ts) |
| **Cramer's rule** | Decomposing a vector in a basis — one 3×3 solve, no computer-algebra system | [src3d/engine/vecExpr.ts](../../src3d/engine/vecExpr.ts) |

### Complex numbers

| Algorithm | What it does here | Where |
| --- | --- | --- |
| **Durand–Kerner (Weierstrass) iteration** | Finds **all** roots of a polynomial at once — the fundamental theorem of algebra, made computational | [src-complex/solve/census.ts](../../src-complex/solve/census.ts) |
| **Newton's method** | Polishes each root to machine precision | [src-complex/solve/census.ts](../../src-complex/solve/census.ts) |
| **Horner's scheme** | Evaluates polynomials efficiently and stably | [src-complex/solve/census.ts](../../src-complex/solve/census.ts) |

### Analytic geometry

| Algorithm | What it does here | Where |
| --- | --- | --- |
| **Numerical continuation along the Jacobian's null space** | Traces a locus: solve once, step along the direction the figure is free to move by a fixed arclength, re-solve, repeat — outward in both directions. Chosen over marching squares, which cannot trace a point that is downstream of the free one | [src-analytic/engine/locus.ts](../../src-analytic/engine/locus.ts) |
| **Cyclic Jacobi eigendecomposition** | Recognises *what* a traced locus is: the least-squares conic through the traced points is the eigenvector of the smallest eigenvalue of a 6×6 matrix — so the tool can say "this is a circle / parabola / ellipse" | [src-analytic/engine/locusFit.ts](../../src-analytic/engine/locusFit.ts) |
| **Multi-start Levenberg–Marquardt** | Several starting points, first success wins — a nonlinear system can have more than one basin | [src-analytic/engine/solve.ts](../../src-analytic/engine/solve.ts) |

## 4. The surprising ones (for a general audience)

Three that make people stop scrolling:

1. **Dijkstra's shortest-path algorithm** — the idea behind navigation apps — decides whether a set of
   stated lengths can exist at all, before anything is drawn.
2. **Eigenvalues** tell the analytic builder that the curve a moving point traced is a parabola.
3. **Levenberg–Marquardt**, the workhorse of curve fitting and robotics, is what makes a point slide
   into place when a student adds a constraint.

(Runner-up: **Durand–Kerner** finds every root of a polynomial simultaneously.)

## 5. LinkedIn post drafts

### 5a. Hebrew — short, four images (one per builder)

> **מה קורה כשתלמיד כותב "ריבוע ABCD", אחר כך "נקודה G על AD", ואז "זווית GBA שווה 37°"?**
>
> הנקודה G מחליקה לאורך הצלע עד שהזווית מתקיימת בדיוק.
>
> בשנה האחרונה אני בונה סט כלים לתלמידי תיכון, שבהם מתארים שרטוט במילים — בעברית או באנגלית — והשרטוט נבנה מול העיניים, צעד אחר צעד:
>
> 📐 **גאומטריה במישור** — משולשים, מעגלים, משיקים וזוויות
> 🧊 **גאומטריה במרחב** — מנסרות, פירמידות, מישורים וחתכים
> 🔢 **מספרים מרוכבים** — שורשים, מקומות גאומטריים ותחומים במישור המרוכב
> 📈 **גאומטריה אנליטית** — ישרים, מעגלים, פרבולות, ומקום גאומטרי שנוצר מנקודה נעה
>
> הכלל החשוב ביותר: הכלי לא מניח שום דבר שלא נאמר. אורך שלא נתון נשאר חופשי, וכשיש יותר משרטוט אחד אפשרי — אפשר לדפדף ביניהם.
>
> מאחורי הקלעים עובדים אלגוריתמים מוכרים, חלקם במקומות מפתיעים:
> 🔹 **האלגוריתם של דייקסטרה** למסלול הקצר ביותר — אותו רעיון שמאחורי אפליקציות ניווט — בודק אם האורכים שנתונו יכולים בכלל להתקיים, עוד לפני שמשרטטים.
> 🔹 **ערכים עצמיים** מזהים שהעקום שצוירה נקודה נעה הוא פרבולה, אליפסה או מעגל.
> 🔹 **לבנברג–מרקוורדט**, שיטה מעולם התאמת עקומות והרובוטיקה, היא מה שגורם לנקודה "להחליק" למקומה כשמוסיפים נתון.
>
> אנחנו בודקים את הכלים מול שאלות בגרות אמיתיות — המטרה היא לא לפתור אותן, אלא לשחזר את השרטוט בדיוק כפי שהוא מופיע בבחינה.
>
> מורים למתמטיקה — איזה שרטוט הייתם נותנים לו ראשון? 👇
>
> #מתמטיקה #חינוך #EdTech #גאומטריה #בגרות

### 5b. English — long, algorithm-by-algorithm

The longer English version walks through the 2-D pipeline algorithm by algorithm (topological
evaluation → bisection → Levenberg–Marquardt → Nelder–Mead → Jacobian rank → Dijkstra → union–find →
seeded sampling → Durand–Kerner). Build it from §3 when an engineering audience is the target; keep
each item to "what it is · the student-visible thing it causes".
