/**
 * #1918 ([ADR-AG-252](../../docs/06c-decisions-analytic.md#adr-ag-252); operator ruling 2026-10-08 "Refuse in both") —
 * A RIGHT TRAPEZOID AND A CIRCLE THROUGH IT, IN TWO SENTENCES, EITHER ORDER, ARE REFUSED NAMING BOTH.
 *
 * «טרפז ישר זווית ABCD חסום במעגל» in one sentence was already refused (ADR-AG-198). Stated in two sentences —
 * «טרפז ישר זווית ABCD» · «ABCD חסום במעגל», or the reverse — both recorded and the rectangle was drawn with the
 * `trapezoid-is-parallelogram` warning. Class: a noun no circle passes around (its registry row's `notCyclic`) was
 * held against an inscription only when both arrived in ONE sentence. Mechanism: the inscription lowering marks the
 * ring's polygon fact `cyclic`; M1 (`applyFact`'s polygon arm) carries `cyclic` / `circleless` on the ring and refuses
 * the statement that would make both true — so `derive` refuses it too (a saved file loads with the row failed).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { fold } from '../engine/apply';
import { SHAPES } from '../engine/shapes';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import { shapeWarningsOf } from '../app/shapeWarnings';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { Fact } from '../engine/types';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Type `lines` one by one, as the app does; every line but the last must record. The verdict of the LAST line. */
function typed(lines: readonly string[], seed = 0) {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return decideSubmit(lines[lines.length - 1], held, seed);
}

const NOUNS = ['טרפז ישר זווית ABCD', 'טרפז ישר-זווית ABCD', 'right trapezoid ABCD'];
/** Every inscription spelling the grammar reads (the `cyclicFacts` rules), Hebrew and English. */
const INSCRIPTIONS = [
  'ABCD חסום במעגל',
  'המרובע ABCD חסום במעגל',
  'ABCD חסום במעגל שמרכזו M',
  'מעגל חוסם את ABCD',
  'מעגל חוסם את BCDA',
  'במעגל חסום ABCD',
  'ABCD בר חסימה',
  'ABCD is inscribed in a circle',
  'the circumcircle of ABCD',
  'a circle circumscribing ABCD',
  'ABCD is cyclic',
  'cyclic quadrilateral ABCD',
];
const PAIRS = NOUNS.flatMap((n) => INSCRIPTIONS.map((i) => [n, i] as const));

describe('#1918 — the reported sequence, both orders, the exact words (rule 4)', () => {
  it('«טרפז ישר זווית ABCD» · «ABCD חסום במעגל»: the inscription is refused, naming both statements', () => {
    const v = typed(['טרפז ישר זווית ABCD', 'ABCD חסום במעגל']);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error, he)).toBe(
      'לא ניתן: «ABCD חסום במעגל» סותר את «טרפז ישר זווית ABCD» — אי אפשר לקיים את שניהם יחד. ' +
        'הסיבה: מעגל שעובר דרך ארבעת הקודקודים הופך טרפז ישר זווית למלבן, ומלבן אינו טרפז ישר זווית.',
    );
    expect(errorText(v.error, en)).toBe(
      "Can't do that: «ABCD חסום במעגל» contradicts «טרפז ישר זווית ABCD» — they can't both hold. " +
        'The reason: a circle through the four vertices would make a right trapezoid a rectangle, and a rectangle is not a right trapezoid.',
    );
  });

  it('«ABCD חסום במעגל» · «טרפז ישר זווית ABCD»: the noun is refused, naming both statements', () => {
    const v = typed(['ABCD חסום במעגל', 'טרפז ישר זווית ABCD']);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error, he)).toBe(
      'לא ניתן: «טרפז ישר זווית ABCD» סותר את «ABCD חסום במעגל» — אי אפשר לקיים את שניהם יחד. ' +
        'הסיבה: מעגל שעובר דרך ארבעת הקודקודים הופך טרפז ישר זווית למלבן, ומלבן אינו טרפז ישר זווית.',
    );
    expect(errorText(v.error, en)).toBe(
      "Can't do that: «טרפז ישר זווית ABCD» contradicts «ABCD חסום במעגל» — they can't both hold. " +
        'The reason: a circle through the four vertices would make a right trapezoid a rectangle, and a rectangle is not a right trapezoid.',
    );
  });

  it('English, both orders', () => {
    const a = typed(['right trapezoid ABCD', 'ABCD is inscribed in a circle']);
    const b = typed(['ABCD is inscribed in a circle', 'right trapezoid ABCD']);
    expect(a.kind === 'refused' && errorText(a.error, en)).toBe(
      "Can't do that: «ABCD is inscribed in a circle» contradicts «right trapezoid ABCD» — they can't both hold. " +
        'The reason: a circle through the four vertices would make a right trapezoid a rectangle, and a rectangle is not a right trapezoid.',
    );
    expect(b.kind === 'refused' && errorText(b.error, he)).toBe(
      'לא ניתן: «right trapezoid ABCD» סותר את «ABCD is inscribed in a circle» — אי אפשר לקיים את שניהם יחד. ' +
        'הסיבה: מעגל שעובר דרך ארבעת הקודקודים הופך טרפז ישר זווית למלבן, ומלבן אינו טרפז ישר זווית.',
    );
  });
});

