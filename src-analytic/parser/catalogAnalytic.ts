/**
 * The analytic tool's command catalog (docs/19 §10, ADR-AG-005 D8) — three things at once:
 *
 *  1. the **user-facing reference** that drives the in-app commands panel,
 *  2. the **coverage map** — a guard test re-parses every entry in Hebrew AND English, so an entry
 *     that stops parsing fails the suite rather than quietly becoming documentation,
 *  3. **the only vocabulary the LLM fallback is allowed to emit** — a line the re-parse would
 *     refuse must never be a line the model is taught to produce.
 *
 * Every entry is a phrasing that occurs in the 572 corpus. The governing principle is that the
 * student types the exam's own sentence, so this file grows by reading exams, not by inventing
 * syntax.
 */

export type CatalogCategory =
  | 'parameters'
  | 'points'
  | 'lines'
  | 'circles'
  | 'conics'
  | 'shapes'
  | 'derived'
  | 'relations';

export interface CatalogEntryAnalytic {
  category: CatalogCategory;
  he: string;
  en: string;
  /**
   * The family this entry belongs to — the coverage map's own index. F1–F11 are the docs/19 §10
   * families, read from the 572 conic corpus; F16/F17 come from the «lines and points» corpus
   * (02c §8) and are the first entries whose source is a different exam topic.
   */
  family: 'F1' | 'F3' | 'F5' | 'F6' | 'F11' | 'F16' | 'F17' | 'F18' | 'F19' | 'F20';
  /**
   * Lines that must be typed BEFORE this one for it to mean anything — «M אמצע AB» needs A and B.
   *
   * Declared rather than assumed, because the catalog guard builds every entry and asserts it draws
   * (#1014): an entry with unstated context would fail that guard for a reason that is not a defect.
   * Hebrew only — it feeds the build check, while the parse check covers both languages.
   */
  needs?: string[];
  /**
   * SHOW THIS ONE FIRST in a capped guide section (#1275).
   *
   * The guide shows six entries per section, and which six used to be FILE ORDER — so every
   * capability added after the section filled up landed in the invisible tail. #1165 added the cevian
   * rows for a student who *"looking for «תיכון» found nothing"*, and they arrived as rows 8 and 9 of
   * «נקודות נגזרות»: still nothing. Marking an entry pulls it into the cap without reordering the
   * catalog, whose order is its own documentation.
   *
   * Which SIX each section should feature is an open pedagogy question (#1347) — this flag is the
   * mechanism, and only the rows a report has actually named carry it today.
   */
  featured?: true;
  /**
   * WHICH READER of the deterministic lane owns this entry (#1154 — 3-D's `lane`, ADR-3D-211, copied).
   *
   * Absent = the construction lane: `parseLine` lowers it to facts, the LLM may emit it, and the guard
   * builds it. `'rewrite'` = a line that edits the SESSION rather than the figure — a rename or a swap,
   * read by `parseSessionEdit` (app/rename.ts) before the grammar and never lowered to a fact. It is listed because the
   * catalog is also the in-app guide (2-D left rename out and the operator could not find it), but it
   * is never taught to the LLM: the fallback adds givens, and a model line that rewrites the student's
   * history is rejected. Every consumer reads THIS field rather than learning about rename separately.
   */
  lane?: 'rewrite';
}

