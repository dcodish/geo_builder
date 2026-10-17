/**
 * #2076 ([ADR-3D-363](../../../docs/06b-decisions-3d.md#adr-3d-363)) — EVERY SIZE OF A CONE, CYLINDER OR SPHERE THE
 * DECLARATION CANNOT READ GETS ONE ANSWER: THE CAPABILITY IS IN DEVELOPMENT.
 *
 * Measured at 87f8291e through `decideSubmit3`: a root or fraction size got the size sentence (ADR-3D-340); a
 * diameter, slant height or volume inside the declaration got «לא הצלחנו לצייר: 4 … נסו לפצל»; «כדור שקוטרו 6» and
 * every size on its own line («רדיוס החרוט הוא 2», «גובה החרוט 3», "the height of the cone is 3") went to the model
 * lane; a volume or area line on a free-size solid got «מידות ה«cone» לא נתונות …» with the raw engine id; and
 * "cone with radius 2 and slant height 5" drew a cone of HEIGHT 5, green.
 *
 * Operator, 2026-10-13: *"include all variations of input including the גובה החרוט"*; ruling 2026-10-14 (card
 * `d14-2076`): *"option A - but say that this is in development instead of not supported"*.
 *
 * The lock is a phrasing SWEEP (size noun × own line / in the declaration × copula × value form × language × solid),
 * with a guard on its size, so it cannot pass by checking nothing.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../../i18n';
import he from '../../i18n/locales/he.json';
import en from '../../i18n/locales/en.json';
import { errorText3 } from '../../i18n/errorText3';
import { decideSubmit3, derive3, type Fact3 } from '../../store/store3';

type Solid = 'cone' | 'cylinder' | 'sphere';
type St = { facts: Fact3[]; seed: number };
let n = 0;
const newId = () => `f${++n}`;
const tHe = i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
const tEn = i18n3d.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;

/** Submit each line; every line but the last must record. */
function build(lines: string[]): { st: St; last: ReturnType<typeof decideSubmit3> } {
  let st: St = { facts: [], seed: 0 };
  let last: ReturnType<typeof decideSubmit3> = { kind: 'not-understood' };
  lines.forEach((u, i) => {
    last = decideSubmit3(st, u, newId);
    if (i < lines.length - 1) expect(last.kind, `«${u}» in ${JSON.stringify(lines)}`).toBe('record');
    if (last.kind === 'record') st = { facts: last.facts, seed: last.seed };
  });
  return { st, last };
}

const HE_SOLID: Record<Solid, string> = { cone: 'חרוט', cylinder: 'גליל', sphere: 'כדור' };
const HE_NOUNS: Record<Solid, string[]> = {
  cone: ['רדיוס', 'רדיוס בסיס', 'קוטר', 'קוטר בסיס', 'גובה', 'יוצר', 'אורך היוצר', 'נפח', 'שטח הבסיס', 'שטח המעטפת', 'שטח הפנים'],
  cylinder: ['רדיוס', 'רדיוס בסיס', 'קוטר', 'גובה', 'נפח', 'שטח הבסיס', 'שטח המעטפת', 'שטח הפנים'],
  sphere: ['רדיוס', 'קוטר', 'נפח', 'שטח הפנים'],
};
const EN_NOUNS: Record<Solid, string[]> = {
  cone: ['radius', 'base radius', 'diameter', 'height', 'slant height', 'volume', 'base area', 'lateral area'],
  cylinder: ['radius', 'diameter', 'height', 'volume', 'lateral area'],
  sphere: ['radius', 'diameter', 'volume', 'surface area'],
};
const VALUES = ['2', '√2', '1/2', '2.5'];

