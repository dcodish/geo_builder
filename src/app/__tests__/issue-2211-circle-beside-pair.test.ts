/**
 * #2211 ([ADR-744](../../../docs/06-decisions.md#adr-744)) — A CIRCLE SENTENCE NEVER DROPS A CIRCLE IT NAMES (the honesty
 * invariant: *"Q is tangent to both O and P, or the line is refused/escalated. Q is never dropped"*).
 *
 * Measured at `e9346d32` through `decideDeterministic2D` → `commitVerdict` → `replay`: after «מעגל O» · «מעגל P» · «מעגל Q»,
 * «מעגל Q משיק למעגלים O ו-P» escalated only because #2185's label net caught the dropped Q (the pair resolver read
 * [O, P]); "circle Q is tangent to circle O and circle P" still COMMITTED with P dropped (the clause split restated
 * «circle P»). Root cause: `namedCircleRefs` let the plural list REPLACE the per-circle names and `resolveCirclePair`
 * read the first two of any longer list; the split turned an object list into bare draws. Fix: the union of every
 * named circle (more than two → no pair), and a circle related to a list of circles is read as its distribution
 * (the shared object-list distributor, with #2219).
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { distributedClauses } from '@/parser';
import type { AnyCommand, Vec } from '@/engine';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function play(lines: string[]) {
  st().clear();
  let last: { kind: string; commands: AnyCommand[] } = { kind: '', commands: [] };
  for (const line of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
    commitVerdict(v, line);
    last = { kind: v.kind, commands: v.kind === 'commit' ? [...v.commands] : [] };
  }
  return last;
}

/** Every circle the seed-0..3 figures carry, by id. */
const figures = () => [0, 1, 2, 3].map((seed) => replay(st().facts, seed));
const ext = (f: ReturnType<typeof replay>, a: string, b: string) => {
  const p = f.circles.get(a)!, q = f.circles.get(b)!;
  return Math.abs(dist(p.center, q.center) - (p.r + q.r));
};

const O_P_Q = ['מעגל O', 'מעגל P', 'מעגל Q'];
const O_P_Q_EN = ['circle O', 'circle P', 'circle Q'];

describe('#2211 — a circle tangent to a list of circles is tangent to each, exactly as the two lines', () => {
  const ROWS: [string[], string, [string, string]][] = [
    [O_P_Q, 'מעגל Q משיק למעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // the report (A1)
    [O_P_Q, 'מעגל Q משיק מבחוץ למעגלים O ו-P', ['מעגל Q משיק מבחוץ למעגל O', 'מעגל Q משיק מבחוץ למעגל P']], // the report (A2)
    [O_P_Q, 'המעגל Q משיק למעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']],
    [O_P_Q, 'מעגל Q משיק לשני המעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']],
    [O_P_Q, 'מעגל Q משיק חיצונית למעגלים O ו-P', ['מעגל Q משיק מבחוץ למעגל O', 'מעגל Q משיק מבחוץ למעגל P']],
    [O_P_Q, 'מעגל Q משיק למעגל O ולמעגל P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // C1
    [O_P_Q, 'מעגל Q משיק למעגל O ומעגל P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // C2
    [O_P_Q, 'מעגל Q משיק למעגל O וגם למעגל P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']],
    [O_P_Q, 'מעגל Q משיק מבחוץ למעגל O ולמעגל P', ['מעגל Q משיק מבחוץ למעגל O', 'מעגל Q משיק מבחוץ למעגל P']], // C4
    [O_P_Q_EN, 'circle Q is tangent to circles O and P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']], // A4
    [O_P_Q_EN, 'circle Q is tangent to both circles O and P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']],
    [O_P_Q_EN, 'circle Q is externally tangent to circles O and P', ['circle Q is externally tangent to circle O', 'circle Q is externally tangent to circle P']],
    [O_P_Q_EN, 'circle Q is tangent to circle O and circle P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']], // C3, the split route
    [O_P_Q_EN, 'circle Q is tangent to circle O and to circle P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']],
    [['מעגל O', 'מעגל P'], 'מעגל Q משיק למעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // D3: Q not drawn
    [['מעגל O', 'מעגל P'], 'מעגל Q משיק למעגל O ולמעגל P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // C6
    [[], 'מעגל Q משיק למעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']], // an empty figure
  ];
  for (const [prefix, line, two] of ROWS)
    it(`«${line}»${prefix.length < 3 ? ` (after ${prefix.length} lines)` : ''}: Q tangent to O and P, the two-line figure`, async () => {
      const one = await play([...prefix, line]);
      expect(one.kind).toBe('commit');
      const tang = one.commands.filter((c): c is Extract<AnyCommand, { type: 'circles-tangent' }> => c.type === 'circles-tangent');
      expect(tang.map((c) => [c.circle1, c.circle2].sort().join('|')).sort()).toEqual(['circle-O|circle-Q', 'circle-P|circle-Q']);
      const oneFigs = figures();
      expect(oneFigs[0].lastError, 'the drawn seed builds').toBeNull();
      for (const [seed, f] of oneFigs.entries()) {
        if (f.lastError) continue; // a sampled seed the two-line form cannot build either (checked below)
        expect(f.violations, `seed ${seed} green`).toEqual([]);
        expect(ext(f, 'circle-Q', 'circle-O'), `seed ${seed}: QO`).toBeLessThan(1e-4);
        expect(ext(f, 'circle-Q', 'circle-P'), `seed ${seed}: QP`).toBeLessThan(1e-4);
      }
      // one line = two lines (the pickup check, kept): the same figure at seeds 0–3
      for (const l of two) expect((await play([...prefix, ...two.slice(0, two.indexOf(l) + 1)])).kind).toBe('commit');
      const twoFigs = figures();
      for (const seed of [0, 1, 2, 3]) {
        expect(!!oneFigs[seed].lastError, `seed ${seed}: builds exactly when the two lines do`).toBe(!!twoFigs[seed].lastError);
        for (const [id, c] of twoFigs[seed].circles) {
          const o = oneFigs[seed].circles.get(id)!;
          expect(dist(o.center, c.center) + Math.abs(o.r - c.r), `seed ${seed} ${id}`).toBeLessThan(1e-9);
        }
      }
    });

  it('the internal and contained one-line forms are drawn exactly as their two lines are (red row included)', async () => {
    for (const [line, two] of [
      ['מעגל Q מוכל במעגלים O ו-P', ['מעגל Q מוכל במעגל O', 'מעגל Q מוכל במעגל P']],
      ['מעגל Q מוכל במעגל O ובמעגל P', ['מעגל Q מוכל במעגל O', 'מעגל Q מוכל במעגל P']],
      ['circle Q is internally tangent to circles O and P', ['circle Q is internally tangent to circle O', 'circle Q is internally tangent to circle P']],
    ] as const) {
      const prefix = /circle /.test(line) ? O_P_Q_EN : O_P_Q;
      expect((await play([...prefix, line])).kind, line).toBe('commit');
      const one = figures();
      await play([...prefix, ...two]);
      const twoF = figures();
      for (const seed of [0, 1, 2, 3]) {
        expect(one[seed].violations.map((v) => v.relation), `${line} seed ${seed}`).toEqual(twoF[seed].violations.map((v) => v.relation));
        for (const [id, c] of twoF[seed].circles) expect(dist(one[seed].circles.get(id)!.center, c.center), `${line} seed ${seed} ${id}`).toBeLessThan(1e-9);
      }
    }
  });
});

