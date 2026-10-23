import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { humanizeError, humanizeErrorOutcome, PATTERNS, sanitizeIds, translateConstraintWords, translateParams, type Translate } from '@/i18n/humanizeError';
import { describeConstraint } from '@/engine/solve';
import { applyCommand } from '@/engine/apply';
import { diagonalClaimRefusal } from '@/engine/step';
import type { Constraint } from '@/engine/types';
import { stripFormatControls } from '../../../shell/bidi';
import { CASES } from './fixtures/humanize-cases';

// Use the real configured i18n instance (Hebrew-pinned, as the app runs) so the test
// exercises the actual key → message resolution, not a stub.
const t: Translate = (k, o) => i18n.t(k, o) as string;

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

describe('humanizeError', () => {
  for (const { raw, contains } of CASES) {
    it(`humanises: ${raw.slice(0, 50)}…`, () => {
      const out = humanizeError(raw, t);
      expect(out).not.toBe(raw); // it was actually translated, not passed through
      expect(humanizeErrorOutcome(raw, t).floor, 'a known message must render its own key, not the #2028 floor').toBe(false);
      expect(hasHebrew(out)).toBe(true); // …into Hebrew
      expect(out).not.toContain('errors.'); // the i18n key resolved (no missing-key leak)
      for (const frag of contains) expect(out).toContain(frag); // dynamic data preserved
    });
  }

  // #2028 (ADR-W-130, the operator's ruling of 2026-10-13) supersedes "returned UNCHANGED": unmatched engine text
  // renders the floor sentence, never the raw English. The full lock is humanize-floor.test.ts.
  it('an unrecognised string renders the floor sentence, never the raw text', () => {
    const novel = 'some brand-new engine diagnostic we have not mapped yet';
    expect(humanizeError(novel, t)).toBe(i18n.t('errors.floor'));
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
      // #2028: the floor is Hebrew with no English word too, so this row must prove it reached the ruled frame
      expect(humanizeErrorOutcome(`over-constrained: ${desc} cannot hold`, t).floor, `«${desc}» fell to the floor`).toBe(false);
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

  it('#2112: a radius relation (a ratio carrying radii) is translated with its circle letters, in both locales', () => {
    const desc = describeConstraint({ type: 'ratio', a: 'O', b: 'A', c: 'P', d: 'B', k: 2, radii: { c1: 'circle-O', c2: 'circle-P' } });
    const he = stripFormatControls(humanizeError(`over-constrained: ${desc} cannot hold`, t));
    expect(he).toContain('רדיוס מעגל O = 2 · רדיוס מעגל P');
    expect(he).not.toMatch(LOWERCASE_RUN);
    const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;
    expect(stripFormatControls(humanizeError(`over-constrained: ${desc} cannot hold`, en))).toContain('radius of circle O = 2 · radius of circle P');
  });

  it('symbolic fragments are left alone (they are locale-neutral)', () => {
    for (const raw of ['|AC| = 9', '∠DOE = 2·∠COE', 'AB ∥ CD', 'AB ⟂ CD']) {
      expect(translateConstraintWords(raw, t), raw).toBe(raw);
    }
  });
});

/**
 * #983 (ADR-500) — THE JOIN BETWEEN THE TWO FILES IS ITSELF TESTED.
 *
 * Every entry in `PATTERNS` is a hand-written copy of a string the engine emits. A typo in either half
 * degrades SILENTLY to English on a Hebrew screen, and the UI still "works" — which is how ADR-499's two
 * refusals shipped broken and why the operator, not a test, found them. The commit that added them even
 * verified that the i18n keys existed; it never asserted that a pattern matched its message.
 *
 * So the table is not allowed to carry an entry no real message exercises. A dead pattern is either a
 * typo (this bug) or a message that no longer exists (dead code) — both are worth failing on, and both
 * are invisible without this gate.
 */
describe('#983 — every humanize pattern is exercised by a real engine message', () => {
  /** Which table entries a raw message reaches — the same scan `humanizeError` itself performs. */
  const firstMatching = (raw: string) => PATTERNS.findIndex((p) => sanitizeIds(raw.trim()).match(p.re) !== null);

  it('the CASES corpus covers EVERY pattern in the table', () => {
    const covered = new Set(CASES.map(({ raw }) => firstMatching(raw)).filter((i) => i >= 0));
    const dead = PATTERNS.map((p, i) => ({ i, key: p.key }))
      .filter(({ i }) => !covered.has(i))
      .map(({ i, key }) => `#${i} ${key}`);
    expect(
      dead,
      `these patterns match no message in CASES — either the regex is wrong (it will silently render ` +
        `English) or the engine no longer emits that shape:\n${dead.join('\n')}`,
    ).toEqual([]);
  });

  it('every CASES row reaches a pattern (no row silently falls through)', () => {
    const missed = CASES.filter(({ raw }) => firstMatching(raw) < 0).map(({ raw }) => raw);
    expect(missed, `no pattern matches:\n${missed.join('\n')}`).toEqual([]);
  });

  it('the gate is measuring something (an empty table or corpus would pass by checking nothing)', () => {
    // The #909/#174 lesson: a lock whose subject can be empty passes green while asserting nothing.
    expect(PATTERNS.length).toBeGreaterThan(20);
    expect(CASES.length).toBeGreaterThan(20);
  });

  it('THE REPORTED DEFECT: both diagonal refusals render in Hebrew, not English', () => {
    // The operator's own words, round #974 T5: "the message is mixed hebrew and english and should be
    // hebrew only". Asserted against the SHIPPED Hebrew strings, not merely "not the raw message".
    const side = humanizeError('AB is not a diagonal of ABCD — it is a side', t);
    expect(side).toBe(i18n.t('errors.diagonalIsSide', { pair: 'AB', shape: 'ABCD' }));
    expect(side).not.toContain('is not a diagonal');
    expect(hasHebrew(side)).toBe(true);

    const none = humanizeError('AB is not a diagonal — ABC has no diagonals', t);
    expect(none).toBe(i18n.t('errors.diagonalNoneHere', { pair: 'AB', shape: 'ABC' }));
    expect(none).not.toContain('has no diagonals');
    expect(hasHebrew(none)).toBe(true);
  });
});

/**
 * #983 (ADR-500) — THE ENGINE'S OWN OUTPUT, not a copy of it.
 *
 * The gate above closes the join between the pattern table and `CASES`. But `CASES` rows are themselves
 * hand-written copies of engine strings, so the loop is only really closed when the string under test is
 * the one `step.ts` PRODUCES. That is the difference between "the table agrees with a copy" and "the
 * table agrees with the engine" — and the copy is exactly where ADR-499's drift could hide next time,
 * because a message reworded in `step.ts` would leave both this file and the table untouched.
 *
 * So the reported refusals are taken straight from the engine and pushed through the display layer.
 */
describe('#983 — the diagonal refusals humanise the string the ENGINE emits', () => {
  const build = (cmds: Parameters<typeof applyCommand>[1][]) =>
    cmds.reduce((c, cmd) => applyCommand(c, cmd), { objects: [], constraints: [] } as Parameters<typeof applyCommand>[0]);

  it('«מלבן ABCD» · «אלכסון AB» — a SIDE named as a diagonal reads in Hebrew', () => {
    const raw = diagonalClaimRefusal(build([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }]), {
      type: 'segment',
      a: 'A',
      b: 'B',
      diagonal: true,
    });
    expect(raw, 'the engine still refuses it').not.toBeNull();
    const shown = humanizeError(raw, t);
    expect(shown).toBe(i18n.t('errors.diagonalIsSide', { pair: 'AB', shape: 'ABCD' }));
    expect(hasHebrew(shown)).toBe(true);
    expect(shown, `the operator’s report: no English in a Hebrew refusal`).not.toMatch(/[a-z]{2,}/);
  });

  it('«משולש ABC» · «אלכסון AB» — a shape with no diagonals reads in Hebrew (the T4 twin)', () => {
    const raw = diagonalClaimRefusal(build([{ type: 'triangle', ids: ['A', 'B', 'C'] }]), {
      type: 'segment',
      a: 'A',
      b: 'B',
      diagonal: true,
    });
    expect(raw).not.toBeNull();
    const shown = humanizeError(raw, t);
    expect(shown).toBe(i18n.t('errors.diagonalNoneHere', { pair: 'AB', shape: 'ABC' }));
    expect(hasHebrew(shown)).toBe(true);
    expect(shown).not.toMatch(/[a-z]{2,}/);
  });
});

/**
 * #1470 (ADR-549) — the SIDE-STATEMENT vocabulary is fully translated. The wire is ADR-540's
 * `impossible: X contradicts Y`, with both halves the student's own worded statements; every phrase
 * `sideImpossibility` can emit is listed here, and the #413 property holds for each.
 */
describe('#1470 — a side contradiction reads fully in Hebrew', () => {
  const STATEMENTS = [
    'E on circle O',
    'E outside circle O',
    'E inside circle O',
    'O is the centre of circle O',
    'E on segment AB',
    'E on line AB',
    'M is the midpoint of AB',
    'A is a vertex of ABC',
    'E outside triangle ABC',
    'E inside triangle ABC',
    'E outside polygon ABCD',
    'E inside polygon ABCD',
    'C, D on different sides of AB',
    'C, D on the same side of AB',
  ];
  for (const st of STATEMENTS) {
    it(`«${st}»`, () => {
      const shown = humanizeError(`impossible: «${st}» contradicts «E outside circle O»`, t);
      expect(hasHebrew(shown)).toBe(true);
      expect(shown, `«${shown}» leaks English`).not.toMatch(/[a-z]{2,}/);
    });
  }
  it('the operator’s sequence renders as one sentence naming both statements', () => {
    expect(humanizeError('impossible: «E on circle O» contradicts «E outside circle O»', t).replace(/[⁦-⁩]/g, '')).toBe(
      'לא ייתכן: «E על המעגל O» סותר את «E מחוץ למעגל O» — שני הנתונים אינם יכולים להתקיים יחד באף שרטוט. בדקו את הנתונים.',
    );
  });
});
