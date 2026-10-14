/**
 * #2098 ([ADR-650](../../../docs/06-decisions.md#adr-650)) — «ABC חוסם מעגל»: THE SHAPE IS THE SUBJECT, SO THE
 * CIRCLE IS INSIDE IT. A bare letter run as the subject of the active «חוסם» draws the INCIRCLE, the figure
 * «משולש ABC חוסם מעגל» already drew — never the circle through the vertices.
 *
 * Measured on `main` @ 939b160a through `decideDeterministic2D` → `commitVerdict` → `replay`: «ABC חוסם מעגל»,
 * «ABCD חוסם (את ה)מעגל», "ABC circumscribes a circle", «מעגל ש-ABC חוסם» and «מעגל שהמשולש ABC חוסם» each
 * committed a single `circumcircle`, green — the OPPOSITE circle. The noun spelling «משולש ABC חוסם מעגל» drew
 * the incircle.
 *
 * Root cause: the 3-point circle-through rule took «חוסם» / "circumscrib" as a circumcircle cue on the verb and
 * the run alone, never asking which noun is the SUBJECT, and the incircle rule's active form needed a polygon
 * noun before the run, so the bare run never reached it. #1941's direction trap, in the active voice. Fix: ONE
 * voice-aware reader (`inscriptionVoice`) decides the container from the subject and the voice; the
 * circle-through rules read the verb as a cue only when the circle encloses, and the incircle rule reads the
 * shape-as-subject sentence, noun or bare run.
 *
 * Every assertion is on the DRAWING, at 24 seeds, side by side with the circle-as-subject control (the #1941
 * lesson: assert both readings, never the new one alone). The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

type Verdict = { kind: string; commands?: { type: string }[] };

/** Type each line as the App does; return the last line's verdict and the facts it left. */
async function play(lines: string[]) {
  st().clear();
  let last: Verdict = { kind: '' };
  const kinds: string[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never,
      line,
      /[א-ת]/.test(line) ? 'he' : 'en',
    )) as never as Verdict;
    last = v;
    kinds.push(v.kind);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { last, kinds, facts: st().facts };
}

const distToLine = (p: Vec, a: Vec, b: Vec): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / Math.hypot(dx, dy);
};
/** Is `p` strictly inside the convex ring `v` (every edge sees it on the same side)? */
const insideRing = (p: Vec, v: Vec[]): boolean => {
  const sides = v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  });
  return sides.every((s) => s === sides[0] && s !== 0);
};

/** The figure at `seed`: its one circle and the ring's vertices. */
function figureAt(facts: ReturnType<typeof st>['facts'], seed: number, ring: string[]) {
  const d = replay(facts, seed);
  expect(d.lastError, `seed ${seed}: no error`).toBeNull();
  for (const [id, s] of Object.entries(d.status)) expect(s, `seed ${seed}: step ${id}`).toBe('ok');
  expect(d.circles.size, `seed ${seed}: exactly one circle`).toBe(1);
  const circle = [...d.circles.values()][0];
  const verts = ring.map((id) => {
    const p = d.positions.get(id);
    expect(p, `seed ${seed}: ${id} placed`).toBeTruthy();
    return p!;
  });
  return { circle, verts };
}

/** The INCIRCLE at every seed: tangent to every side, centre inside the ring, no vertex on it. */
function expectIncircle(facts: ReturnType<typeof st>['facts'], ring: string[]) {
  for (const seed of SEEDS) {
    const { circle, verts } = figureAt(facts, seed, ring);
    const n = verts.length;
    for (let i = 0; i < n; i++)
      expect(distToLine(circle.center, verts[i], verts[(i + 1) % n]), `seed ${seed}: side ${ring[i]}${ring[(i + 1) % n]} tangent`).toBeCloseTo(circle.r, 4);
    expect(insideRing(circle.center, verts), `seed ${seed}: centre inside the ring`).toBe(true);
    for (const [i, v] of verts.entries())
      expect(Math.hypot(v.x - circle.center.x, v.y - circle.center.y), `seed ${seed}: ${ring[i]} is not on the circle`).toBeGreaterThan(circle.r * 1.05);
  }
}

/** The CIRCUMCIRCLE at every seed: every vertex on it. */
function expectCircumcircle(facts: ReturnType<typeof st>['facts'], ring: string[]) {
  for (const seed of SEEDS) {
    const { circle, verts } = figureAt(facts, seed, ring);
    for (const [i, v] of verts.entries())
      expect(Math.hypot(v.x - circle.center.x, v.y - circle.center.y), `seed ${seed}: ${ring[i]} on the circle`).toBeCloseTo(circle.r, 4);
  }
}

