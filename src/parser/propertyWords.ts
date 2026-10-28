/**
 * #1906 ([ADR-722](../../docs/06-decisions.md#adr-722), [ADR-W-144](../../docs/06w-decisions-workspace.md#adr-w-144)) —
 * AN AI ANSWER KEEPS EVERY SHAPE AND ROLE WORD THE STUDENT TYPED.
 *
 * The class: *a word the student typed that names a shape property, a cevian role or a circle's direction was
 * never compared with the AI's answer, so an answer that dropped it committed green; and a misspelling hid the
 * word from every gate that does compare.* «משולש שווה צלעת ABC» (a typo for «צלעות») went to the model, the model
 * answered «משולש ABC», and a scalene triangle committed with nothing refused.
 *
 * The operator's ruling (2026-10-08): every shape or role word the student typed must survive into the AI answer's
 * lowering, or the answer is refused, with 2-D's existing dropped-given message. A misspelt word counts as present
 * when the answer carries the property it plausibly names; the AI may still fix the typo.
 *
 * The member has two halves:
 *  - WHERE the words stand: the shared reader (`shell/llm/honestyCore.ts` → `propertyWords`) over this tree's
 *    vocabulary, folds and lexicon. The vocabulary is a canonical-spelling PROJECTION of the grammar's own atoms
 *    (`SHAPE_ADJ_WORDS`, `SHAPE_NOUN_WORDS`, the polygon-name tables, `CEVIAN_NOUNS_*`, the inscription verbs); the
 *    unit test asserts every spelling here is read by its atom, so the two cannot drift apart.
 *  - WHETHER the answer carries each: one evidence family per property, reused from the gate that already owns it —
 *    ADR-595's adjective accounts, the shared quadrilateral lattice for a noun, the materialised ring for a polygon
 *    name, a foot / ⟂ / 90° for an altitude, a midpoint / equal pair / ratio for a median, ADR-292's bisect family for
 *    a bisector, and the grammar's own direction reader (asked of the STUDENT's line) for «חסום» / «חוסם».
 *
 * Per OCCURRENCE (ADR-430 amended): one role's commands never account for another role's word, so «AD גובה ...
 * חוצה זווית» answered «AD חוצה זווית A» names «גובה». Runs on the AI seam only (`submitPipeline.ts`); a typed line's
 * grammar verdict is untouched.
 */
import { type AnyCommand, isQuadKind, quadImplies } from '@/engine';
import { propertyWords, withSpan, type PropertyOccurrence, type PropertyPhrase, type WordReaderSpec } from '../../shell/llm/honestyCore';
import {
  hasDiameter,
  materialisedArities,
  normalizeUtterance,
  polygonNounsAllReferences,
  POLYGON_NAME_ARITY,
  shapeAdjectiveAccounts,
  statedCircleDirection,
  VERB_GATES,
  type ParseContext,
} from './parse';
import { FILLER, KEYWORD_STEMS } from './spanAccounting';
import { SHAPE_NOUN_WORDS } from './shapePhrase';
import { describedCircle, ringOf, ringRoleSpans, type RingSpan } from './ringRoles';

type QuadNounKind = 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'kite';
/** What a property word names. */
export type PropertyWord2 =
  | { kind: 'adj'; adj: 'right' | 'isosceles' | 'equilateral' }
  | { kind: 'noun'; noun: QuadNounKind }
  | { kind: 'ring'; n: number }
  | { kind: 'regular' }
  | { kind: 'altitude' }
  | { kind: 'median' }
  | { kind: 'angle-bisector' }
  | { kind: 'bisect' }
  | { kind: 'direction' };

const P = <T extends PropertyWord2>(p: T): readonly PropertyWord2[] => [p];

/** The literal spellings of one `SHAPE_NOUN_WORDS` atom (its alternatives that are plain words). */
const literals = (atom: string): string[] => atom.split('|').filter((w) => /^[א-תa-z]+$/.test(w));

/**
 * THE VOCABULARY. Every spelling is one the grammar's own atom reads (asserted by the unit test); the polygon names
 * are composed from the parser's tables and the noun words from `SHAPE_NOUN_WORDS`, never re-spelled.
 */
