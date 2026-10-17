/**
 * #2209 ([ADR-703](../../../docs/06-decisions.md#adr-703)) — TANGENCY RESTATEMENTS (operator ruling 2026-10-16, ballot row
 * `d2209-accept`: *"The catalog's own «מעגל O ומעגל P משיקים» builds"*; *"The touch letter stays M on a restatement (an
 * idempotent restatement, as for «משולש חסום …» typed twice), and no M is drawn beside a student's X"*).
 *
 * Measured at `b0e9dbea` through `decideDeterministic2D` → `commitVerdict` → `replay`:
 *  - «מעגל O» · «מעגל P» · «מעגל O ומעגל P משיקים [בנקודה M]» was refused `input.scope.split-statements`: the clause gate
 *    read «מעגל P משיקים» without its co-subject «מעגל O», which lowers alone to a tangent LINE the whole line never
 *    carries. Fix: a clause that only REFERS to drawn objects is the co-subject of the next (`refersOnly`, `readClauses`).
 *  - «המעגלים O ו-P משיקים» typed twice renamed the touch M→T; «מעגל P משיק למעגל O» added a second touch T; the reversed
 *    twin «המעגלים P ו-O משיקים בנקודה X» left M and X both drawn, coincident. Fix: a statement about a pair already
 *    stated tangent lowers onto the pair's record — its operand order and, with no «בנקודה», its touch letter.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { refersOnly } from '@/app/clauseCoverage';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
  commitVerdict(v, line);
  return v;
}

/** Plays `pre` (each must commit), then `last`; returns the last verdict and the commands it added. */
async function play(pre: string[], last: string) {
  st().clear();
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const n0 = st().facts.length;
  const v = await submit(last);
  return { v, added: st().facts.slice(n0).map((f) => f.cmd as AnyCommand) };
}

function kindAt(seed: number) {
  const r = replay(st().facts, seed);
  const O = r.positions.get('O')!, P = r.positions.get('P')!;
  const ro = r.circles.get('circle-O')!.r, rp = r.circles.get('circle-P')!.r;
  const d = Math.hypot(O.x - P.x, O.y - P.y);
  return { kind: Math.abs(d - (ro + rp)) < 1e-4 ? 'EXT' : Math.abs(d - Math.abs(ro - rp)) < 1e-4 ? 'INT' : 'none', r };
}

