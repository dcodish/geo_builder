/**
 * #2553 (ADR-AG-337) — A COMMON TANGENT'S KIND, WRITTEN AS ITS DEFINITION, ONE SPELLING FOR EVERY READER.
 *
 * The exam (שאלה 6, «משיק משותף לשני מעגלים שווים», ב) does not say «חיצוני»: it writes the definition — «משיק משותף
 * ששני המעגלים נמצאים באותו צד שלו», a common tangent with both circles on the same side of it. That is what «חיצוני»
 * means (2-D's own message for an external tangent reads «שני המרכזים באותו צד שלו»), and «… מצדדים שונים שלו» is
 * «פנימי». Measured at d9494206 both builders handed the sentence to the model, while «משיק משותף חיצוני לשני המעגלים»
 * builds in both. A per-rule spelling would leave the next common-tangent rule to miss it, so the definition is folded
 * ONCE, at the parser boundary (`normalizeUtterance`), into the kind word and the circles it names.
 *
 * COPIED, not shared, into the analytic builder (`src-analytic/parser/frameAnalytic.ts`, `foldTangentSide`): a
 * vocabulary layer shared across products is undecided (BOUNDARIES.json `lexicon`), and the parity rows
 * `tangent-same-side-2553` / `tangent-opposite-sides-2553` hold the two copies to one verdict.
 *
 * Only the clause that FOLLOWS the tangent noun is folded («משיק (משותף)? ש…») — the definition is the tangent's
 * relative clause, so it can never be read off another sentence. The circles it names become the rule's own target:
 * «ששני המעגלים …» → «לשני המעגלים», «שהמעגלים O ו-P …» → «למעגלים O ו-P».
 */

const SAME_SIDE = '(?:נמצאים\\s+|מונחים\\s+)?(?:ב|מ)אותו\\s+(?:ה)?צד\\s+(?:שלו|של\\s+ה?משיק)';
const OPPOSITE_SIDES =
  '(?:נמצאים\\s+|מונחים\\s+)?(?:(?:ב|מ)צדדים\\s+(?:ה)?שונים\\s+(?:שלו|של\\s+ה?משיק)|(?:ב|מ)שני\\s+(?:ה)?צדדים\\s+(?:שלו|של\\s+ה?משיק)|(?:ב|מ)שני\\s+צדדיו)';
/** «משיק (משותף)?» then «ש(שני )?ה?מעגלים (X ו-Y)?» — the tangent noun and the circles its clause names. */
const HEAD = '((?:^|\\s)ה?משיק(?:\\s+ה?משותף)?)\\s+ש(?:(שני\\s+ה?מעגלים)|(ה?מעגלים(?:\\s+[A-Z][0-9₀-₉]?\\s*ו-?\\s*[A-Z][0-9₀-₉]?)?))\\s+';
const EXTERNAL = new RegExp(`${HEAD}${SAME_SIDE}(?=$|[\\s,.;])`, 'g');
const INTERNAL = new RegExp(`${HEAD}${OPPOSITE_SIDES}(?=$|[\\s,.;])`, 'g');
/** English: "(a) common tangent with both circles on the same side of it" / "… on opposite sides of it". */
const EN_HEAD = '\\b((?:an?|the)\\s+)?common\\s+tangent\\s+(?:with|such\\s+that|so\\s+that|where)\\s+(?:both|the\\s+two)\\s+circles\\s+(?:are\\s+|lie\\s+)?';
const EN_EXTERNAL = new RegExp(`${EN_HEAD}on\\s+the\\s+same\\s+side\\s+of\\s+it\\b`, 'gi');
const EN_INTERNAL = new RegExp(`${EN_HEAD}on\\s+(?:opposite|different)\\s+sides\\s+of\\s+it\\b`, 'gi');

/** The circles of the clause as the rules' own target: «לשני המעגלים», «למעגלים O ו-P». */
const target = (two: string | undefined, named: string | undefined): string =>
  two || !named || !/[A-Z]/.test(named) ? 'לשני המעגלים' : `ל${named.replace(/^ה/, '').replace(/\s+/g, ' ')}`;

export function foldTangentSide(s: string): string {
  return s
    .replace(EXTERNAL, (_m, head: string, two?: string, named?: string) => `${head} חיצוני ${target(two, named)}`)
    .replace(INTERNAL, (_m, head: string, two?: string, named?: string) => `${head} פנימי ${target(two, named)}`)
    .replace(EN_EXTERNAL, (_m, det?: string) => `${det ? 'an ' : ''}external common tangent to the two circles`)
    .replace(EN_INTERNAL, (_m, det?: string) => `${det ? 'an ' : ''}internal common tangent to the two circles`);
}