export const PROPERTY_VOCABULARY2: readonly PropertyPhrase<PropertyWord2>[] = [
  // ADR-595's three adjectives (`SHAPE_ADJ_WORDS`)
  { slots: [['ישר'], ['זווית', 'זוית']], props: P({ kind: 'adj', adj: 'right' }) },
  { slots: [['right']], props: P({ kind: 'adj', adj: 'right' }), nearMiss: false }, // "eight", "light", "night" are one edit away
  { slots: [['שווה'], ['שוקיים']], props: P({ kind: 'adj', adj: 'isosceles' }) },
  { slots: [['isosceles']], props: P({ kind: 'adj', adj: 'isosceles' }) },
  { slots: [['שווה'], ['צלעות']], props: P({ kind: 'adj', adj: 'equilateral' }) },
  { slots: [['equilateral']], props: P({ kind: 'adj', adj: 'equilateral' }) },
  // the quadrilateral nouns (`SHAPE_NOUN_WORDS`; English "trapezoid" / "trapezium" are what its `trapez\w*` reads)
  ...(['square', 'rectangle', 'rhombus', 'parallelogram', 'kite'] as const).map((noun) => ({
    slots: [literals(SHAPE_NOUN_WORDS[noun])],
    props: P({ kind: 'noun', noun }),
  })),
  { slots: [[...literals(SHAPE_NOUN_WORDS.trapezoid), 'trapezoid', 'trapezium']], props: P({ kind: 'noun', noun: 'trapezoid' }) },
  // the polygon names: a ring of the noun's size (`SHAPE_NOUN_WORDS.triangle` / `.quad` and the n-gon tables)
  { slots: [literals(SHAPE_NOUN_WORDS.triangle)], props: P({ kind: 'ring', n: 3 }) },
  { slots: [literals(SHAPE_NOUN_WORDS.quad)], props: P({ kind: 'ring', n: 4 }) },
  ...Object.entries(POLYGON_NAME_ARITY).map(([w, n]) => ({ slots: [[w]], props: P({ kind: 'ring', n }) })),
  // «משוכלל» / "regular" (ADR-606's regular ring)
  { slots: [['משוכלל']], props: P({ kind: 'regular' }) },
  { slots: [['regular']], props: P({ kind: 'regular' }) },
  // the cevian roles (`CEVIAN_NOUNS_HE` / `CEVIAN_NOUNS_EN`)
  { slots: [['גובה', 'גבהי']], props: P({ kind: 'altitude' }) },
  { slots: [['altitude']], props: P({ kind: 'altitude' }) },
  { slots: [['height']], props: P({ kind: 'altitude' }), nearMiss: false }, // "eight", "weight"
  { slots: [['תיכון']], props: P({ kind: 'median' }) },
  { slots: [['median']], props: P({ kind: 'median' }) },
  { slots: [['חוצה', 'חוצת', 'חוצי'], ['זווית', 'זוית', 'זוויות']], props: P({ kind: 'angle-bisector' }) },
  { slots: [['angle'], ['bisector']], props: P({ kind: 'angle-bisector' }) },
  { slots: [['bisector', 'bisects', 'bisect']], props: P({ kind: 'bisect' }) },
  // the inscription verbs: which circle («חסום» / «חוסם», "inscribed" / "circumscribed")
  { slots: [['חסום', 'חוסם', 'חוסמת']], props: P({ kind: 'direction' }) },
  { slots: [['inscribed', 'circumscribed', 'circumscribes', 'circumscribe']], props: P({ kind: 'direction' }) },
];

const MEDIAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** 2-D's folds: case, final letters to medial (spanAccounting's `medialStem`, every letter), «וו» / «יי» to one. */
const fold = (w: string): string => w.toLowerCase().replace(/[ךםןףץ]/g, (c) => MEDIAL[c]).replace(/וו/g, 'ו').replace(/יי/g, 'י');
const HE_INFLECTIONS = ['ים', 'ות', 'ה', 'ו', 'י', 'ית', 'יות'];
const EN_INFLECTIONS = ['s', 'es', 'd', 'ed', 'ing'];
const STEMS = KEYWORD_STEMS.map((w) => fold(w));
const FILLERS = new Set([...FILLER].map((w) => fold(w)));
const INFLECTIONS = [...HE_INFLECTIONS, ...EN_INFLECTIONS].map((w) => fold(w));

/** The span accountant's lexicon, as a WORD test: a stem itself or a stem plus one closed inflection, or filler. */
const SPEC: WordReaderSpec = {
  fold,
  clitics: 'והבלמשכ',
  inflections: [...HE_INFLECTIONS, ...EN_INFLECTIONS],
  readsWord: (word) =>
    [fold(word), ...[1, 2].flatMap((n) => (new RegExp(`^[והבלמשכ]{${n}}`).test(word) && word.length > n + 1 ? [fold(word.slice(n))] : []))].some(
      (w) => FILLERS.has(w) || STEMS.some((s) => w === s || INFLECTIONS.some((i) => w === s + i)),
    ),
};

/** The property words of a line, with the spelt-right line each candidate stands for. */
export function propertyOccurrences2(utterance: string): PropertyOccurrence<PropertyWord2>[] {
  return propertyWords(utterance, PROPERTY_VOCABULARY2, SPEC);
}