/** Every unsupported sequence and the solid its refusal must name. */
const UNSUPPORTED: [string[], Solid][] = [];
for (const solid of ['cone', 'cylinder', 'sphere'] as const) {
  const w = HE_SOLID[solid];
  for (const noun of HE_NOUNS[solid])
    for (const v of VALUES)
      for (const line of [`${noun} ה${w} הוא ${v}`, `${noun} ה${w} ${v}`, `${noun} ה${w} = ${v}`, `${noun} של ה${w} הוא ${v}`])
        UNSUPPORTED.push([[w, line], solid]);
  for (const noun of EN_NOUNS[solid])
    for (const v of ['2', '√2'])
      for (const line of [`the ${noun} of the ${solid} is ${v}`, `${noun} of the ${solid} = ${v}`]) UNSUPPORTED.push([[solid, line], solid]);
}
UNSUPPORTED.push(
  // the operator's own lines (2026-10-13 clarifications)
  [['חרוט', 'רדיוס החרוט הוא 2'], 'cone'],
  [['חרוט', 'רדיוס החרוט 3'], 'cone'],
  [['חרוט', 'רדיוס בסיס החרוט 2'], 'cone'],
  [['חרוט', 'גובה החרוט הוא 3'], 'cone'],
  [['חרוט', 'גובה החרוט 3'], 'cone'],
  [['חרוט', 'גובה החרוט = 3'], 'cone'],
  [['חרוט', 'אורך היוצר 5'], 'cone'],
  [['גליל', 'רדיוס הגליל הוא 2'], 'cylinder'],
  // a sized solid, a named cone and apex
  [['חרוט שרדיוסו 5 וגובהו 12', 'רדיוס החרוט הוא 5'], 'cone'],
  [['חרוט שרדיוסו 5 וגובהו 12', 'אורך היוצר 5'], 'cone'],
  [['חרוט שקודקודו S ומרכז בסיסו O', 'גובה החרוט SO הוא 3'], 'cone'],
  [['חרוט שקודקודו S ומרכז בסיסו O', 'רדיוס החרוט הוא 2'], 'cone'],
  [['חרוט שקודקודו S ומרכז בסיסו O', 'SO = 3'], 'cone'],
  // a volume or area line on a free-size solid (was `free-size-claim`, the raw id)
  [['חרוט', 'נפח החרוט = 10'], 'cone'],
  [['גליל', 'נפח הגליל = 10π'], 'cylinder'],
  [['כדור', 'נפח הכדור = 36π'], 'sphere'],
  [['חרוט', 'שטח המעטפת של החרוט = 65π'], 'cone'],
  [['כדור', 'שטח הפנים של הכדור = 36π'], 'sphere'],
  [['cone', 'the volume of the cone = 10'], 'cone'],
  // inside the declaration: a noun that is not a slot, or a value the slot does not read
  [['חרוט שקוטרו 4 וגובהו 3'], 'cone'],
  [['חרוט שקוטר בסיסו 4 וגובהו 3'], 'cone'],
  [['חרוט שרדיוסו 2 ויוצרו 5'], 'cone'],
  [['חרוט שאורך היוצר שלו 5'], 'cone'],
  [['חרוט שרדיוסו 2 ונפחו 10π'], 'cone'],
  [['חרוט שקודקודו S ומרכז בסיסו O וקוטרו 4'], 'cone'],
  [['גליל שקוטרו 4 וגובהו 5'], 'cylinder'],
  [['גליל שנפחו 12π'], 'cylinder'],
  [['כדור שקוטרו 6'], 'sphere'],
  [['כדור שנפחו 36π'], 'sphere'],
  [['cone with diameter 4 and height 3'], 'cone'],
  [['cone with radius 2 and slant height 5'], 'cone'],
  [['sphere with diameter 6'], 'sphere'],
  [['חרוט שרדיוסו √2 וגובהו 3'], 'cone'],
  [['חרוט שגובהו √3'], 'cone'],
  [['כדור שרדיוסו 1/2'], 'sphere'],
);

