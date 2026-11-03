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
 * the derivation the App renders, by the App's own `coincidencesOf`.
 *
 * Operator ruling 2026-11-02 on #1595 ("accept with message", ADR-AG-372, ADR-W-177): a NEW letter whose definition
 * FORCES it onto a named point is accepted with the same notice — the positional #1254 refusal, the second name for a
 * point built from points (#1153) and #2631's crossing on M all record now. Two straights WRITTEN through one shared
 * letter (#1175, 2-D's #1274) and a curve's centre named twice stay refused, as in 2-D.
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

  it.each([
    [['A(0,0)', 'B(4,0)', 'M אמצע AB', 'N אמצע AB'], 'M ו-N נפלו על אותה נקודה.'], // the ruling's own row
    [['משולש ABC', 'M אמצע BC', 'האנך מ-C ל-AB', 'האנך האמצעי לצלע BC והישר AM נפגשים בנקודה E'], 'M ו-E נפלו על אותה נקודה.'], // #2631
    [['ריבוע ABCD', 'AC ו-BD נחתכים בנקודה O', 'AC ו-BD נחתכים בנקודה E'], 'O ו-E נפלו על אותה נקודה.'], // one crossing named twice
    [['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,1)', 'P נקודת החיתוך של הישר AB עם הישר CD'], 'B ו-P נפלו על אותה נקודה.'], // #1254 T18
    [['משולש ABC', 'M אמצע BC', 'N אמצע AC', 'AM ו-BN נחתכים בנקודה G', 'P אמצע AB', 'CP ו-AM נחתכים בנקודה H'], 'G ו-H נפלו על אותה נקודה.'],
  ])('a NEW letter its definition forces onto a named point records, with the notice (2026-11-02): %j', (lines, sentence) => {
    const { recorded, d } = play(lines);
    expect(recorded).toHaveLength(lines.length);
    expect(d.faults).toEqual([]);
    expect(notice(d)).toBe(sentence);
  });

  it('still refused, as in 2-D: two straights written through one shared letter (#1175), a curve centre named twice', () => {
    expect(play(['משולש ABC', 'AB ו-BC נחתכים בנקודה D']).last).toMatchObject({ kind: 'refused', error: { key: 'crossing-already-named', holder: 'B' } });
    expect(play(['מעגל שמרכזו O', 'P מרכז המעגל']).last).toMatchObject({ kind: 'refused', error: { key: 'already-named', holder: 'O' } });
  });
});

lockConverge(
  'analytic',
  (lng) => analyticI18n.getFixedT(lng)(RULED_CONVERGE.key, { a: 'A', b: 'B' }) as string,
  readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'),
);
