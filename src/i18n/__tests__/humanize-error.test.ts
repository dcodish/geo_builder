import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { humanizeError, sanitizeIds, translateConstraintWords, translateParams, type Translate } from '@/i18n/humanizeError';
import { describeConstraint } from '@/engine/solve';
import type { Constraint } from '@/engine/types';

// Use the real configured i18n instance (Hebrew-pinned, as the app runs) so the test
// exercises the actual key → message resolution, not a stub.
const t: Translate = (k, o) => i18n.t(k, o) as string;

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * Every CURRENT engine error shape (catalogued from evaluate.ts / step.ts / geoStore.ts)
 * must humanise to a Hebrew message that still carries its dynamic data. If a new error
 * site is added to the engine, add its raw shape here so coverage stays complete.
 */
const CASES: { raw: string; contains: string[] }[] = [
  // step.ts danglingCircleError (#186) — a reference to a circle that doesn't exist
  { raw: "circle 'O2' is not defined", contains: ['O2'] },
  { raw: 'unresolved dependencies for: A, B, circle-O', contains: ['A, B, O'] },
  { raw: 'non-finite position computed', contains: [] },
  { raw: '|AB| = |AD| references an unknown point', contains: ['|AB| = |AD|'] },
  { raw: 'over-constrained: |AC| = 9 cannot hold', contains: ['|AC| = 9'] },
  { raw: 'over-constrained: ∠DOE = 2·∠COE cannot hold', contains: ['∠DOE = 2·∠COE'] },
  // replay/core.ts (#855, ADR-476) — the SAMPLED-VALUE degradation of the two rows above: the ids it
  // names are the still-free objects, so they must survive `sanitizeIds` as the student's letters.
  {
    raw: 'not determined: @ctr-O, A are still free, so @ctr-OB ⟂ AB cannot be judged in this configuration',
    contains: ['O, A', 'OB ⟂ AB'],
  },
  { raw: 'not determined: |AC| = 9 cannot be judged in this configuration', contains: ['|AC| = 9'] },
  { raw: 'cannot place F on segment AB so that |AC| = 9', contains: ['F', 'AB', '|AC| = 9'] },
  {
    raw: 'cannot place E: line line-CA is tangent to circle circle-O at A — it has no second crossing to extend onto',
    contains: ['E'],
  },
  { raw: 'cannot place E: B is at the centre of circle-O', contains: ['E', 'B'] },
  { raw: 'cannot take a tangent at the centre of circle-O', contains: ['O'] },
  { raw: 'cannot construct A: circles circle-O and circle-P do not meet', contains: ['A', 'O', 'P'] },
  { raw: 'C and E would be at the same point', contains: ['C', 'E'] },
  { raw: "'O' is already defined — it can't be redefined as something different", contains: ['O'] },
  { raw: 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)', contains: [] },
  { raw: "can't build: D is no longer available (an earlier step it relies on was removed or failed)", contains: ['D'] },
  // step.ts degenerateConstraintError (ADR-202 + Am.) — the whole NaN-by-id class
  { raw: '⟂ needs two distinct points on each side — "BB" is a single point, not a segment', contains: ['⟂', 'BB'] },
  { raw: '∥ needs two distinct points on each side — "CC" is a single point, not a segment', contains: ['∥', 'CC'] },
  { raw: 'an angle needs three distinct points — "∠ABB" repeats its vertex', contains: ['∠ABB'] },
  { raw: 'collinear points must be distinct — "A" is named twice', contains: ['A'] },
];

describe('humanizeError', () => {
  for (const { raw, contains } of CASES) {
    it(`humanises: ${raw.slice(0, 50)}…`, () => {
      const out = humanizeError(raw, t);
      expect(out).not.toBe(raw); // it was actually translated, not passed through
      expect(hasHebrew(out)).toBe(true); // …into Hebrew
      expect(out).not.toContain('errors.'); // the i18n key resolved (no missing-key leak)
      for (const frag of contains) expect(out).toContain(frag); // dynamic data preserved
    });
  }

  it('returns an unrecognised string UNCHANGED (never worse than the raw text)', () => {
    const novel = 'some brand-new engine diagnostic we have not mapped yet';
    expect(humanizeError(novel, t)).toBe(novel);
  });

  it('handles null / empty input', () => {
    expect(humanizeError(null, t)).toBe('');
    expect(humanizeError('', t)).toBe('');
  });
});

describe('#200 — sanitizeIds: internal object ids + raw floats never reach the student', () => {
  it('strips named-object id PREFIXES to the student letters', () => {
    expect(sanitizeIds('line sec-KE does not meet circle circle-O')).toBe('line KE does not meet circle O');
    expect(sanitizeIds('line chord-CA is tangent to circle circle-O at A')).toBe('line CA is tangent to circle O at A');
    expect(sanitizeIds('@ctr-O')).toBe('O');
  });
  it('rounds a raw 16-digit float to display precision (#164 sibling)', () => {
    expect(sanitizeIds('|OB| = 1.0583005244258363·|OC| cannot hold')).toBe('|OB| = 1.06·|OC| cannot hold');
  });
  it('suppresses anonymous ~-scaffold ids (a helper point the student never named)', () => {
    expect(sanitizeIds('cannot construct ~A: something')).toBe('cannot construct ⟨…⟩: something');
    expect(sanitizeIds('|P~radw-circle-P|')).toBe('|P⟨…⟩|');
  });
  it('the operator-reported messages carry NO internal id after humanizing', () => {
    for (const raw of [
      'cannot construct ~A: line sec-KE does not meet circle circle-O',
      'cannot place ~E: line chord-CA is tangent to circle circle-O',
      'over-constrained: |OB| = 1.0583005244258363·|P~radw-circle-P| cannot hold',
    ]) {
      const out = humanizeError(raw, t);
      expect(out, `leaked in: ${out}`).not.toMatch(/~|@|circle-|sec-|chord-|radw|\.\d{3,}/);
    }
  });
});