/** The kind at seeds 0–3, green every time, and the drawn capital letters. */
function expectTangent(kind: 'EXT' | 'INT', labels: string[]) {
  for (const seed of [0, 1, 2, 3]) {
    const k = kindAt(seed);
    expect(k.kind, `seed ${seed}`).toBe(kind);
    expect(k.r.violations, `seed ${seed} green`).toEqual([]);
  }
  const f = replay(st().facts, st().seed);
  expect([...f.positions.keys()].filter((k) => /^[A-Z]\d*$/.test(k)).sort(), 'drawn letters').toEqual(labels);
  expect(f.coincidences, 'no «נפלו על אותה נקודה»').toEqual([]);
  expect(llmParseMock).not.toHaveBeenCalled();
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2209 item 1 — the catalog\'s «מעגל O ומעגל P משיקים» builds on a drawn pair', () => {
  const ROWS: [string[], string, 'EXT' | 'INT'][] = [
    [PAIR, 'מעגל O ומעגל P משיקים', 'EXT'], // the report (catalog.ts)
    [PAIR, 'מעגל O ומעגל P משיקים בנקודה M', 'EXT'],
    [PAIR, 'מעגל O ומעגל P משיקים זה לזה בנקודה M', 'EXT'],
    [PAIR, 'מעגל O ומעגל P משיקים מבחוץ בנקודה M', 'EXT'],
    [PAIR, 'מעגל O ומעגל P משיקים מבפנים בנקודה M', 'INT'],
    [PAIR_EN, 'circle O and circle P are tangent', 'EXT'],
    [PAIR_EN, 'circle O and circle P are internally tangent', 'INT'],
  ];
  for (const [pre, line, kind] of ROWS)
    it(`«${line}» → commits, ${kind} at M`, async () => {
      const { v, added } = await play(pre, line);
      expect(v.kind).toBe('commit');
      expect(added).toEqual([{ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: kind === 'EXT' }]);
      expectTangent(kind, ['M', 'O', 'P']);
    });

  it('the named touch is the student\'s letter: «…משיקים בנקודה K» draws K', async () => {
    const { v } = await play(PAIR, 'מעגל O ומעגל P משיקים בנקודה K');
    expect(v.kind).toBe('commit');
    expectTangent('EXT', ['K', 'O', 'P']);
  });

  // S4: the forms that already committed lower exactly as before
  for (const [line, external] of [
    ['מעגל O ומעגל P משיקים זה לזה', true],
    ['מעגל O ומעגל P משיקים מבפנים', false],
    ['מעגל O ומעגל P משיקים מבחוץ', true],
  ] as const)
    it(`unchanged: «${line}» → the same command`, async () => {
      const { v, added } = await play(PAIR, line);
      expect(v.kind).toBe('commit');
      expect(added).toEqual([{ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external }]);
    });

  // S5/S6: «מעגל O» is a DECLARATION there (a given), so the line is two statements and keeps its advisory
  for (const [pre, line] of [
    [[], 'מעגל O ומעגל P משיקים'],
    [['מעגל O'], 'מעגל O ומעגל P משיקים בנקודה M'],
  ] as const)
    it(`unchanged: «${[...pre, line].join(' · ')}» commits with the one-input-per-line tip`, async () => {
      const { v } = await play([...pre], line);
      expect(v.kind).toBe('commit');
      expect(v.kind === 'commit' && v.note && 'key' in v.note && v.note.key).toBe('input.scope.split-advisory');
      expectTangent('EXT', ['M', 'O', 'P']);
    });

  // S7: sibling pair sentences on a drawn pair still commit
  for (const [pre, line] of [
    [PAIR, 'מעגל O ומעגל P זרים'],
    [PAIR, 'מעגל O ומעגל P מוכלים'],
    [['משולש ABC', 'משולש DEF'], 'משולש ABC ומשולש DEF חופפים'],
    [['משולש ABC', 'משולש DEF'], 'המשולש ABC והמשולש DEF דומים'],
  ] as const)
    it(`unchanged: «${line}» on the drawn pair commits`, async () => {
      expect((await play([...pre], line)).v.kind).toBe('commit');
    });

  it('a reference-only piece never hides the clause after it: «מעגל O ו-D על BC» still carries D on BC', async () => {
    const { v, added } = await play(['משולש ABC', 'מעגל O', 'נקודה D'], 'מעגל O ו-D על BC');
    expect(v.kind).toBe('commit');
    expect(added).toContainEqual({ type: 'point-on-segment', id: 'D', a: 'B', b: 'C' });
  });
});

