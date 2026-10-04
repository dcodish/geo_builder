/**
 * #1440 (ADR-3D-262) — a parameter with more than one root printed each root at a precision set by its
 * POSITION in the list: `formatBranches` called `sorted.map(cleanMag)`, and `Array.map` hands the index
 * to `cleanMag`'s optional `decimals`. Root 0 was rounded to 0 places, root 1 to 1, so
 * A(1,4,-3) · B(2t,t,1) · |AB| = 6 answered «t = {0, 2.6}» — a «0» that is not a solution.
 *
 * These locks CALL the production formatter, the query lane and the data panel; the cross-tree class
 * guard (no point-free iteration into a function with an optional 2nd/3rd parameter) lives in
 * `server/__tests__/point-free-optional-arg-hygiene.test.ts`.
 *
 * (The sequences below are passed as separate arguments, not as a string-array literal: the #1394
 * parity net harvests every string array in this folder against a frozen golden key set.)
 */
import { describe, expect, it } from 'vitest';
import { answerQuery } from '../engine/queries';
import { dataView, formatBranches } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function run(...lines: string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, queries: [] });
  for (const u of lines) {
    useGeo3.getState().submit(u);
    expect(useGeo3.getState().lastError, `«${u}» must pass the submit gate`).toBeNull();
  }
  expect(useGeo3.getState().facts.length).toBe(lines.length);
  const st = useGeo3.getState();
  const c = derive3(st.facts, st.seed).construction;
  const query = answerQuery(c, 't', st.seed).answer;
  const panel = dataView(c, st.seed).params.find((p) => p.sym === 't')?.text;
  return { query, panel };
}

describe('#1440 — formatBranches rounds every root the same way, whatever its position', () => {
  it('two roots: {-0.23, 2.63}, not {0, 2.6}', () => {
    expect(formatBranches([-0.228, 2.628])?.join(' ; ')).toBe('-0.23 ; 2.63');
    expect(formatBranches([2.628, -0.228])?.join(' ; ')).toBe('-0.23 ; 2.63');
  });

  it('three roots: the third is not the only one given two places', () => {
    expect(formatBranches([-1.234, 0.456, 7.891])?.join(' ; ')).toBe('-1.23 ; 0.46 ; 7.89');
  });

  it('the exact forms and the ± path are unchanged', () => {
    expect(formatBranches([4, -1.6])?.join(' ; ')).toBe('-8/5 ; 4');
    expect(formatBranches([-Math.SQRT2, Math.SQRT2])?.join(' ; ')).toBe('±√2');
    expect(formatBranches([2.628])?.join(' ; ')).toBe('2.63');
  });
});

describe('#1440 — the reported sequence through the real submit → query / panel path', () => {
  it('A(1,4,-3) · B(2t,t,1) · |AB| = 6 → t = -0.23, t = 2.63 (the #1591 spelling), and the panel row says the same', () => {
    const { query, panel } = run('A(1,4,-3)', 'B(2t,t,1)', '|AB| = 6');
    expect(query).toBe('-0.23, t = 2.63');
    expect(panel).toBe(`t = ${query}`);
  });

  it('|AB| = 7 → -0.95, t = 3.35 (was {-1, 3.4})', () => {
    const { query, panel } = run('A(1,4,-3)', 'B(2t,t,1)', '|AB| = 7');
    expect(query).toBe('-0.95, t = 3.35');
    expect(panel).toBe(`t = ${query}`);
  });
});
