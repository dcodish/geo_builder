/**
 * #1685 ([ADR-629](../../../docs/06-decisions.md#adr-629)) — plural heights and medians paired with their sides by
 * «בהתאמה» / "respectively".
 *
 * Measured on `main` 403efe66 through `decideDeterministic2D`: «OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה» (471 corpus
 * 7/4) and «AD ו-BE הם תיכונים לצלעות BC ו-AC בהתאמה» escalated `not-handled` to the paid model, while each
 * singular («OD גובה לצלע BC») and the plural triangle form («BE ו-CF הם גבהים במשולש ABC») built. Analytic reads
 * the pairing (`parseCevianFamily`'s plural arm, ADR-AG-209); 2-D now does too, by the same distribution.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lng);
}
const cmds = (v: Awaited<ReturnType<typeof decide>>) => (v.kind === 'commit' ? v.commands : null);

/** The commands the singular sentences commit, one after another on the same figure. */
async function singulars(prefix: string[], lines: string[]) {
  const out: unknown[] = [];
  for (const line of lines) {
    useGeoStore.getState().clear();
    out.push(...(cmds(await decide(prefix, line)) ?? ['<not committed>']));
  }
  return out;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1685 — a plural cevian sentence with one side per segment, «בהתאמה»', () => {
  it.each([
    [['משולש OBC'], 'OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה', ['OD גובה לצלע BC', 'BE גובה לצלע OC']],
    [['משולש ABC'], 'AD ו-BE הם תיכונים לצלעות BC ו-AC בהתאמה', ['AD תיכון לצלע BC', 'BE תיכון לצלע AC']],
    [['משולש ABC'], 'AD ו-BE הם התיכונים לצלעות BC ו-AC בהתאמה', ['AD תיכון לצלע BC', 'BE תיכון לצלע AC']],
    [['משולש ABC'], 'AD, BE ו-CF הם גבהים לצלעות BC, AC ו-AB בהתאמה', ['AD גובה לצלע BC', 'BE גובה לצלע AC', 'CF גובה לצלע AB']],
    [['משולש ABC'], 'AD and BE are the medians to sides BC and AC respectively', ['AD תיכון לצלע BC', 'BE תיכון לצלע AC']],
    [['משולש ABC'], 'AD, BE and CF are altitudes to sides BC, AC and AB respectively', ['AD גובה לצלע BC', 'BE גובה לצלע AC', 'CF גובה לצלע AB']],
  ])('on %j, «%s» commits exactly what its singular sentences commit', async (prefix, line, singles) => {
    const v = await decide(prefix, line);
    expect(v.kind, line).toBe('commit');
    expect(cmds(v)).toEqual(await singulars(prefix, singles));
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('each segment goes to ITS side, in order — the altitude from O lands on BC, the one from B on OC', async () => {
    const v = cmds(await decide(['משולש OBC'], 'OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה'));
    expect(v).toContainEqual({ type: 'foot', id: 'D', from: 'O', a: 'B', b: 'C' });
    expect(v).toContainEqual({ type: 'foot', id: 'E', from: 'B', a: 'O', b: 'C' });
  });

  it.each([
    ['AD ו-BE הם תיכונים לצלעות BC ו-AC', 'no «בהתאמה»: nothing licenses the pairing'],
    ['AD ו-BE הם תיכונים לצלעות BC, AC ו-AB בהתאמה', 'three sides for two segments'],
    ['AD, BE ו-CF הם גבהים לצלעות BC ו-AC בהתאמה', 'two sides for three segments'],
  ])('«%s» pairs nothing and commits nothing (%s)', async (line) => {
    const v = await decide(['משולש ABC'], line);
    expect(v.kind).not.toBe('commit');
  });

  it('all or nothing: a side the singular refuses (the apex on its own side) commits no part of the line', async () => {
    const v = await decide(['משולש OBC'], 'OD ו-BE הם גבהים לצלעות OB ו-OC בהתאמה');
    expect(v.kind).not.toBe('commit');
  });

  it('the plural triangle form is unchanged', async () => {
    const v = await decide(['משולש ABC'], 'BE ו-CF הם גבהים במשולש ABC');
    expect(cmds(v)).toEqual(await singulars(['משולש ABC'], ['BE גובה במשולש ABC', 'CF גובה במשולש ABC']));
  });
  // Green and verified: the fixtures `issue-1685-altitudes-respectively` / `issue-1685-medians-respectively`.
});
