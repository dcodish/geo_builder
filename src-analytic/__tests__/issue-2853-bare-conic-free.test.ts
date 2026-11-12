/**
 * #2853 ([ADR-AG-467](../../docs/06c-decisions-analytic.md#adr-ag-467)) — A BARE «אליפסה» / «פרבולה» IS A FREE CONIC.
 *
 * Operator, 2026-11-12: *"just writing אליפסה is not understood. writing אליפסה קנונית is. we need both to be understood"*;
 * ruling the same day: *"It should be a free ellipse"*, and for the parabola *"2853 - A"* (vertex and p free, opening in any of
 * the four directions, «הציגו תצורה אחרת» cycling them). Measured at caf619a5 (`decideSubmit`): «אליפסה», «נתונה אליפסה»,
 * "an ellipse", «פרבולה», «נתונה פרבולה» were `not-handled`.
 *
 * pipeline-lock: the promise is about CONFIGURATIONS — the ellipse's centre and both semi-axes move between seeds, the
 * parabola reaches all four directions within seeds 0–7 and its vertex moves — and about what is read ON the free curve
 * (foci, focus, a diameter, a chord, points that pin it). The fixtures net asserts only that two saved figures build.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { paramRegister } from '../engine/carriers';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

/** The lines through the student's door, every one recorded. */
function recorded(lines: readonly string[]): string[] {
  const held: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, held, 0);
    expect(v.kind, line).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return held;
}

