/**
 * V8-b (ADR-3D-019, G1/G2): a plane DEFINED by a ⊥/∥ relation to an edge through a
 * point, and a point at the plane∩edge crossing. The #1-frequency legacy-572 gap
 * (2009-ב, 2011-חורף, 2013-חורף, 2015-קיץ, 2017-חורף).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}
const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return r.commands;
};
const dot = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => p.x * q.x + p.y * q.y + p.z * q.z;
const sub = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });

describe('V8-b — parse', () => {
  it('⟂ plane through one point', () => {
    expect(cmds('מישור π דרך F וניצב ל-SC')[0]).toEqual({ type: 'rel-plane', name: 'π', rel: 'perp', through: ['F'], a: 'S', b: 'C' });
    expect(cmds('plane π through F perpendicular to SC')[0]).toEqual({ type: 'rel-plane', name: 'π', rel: 'perp', through: ['F'], a: 'S', b: 'C' });
  });
  it('∥ plane through two points', () => {
    expect(cmds('מישור π דרך K ו-P ומקביל ל-CD')[0]).toEqual({ type: 'rel-plane', name: 'π', rel: 'par', through: ['K', 'P'], a: 'C', b: 'D' });
    expect(cmds('plane π through K and P parallel to CD')[0]).toEqual({ type: 'rel-plane', name: 'π', rel: 'par', through: ['K', 'P'], a: 'C', b: 'D' });
  });
  it('∥ with only one through-point is deferred (needs 2 to fix the plane)', () => {
    expect(parse3('מישור π דרך K ומקביל ל-CD')).toEqual({ ok: false, reason: 'not-handled' });
  });
  it('plane∩edge — both phrasings, both languages', () => {
    expect(cmds('המישור π חותך את SA בנקודה E')[0]).toEqual({ type: 'plane-cut', id: 'E', plane: 'π', a: 'S', b: 'A' });
    expect(cmds('plane π cuts SA at E')[0]).toEqual({ type: 'plane-cut', id: 'E', plane: 'π', a: 'S', b: 'A' });
    expect(cmds('E חיתוך המישור π עם SA')[0]).toEqual({ type: 'plane-cut', id: 'E', plane: 'π', a: 'S', b: 'A' });
    expect(cmds('E is the intersection of plane π with SA')[0]).toEqual({ type: 'plane-cut', id: 'E', plane: 'π', a: 'S', b: 'A' });
  });
});

describe('V8-b — build (2009-ב geometry: pyramid SABC by coordinates)', () => {
  beforeEach(reset);
  // The exam's exact vertices; F = midpoint of SC; a plane ⟂ SC through F cuts SA,SB.
  const setup = () => {
    submit('S(0,0,0)');
    submit('A(2,1,3)');
    submit('B(3,2,0)');
    submit('C(2,2,2)');
    submit('F אמצע SC');
    submit('מישור π דרך F וניצב ל-SC');
  };

  it('the ⟂-plane cuts SA at E and SB at D at the hand-computed points', () => {
    setup();
    submit('E חיתוך המישור π עם SA');
    submit('D חיתוך המישור π עם SB');
    expectAllOk();
    const pos = derived().positions;
    const E = pos.get('E')!;
    const D = pos.get('D')!;
    // plane x+y+z = 3 (⟂ SC=(2,2,2) through F=(1,1,1)); E on SA at t=½, D on SB at t=0.6
    expect(E.x).toBeCloseTo(1, 6);
    expect(E.y).toBeCloseTo(0.5, 6);
    expect(E.z).toBeCloseTo(1.5, 6);
    expect(D.x).toBeCloseTo(1.8, 6);
    expect(D.y).toBeCloseTo(1.2, 6);
    expect(D.z).toBeCloseTo(0, 6);
    // E,D lie on the plane ⟂ SC (i.e. (E−F)·SC = 0)
    const F = pos.get('F')!;
    const SC = sub(pos.get('C')!, pos.get('S')!);
    expect(dot(sub(E, F), SC)).toBeCloseTo(0, 6);
    expect(dot(sub(D, F), SC)).toBeCloseTo(0, 6);
  });

  it('a plane-cut on an unknown plane is refused honestly', () => {
    submit('S(0,0,0)');
    submit('A(2,1,3)');
    submit('E חיתוך המישור π עם SA'); // π never defined
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'unknown-plane', id: 'π' });
  });
});

describe('V8-b — build (∥-plane, 2017-חורף shape)', () => {
  beforeEach(reset);
  it('a plane through P,Q parallel to MN cuts RT at the crossing', () => {
    submit('M(0,0,0)');
    submit('N(6,0,0)');
    submit('P(0,3,0)');
    submit('Q(0,3,5)');
    submit('R(2,0,4)');
    submit('T(2,6,4)');
    submit('מישור π דרך P ו-Q ומקביל ל-MN');
    submit('X חיתוך המישור π עם RT');
    expectAllOk();
    const pos = derived().positions;
    const X = pos.get('X')!;
    // plane y = 3 (∥ MN); RT crosses it at (2,3,4)
    expect(X.x).toBeCloseTo(2, 6);
    expect(X.y).toBeCloseTo(3, 6);
    expect(X.z).toBeCloseTo(4, 6);
  });
});