/**
 * #413 — the CONSTRAINT VOCABULARY is fully translated.
 *
 * The fixture is a `Record` over every `Constraint['type']`, so adding a constraint kind to the engine
 * fails the BUILD until it is described here — the totality guard that keeps this from regressing to
 * "one more word leaked". The assertion is a property, not a word list: after humanising, no run of two
 * or more LOWERCASE Latin letters may survive. Point labels are uppercase and a radius symbol is a single
 * letter (`r`/`R`, ADR-304), so any multi-letter lowercase run is by construction an untranslated word.
 */
const ONE_OF_EACH: Record<Constraint['type'], Constraint> = {
  angle: { type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 },
  distance: { type: 'distance', a: 'A', b: 'B', value: 5 },
  equal: { type: 'equal', a: 'A', b: 'B', c: 'C', d: 'D' },
  ratio: { type: 'ratio', a: 'A', b: 'B', c: 'C', d: 'D', k: 2 },
  parallel: { type: 'parallel', a: 'A', b: 'B', c: 'C', d: 'D' },
  perpendicular: { type: 'perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' },
  'angle-ratio': { type: 'angle-ratio', a1: 'A', v1: 'B', b1: 'C', a2: 'D', v2: 'E', b2: 'F', k: 2 },
  coincide: { type: 'coincide', p: 'P', q: 'Q' },
  'angle-order': { type: 'angle-order', a1: 'A', v1: 'B', b1: 'C', a2: 'D', v2: 'E', b2: 'F' },
  'length-order': { type: 'length-order', a: 'A', b: 'B', c: 'C', d: 'D' },
  concyclic: { type: 'concyclic', points: ['A', 'B', 'C', 'D'] },
  collinear: { type: 'collinear', a: 'H', b: 'C', c: 'D' },
  'collinear-order': { type: 'collinear-order', points: ['A', 'B', 'C'] },
  'angle-bound': { type: 'angle-bound', vertex: 'B', ray1: 'A', ray2: 'C', min: 40, max: 60 },
  'length-bound': { type: 'length-bound', a: 'A', b: 'B', max: 5 },
  'length-radius': { type: 'length-radius', a: 'A', b: 'B', circle: 'circle-O', center: 'O', witness: 'A', k: 1 },
  area: { type: 'area', ids: ['A', 'B', 'C'], value: 13 },
  'area-ratio': { type: 'area-ratio', ids1: ['A', 'B', 'C'], ids2: ['D', 'E', 'F'], k: 2 },
  perimeter: { type: 'perimeter', ids: ['A', 'B', 'C'], value: 20 },
  'perimeter-ratio': { type: 'perimeter-ratio', ids1: ['A', 'B', 'C'], ids2: ['D', 'E', 'F'], k: 2 },
  'measure-sum': { type: 'measure-sum', unit: 'length', points: ['A', 'B', 'C', 'D'], coefs: [1, 1], target: 10 },
  'length-product': { type: 'length-product', lhs: ['A', 'B', 'C', 'D'], rhs: ['E', 'F', 'G', 'H'], k: 1 },
};

describe('#413 — no English word survives in a student-facing message', () => {
  const LOWERCASE_RUN = /[a-z]{2,}/;

  for (const [kind, con] of Object.entries(ONE_OF_EACH)) {
    it(`${kind}: its description is fully translated inside a refusal`, () => {
      const desc = describeConstraint(con);
      const msg = humanizeError(`over-constrained: ${desc} cannot hold`, t);
      expect(hasHebrew(msg), `«${msg}» is Hebrew`).toBe(true);
      const leak = msg.match(LOWERCASE_RUN);
      expect(leak, `«${msg}» still contains the English word "${leak?.[0]}" (from «${desc}»)`).toBeNull();
    });
  }

  it('the reported message reads fully in Hebrew', () => {
    const msg = humanizeError('over-constrained: H, C, D collinear cannot hold', t);
    expect(msg).toContain('H, C, D');
    expect(msg).toContain(i18n.t('errors.desc.collinear') as string);
    expect(msg).not.toContain('collinear');
  });

  it('a WRAPPER that keys on the same word still matches its own pattern', () => {
    // «collinear points must be distinct — "A" is named twice» must not be broken by the pass:
    // patterns are matched BEFORE the vocabulary is translated, exactly so this keeps working.
    const msg = humanizeError('collinear points must be distinct — "A" is named twice', t);
    expect(hasHebrew(msg)).toBe(true);
    expect(msg).toContain('A');
    expect(msg).not.toMatch(LOWERCASE_RUN);
  });

  it('the verifier params path is translated too', () => {
    const out = translateParams({ desc: 'H, C, D collinear' }, t);
    expect(out?.desc).not.toContain('collinear');
    expect(out?.desc).toContain('H, C, D');
    // a non-fragment param is untouched
    expect(translateParams({ center: 'O2' }, t)?.center).toBe('O2');
  });

  it('symbolic fragments are left alone (they are locale-neutral)', () => {
    for (const raw of ['|AC| = 9', '∠DOE = 2·∠COE', 'AB ∥ CD', 'AB ⟂ CD']) {
      expect(translateConstraintWords(raw, t), raw).toBe(raw);
    }
  });
});