const conicAt = (lines: readonly string[], seed: number) => {
  const d = derive(lines, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  return d.figure.curves[0]?.curve;
};

describe('#2853 — a bare ellipse: centre and semi-axes all free', () => {
  it.each([['אליפסה'], ['נתונה אליפסה'], ['an ellipse'], ['the ellipse']])('«%s» draws one ellipse whose h, k, a, b all move', (line) => {
    const lines = recorded([line]);
    const reg = paramRegister(derive(lines, 0).construction);
    expect(reg.map((p) => p.sym).sort()).toEqual(['a', 'b', 'h', 'k']);
    for (const sym of ['a', 'b']) expect(reg.find((p) => p.sym === sym)?.domain.min).toBe(0);
    const seen = { h: new Set<string>(), k: new Set<string>(), a: new Set<string>(), b: new Set<string>() };
    for (const seed of SEEDS.slice(0, 6)) {
      const e = conicAt(lines, seed);
      expect(e?.kind, `seed ${seed}`).toBe('ellipse');
      if (e?.kind !== 'ellipse') continue;
      seen.h.add((e.h ?? 0).toFixed(3));
      seen.k.add((e.k ?? 0).toFixed(3));
      seen.a.add(e.a.toFixed(3));
      seen.b.add(e.b.toFixed(3));
    }
    for (const [sym, s] of Object.entries(seen)) expect(s.size, sym).toBeGreaterThan(1);
  });

  it('«אליפסה קנונית» is unchanged: centred at the origin at every seed', () => {
    const lines = recorded(['אליפסה קנונית']);
    for (const seed of SEEDS) {
      const e = conicAt(lines, seed);
      expect(e?.kind === 'ellipse' && [e.h ?? 0, e.k ?? 0], `seed ${seed}`).toEqual([0, 0]);
    }
  });

  it('a letter the figure already uses is replaced by the next free one', () => {
    const lines = recorded(['A(h,1)', 'נתונה אליפסה']);
    const o = derive(lines, 0).construction.objects.find((x) => x.kind === 'curve');
    expect(o && o.kind === 'curve' ? o.label.eqSrc : null).toBe('(x-c)^2/a^2+(y-k)^2/b^2=1');
  });

  it('later givens pin it: four points on it fix the centre and both semi-axes', () => {
    const lines = recorded(['אליפסה', 'A(0,0)', 'B(4,0)', 'C(2,1)', 'D(2,-1)', 'A על האליפסה', 'B על האליפסה', 'C על האליפסה', 'D על האליפסה']);
    for (const seed of [0, 1, 2]) {
      const e = conicAt(lines, seed);
      expect(e?.kind === 'ellipse' && [e.h ?? 0, e.k ?? 0, e.a, e.b].map((n) => Number(n.toFixed(6))), `seed ${seed}`).toEqual([2, 0, 2, 1]);
    }
  });

  it('its roles read on it: the foci, and a diameter through its own centre', () => {
    const lines = recorded(['נתונה אליפסה', 'F1 ו-F2 מוקדי האליפסה', 'AB קוטר באליפסה']);
    for (const seed of SEEDS.slice(0, 4)) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const e = d.figure.curves[0].curve;
      const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
      if (e.kind !== 'ellipse') throw new Error('not an ellipse');
      const [h, k] = [e.h ?? 0, e.k ?? 0];
      expect(Math.hypot(at('A').x + at('B').x - 2 * h, at('A').y + at('B').y - 2 * k), `seed ${seed}`).toBeLessThan(1e-6);
      expect(Math.hypot(at('F₁').x + at('F₂').x - 2 * h, at('F₁').y + at('F₂').y - 2 * k), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('#2853 — a bare parabola: vertex, p and the opening direction all free', () => {
  /** The direction a drawn parabola opens: its axis and the sign of p along it. */
  const direction = (c: ReturnType<typeof conicAt>) => (c?.kind === 'parabola' ? `${c.axis ?? 'x'}${c.p > 0 ? '+' : '-'}` : 'none');

  it.each([['פרבולה'], ['נתונה פרבולה'], ['a parabola']])('«%s» opens in all four directions over seeds 0–7, its vertex moving', (line) => {
    const lines = recorded([line]);
    const dirs = new Set<string>();
    const vertices = new Set<string>();
    for (const seed of SEEDS) {
      const c = conicAt(lines, seed);
      expect(c?.kind, `seed ${seed}`).toBe('parabola');
      dirs.add(direction(c));
      if (c?.kind === 'parabola') vertices.add(`${(c.h ?? 0).toFixed(3)},${(c.k ?? 0).toFixed(3)}`);
    }
    expect([...dirs].sort()).toEqual(['x+', 'x-', 'y+', 'y-']);
    expect(vertices.size).toBeGreaterThan(4);
  });

  it('the givens text follows the direction drawn: (y-k)^2=2p(x-h) along x, (x-h)^2=2p(y-k) along y', () => {
    const lines = recorded(['פרבולה']);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      const o = d.figure.curves[0];
      const c = o.curve;
      expect(o.label.eqSrc, `seed ${seed}`).toBe(c.kind === 'parabola' && c.axis === 'y' ? '(x-h)^2=2p(y-k)' : '(y-k)^2=2p(x-h)');
    }
  });

  it('its focus and a chord read on it, in either direction', () => {
    const lines = recorded(['נתונה פרבולה', 'F מוקד הפרבולה', 'AB מיתר בפרבולה']);
    for (const seed of SEEDS.slice(0, 4)) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const c = d.figure.curves[0].curve;
      if (c.kind !== 'parabola') throw new Error('not a parabola');
      const f = d.figure.points.find((p) => p.id === 'F')!;
      // The focus sits p/2 from the vertex, along the axis the configuration took.
      const [h, k] = [c.h ?? 0, c.k ?? 0];
      const want = c.axis === 'y' ? [h, k + c.p / 2] : [h + c.p / 2, k];
      expect(Math.hypot(f.x - want[0], f.y - want[1]), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });

  it('«AB קוטר בפרבולה» on it keeps #2625’s refusal', () => {
    const v = decideSubmit('AB קוטר בפרבולה', recorded(['פרבולה']), 0);
    expect(v.kind === 'refused' && v.error.key).toBe('parabola-no-diameter');
  });
});
