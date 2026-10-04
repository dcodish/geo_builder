/**
 * #1591 (ADR-3D-303) — «when there are 2 solutions to a parameter, show them as m=-2, m=4» (operator,
 * 2026-09-30, playing round #1571 T7). The data panel and the ask lane printed the root SET «m = {-2, 4}».
 *
 * Ruling (2026-09-30): a symmetric pair keeps «m = ±√2»; every other set repeats the symbol before each
 * root — «m = -2, m = 4», «m = -2, m = 0, m = 4». One join (`branchAnswer`) feeds both surfaces, so the
 * panel row and the ask row can never disagree, and the ask row — which App3 prints as
 * «<question> = <answer>» — never prints the symbol twice (#1746's class).
 *
 * These locks CALL the production formatter, the panel and the query lane through the real submit path.
 * (Sequences are passed as separate arguments, not as a string-array literal: the #1394 parity net
 * harvests every string array in this folder against a frozen golden key set.)
 */
import { describe, expect, it } from 'vitest';
import { answerQuery } from '../engine/queries';
import { branchAnswer, dataView, formatBranches } from '../engine/dataView';
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
  const r = answerQuery(c, 'm', st.seed);
  // the ask row exactly as App3 joins it: «<question> = <answer>»
  const askRow = r.answer === null ? null : `${r.text} = ${r.answer}`;
  const panel = dataView(c, st.seed).params.find((p) => p.sym === 'm')?.text;
  return { askRow, panel };
}

describe('#1591 — the root-set spelling', () => {
  it('a non-symmetric pair repeats the symbol: m = -2, m = 4', () => {
    expect(formatBranches([4, -2])?.join(' ; ')).toBe('-2 ; 4');
    expect(`m = ${branchAnswer('m', [4, -2])}`).toBe('m = -2, m = 4');
  });

  it('a symmetric pair keeps ±: m = ±√2', () => {
    expect(`m = ${branchAnswer('m', [Math.SQRT2, -Math.SQRT2])}`).toBe('m = ±√2');
  });

  it('three roots: m = -2, m = 0, m = 4', () => {
    expect(`m = ${branchAnswer('m', [0, 4, -2])}`).toBe('m = -2, m = 0, m = 4');
  });

  it('one root and no root are unchanged', () => {
    expect(branchAnswer('m', [4])).toBe('4');
    expect(branchAnswer('m', [])).toBeNull();
  });
});

describe("#1591 — the operator's figures through the real submit → panel / ask path", () => {
  it('T7: π1: z = 1 · π2: z - m = 0 · distance 3 → m = -2, m = 4 in the panel AND the ask row', () => {
    const { askRow, panel } = run('המישור π1: z = 1', 'המישור π2: z - m = 0', 'המרחק בין המישורים π1 ו-π2 הוא 3');
    expect(panel).toBe('m = -2, m = 4');
    expect(askRow).toBe('m = -2, m = 4');
  });

  it('a symmetric pair (ℓ ∥ π, m = ±√2) is unchanged in both', () => {
    const { askRow, panel } = run('הישר ℓ: x = (0,0,0) + t(m,1,1)', 'המישור π: mx - y - z + 3 = 0', 'הישר ℓ מקביל למישור π');
    expect(panel).toBe('m = ±√2');
    expect(askRow).toBe('m = ±√2');
  });

  it("three roots (#1474's figure B) → m = -2, m = 0, m = 4 in both", () => {
    const { askRow, panel } = run(
      'הישר ℓ: x = (0,0,0) + t(1,m,1)',
      'המישור π: mx + y + z + 2 = 0',
      'הזווית בין הישר ℓ למישור π היא 30°',
      'המישור π5: x - y = 0',
    );
    expect(panel).toBe('m = -2, m = 0, m = 4');
    expect(askRow).toBe('m = -2, m = 0, m = 4');
  });

  it('a pinned single root still reads m = 4', () => {
    const { askRow, panel } = run('המישור π1: z = 1', 'המישור π2: z - m = 0', 'המרחק בין המישורים π1 ו-π2 הוא 3', 'm הוא פרמטר חיובי');
    expect(panel).toBe('m = 4');
    expect(askRow).toBe('m = 4');
  });
});
