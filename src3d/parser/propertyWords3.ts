/**
 * #1906 ([ADR-3D-364](../../docs/06b-decisions-3d.md#adr-3d-364), [ADR-W-144](../../docs/06w-decisions-workspace.md#adr-w-144))
 * — AN AI ANSWER KEEPS EVERY SHAPE AND ROLE WORD THE STUDENT TYPED, 3-D edition.
 *
 * The class (2-D's ADR-722, measured here too): a word the student typed that names a shape property, a cevian role
 * or a circle's direction was compared with the model's answer only when spelt exactly as this grammar's regexes
 * spell it, and the roles and the direction never. «משולש שווה צלעת ABC» answered «משולש ABC» recorded a scalene
 * triangle; «AD גובה לצלע BC שהוא גם חוצה זווית» answered «AD גובה לצלע BC» recorded the altitude alone.
 *
 * Two halves, as in 2-D:
 *  - WHERE the words stand: the shared reader (`shell/llm/honestyCore.ts` → `propertyWords`) over this tree's
 *    vocabulary — a canonical-spelling projection of `SHAPE_ADJ_WORDS3`, shapePhrase3's quadrilateral nouns,
 *    `CEVIAN_NOUNS3_*` and the inscription verbs (the unit test asserts each spelling is read by its atom).
 *  - WHETHER the answer carries each:
 *     - a SHAPE word asks the gates that already own it (`droppedShapeAdjective3`, `droppedShapeNoun3`, with
 *       their `length-rel` / `cos-angle` / `quad-shape.base` families) of the line SPELT RIGHT: the word is lost
 *       when the spelt-right line refuses on it and the line without it does not;
 *     - a ROLE word needs its own family (an altitude: `altitude-foot`, `tetra-altitude`, a ⟂ to a plane or a
 *       90° angle; a median: a midpoint on the side or a centroid; a bisector: a `bisector-ray` or equal angles),
 *       per OCCURRENCE, so one role never pays for another;
 *     - a DIRECTION word («חסום» / «חוסם») needs the circle the grammar's own reader gives the student's line.
 *
 * The model lane only (`decideSteps3`): the deterministic lane reads the line itself and has #1902's unread words.
 */
import type { Command3 } from '../engine/types';
import { propertyWords, withSpan, type PropertyPhrase, type WordReaderSpec } from '../../shell/llm/honestyCore';
import { readsWord3, statedCircleDirection3 } from './parse3';
import { droppedShapeAdjective3, droppedShapeNoun3 } from './honesty3';

export type PropertyWord3 = 'shape' | 'altitude' | 'median' | 'angle-bisector' | 'bisect' | 'direction';

/** THE VOCABULARY — each spelling one the grammar's own atom reads (asserted by the unit test). */
export const PROPERTY_VOCABULARY3: readonly PropertyPhrase<PropertyWord3>[] = [
  // `SHAPE_ADJ_WORDS3`
  { slots: [['ישר'], ['זווית', 'זוית']], props: ['shape'] },
  { slots: [['right']], props: ['shape'], nearMiss: false },
  { slots: [['שווה'], ['שוקיים']], props: ['shape'] },
  { slots: [['isosceles']], props: ['shape'] },
  { slots: [['שווה'], ['צלעות']], props: ['shape'] },
  { slots: [['equilateral']], props: ['shape'] },
  { slots: [['משוכלל']], props: ['shape'] },
  { slots: [['regular']], props: ['shape'] },
  // shapePhrase3's quadrilateral nouns (the ones `droppedShapeNoun3` demands)
  { slots: [['ריבוע', 'square']], props: ['shape'] },
  { slots: [['מלבן', 'rectangle']], props: ['shape'] },
  { slots: [['מעוין', 'rhombus']], props: ['shape'] },
  { slots: [['מקבילית', 'parallelogram']], props: ['shape'] },
  { slots: [['טרפז', 'trapezoid', 'trapezium']], props: ['shape'] },
  { slots: [['דלתון', 'kite']], props: ['shape'] },
  // `CEVIAN_NOUNS3_HE` / `CEVIAN_NOUNS3_EN`
  { slots: [['גובה', 'גבהי']], props: ['altitude'] },
  { slots: [['altitude']], props: ['altitude'] },
  { slots: [['height']], props: ['altitude'], nearMiss: false },
  { slots: [['תיכון']], props: ['median'] },
  { slots: [['median']], props: ['median'] },
  { slots: [['חוצה', 'חוצת', 'חוצי'], ['זווית', 'זוית', 'זוויות']], props: ['angle-bisector'] },
  { slots: [['angle'], ['bisector']], props: ['angle-bisector'] },
  { slots: [['bisector', 'bisects', 'bisect']], props: ['bisect'] },
  // the inscription verbs
  { slots: [['חסום', 'חוסם', 'חוסמת']], props: ['direction'] },
  { slots: [['inscribed', 'circumscribed', 'circumscribes', 'circumscribe']], props: ['direction'] },
];

const MEDIAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** 3-D's folds: case, final letters to medial, «וו» / «יי» to one (the tolerances `src3d/CLAUDE.md` records). */
const fold = (w: string): string => w.toLowerCase().replace(/[ךםןףץ]/g, (c) => MEDIAL[c]).replace(/וו/g, 'ו').replace(/יי/g, 'י');

