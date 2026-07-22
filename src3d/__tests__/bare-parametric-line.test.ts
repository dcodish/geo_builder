/**
 * #275 (ADR-3D-050) — the BARE parametric line: «x=(0,2,0)+t(2,-2,0)» with no «הישר ℓ:» prefix.
 *
 * Prod session 18z741vq (2026-07-22, log-triage): the textbook's exact notation escalated to the
 * LLM, which emitted the canonical `line ℓ: …` and built fine — the capability existed
 * (ADR-3D-006/031/038), only the name-less spelling missed, and every occurrence burned a paid
 * call. Now the bare form binds the canonical ℓ deterministically; a SECOND bare line hits the
 * honest `already-defined` refusal (naming lines — ℓ1/ℓ2 — stays the student's move); the
 * mandatory leading `x =` keeps every other equation family untouched.
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

beforeEach(reset);

describe('#275 — bare parametric line binds ℓ', () => {
  it('the exact prod utterance parses to line3 named ℓ', () => {
    const c = cmd('x=(0,2,0)+t(2,-2,0)');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: 'line3', name: 'ℓ' });
    const line = c[0] as { anchor: { k: number; p: number }[]; dir: { k: number; p: number }[] };
    expect(line.anchor.map((e) => e.k)).toEqual([0, 2, 0]);
    expect(line.dir.map((e) => e.k)).toEqual([2, -2, 0]);
  });

  it('spaced + explicit multiplication variants parse the same', () => {
    for (const u of ['x = (0,2,0) + t(2,-2,0)', 'x = (0,2,0) + t·(2,-2,0)']) {
      expect(cmd(u)[0]).toMatchObject({ type: 'line3', name: 'ℓ' });
    }
  });

  it('builds end-to-end: ℓ is resolved and drawn', () => {
    submit('x=(0,2,0)+t(2,-2,0)');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.resolved.lines.get('ℓ')).toBeTruthy();
  });

  it('a SECOND bare line refuses honestly (ℓ already defined, keep-prior) — never a silent overwrite', () => {
    submit('x=(0,2,0)+t(2,-2,0)');
    submit('x=(1,1,1)+t(0,0,1)');
    expect(state().facts, 'keep-prior: the second bare line never commits').toHaveLength(1);
    expect(state().lastError).toMatchObject({ code: 'already-defined', id: 'ℓ' });
    // the first line survives untouched
    expect(derived().resolved.lines.get('ℓ')).toBeTruthy();
  });

  it('a named parametric line after the bare one still works (ℓ2 explicitly)', () => {
    submit('x=(0,2,0)+t(2,-2,0)');
    submit('הישר ℓ2: x = (1,1,1) + t(0,0,1)');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });

  it('no-theft: named lanes, plane equations, and vector injections keep their owners', () => {
    // the named quick lane is byte-unchanged
    expect(cmd('הישר ℓ: x = (0,7,6) + t(0,2,1)')[0]).toMatchObject({ type: 'line3', name: 'ℓ' });
    // plane equations never match the bare lane (no leading `x=(`)
    expect(cmd('המישור x-y+z=1')[0]).toMatchObject({ type: 'plane3' });
    // a vector injection list is untouched
    expect(parse3('נתון: v = (10,-5,0)').ok).toBe(true);
    expect(cmd('נתון: v = (10,-5,0)').some((c) => c.type === 'line3')).toBe(false);
  });
});
