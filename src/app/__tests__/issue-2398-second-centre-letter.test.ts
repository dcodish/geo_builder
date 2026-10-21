/**
 * #2398 ([ADR-747](../../../docs/06-decisions.md#adr-747)) — A SENTENCE THAT GIVES A CIRCLE'S CENTRE A SECOND LETTER IS
 * REFUSED, with the figure untouched.
 *
 * Measured at `37800b85` through `decideDeterministic2D`, the model mocked: «מרכז המעגל O הוא K» (every spelling)
 * escalated `weak: dropped` — the parse was `circle O`, K gone — and after «מעגל O» · «K על מעגל O» it answered «כבר
 * קיים»: the given "K is the centre" vanished. Ruled (#1153 / #1164, 2026-09-17 / 19): the second naming refuses and names
 * the holder, nothing renamed silently. With no circle O the student can see, the existing «מעגל O לא הוגדר» (the P1
 * exception of ADR-W-117).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';

// the spellings of the unit test (circle-with-other-centre-2398.test.ts) — a test file is never imported (it would re-register)
const SECOND_CENTRE_SPELLINGS = [
  'מרכז המעגל O הוא K',
  'מרכז המעגל O הוא הנקודה K',
  'מרכז מעגל O הוא K',
  'מרכזו של המעגל O הוא K',
  'המרכז של מעגל O הוא K',
  'מרכז המעגל O בנקודה K',
  'K הוא מרכז המעגל O',
  'K מרכז המעגל O',
  'K מרכז מעגל O',
  'הנקודה K היא מרכז המעגל O',
  'the centre of circle O is K',
  'K is the centre of circle O',
  'מעגל O שמרכזו K',
  'נתון מעגל O שמרכזו בנקודה K',
  'circle O centred at K',
  'circle O with centre K',
];

const st = () => useGeoStore.getState();
const view = () => {
  const f = replay(st().facts, st().seed);
  return { construction: f.construction, positions: f.positions };
};
async function submit(line: string, shown = false) {
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: view(), centresShown: shown }, line, 'he');
  commitVerdict(v, line);
  return v;
}
async function setup(pre: string[]) {
  st().clear();
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
}

beforeEach(() => llmParseMock.mockReset());

type Expect = { key: 'input.centreAlreadyNamed'; params: { holder: string; to: string } } | { key: 'errors.unknownCircle'; params: { center: string } };
const HOLDER: Expect = { key: 'input.centreAlreadyNamed', params: { holder: 'O', to: 'K' } };
const UNKNOWN: Expect = { key: 'errors.unknownCircle', params: { center: 'O' } };

const MATRIX: [string[], Expect, boolean?][] = [
  [[], UNKNOWN],
  [['מעגל O'], HOLDER],
  [['מעגל שמרכזו O'], HOLDER],
  [['מעגל O', 'מעגל P'], HOLDER],
  [['מעגל O', 'נקודה K'], HOLDER],
  [['מעגל O', 'משולש KLM'], HOLDER],
  [['מעגל O', 'K על מעגל O'], HOLDER], // was the false «כבר קיים»
  [['נתון מעגל'], UNKNOWN], // a hidden token: the student never saw O
  [['משולש ABC חסום במעגל'], UNKNOWN],
  [['משולש ABC', 'משולש ABC חסום במעגל'], UNKNOWN], // a minted circumcircle letter, not shown (#2362)
  [['משולש ABC', 'משולש ABC חסום במעגל'], HOLDER, true], // … shown: the student can see O (#2362 Q2)
  [['משולש ABC', 'משולש ABC חסום במעגל O'], HOLDER], // a named circumcircle (#2369's provenance)
  [['ריבוע ABCD', 'מעגל O חוסם את הריבוע ABCD'], HOLDER],
];

describe('#2398 — every spelling on every figure is refused at the door, the facts untouched', () => {
  for (const [pre, exp, shown] of MATRIX)
    describe(`after ${pre.length ? pre.map((l) => `«${l}»`).join(' · ') : 'an empty figure'}${shown ? ' (centres shown)' : ''}`, () => {
      for (const line of SECOND_CENTRE_SPELLINGS)
        it(`«${line}» → ${exp.key}`, async () => {
          await setup(pre);
          const before = JSON.stringify(st().facts);
          const v = await submit(line, shown);
          expect(v.kind).toBe('refuse');
          expect(v.kind === 'refuse' && v.preParse).toBe(true);
          expect(v.kind === 'refuse' && v.note).toEqual(exp);
          expect(JSON.stringify(st().facts), 'the store is byte-identical').toBe(before);
          expect(parse(line, buildParseCtx(view().construction, view().positions)), 'no rule reads it').toMatchObject({ ok: false, reason: 'not-handled' });
          expect(llmParseMock).not.toHaveBeenCalled();
        });
    });
});

describe('#2398 — controls, unchanged', () => {
  it('«מרכז המעגל O הוא O» after «מעגל O» is the reveal, not a refusal', async () => {
    await setup(['מעגל O']);
    expect((await submit('מרכז המעגל O הוא O')).kind).not.toBe('refuse');
  });
  it('«O מרכז המעגל» after «נתון מעגל» names the circle', async () => {
    await setup(['נתון מעגל']);
    expect((await submit('O מרכז המעגל')).kind).not.toBe('refuse');
  });
  it('the one-letter «מרכז המעגל הוא K» after «נתון מעגל» names the hidden centre (ADR-306)', async () => {
    await setup(['נתון מעגל']);
    const v = await submit('מרכז המעגל הוא K');
    expect(v.kind).toBe('store-op');
  });
  it('«מעגל K» still draws a circle', async () => {
    await setup([]);
    expect((await submit('מעגל K')).kind).toBe('commit');
  });
  it('the remedy is real: «שנה שם O ל-K» leaves one circle centred K, and «מרכז המעגל K הוא K» then reveals', async () => {
    await setup(['מעגל O']);
    const v = await submit('שנה שם O ל-K');
    expect(v).toMatchObject({ kind: 'store-op', op: 'rename', from: 'O', to: 'K' });
    expect(st().rename('O', 'K')).toEqual({ ok: true });
    const r = replay(st().facts, st().seed);
    expect([...r.circles.keys()]).toEqual(['circle-K']);
    expect(r.positions.has('O')).toBe(false);
    expect((await submit('מרכז המעגל K הוא K')).kind).not.toBe('refuse');
  });
});
