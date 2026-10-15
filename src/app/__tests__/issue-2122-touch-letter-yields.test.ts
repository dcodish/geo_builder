/**
 * #2122 ([ADR-653](../../../docs/06-decisions.md#adr-653)) — THE ENGINE'S TOUCH LETTER YIELDS TO THE STUDENT'S.
 *
 * Operator, 2026-10-14 (playing the #2107 sheet, T8): *"we should not say X=M we should remove the letter M which was
 * never defined and use only X"*. Measured on `main` @ b0ef3240 through `decideDeterministic2D` → `commitVerdict` →
 * `replay`: after «מעגל O» · «מעגל P» · «המעגלים O ו-P משיקים» · «X על מעגל O» · «X על מעגל P», X sat on the touch
 * point with labels M, O, P, X, `coincidences` [[M, X]] and the banner «M ו-X נפלו על אותה נקודה.».
 *
 * Root cause: two mechanisms answer "a student letter is the point the engine auto-named" and they disagreed. ADR-440's
 * naming by use (`impliedPointBinding`) covered only a fresh label in a line's between slot; every other statement that
 * makes a student point the same point as an auto-named one (here ADR-647's `tangentTouchCopy`) fell through to the
 * coincidence notice, which named a letter the student never typed. Fix: the general criterion
 * (`impliedIdentityBinding`) — a line that leaves a student point structurally identical to exactly one auto-named
 * point names it by use (ADR-588's `merge` naming, owned by the line).
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { groupKey, impliedIdentityBinding, replay, useGeoStore } from '@/store/geoStore';
import { visibleCoincidences } from '@/render/pointDescriptions';
import i18n from '@/i18n';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
type V = { kind: string; binds?: { op: string; from: string; to: string }[]; note?: { key?: string } | null };

async function play(lines: string[], lang: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: V[] = [];
  const snaps: Map<string, Vec>[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    snaps.push(new Map(d.positions));
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, lang)) as never as V;
    verdicts.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { verdicts, last: verdicts.at(-1)!, before: snaps.at(-1)! };
}

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const labels = (seed = st().seed) => [...replay(st().facts, seed).positions.keys()].filter((k) => /^[A-Z]\d*$/.test(k)).sort();
const banner = (seed = st().seed) =>
  visibleCoincidences(replay(st().facts, seed).coincidences).map(([a, b]) => i18n.getFixedT('he')('figure.converge', { a, b }).replace(/[⁦-⁩]/g, ''));

/** X is the one touch point at seeds 0–3: on both circles, no second letter, no pair, no red row. */
function onlyX(X = 'X') {
  for (let seed = 0; seed < 4; seed++) {
    const r = replay(st().facts, seed);
    if (r.lastError) continue;
    expect(labels(seed), `seed ${seed}`).toEqual(['O', 'P', X].sort());
    expect(r.coincidences, `seed ${seed}`).toEqual([]);
    expect(r.violations, `seed ${seed}`).toHaveLength(0);
    const x = r.positions.get(X)!;
    for (const c of ['circle-O', 'circle-P']) {
      const k = r.circles.get(c)!;
      expect(Math.abs(d(x, k.center) - k.r), `seed ${seed}: ${X} on ${c}`).toBeLessThan(1e-6);
    }
  }
  expect(banner()).toEqual([]);
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const TAN = 'המעגלים O ו-P משיקים';

describe('#2122 — the operator\'s T8 lines: only X is drawn, no notice', () => {
  it('free radii, the reported order', async () => {
    const g = await play([...PAIR, TAN, 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    expect(g.last.note ?? null, 'a plain success, never «כבר קיים»').toBeNull();
    expect(g.last.binds).toEqual([{ op: 'merge', from: 'M', to: 'X' }]);
    onlyX();
    // stability: the circles do not move, and X lands where M was drawn
    const r = replay(st().facts, st().seed);
    for (const id of ['O', 'P']) expect(d(r.positions.get(id)!, g.before.get(id)!), id).toBeLessThan(1e-9);
    expect(d(r.positions.get('X')!, g.before.get('M')!)).toBeLessThan(1e-9);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the other order («X על מעגל P» first)', async () => {
    const g = await play([...PAIR, TAN, 'X על מעגל P', 'X על מעגל O']);
    expect(g.last.kind).toBe('commit');
    onlyX();
  });

  it('stated radii 3 and 2 (sheet T9)', async () => {
    const g = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', TAN, 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    onlyX();
    const r = replay(st().facts, st().seed);
    expect(d(r.positions.get('O')!, r.positions.get('X')!)).toBeCloseTo(3, 6);
    expect(d(r.positions.get('P')!, r.positions.get('X')!)).toBeCloseTo(2, 6);
  });

  it.each([['מבחוץ'], ['מבפנים']])('«משיקים %s»', async (how) => {
    const g = await play([...PAIR, `${TAN} ${how}`, 'X על מעגל O', 'X על מעגל P']);
    expect(g.last.kind).toBe('commit');
    onlyX();
  });

  it('English: "circles O and P are tangent" · "X on circle O" · "X on circle P"', async () => {
    const g = await play([...PAIR, 'circles O and P are tangent', 'X on circle O', 'X on circle P'], 'en');
    expect(g.last.kind).toBe('commit');
    onlyX();
  });
});

describe('#2122 — the naming belongs to its line (ADR-588)', () => {
  it('deleting «X על מעגל P» brings back M and X as two points', async () => {
    await play([...PAIR, TAN, 'X על מעגל O', 'X על מעגל P']);
    const last = groupKey(st().facts.at(-1)!);
    st().removeGroup(last);
    expect(labels()).toEqual(['M', 'O', 'P', 'X']);
    const r = replay(st().facts, st().seed);
    expect(d(r.positions.get('M')!, r.positions.get('X')!)).toBeGreaterThan(1e-3);
    expect(r.coincidences).toEqual([]);
  });

  it('undo takes the name with it, redo gives it back', async () => {
    await play([...PAIR, TAN, 'X על מעגל O', 'X על מעגל P']);
    useGeoStore.temporal.getState().undo();
    expect(labels()).toEqual(['M', 'O', 'P', 'X']);
    useGeoStore.temporal.getState().redo();
    expect(labels()).toEqual(['O', 'P', 'X']);
  });

  it('deleting the EARLIER «X על מעגל O» keeps X on circle P (the statement is the line\'s own fact)', async () => {
    await play([...PAIR, TAN, 'X על מעגל O', 'X על מעגל P']);
    const rider = st().facts.find((f) => f.utterance === 'X על מעגל O')!;
    st().removeGroup(groupKey(rider));
    const r = replay(st().facts, st().seed);
    expect(r.positions.has('X')).toBe(true);
    const k = r.circles.get('circle-P')!;
    expect(Math.abs(d(r.positions.get('X')!, k.center) - k.r)).toBeLessThan(1e-6);
  });

  it('the edit seam decides the same naming', async () => {
    await play([...PAIR, TAN, 'X על מעגל O', 'Y על מעגל P']);
    expect(labels()).toContain('M');
    const deps: EditDeps = { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} };
    expect(runEditCommit(groupKey(st().facts.at(-1)!), 'X על מעגל P', deps)).toBe(true);
    onlyX();
  });
});

describe('#2122 — unchanged (measured at b0ef3240)', () => {
  it('before X is stated on the second circle, the touch point is still labelled M', async () => {
    await play([...PAIR, TAN, 'X על מעגל O']);
    expect(labels()).toEqual(['M', 'O', 'P', 'X']);
  });

  it('two student letters keep the notice: «משיקים בנקודה T» · «X על מעגל P» · «X על מעגל O» (sheet T10)', async () => {
    const g = await play([...PAIR, `${TAN} בנקודה T`, 'X על מעגל P', 'X על מעגל O']);
    expect(g.last.kind).toBe('commit');
    expect(labels()).toEqual(['O', 'P', 'T', 'X']);
    expect(banner()).toEqual(['T ו-X נפלו על אותה נקודה.']);
  });

  it('a second student point Y on both circles is X\'s pair, with the notice', async () => {
    await play([...PAIR, TAN, 'X על מעגל O', 'X על מעגל P', 'Y על מעגל O', 'Y על מעגל P']);
    expect(labels()).toEqual(['O', 'P', 'X', 'Y']);
    expect(banner()).toEqual(['X ו-Y נפלו על אותה נקודה.']);
  });

  it('#539 control: «ישר O X P» still names the touch point X by its line slot', async () => {
    const g = await play([...PAIR, TAN, 'ישר O X P']);
    expect(g.last.binds).toEqual([{ op: 'rename', from: 'M', to: 'X' }]);
    expect(labels()).toEqual(['O', 'P', 'X']);
  });
});

describe('#2122 — every route (operator ruling 2026-10-15, option A)', () => {
  it('«גובה מ B» · «BE גובה»: one foot E for the two B heights, no tool letter beside it, no notice', async () => {
    const g = await play(['מקבילית ABCD', 'BD', 'גובה מ A', 'גובה מ B', 'BE גובה']);
    expect(g.last.kind).toBe('commit');
    expect(g.last.binds).toEqual([{ op: 'rename', from: 'G', to: 'E' }]);
    const r = replay(st().facts, st().seed);
    const feet = r.construction.objects.filter((o) => o.kind === 'foot') as { id: string; from: string; a: string; b: string }[];
    expect(feet.filter((f) => f.from === 'B').map((f) => f.id)).toEqual(['E']);
    expect(feet.map((f) => f.id).sort()).toEqual(['E', 'F']);
    expect(r.coincidences).toEqual([]);
    expect(r.violations).toHaveLength(0);
    for (const f of feet) expect([f.a, f.b].sort().join(''), 'never the diagonal BD').not.toBe('BD');
  });
});

describe('#2122 — the criterion is structural', () => {
  it('a free sampled DOF is never an identity: two riders on one circle are not one point', async () => {
    await play(['משולש', 'D על BC']);
    const d0 = replay(st().facts, st().seed);
    expect(impliedIdentityBinding(st().facts, [{ type: 'point-on-segment', id: 'E', a: 'B', b: 'C' } as never], st().seed)).toBeNull();
    expect(d0.positions.has('D')).toBe(true);
  });
});
