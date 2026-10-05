/**
 * #1771 ([ADR-589](../../../docs/06-decisions.md#adr-589)) — «חצי מעגל ABC» ON A TRIANGLE PUTS ALL THREE VERTICES
 * ON THE SEMICIRCLE, AND THE FIGURE PICKS THE DIAMETER (Thales).
 *
 * Operator, round #1767 play: *"half a circle is possible in this case where AB is the diameter"* — on
 * «ABC משולש ישר זוית» · «AC=15» · «BC=10» the line «חצי מעגל ABC» was refused after 33 s, because ADR-534
 * reads a 3-run centre-first and no vertex of that triangle can be the centre. Ruled 2026-10-04: when the
 * three points are not collinear, all three lie on the semicircle and the diameter is the side that can be
 * opposite the right angle, whatever order the letters were written in.
 *
 * Everything below is driven through the real submit path (`runSubmit`, the LLM mocked — standing rule 2)
 * and read off the BUILT figure, never off a command list, except where the row is about the grammar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { thalesReadings } from '../roleReadings';
import { replay, useGeoStore } from '@/store/geoStore';
import { parse, buildParseCtx } from '@/parser';
import type { AnyCommand } from '@/engine';
import i18n from '@/i18n';

type V = { x: number; y: number };

async function submit(line: string): Promise<{ accepted: boolean; notes: string[] }> {
  const notes: string[] = [];
  let cleared = 0;
  const deps: SubmitDeps = {
    t: (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string,
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m.replace(/[⁦-⁩]/g, '')); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => { cleared++; }, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  await runSubmit(line, deps);
  return { accepted: cleared === 1, notes };
}

async function build(lines: string[]): Promise<string[]> {
  useGeoStore.getState().clear();
  const notes: string[] = [];
  for (const l of lines) {
    const r = await submit(l);
    expect(r.accepted, `«${l}» is accepted (${r.notes.join(' | ')})`).toBe(true);
    notes.push(...r.notes);
  }
  return notes;
}

const figure = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const at = (id: string): V => d.positions.get(id)!;
  return { d, at };
};
const dist = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y);
const angleAt = (v: V, a: V, b: V) =>
  (Math.acos(((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (dist(a, v) * dist(b, v))) * 180) / Math.PI;

/** The semicircle's diameter, read off the built arc, with the vertex it says is on it. */
function semicircleOf(): { diameter: string; on: string } {
  const { d } = figure();
  const arc = d.construction.objects.find((o) => o.kind === 'arc') as { from: string; to: string; bulgeRef?: string } | undefined;
  expect(arc, 'an arc was drawn').toBeTruthy();
  return { diameter: [arc!.from, arc!.to].sort().join(''), on: arc!.bulgeRef ?? '' };
}

/** Every vertex the semicircle claims is on it really is — on its circle AND on the drawn half. */
function expectOnSemicircle(diameter: [string, string], on: string) {
  const { d, at } = figure();
  expect(d.lastError).toBeNull();
  expect(d.violations).toEqual([]);
  const [A, B, C] = [at(diameter[0]), at(diameter[1]), at(on)];
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const r = dist(A, B) / 2;
  expect(Math.abs(dist(M, C) - r) / r, `${on} on the circle on ${diameter.join('')}`).toBeLessThan(1e-6);
  expect(angleAt(C, A, B), `the angle at ${on} is right (Thales)`).toBeCloseTo(90, 4);
}

const RIGHT_15_10 = ['ABC משולש ישר זוית', 'AC=15', 'BC=10'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ commands: [], none: true });
});