describe('#2209 items 2–3 — a restated tangency lands on the stated one', () => {
  const NOOPS: [string, string[], string, string[]][] = [
    ['typed twice (the report)', [...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים O ו-P משיקים', ['M', 'O', 'P']],
    ['the circle-subject form', [...PAIR, 'המעגלים O ו-P משיקים'], 'מעגל O משיק למעגל P', ['M', 'O', 'P']],
    ['the pair reversed', [...PAIR, 'המעגלים O ו-P משיקים'], 'מעגל P משיק למעגל O', ['M', 'O', 'P']],
    ['the plural pair reversed', [...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים P ו-O משיקים', ['M', 'O', 'P']],
    ['the catalog form after the plural', [...PAIR, 'המעגלים O ו-P משיקים'], 'מעגל O ומעגל P משיקים', ['M', 'O', 'P']],
    ['English', [...PAIR_EN, 'circles O and P are tangent'], 'circles O and P are tangent', ['M', 'O', 'P']],
    ['«מבחוץ» then plain', [...PAIR, 'המעגלים O ו-P משיקים מבחוץ'], 'המעגלים O ו-P משיקים', ['M', 'O', 'P']],
    ['plain then «מבחוץ»', [...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים O ו-P משיקים מבחוץ', ['M', 'O', 'P']],
    ['«מבפנים» twice', [...PAIR, 'המעגלים O ו-P משיקים מבפנים'], 'המעגלים O ו-P משיקים מבפנים', ['M', 'O', 'P']],
    ['the student named the touch X', [...PAIR, 'המעגלים O ו-P משיקים בנקודה X'], 'המעגלים P ו-O משיקים', ['O', 'P', 'X']],
  ];
  for (const [how, pre, line, labels] of NOOPS)
    it(`${how}: «${line}» → «זה כבר קיים באיור», no T`, async () => {
      const { v, added } = await play(pre, line);
      expect(v.kind).toBe('noop');
      expect(added).toEqual([]);
      expectTangent(/מבפנים/.test(line) ? 'INT' : 'EXT', labels);
    });

  it('the fresh pair: «שני מעגלים משיקים» · «המעגלים משיקים» → a no-op, the touch stays M', async () => {
    const { v } = await play(['שני מעגלים משיקים'], 'המעגלים משיקים');
    expect(v.kind).toBe('noop');
    const f = replay(st().facts, st().seed);
    expect(f.positions.has('M') && !f.positions.has('T')).toBe(true);
    expect(f.violations).toEqual([]);
  });

  const TWINS: [string, string[], string, 'EXT' | 'INT'][] = [
    ['the report', [...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים P ו-O משיקים בנקודה X', 'EXT'],
    ['the circle-subject form', [...PAIR, 'המעגלים O ו-P משיקים'], 'מעגל P משיק למעגל O בנקודה X', 'EXT'],
    ['after «מבחוץ»', [...PAIR, 'המעגלים O ו-P משיקים מבחוץ'], 'המעגלים P ו-O משיקים בנקודה X', 'EXT'],
    ['the touch-point sentence reversed', [...PAIR, 'המעגלים O ו-P משיקים'], 'X נקודת ההשקה של המעגלים P ו-O', 'EXT'],
    ['control: the same order', [...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים O ו-P משיקים בנקודה X', 'EXT'],
    ['control: internal reversed', [...PAIR, 'המעגלים O ו-P משיקים מבפנים'], 'המעגלים P ו-O משיקים מבפנים בנקודה X', 'INT'],
  ];
  for (const [how, pre, line, kind] of TWINS)
    it(`${how}: «${line}» → M renamed X, only X drawn`, async () => {
      const { v, added } = await play(pre, line);
      expect(v.kind).toBe('commit');
      expect(v.kind === 'commit' && v.binds).toEqual([{ op: 'rename', from: 'M', to: 'X' }]);
      expect(added.filter((c) => c.type === 'circles-tangent')).toEqual([
        { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'X', external: kind === 'EXT' },
      ]);
      expectTangent(kind, ['O', 'P', 'X']);
    });

  it('control: «…משיקים» · «…משיקים בנקודה M» is still a no-op', async () => {
    const { v } = await play([...PAIR, 'המעגלים O ו-P משיקים'], 'המעגלים O ו-P משיקים בנקודה M');
    expect(v.kind).toBe('noop');
  });

  it('a pair not yet stated tangent still mints M in the line\'s own order', async () => {
    const { added } = await play(PAIR, 'מעגל P משיק למעגל O');
    expect(added).toEqual([{ type: 'circles-tangent', circle1: 'circle-P', circle2: 'circle-O', at: 'M', external: true }]);
  });
});

describe('#2209 — refersOnly (the clause gate\'s reference predicate)', () => {
  const known = new Set(['O', 'circle-O', 'B', 'C']);
  it('a declaration of a drawn circle only refers to it', () =>
    expect(refersOnly([{ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand], known)).toBe(true));
  it('a new circle is a given', () =>
    expect(refersOnly([{ type: 'circle', id: 'circle-P', center: 'P', radius: 5, freeRadius: true } as AnyCommand], known)).toBe(false));
  it('a membership on a drawn point is never a reference', () =>
    expect(refersOnly([{ type: 'point-on-circle', id: 'B', circle: 'circle-O' } as AnyCommand], known)).toBe(false));
  it('nothing is not a reference', () => expect(refersOnly([], known)).toBe(false));
});