describe('#2211 — no line naming three circles is drawn with one left out', () => {
  const ESCALATE: [string[], string][] = [
    [O_P_Q, 'מעגל Q חותך את המעגלים O ו-P'], // A6
    [O_P_Q, 'מעגל Q נחתך עם המעגלים O ו-P'],
    [O_P_Q, 'מעגל Q והמעגלים O ו-P משיקים'], // A8
    [O_P_Q, 'המעגלים O ו-P משיקים למעגל Q'], // B1
    [O_P_Q, 'המעגלים O ו-P משיקים מבפנים למעגל Q'],
    [O_P_Q, 'המעגלים O ו-P חותכים את מעגל Q'],
    [O_P_Q, 'המעגלים O ו-P מוכלים במעגל Q'],
    [O_P_Q, 'המעגלים O ו-P זרים למעגל Q'],
    [O_P_Q, 'מעגל Q משיק למעגלים O ו-P בנקודות A ו-B'], // D1, unchanged
    [O_P_Q, 'מעגל Q זר למעגלים O ו-P'],
    [O_P_Q, 'מעגל Q משיק לשני המעגלים'], // D4, no pair letters
  ];
  for (const [prefix, line] of ESCALATE)
    it(`«${line}» is not committed`, async () => {
      const r = await play([...prefix, line]);
      expect(r.kind).not.toBe('commit');
      expect(st().facts).toHaveLength(prefix.length);
    });

  it('the invariant: a committed line carries every circle it names', async () => {
    for (const line of ['מעגל Q משיק למעגלים O ו-P', 'מעגל Q משיק למעגל O ולמעגל P', 'circle Q is tangent to circle O and circle P']) {
      const r = await play([...(/circle /.test(line) ? O_P_Q_EN : O_P_Q), line]);
      const text = JSON.stringify(r.commands);
      for (const id of ['circle-O', 'circle-P', 'circle-Q']) expect(text, `${line}: ${id}`).toContain(id);
    }
  });
});

describe('#2211 — controls (unchanged)', () => {
  it('«AB משיק משותף למעגלים O ו-P» is still one common tangent of the pair', async () => {
    const r = await play([...O_P_Q, 'AB משיק משותף למעגלים O ו-P']);
    expect(r.kind).toBe('commit');
    expect(r.commands.some((c) => c.type === 'common-tangent')).toBe(true);
  });
  it('«המעגלים O ו-P משיקים» and «מעגל P משיק למעגל O» are the pair tangency', async () => {
    for (const line of ['המעגלים O ו-P משיקים', 'מעגל P משיק למעגל O']) {
      const r = await play(['מעגל O', 'מעגל P', line]);
      expect(r.commands.filter((c) => c.type === 'circles-tangent')).toHaveLength(1);
    }
  });
  it('the distributor does not read a circle list after a segment or point subject (another sentence)', () => {
    expect(distributedClauses('AB משיק משותף למעגלים O ו-P')).toBeNull();
    expect(distributedClauses('AB is a common tangent to circles O and P')).toBeNull();
    expect(distributedClauses('A נמצאת על המעגלים O ו-P')).toBeNull();
  });
  it('the model is never called', async () => {
    await play([...O_P_Q, 'מעגל Q משיק למעגלים O ו-P']);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