describe('#1771 — the operator\'s figure', () => {
  it('«חצי מעגל ABC» builds: AB is the diameter, the right angle at C, C on the arc — and it teaches the side it chose', async () => {
    await build(RIGHT_15_10);
    const r = await submit('חצי מעגל ABC');
    expect(r.accepted, r.notes.join(' | ')).toBe(true);
    expect(semicircleOf()).toEqual({ diameter: 'AB', on: 'C' });
    expectOnSemicircle(['A', 'B'], 'C');
    const { at } = figure();
    expect(dist(at('A'), at('C'))).toBeCloseTo(15, 4);
    expect(dist(at('B'), at('C'))).toBeCloseTo(10, 4);
    expect(r.notes.join(' ')).toContain('חצי מעגל שקוטרו AB העובר דרך C');
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 120_000);

  it.each(['חצי מעגל BCA', 'חצי מעגל CAB', 'חצי מעגל ACB', 'חצי מעגל CBA', 'semicircle ABC'])(
    '«%s» — whatever the letter order, the diameter is the side opposite the right angle',
    async (line) => {
      await build(RIGHT_15_10);
      expect((await submit(line)).accepted).toBe(true);
      expect(semicircleOf()).toEqual({ diameter: 'AB', on: 'C' });
      expectOnSemicircle(['A', 'B'], 'C');
    },
    120_000,
  );
});

describe('#1771 — the figure picks the diameter, not the letters (the class)', () => {
  it('a right angle stated at A, with its legs, makes BC the diameter', async () => {
    await build(['משולש ABC', 'זווית BAC = 90', 'AB=5', 'AC=12']);
    expect((await submit('חצי מעגל ABC')).accepted).toBe(true);
    expect(semicircleOf()).toEqual({ diameter: 'BC', on: 'A' });
    expectOnSemicircle(['B', 'C'], 'A');
  }, 120_000);

  it('a stated right angle at B makes AC the diameter', async () => {
    await build(['משולש ABC', 'זווית ABC = 90']);
    expect((await submit('חצי מעגל ABC')).accepted).toBe(true);
    expect(semicircleOf()).toEqual({ diameter: 'AC', on: 'B' });
    expectOnSemicircle(['A', 'C'], 'B');
  }, 120_000);

  it('three vertices of a square: the diameter is the diagonal AC, B on the arc', async () => {
    await build(['ריבוע ABCD']);
    expect((await submit('חצי מעגל ABC')).accepted).toBe(true);
    expect(semicircleOf()).toEqual({ diameter: 'AC', on: 'B' });
    expectOnSemicircle(['A', 'C'], 'B');
  }, 120_000);

  it('an unseated right triangle keeps the right angle where it is drawn — the figure does not jump', async () => {
    await build(['ABC משולש ישר זוית']);
    const before = figure();
    const was = ['A', 'B', 'C'].map((id) => before.at(id));
    expect((await submit('חצי מעגל ABC')).accepted).toBe(true);
    const after = figure();
    ['A', 'B', 'C'].forEach((id, i) => expect(dist(after.at(id), was[i]), `${id} did not move`).toBeLessThan(1e-6));
    const { on } = semicircleOf();
    const [p, q] = ['A', 'B', 'C'].filter((x) => x !== on) as [string, string];
    expectOnSemicircle([p, q], on);
  }, 120_000);
});

describe('#1771 — what cannot hold is still refused', () => {
  it('an equilateral triangle has no right angle, so no side can be the diameter', async () => {
    await build(['משולש שווה צלעות ABC']);
    const r = await submit('חצי מעגל ABC');
    expect(r.accepted).toBe(false);
    expect(useGeoStore.getState().facts.some((f) => f.utterance === 'חצי מעגל ABC')).toBe(false);
  }, 120_000);

  it('a STATED diameter is honoured as stated, never re-read: BC cannot be the diameter when AC = 15 > BC = 10', async () => {
    await build(RIGHT_15_10);
    expect((await submit('חצי מעגל שקוטרו BC העובר דרך A')).accepted).toBe(false);
  }, 120_000);
});

describe('#1771 — the grammar', () => {
  const ctxAfter = async (lines: string[]) => {
    await build(lines);
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    return buildParseCtx(d.construction, d.positions);
  };
  const cmds = (u: string, ctx: Parameters<typeof parse>[1]): AnyCommand[] => {
    const r = parse(u, ctx);
    expect(r.ok, `«${u}» parses`).toBe(true);
    return r.ok ? r.commands : [];
  };

  it('the explicit spelling reads the diameter and the third point, in Hebrew and English', async () => {
    const ctx = await ctxAfter(RIGHT_15_10);
    for (const u of ['חצי מעגל שקוטרו AB העובר דרך C', 'חצי מעגל שקוטרו AB העובר בנקודה C', 'semicircle with diameter AB through C']) {
      const c = cmds(u, ctx);
      expect(c.find((x) => x.type === 'midpoint'), u).toMatchObject({ a: 'A', b: 'B' });
      expect(c.some((x) => x.type === 'point-on-circle' && x.id === 'C'), u).toBe(true);
      expect(c.find((x) => x.type === 'arc'), u).toMatchObject({ spanDeg: 180, bulgeRef: 'C', bulgeToward: true });
    }
  }, 120_000);

  it('three LOOSE points keep the ADR-534 centre-first reading — nothing says they are not on one line', async () => {
    const ctx = await ctxAfter(['נקודה D', 'נקודה C', 'נקודה O']);
    const arc = cmds('חצי מעגל ODC', ctx).find((x) => x.type === 'arc');
    expect(arc).toMatchObject({ center: 'O', spanDeg: 180 });
    expect(arc).not.toHaveProperty('bulgeRef');
  }, 120_000);

  it('«C על חצי המעגל» reads like «C על המעגל», and builds without the LLM', async () => {
    const ctx = await ctxAfter(['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'חצי מעגל שקוטרו AB']);
    expect(cmds('C על חצי המעגל', ctx)).toEqual(cmds('C על המעגל', ctx));
    expect((await submit('C על חצי המעגל')).accepted).toBe(true);
    expectOnSemicircle(['A', 'B'], 'C');
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 120_000);

  it('thalesReadings leaves an explicit diameter and a centre-first run alone', async () => {
    const ctx = await ctxAfter(RIGHT_15_10);
    const sample = () => figure().d.positions;
    expect(thalesReadings('חצי מעגל שקוטרו AB העובר דרך C', cmds('חצי מעגל שקוטרו AB העובר דרך C', ctx), sample)).toBeNull();
    const all = thalesReadings('חצי מעגל ABC', cmds('חצי מעגל ABC', ctx), sample)!;
    expect(all.map((r) => r.on)).toEqual(['C', expect.any(String), expect.any(String)]);
    expect(all[0]).toMatchObject({ score: expect.any(Number), utterance: 'חצי מעגל שקוטרו AB העובר דרך C' });
    expect(all[0].score!).toBeLessThan(1e-6);
  }, 120_000);
});
