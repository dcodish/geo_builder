/**
 * #2610 (ADR-3D-412) — A POINT-RUN PLANE IS NAMED BY ITS LETTERS, ON EVERY SURFACE.
 *
 * Measured on main (`bed5c606`): «BE היטל הישר TB על המישור ABCD» on an empty canvas labelled its plane
 * «plane-ABCD» on the canvas and in the planes list. The projection rule named its anonymous point-run plane
 * `plane-<letters>`, while every other point-run reader («E על המישור ABCD», «ℓ ישר החיתוך בין המישור …», the
 * crossing cell, the containment cell) names it by its letters. In 3-D the name IS the display text, so the id
 * reached the canvas label, the planes list, the data panel and any refusal naming the plane.
 *
 * The class lock is the corpus sweep in `student-text-1455.test.ts` (every shown name, every line of every
 * sequence the suite states plus every fixture, held to `hasEngineToken`); this file pins the reported line.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { hasEngineToken } from '../../shell/studentText';
import { shownNames3 } from './shownNames3';

const cmds = (u: string) => {
  const r = parse3(u);
  return r.ok ? r.commands : [];
};

describe('#2610 — the projection\'s plane is named by its letters', () => {
  it('lowers to a plane named ABCD, as every point-run reader names it', () => {
    expect(cmds('BE היטל הישר TB על המישור ABCD')).toMatchObject([
      { type: 'line-through', name: 'TB' },
      { type: 'plane-through', name: 'ABCD', ids: ['A', 'B', 'C', 'D'] },
      { type: 'line-projection', name: 'BE', line: 'TB', plane: 'ABCD' },
    ]);
    // the English spelling and a primed run reach the same name
    expect(cmds("BE is the projection of line TB onto plane ABB'A'")).toMatchObject([
      { type: 'line-through' },
      { type: 'plane-through', name: "ABB'A'" },
      { type: 'line-projection', plane: "ABB'A'" },
    ]);
    // the sibling form, unchanged: the same plane name for the same run
    expect(cmds('E על המישור ABCD')[0]).toMatchObject({ type: 'plane-through', name: 'ABCD' });
  });

  it('the operator\'s line on an empty canvas shows «ABCD» on the canvas and in the planes list', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null });
    useGeo3.getState().submit('BE היטל הישר TB על המישור ABCD');
    const st = useGeo3.getState();
    expect(st.lastError).toBeNull();
    const d = derive3(st.facts, st.seed);
    expect([...d.resolved.planes.keys()]).toEqual(['ABCD']);
    const shown = shownNames3(true);
    expect(shown.filter((n) => n.surface === 'canvas plane label').map((n) => n.text)).toEqual(['ABCD']);
    expect(shown.filter((n) => hasEngineToken(n.text))).toEqual([]);
  });

  it('the same plane stated twice, by the projection and by a membership, is ONE plane', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null });
    useGeo3.getState().submit('BE היטל הישר TB על המישור ABCD');
    useGeo3.getState().submit('F על המישור ABCD');
    const st = useGeo3.getState();
    expect(st.lastError).toBeNull();
    expect([...derive3(st.facts, st.seed).resolved.planes.keys()]).toEqual(['ABCD']);
  });

  it('the check can fail: a kind-prefixed plane id is reported', () => {
    expect(hasEngineToken('plane-ABCD')).toBe(true);
    expect(hasEngineToken("BCC'B'")).toBe(false);
  });
});
