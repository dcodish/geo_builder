/**
 * The `טטראדר` / `tetrahedron` keyword (operator request, 2026-07-08). A tetrahedron IS a
 * triangular pyramid by definition, so unlike bare `פירמידה` (base ambiguous → refused) the
 * word carries its own base and parses deterministically — including bare/label-less. It maps
 * onto the existing `tetra` (general, free apex) / `pyramid3` (right) engine kinds — no new
 * construct. Spelling variants: טטראדר / טטראהדרון / טטרהדרון and En tetrahedron/tetrahedr.
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

const first = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`${u} → ${JSON.stringify(r)}`);
  return r.commands[0] as { type: string; kind: string; ids: string[] };
};

describe('tetrahedron keyword parses as a triangular pyramid', () => {
  beforeEach(reset);

  it('labelled: 4 ids → a general tetra (free apex), both languages + spelling variants', () => {
    expect(first('טטראדר ABCD')).toEqual({ type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] });
    expect(first('tetrahedron ABCD')).toEqual({ type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] });
    expect(first('טטראהדרון ABCD').kind).toBe('tetra');
    expect(first('טטרהדרון ABCD').kind).toBe('tetra');
  });

  it('bare / label-less: implies its own triangular base — default lettering, no LLM', () => {
    expect(first('טטראדר')).toEqual({ type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] });
    expect(first('tetrahedron').kind).toBe('tetra');
    // contrast: bare פירמידה is ambiguous and refused
    expect(parse3('פירמידה')).toEqual({ ok: false, reason: 'not-handled' });
  });

  it('right tetrahedron → pyramid3 (apex above the base centre)', () => {
    expect(first('טטראדר ישר').kind).toBe('pyramid3');
    expect(first('right tetrahedron').kind).toBe('pyramid3');
  });

  it('a 5-label tetrahedron is contradictory → honest refusal (4 vertices only)', () => {
    expect(parse3('טטראדר ABCDE')).toEqual({ ok: false, reason: 'not-handled' });
  });

  it('builds end-to-end (He + En)', () => {
    for (const u of ['טטראדר ABCD', 'tetrahedron PQRS']) {
      reset();
      submit(u);
      const d = derive3(state().facts, state().seed);
      for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
      expect(state().lastError).toBeNull();
    }
  });
});
