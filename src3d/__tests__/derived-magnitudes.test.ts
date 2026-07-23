/**
 * Derived MAGNITUDES in the data panel ([ADR-3D-054](docs/06b-decisions-3d.md), issue #268).
 *
 * Operator report (prod, 2026-07-22): on a right triangular prism with ∠CAB = 90, |u| = 3, |v| = 4 and
 * B'E ⊥ C'E, «|w| can be calculated yet it is not shown». The engine solved it exactly — 2.500000 at
 * every seed — and the panel withheld it, because derived magnitudes were gated on `hasFrame` ("was a
 * COORDINATE injected?") when the right question is whether the SCALE is pinned.
 *
 * Both directions matter here: the forced value must print, and a gauge value must never print.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const panelFor = (steps: string[]) => {
  reset();
  for (const u of steps) submit(u);
  const st = useGeo3.getState();
  return { st, panel: dataView(derive3(st.facts, st.seed).construction, st.seed) };
};
const magOf = (panel: ReturnType<typeof dataView>, label: string) => panel.vectors.find((v) => v.label === label)?.mag ?? null;

const OPERATOR_PRISM = [
  'מנסרה משולשת ישרה',
  'זוית CAB=90',
  'AB=u',
  'AC=v',
  "AA'=w",
  "BE=0.2BC'",
  'BE',
  "B'E",
  "C'E",
  '|u|=3',
  '|v|=4',
  "B'E⊥C'E",
];

describe('ADR-3D-054 — a derived magnitude prints when the SCALE is pinned', () => {
  beforeEach(reset);

  it("the operator's prism: |w| is forced by the givens, so it prints", () => {
    const { st, panel } = panelFor(OPERATOR_PRISM);
    expect(st.lastError).toBeNull();
    expect(magOf(panel, 'u')).toBe('|u| = 3'); // stated (unchanged)
    expect(magOf(panel, 'v')).toBe('|v| = 4');
    // 5/2, not 2.5 — `cleanNum` renders a small rational as p/q throughout the panel (the textbook form)
    expect(magOf(panel, 'w'), 'the height the engine solved exactly').toBe('|w| = 5/2');
  });

  it('a bare solid prints NO magnitude — the frozen gauge is not knowledge', () => {
    // the first dim of every solid is the similarity gauge, pinned at 1, so it agrees across every seed
    // while being pure gauge: the multi-sample check alone cannot tell it from a forced value.
    const { panel } = panelFor(["קובייה ABCDA'B'C'D'", 'AB=u', 'AD=v', "AA'=w"]);
    for (const n of ['u', 'v', 'w']) expect(magOf(panel, n), n).toBeNull();
  });

  it('similarity-INVARIANT givens alone still print nothing', () => {
    // ⟂ and a length RATIO fix the shape but not the size — every length remains gauge.
    const perp = panelFor(['מנסרה משולשת ישרה', 'זוית CAB=90', 'AB=u', "AA'=w", "AB ⊥ AA'"]);
    expect(magOf(perp.panel, 'u')).toBeNull();
    const ratio = panelFor(['מנסרה משולשת ישרה', 'AB=u', 'AC=v', '|AB|=|AC|']);
    expect(magOf(ratio.panel, 'u')).toBeNull();
  });

  it('ONE absolute size prints only what it actually forces', () => {
    // |u| = 3 pins the scale, but the prism's other dims stay free — so they must stay unprinted.
    const { panel } = panelFor(['מנסרה משולשת ישרה', 'זוית CAB=90', 'AB=u', 'AC=v', "AA'=w", '|u|=3']);
    expect(magOf(panel, 'u')).toBe('|u| = 3');
    expect(magOf(panel, 'v'), 'still free').toBeNull();
    expect(magOf(panel, 'w'), 'still free').toBeNull();
  });

  it('coordinates keep needing a FRAME (a length needs less than a coordinate)', () => {
    // scale pinned, no frame injected ⇒ magnitudes print, coordinates do not.
    const { panel } = panelFor(OPERATOR_PRISM);
    expect(panel.points, 'no coordinate is knowledge without a frame').toEqual([]);
    expect(panel.vectors.every((v) => v.coords === null)).toBe(true);
  });
});
