/**
 * #1895 (ADR-CX-069) — a stated object is DRAWN or REFUSED, never dropped.
 *
 * «z1 = 2i · המעגל שמרכזו O ורדיוסו |z1|» was accepted and drew no circle: the fold's private radius
 * evaluator read only a number, a parameter and a product, so |z1|, |z1 − z2|, r+1 and r/2 came back
 * null and the object was skipped in silence. The same function also skipped, in silence, a centre or
 * vertex that is a bound or selected letter, and a circumscribed circle through collinear numbers; and
 * it read «-2» and «2i» by their modulus, drawing a radius-2 circle the student never stated.
 * Operator ruling 2026-10-08: the circle is drawn, or the line is refused naming it.
 * Everything runs through the real `submitLine` + `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines, lowerLines } from '../app/deriveLines';
import { activeLines, hydrateSession, submitLine } from '../app/submit';
import { CATALOG } from '../parser/catalog';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean[] => lines.map((l) => submitLine(l));
const derived = (seed = 0) => deriveLines(activeLines(), seed, seed);
const circles = (seed = 0) => derived(seed).objects.filter((o) => o.kind === 'circle');
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

describe('#1895 — the issue’s line draws its circle', () => {
  it('«z1 = 2i · המעגל שמרכזו O ורדיוסו |z1|» draws the circle of radius 2 around O', () => {
    expect(play('z1 = 2i', 'המעגל שמרכזו O ורדיוסו |z1|')).toEqual([true, true]);
    const c = circles();
    expect(c).toHaveLength(1);
    close(c[0].center!.re, 0);
    close(c[0].center!.im, 0);
    close(c[0].radius!, 2);
    expect(derived().unsatisfied).toEqual([]);
  });

  it('the English spelling after «z1 = 3+4i» draws radius 5', () => {
    expect(play('z1 = 3+4i', 'the circle with centre O and radius |z1|')).toEqual([true, true]);
    close(circles()[0].radius!, 5);
  });

  it('the 2021 חורף ב lines: «…ורדיוסו |B|» with B = z1 draws radius |z1| = 2', () => {
    const lines = ['z^2 - (1+i)z + 2i + 2 = 0', 'A הוא הפתרון ברביע הרביעי', 'B = z1', 'המעגל שמרכזו O ורדיוסו |B|'];
    expect(play(...lines)).toEqual([true, true, true, true]);
    close(circles()[0].radius!, 2);
  });
});

describe('#1895 — every radius form draws at its value, at every seed', () => {
  it.each([
    [['z1 = 1', 'z2 = 2+3i', 'המעגל שמרכזו z1 ורדיוסו |z1 - z2|'], Math.sqrt(10)],
    [['z1 = 2i', 'המעגל שמרכזו O ורדיוסו 2|z1|'], 4],
    [['r = 2', 'המעגל שמרכזו O ורדיוסו r+1'], 3],
    [['r = 2', 'המעגל שמרכזו O ורדיוסו r/2'], 1],
  ])('%j → %d', (lines, radius) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    for (const seed of SEEDS) {
      const c = circles(seed);
      expect(c).toHaveLength(1);
      close(c[0].radius!, radius);
    }
  });

  it('«ורדיוסו r^2» with r free draws, and the radius moves with r', () => {
    expect(play('המעגל שמרכזו O ורדיוסו r^2')).toEqual([true]);
    const radii = new Set<string>();
    for (const seed of SEEDS) {
      const d = derived(seed);
      expect(d.unsatisfied).toEqual([]);
      const c = d.objects.filter((o) => o.kind === 'circle');
      expect(c).toHaveLength(1);
      const r = d.params.find((p) => p.name === 'r');
      expect(r).toBeDefined();
      radii.add(c[0].radius!.toFixed(6));
    }
    expect(radii.size).toBeGreaterThan(1);
  });

  it('«המעגל שמרכזו O ורדיוסו |z1|» typed first brings a free z₁, and the radius is |z₁|', () => {
    expect(play('המעגל שמרכזו O ורדיוסו |z1|')).toEqual([true]);
    const radii = new Set<string>();
    for (const seed of SEEDS) {
      const d = derived(seed);
      const z1 = d.points.find((p) => p.name === 'z1');
      expect(z1).toBeDefined();
      const c = d.objects.filter((o) => o.kind === 'circle');
      expect(c).toHaveLength(1);
      close(c[0].radius!, Math.hypot(z1!.z.re, z1!.z.im));
      radii.add(c[0].radius!.toFixed(6));
    }
    // «הציגו תצורה אחרת» moves both
    expect(radii.size).toBeGreaterThan(1);
  });

  it('the parser declares the radius’s names, never the real parameter', () => {
    const p = parseLineV2('המעגל שמרכזו z2 ורדיוסו |z1 - z3| + r');
    expect(p.ok).toBe(true);
    if (p.ok) expect([...p.line.declares].sort()).toEqual(['z1', 'z2', 'z3']);
  });
});

describe('#1895 — a bound or selected letter is drawn where its number is', () => {
  it.each([
    [['z1 = 1+i', 'A = z1', 'המעגל שמרכזו A ורדיוסו 2'], { re: 1, im: 1 }],
    [['z1 = 1+i', 'z1 = A', 'המעגל שמרכזו A ורדיוסו 2'], { re: 1, im: 1 }],
    [['z^2 - (1+i)z + 2i + 2 = 0', 'A הוא הפתרון ברביע הרביעי', 'המעגל שמרכזו A ורדיוסו 1'], { re: 1, im: -1 }],
    [['z^2 - (1+i)z + 2i + 2 = 0', 'z0 הוא הפתרון ברביע הרביעי', 'המעגל שמרכזו z0 ורדיוסו 1'], { re: 1, im: -1 }],
  ])('%j — the circle is centred on the number', (lines, centre) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    const c = circles();
    expect(c).toHaveLength(1);
    close(c[0].center!.re, centre.re);
    close(c[0].center!.im, centre.im);
  });

  it('«|A|» reads the selected root, never a free sample of the letter', () => {
    const lines = ['z^2 - (1+i)z + 2i + 2 = 0', 'A הוא הפתרון ברביע הרביעי', 'המעגל שמרכזו O ורדיוסו |A|'];
    expect(play(...lines).every(Boolean)).toBe(true);
    for (const seed of [0, 1, 2, 3]) close(circles(seed)[0].radius!, Math.SQRT2);
  });

  it.each([
    [['z1 = 1+i', 'A = z1', 'z2 = 2', 'המשולש OAz2'], [[0, 0], [1, 1], [2, 0]]],
    [['z^2 - (1+i)z + 2i + 2 = 0', 'A הוא הפתרון ברביע הרביעי', 'המשולש OAz1'], [[0, 0], [1, -1], [0, 2]]],
  ])('%j — the polygon runs through the number', (lines, corners) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    const polys = derived().objects.filter((o) => o.kind === 'polygon');
    expect(polys).toHaveLength(1);
    polys[0].vertices.forEach((v, i) => {
      close(v.re, corners[i][0]);
      close(v.im, corners[i][1]);
    });
  });
});

describe('#1895 — a circle that cannot be drawn is refused, naming the line', () => {
  it.each(['המעגל שמרכזו O ורדיוסו -2', 'המעגל שמרכזו O ורדיוסו 0', 'המעגל שמרכזו O ורדיוסו 2i'])(
    '«%s» → impossible, not added',
    (line) => {
      expect(submitLine(line)).toBe(false);
      expect(store().lastError).toEqual({ key: 'impossible', detail: line });
      expect(store().lines).toEqual([]);
      expect(derived().objects).toEqual([]);
    },
  );

  it('a circumscribed circle through collinear numbers is refused, and nothing is drawn', () => {
    expect(play('z1 = 1', 'z2 = 2')).toEqual([true, true]);
    expect(submitLine('המעגל החוסם את המשולש Oz1z2')).toBe(false);
    expect(['incompatible', 'impossible']).toContain(store().lastError?.key);
    expect(store().lines).toEqual(['z1 = 1', 'z2 = 2']);
    expect(derived().objects).toEqual([]);
  });

  it('a saved file holding a newly refused line loads without it, and the load audit lists it', () => {
    const file = { app: 'complex-builder', version: 1, lines: ['z1 = 2i', 'המעגל שמרכזו O ורדיוסו -2'], freePos: {}, seed: 0 };
    expect(hydrateSession(file)).toBe(true);
    expect(store().lines).toEqual(['z1 = 2i']);
    expect(store().loadAudit?.failed.map((f) => f.line)).toEqual(['המעגל שמרכזו O ורדיוסו -2']);
  });
});

describe('#1895 — controls that stay as they are', () => {
  it.each([
    [['המעגל שמרכזו O ורדיוסו 2'], 2],
    [['המעגל שמרכזו O ורדיוסו √2'], Math.SQRT2],
    [['z1 = 1+i', 'המעגל שמרכזו z1 ורדיוסו 2'], 2],
  ])('%j → radius %d', (lines, radius) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    close(circles()[0].radius!, radius);
  });

  it('«ורדיוסו r» and «ורדיוסו 2r» with r free draw at the sampled r', () => {
    for (const [line, k] of [['המעגל שמרכזו O ורדיוסו r', 1], ['המעגל שמרכזו O ורדיוסו 2r', 2]] as const) {
      store().resetSession();
      expect(submitLine(line)).toBe(true);
      for (const seed of SEEDS) {
        const d = derived(seed);
        const r = Number(d.params.find((p) => p.name === 'r')?.value ?? NaN);
        const c = d.objects.filter((o) => o.kind === 'circle');
        expect(c).toHaveLength(1);
        if (Number.isFinite(r)) close(c[0].radius!, k * r);
        expect(c[0].radius!).toBeGreaterThan(0);
      }
    }
  });

  it('a free centre B creates a free B and draws the circle there', () => {
    expect(play('המעגל שמרכזו B ורדיוסו 2')).toEqual([true]);
    const B = derived().points.find((p) => p.name === 'B');
    expect(B).toBeDefined();
    close(circles()[0].center!.re, B!.z.re);
    close(circles()[0].radius!, 2);
  });
});

describe('#1895 — class guard: every accepted object line draws every object it states', () => {
  const lines = CATALOG.flatMap((e) => [e.he, e.en]).filter((l) => {
    const p = parseLineV2(l);
    return p.ok && p.line.objects.length > 0;
  });

  it('the catalog states objects', () => {
    expect(lines.length).toBeGreaterThan(4);
  });

  it.each(lines)('«%s» draws what it states, or is refused', (line) => {
    if (!submitLine(line)) return; // refused: never dropped
    const stated = (lowerLines(activeLines()).objects ?? []).length;
    for (const seed of [0, 1, 2, 3]) {
      const d = derived(seed);
      expect(d.unsatisfied).toEqual([]);
      expect(d.objects).toHaveLength(stated);
    }
  });

  const fixtures = import.meta.glob('./fixtures/*.complex.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it.each(Object.entries(fixtures))('%s draws every object it states', (_, text) => {
    expect(hydrateSession(JSON.parse(text))).toBe(true);
    expect(derived(store().seed).objects).toHaveLength((lowerLines(activeLines()).objects ?? []).length);
  });
});
