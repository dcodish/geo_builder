/**
 * #1678 ([ADR-601](../../../docs/06-decisions.md#adr-601)) — A RULE CONSUMES THE WHOLE LABEL BODY; A LOCATIVE
 * CIRCLE PHRASE IS NOT THE MEET VERB'S OBJECT.
 *
 * Measured at pickup (origin/main fa1d2492, the row's own context: circle O, A/B/C/D on it): «במעגל המיתרים AC ו-BD
 * נפגשים בנקודה E» lowered to `line-through chord-AC` + `line-circle-intersection E` — the opening «במעגל» ("in the
 * circle", the scene) read as the circle the line meets, `labelRun(body, 2)` took «AC» and the stated «BD» appeared in
 * no command. B and D already existed, so no honesty gate saw it: with C a free point the line COMMITTED a wrong E
 * with no red mark. The same sentence without «במעגל» built the crossing at once.
 *
 * Class: a parser rule that reads a fixed-size label run accepts a sentence whose body carries more stated labels
 * than it consumed. The locks below drive every member of the line-meets-circle family (`lineMeetsCircle`,
 * `extendOntoCircle`, `lineCutsCircleTwice`, `secantFarPoint`, `circumcircleMeetsSegment`) with a body longer than
 * its run, and assert the one thing the class is about: a parse that succeeds names every label the sentence
 * stated. The refusal-must-not-change guards keep the ordinary line∩circle readings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';
import { useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { ctxOf } from '../../__tests__/scenario-pipeline';

const RING = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O'];

/** The parse of `line` after `context` was committed through the real submit gate. */
function parseAfter(context: string[], line: string) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(context);
  expect(refused).toEqual([]);
  return parse(line, ctxOf(facts));
}

/** Every uppercase label token the commands mention (ids, refs and `seg-AB`-style ids alike). */
function mentioned(cmds: readonly AnyCommand[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') for (const t of v.match(/[A-Z]\d*/g) ?? []) out.add(t);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'type' && walk(x));
  };
  cmds.forEach(walk);
  return out;
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1678 — the reported sentence and its phrasings read as the crossing of AC and BD', () => {
  it.each([
    'במעגל המיתרים AC ו-BD נפגשים בנקודה E',
    'במעגל, AC ו-BD נחתכים בנקודה E',
    'במעגל O המיתר AC חותך את המיתר BD בנקודה E',
    'in the circle chords AC and BD meet at E',
    'In the circle, chords AC and BD meet at E',
  ])('«%s» → line-line-intersection AC × BD at E', (line) => {
    const r = parseAfter(RING, line);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.find((c) => c.type === 'line-line-intersection')).toMatchObject({ id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' });
    expect(r.commands.some((c) => c.type === 'line-circle-intersection')).toBe(false);
  });
});

describe('#1678 — a locative «במעגל …» is the scene, never the meet verb\'s object', () => {
  it('«במעגל O, המיתר AB חותך את הקוטר בנקודה E» is not read as line AB meeting the circle (the diameter would vanish)', () => {
    const r = parseAfter(['מעגל O', 'A על מעגל O', 'B על מעגל O'], 'במעגל O, המיתר AB חותך את הקוטר בנקודה E');
    if (r.ok) expect(r.commands.some((c) => c.type === 'line-circle-intersection')).toBe(false);
  });
});

describe('#1678 — the class: a line-meets-circle rule never claims a body longer than its run', () => {
  it.each([
    // lineMeetsCircle — a second stated line beside the circle
    [RING, 'AC חותך את המעגל ואת BD בנקודה E'],
    // extendOntoCircle — two extensions stated, one run read
    [RING, 'המשך AC והמשך BD חותכים את המעגל בנקודה E'],
    // lineCutsCircleTwice — two lines, two crossings
    [['מעגל O', 'נקודה A', 'נקודה B', 'נקודה C', 'נקודה D'], 'AC ו-BD חותכים את המעגל בנקודות F ו-G'],
    // secantFarPoint — a new far crossing beside a second stated pair
    [['מעגל O', 'נקודה A', 'נקודה B', 'נקודה C'], 'AD חותך את המעגל ואת BC בנקודה E'],
    // circumcircleMeetsSegment — two cut segments, one read
    [['משולש ABC', 'נקודה F'], 'המעגל החוסם את המשולש ABC חותך את CF ואת BF בנקודה D'],
  ] as [string[], string][])('after %j, «%s» drops no stated label', (context, line) => {
    const r = parseAfter(context, line);
    if (!r.ok) return; // deferring (the LLM, or a refusal) is honest; only a silent half-parse is the defect
    const said = line.match(/(?<![A-Za-z])[A-Z]\d*(?:[A-Z]\d*)*(?![A-Za-z])/g)!.flatMap((run) => run.match(/[A-Z]\d*/g)!);
    const got = mentioned(r.commands);
    expect(said.filter((l) => !got.has(l) && l !== 'O')).toEqual([]);
  });
});