const ANGLE_BISECT_TYPES = new Set(['bisector', 'set-angle-ratio', 'arc-midpoint']);
const BISECT_GATE = VERB_GATES.find((g) => g.verb === 'חוצה/bisect');
const ALTITUDE_TYPES = new Set(['foot', 'set-perpendicular', 'perpendicular', 'perpendicular-line', 'altitude-choice', 'right-triangle']);
const MEDIAN_TYPES = new Set(['midpoint', 'set-equal', 'set-ratio', 'ratio']);
const LETTERED = /^[A-Z]\d*$/;

/** The quadrilateral kinds a lowering declares a ring as (its command type, `declaredAs`, a trapezoid's `kind`, …). */
function declaredQuadKinds(commands: AnyCommand[]): string[] {
  const out: string[] = [];
  for (const c of commands) {
    if (isQuadKind(c.type)) out.push(c.type);
    if (c.type === 'quadrilateral' && c.declaredAs) out.push(c.declaredAs);
    if (c.type === 'trapezoid' && 'kind' in c && typeof c.kind === 'string') out.push(c.kind);
    if (c.type === 'shape-variant' && c.shape === 'kite') out.push('kite');
    if (c.type === 'inscribe') out.push(c.shape);
  }
  // Thales: a ring of four on one circle with two diameters is a rectangle
  if (hasDiameter(commands) && materialisedArities(commands).has(4)) out.push('rectangle');
  return out.filter(isQuadKind);
}

