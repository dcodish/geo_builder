/**
 * #2237 ([ADR-742](../../../docs/06-decisions.md#adr-742)) — A CIRCLE-PAIR RELATION MOVES THE NEWER CIRCLE (operator ruling
 * 2026-10-16, card `g2237-jump` A: *"Q moves, O and P stay where they are, and no unstated relation is drawn between
 * them"*).
 *
 * Measured at `37800b85` through `decideDeterministic2D` → `commitVerdict` → `replay`: «מעגל O» · «מעגל P» · «מעגל Q
 * משיק למעגל O» moved the OLDER O from (0, 0) to (6.47, 0); the next line «מעגל Q משיק למעגל P» moved P and left O and P
 * exactly internally tangent. Root cause: every hand-written circle-pair seat in `apply.ts` (LADDER stage 2a) moved the
 * command's SECOND slot, and the parser writes the sentence's object (the older circle) there; the free-radius tangency
 * also made BOTH radii permanent carriers, so the older circles' radii carried the newer circle's relation. Fix: one
 * chooser `seatMover` (the newer movable circle moves) for tangency, containment, crossing and apart, and the tangency
 * is carried by the mover's own DOFs (its free radius, else its free centre).
 *
 * The model is mocked and must never be called.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { meetsRequirements } from '@/replay/core';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
  commitVerdict(v, line);
  return v;
}

type Snap = { circles: Map<string, { center: Vec; r: number }>; positions: Map<string, Vec> };
const snap = (seed = 0): Snap => {
  const r = replay(st().facts, seed);
  return { circles: new Map([...r.circles].map(([id, c]) => [id, { center: { ...c.center }, r: c.r }])), positions: new Map(r.positions) };
};

/** Plays every line (each must commit); returns the figure before the LAST line and after it, at seed 0. */
async function play(lines: string[]) {
  st().clear();
  let before: Snap = snap();
  for (let i = 0; i < lines.length; i++) {
    if (i === lines.length - 1) before = snap();
    const v = await submit(lines[i]);
    expect(v.kind, `«${lines[i]}» commits`).toBe('commit');
  }
  return { before, after: snap() };
}

/** Every circle drawn before the last line keeps its centre and radius (1e-9); returns the ones that moved. */
function moved(before: Snap, after: Snap, ids: string[]): string[] {
  return ids.filter((id) => {
    const b = before.circles.get(id);
    const a = after.circles.get(id);
    return !b || !a || dist(a.center, b.center) > 1e-9 || Math.abs(a.r - b.r) > 1e-9;
  });
}

type Rel = 'ext' | 'int' | 'q-in-o' | 'o-in-q' | 'cross' | 'apart';
function holds(rel: Rel, s: Snap): boolean {
  const q = s.circles.get('circle-Q')!;
  const o = s.circles.get('circle-O')!;
  const d = dist(q.center, o.center);
  const tol = 1e-6 * Math.max(1, q.r + o.r);
  switch (rel) {
    case 'ext':
      return Math.abs(d - (q.r + o.r)) < tol;
    case 'int':
      return Math.abs(d - Math.abs(q.r - o.r)) < tol;
    case 'q-in-o':
      return d + q.r < o.r;
    case 'o-in-q':
      return d + o.r < q.r;
    case 'cross':
      return Math.abs(q.r - o.r) < d && d < q.r + o.r;
    case 'apart':
      return d > q.r + o.r;
  }
}

const MATRIX: [string, Rel][] = [
  ['מעגל Q משיק למעגל O', 'ext'],
  ['המעגלים Q ו-O משיקים', 'ext'],
  ['מעגל O משיק למעגל Q', 'ext'],
  ['circle Q is tangent to circle O', 'ext'],
  ['המעגלים Q ו-O משיקים מבפנים', 'int'],
  ['המעגלים O ו-Q משיקים מבפנים', 'int'],
  ['מעגל Q משיק למעגל O מבפנים', 'int'],
  ['מעגל O מוכל במעגל Q', 'o-in-q'],
  ['מעגל Q מוכל במעגל O', 'q-in-o'],
  ['המעגלים Q ו-O נחתכים', 'cross'],
  ['המעגלים O ו-Q נחתכים', 'cross'],
  ['המעגלים Q ו-O זרים', 'apart'],
  ['המעגלים O ו-Q זרים', 'apart'],
];