describe('#1678 — the ordinary line∩circle readings must not change', () => {
  it('«AD חותך את המעגל בנקודה E» (D new) still reads as line AD meeting the circle', () => {
    const r = parseAfter(['מעגל O', 'A על מעגל O'], 'AD חותך את המעגל בנקודה E');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toContainEqual(expect.objectContaining({ type: 'line-circle-intersection', id: 'E', line: 'chord-AD', circle: 'circle-O' }));
  });

  it('«הישר AB פוגש את המעגל O בנקודה E» still reads as line AB meeting circle O', () => {
    const r = parseAfter(['מעגל O', 'נקודה A', 'נקודה B'], 'הישר AB פוגש את המעגל O בנקודה E');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toContainEqual(expect.objectContaining({ type: 'line-circle-intersection', id: 'E', line: 'chord-AB', circle: 'circle-O' }));
  });

  it('«E נקודת החיתוך של AD עם המעגל» (the noun form) still reads as line AD meeting the circle', () => {
    const r = parseAfter(['מעגל O', 'A על מעגל O', 'נקודה D'], 'E נקודת החיתוך של AD עם המעגל');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toContainEqual(expect.objectContaining({ type: 'line-circle-intersection', id: 'E', circle: 'circle-O' }));
  });
});

describe('#1678 — the silent drop, through the real submit gate', () => {
  it('with C a free point, the reported line never commits without B and D in its crossing', () => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(['מעגל O', 'A על מעגל O', 'B על מעגל O', 'D על מעגל O', 'נקודה C', 'במעגל המיתרים AC ו-BD נפגשים בנקודה E']);
    expect(refused).toEqual([]);
    const last = facts.filter((f) => f.utterance === 'במעגל המיתרים AC ו-BD נפגשים בנקודה E').map((f) => f.cmd);
    expect(last.some((c) => c.type === 'line-circle-intersection')).toBe(false);
    expect(last.find((c) => c.type === 'line-line-intersection')).toMatchObject({ id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' });
  });

  it('the parity row\'s line is no longer refused as "tangent": it commits the AC × BD crossing (that it is DRAWN crossing is locked in issue-1678-cyclic-order-seat.test.ts and the fixture)', () => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate([...RING, 'במעגל המיתרים AC ו-BD נפגשים בנקודה E']);
    expect(refused).toEqual([]);
    expect(facts.map((f) => f.cmd).find((c) => c.type === 'line-line-intersection')).toMatchObject({ id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' });
  });

  it('the NAMED locative «במעגל O …» is the scene too: the crossing when the chords\' ends are on O, and with C off O the lowering carries C onto O (the scene is never dropped)', () => {
    useGeoStore.getState().clear();
    const on = driveThroughGate([...RING, 'במעגל O המיתר AC חותך את המיתר BD בנקודה E']);
    expect(on.refused).toEqual([]);
    expect(on.facts.map((f) => f.cmd).find((c) => c.type === 'line-line-intersection')).toMatchObject({ id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' });
    useGeoStore.getState().clear();
    const line = 'במעגל O המיתר AC חותך את המיתר BD בנקודה E';
    const off = driveThroughGate(['מעגל O', 'A על מעגל O', 'B על מעגל O', 'D על מעגל O', 'נקודה C', line]);
    expect(off.refused).toEqual([]);
    const cmds = off.facts.filter((f) => f.utterance === line).map((f) => f.cmd);
    expect(cmds).toContainEqual(expect.objectContaining({ type: 'point-on-circle', id: 'C', circle: 'circle-O' }));
    expect(cmds.find((c) => c.type === 'line-line-intersection')).toMatchObject({ id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' });
  });
});
