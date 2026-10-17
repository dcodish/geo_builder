/**
 * #2233 ([ADR-AG-290](../../docs/06c-decisions-analytic.md#adr-ag-290)) — a choice note is said while the ADMITTED
 * CONFIGURATIONS differ on its option, not while more than one option is merely written down.
 *
 * Measured before (4b0b4592): on the operator's rhombus, after `x_A > 0 · C על החלק השלילי של ציר x · B על החלק
 * החיובי של ציר y`, the axes note «הכלי לא יודע איזה קודקוד נמצא על איזה ציר…» stayed (4 options left) while the
 * whole pool held ONE axis assignment and the data panel showed every vertex fixed. The same in every spelling
 * (signs: 16 options, «A על ציר ה-x»: 8) and in every other kind the pool can judge (an isosceles, a leg, an obtuse
 * triangle placed by coordinates).
 *
 * Every case runs the real path: `derive` → `unstatedChoices` → `unstatedChoiceText`, taught lines through `decideSubmit`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { unstatedChoiceText } from '../app/unstatedChoice';
import { derive } from '../engine/derive';
import { configurationPool } from '../engine/evaluate';
import { unstatedChoices } from '../engine/unstatedChoices';
import { analyticI18n } from '../i18n';
import operator from './fixtures/issue-2233-rhombus-axes-stated.analytic.json';

const he = analyticI18n.getFixedT('he');
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const notes = (lines: string[], seed = 0) => unstatedChoices(derive(lines, seed));

const HEAD = operator.lines.slice(0, 5);

describe('#2233 — the axes note goes once the givens fix every vertex, in any spelling', () => {
  it('the operator\'s sequence (fixture): builds green, every line records, and no choice note is said', () => {
    const lines = operator.lines;
    for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
    const d = derive(lines, operator.seed);
    expect(d.faults).toEqual([]);
    expect(unstatedChoices(d)).toEqual([]);
  });

  it.each([
    ['signs', ['x_A > 0', 'x_C < 0', 'y_B > 0']],
    // #2230 (ADR-AG-291): with the strict judge banded, A's side alone leaves one axis assignment in the pool.
    ["A's side alone", ['x_A > 0']],
    ['one vertex on an axis — the rhombus forces the rest', ['A על ציר ה-x']],
    ['two vertices on axes', ['A על ציר ה-x', 'B על ציר ה-y']],
  ])('%s: no note', (_, tail) => {
    expect(notes([...HEAD, ...tail])).toEqual([]);
  });

  it('control — the head alone still says the note, with every vertex open', () => {
    const [c] = notes(HEAD);
    expect(c?.kind).toBe('axes');
    if (c?.kind !== 'axes') return;
    expect([...c.open].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(plain(unstatedChoiceText(c, (k, o) => he(k, o)))).toMatch(/^הכלי לא יודע איזה קודקוד נמצא על איזה ציר/);
  });

  it('a coordinate that places a vertex takes it out of `open`, so the note never teaches a line already settled', () => {
    const lines = ['משולש ABC', 'קודקודי המשולש מונחים על הצירים', 'A(3,0)', 'B(0,4)'];
    const [c] = notes(lines);
    expect(c?.kind).toBe('axes');
    if (c?.kind !== 'axes') return;
    expect(c.open).toEqual(['C']);
    const taught = /למשל «([^»]+)»/.exec(plain(unstatedChoiceText(c, (k, o) => he(k, o))))![1];
    expect(taught).toMatch(/^C על ציר ה-[xy]$/);
    expect(decideSubmit(taught, lines, 0).kind).toBe('record');
    expect(notes([...lines, taught])).toEqual([]);
  });
});

describe('#2233 — the class: every kind the pool can judge', () => {
  it.each([
    ['equal-pair, isosceles placed by coordinates', ['משולש ABC שווה שוקיים', 'A(0,0)', 'B(4,0)', 'C(2,5)']],
    ['equal-pair, a leg placed by coordinates', ['משולש ABC', 'אורך השוק AB הוא 5', 'A(0,0)', 'B(3,4)', 'C(6,0)']],
    ['obtuse-vertex placed by coordinates', ['משולש קהה זווית ABC', 'A(0,0)', 'B(4,0)', 'C(5,1)']],
  ])('%s: no note', (_, lines) => {
    expect(derive(lines, 0).faults).toEqual([]);
    expect(notes(lines)).toEqual([]);
  });

  it.each([
    ['equal-pair', ['משולש ABC שווה שוקיים', 'A(0,0)', 'B(4,0)']],
    ['obtuse-vertex', ['משולש קהה זווית ABC', 'A(0,0)', 'B(4,0)']],
  ])('control — %s still open across configurations: the note stays', (kind, lines) => {
    expect(notes(lines).map((c) => c.kind)).toEqual([kind]);
  });
});

describe('#2233 — pending like every pool-gated row (#1473)', () => {
  it('a deferred, incomplete pool keeps the note as written and reports pending; the completed pool clears it', () => {
    const d = derive(operator.lines, 0);
    const pool = configurationPool(d.construction);
    pool.defer();
    // derive evaluates only the seeds it draws from; the rest is the idle loop's (ADR-AG-180)
    expect(pool.complete()).toBe(false);
    expect(unstatedChoices(d).map((c) => c.kind)).toEqual(['axes']);
    expect(pool.pendingShown).toBe(true);
    pool.fill();
    expect(unstatedChoices(d)).toEqual([]);
  });
});