export const COMMAND_CATALOG_ANALYTIC: CatalogEntryAnalytic[] = [
  // --- F11 · parameters (D7 kind 1 — a DOMAIN, not a constraint) ---
  { category: 'parameters', family: 'F11', he: 'a הוא פרמטר חיובי', en: 'a is a positive parameter' },
  { category: 'parameters', family: 'F11', he: 'a הוא פרמטר שונה מאפס', en: 'a is a nonzero parameter' },
  { category: 'parameters', family: 'F11', he: 't הוא פרמטר קטן מ-9', en: 't is a parameter less than 9' },
  { category: 'parameters', family: 'F11', he: 'k הוא פרמטר', en: 'k is a parameter' },
  { category: 'parameters', family: 'F11', he: '0 < k < 6', en: '0 < k < 6' },
  { category: 'parameters', family: 'F11', he: 'a > 0', en: 'a > 0' },

  // --- F1 · points ---
  { featured: true, category: 'points', family: 'F1', he: 'נתונה הנקודה A(2,6)', en: 'point A(2,6)' },
  { featured: true, category: 'points', family: 'F1', he: 'נתונות הנקודות A(0,24), B(18,0)', en: 'points A(0,24), B(18,0)' },
  { featured: true, category: 'points', family: 'F1', he: 'A(-9a,0)', en: 'A(-9a,0)' },
  /**
   * A point NAMED without being PLACED (#1136) — two degrees of freedom, its own.
   *
   * The sentence the locus lane stands on: «המקום הגיאומטרי של M» asks about a point that must exist
   * before any property can be stated about it. Until this, the only route to a 2-DOF point was to
   * smuggle it in as a polygon vertex («משולש ABM»), which asserts a triangle the student never
   * mentioned — ADR-052's cardinal sin through the front door.
   */
  { featured: true, category: 'points', family: 'F1', he: 'נקודה M', en: 'point M' },
  // #1154 — change a point's letter: every line and ask row that names it is rewritten. A session
  // edit, not a given (`lane: 'rewrite'`); also offered by clicking the point → «שנה אות». Not featured.
  { category: 'points', family: 'F1', lane: 'rewrite', needs: ['נתונה הנקודה A(2,6)'], he: 'שנה שם A ל-G', en: 'rename A to G' },
  // #1303 / #1631 — swap two letters: every line and ask row that names either is rewritten at once.
  // A session edit (`lane: 'rewrite'`), not a given. Not featured.
  { category: 'points', family: 'F1', lane: 'rewrite', needs: ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)'], he: 'החלף בין A ל-B', en: 'swap A and B' },

  // --- F3 · lines by equation ---
  { featured: true, category: 'lines', family: 'F3', he: 'נתון הישר l1: 4y-3x-20=0', en: 'line l1: 4y-3x-20=0' },
  { featured: true, category: 'lines', family: 'F3', he: 'משוואת הישר AC היא y=-2x+8', en: 'the line AC is y=-2x+8' },
  { featured: true, category: 'lines', family: 'F3', he: 'הישר x=-4', en: 'the line x=-4' },
  // The LINE through two named points, drawn (#1639, ADR-AG-198) — «הישר AB» the line, where «הקטע AB» is the segment.
  { category: 'lines', family: 'F3', he: 'הישר AB', en: 'the line AB', needs: ['A(0,0)', 'B(4,3)'] },
  { category: 'lines', family: 'F3', he: 'הישר y=x', en: 'the line y=x' },

  // The noun is OPTIONAL for an equation (02c R6, #1037) — the fit names the family, and the
  // corpus writes figures this way: image 6 gives a triangle as `4x+3y=0`, `12x-5y=0`, `x=15`.
  // Language-neutral by construction, so the He and En halves are the same string.
  { category: 'lines', family: 'F3', he: 'x-y+2=0', en: 'x-y+2=0' },
  { category: 'lines', family: 'F3', he: '4x+3y=0', en: '4x+3y=0' },

  // A line CONSTRUCTED through a point, copying a direction (#1093, ADR-AG-057). Not an equation
  // given but a construction: the line does not exist until the sentence creates it.
  { featured: true, category: 'lines', family: 'F3', he: 'דרך P עובר ישר מקביל לציר ה-x', en: 'a line through P is parallel to the x-axis' },
  { category: 'lines', family: 'F3', he: 'דרך P עובר ישר מאונך לציר ה-x', en: 'a line through P is perpendicular to the x-axis' },
  /**
   * A line through a point with a FREE direction (#1319, ADR-AG-144) — the exam's own «דרך הנקודה N
   * עובר ישר», whose direction is what the rest of the question determines. Named or anonymous.
   */
  { category: 'lines', family: 'F3', he: 'דרך P עובר ישר', en: 'a line through P' },
  { category: 'lines', family: 'F3', he: 'דרך P עובר ישר l3', en: 'line l3 through P' },
  /**
   * The exam's constructions as declarative sentences (#1620 slice C, ADR-AG-207) — the perpendicular dropped from a
   * point and its foot (corpus 5/5, 17/4, 20/4), the line through a point that cuts a side (13/4, 14/4), and the
   * perpendicular named by its description (5/5). The imperatives («הורידו», «העבירו») are taught onto these.
   */
  { category: 'lines', family: 'F3', he: 'האנך מהנקודה B לציר ה-x', en: 'the perpendicular from B to the x-axis', needs: ['B(1,14)'] },
  { category: 'lines', family: 'F3', he: 'האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D', en: 'the perpendicular from C to the x-axis meets it at D', needs: ['C(4,6)'] },
  { category: 'lines', family: 'F3', he: 'D רגל האנך מ-C לציר ה-x', en: 'D is the foot of the perpendicular from C to the x-axis', needs: ['C(4,6)'] },
  {
    category: 'lines',
    family: 'F3',
    he: 'האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה',
    en: 'the perpendiculars from A and C to the x-axis meet it at E and F respectively',
    needs: ['A(2,3)', 'C(5,7)'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך את הצלע AB בנקודה F',
    en: 'the line through E parallel to the y-axis cuts side AB at F',
    needs: ['A(0,0)', 'B(6,4)', 'E(3,-2)'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'הנקודה E נמצאת על האנך שהורידו מנקודה B לציר ה-x',
    en: 'E is on the perpendicular from B to the x-axis',
    needs: ['B(1,14)', 'האנך מהנקודה B לציר ה-x'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'המשיק והאנך נחתכים בנקודה D',
    en: 'the tangent and the perpendicular intersect at D',
    needs: ['נתון מעגל שמרכזו M(7,6) ורדיוסו 5', 'C(4,10)', 'המשיק למעגל בנקודה C', 'B(1,14)', 'האנך מהנקודה B לציר ה-x'],
  },
  { category: 'lines', family: 'F3', he: 'ישר דרך P מאונך ל-AB', en: 'line through P perpendicular to AB', needs: ['A(0,0)', 'B(4,3)', 'נקודה P'] },
  { category: 'lines', family: 'F3', he: 'F רגל האנך מ-C ל-AD', en: 'F is the foot of the perpendicular from C to AD', needs: ['מרובע ABCD'] },
  { category: 'lines', family: 'F3', he: 'אנך אמצעי ל-AB', en: 'the perpendicular bisector of AB', needs: ['A(0,0)', 'B(4,3)'] },
  /**
   * A line by a POINT AND A SLOPE (#1278, ADR-AG-186) — written in point-slope form, the stated numbers
   * copied as given. The equation layer evaluates it as it stands (no CAS: nothing is simplified), so
   * the textbook's own form needs no arithmetic from the student or from the LLM lane, which had no
   * pattern for this construct and answered in prose.
   */
  { category: 'lines', family: 'F3', he: 'הישר y-3=4(x-2)', en: 'the line y-3=4(x-2)' },
  /**
   * The exam names its lines by NUMERAL (#1298, #1318; ADR-AG-144 — operator ruling 2026-09-21: a digit
   * may name a line). «הישר 1» and «הישר I» declare and refer wherever a name works.
   */
  { category: 'lines', family: 'F3', he: 'נתון הישר 1: 2x-y+8=0', en: 'line 1: 2x-y+8=0' },
  { category: 'lines', family: 'F3', he: 'נתון הישר I: 2x-y+8=0', en: 'line I: 2x-y+8=0' },
  { category: 'lines', family: 'F3', he: 'משוואת ישר 2 היא x+3y-10=0', en: 'line 2: x+3y-10=0' },
  {
    category: 'lines',
    family: 'F3',
    featured: true,
    he: 'N על הישר 1',
    en: 'N is on line 1',
    needs: ['נתון הישר 1: 2x-y+8=0'],
  },
  /**
   * A PARAMETRIC line and the given that PINS its parameter (#1317, ADR-AG-144): the exam's part (א)
   * is «מצא את k», and «N על הישר 3» is what determines it — the solve vector holds the parameter.
   */
  {
    category: 'lines',
    family: 'F3',
    featured: true,
    he: 'נתון הישר 3: (k+1)x+2y-12+5k=0',
    en: 'line 3: (k+1)x+2y-12+5k=0',
    needs: ['k הוא פרמטר'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'N על הישר 3',
    en: 'N is on line 3',
    needs: ['k הוא פרמטר', 'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N(-2,4)'],
  },
  /**
   * --- INCIDENCE IN THE EXAM'S OTHER ORDERS (#1281, #1495, ADR-AG-164) ---
   *
   * The line first («ישר 3 עובר דרך הנקודה N» — the operator's own sentence, which pins k), a SIDE as the
   * subject («הצלע BC נמצאת על הישר y=x-4», the operator's report), and a point by its coordinates alone,
   * which the tool names (P₁) and says so on the row.
   */
  {
    category: 'lines',
    family: 'F3',
    he: 'ישר 3 עובר דרך הנקודה N',
    en: 'line 3 passes through the point N',
    needs: ['k הוא פרמטר', 'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N(-2,4)'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'הצלע BC נמצאת על הישר y=x-4',
    en: 'the side BC lies on the line y=x-4',
    needs: ['משולש ABC'],
  },
  {
    category: 'lines',
    family: 'F3',
    he: 'הישר CD עובר דרך הנקודה (-3,7)',
    en: 'the line CD passes through the point (-3,7)',
    needs: ['C(-5,5)', 'נקודה D'],
  },

  // --- F5 · circles by equation ---
  {
    category: 'circles',
    family: 'F5',
    featured: true,
    he: 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
    en: 'circle I: (x-3)^2+(y-4)^2=9',
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1',
    en: 'circle II: (x+5)^2+(y-2)^2=1',
  },
  // A DIGIT names a circle exactly as a Roman numeral does (#1216, operator ruling 2026-09-19). One
  // row, not five: the card's job is to show that the digit form exists, and the numeral is the only
  // thing that varies. The Roman rows above stay — the ruling extends that set, it does not replace it.
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9',
    en: 'circle 1: (x-3)^2+(y-4)^2=9',
  },
  { category: 'circles', family: 'F5', featured: true, he: 'משוואת המעגל x^2+y^2-2ax-2x=0', en: 'the circle x^2+y^2-2ax-2x=0' },

  // --- F5 · circles COMPUTED from points (#1464, #1324, ADR-AG-160) ---
  // The operator's own kite words from prod session j73pikxb, each `not-handled` until this: the circle
  // through three points (three spellings — the run, the verb, the circumscribed noun) and the circle on a
  // diameter (the statement and the defining «שקוטרו»). No equation and no centre letter: both are computed.
  {
    category: 'circles',
    family: 'F5',
    featured: true,
    he: 'מעגל ABD',
    en: 'circle ABD',
    needs: ['A(1,7)', 'B(7,7)', 'D(1,1)'],
  },
  // Unfeatured for #1501 (provisional, flagged for the operator): its sibling spelling «מעגל ABD»
  // stays featured, and the tangency rows the operator's report named take the two seats — the
  // #1347 lint holds a capped section to exactly six.
  {
    category: 'circles',
    family: 'F5',
    he: 'המעגל העובר דרך הנקודות A, B ו-D',
    en: 'the circle through the points A, B and D',
    needs: ['A(1,7)', 'B(7,7)', 'D(1,1)'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'המעגל החוסם את המשולש ABD',
    en: 'the circumcircle of triangle ABD',
    needs: ['A(1,7)', 'B(7,7)', 'D(1,1)'],
  },
  {
    category: 'circles',
    family: 'F5',
    featured: true,
    he: 'BD קוטר במעגל',
    en: 'BD is a diameter of the circle',
    needs: ['B(7,7)', 'D(1,1)'],
  },
  // The circle named by its ring or by its centre inside another sentence (#1663, ADR-AG-203).
  {
    category: 'circles',
    family: 'F5',
    he: 'D על המעגל החוסם את המשולש ABC',
    en: 'D is on the circumcircle of triangle ABC',
    needs: ['A(0,0)', 'B(6,0)', 'C(2,4)', 'משולש ABC חסום במעגל', 'x^2+y^2=16'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'A על המעגל שמרכזו M',
    en: 'A is on the circle with centre M',
    needs: ['נתון מעגל שמרכזו M', 'x^2+y^2=16'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל שקוטרו BD',
    en: 'the circle with diameter BD',
    needs: ['B(7,7)', 'D(1,1)'],
  },

  // --- F5 · inscribed and circumscribed (#1619 B2, #1554, ADR-AG-194) ---
  // The 471 exams' own openers: a polygon of any noun inscribed in a circle (bare, on a centre, by its
  // equation), the acute triangle, «בר חסימה», and the converse — the incircle and its touch points.
  // Unfeatured: this section's six are chosen (#1347), and these join its tail.
  { category: 'circles', family: 'F5', he: 'מרובע ABCD חסום במעגל', en: 'quadrilateral ABCD is inscribed in a circle' },
  {
    category: 'circles',
    family: 'F5',
    he: 'המשולש ABC חסום במעגל שמרכזו M',
    en: 'triangle ABC is inscribed in a circle with centre M',
  },
  { category: 'circles', family: 'F5', he: 'במעגל חסום משולש חד זוויות ABC', en: 'acute triangle ABC is inscribed in a circle' },
  { category: 'circles', family: 'F5', he: 'מרובע ABCD בר חסימה', en: 'cyclic quadrilateral ABCD' },
  { category: 'circles', family: 'F5', he: 'מעגל חסום במשולש ABC', en: 'the incircle of triangle ABC' },
  {
    category: 'circles',
    family: 'F5',
    he: 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה',
    en: 'the sides AB, BC and CA touch the circle at D, E and F respectively',
    needs: ['מעגל חסום במשולש ABC'],
  },
  { category: 'circles', family: 'F5', he: 'מעגל חסום במרובע ABCD', en: 'a circle inscribed in quadrilateral ABCD' },

  // --- F5 · tangency — how the corpus pins a circle WITHOUT giving its radius (#1060 axes,
  // #1501 lines). These rows are also what teaches the LLM lane the vocabulary: neither half was
  // in the catalog before #1501, so the fallback could never emit a tangency at all.
  { category: 'circles', family: 'F5', he: 'מעגל O משיק לציר ה-x', en: 'circle O is tangent to the x-axis' },
  { category: 'circles', family: 'F5', he: 'המעגל O משיק לשני הצירים', en: 'circle O is tangent to both axes' },
  // #1432 — the radius as a given, and the focus as a namable point (ADR-AG-169). Not featured.
  { category: 'circles', family: 'F5', he: 'נתון מעגל O שרדיוסו 5', en: 'circle O with radius 5' },
  // #1622 E4 (ADR-AG-220) — 2-D's arcs, sectors, semicircles and the diameter from a point, ported. Not featured.
  { category: 'circles', family: 'F5', he: 'מעגל O בקוטר 10', en: 'circle O with diameter 10' },
  { category: 'circles', family: 'F5', he: 'קשת AB = 40 במעגל O', en: 'arc AB = 40 in circle O', needs: ['משולש ABC', 'מעגל O'] },
  { category: 'circles', family: 'F5', he: '⌢{AC} = 60°', en: '⌢{AC} = 60°', needs: ['מעגל O', 'A על מעגל O', 'C על מעגל O'] },
  { category: 'circles', family: 'F5', he: 'קשת DE = 2 קשת CE במעגל O', en: 'arc DE = 2 arc CE in circle O', needs: ['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O',
    en: 'arc AC + arc BE = arc AD + arc BC in circle O',
    needs: ['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O'],
  },
  { category: 'circles', family: 'F5', he: 'זוית מרכזית COD', en: 'central angle COD' },
  { category: 'circles', family: 'F5', he: 'M אמצע הקשת BC במעגל O', en: 'M is the midpoint of arc BC in circle O' },
  { category: 'circles', family: 'F5', he: 'חצי מעגל שקוטרו AB', en: 'semicircle with diameter AB' },
  { category: 'circles', family: 'F5', he: 'חצי מעגל על צלע AB מחוץ למשולש ABC', en: 'semicircle on side AB outside triangle ABC' },
  { category: 'circles', family: 'F5', he: 'על כל צלע של ריבוע ABCD יש חצי מעגל', en: 'a semicircle on each side of square ABCD' },
  { category: 'circles', family: 'F5', he: 'רבע מעגל', en: 'quarter circle' },
  { category: 'circles', family: 'F5', he: 'גזרה AOB בזווית 80', en: 'sector AOB with angle 80' },
  { category: 'circles', family: 'F5', he: 'קוטר', en: 'a diameter' },
  { category: 'circles', family: 'F5', he: 'קוטר מנקודה F במעגל O', en: 'diameter from point F in circle O' },
  { category: 'circles', family: 'F5', he: 'קוטר העובר בנקודה A במעגל O', en: 'diameter through point A in circle O' },
  {
    category: 'circles',
    family: 'F5',
    he: 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E',
    en: 'diameter of circle O from point F meets side AC at E',
    needs: ['משולש ABC', 'מעגל O', 'F על מעגל O'],
  },
  { category: 'derived', family: 'F16', he: 'F מוקד הפרבולה', en: 'F is the focus of the parabola', needs: ['נתונה פרבולה שמשוואתה y^2=8x'] },
  // #1432 am. 1 — the bagrut's centre-by-coordinates circle, and the perimeter as a real given. Not featured.
  { category: 'circles', family: 'F5', he: 'נתון מעגל שמרכזו (2,3) ורדיוסו 5', en: 'circle centred at (2,3) with radius 5' },
  { category: 'relations', family: 'F20', he: 'היקף המשולש ABC הוא 12', en: 'the perimeter of triangle ABC is 12', needs: ['A(0,0)', 'B(3,0)', 'נקודה C'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'מעגל M משיק לישר l1',
    en: 'circle M is tangent to line l1',
    needs: ['נתון הישר l1: y=2x+5'],
  },
  // The operator's own two sentences (2026-09-28, #1501) carry the flag — the #1275 rule that a
  // reported row is pulled into the guide's cap; which six of the section's featured rows show is
  // #1347's open pedagogy question.
  {
    category: 'circles',
    family: 'F5',
    featured: true,
    he: 'מעגל M משיק לישרים l1 ו-l2',
    en: 'circle M is tangent to lines l1 and l2',
    needs: ['נתון הישר l1: y=2x+5', 'נתון הישר l2: y=-x+1'],
  },
  { category: 'circles', family: 'F5', featured: true, he: 'מעגל M משיק לישר 3x+4y=0', en: 'circle M is tangent to line 3x+4y=0' },
  {
    category: 'circles',
    family: 'F5',
    he: 'הישר l1 משיק למעגל M',
    en: 'the line l1 is tangent to the circle M',
    needs: ['נתון הישר l1: y=2x+5', 'נתון מעגל M'],
  },
  // Circle-to-circle tangency (#1504) — the operator's T9 report; external/internal cycles, and
  // «מבחוץ»/«מבפנים» pin the touch. Not featured: the six featured seats are #1347's pedagogy call.
  {
    category: 'circles',
    family: 'F5',
    he: 'מעגל M משיק למעגל K',
    en: 'circle M is tangent to circle K',
    needs: ['נתון מעגל K'],
  },
  { category: 'circles', family: 'F5', he: 'המעגלים משיקים מבחוץ', en: 'the circles are tangent externally', needs: ['נתון מעגל K', 'נתון מעגל M'] },
  // The operator's own spelling (#1504 pre-play): two named circles as ONE subject.
  { category: 'circles', family: 'F5', he: 'מעגל O ומעגל M משיקים מבחוץ', en: 'circle O and circle M are tangent externally' },
  // The touch point, named (#1504 amendment 1) — a derived point on the line of centres.
  {
    category: 'circles',
    family: 'F5',
    he: 'מעגל M משיק למעגל K בנקודה T',
    en: 'circle M is tangent to circle K at T',
    needs: ['נתון מעגל K'],
  },
  // Tangency AT a named point, the tangent as an object, and chords (#1619 B3, #1430, ADR-AG-195) — the
  // 471 booklet's own sentences. Not featured: which rows take the section's six seats is #1347's call.
  { category: 'circles', family: 'F5', he: 'המעגל משיק לציר ה-x בנקודה A', en: 'the circle is tangent to the x-axis at the point A', needs: ['נתון מעגל שמרכזו M(6,10)'] },
  { category: 'circles', family: 'F5', he: 'הישר BC משיק למעגל בנקודה B', en: 'the line BC is tangent to the circle at B', needs: ['נתון מעגל x^2+y^2=25', 'B(3,4)'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה',
    en: 'AB and BC are tangent to the circle at the points A and C respectively',
    needs: ['נתון מעגל שמרכזו O(-2,1)', 'B(8,11)'],
  },
  { category: 'circles', family: 'F5', he: 'המשיק למעגל בנקודה A', en: 'the tangent to the circle at A', needs: ['נתון מעגל x^2+y^2=25', 'A(3,4)'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'משוואת המשיק למעגל בנקודה A היא 3x+4y=25',
    en: 'the equation of the tangent to the circle at A is 3x+4y=25',
    needs: ['נתון מעגל x^2+y^2=25', 'A(3,4)'],
  },
  // The two tangents meet (#1620 S7, ADR-AG-213) — 2-D's sentence, its plural, and the bare reference.
  { category: 'circles', family: 'F5', he: 'המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D', en: 'the tangent at A and the tangent at C to circle O meet at D' },
  { category: 'circles', family: 'F5', he: 'המשיקים למעגל O בנקודות A ו-C נפגשים בנקודה D', en: 'the tangents to circle O at A and C meet at D' },
  { category: 'circles', family: 'F5', he: 'המשיקים נפגשים בנקודה D', en: 'the tangents meet at D', needs: ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C'] },
  { category: 'circles', family: 'F5', he: 'דרך P עובר משיק למעגל', en: 'a tangent to the circle passes through P', needs: ['נתון מעגל x^2+y^2=25', 'P(10,0)'] },
  { category: 'circles', family: 'F5', he: 'AB מיתר במעגל', en: 'AB is a chord of the circle', needs: ['נתון מעגל x^2+y^2=25'] },
  // Two chords of a circle not stated yet: the sentence states it on its centre letter, as 2-D does (#1670, ADR-AG-210).
  { category: 'circles', family: 'F5', he: 'AB ו-CD מיתרים במעגל O', en: 'AB and CD are chords of the circle O' },
  {
    category: 'circles',
    family: 'F5',
    he: 'במעגל המיתרים AC ו-BD נפגשים בנקודה E',
    en: 'in the circle the chords AC and BD meet at E',
    needs: ['נתון מעגל x^2+y^2=25'],
  },
  // A piece named by its ROLE — the noun's claim is stated with it (#1651, #1620 item 2; ADR-AG-200). Not featured; the
  // two polygon-role rows sit in «relations» (a length, an incidence) so «shapes» stays under the guide's cap (#1347).
  {
    category: 'circles',
    family: 'F5',
    he: 'המיתר BC מקביל לציר ה-x',
    en: 'the chord BC is parallel to the x-axis',
    needs: ['נתון מעגל שמרכזו M', 'B על המעגל', 'C על המעגל'],
  },
  { category: 'circles', family: 'F5', he: 'הרדיוס MB מאונך לציר ה-x', en: 'the radius MB is perpendicular to the x-axis', needs: ['נתון מעגל שמרכזו M', 'נקודה B'] },
  { category: 'relations', family: 'F17', he: 'אורך השוק BC הוא 6', en: 'the leg BC = 6', needs: ['טרפז ABCD'] },
  { category: 'relations', family: 'F17', he: 'היתר AC מונח על הישר y = x', en: 'the hypotenuse AC lies on the line y = x', needs: ['משולש ישר זווית ABC'] },

  // The 4-point questions' circle sentences (#1619 B1, ADR-AG-193) — the exam's own wording about the
  // circle it has: points on it, its axis crossings, its centre placed, its regions. Not featured: the six
  // featured seats are #1347's pedagogy call.
  { category: 'circles', family: 'F5', he: 'המעגל עובר דרך A', en: 'the circle passes through A', needs: ['נתון מעגל שמרכזו M'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'המעגל חותך את ציר ה-x בנקודות B ו-C',
    en: 'the circle cuts the x-axis at points B and C',
    needs: ['נתון מעגל שמרכזו M'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'המעגל חותך את החלק החיובי של ציר ה-x בנקודה A',
    en: 'the circle cuts the positive x-axis at A',
    needs: ['נתון מעגל שמרכזו M'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'B היא אחת מנקודות החיתוך של המעגל עם ציר ה-y',
    en: 'B is one of the intersection points of the circle with the y-axis',
    needs: ['נתון מעגל שמרכזו M'],
  },
  { category: 'circles', family: 'F5', he: 'מרכז המעגל M נמצא על ציר ה-y', en: 'the centre of the circle, M, is on the y-axis', needs: ['נתון מעגל שמרכזו M'] },
  {
    category: 'circles',
    family: 'F5',
    he: 'הנקודה B נמצאת מחוץ למעגל',
    en: 'B is outside the circle',
    needs: ['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 5'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'הנקודה E נמצאת על הקשת הקטנה AC',
    en: 'E is on the minor arc AC',
    needs: ['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 5', 'A(5,0)', 'C(0,5)'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'אורך הקטע AB שווה לרדיוס המעגל',
    en: 'AB equals the radius of the circle',
    needs: ['נתון מעגל שמרכזו M', 'A(0,0)', 'B(3,4)'],
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'CD עובר דרך מרכז המעגל',
    en: 'CD passes through the centre of the circle',
    needs: ['נתון מעגל שמרכזו M', 'C(1,2)', 'D(4,6)'],
  },

  // --- F6 · conics by equation (canonical only — D6/§2a) ---
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה קנונית שמשוואתה y^2=54x', en: 'canonical parabola y^2=54x' },
  // A conic may be NAMED like a circle (#1271) — two parabolas in one figure are referable.
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה I שמשוואתה y^2=2x', en: 'parabola I: y^2=2x' },
  // `p`, not `a` (#1022). It is not an arbitrary parameter name in this topic: the 5-unit formula
  // sheet does NOT carry the parabola, so «y² = 2px, focus (p/2,0), directrix x = -p/2» is recited
  // from memory as a triple (docs/19 §3). A card offering `2ax` teaches a student to rename the one
  // letter whose meaning they already know. Both spellings parse identically; only the teaching differs.
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה שמשוואתה y^2=2px', en: 'parabola y^2=2px' },
  {
    category: 'conics',
    family: 'F6',
    he: 'נתונה אליפסה שמשוואתה x^2/9+y^2/16=1',
    en: 'ellipse x^2/9+y^2/16=1',
  },

  // Unfeatured for #1501 (provisional, flagged for the operator): the named form of the same
  // equation capability — «נתון מעגל I שמשוואתו …» — stays featured.
  { category: 'circles', family: 'F5', he: '(x-3)^2+(y-4)^2=9', en: '(x-3)^2+(y-4)^2=9' },
  { category: 'conics', family: 'F6', he: 'y^2=54x', en: 'y^2=54x' },
  { category: 'conics', family: 'F6', he: 'x^2/9+y^2/16=1', en: 'x^2/9+y^2/16=1' },

  // --- F17 · segments and NEUTRAL shape nouns (02c §8) ---
  // Only the nouns that carry no constraint of their own. «מקבילית» / «טרפז» / «ריבוע» each carry a
  // given this slice cannot honour, so they are refused by name rather than taught here.
  { featured: true, category: 'shapes', family: 'F17', he: 'הקטע AB', en: 'segment AB', needs: ['A(0,0)', 'B(4,3)'] },
  // --- F19 · the DISTANCE, in the spellings a student actually writes (#1128) ---
  // Three rows walking the three FAMILIES of spelling — the plain Hebrew noun, the textbook
  // subscript, the absolute-value bars — rather than all thirteen, which are one term and are
  // proved equal to each other by the lock. The card's job is to show that each family exists.
  {
    category: 'relations',
    family: 'F19',
    featured: true,
    he: 'אורך הקטע AB = 10',
    en: 'length AB = 10',
    needs: ['A(0,0)', 'נקודה B'],
  },
  {
    category: 'relations',
    family: 'F19',
    he: 'd_{AB} = 10',
    en: 'd_{AB} = 10',
    needs: ['A(0,0)', 'נקודה B'],
  },
  {
    category: 'relations',
    family: 'F19',
    he: 'המרחק בין A ל-B = 10',
    en: 'the distance between A and B = 10',
    needs: ['A(0,0)', 'נקודה B'],
  },

  {
    featured: true, category: 'shapes',
    family: 'F17',
    he: 'משולש ABC',
    en: 'triangle ABC',
    needs: ['A(1,3)', 'B(-4,1)', 'C(-3,8)'],
  },
  {
    featured: true, category: 'shapes',
    family: 'F17',
    he: 'מרובע ABCD',
    en: 'quadrilateral ABCD',
    needs: ['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)'],
  },

  // --- F18 · relations between DIRECTIONS (#1052) ---
  // One relation over four kinds of operand — a segment, a polygon side, a named line, an axis.
  // The entries below walk the OPERANDS deliberately, because that is what the resolver has to get
  // right; a catalog that listed four phrasings of the same operand would prove nothing.
  {
    category: 'relations',
    family: 'F18',
    he: 'AB מקביל ל-DC',
    en: 'AB is parallel to DC',
    needs: ['מרובע ABCD'],
  },
  {
    category: 'relations',
    family: 'F18',
    he: 'הצלע AB מאונכת לצלע BC',
    en: 'side AB is perpendicular to side BC',
    needs: ['משולש ABC'],
  },
  // The exam's own NOTATION (#1160). The relation was built and well tested; only its symbols were
  // unreadable, so the student who wrote what the page prints was told it was not understood. Listed
  // because the catalog is the coverage map: the guard re-parses every row, so a symbol that stops
  // parsing fails the suite instead of quietly becoming documentation.
  {
    category: 'relations',
    family: 'F18',
    featured: true,
    he: 'AB ∥ DC',
    en: 'AB ∥ DC',
    needs: ['מרובע ABCD'],
  },
  {
    category: 'relations',
    family: 'F18',
    featured: true,
    he: 'AB ⊥ BC',
    en: 'AB ⊥ BC',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F18',
    he: 'AB מקביל לציר ה-x',
    en: 'AB is parallel to the x-axis',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F18',
    he: 'AB מאונך לישר l1',
    en: 'AB is perpendicular to line l1',
    needs: ['נתון הישר l1: y=x', 'משולש ABC'],
  },

  // --- F19 · slope as a GIVEN (#1051) ---
  // The same direction algebra as F18 — parallel IS equal slope — so the two share one definition
  // and the tool cannot state a slope one way and a parallelism another.
  {
    category: 'relations',
    family: 'F19',
    featured: true,
    he: 'שיפוע AB הוא 2',
    en: 'the slope of AB is 2',
    needs: ['משולש ABC'],
  },
  /** The same construct with the point NAMED (#1278): a free-direction line through it, then its slope. */
  {
    category: 'relations',
    family: 'F19',
    he: 'שיפוע הישר l1 הוא 4',
    en: 'the slope of line l1 is 4',
    needs: ['A(2,3)', 'דרך A עובר ישר l1'],
  },
  /**
   * The SIGN of a slope (#1323, ADR-AG-144) — the exam's «ושיפועו שלילי», which picks between two
   * configurations. A selector inside validity, never a value keyword in the slope rule.
   */
  {
    category: 'relations',
    family: 'F19',
    he: 'שיפוע הישר AB שלילי',
    en: 'the slope of AB is negative',
    needs: ['משולש ABC'],
  },

  // --- F20 · lengths as VALUES (#1050) ---
  // One constraint kind with different TREES, so the entries walk the tree shapes rather than the
  // phrasings: a length against a number, a length against a length, and a sum.
  {
    category: 'relations',
    family: 'F20',
    he: 'AB = 10',
    en: 'AB = 10',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F20',
    he: 'AB = AC',
    en: 'AB = AC',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F20',
    he: 'AB + BC = 10',
    en: 'AB + BC = 10',
    needs: ['משולש ABC'],
  },

  /**
   * --- spellings the tool WRITES and would not READ (#1127, #1134) ---
   *
   * Each is listed in its own right, per the #347 lesson: the coverage guard builds every entry, so a
   * spelling that is not here is never exercised and can rot back out in silence. That is exactly how
   * `x_A` came to be printed by the panel and refused by the parser.
   */
  {
    category: 'points',
    family: 'F1',
    featured: true,
    he: 'x_A = 5',
    en: 'x_A = 5',
  },
  {
    category: 'points',
    family: 'F1',
    he: 'x של A הוא 5',
    en: 'the x-coordinate of A is 5',
  },

  /**
   * --- a coordinate COMPARED (#1462, ADR-AG-161) — the exam's way of choosing a root ---
   *
   * The symbolic row is the panel's own `x_A` notation and the spelling the LLM already emitted for the
   * operator unprompted; the Hebrew row is the exam's sentence. A comparison with a VALUE is the plan's
   * `x_B > 3` / `y_A < 0` pair. Each row builds in a context where it holds, because a reference card
   * whose example refuses would be teaching a refusal.
   */
  {
    category: 'points',
    family: 'F1',
    he: 'x_B > x_D',
    en: 'x_B > x_D',
    needs: ['B(7,7)', 'D(1,1)'],
  },
  {
    category: 'points',
    family: 'F1',
    he: 'שיעור ה-x של B גדול משיעור ה-x של D',
    en: 'the x-coordinate of B is greater than that of D',
    needs: ['B(7,7)', 'D(1,1)'],
  },
  { category: 'points', family: 'F1', he: 'x_B > 3', en: 'x_B > 3', needs: ['B(7,7)'] },
  { category: 'points', family: 'F1', he: 'y_A < 0', en: 'y_A < 0', needs: ['A(1,-2)'] },
  /*
   * --- the exam names a VERTEX («הקודקוד A», #1621 D3, ADR-AG-216) — 471 corpus 14/4, 13/4, 23/4 ---
   */
  { category: 'points', family: 'F1', he: 'שיעור ה-y של הקודקוד A הוא 10', en: 'the y-coordinate of A is 10', needs: ['משולש ABC'] },
  { category: 'points', family: 'F1', he: 'שיעור ה-y של הקודקוד B קטן מ-6', en: 'the y-coordinate of B is less than 6', needs: ['משולש ABC'] },
  {
    category: 'points',
    family: 'F1',
    featured: true,
    he: 'קדקוד A(1,2)',
    /**
     * English has no `vertex` NOUN, and deliberately does not gain one here. `point` is spelled inline
     * at six call sites rather than in a shared token, so adding `vertex` beside each would be the
     * re-spelled-inline drift this issue's own plan warns about. The Hebrew spelling is what #1127 is
     * about; an English equivalent is its own issue if the corpus ever wants one.
     */
    en: 'point A(1,2)',
  },

  /**
   * --- the COLON-RATIO family (#1124), F20: it lowers to the same length-eq as «AB = 10» ---
   *
   * Listed in full rather than by one representative, and that is the direct lesson of #347: the
   * coverage guard builds every entry, so a spelling that is not here is never exercised and can rot
   * back out in silence. Three forms, because the exam writes all three.
   */
  {
    category: 'relations',
    family: 'F20',
    featured: true,
    he: 'AC:CB = 3:2',
    en: 'AC:CB = 3:2',
    needs: ['A(0,0)', 'B(10,0)', 'C על הקטע AB'],
  },
  {
    category: 'relations',
    family: 'F20',
    he: 'C מחלקת את AB ביחס 3:2',
    en: 'C divides AB in ratio 3:2',
    needs: ['A(0,0)', 'B(10,0)'],
  },
  {
    category: 'relations',
    family: 'F20',
    he: 'היחס בין AC ל-CB הוא 3:2',
    en: 'the ratio between AC and CB is 3:2',
    needs: ['A(0,0)', 'B(10,0)'],
  },
  /**
   * --- MEASURES AS GIVENS (#1621, ADR-AG-214), F20: the ratio of two measures and the area notation ---
   *
   * The exam's own spellings (corpus 6/5, 7/4, 16/5, 18/4), each lowering to the same `length-eq` as
   * «AB = 10»: the prose ratio of two AREAS, the `S_{}` notation (the palette's chip), an area value with
   * «שווה ל-», and a length ratio by `/`.
   */
  {
    category: 'relations',
    family: 'F20',
    he: 'היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5',
    en: 'the ratio of the area of triangle AOB to the area of trapezoid ADCB is 4:5',
    needs: ['משולש AOB', 'טרפז ADCB'],
  },
  {
    category: 'relations',
    family: 'F20',
    he: 'S_{ABD} / S_{ADC} = 0.8',
    en: 'S_{ABD} / S_{ADC} = 0.8',
    needs: ['משולש ABC', 'נקודה D על BC'],
  },
  { category: 'relations', family: 'F20', he: 'S_{ABC} = 13', en: 'S_{ABC} = 13', needs: ['משולש ABC'] },
  {
    category: 'relations',
    family: 'F20',
    he: 'שטח המשולש ABC שווה ל-45',
    en: 'the area of triangle ABC is 45',
    needs: ['משולש ABC'],
  },
  { category: 'relations', family: 'F20', he: 'BD/DC = 2/3', en: 'BD/DC = 2/3', needs: ['משולש ABC', 'נקודה D על BC'] },

  /**
   * A RIGHT ANGLE (#1049), in the word spelling and in the glyph the 2-D tool teaches (#1330). The
   * glyph row is the one a student who learned `∠` on the sibling page will look for; the guard below
   * this file drives both through the real grammar in both languages.
   */
  {
    category: 'relations',
    family: 'F17',
    he: 'זווית ABC ישרה',
    en: 'angle ABC is right',
    needs: ['משולש ABC'],
  },
  /**
   * The DEFECTIVE spelling «זוית» (#1407) — as common as «זווית» in student hands, and read by the same
   * noun atom. The row is here so the coverage guard drives the single-vav form through the real
   * grammar; it is the one-letter vertex form, resolved against the declared triangle.
   */
  {
    category: 'relations',
    family: 'F17',
    he: 'זוית C ישרה',
    en: 'angle C is right',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    featured: true,
    he: '∠ABC = 90',
    en: '∠ABC = 90',
    needs: ['משולש ABC'],
  },
  // #1331 — a NUMERIC angle and an angle in RATIO to another (the 2-D ADR-018 / ADR-100 pair, ported).
  {
    category: 'relations',
    family: 'F17',
    he: 'זווית ABC היא 60',
    en: 'angle ABC is 60',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: '∠ABC = ∠ACB',
    en: '∠ABC = ∠ACB',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: '∠ABC = 2∠ACB',
    en: '∠ABC = 2∠ACB',
    needs: ['משולש ABC'],
  },
  /**
   * #1407 arm 2 (ADR-AG-158) — the VERTEX ALONE with a value, and on both sides of an equality. Resolved
   * at M1 against the declared triangle, exactly as «זוית C ישרה» above is; the rows are here so the
   * coverage guard drives both through the real grammar and the real resolver.
   */
  {
    category: 'relations',
    family: 'F17',
    he: 'זווית C = 60',
    en: 'angle C is 60',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: '∠B = ∠C',
    en: '∠B = ∠C',
    needs: ['משולש ABC'],
  },
  /**
   * #1621 D2 (ADR-AG-215) — an angle NAMED BY A GREEK LETTER, free until a later given pins it (2-D's `measure-angle`
   * with a variable, then `set-var`), with the exam's «נסמן» lead-in (corpus 471 1/4, 3/4); and tan / cos of an
   * angle as a measure of it (operator ruling 2026-10-01; corpus 471 9/4).
   */
  {
    category: 'relations',
    family: 'F17',
    he: 'נסמן ∢DCB = 2α',
    en: 'let ∠DCB = 2α',
    needs: ['מרובע ABCD'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: 'נסמן: זווית ADB = α',
    en: 'let angle ADB = α',
    needs: ['משולש ABD'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: '∢ABC = α',
    en: '∠ABC = α',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: 'α = 30',
    en: 'α = 30',
    needs: ['משולש ABC', '∢ABC = α'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: 'tan∢ABC = 2',
    en: 'tan∠ABC = 2',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: 'טנגנס הזווית ABC הוא 2',
    en: 'the tangent of angle ABC is 2',
    needs: ['משולש ABC'],
  },
  {
    category: 'relations',
    family: 'F17',
    he: 'קוסינוס הזווית ACB = 3/4',
    en: 'cos∠ACB = 3/4',
    needs: ['משולש ABC'],
  },

  /** Naming a circle's CENTRE (#1109) — the same click-to-name family as a crossing. */
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'O מרכז המעגל I',
    en: 'O is the centre of circle I',
    needs: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'],
  },
  // The centre of the circle the figure HAS, named — contextually or by its equation (#1598, ADR-AG-193).
  { category: 'derived', family: 'F16', he: 'O מרכז המעגל', en: 'O is the centre of the circle', needs: ['(x-3)^2+(y-4)^2=9'] },
  { category: 'derived', family: 'F16', he: 'P מרכז המעגל x^2+y^2=16', en: 'P is the centre of the circle x^2+y^2=16', needs: ['O(5,5)', 'x^2+y^2=16'] },
  // A COMPUTED circle among several, named by its ring (#1663, ADR-AG-203) — the circumcircle and the incircle.
  {
    category: 'derived',
    family: 'F16',
    he: 'K מרכז המעגל החוסם את המשולש ABC',
    en: 'K is the centre of the circumcircle of triangle ABC',
    needs: ['A(0,0)', 'B(6,0)', 'C(2,4)', 'משולש ABC חסום במעגל', 'x^2+y^2=16'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'K מרכז המעגל החסום במשולש ABC',
    en: 'K is the centre of the circle inscribed in triangle ABC',
    needs: ['A(0,0)', 'B(6,0)', 'C(2,4)', 'במשולש ABC חסום מעגל', 'x^2+y^2=16'],
  },
  // The crossing sentence and the point-on-a-named-circle (#1429): neither had a catalog row, so
  // the panel could not teach them and the LLM lane could not emit them — the discoverability half
  // of the operand-resolver class.
  {
    category: 'derived',
    family: 'F16',
    he: 'E נקודת החיתוך של הישר l1 עם הישר l2',
    en: 'E is the intersection of line l1 and line l2',
    needs: ['נתון הישר l1: y=4', 'נתון הישר l2: y=x'],
  },
  // BOTH crossings in one sentence (#1512, ADR-AG-185): the first letter takes the first root of the
  // canonical order, the second letter the second — the operator's ruling (a), never cycled.
  {
    category: 'derived',
    family: 'F16',
    he: 'הישר l1 חותך את המעגל I בנקודות A ו-B',
    en: 'line l1 cuts circle I at points A and B',
    needs: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=4'],
  },
  {
    category: 'points',
    family: 'F3',
    he: 'P על המעגל I',
    en: 'P on circle I',
    needs: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'],
  },
  // A circle named by its CENTRE LETTER (#1619 B1) — the exam's «מעגל M».
  { category: 'points', family: 'F3', he: 'A על מעגל M', en: 'A is on circle M', needs: ['נתון מעגל שמרכזו M'] },

  // --- F16 · derived points over stated vertices (02c §8) ---
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'M אמצע AB',
    en: 'M is the midpoint of AB',
    needs: ['A(8,1)', 'B(-2,-5)'],
  },
  /**
   * The same sentence about a point that ALREADY EXISTS is a CONDITION on it (#1320, ADR-AG-144) — the
   * exam's M is the y-axis crossing AND the midpoint of AB, and the equality is what fixes the second
   * line. Listed with its own context so the coverage map builds the constraint form, not the definition.
   */
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'M מפגש התיכונים במשולש ABC',
    en: 'M is the centroid of triangle ABC',
    needs: ['A(1,3)', 'B(-4,1)', 'C(-3,8)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'O מפגש חוצי הזוויות במשולש ABC',
    en: 'O is the incentre of triangle ABC',
    needs: ['A(-1,-1)', 'B(7,3)', 'C(-4,5)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'H מפגש הגבהים במשולש ABC',
    en: 'H is the orthocentre of triangle ABC',
    needs: ['A(0,0)', 'B(4,0)', 'C(1,3)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'P מפגש האנכים האמצעיים במשולש ABC',
    en: 'P is the circumcentre of triangle ABC',
    needs: ['A(0,0)', 'B(4,0)', 'C(0,3)'],
  },
  // --- F16 · CEVIANS · the named segment from a vertex (#1165) ---
  // Two rows, walking the two axes that the rule actually has to get right rather than four
  // phrasings of one thing: the ROLE (median · altitude) and how the target is NAMED (by the
  // triangle, which determines the side, or by the side outright). The reference card has to show
  // the triangle spelling, because that is the one a student writes and the one that was
  // «not-handled» until this issue.
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'AD תיכון במשולש ABC',
    en: 'AD is the median in triangle ABC',
    needs: ['A(1,3)', 'B(-4,1)', 'C(-3,8)'],
  },
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'AD גובה לצלע BC',
    en: 'AD is the altitude to side BC',
    // An ACUTE triangle, so the foot lands between B and C: the rule admits an obtuse figure too
    // (the foot beyond an endpoint is honest), but a reference card should show the ordinary case.
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  // --- F16 · the cevian family completed (#1284, #1222, #1240; ADR-AG-209) ---
  // The third ROLE (the angle bisector, by its triangle and by its angle), the meeting point of two
  // bisectors, the bisector drawn alone, and the spellings that leave the target or the foot to the
  // figure: «AD גובה» (the side from the one triangle), «גובה מ-A במשולש ABC» and «תיכון לצלע BC»
  // (the tool names the foot), and the exam's plural with «בהתאמה» (7/4).
  {
    category: 'derived',
    family: 'F16',
    he: 'CE חוצה זווית C במשולש ABC',
    en: 'CE is the angle bisector of angle C in triangle ABC',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'AD חוצה את הזווית BAC',
    en: 'AD bisects angle BAC',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'E חיתוך חוצי הזוויות BAC ו-BCA',
    en: 'E is the intersection of the bisectors of angles BAC and BCA',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'חוצה זווית ABC',
    en: 'the bisector of angle ABC',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'AD גובה',
    en: 'AD is the altitude',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)', 'משולש ABC'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'גובה מ-A במשולש ABC',
    en: 'the altitude from A in triangle ABC',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'תיכון ליתר AB',
    en: 'the median to the hypotenuse AB',
    // ADR-AG-211 (#1222): the hypotenuse is named — or faces a STATED right angle; an open one is asked, never assumed.
    needs: ['A(4,0)', 'B(0,3)', 'C(0,0)', 'משולש ישר-זווית ABC'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'תיכון לצלע BC',
    en: 'the median to side BC',
    needs: ['A(1,6)', 'B(-3,0)', 'C(5,0)', 'משולש ABC'],
  },
  {
    category: 'derived',
    family: 'F16',
    he: 'OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה',
    en: 'OD and BE are the altitudes to sides BC and OC respectively',
    needs: ['O(0,0)', 'B(4,8)', 'C(10,0)'],
  },
  {
    category: 'derived',
    family: 'F16',
    featured: true,
    he: 'G מפגש האלכסונים במרובע ABCD',
    // The NOUN on both halves (#1080): the Hebrew says «במרובע», so the English must say which
    // shape too, or the two halves of one catalog row mean different things — the Hebrew draws a
    // quadrilateral and the English draws none.
    en: 'G is the intersection of the diagonals of quadrilateral ABCD',
    needs: ['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)'],
  },
  // The same point with NO letters (#1283): the shape is the one quadrilateral the figure holds,
  // resolved exactly as «האלכסונים נפגשים בנקודה O» is — and refused when there is none or several.
  {
    category: 'derived',
    family: 'F16',
    he: 'M מפגש האלכסונים',
    en: 'M is the intersection of the diagonals',
    needs: ['טרפז ABCD'],
  },
  /*
   * --- THE EXAM'S SENTENCE FRAME (#1618, the 471 4-point question) ---
   * Each row is a 471 corpus sentence as printed; the frame (`frameAnalytic.ts`) reads the wrapper
   * once, so every family below inherits it — these rows show that the wrapper exists, not a family.
   */
  { category: 'points', family: 'F1', he: 'נתון: K(1,2)', en: 'given: K(1,2)' },
  { category: 'points', family: 'F1', he: 'O ראשית הצירים', en: 'O is the origin' },
  {
    category: 'points',
    family: 'F1',
    he: 'הנקודות A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה',
    en: 'A and B are on the x-axis and the y-axis respectively',
    needs: ['נקודה A', 'נקודה B'],
  },
  /*
   * ONE FACT PER LINE is what the tool TEACHES (operator ruling on #1618, 2026-10-01: "we can still accept it
   * but the expectation is that these are separate lines"). The exam's bracketed form «טרפז ישר זווית ABCD
   * (AB ∥ CD, ∢D = 90°)» and two givens on one line («AB = 20, AC = 15») are ACCEPTED — the frame reads them
   * and the locks in issue-1618-sentence-frame.test.ts hold that — but no catalog row shows them.
   */
  {
    featured: true, category: 'shapes',
    family: 'F17',
    he: '∢C = 90°',
    en: '∠C = 90°',
    needs: ['טרפז ישר זווית ABCO'],
  },
  { featured: true, category: 'shapes', family: 'F17', he: 'המרובע ABCO הוא טרפז ישר זווית', en: 'ABCO is a right trapezoid' },
  {
    featured: true, category: 'shapes',
    family: 'F17',
    he: 'במלבן ABCD, הנקודה E נמצאת על הצלע DC',
    en: 'in rectangle ABCD, E is on side DC',
  },
  /*
   * --- DIAGONALS, EXTENSIONS, MIDSEGMENTS (#1620, ADR-AG-208) — 471 corpus sentences, each with 2-D's verdict ---
   */
  { category: 'points', family: 'F17', he: 'הנקודה E נמצאת על המשך הצלע BC', en: 'E is on the extension of side BC', needs: ['מרובע ABCD'] },
  { category: 'points', family: 'F17', he: 'הנקודה E נמצאת על צלע BC כך ש-AE = AC', en: 'E is on side BC such that AE = AC', needs: ['משולש ABC'] },
  { category: 'derived', family: 'F17', he: 'המשכי הצלעות AD ו-BC נפגשים בנקודה E', en: 'the extensions of sides AD and BC meet at E', needs: ['מרובע ABCD'] },
  { category: 'derived', family: 'F17', he: 'המשך AC חותך את מעגל O בנקודה E', en: 'the extension of AC cuts circle O at E', needs: ['מעגל O', 'משולש ABC'] },
  { category: 'derived', family: 'F17', he: 'האלכסונים AC ו-BD נפגשים בנקודה E', en: 'the diagonals AC and BD meet at E', needs: ['מרובע ABCD'] },
  { category: 'derived', family: 'F17', he: 'E היא נקודת החיתוך של אלכסוני הדלתון', en: 'E is the intersection of the diagonals of the kite', needs: ['דלתון ABCD'] },
  { category: 'lines', family: 'F17', he: 'האלכסון AC במרובע ABCD', en: 'diagonal AC of quadrilateral ABCD' },
  { category: 'derived', family: 'F17', he: 'קטע האמצעים לצלע BC במשולש ABC', en: 'midsegment to BC in triangle ABC' },
  { category: 'derived', family: 'F17', he: 'קטע האמצעים בטרפז ABCD', en: 'midsegment of trapezoid ABCD' },
  { category: 'points', family: 'F17', he: 'שכל קודקודיו מונחים על הצירים', en: 'all the vertices of the trapezoid lie on the axes', needs: ['טרפז ABCD'] },
  /*
   * --- 2-D PARITY: LENGTHS, ANGLES, CROSSINGS, CONGRUENCE (#1622 E2, ADR-AG-218) — each 2-D's catalog sentence, at its verdict ---
   */
  { category: 'relations', family: 'F17', he: '△ABC ≅ △DEF', en: '△ABC ≅ △DEF' },
  { category: 'relations', family: 'F17', he: 'משולש ABC חופף למשולש DEF', en: 'triangle ABC is congruent to triangle DEF' },
  { category: 'relations', family: 'F17', he: '△ABC ~ △DEF', en: '△ABC ~ △DEF' },
  { category: 'relations', family: 'F17', he: 'המשולשים ABC ו-DEF דומים', en: 'triangles ABC and DEF are similar' },
  { category: 'relations', family: 'F17', he: 'AB·AC = AD²', en: 'AB·AC = AD²', needs: ['משולש ABC', 'D על BC'] },
  { category: 'relations', family: 'F17', he: 'AB = 3x', en: 'AB = 3x', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'AB = AC = 3x', en: 'AB = AC = 3x', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'AD = 12√x', en: 'AD = 12√x' },
  { category: 'relations', family: 'F17', he: 'המרחק בין AB לבין CD הוא 3', en: 'the distance between AB and CD = 3', needs: ['טרפז ABCD'] },
  { category: 'lines', family: 'F17', he: 'CD חוצה את AB', en: 'CD bisects AB' },
  { category: 'lines', family: 'F17', he: 'CD חותך את AB', en: 'CD cuts AB' },
  { category: 'lines', family: 'F17', he: 'AC ו-BD נחתכים', en: 'AC and BD intersect', needs: ['מרובע ABCD'] },
  { category: 'relations', family: 'F17', he: 'הזווית בין BD ל-BA היא 30', en: 'the angle between BD and BA is 30', needs: ['מרובע ABCD'] },
  { category: 'relations', family: 'F17', he: 'זווית ABC שווה לשלושים מעלות', en: 'angle ABC equals thirty degrees' },
  { category: 'relations', family: 'F17', he: 'זוית AEB שווה לזווית BEC שווה 60 מעלות', en: 'angle AEB equals angle BEC equals 60 degrees' },
  { category: 'relations', family: 'F17', he: 'A = 40', en: 'A = 40', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'נסמן את שטח ABCD ב-S', en: 'denote the area of ABCD by S', needs: ['מרובע ABCD'] },
  /*
   * --- CIRCLES AND TANGENTS 2-D READS (#1622 slice E3, #1693, ADR-AG-219) — each with 2-D's measured verdict ---
   */
  { category: 'circles', family: 'F5', he: 'מעגל סביב O רדיוס 5', en: 'circle centered at O radius 5' },
  { category: 'circles', family: 'F5', he: 'מעגל עם מרכז O', en: 'circle with center O' },
  { category: 'circles', family: 'F5', he: 'נתון מעגל', en: 'given a circle' },
  { category: 'circles', family: 'F5', he: 'מרכז המעגל', en: 'the centre of the circle' },
  { category: 'circles', family: 'F5', he: 'מעגל בקוטר 10', en: 'a circle with diameter 10' },
  { category: 'circles', family: 'F5', he: 'מעגל O שהיקפו 6π', en: 'circle O with circumference 6π' },
  { category: 'circles', family: 'F5', he: 'מעגל O ששטחו 9π', en: 'circle O with area 9π' },
  { category: 'circles', family: 'F5', he: 'מעגל O שרדיוסו R', en: 'circle O with radius R' },
  { category: 'circles', family: 'F5', he: 'R > r', en: 'R > r', needs: ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r'] },
  { category: 'circles', family: 'F5', he: 'שני מעגלים', en: 'two circles' },
  { category: 'circles', family: 'F5', he: 'שני מעגלים זרים', en: 'two disjoint circles' },
  { category: 'circles', family: 'F5', he: 'שני מעגלים מוכלים', en: 'two nested circles' },
  { category: 'circles', family: 'F5', he: 'שני מעגלים בעלי מרכז משותף O', en: 'two circles with a common center O' },
  { category: 'circles', family: 'F5', he: 'שני מעגלים נחתכים בנקודות A ו-B', en: 'two circles intersect at A and B' },
  { category: 'circles', family: 'F5', he: 'מעגל P מוכל בתוך מעגל O', en: 'circle P is contained in circle O' },
  { category: 'circles', family: 'F5', he: 'מעגל מוכל בתוך המעגל הגדול', en: 'a circle contained inside the big circle' },
  { category: 'circles', family: 'F5', he: 'ישר החותך את המעגל בשתי נקודות', en: 'a line cutting the circle at two points' },
  { category: 'circles', family: 'F5', he: 'ישר חותך את שני המעגלים בנקודות C, D, E ו-F', en: 'a line cuts the two circles at points C, D, E and F' },
  { category: 'circles', family: 'F5', he: 'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B', en: 'from a point E outside circle O a line cuts the circle at A and B' },
  { category: 'circles', family: 'F5', he: 'הישר AC פוגש את מעגל P בנקודה E', en: 'line AC meets circle P at E', needs: ['משולש ישר-זווית ABC'] },
  { category: 'circles', family: 'F5', he: 'משיק למעגל', en: 'a tangent to the circle' },
  { category: 'circles', family: 'F5', he: 'מנקודה E משיק נוגע במעגל O בנקודה D', en: 'from point E a tangent touches circle O at D' },
  { category: 'circles', family: 'F5', he: 'מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B', en: 'from point E outside circle O two tangents touch the circle at A and B' },
  { category: 'circles', family: 'F5', he: 'AB משיק משותף למעגלים O ו-P', en: 'AB is a common tangent to circles O and P' },
  { category: 'circles', family: 'F5', he: 'AB משיק משותף חיצוני לשני המעגלים', en: 'AB is an external common tangent of the two circles' },
  { category: 'circles', family: 'F5', he: 'CD משיק משותף למעגלים O ו-P בנקודה M', en: 'CD is a common tangent to circles O and P at M' },
  { category: 'circles', family: 'F5', he: 'מנקודה A יוצאים שני משיקים לשני המעגלים', en: 'from point A two tangents to the two circles' },
  { category: 'circles', family: 'F5', he: 'AB מיתר במעגל O ומשיק למעגל P', en: 'AB is a chord of circle O and tangent to circle P', needs: ['מעגל O', 'מעגל P'] },
  /*
   * --- AN ORDER between measures, a bound, an angle's acuteness (#1621 D3, ADR-AG-216) — regions, as 2-D reads them ---
   */
  { category: 'relations', family: 'F17', he: 'AB < BC', en: 'AB < BC', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'AB קטן מ-BC', en: 'AB is shorter than BC', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'DC > AB', en: 'DC > AB', needs: ['מרובע ABCD'] },
  { category: 'relations', family: 'F17', he: 'AB ≤ 10', en: 'AB ≤ 10', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: '∢ABC ≤ 40°', en: '∠ABC ≤ 40°', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: '∢ABC < ∢BAC', en: '∠ABC < ∠BAC', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: 'זווית ABC קהה', en: 'angle ABC is obtuse', needs: ['משולש ABC'] },
  // #1622 slice E1 (ADR-AG-217) — the shapes and points 2-D reads, as the corpus and 2-D's guide write them
  { category: 'shapes', family: 'F17', he: 'ABCD', en: 'ABCD' },
  { category: 'shapes', family: 'F17', he: 'ריבוע ABCD שצלעו הוא 1', en: 'square ABCD whose side is 1' },
  { category: 'shapes', family: 'F17', he: 'ריבוע שצלעו 4', en: 'a square whose side is 4' },
  { category: 'shapes', family: 'F17', he: 'מלבן במידות 4*6', en: 'rectangle 4 by 6' },
  { category: 'shapes', family: 'F17', he: 'מחומש ABCDE', en: 'pentagon ABCDE' },
  { category: 'shapes', family: 'F17', he: 'מחומש משוכלל ABCDE', en: 'regular pentagon ABCDE' },
  { category: 'shapes', family: 'F17', he: 'מעוין BDEF חסום במשולש ABC', en: 'rhombus BDEF inscribed in triangle ABC' },
  { category: 'points', family: 'F17', he: 'נקודה E על AC ב-40%', en: 'E on AC at 40%' },
  { category: 'points', family: 'F17', he: 'C במרחק 5 מ-A ו-5 מ-B', en: 'C is 5 from A and 5 from B', needs: ['משולש ABC'] },
  { category: 'points', family: 'F17', he: 'D על AB במרחק 3 מ-A', en: 'D on AB at a distance of 3 from A', needs: ['משולש ABC'] },
  { category: 'derived', family: 'F17', he: 'אמצע AB', en: 'midpoint of AB', needs: ['משולש ABC'] },
  { category: 'points', family: 'F17', he: 'הנקודה E נמצאת בתוך המשולש KAO', en: 'point E inside triangle KAO' },
  { category: 'points', family: 'F17', he: 'C ו-D בצדדים שונים של AB', en: 'C and D are on different sides of AB' },
  { category: 'lines', family: 'F17', he: 'קו ועליו נקודה A', en: 'a line with point A on it' },
  { category: 'lines', family: 'F17', he: 'ישר ABE', en: 'line ABE', needs: ['משולש ABC'] },
  { category: 'relations', family: 'F17', he: '5 < AB < 9', en: '5 < AB < 9' },
];
