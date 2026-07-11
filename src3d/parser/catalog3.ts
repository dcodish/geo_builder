/**
 * The 3-D tool's command catalog (V5, ADR-3D-008) — the user-facing reference AND
 * the coverage map (the 2-D `catalog.ts` pattern): every entry is a canonical He/En
 * example the deterministic parser MUST accept (a guard test re-parses all of them),
 * it drives the in-app commands panel, and it is the vocabulary the LLM fallback is
 * allowed to emit.
 */

export interface CatalogEntry3 {
  category: string;
  he: string;
  en: string;
}

export const COMMAND_CATALOG_3D: CatalogEntry3[] = [
  // --- solids ---
  { category: 'solids', he: 'קובייה ABCD', en: 'cube ABCD' },
  { category: 'solids', he: "תיבה ABCDA'B'C'D'", en: "box ABCDA'B'C'D'" },
  { category: 'solids', he: 'מנסרה ישרה משולשת ABC', en: 'right triangular prism ABC' },
  { category: 'solids', he: 'מנסרה ישרה שבסיסה משולש שווה צלעות', en: 'right prism with an equilateral triangle base' },
  { category: 'solids', he: 'פירמידה ישרה שבסיסה משולש שווה צלעות', en: 'right pyramid with an equilateral triangle base' },
  { category: 'solids', he: 'פירמידה SABCD שבסיסה מקבילית', en: 'pyramid SABCD with a parallelogram base' },
  { category: 'solids', he: 'פירמידה ישרה ABCDS שבסיסה ריבוע', en: 'right pyramid ABCDS with a square base' },
  { category: 'solids', he: 'פירמידה ABCDS שבסיסה ריבוע', en: 'pyramid ABCDS with a square base' },
  { category: 'solids', he: 'פירמידה SABCD שבסיסה ריבוע', en: 'pyramid SABCD with a square base' },
  { category: 'solids', he: 'טטראדר ABCD', en: 'tetrahedron ABCD' },
  { category: 'vectors', he: '|EN| = (√6/4)·|w|', en: '|EN| = (√6/4)·|w|' },
  { category: 'vectors', he: 'אורך AS שווה לאורך AB', en: '|AS| = |AB|' },
  { category: 'vectors', he: 'וקטור SE = 3/4 וקטור SD', en: 'vector SE = 3/4 vector SD' },
  { category: 'vectors', he: 'k = 1/2', en: 'k = 1/2' },
  { category: 'points', he: 'הקודקוד D נמצא על החלק החיובי של ציר ה-x', en: 'D is on the positive x-axis' },
  { category: 'claims', he: 'נפח הפירמידה SENB שווה לנפח הפירמידה CENB', en: 'volume of pyramid SENB equals volume of pyramid CENB' },
  { category: 'solids', he: 'חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12', en: 'cone with apex S base center O radius 5 height 12' },
  { category: 'solids', he: 'גליל שמרכז בסיסו O, רדיוסו 3 וגובהו 7', en: 'cylinder with base center O radius 3 height 7' },
  { category: 'solids', he: 'כדור שמרכזו O ורדיוסו 3', en: 'sphere with center O radius 3' },
  // --- points ---
  { category: 'points', he: "M אמצע BB'", en: "M is the midpoint of BB'" },
  { category: 'points', he: "K על AA' כך ש-AK = 2KA'", en: "K on AA' such that AK = 2KA'" },
  { category: 'points', he: 'E על AC כך ש-AE:EC = 2:1', en: 'E on AC such that AE:EC = 2:1' },
  { category: 'points', he: "E מפגש התיכונים של משולש BC'D", en: "E is the centroid of triangle BC'D" },
  { category: 'points', he: 'O מפגש האלכסונים של הפאה ABCD', en: 'O is the intersection of the diagonals of face ABCD' },
  { category: 'points', he: 'A(2,-2,6)', en: 'A(2,-2,6)' },
  {
    // ADR-3D-032: one symbolic coordinate = the figure parameter (a later given pins it)
    category: 'points',
    he: 'נתונה נקודה M(k,1,3), k הוא פרמטר חיובי',
    en: 'point M(k,1,3), k is a positive parameter',
  },
  { category: 'points', he: 'P על AM כך ש-KP = αu + βv', en: 'P on AM such that KP = αu + βv' },
  // --- vectors ---
  { category: 'vectors', he: "נסמן: AB = u, AD = v, AA' = w", en: "denote AB = u, AD = v, AA' = w" },
  { category: 'vectors', he: 'נתון: v = (10,-5,0), u = (5,5,-5)', en: 'given: v = (10,-5,0), u = (5,5,-5)' },
  // --- planes & lines ---
  { category: 'planesLines', he: 'המישור π1: z - 3 = 0', en: 'plane π1: z - 3 = 0' },
  { category: 'planesLines', he: 'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', en: 'line ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)' },
  {
    // ADR-3D-031: a pair-named parametric line also puts A,B ON the line (riders / verified givens)
    category: 'planesLines',
    he: 'הצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)',
    en: 'a parametric representation of line AB is x = (0,7,6) + t(0,2,1)',
  },
  { category: 'planesLines', he: 'הזווית בין המישורים π1 ו-π2 היא 45', en: 'the angle between planes π1 and π2 is 45' },
  { category: 'planesLines', he: 'הישר ℓ ניצב למישור π1', en: 'line ℓ is perpendicular to plane π1' },
  { category: 'planesLines', he: 'מ-A מורידים אנך למישור π1 החותך אותו בנקודה B', en: 'from A drop a perpendicular to plane π1, it cuts it at B' },
  { category: 'planesLines', he: 'מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C', en: 'from B drop a perpendicular to line ℓ, it cuts it at C' },
  { category: 'planesLines', he: 'ℓ ישר החיתוך בין המישורים π1 ו-π2', en: 'ℓ is the intersection line of π1 and π2' },
  { category: 'planesLines', he: "ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'", en: "ℓ is the intersection line of plane BC'D and plane BCC'B'" },
  { category: 'planesLines', he: "המישור BC'D", en: "plane BC'D" },
  { category: 'planesLines', he: 'מישור π דרך F וניצב ל-SC', en: 'plane π through F perpendicular to SC' },
  { category: 'planesLines', he: 'מישור π דרך K ו-P ומקביל ל-CD', en: 'plane π through K and P parallel to CD' },
  { category: 'planesLines', he: 'המישור π חותך את SA בנקודה E', en: 'plane π cuts SA at E' },
  { category: 'planesLines', he: 'AF גובה הפירמידה לפאה BDC', en: 'AF is the height of the pyramid to face BDC' },
  { category: 'planesLines', he: 'E על המישור ABC', en: 'E is on plane ABC' },
  { category: 'planesLines', he: 'E מעל המישור ABC', en: 'E is above plane ABC' },
  { category: 'planesLines', he: 'E מתחת למישור ABC', en: 'E is below plane ABC' },
  { category: 'planesLines', he: 'ℓ חותך את π1 בנקודה A', en: 'ℓ cuts plane π1 at A' },
  { category: 'planesLines', he: "הישר A'C חותך את המישור BC'D בנקודה K", en: "line A'C cuts plane BC'D at K" },
  { category: 'planesLines', he: 'A נמצאת על אחד המישורים', en: 'A is on one of the planes' },
  { category: 'planesLines', he: 'B על הישר ℓ', en: 'B is on line ℓ' },
  // #69 (ADR-3D-038): digit-indexed line names ℓ1/ℓ2 — several parametric lines coexist
  { category: 'planesLines', he: 'הישר ℓ1: x = (0,0,0) + t(1,0,0)', en: 'line ℓ1: x = (0,0,0) + t(1,0,0)' },
  { category: 'planesLines', he: 'הישר d מאונך לישר ℓ1 ולישר ℓ2', en: 'd is the common perpendicular of ℓ1 and ℓ2' },
  { category: 'planesLines', he: "שיעור ה-z של C' חיובי", en: "the z-coordinate of C' is positive" },
  // --- claims (the student's answers, verified) ---
  { category: 'claims', he: 'AM = 1/2u + 1/2v + 5/3w', en: 'AM = 1/2u + 1/2v + 5/3w' },
  { category: 'claims', he: "CA' מאונך למישור BC'D", en: "CA' is perpendicular to plane BC'D" },
  { category: 'claims', he: 'SM מאונך ל-DB', en: 'SM is perpendicular to DB' },
  { category: 'claims', he: 'u ⊥ v', en: 'u ⊥ v' },
  { category: 'claims', he: "E, C, A' על ישר אחד", en: "E, C, A' are collinear" },
  { category: 'claims', he: 'AB = 3', en: 'AB = 3' },
  { category: 'claims', he: 'שטח המשולש ABC = 4.5', en: 'the area of triangle ABC = 4.5' },
  { category: 'claims', he: 'A = (2, 0, -10)', en: 'A = (2, 0, -10)' },
  { category: 'claims', he: 'המישור KBC: x + 2y + 3z - 26 = 0', en: 'plane KBC: x + 2y + 3z - 26 = 0' },
  { category: 'claims', he: "הזווית בין A'C לבין BC' היא 90", en: "the angle between A'C and BC' is 90" },
  { category: 'claims', he: "A'K : A'C = 2 : 3", en: "A'K : A'C = 2 : 3" },
  { category: 'claims', he: 'ℓ אינו מקביל ל-π1 לכל m', en: 'ℓ is not parallel to plane π1 for every m' },
  { category: 'claims', he: 'נפח החרוט = 100π', en: 'the volume of the cone = 100π' },
  { category: 'claims', he: 'שטח המעטפת של החרוט = 65π', en: 'the lateral area of the cone = 65π' },
  // --- V7: vector relations & exam terminology ---
  { category: 'points', he: "A'K = 4/5 DN", en: "A'K = 4/5 DN" },
  { category: 'points', he: "DF = (k/2)DB + kDC'", en: "DF = (k/2)DB + kDC'" },
  { category: 'points', he: 'EF מקביל למישור ABC', en: 'EF is parallel to plane ABC' },
  { category: 'points', he: 'ABEC מלבן', en: 'ABEC is a rectangle' },
  { category: 'points', he: 'D בראשית הצירים', en: 'D is at the origin' },
  { category: 'points', he: 'A על ציר ה-x החיובי', en: 'A is on the positive x-axis' },
  { category: 'claims', he: '∠BAC = 90', en: '∠BAC = 90' },
  { category: 'claims', he: 'NK ו-PL מצטלבים', en: 'NK and PL are skew' },
  // --- V8-f: vector-relation givens ---
  { category: 'vectors', he: 'קוסינוס הזווית בין הוקטורים u ו-w הוא √35/10', en: 'the cosine of the angle between u and w is √35/10' },
  { category: 'vectors', he: 'קוסינוס הזווית ACB = 3/4', en: 'cos∠ACB = 3/4' },
  { category: 'vectors', he: 'u·v = v·w = u·w', en: 'u·v = v·w = u·w' },
  { category: 'vectors', he: 'AE יוצר זוויות שוות עם AB ו-AD', en: 'AE makes equal angles with AB and AD' },
  { category: 'points', he: 'D על AC כך ש-OD חוצה-זווית AOC', en: 'D on AC such that OD bisects angle AOC' },
  // --- V8-g: the 2-D vector lane (flat polygons in the plane) ---
  { category: 'solids', he: 'משולש ABC', en: 'triangle ABC' },
  { category: 'solids', he: 'מרובע MKNL', en: 'quadrilateral MKNL' },
  { category: 'solids', he: 'מחומש ABCDE', en: 'pentagon ABCDE' },
  { category: 'points', he: 'גובה המשולש לצלע AB הוא CD', en: 'CD is the altitude to AB' },
  // --- triage 3-D (ADR-3D-026): prod-log gaps ---
  { category: 'solids', he: 'כדור', en: 'sphere' },
  { category: 'solids', he: 'ABCD ארבעון', en: 'tetrahedron ABCD' },
  { category: 'points', he: 'CD תיכון במשולש ABC', en: 'CD is the median in triangle ABC' },
  { category: 'points', he: 'DE גובה בטטראדר', en: 'DE is the altitude in the tetrahedron' },
  { category: 'planesLines', he: 'המישור x-y+z=1', en: 'plane x-y+z=1' },
  { category: 'claims', he: "הזווית בין הישר AC' לבין המישור ABCD היא 30", en: "the angle between line AC' and plane ABCD is 30" },
  { category: 'planesLines', he: 'הישר d מאונך לישר AB ולישר CD', en: 'd is the common perpendicular of AB and CD' },
  { category: 'planesLines', he: 'BE היטל הישר TB על המישור ABCD', en: 'BE is the projection of line TB onto plane ABCD' },
  { category: 'solids', he: 'מעגל A משיק לישר BC בנקודה F', en: 'circle A tangent to line BC at F' },
  { category: 'points', he: 'D על המעגל', en: 'D is on the circle' },
  { category: 'points', he: 'T על הקטע SC כך ש-TABCD היא פירמידה ישרה', en: 'T on SC such that TABCD is a right pyramid' },
  // --- drawing ---
  { category: 'drawing', he: "קטע CA'", en: "segment CA'" },
  // #72 (ADR-3D-039): the baseline log-triage phrasing batch
  { category: 'drawing', he: "נחבר את D'F", en: "connect D'F" },
  { category: 'drawing', he: "אלכסון BD'", en: "the diagonal BD'" },
  { category: 'drawing', he: "חץ A'C", en: "arrow A'C" },
  { category: 'drawing', he: 'אורך AB=BC', en: 'length AB = BC' },
  { category: 'drawing', he: 'אנך יורד מ-M לבסיס', en: 'drop a perpendicular from M to the base' },
];