/** An evenly spaced ring on one circle — the regular polygon's lowering (ADR-606). */
function evenRing(commands: AnyCommand[]): boolean {
  const byCircle = new Map<string, number[]>();
  for (const c of commands) if (c.type === 'point-on-circle' && typeof c.theta === 'number') byCircle.set(c.circle, [...(byCircle.get(c.circle) ?? []), c.theta]);
  for (const th of byCircle.values()) {
    if (th.length < 3) continue;
    const s = [...th].map((t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
    const step = (2 * Math.PI) / s.length;
    if (s.every((t, i) => Math.abs(((i + 1 < s.length ? s[i + 1] : s[0] + 2 * Math.PI) - t) - step) < 1e-6)) return true;
  }
  return false;
}

/** Does the answer carry property `p`, as the student's line (spelt right: `line`) states it? */
function carries(p: PropertyWord2, commands: AnyCommand[], line: string, occ: { start: number; text: string }, ctx: ParseContext, typed: string = line): boolean {
  const has = (types: ReadonlySet<string>) => commands.some((c) => types.has(c.type));
  switch (p.kind) {
    case 'adj':
      return shapeAdjectiveAccounts(commands)[p.adj]();
    case 'noun': {
      const want = p.noun;
      return declaredQuadKinds(commands).some((have) => isQuadKind(have) && quadImplies(have, want));
    }
    case 'ring':
      return materialisedArities(commands).has(p.n);
    case 'regular': {
      const acc = shapeAdjectiveAccounts(commands);
      return evenRing(commands) || acc.equilateral() || commands.some((c) => c.type === 'square');
    }
    case 'altitude':
      return has(ALTITUDE_TYPES) || commands.some((c) => c.type === 'set-angle' && Math.abs(c.value - 90) < 1e-9);
    case 'median':
      return has(MEDIAN_TYPES) || commands.some((c) => c.type === 'point-on-segment' && 't' in c && c.t === 0.5);
    case 'angle-bisector':
      return has(ANGLE_BISECT_TYPES) || commands.some((c) => c.consumed?.verbs?.includes('חוצה/bisect'));
    case 'bisect':
      // "bisector" after "perpendicular" is the perpendicular bisector, not an angle's
      if (/perpendicular\s*$/i.test(line.slice(0, occ.start))) return true;
      return !!BISECT_GATE && commands.some((c) => c.consumed?.verbs?.includes(BISECT_GATE.verb) || BISECT_GATE.satisfied.test(JSON.stringify(c)));
    case 'direction': {
      // a direction is a CIRCLE's: a polygon inscribed in a polygon is the `inscribe` command's own
      if (!/מעגל|circle/i.test(line) || commands.some((c) => c.type === 'inscribe')) return true;
      // a definite reference to a circle already drawn («המעגל החוסם», "the circumscribed circle")
      const definite = /^ה/.test(occ.text) || /(?:^|\s)המעגל\s*$|\bthe\s+(?:circle\s+)?$/i.test(line.slice(0, occ.start));
      // #2545 (ADR-768): …in ARGUMENT position («DE מיתר במעגל החוסם») it names the DESCRIBED circle, so the answer must
      // bind that circle — not merely some circle (an answer on an unrelated circle, or on the incircle, dropped the word)
      const span = definite ? ringRoleSpans(typed).find((sp) => occ.start >= sp.at && occ.start < sp.end) : undefined;
      if (span) return bindsDescribed(span, commands, ctx);
      if ((ctx.circles?.length ?? 0) > 0 && definite) return true;
      const dir = statedCircleDirection(normalizeUtterance(line));
      if (dir === 'in') return commands.some((c) => c.type === 'bisector' || c.type === 'tangent');
      return commands.some(
        (c) =>
          c.type === 'circumcircle' || c.type === 'set-concyclic' ||
          (c.type === 'point-on-circle' && LETTERED.test(c.id)) ||
          (c.type === 'circle-through' && LETTERED.test(c.through)),
      ) || hasDiameter(commands);
    }
  }
}

/**
 * #2545 (ADR-768): does the answer bind the circle a relation span describes — the drawn one (`describedCircle`, the
 * parse-boundary reader's own predicate, over the figure the answer is added to), or one the answer itself builds as
 * that ring's circumcircle / incircle? Every circle the answer places something on must be it.
 */
function bindsDescribed(span: RingSpan, commands: AnyCommand[], ctx: ParseContext): boolean {
  const ring = ringOf(span, ctx);
  if (!('ring' in ring)) return false;
  const want = describedCircle(span.relation, ring.ring, ctx)?.id;
  const inRing = (x: unknown) => typeof x === 'string' && ring.ring.includes(x);
  const cmds = commands as unknown as Record<string, unknown>[];
  const bisectorsAtRing = new Set(cmds.filter((c) => c.type === 'bisector' && inRing(c.vertex)).map((c) => c.id));
  const incentres = new Set(cmds.filter((c) => c.type === 'line-intersection' && bisectorsAtRing.has(c.line1) && bisectorsAtRing.has(c.line2)).map((c) => c.id));
  const made = new Set(
    cmds.flatMap((c) =>
      span.relation === 'circum'
        ? c.type === 'circumcircle' && [c.a, c.b, c.c].every(inRing) ? [c.id] : []
        : (c.type === 'circle-through' || c.type === 'circle') && incentres.has(c.center) ? [c.id] : [],
    ),
  );
  const refs = cmds.flatMap((c) => Object.entries(c).flatMap(([k, v]) => (k !== 'id' && typeof v === 'string' && v.startsWith('circle-') ? [v] : [])));
  if (refs.length === 0) return made.size > 0;
  return refs.every((id) => id === want || made.has(id));
}

const SHAPE_CLASS = new Set<PropertyWord2['kind']>(['adj', 'noun', 'ring', 'regular']);
const ROLE_CLASS = new Set<PropertyWord2['kind']>(['altitude', 'median', 'angle-bisector', 'bisect']);

/**
 * The shape and role words of `utterance` the AI answer's `commands` do not carry, as the student typed them.
 * `ctx` is the figure the answer is added to: a shape word whose polygon nouns are all REFERENCES (ADR-595's
 * exemption) restates, and is not demanded. `skip`: properties another gate on the same seam already names in its
 * own words (ADR-292's «חוצה/bisect»), so one statement is never named twice.
 */
export function droppedPropertyWords(
  utterance: string,
  commands: AnyCommand[],
  ctx: ParseContext,
  opts: { skip?: readonly PropertyWord2['kind'][] } = {},
): string[] {
  const occs = propertyOccurrences2(utterance);
  if (occs.length === 0) return [];
  // the line spelt right: every occurrence written as its first candidate
  let spelt = utterance;
  for (const o of [...occs].reverse()) spelt = withSpan(spelt, o.start, o.end, o.candidates[0].canonical);
  const shapeExempt = polygonNounsAllReferences(normalizeUtterance(spelt), ctx);
  const drawn = new Set((ctx.points ?? []).map((p) => p.toUpperCase()));
  const out: string[] = [];
  for (const o of occs) {
    // a DEFINITE role noun naming a segment already drawn («הגובה AB = 5») refers to it, as a definite polygon noun does
    const roleReference = /^ה/.test(o.text) && ((m) => !!m && [m[1], m[2]].every((l) => drawn.has(l)))(utterance.slice(o.end).match(/^\s*([A-Z]\d*)([A-Z]\d*)(?![A-Za-z\d])/));
    const ok = o.candidates.some(({ phrase, canonical }) =>
      phrase.props.some((p) => {
        if (opts.skip?.includes(p.kind)) return true;
        if (SHAPE_CLASS.has(p.kind) && shapeExempt) return true;
        if (ROLE_CLASS.has(p.kind) && roleReference) return true;
        const line = withSpan(utterance, o.start, o.end, canonical);
        return carries(p, commands, line, o, ctx, utterance);
      }),
    );
    if (!ok) out.push(o.text);
  }
  return out.filter((x, i, a) => a.indexOf(x) === i);
}