beforeEach(() => {
  llmParseMock.mockReset();
  st().clear();
});

const ABC = ['A', 'B', 'C'];
const ABCD = ['A', 'B', 'C', 'D'];

describe('#2098 — the shape as the subject of «חוסם» encloses the circle: the INCIRCLE, at 24 seeds', () => {
  const ROWS: [string[], string[]][] = [
    // the issue's table, row by row
    [['משולש ABC', 'ABC חוסם מעגל'], ABC],
    [['ABC חוסם מעגל'], ABC],
    [['ריבוע ABCD', 'ABCD חוסם מעגל'], ABCD],
    [['ריבוע ABCD', 'ABCD חוסם את המעגל'], ABCD],
    [['משולש ABC', 'ABC circumscribes a circle'], ABC],
    [['משולש ABC', 'מעגל ש-ABC חוסם'], ABC],
    // the same class in its neighbouring spellings (measured green-circumcircle at 939b160a)
    [['משולש ABC', 'מעגל שהמשולש ABC חוסם'], ABC],
    [['ריבוע ABCD', 'ABCD circumscribes the circle'], ABCD],
    // the noun spelling it converges on — unchanged
    [['משולש ABC', 'משולש ABC חוסם מעגל'], ABC],
    [['משולש ABC', 'המשולש ABC חוסם מעגל'], ABC],
  ];
  for (const [lines, ring] of ROWS) {
    it(`${lines.join(' · ')} → the circle inside, tangent to every side`, async () => {
      const { kinds, facts } = await play(lines);
      expect(kinds.every((k) => k === 'commit'), `every line commits: ${kinds}`).toBe(true);
      expect(facts.some((f) => f.cmd.type === 'circumcircle'), 'no circle through the vertices').toBe(false);
      expectIncircle(facts, ring);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the bare run lowers EXACTLY as the noun spelling — one sentence, one figure', async () => {
    const bare = await play(['משולש ABC', 'ABC חוסם מעגל']);
    const bareCmds = bare.facts.map((f) => f.cmd);
    const noun = await play(['משולש ABC', 'משולש ABC חוסם מעגל']);
    expect(bareCmds).toEqual(noun.facts.map((f) => f.cmd));
  });
});

describe('#2098 — side by side: the circle as the subject still draws the CIRCUMCIRCLE (the #1941 trap)', () => {
  const ROWS: [string[], string[]][] = [
    [['משולש ABC', 'מעגל חוסם את ABC'], ABC],
    [['משולש ABC', 'מעגל שחוסם את ABC'], ABC],
    [['משולש ABC', 'מעגל חוסם את המשולש ABC'], ABC],
    [['משולש ABC', 'המעגל החוסם את המשולש ABC'], ABC],
    [['triangle ABC', 'a circle circumscribes triangle ABC'], ABC],
    [['triangle ABC', 'the circumscribed circle of ABC'], ABC],
    [['triangle ABC', 'a circle circumscribed about ABC'], ABC],
    [['triangle ABC', 'ABC is circumscribed by a circle'], ABC],
    // the passive voice, both directions (#1941's own pair)
    [['משולש ABC', 'ABC חסום במעגל'], ABC],
  ];
  for (const [lines, ring] of ROWS) {
    it(`${lines.join(' · ')} → the circle through every vertex`, async () => {
      const { kinds, facts } = await play(lines);
      expect(kinds.every((k) => k === 'commit'), `every line commits: ${kinds}`).toBe(true);
      expectCircumcircle(facts, ring);
    });
  }

  it('«מעגל חסום ב-ABC» (the passive incircle) is the same figure as «ABC חוסם מעגל»', async () => {
    const passive = await play(['משולש ABC', 'מעגל חסום ב-ABC']);
    const active = await play(['משולש ABC', 'ABC חוסם מעגל']);
    expect(active.facts.map((f) => f.cmd)).toEqual(passive.facts.map((f) => f.cmd));
  });
});

describe('#2098 — a spelling the incircle rule cannot finish is never drawn as the opposite circle', () => {
  it('"ABC is circumscribed about a circle" no longer commits the circle through the vertices', async () => {
    // Measured at 939b160a: a green circumcircle. The noun twin "triangle ABC is circumscribed about a circle"
    // escalates (the incircle rule's leftover guard reads "about"); the bare run now gets the same answer.
    const { last, facts } = await play(['triangle ABC', 'ABC is circumscribed about a circle']);
    expect(last.kind).not.toBe('commit');
    expect(facts.some((f) => f.cmd.type === 'circumcircle')).toBe(false);
  });
});