describe('#2076 — every unsupported revolution size is answered «in development»', () => {
  it('the sweep: each line is refused with the size refusal naming its solid, in one sentence', () => {
    let checks = 0;
    for (const [seq, solid] of UNSUPPORTED) {
      const { last } = build(seq);
      expect(last, JSON.stringify(seq)).toMatchObject({ kind: 'refused', error: { code: 'given-not-drivable', object: { kind: 'size', solid } } });
      if (last.kind !== 'refused') continue;
      expect(errorText3(tHe, last.error), JSON.stringify(seq)).toBe(tHe('err.givenNotDrivableSize', { solid: tHe(`solidNoun.${solid}`) }));
      checks++;
    }
    expect(checks).toBe(UNSUPPORTED.length);
    expect(checks).toBeGreaterThan(300); // the guard: the sweep cannot pass by matching nothing
  });

  it('the sentence, read from the locale (one source), Hebrew and English', () => {
    expect(he.err.givenNotDrivableSize).toBe('הכלי עדיין לא יודע לקבוע את גודל ה{{solid}} לפי נתון כזה — היכולת הזאת נמצאת בפיתוח, ולכן הצעד לא נוסף.');
    expect(en.err.givenNotDrivableSize).toBe("The tool can't yet set the {{solid}}'s size from a given like this — this capability is in development, so the step wasn't added.");
    const { last } = build(['חרוט שרדיוסו √2 וגובהו 3']);
    if (last.kind !== 'refused') throw new Error(JSON.stringify(last));
    expect(errorText3(tHe, last.error)).toBe('הכלי עדיין לא יודע לקבוע את גודל החרוט לפי נתון כזה — היכולת הזאת נמצאת בפיתוח, ולכן הצעד לא נוסף.');
    expect(errorText3(tEn, last.error)).toContain('in development');
  });

  it('the free-size claim code is retired: no raw engine id, no work-around hint', () => {
    expect('freeSizeClaim' in he.err).toBe(false);
    expect('freeSizeClaim' in en.err).toBe(false);
  });
});

describe('#2076 — the supported spellings keep building, to exactly their stated size', () => {
  const BUILDS: [string, { kind: Solid; radius?: number; height?: number }][] = [
    ['חרוט', { kind: 'cone' }],
    ['גליל', { kind: 'cylinder' }],
    ['כדור', { kind: 'sphere' }],
    ['חרוט שרדיוסו 2 וגובהו 3', { kind: 'cone', radius: 2, height: 3 }],
    ['חרוט שרדיוסו 2.5 וגובהו 3', { kind: 'cone', radius: 2.5, height: 3 }],
    ['חרוט שרדיוס בסיסו 5 וגובהו 12', { kind: 'cone', radius: 5, height: 12 }],
    ['חרוט שגובהו 3', { kind: 'cone', height: 3 }],
    ['גליל שרדיוסו 2 וגובהו 5', { kind: 'cylinder', radius: 2, height: 5 }],
    ['כדור שרדיוסו 2', { kind: 'sphere', radius: 2 }],
    ['כדור שמרכזו O ורדיוסו 2', { kind: 'sphere', radius: 2 }],
    ['cone with radius 2 and height 3', { kind: 'cone', radius: 2, height: 3 }],
    ['חרוט שקודקודו S ומרכז בסיסו O, רדיוס הבסיס 5 וגובהו 12', { kind: 'cone', radius: 5, height: 12 }],
  ];
  it.each(BUILDS)('«%s» builds', (line, rev) => {
    const { st, last } = build([line]);
    expect(last.kind).toBe('record');
    const d = derive3(st.facts, st.seed);
    expect(d.construction.revolutions).toHaveLength(1);
    expect(d.construction.revolutions[0].kind).toBe(rev.kind);
    expect(d.construction.revolutions[0].radius).toBe(rev.radius);
    expect(d.construction.revolutions[0].height).toBe(rev.height);
  });

  it('a volume claim on a SIZED cone still verifies', () => {
    const { st, last } = build(['חרוט שרדיוסו 5 וגובהו 12', 'נפח החרוט = 100π']);
    expect(last.kind).toBe('record');
    const d = derive3(st.facts, st.seed);
    for (const f of st.facts) expect(d.status[f.id]).toBe('ok');
  });

  it('a question about a size is not answered by the refusal', () => {
    for (const q of ['רדיוס החרוט?', 'מהו רדיוס החרוט?']) {
      expect(build(['חרוט', q]).last.kind, q).not.toBe('refused');
    }
  });

  it('a pyramid’s height and volume are untouched (not a solid of revolution)', () => {
    expect(build(['פירמידה SABCD', 'גובה הפירמידה הוא 3']).last.kind).toBe('record');
    expect(build(["תיבה ABCDA'B'C'D'", 'נפח התיבה = 24']).last.kind).toBe('record');
  });
});
