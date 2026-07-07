/**
 * GATE — 2026 קיץ מועד ב Q2 (the operator's target question): square-base pyramid,
 * AS the height, |AS| = side, E at ¾ along SD, N = S + k·SC, the abs-value given
 * |EN| = (√6/4)·|w| pinning k (a TOUCH root — the exam states |EN|'s minimum, so
 * k=½ is a double root), coordinate placement, and the volume comparison.
 *
 * Hand-worked oracle (side 12): A(0,0,0), B(0,12,0), D(12,0,0), S(0,0,12),
 * C(12,12,0) ⇒ E=(9,0,3), N=(6,6,6), |EN| = 3√6 = (√6/4)·12, plane ENB:
 * 3x+2y−z−24 = 0, and V(SENB) = V(CENB) = 108 (N is SC's midpoint).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

const SETUP = [
  'פירמידה ABCDS שבסיסה ריבוע',
  'המקצוע AS הוא גובה בפירמידה',
  'אורך המקצוע AS שווה לאורך צלע הריבוע ABCD',
  'SE = 3/4 SD',
  'נסמן: AD = u, AB = v, AS = w',
  'SN = k·SC',
];
const PLACE = [
  'נתון: A(0,0,0), B(0,12,0)',
  'הקודקוד D נמצא על החלק החיובי של ציר ה-x',
  'S נמצא על החלק החיובי של ציר ה-z',
];

describe('GATE — 2026 מועד ב Q2 (square pyramid + |EN| abs-value given)', () => {
  beforeEach(reset);

  it('the full chain: |EN| pins k = ½ (touch root); N, E, the plane and the volumes verify', () => {
    [...SETUP, '|EN| = (√6/4)·|w|', ...PLACE].forEach(submit);
    expectAllOk();
    submit('N = (6, 6, 6)');
    submit('E = (9, 0, 3)');
    submit('המישור ENB: 3x+2y-z-24=0');
    submit('נפח הפירמידה SENB = 108');
    submit('נפח הפירמידה SENB שווה לנפח הפירמידה CENB');
    expectAllOk();
    expect(state().facts).toHaveLength(15);
  });

  it('the הציבו path: k = 1/2 directly (no |EN| given) reaches the same N', () => {
    [...SETUP, ...PLACE, 'k = 1/2', 'N = (6, 6, 6)'].forEach(submit);
    expectAllOk();
  });

  it('a wrong volume is refused; k on an undefined parameter is refused', () => {
    [...SETUP, '|EN| = (√6/4)·|w|', ...PLACE].forEach(submit);
    const n = state().facts.length;
    submit('נפח הפירמידה SENB = 100');
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
    submit('m = 2');
    expect(state().lastError).toEqual({ code: 'unknown-symbol', id: 'm' });
  });

  it('bare AS = AB asks for clarification — never assumed (operator rule); explicit forms disambiguate', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    const n = state().facts.length;
    // ambiguous: vector equation or length equality? ask, never guess — and never the LLM
    submit('AS = AB');
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).toEqual({ code: 'ambiguous-vector-length' });
    // the LENGTH forms
    submit('|AS| = |AB|');
    expectAllOk();
    const pos = derived().positions;
    const d = (p: string, q: string) => {
      const a = pos.get(p)!;
      const b = pos.get(q)!;
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    };
    expect(d('A', 'S')).toBeCloseTo(d('A', 'B'), 5);
    // the VECTOR forms: the ⃗ arrow and the typeable word marker (He and En) —
    // AS⃗ = AB⃗ is a false vector claim here (S ≠ B), refused
    const n2 = state().facts.length;
    for (const form of ['AS⃗ = AB⃗', 'וקטור AS = וקטור AB', 'vector AS = vector AB']) {
      submit(form);
      expect(state().facts, form).toHaveLength(n2);
      expect(state().lastError, form).toEqual({ code: 'claim-refuted' });
    }
    // and the word form still DEFINES when the target is new
    submit('וקטור SM = 1/2 וקטור SC');
    expect(state().lastError).toBeNull();
    expect(derived().positions.has('M')).toBe(true);
  });
});