describe('#1918 — every noun spelling × every inscription spelling, in either order, at several seeds', () => {
  it.each(PAIRS)('«%s» · «%s»', (noun, inscription) => {
    for (const seed of [0, 1, 2]) {
      for (const [first, second] of [[noun, inscription], [inscription, noun]]) {
        const v = typed([first, second], seed);
        expect(v.kind, `«${first}» · «${second}» at seed ${seed}`).toBe('refused');
        if (v.kind !== 'refused') continue;
        expect(v.error).toMatchObject({ key: 'inscribed-contradicts-declared', detail: second, declared: first, shape: 'טרפז ישר זווית', forced: 'מלבן' });
      }
    }
  });
});

describe('#1918 — load and replay refuse it too (the check lives at M1, not at submit)', () => {
  it.each([
    [['טרפז ישר זווית ABCD', 'ABCD חסום במעגל'], 1, 'טרפז ישר זווית ABCD'],
    [['ABCD חסום במעגל', 'טרפז ישר זווית ABCD'], 1, 'ABCD חסום במעגל'],
    [['טרפז ABCD', 'טרפז ישר זווית ABCD', 'מעגל חוסם את BCDA'], 2, 'טרפז ישר זווית ABCD'],
  ] as const)('a saved %j shows line %i failed, naming «%s», and draws no forced rectangle', (lines, index, declared) => {
    const d = derive(lines, 0);
    expect(d.faults).toEqual([expect.objectContaining({ index, code: 'inscribed-contradicts-declared', detail: lines[index], declared })]);
    // The refused line contributes nothing — the figure is the one without it — and no "no longer a trapezoid"
    // warning stands on a forced rectangle.
    const kept = lines.filter((_, i) => i !== index);
    expect(d.construction.objects).toEqual(derive(kept, 0).construction.objects);
    expect(d.construction.constraints.length).toBe(derive(kept, 0).construction.constraints.length);
    expect(shapeWarningsOf(kept, derive(kept, 0))).toEqual([]);
  });
});

describe('#1918 — the rule is the registry column, not a listed pair', () => {
  const circleless = Object.entries(SHAPES).filter(([, row]) => row.notCyclic && row.arity === 4);
  it('at least one noun carries `notCyclic`', () => expect(circleless.length).toBeGreaterThan(0));
  it.each(circleless)('«%s»: a later inscription is refused at M1, forcing its `notCyclic` noun', (noun, row) => {
    const lines = [`${noun} ABCD`, 'ABCD חסום במעגל'];
    const facts: Fact[] = [];
    const owner: number[] = [];
    lines.forEach((l, i) => {
      const r = parseLine(l);
      if (!r.ok) throw new Error(l);
      for (const f of r.facts) (facts.push(f), owner.push(i));
    });
    const { errors } = fold(facts, owner);
    const refused = errors.find((e) => e?.code === 'inscribed-contradicts-declared');
    expect(refused).toMatchObject({ detail: 'ABCD חסום במעגל', shape: noun, forced: row.notCyclic });
  });
  it('the inscription marks the ring`s polygon fact, and only the inscription', () => {
    const ins = parseLine('ABCD חסום במעגל');
    const decl = parseLine('טרפז ישר זווית ABCD');
    expect(ins.ok && ins.facts.find((f) => f.t === 'polygon')).toMatchObject({ cyclic: true });
    expect(decl.ok && decl.facts.find((f) => f.t === 'polygon')).not.toHaveProperty('cyclic');
  });
});

describe('#1918 — unchanged', () => {
  it('the one-sentence form keeps its own refusal (ADR-AG-198)', () => {
    const v = typed(['טרפז ישר זווית ABCD חסום במעגל']);
    expect(v.kind === 'refused' && v.error.key).toBe('inscribed-contradicts-noun');
  });
  it.each([
    ['טרפז ABCD', 'ABCD חסום במעגל'],
    ['ABCD חסום במעגל', 'טרפז ABCD'],
    ['טרפז שווה שוקיים ABCD', 'ABCD חסום במעגל'],
    ['מלבן ABCD', 'ABCD חסום במעגל'],
    ['ABCD חסום במעגל', 'מלבן ABCD'],
    ['טרפז ישר זווית ABCD', 'אלכסוני הטרפז נפגשים בנקודה M'],
  ])('«%s» · «%s» records', (a, b) => {
    expect(typed([a, b]).kind).toBe('record');
  });
});