const SPEC: WordReaderSpec = {
  fold,
  clitics: 'והבלמשכ',
  inflections: ['ים', 'ות', 'ה', 'ו', 'י', 'ית', 'יות', 's', 'es', 'd', 'ed', 'ing'],
  readsWord: readsWord3,
};

export const propertyOccurrences3 = (utterance: string) => propertyWords(utterance, PROPERTY_VOCABULARY3, SPEC);

const ALTITUDE3 = new Set(['altitude-foot', 'tetra-altitude', 'height-to-face', 'perp-to-base', 'foot-on-line', 'foot-on-plane', 'line-perp-plane', 'plane-line-perp', 'right-pyramid-point']);
const BISECTOR3 = new Set(['bisector-ray', 'bisector-dir', 'bisector-point', 'angle-eq', 'angle-pair-eq', 'cos-angle-eq', 'vertex-angle-eq']);

function carries3(p: PropertyWord3, commands: readonly Command3[], line: string, occ: { start: number; text: string }, priorCircle: boolean): boolean {
  const has = (types: ReadonlySet<string>) => commands.some((c) => types.has(c.type));
  const median = () =>
    commands.some((c) => (c.type === 'point-on-segment3' && c.t === 0.5) || c.type === 'centroid3' || c.type === 'midpoint-auto' || (c.type === 'length-rel' && c.c === 1));
  switch (p) {
    case 'shape':
      return true; // asked of the owning gates, below
    case 'altitude':
      return (
        has(ALTITUDE3) ||
        commands.some((c) => (c.type === 'seg-plane-rel' && c.rel === 'perp') || (c.type === 'cos-angle' && c.cos === 0) || 'height' in c)
      );
    case 'median':
      return median();
    case 'angle-bisector':
      return has(BISECTOR3);
    case 'bisect':
      if (/perpendicular\s*$/i.test(line.slice(0, occ.start))) return true;
      return has(BISECTOR3) || median();
    case 'direction': {
      if (!/מעגל|circle/i.test(line)) return true;
      if (priorCircle && (/^ה/.test(occ.text) || /(?:^|\s)המעגל\s*$|\bthe\s+(?:circle\s+)?$/i.test(line.slice(0, occ.start)))) return true;
      const dir = statedCircleDirection3(line);
      if (dir === null) return true;
      if (dir === 'in') return commands.some((c) => c.type === 'circle3' && c.def.kind === 'incircle');
      return commands.some((c) => (c.type === 'circle3' && c.def.kind === 'circum') || c.type === 'concyclic' || c.type === 'point-on-circle3');
    }
  }
}

/** The items `f(line)` names that `f(base)` does not — a multiset difference, so a word typed twice counts twice. */
function newItems(f: (s: string) => string[], line: string, base: string): string[] {
  const left = [...f(base)];
  return f(line).filter((x) => {
    const i = left.indexOf(x);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/**
 * The shape and role words of `utterance` the model's `commands` do not carry, as the student typed them.
 * `priorCircle`: the figure already holds a circle (a definite «המעגל החוסם» then refers to it).
 */
export function droppedPropertyWords3(utterance: string, commands: readonly Command3[], priorCircle = false, priorPoints: readonly string[] = []): string[] {
  const occs = propertyOccurrences3(utterance);
  if (occs.length === 0) return [];
  const cmds = [...commands];
  const shapeGates = (s: string): string[] => [...droppedShapeNoun3(s, cmds), ...droppedShapeAdjective3(s, cmds)];
  // the line spelt right: every occurrence written as its first candidate, each one's span in it recorded
  let spelt = '';
  let from = 0;
  const spans: { start: number; end: number }[] = [];
  for (const o of occs) {
    spelt += utterance.slice(from, o.start);
    spans.push({ start: spelt.length, end: spelt.length + o.candidates[0].canonical.length });
    spelt += o.candidates[0].canonical;
    from = o.end;
  }
  spelt += utterance.slice(from);
  const out: string[] = [];
  occs.forEach((o, k) => {
    // a DEFINITE role noun naming a segment already drawn («הגובה AB = 5») refers to it
    const pair = utterance.slice(o.end).match(/^\s*([A-Z]\d*'?)([A-Z]\d*'?)(?![A-Za-z\d])/);
    const roleReference = /^ה/.test(o.text) && !!pair && [pair[1], pair[2]].every((l) => priorPoints.includes(l));
    const ok = o.candidates.some(({ phrase, canonical }) =>
      phrase.props.some((p) => {
        if (p !== 'shape' && p !== 'direction' && roleReference) return true;
        if (p !== 'shape') return carries3(p, cmds, withSpan(utterance, o.start, o.end, canonical), o, priorCircle);
        // the owning gates, asked of the line spelt right, against the same line without this word
        const withWord = withSpan(spelt, spans[k].start, spans[k].end, canonical);
        const without = withSpan(spelt, spans[k].start, spans[k].end, ' ');
        return newItems(shapeGates, withWord, without).length === 0;
      }),
    );
    if (!ok) out.push(o.text);
  });
  return out.filter((x, i, a) => a.indexOf(x) === i);
}
