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
  { category: 'points', family: 'F1', he: 'נתונה הנקודה A(2,6)', en: 'point A(2,6)' },
  { category: 'points', family: 'F1', he: 'נתונות הנקודות A(0,24), B(18,0)', en: 'points A(0,24), B(18,0)' },
  { category: 'points', family: 'F1', he: 'A(-9a,0)', en: 'A(-9a,0)' },
  /**
   * A point NAMED without being PLACED (#1136) — two degrees of freedom, its own.
   *
   * The sentence the locus lane stands on: «המקום הגיאומטרי של M» asks about a point that must exist
   * before any property can be stated about it. Until this, the only route to a 2-DOF point was to
   * smuggle it in as a polygon vertex («משולש ABM»), which asserts a triangle the student never
   * mentioned — ADR-052's cardinal sin through the front door.
   */
  { category: 'points', family: 'F1', he: 'נקודה M', en: 'point M' },

  // --- F3 · lines by equation ---
  { category: 'lines', family: 'F3', he: 'נתון הישר l1: 4y-3x-20=0', en: 'line l1: 4y-3x-20=0' },
  { category: 'lines', family: 'F3', he: 'משוואת הישר AC היא y=-2x+8', en: 'the line AC is y=-2x+8' },
  { category: 'lines', family: 'F3', he: 'הישר x=-4', en: 'the line x=-4' },
  { category: 'lines', family: 'F3', he: 'הישר y=x', en: 'the line y=x' },

  // The noun is OPTIONAL for an equation (02c R6, #1037) — the fit names the family, and the
  // corpus writes figures this way: image 6 gives a triangle as `4x+3y=0`, `12x-5y=0`, `x=15`.
  // Language-neutral by construction, so the He and En halves are the same string.
  { category: 'lines', family: 'F3', he: 'x-y+2=0', en: 'x-y+2=0' },
  { category: 'lines', family: 'F3', he: '4x+3y=0', en: '4x+3y=0' },

  // A line CONSTRUCTED through a point, copying a direction (#1093, ADR-AG-057). Not an equation
  // given but a construction: the line does not exist until the sentence creates it.
  { category: 'lines', family: 'F3', he: 'דרך P עובר ישר מקביל לציר ה-x', en: 'a line through P is parallel to the x-axis' },
  { category: 'lines', family: 'F3', he: 'דרך P עובר ישר מאונך לציר ה-x', en: 'a line through P is perpendicular to the x-axis' },

  // --- F5 · circles by equation ---
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
    en: 'circle I: (x-3)^2+(y-4)^2=9',
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1',
    en: 'circle II: (x+5)^2+(y-2)^2=1',
  },
  { category: 'circles', family: 'F5', he: 'משוואת המעגל x^2+y^2-2ax-2x=0', en: 'the circle x^2+y^2-2ax-2x=0' },

  // --- F6 · conics by equation (canonical only — D6/§2a) ---
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה קנונית שמשוואתה y^2=54x', en: 'canonical parabola y^2=54x' },
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

  { category: 'circles', family: 'F5', he: '(x-3)^2+(y-4)^2=9', en: '(x-3)^2+(y-4)^2=9' },
  { category: 'conics', family: 'F6', he: 'y^2=54x', en: 'y^2=54x' },
  { category: 'conics', family: 'F6', he: 'x^2/9+y^2/16=1', en: 'x^2/9+y^2/16=1' },

  // --- F17 · segments and NEUTRAL shape nouns (02c §8) ---
  // Only the nouns that carry no constraint of their own. «מקבילית» / «טרפז» / «ריבוע» each carry a
  // given this slice cannot honour, so they are refused by name rather than taught here.
  { category: 'shapes', family: 'F17', he: 'הקטע AB', en: 'segment AB', needs: ['A(0,0)', 'B(4,3)'] },
  {
    category: 'shapes',
    family: 'F17',
    he: 'משולש ABC',
    en: 'triangle ABC',
    needs: ['A(1,3)', 'B(-4,1)', 'C(-3,8)'],
  },
  {
    category: 'shapes',
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
    he: 'AB ∥ DC',
    en: 'AB ∥ DC',
    needs: ['מרובע ABCD'],
  },
  {
    category: 'relations',
    family: 'F18',
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
    he: 'שיפוע AB הוא 2',
    en: 'the slope of AB is 2',
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
    he: 'x_A = 5',
    en: 'x_A = 5',
  },
  {
    category: 'points',
    family: 'F1',
    he: 'x של A הוא 5',
    en: 'the x-coordinate of A is 5',
  },
  {
    category: 'points',
    family: 'F1',
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

  /** Naming a circle's CENTRE (#1109) — the same click-to-name family as a crossing. */
  {
    category: 'derived',
    family: 'F16',
    he: 'O מרכז המעגל I',
    en: 'O is the centre of circle I',
    needs: ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'],
  },

  // --- F16 · derived points over stated vertices (02c §8) ---
  {
    category: 'derived',
    family: 'F16',
    he: 'M אמצע AB',
    en: 'M is the midpoint of AB',
    needs: ['A(8,1)', 'B(-2,-5)'],
  },
  {
    category: 'derived',
    family: 'F16',
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
  {
    category: 'derived',
    family: 'F16',
    he: 'G מפגש האלכסונים במרובע ABCD',
    // The NOUN on both halves (#1080): the Hebrew says «במרובע», so the English must say which
    // shape too, or the two halves of one catalog row mean different things — the Hebrew draws a
    // quadrilateral and the English draws none.
    en: 'G is the intersection of the diagonals of quadrilateral ABCD',
    needs: ['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)'],
  },
];
