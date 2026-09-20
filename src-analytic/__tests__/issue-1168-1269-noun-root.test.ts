/**
 * #1168 + #1269 — THE NOUN DECIDES THE ROOT, AND THE RING OFFERS THE SENTENCE THAT DENOTES IT.
 *
 * Operator, playing round #1252 on T13's figure: *"I then click on AC intersection with circle and get
 * point P - this is good behavior. I then click on AB intersection with circle but now point P moved to a
 * location it should not be … I then click on the new wrong circle, and now point Q moved to the wrong
 * location"*.
 *
 * Measured at pickup: every ring offered «הישר CA» — the INFINITE line — while being drawn only where the
 * crossing lay on the segment. The committed sentence therefore denoted a pair with two crossings and said
 * nothing about which, so the app recorded the student's choice in the FIGURE-WIDE seed and jumped to it;
 * the next click chose a new seed and re-rolled every crossing named before it.
 *
 * His own ruling (#1168, 2026-09-19) is the fix: *«הצלע CA» ⇒ the root on the drawn extent; «הישר CA» ⇒ the
 * first root, as today*. With the ring speaking the bounded noun, the sentence denotes the dot and the seed
 * jump is not needed — so it is gone, and with it the re-rolling.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'x^2+y^2=16'];

/** The two roots of line CA with the circle: one on the drawn side, one beyond A. */
const NEAR = { x: 2.058, y: 3.43 };
const FAR = { x: -2.058, y: -3.43 };

const at = (lines: string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const near = (p: { x: number; y: number } | undefined, q: { x: number; y: number }) =>
  p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 1e-2;

describe('#1168 — the noun decides which root comes up first', () => {
  it('a BOUNDED noun opens on the root inside the drawn piece', () => {
    for (const noun of ['הצלע CA', 'הקטע CA']) {
      const p = at([...BASE, `P נקודת החיתוך של ${noun} עם המעגל x^2+y^2=16`], 'P');
      expect(near(p, NEAR), `«${noun}» opened at ${JSON.stringify(p)}`).toBe(true);
    }
  });

  it('«הישר» is unchanged — the infinite line keeps the first root it always had', () => {
    const p = at([...BASE, 'P נקודת החיתוך של הישר CA עם המעגל x^2+y^2=16'], 'P');
    expect(near(p, FAR)).toBe(true);
  });

  it('it is a PREFERENCE, not a filter: the far root is one configuration away', () => {
    const lines = [...BASE, 'P נקודת החיתוך של הצלע CA עם המעגל x^2+y^2=16'];
    const seen = [0, 1, 2, 3].map((s) => at(lines, 'P', s));
    expect(seen.some((p) => near(p, NEAR)), 'the drawn root is reachable').toBe(true);
    expect(seen.some((p) => near(p, FAR)), 'and so is the far one — «הציגו תצורה אחרת» must still work').toBe(true);
  });
});

describe('#1269 — the ring offers the sentence that denotes it', () => {
  it('a crossing on a drawn SIDE speaks as a side', () => {
    const d = derive(BASE, 0);
    const offers = crossingsOf(d.figure, d.construction).map((x) => crossingSentence(x, freeLetter(d.construction)));
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o, `«${o}» still says הישר`).not.toContain('הישר');
      expect(o).toMatch(/הצלע|הקטע/);
    }
  });

  it('THE OPERATOR’S SEQUENCE: each click lands where he clicked, and the earlier ones stay', () => {
    let lines = [...BASE];
    const placed: Array<{ id: string; x: number; y: number }> = [];

    for (let click = 1; click <= 2; click += 1) {
      const d = derive(lines, 0);
      const rings = crossingsOf(d.figure, d.construction);
      const ring = rings[click === 1 ? rings.findIndex((r) => /CA|AC/.test(r.first + r.second)) : 0];
      expect(ring, `click ${click}: no ring offered`).toBeDefined();
      const letter = freeLetter(d.construction);
      lines = [...lines, crossingSentence(ring, letter)];

      // the NEW point is where the ring was
      const p = at(lines, letter);
      expect(near(p, ring), `click ${click}: ${letter} landed at ${JSON.stringify(p)}, ring at ${ring.x},${ring.y}`).toBe(true);
      placed.push({ id: letter, x: ring.x, y: ring.y });

      // …and every point placed before it has NOT moved — the defect, stated directly
      for (const earlier of placed) {
        const q = at(lines, earlier.id);
        expect(near(q, earlier), `click ${click} moved ${earlier.id} to ${JSON.stringify(q)}`).toBe(true);
      }
    }
  });

  it('the seed jump is gone from the click handler', () => {
    // The mechanism, asserted directly: a figure-wide seed cannot record a per-point choice, so no
    // amount of re-tuning it would have been a fix.
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).not.toContain('seedShowing');
  });

  it('a stated LINE still offers its own noun — the change is about drawn pieces', () => {
    const lines = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'משוואת הישר l1 היא y=1'];
    const d = derive(lines, 0);
    const offers = crossingsOf(d.figure, d.construction).map((x) => crossingSentence(x, freeLetter(d.construction)));
    expect(offers.some((o) => o.includes('l1'))).toBe(true);
  });
});
