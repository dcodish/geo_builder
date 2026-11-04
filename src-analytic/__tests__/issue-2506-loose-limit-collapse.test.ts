/**
 * #2506 ([ADR-AG-399](../../docs/06c-decisions-analytic.md#adr-ag-399); ADR-W-146, the analytic twin of 2-D's ADR-764 arm A
 * and 3-D's ADR-3D-378) — GIVENS THAT HOLD ONLY WHERE TWO NAMED POINTS MEET ARE REFUSED, DECLARED RING OR NOT.
 *
 * «נקודה A» · «נקודה B» · «נקודה C» · «AB = BC» · «AC ⊥ BC» has no triangle in it: AC ⊥ BC with AB = BC makes AB the
 * hypotenuse of a right triangle equal to its own leg, so C must sit on A. The thin-ring arm (#1334, ADR-AG-143) asked the
 * tolerance question only of a DECLARED ring, so three loose points were drawn green with C 3.9e-4 of the extent from A.
 * The trigger now reads every constraint's operand pairs (`constraintOperandPairs`), and the refusal is 2-D's
 * over-constraint sentence naming both statements.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { constraintOperandPairs } from '../engine/rings';
import type { Constraint } from '../engine/solve';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Type `lines` one by one at `seed`, as the app does: every line but the last must record; the last line's verdict. */
function typed(lines: readonly string[], seed: number) {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» at seed ${seed} is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return { held, verdict: decideSubmit(lines[lines.length - 1], held, seed) };
}

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const LOOSE = ['נקודה A', 'נקודה B', 'נקודה C'];

/** [name, the lines, the earlier statement the refusal names] — the last line completes the contradiction. */
const MEMBERS: Array<[string, string[], string]> = [
  ['the report', [...LOOSE, 'AB = BC', 'AC ⊥ BC'], 'AB = BC'],
  ['the givens in the other order', [...LOOSE, 'AC ⊥ BC', 'AB = BC'], 'AC ⊥ BC'],
  ['the angle form', [...LOOSE, 'AB = BC', '∠ACB = 90'], 'AB = BC'],
  ['the numeric twin', [...LOOSE, 'AB = 5', 'BC = 5', 'AC ⊥ BC'], 'BC = 5'],
  ['the other leg', [...LOOSE, 'AC = BC', 'AB ⊥ AC'], 'AC = BC'],
  ['two segments', ['קטע AB', 'קטע BC', 'AB = BC', 'AC ⊥ BC'], 'AB = BC'],
  ['A pinned, B and C loose', ['A(0,0)', 'נקודה B', 'נקודה C', 'AB = BC', 'AC ⊥ BC'], 'AB = BC'],
];

describe('#2506 — the loose-point members are refused at their last line, naming both statements', () => {
  it.each(MEMBERS)('%s', (_name, lines, partner) => {
    const last = lines[lines.length - 1];
    for (const seed of SEEDS) {
      const { verdict } = typed(lines, seed);
      expect(verdict.kind, `seed ${seed}`).toBe('refused');
      if (verdict.kind !== 'refused') continue;
      expect(verdict.error, `seed ${seed}`).toMatchObject({ key: 'measure-contradicts', detail: last, declared: partner, what: last });
    }
  });

  it('the Hebrew and the English name the completing line, its partner and the reason', () => {
    const { verdict } = typed(MEMBERS[0][1], 0);
    if (verdict.kind !== 'refused') throw new Error('expected a refusal');
    expect(errorText(verdict.error, he)).toBe('לא ניתן: «AC ⊥ BC» סותר את «AB = BC» — אי אפשר לקיים את שניהם יחד. הסיבה: AC ⊥ BC.');
    expect(errorText(verdict.error, en)).toBe('Can\'t do that: «AC ⊥ BC» contradicts «AB = BC» — they can\'t both hold. The reason: AC ⊥ BC.');
  });

  it('the refusal keeps the prior figure: the lines before the last all recorded', () => {
    const { held } = typed(MEMBERS[0][1], 0);
    expect(held).toEqual(['נקודה A', 'נקודה B', 'נקודה C', 'AB = BC']);
  });
});

/** Genuine figures, some with a pair inside the trigger band — they must survive the tight re-solve. */
const CONTROLS: Array<[string, string[]]> = [
  ['the right angle at B', [...LOOSE, 'AB = BC', 'AB ⊥ BC']],
  ['a thin triangle at 4.5e-2', [...LOOSE, 'AB = 10', 'BC = 9.99', 'AC ⊥ BC']],
  ['a thin triangle at 4.5e-3, inside the band', [...LOOSE, 'AB = 10', 'BC = 9.9999', 'AC ⊥ BC']],
  ['a 2-1 right triangle', [...LOOSE, 'AB = 2', 'BC = 1', 'AC ⊥ BC']],
];

describe('#2506 — real figures stay green', () => {
  it.each(CONTROLS)('%s', (_name, lines) => {
    for (const seed of SEEDS) expect(typed(lines, seed).verdict.kind, `seed ${seed}`).toBe('record');
  });
});

describe('#2506 — a declared ring keeps its own sentence', () => {
  it.each([
    ['משולש ABC', 'AB = BC', 'AC ⊥ BC'],
    ['מרובע ABCD', 'AB = BC', 'AC ⊥ BC'],
  ])('%s', (...lines) => {
    for (const seed of [0, 1, 2]) {
      const { verdict } = typed(lines, seed);
      expect(verdict.kind === 'refused' && verdict.error.key, `seed ${seed}`).toBe('polygon-collapsed');
    }
  });
});

describe('#2506 — the operand-pair reader', () => {
  it('reads each kind by its meaning', () => {
    const pts = (a: string, b: string) => ({ k: 'points' as const, a, b });
    const cases: Array<[Constraint, [string, string][]]> = [
      [{ t: 'relation', rel: 'perpendicular', u: pts('A', 'C'), v: pts('B', 'C') }, [['A', 'C'], ['B', 'C']]],
      [{ t: 'perpendicular', a: 'A', b: 'D', c: 'B', d: 'C' }, [['A', 'D'], ['B', 'C']]],
      [{ t: 'angle', at: { v: 'C', a: 'A', b: 'B' }, value: { kind: 'num', value: 90 } }, [['C', 'A'], ['C', 'B']]],
      [{ t: 'midpoint', id: 'M', a: 'A', b: 'B' }, [['A', 'B']]],
      [{ t: 'on-line-2pt', id: 'D', a: 'B', b: 'C' }, []],
      [{ t: 'coord', id: 'A' }, []],
      [{ t: 'area', ids: ['A', 'B', 'C'], value: { kind: 'num', value: 6 } }, []],
    ];
    for (const [k, want] of cases) expect(constraintOperandPairs(k), k.t).toEqual(want);
  });
});
