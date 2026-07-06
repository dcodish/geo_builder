/**
 * V7 gates — the newly-expressible corpus chains through the REAL submit path:
 *  2021-חורף-א: coordinates + AD = ⅔AB + ⅓AC defines C; right angle; plane eq;
 *               the rectangle completion ABEC.
 *  2021-קיץ-ב: the cevian pair CF = k·CD, BF = t·BE → E, F coordinate answers.
 *  2018:        box pinned by injections/on-axes; K by a vector relation; skew lines.
 * (2023-ב and 2022-נבצרים need T2's scalar-given solving — deferred, documented.)
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

describe('GATE — 2021 חורף א Q2 (vec-defined C, right angle, plane equation, rectangle completion)', () => {
  beforeEach(reset);

  const HE = [
    'A(0,2,-1)',
    'B(-3,2,2)',
    'D(-2,3,1)',
    'AD = 2/3AB + 1/3AC', // defines C = (0, 5, -1)
    'C = (0, 5, -1)',
    '∠BAC = 90', // the right angle — verified
    'המישור ABC: x + z + 1 = 0', // the plane-equation answer — verified
    'ABEC מלבן', // completes E = B + C − A = (−3, 5, 2), verified right-angled
    'E = (-3, 5, 2)',
  ];

  it('Hebrew: the full chain builds and every answer verifies', () => {
    HE.forEach(submit);
    expect(state().facts).toHaveLength(9);
    expectAllOk();
  });

  it('English mirror of the core steps', () => {
    ['A(0,2,-1)', 'B(-3,2,2)', 'D(-2,3,1)', 'AD = 2/3AB + 1/3AC', 'the angle ABC is 45', 'ABEC is a rectangle'].forEach(submit);
    // ∠ABC is NOT 45 in this triangle — the wrong vertex-angle claim refused
    expect(state().facts).toHaveLength(5);
  });

  it('a rectangle completion on a non-right base refuses honestly', () => {
    ['A(0,0,0)', 'B(2,0,0)', 'C(1,3,0)'].forEach(submit); // ∠BAC ≠ 90
    submit('ABEC מלבן');
    expect(state().facts).toHaveLength(3);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});

describe('GATE — 2021 קיץ ב Q2 (the cevian intersection → coordinate answers)', () => {
  beforeEach(reset);

  it('Hebrew: E and F land on the exam values', () => {
    [
      'A(0,0,0)',
      'B(6,0,0)',
      'C(0,6,0)',
      'D אמצע AB',
      'E על AC כך ש-AE:EC = 2:1',
      'CF = kCD',
      'BF = tBE',
      'E = (0, 4, 0)',
      'F = (1.5, 3, 0)',
    ].forEach(submit);
    expect(state().facts).toHaveLength(9);
    expectAllOk();
  });
});

describe('GATE — 2018 קיץ Q2 (box on axes, a vector-relation point, SKEW lines)', () => {
  beforeEach(reset);

  const HE = [
    "תיבה ABCDA'B'C'D'",
    'D(0,0,0)',
    'A(4,0,0)',
    "D'(0,0,3)",
    'C על ציר ה-y החיובי', // the box edge DC rides the +y axis — its length stays the exam's free parameter a
    "P על AA' כך ש-AP = 2PA'",
    'N(0,5,0)', // N on edge DC → pins a = the box depth ≥ 5? (an injection the pivot honours)
    'L אמצע BC',
    "A'K = 4/5 DN", // the 2018 vector relation defining K
    'NK ו-PL מצטלבים', // the ב(2) answer — SKEW, verified
  ];

  it('Hebrew: the chain builds and the skew claim verifies', () => {
    HE.forEach(submit);
    expect(state().facts).toHaveLength(10);
    expectAllOk();
  });

  it('a false mutual-position claim refuses (the same lines are NOT intersecting)', () => {
    HE.slice(0, 9).forEach(submit);
    submit('NK ו-PL נחתכים');
    expect(state().facts).toHaveLength(9);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});
