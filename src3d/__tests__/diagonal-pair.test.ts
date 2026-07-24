/**
 * ADR-3D-071 / issue #303 — two explicitly NAMED diagonals are recognised by how the
 * student grouped the letters, not by counting the word "diagonal".
 *
 * `האלכסונים AC ו BD נחתכים בנקודה O` used to put O on the midpoint of EDGE AB — a
 * silently wrong figure, no error: the Hebrew plural names both diagonals in ONE word,
 * so the `>= 2 occurrences` test failed and the four labels fell through to the
 * cyclic-quad branch as the quad A→C→B→D (whose diagonals are A–B and C–D).
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { add3, norm3, scale3, sub3 } from '../engine/vec3';

const build = (utterances: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  utterances.forEach((u) => useGeo3.getState().submit(u));
  const st = useGeo3.getState();
  return { st, c: derive3(st.facts, st.seed).construction };
};

/** Where O lands relative to the three candidate points, at several seeds. */
const check = (utterance: string) => {
  const { st, c } = build(['מנסרה ישרה שבסיסה מלבן', utterance]);
  expect(st.facts, `"${utterance}" applied`).toHaveLength(2);
  for (const seed of [0, 3, 17]) {
    const pos = resolve3(c, seed).positions;
    const p = (id: string) => pos.get(id)!;
    const mid = (x: string, y: string) => scale3(add3(p(x), p(y)), 0.5);
    expect(norm3(sub3(p('O'), mid('A', 'C'))), `${utterance} @${seed}: O is the AC midpoint`).toBeLessThan(1e-9);
    expect(norm3(sub3(p('O'), mid('B', 'D'))), `${utterance} @${seed}: O is the BD midpoint`).toBeLessThan(1e-9);
    // the pre-fix bug: O sat on edge AB
    expect(norm3(sub3(p('O'), mid('A', 'B'))), `${utterance} @${seed}: O is NOT the AB midpoint`).toBeGreaterThan(1e-6);
  }
};

describe('#303 — two named diagonals land the crossing at the face centre', () => {
  it('the Hebrew plural naming both diagonals in one word', () => {
    check('האלכסונים AC ו BD נחתכים בנקודה O');
  });

  it('the same, hyphenated conjunction and the meet verb', () => {
    check('האלכסונים AC ו-BD נפגשים בנקודה O');
  });

  it('the word repeated per diagonal (the form that already worked — unchanged)', () => {
    check('האלכסון AC והאלכסון BD נחתכים בנקודה O');
  });

  it('English', () => {
    check('the diagonals AC and BD meet at O');
    check('the diagonals AC and BD intersect at point O');
  });

  it('a NAMED QUAD is still read cyclically (one run of four) — not as two diagonals', () => {
    // `אלכסוני ABCD` means the diagonals of quad ABCD, i.e. A–C and B–D: same centre,
    // but it must keep going through the diag-intersection construct, not the pair branch
    expect(parse3('אלכסוני ABCD נחתכים בנקודה O')).toEqual({
      ok: true,
      commands: [{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }],
    });
    check('אלכסוני ABCD נחתכים בנקודה O');
  });

  it('the pair form lowers to the crossing of the FIRST stated diagonal', () => {
    expect(parse3('האלכסונים AC ו BD נחתכים בנקודה O')).toEqual({
      ok: true,
      commands: [{ type: 'point-on-segment3', id: 'O', a: 'A', b: 'C', t: 0.5 }],
    });
  });

  it('the base sentinel and the point-first order are untouched', () => {
    expect(parse3('אלכסוני הריבוע נחתכים בנקודה O')).toEqual({
      ok: true,
      commands: [{ type: 'diag-intersection', id: 'O', face: [] }],
    });
    expect(parse3('O מפגש אלכסוני ABCD')).toEqual({
      ok: true,
      commands: [{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }],
    });
  });

  it('without the diagonal noun it still defers (ADR-052: two segments crossing at a midpoint would assert an unstated parallelogram)', () => {
    for (const s of ['AC ו BD נחתכים בנקודה O', 'AC and BD meet at O']) {
      expect(parse3(s), s).toEqual({ ok: false, reason: 'not-handled' });
    }
  });
});
