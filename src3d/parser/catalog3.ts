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
  { category: 'solids', he: 'מנסרה ישרה שבסיסה מקבילית', en: 'right prism with a parallelogram base' },
  { category: 'solids', he: 'מנסרה ישרה שבסיסה ריבוע', en: 'right prism with a square base' },
  { category: 'solids', he: 'מנסרה ישרה שבסיסה מרובע', en: 'right prism with a quadrilateral base' },
  { category: 'solids', he: 'מנסרה ישרה שבסיסה מחומש', en: 'right prism with a pentagon base' },
  { category: 'solids', he: 'מקבילון ABCDEFGH', en: 'parallelepiped ABCDEFGH' },
  { category: 'solids', he: 'מנסרה שבסיסה מקבילית', en: 'prism with a parallelogram base' }, // #295: bare (no ישרה) ⇒ oblique מקבילון
  // #321 (ADR-3D-078): the whole parallelogram FAMILY builds oblique — מקבילון + the base's constraints
  { category: 'solids', he: 'מנסרה שבסיסה מעוין', en: 'prism with a rhombus base' },
  { category: 'solids', he: 'מנסרה שבסיסה מלבן', en: 'prism with a rectangle base' },
  { category: 'solids', he: 'מנסרה שבסיסה ריבוע', en: 'prism with a square base' },
  // #349 (ADR-3D-089): obliqueness is a MODIFIER of any prism kind, so the triangle / general-quad bases
  // build oblique too — the tilt is a free DOF and «המנסרה ישרה» pins it upright.
  { category: 'solids', he: 'מנסרה משולשת ABC', en: 'triangular prism ABC' },
  // #392 (ADR-3D-143): no base noun — the primed-mirror label run itself derives the arity (oblique).
  { category: 'solids', he: "מנסרה ABCA'B'C'", en: "prism ABCA'B'C'" },
  { category: 'solids', he: 'מנסרה שבסיסה משולש', en: 'prism with a triangle base' },
  { category: 'solids', he: 'מנסרה שבסיסה מרובע', en: 'prism with a quadrilateral base' },
  { category: 'solids', he: 'המנסרה ישרה', en: 'the prism is right' }, // #289 (M1): make the existing prism a right prism
  { category: 'solids', he: 'פירמידה ישרה שבסיסה משולש שווה צלעות', en: 'right pyramid with an equilateral triangle base' },
  { category: 'solids', he: 'פירמידה SABCD שבסיסה מקבילית', en: 'pyramid SABCD with a parallelogram base' },
  { category: 'solids', he: 'פירמידה ישרה ABCDS שבסיסה ריבוע', en: 'right pyramid ABCDS with a square base' },
  { category: 'solids', he: 'פירמידה ABCDS שבסיסה ריבוע', en: 'pyramid ABCDS with a square base' },
  { category: 'solids', he: 'פירמידה SABCD שבסיסה ריבוע', en: 'pyramid SABCD with a square base' },
  { category: 'solids', he: 'פירמידה שבסיסה מעוין', en: 'pyramid with a rhombus base' }, // #304: a rhombus base + |AB|=|AD|
  // #305/#341/#358 (ADR-3D-090): rightness is a MODIFIER of any base — a base that is not cyclic is
  // constrained into the cyclic member of its own family (with a build notice) instead of refusing.
  { category: 'solids', he: 'פירמידה שבסיסה דלתון', en: 'pyramid with a kite base' },
  { category: 'solids', he: 'פירמידה שבסיסה טרפז', en: 'pyramid with a trapezoid base' },
  { category: 'solids', he: 'פירמידה שבסיסה מרובע', en: 'pyramid with a quadrilateral base' },
  { category: 'solids', he: 'פירמידה ישרה SABCD שבסיסה מעוין', en: 'right pyramid SABCD with a rhombus base' },
  { category: 'solids', he: 'פירמידה ישרה SABCD שבסיסה מקבילית', en: 'right pyramid SABCD with a parallelogram base' },
  { category: 'solids', he: 'טטראדר ABCD', en: 'tetrahedron ABCD' },
  { category: 'vectors', he: '|EN| = (√6/4)·|w|', en: '|EN| = (√6/4)·|w|' },
  { category: 'vectors', he: 'אורך AS שווה לאורך AB', en: '|AS| = |AB|' },
  // #393/#335 (ADR-3D-107): chained + expression magnitudes
  { category: 'vectors', he: '|u|=|v|=1', en: '|u|=|v|=1' },
  { category: 'vectors', he: '|u|=|v|=|w|', en: '|u|=|v|=|w|' },
  { category: 'vectors', he: '|w+u| = |w-u|', en: '|w+u| = |w-u|' },
  { category: 'vectors', he: '|2w+3v| = |3v-2w|', en: '|2w+3v| = |3v-2w|' },
  { category: 'vectors', he: 'וקטור SE = 3/4 וקטור SD', en: 'vector SE = 3/4 vector SD' },
  { category: 'vectors', he: 'k = 1/2', en: 'k = 1/2' },
  { category: 'points', he: 'הקודקוד D נמצא על החלק החיובי של ציר ה-x', en: 'D is on the positive x-axis' },
  // #510: a coordinate takes the same VALUE literals as a stated magnitude — √, fractions, the palette's ½
  { category: 'points', he: 'C(√2,1,0)', en: 'C(√2,1,0)' },
  { category: 'claims', he: 'נפח הפירמידה SENB שווה לנפח הפירמידה CENB', en: 'volume of pyramid SENB equals volume of pyramid CENB' },
  // #765/#766 (ADR-3D-169): a solid's stated VOLUME. The subject is the definite noun and/or the letter
  // run, resolved against the DECLARED figure — the base run of a pyramid names the pyramid, and on a
  // figure with exactly one, the letters can be left off entirely.
  { category: 'claims', he: 'נפח הפירמידה ABCDS = 11', en: 'the volume of the pyramid ABCDS = 11' },
  { category: 'claims', he: 'נפח הפירמידה שווה ל 11', en: 'the volume of the pyramid is 11' },
  { category: 'claims', he: '∠SAB = ∠SAD', en: '∠SAB = ∠SAD' }, // #271: a general angle equality (drives a free-dim solid / verifies a determined one)
  // #337: the SAME relation in the corpus's between-form wording (vector / line / segment nouns all accepted)
  { category: 'claims', he: 'הזווית שבין AB לבין AC שווה לזווית שבין AB לבין AD', en: 'the angle between AB and AC = the angle between AB and AD' },
  { category: 'solids', he: 'חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12', en: 'cone with apex S base center O radius 5 height 12' },
  { category: 'solids', he: 'גליל שמרכז בסיסו O, רדיוסו 3 וגובהו 7', en: 'cylinder with base center O radius 3 height 7' },
  { category: 'solids', he: 'כדור שמרכזו O ורדיוסו 3', en: 'sphere with center O radius 3' },
  // --- points ---
  { category: 'points', he: "M אמצע BB'", en: "M is the midpoint of BB'" },
  { category: 'points', he: "אמצע BB'", en: "midpoint of BB'" },
  { category: 'claims', he: 'זווית O ישרה', en: 'angle at O is right' },
  { category: 'points', he: "K על AA' כך ש-AK = 2KA'", en: "K on AA' such that AK = 2KA'" },
  { category: 'points', he: 'E על AC כך ש-AE:EC = 2:1', en: 'E on AC such that AE:EC = 2:1' },
  // #748 (ADR-3D-159): the same ratio as its OWN fact — the rider is already on the segment
  { category: 'points', he: "AE = 2EA'", en: "AE = 2EA'" },
  { category: 'points', he: "E מפגש התיכונים של משולש BC'D", en: "E is the centroid of triangle BC'D" },
  { category: 'points', he: 'O מפגש האלכסונים של הפאה ABCD', en: 'O is the intersection of the diagonals of face ABCD' },
  // #834: the point-free arm — DRAW the base's diagonals without naming a crossing (2 prod users)
  { category: 'points', he: 'אלכסוני הבסיס', en: 'diagonals of the base' },
  { category: 'points', he: 'A(2,-2,6)', en: 'A(2,-2,6)' },
  {
    // ADR-3D-032: one symbolic coordinate = the figure parameter (a later given pins it)
    category: 'points',
    he: 'נתונה נקודה M(k,1,3), k הוא פרמטר חיובי',
    en: 'point M(k,1,3), k is a positive parameter',
  },
  { category: 'points', he: 'P על AM כך ש-KP = αu + βv', en: 'P on AM such that KP = αu + βv' },
  {
    // #325 (ADR-3D-079): affine symbolic coordinates — the symbols stay OPEN (free) until data pins them
    category: 'points',
    he: 'נתונות הנקודות: A(1, 4, -3), B(2t, t, k)',
    en: 'given the points: A(1, 4, -3), B(2t, t, k)',
  },
  { category: 'points', he: 't פרמטר חיובי', en: 't is a positive parameter' },
  { category: 'points', he: 't > 0', en: 't > 0' },
  // #324 (ADR-3D-079): a ring's relation to a COORDINATE plane (lowercase x/y/z) or axis
  { category: 'planesLines', he: 'הבסיס ABCD מונח על מישור שמקביל למישור [xy]', en: 'base ABCD lies on a plane parallel to the xy-plane' },
  { category: 'planesLines', he: 'המישור ABC מונח על המישור [xy]', en: 'plane ABC lies on the xy-plane' },
  { category: 'planesLines', he: 'המישור ABC מאונך למישור [xz]', en: 'plane ABC is perpendicular to the xz-plane' },
  { category: 'planesLines', he: 'המישור ABC מקביל לציר ה-z', en: 'plane ABC is parallel to the z-axis' },
  { category: 'planesLines', he: 'הבסיס מונח במישור המקביל למישור ה-xy', en: 'the base lies in a plane parallel to the xy-plane' },
  // --- vectors ---
  { category: 'vectors', he: "נסמן: AB = u, AD = v, AA' = w", en: "denote AB = u, AD = v, AA' = w" },
  { category: 'vectors', he: 'נתון: v = (10,-5,0), u = (5,5,-5)', en: 'given: v = (10,-5,0), u = (5,5,-5)' },
  // #794 (ADR-3D-168): pair-vector injections — numeric (V7 T2, was never cataloged) and symbolic
  // affine components (the #325 COMP grammar reaching the vector lanes; the symbols stay OPEN until
  // data pins them). The «נתון:» list takes pair items too.
  { category: 'vectors', he: 'BD = (-4,5,12)', en: 'BD = (-4,5,12)' },
  { category: 'vectors', he: "AA' = (k-1, k-7, k+1)", en: "AA' = (k-1, k-7, k+1)" },
  { category: 'vectors', he: 'נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)', en: 'given: AB = (k-1, k, 3), AC = (k+1, 0, k-3)' },
  // --- planes & lines ---
  { category: 'planesLines', he: 'המישור π1: z - 3 = 0', en: 'plane π1: z - 3 = 0' },
  // #504: the same head, plane edition — a spaced dash is the separator (it used to fall into the
  // equation as a unary minus), and the «= 0» may be left off.
  { category: 'planesLines', he: 'מישור π1 - x + 2y + 3z - 5', en: 'plane π1 - x + 2y + 3z - 5' },
  // #487 (ADR-3D-124): a FREE plane — declared by name alone, orientation sampled until later givens pin it
  { category: 'planesLines', he: 'מישור π2', en: 'plane π2' },
  { category: 'planesLines', he: 'π2', en: 'π2' }, // Am. 1: the bare notation declares too — deterministic, no LLM call
  { category: 'planesLines', he: 'B על המישור π2', en: 'B on plane π2' },
  // #552: a FREE line — the #487 idea, line edition. Convention names may stand bare (ℓ-prefix = line,
  // exactly as π-prefix = plane); any other single-letter name takes the NOUN, which states its kind.
  { category: 'planesLines', he: 'ישר l1', en: 'line l1' },
  { category: 'planesLines', he: 'l1', en: 'l1' }, // the bare convention notation declares too
  { category: 'planesLines', he: 'ישר k', en: 'line k' }, // noun-declared arbitrary name
  { category: 'planesLines', he: 'l ⊥ BCK', en: 'l ⊥ BCK' }, // creates l free when undeclared, ⊥ pins its direction
  { category: 'planesLines', he: 'l ∥ BCK', en: 'l ∥ BCK' },
  { category: 'planesLines', he: 'הישר k מאונך למישור BCK', en: 'line k is perpendicular to plane BCK' },
  { category: 'planesLines', he: 'B על הישר l1', en: 'B is on line l1' },
  { category: 'planesLines', he: 'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', en: 'line ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)' },
  // #640: the head is the noun + the name + a separator, and all three are optional or interchangeable —
  // the book prints the line with no article and no colon, which is what the operator typed in prod.
  { category: 'planesLines', he: 'ישר l x=(-1,5,-11)+t(m-1,5-m,-2)', en: 'line l x=(-1,5,-11)+t(m-1,5-m,-2)' },
  { category: 'planesLines', he: 'הישר l - x = (1,2,3) + t(m+2, m, m-2)', en: 'line l - x = (1,2,3) + t(m+2, m, m-2)' },
  {
    // ADR-3D-031: a pair-named parametric line also puts A,B ON the line (riders / verified givens)
    category: 'planesLines',
    he: 'הצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)',
    en: 'a parametric representation of line AB is x = (0,7,6) + t(0,2,1)',
  },
  { category: 'planesLines', he: 'הזווית בין המישורים π1 ו-π2 היא 45', en: 'the angle between planes π1 and π2 is 45' },
  { category: 'planesLines', he: 'הישר ℓ ניצב למישור π1', en: 'line ℓ is perpendicular to plane π1' },
  // #375 (ADR-3D-100): the plane written as its POINT RUN — either order, and the noun is not what decides
  { category: 'planesLines', he: 'מישור ABC אנך לישר ℓ', en: 'plane ABC is perpendicular to line ℓ' },
  { category: 'planesLines', he: 'מ-A מורידים אנך למישור π1 החותך אותו בנקודה B', en: 'from A drop a perpendicular to plane π1, it cuts it at B' },
  { category: 'planesLines', he: 'מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C', en: 'from B drop a perpendicular to line ℓ, it cuts it at C' },
  { category: 'planesLines', he: 'ℓ ישר החיתוך בין המישורים π1 ו-π2', en: 'ℓ is the intersection line of π1 and π2' },
  { category: 'planesLines', he: "ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'", en: "ℓ is the intersection line of plane BC'D and plane BCC'B'" },
  // #333 (ADR-3D-153): one rule, so the catalog can finally show the phrasings students actually
  // write — the `של`/`עם`/`ל` connectives, the plural over point-runs, and no line name at all.
  { category: 'planesLines', he: 'ℓ ישר החיתוך של המישורים ABC ו-SBC', en: 'ℓ is the line of intersection of planes ABC and SBC' },
  { category: 'planesLines', he: 'ℓ קו החיתוך בין המישור ABC למישור SBC', en: 'ℓ is the intersection line of plane ABC and plane SBC' },
  { category: 'planesLines', he: 'ישר החיתוך בין מישור ABC ומישור SBC', en: 'the intersection line of plane ABC and plane SBC' },
  { category: 'planesLines', he: "המישור BC'D", en: "plane BC'D" },
  { category: 'planesLines', he: 'מישור π דרך F וניצב ל-SC', en: 'plane π through F perpendicular to SC' },
  { category: 'planesLines', he: 'מישור π דרך K ו-P ומקביל ל-CD', en: 'plane π through K and P parallel to CD' },
  // #819 (ADR-3D-177): the exam's own construction frame — the through-points written as a SEGMENT,
  // the plane unnamed, and the point it cuts out stated in the same sentence.
  { category: 'planesLines', he: 'דרך AC העבירו מישור המקביל ל-SD', en: 'through AC pass a plane parallel to SD' },
  { category: 'planesLines', he: 'דרך AC העבירו מישור המקביל ל-SD וחותך את SB בנקודה K', en: 'through AC pass a plane parallel to SD and cuts SB at K' },
  // #819: the segment × plane-run cell in the PLANE-FIRST order and in the symbol notation — the
  // mirror of «AB מקביל למישור ACD», which the grammar carried alone.
  { category: 'planesLines', he: 'המישור ACD מקביל ל-AB', en: 'plane ACD is parallel to AB' },
  { category: 'planesLines', he: 'המישור ACD מאונך ל-AB', en: 'plane ACD is perpendicular to AB' },
  { category: 'planesLines', he: 'AB∥ACD', en: 'AB∥ACD' },
  { category: 'planesLines', he: 'המישור π חותך את SA בנקודה E', en: 'plane π cuts SA at E' },
  { category: 'planesLines', he: 'AF גובה הפירמידה לפאה BDC', en: 'AF is the height of the pyramid to face BDC' },
  // #448: the same height stated by its APEX instead of its segment — the foot is auto-minted, so the
  // student never has to name a point the question does not give them.
  { category: 'planesLines', he: 'גובה הפירמידה מנקודה D', en: 'height of the pyramid from D' },
  { category: 'planesLines', he: 'גובה מנקודה D לבסיס ABC', en: 'height from D to base ABC' },
  // #503 (ADR-3D-142): the APEX-LESS height — the apex is the pyramid's own, derived at apply — and
  // the imperative + relative-clause phrasing the prod session actually typed.
  { category: 'planesLines', he: 'גובה הפירמידה', en: 'the height of the pyramid' },
  { category: 'planesLines', he: 'שרטט גובה לפירמידה שיוצא מהקודקוד D לבסיס הפירמידה', en: 'draw a height of the pyramid that goes from vertex D to the base of the pyramid' },
  { category: 'planesLines', he: 'E על המישור ABC', en: 'E is on plane ABC' },
  { category: 'planesLines', he: 'E מעל המישור ABC', en: 'E is above plane ABC' },
  { category: 'planesLines', he: 'E מתחת למישור ABC', en: 'E is below plane ABC' },
  { category: 'planesLines', he: 'ℓ חותך את π1 בנקודה A', en: 'ℓ cuts plane π1 at A' },
  // #485 — the same crossing said the other way round (noun-headed, point first), and #401's point-run plane
  { category: 'planesLines', he: 'A נקודת החיתוך של ℓ עם π1', en: 'A is the intersection of ℓ and π1' },
  { category: 'planesLines', he: 'הישר ℓ1 חותך את מישור ACD בנקודה E', en: 'line ℓ1 cuts plane ACD at E' },
  { category: 'planesLines', he: "הישר A'C חותך את המישור BC'D בנקודה K", en: "line A'C cuts plane BC'D at K" },
  { category: 'planesLines', he: 'A נמצאת על אחד המישורים', en: 'A is on one of the planes' },
  { category: 'planesLines', he: 'B על הישר ℓ', en: 'B is on line ℓ' },
  // S2 (#378, ADR-3D-103): the NAMED-LINE column — point-on-ℓ short forms + ∥/⟂/angle with a
  // named-line operand (segment / vector / second line / named plane / point-run plane)
  { category: 'planesLines', he: 'B על l1', en: 'point B on l1' },
  { category: 'planesLines', he: 'נקודה B נמצאת על ישר l1', en: 'point B is on line l1' },
  { category: 'planesLines', he: 'AB מאונך לישר l1', en: 'AB is perpendicular to line l1' },
  { category: 'planesLines', he: 'AB מקביל לישר l1', en: 'AB is parallel to line l1' },
  { category: 'planesLines', he: 'הישר l1 מקביל לישר l2', en: 'line l1 is parallel to line l2' },
  { category: 'planesLines', he: 'l1 מאונך לישר l2', en: 'l1 is perpendicular to l2' },
  { category: 'planesLines', he: 'הישר l1 מקביל למישור π1', en: 'line l1 is parallel to plane π1' },
  { category: 'planesLines', he: 'הישר l1 מקביל למישור ACD', en: 'line l1 is parallel to plane ACD' },
  { category: 'planesLines', he: 'הזווית בין הישר l1 לבין המישור ACD היא 30', en: 'the angle between line l1 and plane ACD is 30' },
  { category: 'planesLines', he: 'הזווית בין AB לבין הישר l1 היא 60', en: 'the angle between AB and line l1 is 60' },
  { category: 'planesLines', he: 'הזווית בין l1 לבין l2 היא 60', en: 'the angle between l1 and l2 is 60' },
  // #69 (ADR-3D-038): digit-indexed line names ℓ1/ℓ2 — several parametric lines coexist
  { category: 'planesLines', he: 'הישר ℓ1: x = (0,0,0) + t(1,0,0)', en: 'line ℓ1: x = (0,0,0) + t(1,0,0)' },
  // #351 (ADR-3D-091): through the ORIGIN — the anchor may be omitted entirely
  { category: 'planesLines', he: 'הישר ℓ1: x = t(0,m,2m-2)', en: 'line ℓ1: x = t(0,m,2m-2)' },
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
  { category: 'points', he: 'AS = (1-t)u + 0.5v + tw', en: 'AS = (1-t)u + 0.5v + tw' },
  { category: 'points', he: 'AM = (0.5+k/6)u + (k+3.5)w', en: 'AM = (0.5+k/6)u + (k+3.5)w' },
  { category: 'points', he: 'EF מקביל למישור ABC', en: 'EF is parallel to plane ABC' },
  { category: 'points', he: 'ABEC מלבן', en: 'ABEC is a rectangle' },
  { category: 'points', he: 'D בראשית הצירים', en: 'D is at the origin' },
  { category: 'points', he: 'A על ציר ה-x החיובי', en: 'A is on the positive x-axis' },
  { category: 'claims', he: '∠BAC = 90', en: '∠BAC = 90' },
  { category: 'claims', he: 'NK ו-PL מצטלבים', en: 'NK and PL are skew' },
  // S4 (#378, ADR-3D-104): the MUTUAL-POSITION column — skew / intersecting / parallel / coincident
  // over segments and named lines alike, as GIVENS as well as claims.
  { category: 'planesLines', he: 'AB מקביל ל-CD', en: 'AB is parallel to CD' },
  { category: 'planesLines', he: 'AC ו-BD נחתכים', en: 'AC and BD intersect' },
  { category: 'planesLines', he: 'AB ו-l1 מצטלבים', en: 'AB and l1 are skew' },
  { category: 'planesLines', he: 'l1 ו-l2 מצטלבים', en: 'l1 and l2 are skew' },
  { category: 'planesLines', he: 'AB מתלכד עם CD', en: 'AB coincides with CD' },
  // S3 (#378, ADR-3D-105): the PLANE column — ⟂ / ∥ / angle / coincident wherever a plane is a side
  { category: 'planesLines', he: "המישור ABC מקביל למישור A'B'C'", en: "plane ABC is parallel to plane A'B'C'" },
  { category: 'planesLines', he: 'המישור ABC מאונך למישור ABD', en: 'plane ABC is perpendicular to plane ABD' },
  { category: 'planesLines', he: 'הזווית בין המישור ABC לבין המישור ABD היא 60', en: 'the angle between plane ABC and plane ABD is 60' },
  { category: 'planesLines', he: 'המישור ABC מתלכד עם המישור ABD', en: 'plane ABC coincides with plane ABD' },
  { category: 'planesLines', he: 'π1 ניצב ל-π2', en: 'π1 is perpendicular to π2' },
  { category: 'planesLines', he: 'u מאונך למישור ABC', en: 'u is perpendicular to plane ABC' },
  // S5 (#378, ADR-3D-106): the DISTANCE family — the one relation carrying units
  { category: 'planesLines', he: 'המרחק בין D למישור ABC הוא 6', en: 'the distance between D and plane ABC is 6' },
  // #529 (ADR-3D-145): the «מ…ל» framing — the same fact as the בין row, in the spelling that matches
  // the imperative forms («אנך יורד מ-M ל…»).
  { category: 'planesLines', he: 'המרחק מ D למישור ABC הוא 6', en: 'the distance from D to plane ABC is 6' },
  { category: 'planesLines', he: 'המרחק בין D לישר AB הוא 5', en: 'the distance between D and line AB is 5' },
  { category: 'planesLines', he: 'המרחק בין AB לבין CD הוא 3', en: 'the distance between AB and CD is 3' },
  // --- V8-f: vector-relation givens ---
  { category: 'vectors', he: 'קוסינוס הזווית בין הוקטורים u ו-w הוא √35/10', en: 'the cosine of the angle between u and w is √35/10' },
  { category: 'vectors', he: 'קוסינוס הזווית ACB = 3/4', en: 'cos∠ACB = 3/4' },
  // #862 (ADR-3D-205): the MIXED arm — a segment against a declared vector. The table declared this
  // cell supported long before any sentence reached it; the catalog is where a student finds out it can.
  { category: 'vectors', he: 'הזווית בין AB לבין v היא 60', en: 'the angle between AB and v is 60' },
  { category: 'vectors', he: 'u·v = v·w = u·w', en: 'u·v = v·w = u·w' },
  { category: 'vectors', he: 'AE יוצר זוויות שוות עם AB ו-AD', en: 'AE makes equal angles with AB and AD' },
  { category: 'points', he: 'D על AC כך ש-OD חוצה-זווית AOC', en: 'D on AC such that OD bisects angle AOC' },
  // --- V8-g: the 2-D vector lane (flat polygons in the plane) ---
  { category: 'solids', he: 'משולש ABC', en: 'triangle ABC' },
  { category: 'solids', he: 'משולש ABC ישר זווית', en: 'right triangle ABC' },
  // #424 (ADR-3D-109): a stated triangle qualifier lowers to its constraints in EVERY position
  { category: 'solids', he: 'ABC משולש שווה צלעות', en: 'equilateral triangle ABC' },
  { category: 'solids', he: 'ABC משולש שווה שוקיים', en: 'isosceles triangle ABC' },
  { category: 'solids', he: 'מנסרה שבסיסה משולש שווה שוקיים', en: 'prism with an isosceles triangle base' },
  { category: 'solids', he: 'פירמידה שבסיסה משולש שווה צלעות', en: 'pyramid with an equilateral triangle base' },
  { category: 'solids', he: 'פירמידה ישרה שבסיסה טרפז שווה שוקיים', en: 'right pyramid with an isosceles trapezoid base' },
  { category: 'solids', he: 'מרובע MKNL', en: 'quadrilateral MKNL' },
  { category: 'solids', he: 'מחומש ABCDE', en: 'pentagon ABCDE' },
  // #587 (ADR-3D-152): the flat QUAD shapes — the quad half of the #424 triangle qualifiers above.
  { category: 'solids', he: 'ריבוע ABCD', en: 'square ABCD' },
  { category: 'solids', he: 'ABCD ריבוע', en: 'ABCD is a square' },
  { category: 'solids', he: 'מלבן ABCD', en: 'rectangle ABCD' },
  { category: 'solids', he: 'מעוין ABCD', en: 'rhombus ABCD' },
  { category: 'solids', he: 'מקבילית ABCD', en: 'parallelogram ABCD' },
  { category: 'solids', he: 'דלתון ABCD', en: 'kite ABCD' },
  { category: 'solids', he: 'טרפז ABCD', en: 'trapezoid ABCD' },
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
  // #442 — the circle of a polygon (ring may be a flat polygon OR a solid's face)
  { category: 'solids', he: 'משולש ABC חסום במעגל', en: 'triangle ABC inscribed in a circle' },
  { category: 'solids', he: 'מעגל חסום במשולש ABC', en: 'circle inscribed in triangle ABC' },
  { category: 'points', he: 'D על המעגל', en: 'D is on the circle' },
  { category: 'points', he: 'T על הקטע SC כך ש-TABCD היא פירמידה ישרה', en: 'T on SC such that TABCD is a right pyramid' },
  // --- drawing ---
  { category: 'drawing', he: "קטע CA'", en: "segment CA'" },
  // #72 (ADR-3D-039): the baseline log-triage phrasing batch
  { category: 'drawing', he: "נחבר את D'F", en: "connect D'F" },
  { category: 'drawing', he: "אלכסון BD'", en: "the diagonal BD'" },
  // #449 (2 users): the same segment, with the solid named — the phrasing students actually type
  { category: 'drawing', he: "אלכסון תיבה AC'", en: "the space diagonal of the box AC'" },
  // #438: the solid and its SPACE diagonal in one sentence (a bare «אלכסון» stays ambiguous — face or
  // space — and refuses honestly rather than guessing)
  { category: 'solids', he: 'תיבה מלבנית עם אלכסון תיבה', en: 'a box with a space diagonal' },
  { category: 'drawing', he: '∠SDB', en: '∠SDB' },
  { category: 'drawing', he: '∠SDB = α', en: '∠SDB = α' },
  { category: 'drawing', he: "חץ A'C", en: "arrow A'C" },
  { category: 'drawing', he: 'אורך AB=BC', en: 'length AB = BC' },
  { category: 'drawing', he: 'אנך יורד מ-M לבסיס', en: 'drop a perpendicular from M to the base' },
  // #271/#272/#273 (ADR-3D-052/053): the named-measure layer — equal angles, a value for a name, bounds
  { category: 'relations', he: 'זווית SAB = זווית SAD', en: 'angle SAB = angle SAD' },
  { category: 'relations', he: 'α = 70', en: 'α = 70' },
  { category: 'relations', he: '60 < זווית SAB < 90', en: '60 < angle SAB < 90' },
  { category: 'relations', he: 'זווית SAB גדולה מ-60', en: 'angle SAB is greater than 60' },
  // --- editing the figure ---
  // #578 (ADR-3D-211): a RENAME is read by the deterministic lane but not by `parse3` — it rewrites
  // history rather than adding a command, so it is intercepted in `submit`. It is listed here anyway
  // because the catalog is the coverage map AND the in-app commands panel: 2-D leaves rename out and
  // the operator could not find it, which is how this issue was filed. The guard test reads the whole
  // deterministic lane (`parse3` OR `parseRename3`), so this entry is checked like every other.
  { category: 'editing', he: 'שנה שם E ל-O', en: 'rename E to O' },
  { category: 'editing', he: "החלף A' ב-M", en: "relabel A' to M" },
];
