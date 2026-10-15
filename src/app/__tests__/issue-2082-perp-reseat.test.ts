/**
 * #2082 ([ADR-658](../../../docs/06-decisions.md#adr-658)) — A RIGHT ANGLE STATED AS A PERPENDICULAR MOVES THE
 * RIGHT TRIANGLE'S RIGHT ANGLE, AS THE SAME RIGHT ANGLE STATED AS AN ANGLE DOES.
 *
 * Operator ruling 2026-10-14 (card d14b-found-accept): *"«משולש ישר-זווית ABC» · «AB ⟂ BC» (also «AB גובה», «CB גובה
 * לצלע AB») builds the way «זווית B ישרה» does: the right angle moves to B. It is the same statement in two
 * spellings."*
 *
 * Measured on `main` @ b0ef3240 through `decideDeterministic2D` → `commitVerdict` → `replay` (no post-commit
 * search): «AB ⟂ BC» committed as a red over-constrained row with the right angle left at C; the browser's
 * post-commit config search later rescued that order by turning the seat, but «AB ⟂ BC» typed BEFORE the noun was
 * refused («…סותר נתון קודם… CA ⟂ CB») while «זווית ABC = 90» before the noun built. Root cause: the ADR-163 reseat's
 * pin set (`explicitRightAngleVerts`) collected only 90° `set-angle` commands.
 *
 * This harness has NO post-commit search on purpose: the fold itself must seat the right angle where the student
 * stated it. The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { otherUtteranceForError } from '@/app/errorSubject';
import { humanizeError } from '@/i18n/humanizeError';
import { cyclableSeat } from '@/replay/core';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
type V = { kind: string; note?: { explain?: string } };
type P = { x: number; y: number };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  const said: string[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    const ex = v.note?.explain;
    said.push(ex ? humanizeError(ex, i18n.getFixedT('he') as never, line, otherUtteranceForError(st().facts, ex)).replace(/[⁦-⁩]/g, '') : '');
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { verdicts, said, last: verdicts.at(-1)!, facts: st().facts };
}

const angleAt = (pos: Map<string, P>, v: string, a: string, b: string) => {
  const V = pos.get(v)!, A = pos.get(a)!, B = pos.get(b)!;
  const u = { x: A.x - V.x, y: A.y - V.y }, w = { x: B.x - V.x, y: B.y - V.y };
  return (Math.acos((u.x * w.x + u.y * w.y) / Math.hypot(u.x, u.y) / Math.hypot(w.x, w.y)) * 180) / Math.PI;
};

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const RT = 'משולש ישר-זווית ABC';
/** Every spelling of «the right angle is at B» on the noun's triangle; `en` is the locale it is typed in. */
const AT_B: [string, string, 'he' | 'en'][] = [
  [RT, 'AB ⟂ BC', 'he'],
  [RT, 'AB ⊥ BC', 'he'],
  [RT, 'AB מאונך ל-BC', 'he'],
  [RT, 'AB גובה', 'he'],
  [RT, 'CB גובה לצלע AB', 'he'],
  ['right triangle ABC', 'AB ⟂ BC', 'en'],
];

