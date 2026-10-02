/**
 * #1473 (ADR-AG-180) — THE SPEED BUDGET, counted rather than timed.
 *
 * Operator, 2026-09-29: *"we cannot afford 0.5 s addition"*; ruled option B′ — the render path does exactly
 * the synchronous work it did before, and the configuration pool completes after it. A wall-clock lock is a
 * lock on the machine, so this counts UNCACHED evaluations (`evaluateStats.uncached`, a memo miss):
 *
 * 1. **The render path adds none.** For every line of the heaviest corpus figures, the page's synchronous
 *    knowledge path on a DEFERRED pool spends no more evaluations than the seed consumers that existed
 *    before #1473 — `distinctConfigSeeds` plus `knownOptions` for each point row the old gate left open —
 *    spend on a second fresh derivation of the same prefix. Those are CALLED, not copied.
 * 2. **The pool is bounded and shared.** Completing it costs at most the 48 seeds `drawableAt` can reach,
 *    and afterwards every gate, the ask lane and the option walk cost nothing more.
 * 3. **The conic memo.** It removes most conic fits, and changes no figure (`__setConicMemo(false)`).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import {
  configurationPool,
  distinctConfigSeeds,
  drawableAt,
  evaluateStats,
  figureSignature,
  isKnowledge,
  knownCurve,
  knownOptions,
  settled,
  POOL_SIZE,
  type Figure,
} from '../engine/evaluate';
import { __setConicMemo, conicStats, curveFromEquation } from '../engine/conic';
import { parseExpr } from '../engine/expr';
import { panelKnowledge, segmentKnowledge } from '../app/panelRows';
import { positionalOf } from '../engine/types';
import { pointText } from '../app/pointText';
import { ask } from '../app/ask';

const PART_B = [
  'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר',
  'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N על הישר 3', 'M נקודת החיתוך של הישר 3 עם ציר ה-y', 'דרך M עובר ישר l4',
  'A נקודת החיתוך של הישר l4 עם הישר 1', 'B נקודת החיתוך של הישר l4 עם הישר 2', 'M אמצע AB',
];
const KITE = ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
const CIRCLE = ['נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל'];
const CIRCLE_FIRST = ['נתון מעגל O', 'דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
const Z = 'נקודה Z';
const FIGURES: Record<string, string[]> = {
  '572 exam': PART_B,
  '572 exam + Z': [...PART_B, Z],
  'kite exercise': KITE,
  'kite + circle (circle last)': [...KITE, ...CIRCLE],
  'kite + circle (circle last) + Z': [...KITE, ...CIRCLE, Z],
  'kite + circle (circle first)': CIRCLE_FIRST,
  'kite + circle (circle first) + Z': [...CIRCLE_FIRST, Z],
};
const fmt = (v: number) => String(Math.round(v * 100) / 100);
const readXY = (id: string) => (f: Figure) => {
  const p = f.points.find((q) => q.id === id);
  return p ? [p.x, p.y] : null;
};

/** Uncached evaluations spent by `fn`. */
function spent(fn: () => void): number {
  const before = evaluateStats.uncached;
  fn();
  return evaluateStats.uncached - before;
}

/** The page's synchronous knowledge path (App.tsx: `panelKnowledge`, the point rows, `segmentKnowledge`, the scene's `knownCurve`). */
function renderPath(d: ReturnType<typeof derive>): void {
  const pk = panelKnowledge(d);
  for (const p of pk.points) settled(() => pointText(d, p.id, p.x, p.y, fmt));
  segmentKnowledge(d);
  for (const cu of d.figure.curves) knownCurve(d.construction, cu.id);
}

/**
 * What the render path spent BEFORE #1473 — its two seed consumers, CALLED: the distinct walk (the old
 * gate's sample, over which every row was judged), and `knownOptions`' 24-seed walk for each point row
 * that sample left open. On a NON-deferred derivation, so that walk fills exactly as it always did.
 */
function priorConsumers(d: ReturnType<typeof derive>): void {
  const c = d.construction;
  const ds = distinctConfigSeeds(c);
  for (const p of positionalOf(c)) {
    const kx = isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.x ?? null, ds);
    const ky = isKnowledge(c, (f) => f.points.find((q) => q.id === p.id)?.y ?? null, ds);
    if (!(kx.known && ky.known)) knownOptions(c, readXY(p.id));
  }
}

describe('#1473 — the render path spends no evaluation the pool adds (B′)', () => {
  for (const [name, lines] of Object.entries(FIGURES)) {
    it(`${name}: every line, deferred render ≤ the pre-#1473 seed consumers`, () => {
      for (let n = 1; n <= lines.length; n += 1) {
        const prefix = lines.slice(0, n);
        const d = derive(prefix, 0);
        configurationPool(d.construction).defer();
        const now = spent(() => renderPath(d));

        const d2 = derive(prefix, 0);
        const prior = spent(() => priorConsumers(d2));
        expect(now, `line ${n} «${prefix[n - 1]}»`).toBeLessThanOrEqual(prior);
      }
    }, 120_000);
  }
});

