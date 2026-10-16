/**
 * #2199 (ADR-AG-282) — a point stated on a LIST of carriers is on each (parity with 2-D #2185).
 *
 * Before: «A על מעגל O ועל מעגל P» had no reader in analytic; it went to the model, which answered «A על מעגל O»
 * and the row drew green with circle P gone (the operator, 2026-10-16: *"A is only on O and not on P but line is
 * green"*). The frame distributed a SUBJECT list but never a CARRIER list. Now `distributeClauses` reads the
 * carriers (`carriersOf` / `carriersOfEn`) and gives every subject every carrier — the two-line meaning.
 *
 * Asserted on the FIGURE (membership measured), through the real path: `decideSubmit` → `derive`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decideSubmit, reachesFallback } from '../app/submit';
import { derive } from '../engine/derive';
import { residual } from '../engine/curves';
import { carriersOf, distributeClauses } from '../parser/frameAnalytic';

const TWO = ['מעגל O', 'מעגל P'];
const THREE = ['מעגל O', 'מעגל P', 'מעגל Q'];
const SQUARE = ['ריבוע ABCD'];
const SEG = ['מעגל O', 'A(0,0)', 'B(3,1)'];

/** Record `line` after `ctx`; the verdict and the recorded list. */
function record(ctx: string[], line: string, seed = 0): { kind: string; lines: string[] } {
  const v = decideSubmit(line, ctx, seed, derive(ctx, seed));
  return { kind: v.kind, lines: v.kind === 'record' ? [...ctx, v.line] : ctx };
}

/** Is point `p` on carrier `k` in the figure of `lines`? A curve by its residual; «AC» by collinearity with A and C. */
function on(lines: string[], p: string, k: string, seed = 0): boolean {
  const d = derive(lines, seed);
  const pt = d.figure.points.find((q) => q.id === p);
  if (!pt) return false;
  const two = /^([A-Z])([A-Z])$/.exec(k);
  if (two) {
    const a = d.figure.points.find((q) => q.id === two[1]);
    const b = d.figure.points.find((q) => q.id === two[2]);
    if (!a || !b) return false;
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    return Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y) < 1e-4;
  }
  const c = d.figure.curves.find((q) => q.id === k);
  return !!c && Math.abs(residual(c.curve, pt.x, pt.y)) < 1e-4;
}

const O = 'circle-at-O';
const P = 'circle-at-P';
const Q = 'circle-at-Q';