describe('#2237 — the stability matrix: a circle-pair relation leaves every older circle where it was (seed 0)', () => {
  for (const [line, rel] of MATRIX) {
    it(`Q drawn earlier · «${line}»: O and P keep centre and radius, the relation holds`, async () => {
      const { before, after } = await play(['מעגל O', 'מעגל P', 'מעגל Q', line]);
      expect(moved(before, after, ['circle-O', 'circle-P'])).toEqual([]);
      expect(holds(rel, after), rel).toBe(true);
      expect(replay(st().facts, 0).violations).toEqual([]);
    });
  }
  for (const [line, rel] of MATRIX) {
    it(`Q created by the line · «${line}»: O and P keep centre and radius, the relation holds`, async () => {
      const { before, after } = await play(['מעגל O', 'מעגל P', line]);
      expect(moved(before, after, ['circle-O', 'circle-P'])).toEqual([]);
      expect(holds(rel, after), rel).toBe(true);
    });
  }
  it('points, a diameter and an inscribed triangle on O stay with O', async () => {
    for (const [prefix, pts] of [
      ['נקודה A על מעגל O', ['A']],
      ['AB קוטר במעגל O', ['A', 'B']],
      ['משולש ABC חסום במעגל O', ['A', 'B', 'C']],
    ] as const) {
      const { before, after } = await play(['מעגל O', prefix, 'מעגל Q משיק למעגל O']);
      expect(moved(before, after, ['circle-O']), prefix).toEqual([]);
      for (const p of pts) expect(dist(after.positions.get(p)!, before.positions.get(p)!), `${prefix}: ${p}`).toBeLessThan(1e-9);
      expect(holds('ext', after)).toBe(true);
    }
  });
});

describe('#2237 — the operator\'s lines: Q takes both tangencies, O and P are never touched', () => {
  const A2 = ['מעגל O', 'מעגל P', 'מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P'];
  const A4 = ['מעגל O', 'מעגל P', 'מעגל Q', 'מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P'];
  for (const [name, lines] of [['as filed (A2)', A2], ['Q drawn first (A4)', A4]] as const) {
    it(`${name}: O and P keep the place and size they had after line 2; QO = QP = EXT; green`, async () => {
      st().clear();
      for (const l of lines.slice(0, 2)) expect((await submit(l)).kind).toBe('commit');
      const base = snap();
      for (const l of lines.slice(2)) expect((await submit(l)).kind).toBe('commit');
      const after = snap();
      expect(moved(base, after, ['circle-O', 'circle-P'])).toEqual([]);
      const q = after.circles.get('circle-Q')!;
      for (const id of ['circle-O', 'circle-P']) {
        const c = after.circles.get(id)!;
        expect(Math.abs(dist(q.center, c.center) - (q.r + c.r)), `Q–${id} EXT`).toBeLessThan(1e-6);
      }
      expect(replay(st().facts, 0).violations).toEqual([]);
    });

    it(`${name}: no solve directive sits on O or P — Q's radius and centre own the two tangencies`, async () => {
      st().clear();
      for (const l of lines) await submit(l);
      const objs = replay(st().facts, 0).construction.objects;
      const driven = objs.filter((o) => (o as { solve?: unknown }).solve !== undefined).map((o) => o.id);
      expect(driven.filter((id) => ['circle-O', 'circle-P', 'O', 'P'].includes(id))).toEqual([]);
      expect(driven).toEqual(expect.arrayContaining(['circle-Q', 'Q']));
    });

    it(`${name}: no unstated O–P relation and no radius at the floor, at every valid seed 0–3`, async () => {
      st().clear();
      for (const l of lines) await submit(l);
      let valid = 0;
      for (const seed of [0, 1, 2, 3]) {
        if (!meetsRequirements(st().facts, seed)) continue;
        valid++;
        const s = snap(seed);
        const o = s.circles.get('circle-O')!;
        const p = s.circles.get('circle-P')!;
        const d = dist(o.center, p.center);
        const scale = 1e-3 * Math.max(1, o.r + p.r);
        expect(Math.abs(d - (o.r + p.r)), `seed ${seed}: O–P not externally tangent`).toBeGreaterThan(scale);
        expect(Math.abs(d - Math.abs(o.r - p.r)), `seed ${seed}: O–P not internally tangent`).toBeGreaterThan(scale);
        expect(d, `seed ${seed}: O–P not concentric`).toBeGreaterThan(scale);
        expect(Math.min(o.r, p.r), `seed ${seed}: no radius at the 0.2 floor`).toBeGreaterThan(0.25);
      }
      expect(valid, 'at least the drawn seed is valid').toBeGreaterThan(0);
    });
  }
  it('the model is never called', () => expect(llmParseMock).not.toHaveBeenCalled());
});

describe('#2237 — unchanged rows (already right at 37800b85)', () => {
  it('every radius stated: the solver moves the newer Q, in both operand orders', async () => {
    for (const last of ['מעגל Q משיק למעגל O', 'מעגל O משיק למעגל Q']) {
      const { before, after } = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'מעגל Q ברדיוס 1', last]);
      expect(moved(before, after, ['circle-O', 'circle-P']), last).toEqual([]);
      expect(holds('ext', after), last).toBe(true);
    }
  });
  it('«המעגלים Q ו-O זרים» with the circles already apart moves nothing', async () => {
    const { before, after } = await play(['מעגל O', 'מעגל P', 'מעגל Q', 'המעגלים Q ו-O זרים']);
    expect(moved(before, after, ['circle-O', 'circle-P', 'circle-Q'])).toEqual([]);
  });
});
