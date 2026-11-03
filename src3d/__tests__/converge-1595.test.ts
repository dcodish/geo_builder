/**
 * #1595 (ADR-3D-404, ADR-W-176) — two letters the givens put on one dot are accepted, and the page always says so,
 * in 2-D's sentence «{{a}} ו-{{b}} נפלו על אותה נקודה.» (the suite key `suite.notice.converge`).
 *
 * Operator, 2026-09-30: *"when 2 dots are on top of each other we should accept but always give a message about it.
 * this is correct for all tools"*; and 2026-10-30 on this tree (PR #2605 T34, «מקבילון ABCDA'B'C'D'» · «AK = AD»
 * drew K on D with no message): *"whenever 2 letters fall on each other and there is no other option but them to do
 * so, we give a message to the user. this needs to happen here too."*
 *
 * Each row is typed through the store the App submits to (`useGeo3.submit`) and read from `derive3(facts, seed)`, the
 * derivation App3 renders.
 *
 * Operator ruling 2026-11-02 on #1595 ("accept with message", ADR-3D-405, ADR-W-177): a NEW derived letter its definition
 * FORCES onto a named point records with the same notice — `point-coincides` (ADR-3D-183) now refuses only 2-D's
 * structural member: a crossing whose two carriers are WRITTEN through the holder (#1274, ADR-W-066).
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { derive3, useGeo3 } from '../store/store3';
import { convergeText } from '../../shell/converge';
import { lockConverge, RULED_CONVERGE } from '../../shell/__tests__/fixtures/converge-1595';

const st = () => useGeo3.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o: Record<string, string>) => plain((i18n3d.getFixedT('he') as (k: string, o: object) => string)(k, o));

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
});

function type(lines: readonly string[]): void {
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
}
const drawn = () => derive3(st().facts, st().seed);
const notice = () => convergeText(drawn().coincidences, he);

describe('#1595 — 3-D: a forced coincidence records, with the notice', () => {
  it.each([
    [["מקבילון ABCDA'B'C'D'", 'AK = AD'], 'D ו-K נפלו על אותה נקודה.'], // the operator's T34
    [['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'N(1,0,0)'], 'M ו-N נפלו על אותה נקודה.'], // the issue body's row
    [['משולש ABC', 'D על AB', 'AD = AB'], 'B ו-D נפלו על אותה נקודה.'], // 2-D's D-on-B row, in 3-D
  ])('%j', (lines, sentence) => {
    type(lines);
    expect(st().facts).toHaveLength(lines.length);
    expect(Object.values(drawn().status).every((s) => s === 'ok')).toBe(true);
    expect(notice()).toBe(sentence);
  });

  it('it holds while the drawing has the pair: muting the line that forced it clears it, un-muting brings it back', () => {
    type(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'N(1,0,0)']);
    const forcing = st().facts.at(-1)!;
    st().toggle(forcing.id);
    expect(drawn().coincidences).toEqual([]);
    st().toggle(forcing.id);
    expect(drawn().coincidences).toEqual([['M', 'N']]);
  });

  it('control: two letters apart show nothing', () => {
    type(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'N(1,0.5,0)']);
    expect(drawn().coincidences).toEqual([]);
    useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
    type(["תיבה ABCDA'B'C'D'"]);
    expect(drawn().coincidences).toEqual([]);
  });

  it.each([
    [['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'N אמצע AB'], 'M ו-N נפלו על אותה נקודה.'], // the ruling's own row
    [['משולש ABC', 'M אמצע AB', 'N אמצע AB'], 'M ו-N נפלו על אותה נקודה.'],
    [["קובייה ABCDA'B'C'D'", "A'H גובה לפאה ABCD"], 'A ו-H נפלו על אותה נקודה.'], // a foot on a vertex (2-D: «∠B = 90°» · «AD גובה לצלע BC»)
  ])('a NEW derived letter its definition forces onto a named point records, with the notice (2026-11-02): %j', (lines, sentence) => {
    type(lines);
    expect(st().facts).toHaveLength(lines.length);
    expect(notice()).toBe(sentence);
  });

  it('still refused, as 2-D refuses «D חיתוך AB ו-BC»: a crossing whose two carriers are written through the holder', () => {
    type(["תיבה ABCDA'B'C'D'", "E אמצע BB'", 'מישור ADE']);
    st().submit("G נקודת חיתוך של AC' עם מישור ADE");
    expect(st().lastError).toMatchObject({ code: 'point-coincides', id: 'G', with: 'A' });
    expect(st().facts).toHaveLength(3);
  });
});

lockConverge(
  '3d',
  (lng) => (i18n3d.getFixedT(lng) as (k: string, o: object) => string)(RULED_CONVERGE.key, { a: 'A', b: 'B' }),
  readFileSync(new URL('../App3.tsx', import.meta.url), 'utf8'),
);
