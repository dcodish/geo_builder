/**
 * #823 (ADR-3D-187) — A PLANE'S TWO REPRESENTATIONS GET A ROW EACH, AND THE PARAMETRIC ONE IS «π».
 *
 * Operator, playing round #822: *"in data panel when showing plane equations `מישור ABC = … | x = …`
 * we should have each on a separate row and not just the | sign, and the 'x =' should be 'π =', and if
 * there are other planes so π1 and π2 etc."*
 *
 * Both representations are given by the 2026-08-15 ruling; this is about how they are PRESENTED. The
 * numbering comes from one enumeration shared by the two surfaces that print a plane, so the panel and
 * the query lane can never disagree about which plane is π1.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { dataView, planeSymbols } from '../engine/dataView';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
function build(lines: string[]) {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  return { c: derive3(st.facts, st.seed).construction, seed: st.seed };
}

/** the operator's own figure — the numbers in the report are this plane's */
const ONE_PLANE = ['משולש ABC', 'A(2,-1,1)', 'B(3,1,4)', 'C(5,-1,0)', 'מישור ABC'];
const TWO_PLANES = ["קובייה ABCDA'B'C'D'", 'A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)', 'מישור ABC', "מישור DBB'D'"];

describe('#823 — one representation per row, never joined by «|»', () => {
  beforeEach(reset);

  it('the operator’s plane answers in TWO rows', () => {
    const { c, seed } = build(ONE_PLANE);
    const r = answerQuery(c, 'מישור ABC', seed);
    expect(r.rows).toEqual([
      'x - 5y + 3z - 10 = 0',
      'π = (2, -1, 1) + t·(1, 2, 3) + s·(3, 0, -1)',
    ]);
  });

  it('no answer string carries the old «|» join', () => {
    const { c, seed } = build(ONE_PLANE);
    const r = answerQuery(c, 'מישור ABC', seed);
    for (const row of r.rows ?? [r.answer!]) expect(row).not.toContain('|');
    expect(r.answer).not.toContain('|');
  });

  it('`answer` stays a complete answer on its own — the first row', () => {
    const { c, seed } = build(ONE_PLANE);
    const r = answerQuery(c, 'מישור ABC', seed);
    expect(r.answer).toBe('x - 5y + 3z - 10 = 0');
    expect(r.rows![0]).toBe(r.answer);
  });

  it('a single-VALUE query is untouched — one row, no `rows` at all', () => {
    const { c, seed } = build(ONE_PLANE);
    const r = answerQuery(c, 'אורך AB', seed);
    expect(r.rows).toBeUndefined();
    expect(r.answer).not.toBeNull();
  });
});

describe('#823 — the parametric form is written against the PLANE, and numbered', () => {
  beforeEach(reset);

  it('one plane in the figure reads «π =», not «x =»', () => {
    const { c, seed } = build(ONE_PLANE);
    const par = answerQuery(c, 'מישור ABC', seed).rows![1];
    expect(par.startsWith('π = ')).toBe(true);
    expect(par.startsWith('x =')).toBe(false); // the defect: `x` reads as the coordinate
  });

  it('several planes are numbered π1, π2 … from ONE enumeration', () => {
    const { c } = build(TWO_PLANES);
    const syms = [...planeSymbols(c).values()];
    expect(syms).toEqual(['π1', 'π2']);
    expect(new Set(syms).size).toBe(syms.length); // never two planes with one symbol
  });

  it('the PANEL and the QUERY LANE agree about which plane is π1', () => {
    const { c, seed } = build(TWO_PLANES);
    const fromQuery = answerQuery(c, 'מישור ABC', seed).rows![1];
    const fromPanel = dataView(c, seed).planes.find((p) => p.includes(' + t·'))!;
    const symbol = fromQuery.slice(0, fromQuery.indexOf(' ='));
    expect(symbol).toBe('π1');
    expect(fromPanel).toContain(`π1 = `);
  });

  it('the two surfaces print the same parametric text for the same plane', () => {
    const { c, seed } = build(TWO_PLANES);
    const fromQuery = answerQuery(c, 'מישור ABC', seed).rows![1];
    expect(dataView(c, seed).planes).toContain(`ABC: ${fromQuery}`);
  });
});
