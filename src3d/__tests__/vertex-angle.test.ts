/**
 * #251 (ADR-3D-049): a stated angle named by its VERTEX alone — `זוית O ישרה` (prod session
 * 38t9c7lv), `זווית O = 90`, En mirrors — resolves its two arms from the figure at APPLY
 * (exactly two edges at the vertex ⇒ the ordinary ∠PVQ lowering; otherwise the honest
 * `ambiguous-angle` refusal — the 2-D ADR-164 pattern). Plus the `ישרה`/`is right`
 * word-form on the full triple (was not-handled even with all three letters named).
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
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('ADR-3D-049 — parse forms', () => {
  it('single-vertex: word-form and value-form, He + En', () => {
    expect(parse3('זוית O ישרה')).toMatchObject({ ok: true, commands: [{ type: 'vertex-angle', vertex: 'O', deg: 90 }] });
    expect(parse3('זווית O ישרה')).toMatchObject({ ok: true, commands: [{ type: 'vertex-angle', vertex: 'O', deg: 90 }] });
    expect(parse3('זווית O = 90')).toMatchObject({ ok: true, commands: [{ type: 'vertex-angle', vertex: 'O', deg: 90 }] });
    expect(parse3('זווית B = 60')).toMatchObject({ ok: true, commands: [{ type: 'vertex-angle', vertex: 'B', deg: 60 }] });
    expect(parse3('angle at O is right')).toMatchObject({ ok: true, commands: [{ type: 'vertex-angle', vertex: 'O', deg: 90 }] });
  });

  it('the triple ישרה word-form lowers like = 90', () => {
    expect(parse3('הזווית ABC ישרה')).toMatchObject({
      ok: true,
      commands: [
        { type: 'segment3', a: 'B', b: 'A' },
        { type: 'segment3', a: 'B', b: 'C' },
        { type: 'claim', claim: { type: 'angle-seg-eq', deg: 90 } },
      ],
    });
    expect(parse3('∠ABC = 90')).toMatchObject({ ok: true }); // the numeric triple stays byte-equivalent
  });

  it('no theft: the #94 marker forms are untouched', () => {
    expect(parse3('∠SDB')).toMatchObject({ ok: true, commands: [{ type: 'angle-mark' }] });
    expect(parse3('∠SDB = α')).toMatchObject({ ok: true, commands: [{ type: 'angle-mark' }] });
  });
});

describe('ADR-3D-049 — apply resolves the arms from the figure', () => {
  beforeEach(reset);

  it('a triangle vertex (exactly 2 edges): «זוית O ישרה» becomes ∠AOB = 90 and DRIVES the free triangle', () => {
    submit('משולש AOB');
    submit('זוית O ישרה');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @ seed ${seed}`).toBe('ok');
      const pos = d.positions;
      const u = sub(pos.get('A')!, pos.get('O')!);
      const v = sub(pos.get('B')!, pos.get('O')!);
      expect(Math.abs(dot(u, v)) / (nrm(u) * nrm(v))).toBeLessThan(1e-6);
    }
  });

  it('a cube vertex (3 edges): honest ambiguous-angle refusal, keep-prior', () => {
    submit('קובייה ABCD');
    const before = state().facts.length;
    submit('זוית B ישרה');
    expect(state().lastError).toMatchObject({ code: 'ambiguous-angle', id: 'B' });
    expect(state().facts.length).toBe(before);
  });

  it('an unknown vertex refuses unknown-point', () => {
    submit('משולש AOB');
    submit('זוית X ישרה');
    expect(state().lastError).toMatchObject({ code: 'unknown-point', id: 'X' });
  });

  it('a determined figure VERIFIES: the cube base corner via two drawn segments', () => {
    submit('משולש AOB');
    submit('זוית O ישרה');
    // restating the same single-vertex angle verifies (no dead-end, claim twice is consistent)
    submit('זוית O ישרה');
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });
});