describe('#2199 — every subject on every carrier (each row measured on the figure)', () => {
  it.each<[string, string[], string, [string, string[]][]]>([
    ['row 1', TWO, 'A על מעגל O ועל מעגל P', [['A', [O, P]]]],
    ['row 1, mirrored', TWO, 'A על מעגל P ועל מעגל O', [['A', [O, P]]]],
    ['row 2', TWO, 'A נקודה על מעגל O ועל מעגל P', [['A', [O, P]]]],
    ['row 3', TWO, 'A נמצאת על מעגל O ועל מעגל P', [['A', [O, P]]]],
    ['row 3', TWO, 'הנקודה A נמצאת על מעגל O ועל מעגל P', [['A', [O, P]]]],
    ['row 4', TWO, 'A על מעגל O וגם על מעגל P', [['A', [O, P]]]],
    ['row 5', TWO, 'F על המעגל O ועל המעגל P', [['F', [O, P]]]],
    ['row 6', TWO, 'A on circle O and on circle P', [['A', [O, P]]]],
    ['row 7 (unchanged)', TWO, 'A על מעגל O, A על מעגל P', [['A', [O, P]]]],
    ['row 8', THREE, 'A על מעגל O, על מעגל P ועל מעגל Q', [['A', [O, P, Q]]]],
    ['row 9', TWO, 'A ו-B על מעגל O ועל מעגל P', [['A', [O, P]], ['B', [O, P]]]],
    ['row 9', TWO, 'הנקודות A ו-B נמצאות על מעגל O ועל מעגל P', [['A', [O, P]], ['B', [O, P]]]],
    ['row 9', TWO, 'A and B on circle O and on circle P', [['A', [O, P]], ['B', [O, P]]]],
    ['row 10 (unchanged)', TWO, 'A על מעגל O ו-B על מעגל P', [['A', [O]], ['B', [P]]]],
    ['row 16 (unchanged)', TWO, 'A ו-B על מעגל O ועל מעגל P בהתאמה', [['A', [O]], ['B', [P]]]],
    ['row 16, English', TWO, 'A and B on circle O and on circle P respectively', [['A', [O]], ['B', [P]]]],
    ['row 18', TWO, 'A on circle O and B on circle P', [['A', [O]], ['B', [P]]]],
    ['row 19, empty figure', [], 'A על מעגל O ועל מעגל P', [['A', [O, P]]]],
    ['row 17', SQUARE, 'P על האלכסון AC ועל האלכסון BD', [['P', ['AC', 'BD']]]],
    ['row 20', SQUARE, 'P על הישר AC ועל הישר BD', [['P', ['AC', 'BD']]]],
    ['row 20, mixed', SEG, 'C על מעגל O ועל הישר AB', [['C', [O, 'AB']]]],
    ['row 20, mixed, other order', SEG, 'C על הישר AB ועל מעגל O', [['C', [O, 'AB']]]],
    ['row 20, bare segment', SEG, 'D על AB ועל מעגל O', [['D', [O, 'AB']]]],
    ['a single English carrier, list subject (2-D builds it)', ['מעגל O'], 'A and B on circle O', [['A', [O]], ['B', [O]]]],
  ])('%s: «%s»', (_row, ctx, line, expected) => {
    const r = record(ctx, line);
    expect(r.kind).toBe('record');
    for (const [p, ks] of expected) for (const k of ks) expect(on(r.lines, p, k), `${p} on ${k}`).toBe(true);
  });

  it('the operator’s line no longer reaches the AI (where the green drop happened)', () => {
    const v = decideSubmit('A על מעגל O ועל מעגל P', TWO, 0, derive(TWO, 0));
    expect(reachesFallback(v)).toBe(false);
  });
});

describe('#2199 — what is NOT a carrier list stays as it was', () => {
  it.each([
    ['על מעגל O'],
    ['על מעגל O ו-B על מעגל P'],
    ['על מעגל O, A על מעגל P'],
    ['על מעגל O על מעגל P'],
  ])('carriersOf(«%s») is null', (rest) => {
    expect(carriersOf(rest)).toBeNull();
  });

  it('a single carrier never enters the new branch', () => {
    expect(distributeClauses('A על מעגל O')).toBeNull();
  });

  it.each<[string, string[], string]>([
    ['a count mismatch with «בהתאמה»', THREE, 'A ו-B על מעגל O ועל מעגל P ועל מעגל Q בהתאמה'],
    ['a clause that does not read', ['מעגל O'], 'A על מעגל O ועל המשיק'],
  ])('%s is not committed with a carrier missing', (_name, ctx, line) => {
    expect(record(ctx, line).kind).not.toBe('record');
  });
});

describe('#2199 — two points on both circles do not collapse (24 seeds)', () => {
  it('A and B land on different crossings in most configurations', () => {
    let distinct = 0;
    for (let seed = 0; seed < 24; seed += 1) {
      const r = record(TWO, 'A ו-B על מעגל O ועל מעגל P', seed);
      const d = derive(r.lines, seed);
      const a = d.figure.points.find((q) => q.id === 'A');
      const b = d.figure.points.find((q) => q.id === 'B');
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 1e-3) distinct += 1;
    }
    expect(distinct).toBeGreaterThanOrEqual(20);
  });
});

describe('#2199 — the fixtures build and verify', () => {
  it.each([['point-on-two-circles-2199.analytic.json', ['A']], ['two-points-on-two-circles-2199.analytic.json', ['A', 'B']]])('%s', (file, pts) => {
    const fx = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', file), 'utf8')) as { lines: string[]; seed: number };
    const d = derive(fx.lines, fx.seed);
    expect(d.faults).toEqual([]);
    for (const p of pts) for (const k of [O, P]) expect(on(fx.lines, p, k, fx.seed), `${p} on ${k}`).toBe(true);
  });
});
