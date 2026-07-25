/**
 * Issue #330: the 3-D special-line rules were too narrow, so natural/textbook phrasings either SILENTLY
 * built the wrong figure (a broader rule absorbing the under-matched utterance and dropping the stated
 * point/line — the honesty-violating class) or escalated for standard input.
 *
 *  - centroid: `centroidRule` demanded the point FIRST + the definite `ה`. The point-LAST book forms
 *    (`תיכוני הפאה SAB נפגשים בנקודה P`, `מפגש התיכונים … הוא P`) were absorbed by `planarPolygon` as a
 *    bare triangle SAB — the centroid point P DROPPED with no error.
 *  - midpoint: its `/אמצע/` guard also matched `אמצעי` (perpendicular bisector) and `אמצעים` (midsegment),
 *    reducing `אנך אמצעי ל AB` to a bare midpoint and dropping any named line.
 *
 * Fix: widen `centroidRule` (both orders, ה optional, `פאה`/`משולש`, construct-state `תיכוני`, En mirrors);
 * a word-boundary guard `/אמצע(?!י)/` on `midpoint`; and an ADR-024 leftover guard on `planarPolygon` so a
 * special-line statement is never silently reduced to a bare polygon (it parses correctly or escalates).
 * (The perpendicular-bisector CONSTRUCT itself is a separate needs-operator design decision — for now the
 * phrasing escalates honestly rather than silently mis-building.)
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import type { Command3 } from '../engine/types';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const parse = (u: string) => parse3(u);
const commandsOf = (u: string): Command3[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
const hasCentroid = (u: string, id: string, of: string[]) =>
  commandsOf(u).some((c) => c.type === 'centroid3' && c.id === id && JSON.stringify(c.of) === JSON.stringify(of));

describe('#330 — centroid in every phrasing (point-first / point-last), P never dropped', () => {
  for (const u of [
    'P מפגש התיכונים של משולש SAB', // baseline (point-first, ה)
    'P מפגש תיכונים במשולש SAB', // point-first, NO ה (the operator's form)
    'תיכוני משולש SAB נפגשים בנקודה P', // point-LAST — was silently polygon3[S,A,B], P dropped
    'מפגש התיכונים של משולש SAB הוא P', // point-LAST — was silently dropped
    'תיכוני הפאה SAB נפגשים בנקודה P', // point-LAST, פאה (the book's exact wording)
    'P is the centroid of triangle SAB',
    'the medians of triangle SAB meet at P',
    'the centroid of triangle SAB is P',
  ]) {
    it(`"${u}" → centroid3 P of S,A,B (never a bare triangle dropping P)`, () => {
      expect(hasCentroid(u, 'P', ['S', 'A', 'B'])).toBe(true);
      // never a bare polygon that drops P
      expect(commandsOf(u).some((c) => c.type === 'solid' && c.kind === 'polygon3')).toBe(false);
    });
  }

  it('builds GREEN end-to-end through the store (the point-last book form)', () => {
    reset();
    submit("מנסרה ישרה משולשת ABC");
    submit('תיכוני הפאה ABC נפגשים בנקודה P');
    const d = derive3(state().facts, state().seed);
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.positions.has('P')).toBe(true); // the centroid exists — not dropped
  });
});

describe('#330 — the midpoint rule no longer swallows אמצעי / אמצעים', () => {
  it('a perpendicular bisector escalates (not a silent midpoint), the named line not dropped', () => {
    expect(parse('אנך אמצעי ל AB').ok).toBe(false);
    expect(parse('הישר d אנך אמצעי לקטע AB').ok).toBe(false);
    expect(parse('d האנך האמצעי של AB').ok).toBe(false);
  });
  it('the midsegment word is not a plain midpoint', () => {
    expect(parse('קטע אמצעים').ok).toBe(false);
  });
  it('a genuine midpoint still parses', () => {
    expect(commandsOf('M אמצע BC')).toEqual([{ type: 'point-on-segment3', id: 'M', a: 'B', b: 'C', t: 0.5 }]);
    expect(commandsOf("אמצע BB'")[0].type).toBe('midpoint-auto');
  });
});

describe('#330 — planarPolygon leftover guard + altitude-in-triangle', () => {
  it('a special-line statement is never reduced to a bare polygon', () => {
    // even a phrasing a special-line rule might miss must NOT commit a bare triangle
    for (const u of ['תיכוני משולש SAB נפגשים בנקודה P', 'CD גובה במשולש ABC', 'CD תיכון במשולש ABC']) {
      expect(commandsOf(u).some((c) => c.type === 'solid' && c.kind === 'polygon3'), u).toBe(false);
    }
  });
  it('a bare polygon still builds', () => {
    expect(commandsOf('משולש ABC')).toEqual([{ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] }]);
    expect(commandsOf('מרובע ABCD')).toEqual([{ type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] }]);
  });
  it('altitude from a vertex of a named triangle drops to the opposite side (P2 widening)', () => {
    expect(commandsOf('CD גובה במשולש ABC')).toEqual([{ type: 'altitude-foot', id: 'D', from: 'C', a: 'A', b: 'B' }]);
    expect(commandsOf('CD is the altitude in triangle ABC')).toEqual([{ type: 'altitude-foot', id: 'D', from: 'C', a: 'A', b: 'B' }]);
    // the single-median vertex form is unchanged (not stolen by altitude)
    expect(commandsOf('CD תיכון במשולש ABC')[0]).toEqual({ type: 'point-on-segment3', id: 'D', a: 'A', b: 'B', t: 0.5 });
  });
});
