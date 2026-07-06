/**
 * V1 GATE (docs/20 §8): the two mixed corpus questions' geometric halves
 * reproduce END-TO-END — typed utterances through the REAL path
 * (parse3 → submit → derive3 → claim verification), He and En.
 *
 *  - 2020 קיץ Q2 א–ב: right prism, M mid B'C', K with AK=2KA', basis w,v,u,
 *    the AM decomposition claim, the span-defined P, the α=β=⅕ answer claim.
 *  - 2023 קיץ א Q2 א–ב: cube, basis u,v,w, CA'⊥plane BC'D, centroid E,
 *    the CE decomposition claim, E-C-A' collinearity.
 *
 * Wrong answers must be REFUSED (claim-refuted), not absorbed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dist3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

/** Every submitted fact must have applied AND verified. */
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

describe('GATE — 2020 קיץ Q2 א–ב (prism, geometric-vector lane)', () => {
  beforeEach(reset);

  const HE = [
    'מנסרה ישרה משולשת ABC',
    "M אמצע B'C'",
    "K על AA' כך ש-AK = 2KA'",
    "נסמן: AA' = w, KC = v, KB = u",
    'AM = 1/2u + 1/2v + 5/3w', // the student's answer to א — verified
    'P על AM כך ש-KP = αu + βv',
    'KP = 1/5u + 1/5v', // the student's answer to ב (α = β = ⅕) — verified
  ];
  const EN = [
    'right triangular prism ABC',
    "M is the midpoint of B'C'",
    "K on AA' such that AK = 2KA'",
    "denote AA' = w, KC = v, KB = u",
    'AM = 1/2u + 1/2v + 5/3w',
    'P on AM such that KP = αu + βv',
    'KP = 1/5u + 1/5v',
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds, P lands at t = 2/5, both answers verify`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(7);
      expectAllOk();
      const pos = derived().positions;
      const t = dist3(pos.get('P')!, pos.get('A')!) / dist3(pos.get('M')!, pos.get('A')!);
      expect(t).toBeCloseTo(2 / 5, 10);
      // the answers survive "show another configuration" (the prism's free dims resample)
      useGeo3.getState().resample();
      expectAllOk();
    });
  }

  it('the WRONG decomposition is refused with claim-refuted (keep-prior)', () => {
    HE.slice(0, 4).forEach(submit);
    submit('AM = u + v + w');
    expect(state().facts).toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a wrong α,β answer is refused', () => {
    HE.slice(0, 6).forEach(submit);
    submit('KP = 1/2u + 1/2v');
    expect(state().facts).toHaveLength(6);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});

describe("GATE — 2023 קיץ א Q2 א–ב (cube, perpendicular-to-plane + centroid + collinearity)", () => {
  beforeEach(reset);

  const HE = [
    'קובייה ABCD',
    "נסמן: AB = u, AD = v, AA' = w",
    "CA' מאונך למישור BC'D", // א — verified
    "E מפגש התיכונים של משולש BC'D",
    'CE = -1/3u - 1/3v + 1/3w', // ב(1) — verified
    "E, C, A' על ישר אחד", // ב(2) — verified
  ];
  const EN = [
    'cube ABCD',
    "denote AB = u, AD = v, AA' = w",
    "CA' is perpendicular to plane BC'D",
    "E is the centroid of triangle BC'D",
    'CE = -1/3u - 1/3v + 1/3w',
    "E, C, A' are collinear",
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds and every claim verifies`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(6);
      expectAllOk();
      // E is the centroid of B, C', D — at the unit cube: (2/3, 2/3, 1/3)
      const pos = derived().positions;
      expect(pos.get('E')).toEqual({ x: 2 / 3, y: 2 / 3, z: 1 / 3 });
      // the auxiliary segments were auto-drawn: CA' and the plane triangle BD, BC', DC'
      const segs = derived().construction.segments.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`));
      expect(segs).toContain("A'|C");
      expect(segs).toContain('B|D');
      expect(segs).toContain("B|C'");
      expect(segs).toContain("C'|D");
    });
  }

  it('a false perpendicularity claim is refused', () => {
    HE.slice(0, 2).forEach(submit);
    submit("CA' מאונך למישור BB'C'");
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a false collinearity claim is refused', () => {
    HE.slice(0, 4).forEach(submit);
    submit("E, B, A' על ישר אחד");
    expect(state().facts).toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});