describe('#2082 — every spelling of a right angle at B moves the noun’s right angle to B, in the fold itself', () => {
  for (const [noun, line, lang] of AT_B) {
    it(`«${noun}» · «${line}» builds green with the right angle and its knee at B, the figure of «זווית B ישרה»`, async () => {
      const g = await play([noun, line], lang);
      expect(g.verdicts.map((v) => v.kind)).toEqual(['commit', 'commit']);
      const twin = await play([RT, 'זווית B ישרה']);
      for (const seed of [0, 1, 2, 3]) {
        const r = replay(g.facts, seed);
        expect(Object.values(r.status).every((s) => s === 'ok'), `seed ${seed}: every row green`).toBe(true);
        expect(r.pending, `seed ${seed}: no pending row`).toBe(false);
        expect(r.violations, `seed ${seed}`).toHaveLength(0);
        const pos = r.positions as Map<string, P>;
        expect(angleAt(pos, 'B', 'A', 'C'), `seed ${seed}: ∠ABC`).toBeCloseTo(90, 6);
        expect(r.angleMarks.some((m) => m.right && m.vertex === 'B'), `seed ${seed}: the knee is drawn at B`).toBe(true);
        expect(r.angleMarks.some((m) => m.right && m.vertex === 'C'), `seed ${seed}: no knee left at C`).toBe(false);
        const t = replay(twin.facts, seed).positions as Map<string, P>;
        for (const id of ['A', 'B', 'C']) {
          expect(pos.get(id)!.x, `seed ${seed}: ${id}.x as «זווית B ישרה» draws it`).toBeCloseTo(t.get(id)!.x, 6);
          expect(pos.get(id)!.y, `seed ${seed}: ${id}.y`).toBeCloseTo(t.get(id)!.y, 6);
        }
      }
      expect(cyclableSeat(g.facts), 'the stated right angle pins the seat, as «זווית B ישרה» does').toBeUndefined();
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('«BA ⟂ AC» moves the right angle to A', async () => {
    const g = await play([RT, 'BA ⟂ AC']);
    expect(g.last.kind).toBe('commit');
    const r = replay(g.facts, 0);
    expect(Object.values(r.status).every((s) => s === 'ok')).toBe(true);
    expect(angleAt(r.positions as Map<string, P>, 'A', 'B', 'C')).toBeCloseTo(90, 6);
  });

  it('the other entry order: «AB ⟂ BC» then «משולש ישר-זווית ABC» builds, as «זווית ABC = 90» then the noun does', async () => {
    for (const first of ['AB ⟂ BC', 'זווית ABC = 90']) {
      const g = await play([first, RT]);
      expect(g.verdicts.map((v) => v.kind), first).toEqual(['commit', 'commit']);
      const r = replay(g.facts, 0);
      expect(Object.values(r.status).every((s) => s === 'ok'), first).toBe(true);
      expect(angleAt(r.positions as Map<string, P>, 'B', 'A', 'C'), first).toBeCloseTo(90, 4);
    }
  });

  it('stability: the ⟂ moves only the seat — A keeps its place and its seed freedom', async () => {
    const before = await play([RT]);
    const after = await play([RT, 'AB ⟂ BC']);
    for (const seed of [0, 1, 2]) {
      const a0 = replay(before.facts, seed).positions.get('A')!;
      const a1 = replay(after.facts, seed).positions.get('A')!;
      expect(a1.x, `seed ${seed}`).toBeCloseTo(a0.x, 6);
      expect(a1.y, `seed ${seed}`).toBeCloseTo(a0.y, 6);
    }
  });

  it('controls: «AC ⟂ BC» on the default seat is unchanged; a ⟂ to a segment outside the triangle pins nothing', async () => {
    const c = await play([RT, 'AC ⟂ BC']);
    expect(c.last.kind).toBe('commit');
    expect(angleAt(replay(c.facts, 0).positions as Map<string, P>, 'C', 'A', 'B')).toBeCloseTo(90, 6);
    const out = await play([RT, 'AB ⟂ BD']);
    expect(out.last.kind).toBe('commit');
    const r = replay(out.facts, 0);
    expect(angleAt(r.positions as Map<string, P>, 'C', 'A', 'B'), 'the right angle stays at C').toBeCloseTo(90, 6);
    expect(cyclableSeat(out.facts), '«AB ⟂ BD» says nothing about the triangle’s seat').toBeDefined();
  });

  it('two stated right angles in the right triangle: the LATER line is refused naming the earlier one, in either order and spelling', async () => {
    const cases: [string, string, string][] = [
      ['זווית C ישרה', 'AB ⟂ BC', 'לא ניתן: «AB ⟂ BC» סותר את «זווית C ישרה» — אי אפשר לקיים את שניהם יחד. הסיבה: AB ⟂ BC.'],
      ['AB ⟂ BC', 'זווית C ישרה', 'לא ניתן: «זווית C ישרה» סותר את «AB ⟂ BC» — אי אפשר לקיים את שניהם יחד. הסיבה: ∠ACB = 90°.'],
      ['זווית B ישרה', 'זווית C ישרה', 'לא ניתן: «זווית C ישרה» סותר את «זווית B ישרה» — אי אפשר לקיים את שניהם יחד. הסיבה: ∠ACB = 90°.'],
      ['זווית C ישרה', 'זווית B ישרה', 'לא ניתן: «זווית B ישרה» סותר את «זווית C ישרה» — אי אפשר לקיים את שניהם יחד. הסיבה: ∠ABC = 90°.'],
    ];
    for (const [first, second, msg] of cases) {
      const g = await play([RT, first, second]);
      expect(g.verdicts.map((v) => v.kind), `${first} · ${second}`).toEqual(['commit', 'commit', 'refuse']);
      expect(g.said[2]).toBe(msg);
      expect(Object.values(replay(g.facts, 0).status).every((s) => s === 'ok'), 'the earlier statement stays green').toBe(true);
    }
  });
});
