/**
 * Issue #14: a stated ⟂ between two SEGMENTS / named VECTORS — `SM ⊥ DB` was a prod
 * not-understood (operator session 4wmcbqbl, 2026-07-10). Lowers to the V8-f `cos-angle`
 * with cos = 0 (M1: drives a free-dim solid, verifies a determined figure). Sibling
 * (session tgsnh4do): the symbol-form seg⟂PLANE `MO ⊥ABCD` — the plane keyword is now
 * optional for a 3–4-point target run.
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
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

const PERP_SM_DB = { type: 'cos-angle', u: { kind: 'pair', from: 'S', to: 'M' }, v: { kind: 'pair', from: 'D', to: 'B' }, cos: 0 };

describe('issue #14 — parsing: ⟂ between two segments / named vectors', () => {
  it('symbol + word forms, He + En (incl. the exact prod utterances)', () => {
    expect(cmd('SM ⊥ DB')).toMatchObject([PERP_SM_DB]); // prod, session 4wmcbqbl
    expect(cmd('SM⊥DB')).toMatchObject([PERP_SM_DB]); // prod, glued
    expect(cmd('SM מאונך ל-DB')).toMatchObject([PERP_SM_DB]);
    expect(cmd('SM ניצב ל DB')).toMatchObject([PERP_SM_DB]);
    expect(cmd('הקטע SM מאונך לקטע DB')).toMatchObject([PERP_SM_DB]);
    expect(cmd('SM is perpendicular to DB')).toMatchObject([PERP_SM_DB]);
    expect(cmd('SM perpendicular to the segment DB')).toMatchObject([PERP_SM_DB]);
  });
  it('plural form + named vectors + mixed', () => {
    expect(cmd('SM ו-DB מאונכים זה לזה')).toMatchObject([{ type: 'cos-angle', u: { from: 'S', to: 'M' }, v: { from: 'D', to: 'B' }, cos: 0 }]);
    expect(cmd('SM and DB are perpendicular')).toMatchObject([{ type: 'cos-angle', cos: 0 }]);
    expect(cmd('u ⊥ v')).toMatchObject([{ type: 'cos-angle', u: { kind: 'named', name: 'u' }, v: { kind: 'named', name: 'v' }, cos: 0 }]);
    expect(cmd('u מאונך ל-v')).toMatchObject([{ type: 'cos-angle', u: { kind: 'named', name: 'u' }, v: { kind: 'named', name: 'v' }, cos: 0 }]);
    expect(cmd('הוקטורים u ו-v מאונכים זה לזה')).toMatchObject([{ type: 'cos-angle', u: { kind: 'named', name: 'u' }, v: { kind: 'named', name: 'v' }, cos: 0 }]);
    expect(cmd('AB ⊥ w')).toMatchObject([{ type: 'cos-angle', u: { kind: 'pair', from: 'A', to: 'B' }, v: { kind: 'named', name: 'w' }, cos: 0 }]);
  });
  it('symbol-form seg⟂PLANE (3–4-point run, no plane word) — session tgsnh4do', () => {
    // #380: the FOURTH label reaches the command. This assertion used to read `['A','B','C']` — it was
    // pinning a silent drop: the rule matched an optional 4th label and then discarded it, so a stated
    // box FACE committed as a triangle, green. (What kept that invisible was apply's own `length === 3`
    // gate, which turned the honest 4-point form into `no-solution`; both halves are fixed together.)
    expect(cmd('MO ⊥ABCD').at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', a: 'M', b: 'O', plane: ['A', 'B', 'C', 'D'] });
    expect(cmd('MO⊥ABCD').at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', a: 'M', b: 'O' });
    expect(cmd("AS ⊥ BC'D").at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', plane: ['B', "C'", 'D'] });
  });
  it('no theft: the existing ⟂ rules are unchanged', () => {
    expect(cmd("CA' מאונך למישור BC'D").at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', a: 'C', b: "A'" });
    expect(cmd('AS ניצב לבסיס')).toMatchObject([{ type: 'seg-plane-rel', rel: 'perp', plane: [] }]);
    expect(cmd('הישר d מאונך לישר AB ולישר CD').at(-1)).toMatchObject({ type: 'line-common-perp' });
    // a lone uppercase letter is a POINT, never a vector name — no half-read
    expect(parse3('A ⊥ B').ok).toBe(false);
  });
});

describe('issue #14 — the exact prod sequence (session 4wmcbqbl): SM ⊥ DB DRIVES the free base', () => {
  beforeEach(reset);

  it('pyramid over a parallelogram base + SA height + M mid BD — the ⟂ forces |AB| = |AD|', () => {
    submit('פירמידה שבסיסה מקבילית');
    submit('SA גובה');
    submit('M אמצע אלכסון BD');
    submit('AB=u');
    submit('AD=v');
    submit('AS=w');
    submit('SM');
    submit('SM ⊥ DB'); // was: LLM → not-understood
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
    const pos = d.positions;
    const S = pos.get('S')!, M = pos.get('M')!, D = pos.get('D')!, B = pos.get('B')!, A = pos.get('A')!;
    // the driven given holds…
    expect(Math.abs(dot(sub(M, S), sub(B, D))) / (nrm(sub(M, S)) * nrm(sub(B, D)))).toBeLessThan(1e-6);
    // …by flexing the base into the forced shape: |AB| = |AD| (SA ⟂ base ⇒ SM⟂DB ⟺ rhombus base)
    expect(nrm(sub(B, A))).toBeCloseTo(nrm(sub(D, A)), 6);
  });

  it('the ⟂ survives a reseed (a drive, not a one-seed accident)', () => {
    submit('פירמידה שבסיסה מקבילית');
    submit('SA גובה');
    submit('M אמצע אלכסון BD');
    submit('SM ⊥ DB');
    for (const seed of [state().seed, state().seed + 1, state().seed + 2]) {
      const d = derive3(state().facts, seed);
      const pos = d.positions;
      const S = pos.get('S')!, M = pos.get('M')!, D = pos.get('D')!, B = pos.get('B')!;
      expect(Math.abs(dot(sub(M, S), sub(B, D))) / (nrm(sub(M, S)) * nrm(sub(B, D))), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });

  it('on a DETERMINED figure it verifies (true passes, false refuses keep-prior)', () => {
    submit('A(0,0,0)');
    submit('B(2,0,0)');
    submit('D(0,3,0)');
    submit('S(0,0,5)');
    expect(state().lastError).toBeNull();
    submit('SA ⊥ BD'); // S−A = (0,0,5) vertical, B−D = (2,−3,0) in-plane ⇒ dot = 0 ✓
    expect(state().lastError).toBeNull();
    const n = state().facts.length;
    submit('AB ⊥ AS'); // (2,0,0)·(0,0,5) = 0 ✓
    expect(state().lastError).toBeNull();
    submit('AB ⊥ BD'); // (2,0,0)·(−2,3,0) = −4 ≠ 0 → refuted, keep-prior
    expect(state().lastError).not.toBeNull();
    expect(state().facts.length).toBe(n + 1);
  });
});

describe('issue #14 — the sibling prod sequence (session tgsnh4do): MO ⊥ABCD', () => {
  beforeEach(reset);

  it('with O undefined the refusal is an honest unknown-point (was not-understood)', () => {
    submit('קובייה ABCD');
    submit("M אמצע AC'");
    submit('MO ⊥ABCD'); // prod exact — O was never defined in that session
    expect(state().lastError).toMatchObject({ code: 'unknown-point', id: 'O' });
  });

  it('with O defined it verifies on the cube (M = cube centre, MO vertical)', () => {
    submit('קובייה ABCD');
    submit("M אמצע AC'");
    submit('O מפגש האלכסונים של ABCD');
    submit('MO ⊥ABCD');
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
  });
});
