/**
 * #1595 (ADR-AG-366, ADR-W-176) — two letters the givens put on one dot are accepted, and the page always says so, in
 * 2-D's sentence «{{a}} ו-{{b}} נפלו על אותה נקודה.» (the suite key `suite.notice.converge`).
 *
 * Operator, 2026-09-30, playing round #1571 T23 in this tree: *"when 2 dots are on top of each other we should accept
 * but always give a message about it. this is correct for all tools"*. Merged into #1595 (2026-11-01): #2401, «קטע
 * N1N2» over two points that coincide drawn as a zero-length segment with no complaint — "the defect is the missing
 * notice, not the missing refusal".
 *
 * Each line goes through `decideSubmit` (the App's door) and the notice is read from `derive(lines, configuration)`,
 * the derivation the App renders, by the App's own `coincidencesOf`. The refusals the 2026-09-20 rulings keep — a NEW
 * name defined onto a point that is already there (#1175, #1254) — are locked as refusals.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyticI18n } from '../i18n';
import { decideSubmit } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { coincidencesOf } from '../app/coincidences';
import { convergeText } from '../../shell/converge';
import { lockConverge, RULED_CONVERGE } from '../../shell/__tests__/fixtures/converge-1595';
import type { Seed } from '../engine/evaluate';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o: Record<string, string>) => plain(analyticI18n.getFixedT('he')(k, o) as string);

/** Type each line through the App's door; the recorded lines, the drawn derivation, and the last verdict. */
function play(lines: readonly string[]): { recorded: string[]; d: Derivation; last: ReturnType<typeof decideSubmit> } {
  const recorded: string[] = [];
  let seed: Seed = 0;
  let last = decideSubmit(lines[0], recorded, seed);
  for (const line of lines) {
    last = decideSubmit(line, recorded, seed);
    if (last.kind !== 'record') break;
    recorded.push(last.line);
    if (last.configuration) seed = last.configuration;
  }
  return { recorded, d: derive(recorded, seed), last };
}
const notice = (d: Derivation) => convergeText(coincidencesOf(d), he);

describe('#1595 — analytic: a forced coincidence records, with the notice', () => {
  it.each([
    [['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'שיעור ה-x של Y הוא 0'], 'V ו-Y נפלו על אותה נקודה.'], // #1571 T23
    [['N1(1,1)', 'N2(1,1)', 'קטע N1N2'], 'N1 ו-N2 נפלו על אותה נקודה.'], // #2401
    [['משולש ABC', 'AB=4', 'D על AB', 'AD=4'], 'B ו-D נפלו על אותה נקודה.'], // 2-D's D-on-B row
  ])('%j', (lines, sentence) => {
    const { recorded, d } = play(lines);
    expect(recorded).toHaveLength(lines.length);
    expect(d.faults).toEqual([]);
    expect(notice(d)).toBe(sentence);
  });

  it('it holds while the drawing has the pair: without the line that forced it, it is gone', () => {
    const { recorded } = play(['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'שיעור ה-x של Y הוא 0']);
    expect(coincidencesOf(derive(recorded.slice(0, 3), 0))).toEqual([]);
  });

  it('control: a point the givens leave free is drawn apart, with no notice (#1526)', () => {
    const { d } = play(['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x']);
    expect(coincidencesOf(d)).toEqual([]);
    expect(coincidencesOf(play(['ריבוע ABCD']).d)).toEqual([]);
  });

  it('unchanged refusal: a NEW name defined onto a point that is already there (#1254)', () => {
    const { recorded, last } = play(['A(0,0)', 'B(4,0)', 'M אמצע AB', 'N אמצע AB']);
    expect(recorded).toHaveLength(3);
    expect(last).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'M' } });
  });
});

lockConverge(
  'analytic',
  (lng) => analyticI18n.getFixedT(lng)(RULED_CONVERGE.key, { a: 'A', b: 'B' }) as string,
  readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
);
