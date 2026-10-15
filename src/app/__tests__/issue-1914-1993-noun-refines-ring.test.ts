/**
 * #1914 + #1993 ([ADR-656](../../../docs/06-decisions.md#adr-656)) — A SECOND SHAPE NOUN THE RING CAN CARRY REFINES IT.
 *
 * Measured on `main` @ b0ef3240 through the real submit door (the model mocked): every noun stated over a ring
 * already declared — generic («מרובע ABCD», «ABCD חסום במעגל», «מרובע ABCD בר חסימה», «המרובע ABCD חסום במעגל») or
 * specific («מקבילית», «מלבן», «דלתון») — that neither the declared noun implies nor excludes was refused with the
 * engine's «D כבר מוגדרת ולא ניתן להגדיר אותה מחדש כמשהו אחר…», naming a vertex the student never chose; the one-line
 * «מלבן ABCD, מעוין ABCD» with «…המשפט הזה מגדיר את D פעמיים…».
 *
 * Root cause: ADR-619 read the quadrilateral hierarchy TWO-valued (implies → «כבר קיים», excludes → the ruled
 * refusal) over a FOUR-valued relation; a noun that NARROWS the declared one, or a SIBLING the ring can also carry,
 * fell through `shapeLowersToConstraints`' ADR-157 guard to the engine's redefinition throw. Rulings: #1914
 * 2026-10-08 (*"Yes, it refines"*; *"Yes, any narrowing refines"*), #1993 2026-10-11 (*"if a shape can be both, we
 * should say in the message that the shape is now X which is also Y"*; the wording «ABCD הוא כעת ריבוע, שהוא גם
 * מלבן וגם מעוין.» approved the same day).
 *
 * Every pair through `runSubmit`, the figure measured at 24 seeds (never crossed, never off its kind), the notes the
 * student sees read off the store's own sweep (`narrowingText`).
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { narrowingText } from '../narrowingText';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { ringSimple, type Vec } from '@/engine';
import { quadRelation, type QuadKind } from '@/engine/shapeKinds';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { stripFormatControls } from '../../../shell/bidi';

const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;

/** Type `lines`; the input notes of the LAST line and whether it committed a step. */
async function play(lines: readonly string[]): Promise<{ committed: boolean; notes: string[] }> {
  useGeoStore.getState().clear();
  let committed = false;
  let notes: string[] = [];
  for (const line of lines) {
    notes = [];
    const before = new Set(useGeoStore.getState().facts.map(groupKey)).size;
    const deps: SubmitDeps = {
      t: (key, opts) => he(key, opts),
      locale: 'he',
      ui: { setInputNote: (m) => m && notes.push(stripFormatControls(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, he, said),
    };
    await runSubmit(line, deps);
    committed = new Set(useGeoStore.getState().facts.map(groupKey)).size > before;
  }
  return { committed, notes };
}

/** The notes the App shows after the store's sweep. */
async function shown(): Promise<string[]> {
  await useGeoStore.getState().detectCrossings();
  const st = useGeoStore.getState();
  return st.narrowed?.facts === st.facts ? narrowingText(st.narrowed.list, he).map(stripFormatControls) : [];
}

const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};
const len = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The ring ABCD at 24 seeds: never crossed, and `holds` at each. */
function every24(holds: (p: Vec[]) => boolean): void {
  const st = useGeoStore.getState();
  for (let s = 0; s < 24; s++) {
    const fig = replay(st.facts, s);
    const p = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(fig.lastError, `seed ${s}`).toBeNull();
    expect(ringSimple(p), `seed ${s}: the ring is simple`).toBe(true);
    expect(holds(p), `seed ${s}`).toBe(true);
  }
}
const isSquare = (p: Vec[]) => Math.abs(angle(p[3], p[0], p[1]) - 90) < 0.1 && Math.abs(len(p[0], p[1]) - len(p[1], p[2])) < 1e-3 * len(p[0], p[1]);
const isRectangle = (p: Vec[]) => [0, 1, 2].every((i) => Math.abs(angle(p[(i + 3) % 4], p[i], p[(i + 1) % 4]) - 90) < 0.1);
const isRhombus = (p: Vec[]) => [0, 1, 2].every((i) => Math.abs(len(p[i], p[i + 1]) - len(p[i + 1], p[(i + 2) % 4])) < 1e-3 * len(p[0], p[1]));
const isParallelogram = (p: Vec[]) => Math.abs(len(p[0], p[1]) - len(p[2], p[3])) < 1e-3 * len(p[0], p[1]) && Math.abs(len(p[1], p[2]) - len(p[3], p[0])) < 1e-3 * len(p[0], p[1]);

const ENGINE_TEXT = /כבר מוגדרת|already defined|poly-|@|~/;

describe('#1993 — a sibling noun: the ring becomes the kind both name, and ONE notice says so', () => {
  const NOW = (now: string, a: string, b: string) => `ABCD הוא כעת ${now}, שהוא גם ${a} וגם ${b}.`;
  const cases: [string, string, string, (p: Vec[]) => boolean][] = [
    ['מלבן ABCD', 'מעוין ABCD', NOW('ריבוע', 'מלבן', 'מעוין'), isSquare],
    ['מעוין ABCD', 'מלבן ABCD', NOW('ריבוע', 'מעוין', 'מלבן'), isSquare],
    ['מלבן ABCD', 'דלתון ABCD', NOW('ריבוע', 'מלבן', 'דלתון'), isSquare],
    ['דלתון ABCD', 'מלבן ABCD', NOW('ריבוע', 'דלתון', 'מלבן'), isSquare],
    ['מקבילית ABCD', 'דלתון ABCD', NOW('מעוין', 'מקבילית', 'דלתון'), isRhombus],
    ['דלתון ABCD', 'מקבילית ABCD', NOW('מעוין', 'דלתון', 'מקבילית'), isRhombus],
  ];
  for (const [first, second, note, holds] of cases) {
    it(`«${first}» · «${second}» builds; exactly one notice: «${note}»`, async () => {
      const r = await play([first, second]);
      expect(r.committed).toBe(true);
      expect(r.notes.filter((n) => ENGINE_TEXT.test(n))).toEqual([]);
      expect(await shown()).toEqual([note]);
      every24(holds);
    }, 120_000);
  }
  it('the one-line comma spelling «מלבן ABCD, מעוין ABCD» does the same (case T21)', async () => {
    const r = await play(['מלבן ABCD, מעוין ABCD']);
    expect(r.committed).toBe(true);
    expect(await shown()).toEqual([NOW('ריבוע', 'מלבן', 'מעוין')]);
    every24(isSquare);
  }, 120_000);
  it('muting the second noun: the rectangle again, and no notice', async () => {
    await play(['מלבן ABCD', 'מעוין ABCD']);
    const key = groupKey(useGeoStore.getState().facts.at(-1)!);
    useGeoStore.getState().setGroupEnabled(key, false);
    expect(await shown()).toEqual([]);
  }, 120_000);
});

describe('#1914 — a noun that narrows the ring refines it (no notice: the student named the kind)', () => {
  const cases: [string[], (p: Vec[]) => boolean][] = [
    [['מקבילית ABCD', 'מלבן ABCD'], isRectangle],
    [['מקבילית ABCD', 'מעוין ABCD'], isRhombus],
    [['מלבן ABCD', 'ריבוע ABCD'], isSquare],
    [['מרובע ABCD', 'מקבילית ABCD'], isParallelogram],
    [['מרובע ABCD', 'ריבוע ABCD'], isSquare],
  ];
  for (const [lines, holds] of cases) {
    it(`«${lines.join(' · ')}» builds the narrower kind`, async () => {
      const r = await play(lines);
      expect(r.committed).toBe(true);
      expect(r.notes.filter((n) => ENGINE_TEXT.test(n))).toEqual([]);
      expect(await shown()).toEqual([]);
      every24(holds);
    }, 120_000);
  }
  it('the other order is a restatement: «מלבן ABCD» · «מקבילית ABCD» is «כבר קיים» (ADR-619, unchanged)', async () => {
    const r = await play(['מלבן ABCD', 'מקבילית ABCD']);
    expect(r.committed).toBe(false);
    expect(r.notes).toEqual([stripFormatControls(he('input.alreadyDrawn'))]);
  }, 60_000);
});

describe('#1914 — a ring inscribed with no noun takes the noun, and the circle note says what it forced', () => {
  const CIRCLE = (from: string, to: string, kindOf: string) => `כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל מ${from} ל${to} — ${kindOf}.`;
  const cases: [string, string | null, (p: Vec[]) => boolean][] = [
    ['מקבילית ABCD', CIRCLE('מקבילית', 'מלבן', 'מלבן הוא סוג של מקבילית'), isRectangle],
    ['מעוין ABCD', CIRCLE('מעוין', 'ריבוע', 'ריבוע הוא סוג של מעוין'), isSquare],
    ['מלבן ABCD', null, isRectangle],
    ['ריבוע ABCD', null, isSquare],
    ['טרפז ABCD', CIRCLE('טרפז', 'טרפז שווה שוקיים', 'טרפז שווה שוקיים הוא סוג של טרפז'), (p) => Math.abs(len(p[1], p[2]) - len(p[3], p[0])) < 1e-3 * len(p[0], p[1])],
    ['דלתון ABCD', CIRCLE('דלתון', 'דלתון ישר־זווית', 'דלתון ישר־זווית הוא סוג של דלתון'), (p) => Math.abs(angle(p[0], p[1], p[2]) - 90) < 0.1 || Math.abs(angle(p[3], p[0], p[1]) - 90) < 0.1],
  ];
  for (const [noun, note, holds] of cases) {
    it(`«ABCD חסום במעגל» · «${noun}»`, async () => {
      const r = await play(['ABCD חסום במעגל', noun]);
      expect(r.committed).toBe(true);
      expect(r.notes.filter((n) => ENGINE_TEXT.test(n))).toEqual([]);
      expect(await shown()).toEqual(note ? [note] : []);
      every24(holds);
    }, 120_000);
  }
  for (const first of ['המרובע ABCD חסום במעגל', 'מרובע ABCD בר חסימה']) {
    it(`«${first}» · «מלבן ABCD» builds the rectangle`, async () => {
      const r = await play([first, 'מלבן ABCD']);
      expect(r.committed).toBe(true);
      every24(isRectangle);
    }, 120_000);
  }
  it('«טרפז ישר זווית ABCD» after the circle stays refused, naming both (ADR-607 — the newer ruling on #1918)', async () => {
    const r = await play(['ABCD חסום במעגל', 'טרפז ישר זווית ABCD']);
    expect(r.committed).toBe(false);
    expect(r.notes.join(' ')).toMatch(/טרפז ישר זווית ABCD/);
    expect(r.notes.filter((n) => ENGINE_TEXT.test(n))).toEqual([]);
  }, 120_000);
});

describe('#1914 / #1993 — what did NOT change', () => {
  it('a noun that EXCLUDES the declared one keeps the ruled refusal (ADR-619), either order', async () => {
    for (const lines of [['טרפז ABCD', 'ריבוע ABCD'], ['מקבילית ABCD', 'טרפז ABCD'], ['דלתון ABCD', 'טרפז ABCD']]) {
      const r = await play(lines);
      expect(r.committed, lines.join(' · ')).toBe(false);
      expect(r.notes.join(' '), lines.join(' · ')).toMatch(/הצורה כבר ידועה כ־/);
    }
  }, 120_000);
  it('the relation is read off the one table: four values, symmetric where it should be', () => {
    const K: QuadKind[] = ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'isosceles-trapezoid', 'right-trapezoid', 'quadrilateral'];
    for (const a of K) {
      for (const b of K) {
        const r = quadRelation(a, b);
        const back = quadRelation(b, a);
        if (r === 'implies') expect(back === 'narrows' || a === b, `${a}/${b}`).toBe(true);
        if (r === 'siblings' || r === 'excludes') expect(back, `${a}/${b}`).toBe(r);
      }
    }
    expect(quadRelation('rectangle', 'rhombus')).toBe('siblings');
    expect(quadRelation('parallelogram', 'kite')).toBe('siblings');
    expect(quadRelation('quadrilateral', 'kite')).toBe('narrows');
    expect(quadRelation('trapezoid', 'parallelogram')).toBe('excludes');
    expect(quadRelation('isosceles-trapezoid', 'right-trapezoid')).toBe('excludes');
  });
});