describe('#1473 — the pool is bounded, and shared by every consumer', () => {
  it('572 line 11: the whole construction — derive, render, pool — costs ≤ 48 evaluations; after it, nothing costs anything', () => {
    let d!: ReturnType<typeof derive>;
    let pool!: ReturnType<typeof configurationPool>;
    let pendingAfterRender = false;
    const total = spent(() => {
      d = derive(PART_B, 0);
      pool = configurationPool(d.construction);
      pool.defer();
      renderPath(d);
      pendingAfterRender = !pool.complete();
      while (!pool.step());
    });
    expect(pendingAfterRender, 'the line whose pool completes after the render').toBe(true);
    // drawableAt(s) walks seeds s..s+24 at most: 48 seeds are everything the construction can ever evaluate
    expect(total).toBeLessThanOrEqual(2 * POOL_SIZE);
    const after = spent(() => {
      renderPath(d);
      for (const q of ['A', 'B', 'k', 'l4', 'שיפוע הישר l4', 'AB']) ask(d, q, fmt);
      for (const p of d.figure.points) knownOptions(d.construction, readXY(p.id));
      for (let s = 0; s < POOL_SIZE; s += 1) drawableAt(d.construction, s);
    });
    expect(after, 'every gate, the ask lane and the option walk read the ONE pool').toBe(0);
  });

  it('the render path on the determined 572 figure spends at most the three-seed floor, and leaves the pool to the idle loop', () => {
    /*
     * This lock guarded `priorConsumers` against quietly becoming the pool (on 572 the old distinct walk stopped
     * at seed 2). It stopped there only because the signature read «-0.0000» as a different configuration
     * (#1539): with zero normalised, a DETERMINED figure has one configuration and the distinct walk honestly
     * scans the window — so the relative baseline is lax on 572 by construction. The guard is restated as the
     * absolute budget it protected (ADR-AG-197): the deferred render path pays the three-seed floor and no more.
     */
    // Every DETERMINED prefix (a free one may fill the pool through the option walk it always paid for).
    let determined = 0;
    for (let n = 1; n <= PART_B.length; n += 1) {
      const d = derive(PART_B.slice(0, n), 0);
      if (d.figure.carrierDof !== 0) continue;
      determined += 1;
      const pool = configurationPool(d.construction);
      pool.defer();
      const now = spent(() => renderPath(d));
      expect(now, `line ${n}`).toBeLessThanOrEqual(3);
    }
    expect(determined).toBeGreaterThan(0);
    const d = derive(PART_B, 0);
    configurationPool(d.construction).defer();
    renderPath(d);
    expect(configurationPool(d.construction).complete()).toBe(false);
  });
});

describe('#1473 — the conic memo', () => {
  it('cuts the conic fits of completing the 572 pool by at least 5×', () => {
    const fits = (memo: boolean) => {
      __setConicMemo(memo);
      try {
        const before = conicStats.fits;
        const d = derive(PART_B, 0);
        configurationPool(d.construction).fill();
        return conicStats.fits - before;
      } finally {
        __setConicMemo(true);
      }
    };
    const off = fits(false);
    const on = fits(true);
    expect(on * 5).toBeLessThanOrEqual(off);
  });

  it('changes no figure: every pool configuration of the heavy figures signs identically with the memo off', () => {
    const sigs = (lines: string[], memo: boolean) => {
      __setConicMemo(memo);
      try {
        const c = derive(lines, 0).construction;
        return Array.from({ length: POOL_SIZE }, (_, s) => figureSignature(drawableAt(c, s)));
      } finally {
        __setConicMemo(true);
      }
    };
    for (const lines of [PART_B, [...KITE, ...CIRCLE]]) expect(sigs(lines, true)).toEqual(sigs(lines, false));
  });

  it('a shared result is frozen, and -0 is not 0 in its key', () => {
    const eq = parseExpr('x^2+y^2-a')!;
    const r = curveFromEquation(eq, { a: 4 });
    expect(Object.isFrozen(r)).toBe(true);
    if (r.ok) expect(Object.isFrozen(r.curve)).toBe(true);
    const line = parseExpr('x-1/b')!;
    const pos = curveFromEquation(line, { b: 0 });
    const neg = curveFromEquation(line, { b: -0 });
    __setConicMemo(false);
    try {
      expect(pos).toEqual(curveFromEquation(line, { b: 0 }));
      expect(neg).toEqual(curveFromEquation(line, { b: -0 }));
    } finally {
      __setConicMemo(true);
    }
  });
});
