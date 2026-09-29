/**
 * #1473 (P1) — A KNOWLEDGE GATE READ A SAMPLE SIZED FOR "DOES IT VARY?" AS THE WHOLE CONFIGURATION SET.
 *
 * Measured 2026-09-29: the panel printed `C = (x_C, −4)` for a triangle of area 12 on a base of 6 while
 * «הציגו תצורה אחרת» drew C at y = +4. `isKnowledge` judged three DISTINCT configurations (#1282) — all
 * spent on the continuous family when anything slides, so the discrete root was never varied —
 * `knownCurve` judged raw seeds 0–2, and `knownOptions` judged 24. Three gates, three pools.
 *
 * The fix (ADR-AG-180): ONE configuration pool of 24 drawable seeds, read by all three gates. These locks
 * assert the SETTLED state (the pool filled — what every caller off the page gets, and what the page
 * shows once the check completes); the mid-render «בודק…» state is locked in
 * `issue-1473-mid-pool-render.test.tsx`, and the render-path budget in `issue-1473-perf-budget.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { configurationPool, isKnowledge, knownCurve, knownOptions, POOL_SIZE, type Figure } from '../engine/evaluate';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { ask } from '../app/ask';
import { completePoolAfterRender, yieldScheduler, type SliceScheduler } from '../app/poolScheduler';

const fmt = (v: number) => String(Math.round(v * 100) / 100);
const readPt = (id: string, k: 'x' | 'y') => (f: Figure) => f.points.find((p) => p.id === id)?.[k] ?? null;

/** The panel's point row, from the panel's own decision — never a copy of it. */
function panelRow(lines: string[], id: string): string {
  const d = derive(lines, 0);
  const row = panelKnowledge(d).points.find((p) => p.id === id)!;
  return pointText(d, id, row.x, row.y, fmt);
}
/** The ask lane's answer to «<id>», worded as the panel words an open row. */
const askRow = (lines: string[], id: string) => ask(derive(lines, 0), id, fmt).value ?? '—';

const CASE_A = ['משולש ABC', 'A(0,0)', 'B(6,0)', 'שטח המשולש ABC הוא 12'];
const CASE_B = ['A(0,0)', 'B(4,0)', 'C על הישר x=1', 'שטח ABC = 6', 'נקודה Z'];
const CIRCLE_P = ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=25', 'P נקודת החיתוך של המעגל I עם ציר ה-x'];
const CASE_C = [...CIRCLE_P, 'Q נמצאת על המעגל I'];
const CASE_D = [...CIRCLE_P, 'דרך P עובר ישר מאונך לציר ה-x'];

describe('#1473 — the reported cases, settled', () => {
  it('A: the area triangle — C.y is NOT known (±4), and panel and ask agree', () => {
    const c = derive(CASE_A, 0).construction;
    expect(isKnowledge(c, readPt('C', 'y')).known).toBe(false);
    const row = panelRow(CASE_A, 'C');
    expect(row).not.toContain('-4'); // before: «(x_C, -4)» beside a canvas drawing y = +4
    expect(askRow(CASE_A, 'C')).toBe(row);
  });

  it('B: an unrelated «נקודה Z» no longer hides C’s second root — both options listed', () => {
    const row = panelRow(CASE_B, 'C');
    expect(row).toContain('(1, 3)');
    expect(row).toContain('(1, -3)'); // before: «(1, -3)» alone
    expect(askRow(CASE_B, 'C')).toBe(row);
  });

  it('C: a point on the circle no longer hides P’s second crossing', () => {
    const row = panelRow(CASE_C, 'P');
    expect(row).toContain('(0, 0)');
    expect(row).toContain('(6, 0)'); // before: «(0, 0)» alone
    expect(askRow(CASE_C, 'P')).toBe(row);
  });

  it('D: a line through a two-option point has no single equation (before: x = 0)', () => {
    const d = derive(CASE_D, 0);
    const line = d.figure.curves.find((cu) => cu.curve.kind === 'line')!;
    expect(knownCurve(d.construction, line.id)).toBeNull();
    const row = panelKnowledge(d).curves.find((cu) => cu.id === line.id);
    if (row) expect(row.known).toBeNull();
    expect(panelRow(CASE_D, 'P')).toContain('(6, 0)');
  });
});

describe('#1473 — the controls: nothing the givens fix is lost', () => {
  it('A(4,0) on the #1036 two-root figure stays known, and C still lists its two roots', () => {
    const lines = ['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7'];
    expect(panelRow(lines, 'A')).toBe('(4, 0)');
    const c = derive(lines, 0).construction;
    expect(knownOptions(c, (f) => { const p = f.points.find((q) => q.id === 'C'); return p ? [p.x, p.y] : null; })).toHaveLength(2);
  });

  it('the 572 exam: k = 2 and line 3 stay known (#1317)', () => {
    const PART_B = [
      'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר',
      'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N על הישר 3', 'M נקודת החיתוך של הישר 3 עם ציר ה-y', 'דרך M עובר ישר l4',
      'A נקודת החיתוך של הישר l4 עם הישר 1', 'B נקודת החיתוך של הישר l4 עם הישר 2', 'M אמצע AB',
    ];
    const d = derive(PART_B, 0);
    const pk = panelKnowledge(d);
    const k = pk.params.find((p) => p.sym === 'k')!.k;
    expect(k.known && k.value).toBeCloseTo(2, 6);
    const l3 = d.figure.curves.find((cu) => /(^|\s)3$/.test(cu.label.name))!; // «ישר 3»
    expect(pk.curves.find((cu) => cu.id === l3.id)!.known).not.toBeNull();
    expect(pk.points.every((p) => p.x.known && p.y.known)).toBe(true);
  });

  it('the #1282 before/after verdicts hold', () => {
    const BEFORE = ['טרפז ABCD', 'AB מקביל ל CD', 'A(5,8)', 'B(9,6)', 'M מפגש האלכסונים במרובע ABCD', 'AC', 'BD', 'MB:MD=1:4', 'שיעור ה- x של נקודה M הוא 7', 'נתונה הנקודה P(-3,7)'];
    const before = derive(BEFORE, 0).construction;
    expect(isKnowledge(before, readPt('M', 'y')).known).toBe(false);
    const mx = isKnowledge(before, readPt('M', 'x'));
    expect(mx.known && mx.value).toBeCloseTo(7, 6);
    const after = derive([...BEFORE, 'P על הישר CD'], 0).construction;
    const cy = isKnowledge(after, readPt('C', 'y'));
    expect(cy.known && cy.value).toBeCloseTo(-2, 4);
  });

  it('a DETERMINED two-root figure (circle ∩ x-axis) still lists both options', () => {
    expect(panelRow(CIRCLE_P, 'P')).toMatch(/\(0, 0\).*או.*\(6, 0\)/);
  });
});

describe('#1473 — one pool, shared by every gate', () => {
  it('a gate off the page fills the pool: every configuration is read, and the verdict is settled', () => {
    const c = derive(CASE_A, 0).construction;
    const pool = configurationPool(c);
    expect(pool.complete()).toBe(false);
    isKnowledge(c, readPt('A', 'x'));
    expect(pool.complete()).toBe(true);
    expect(pool.ready()).toHaveLength(POOL_SIZE);
  });

  it('on a DEFERRED pool an invariant value is pending — never known — until the pool completes', () => {
    const c = derive(CASE_A, 0).construction;
    const pool = configurationPool(c);
    pool.defer();
    const early = isKnowledge(c, readPt('A', 'x'));
    expect(early).toEqual({ known: false, pending: true });
    // a value the partial pool already sees differ is OPEN at once, not pending
    expect(isKnowledge(c, readPt('C', 'x'))).toEqual({ known: false });
    while (!pool.step());
    const settledA = isKnowledge(c, readPt('A', 'x'));
    expect(settledA.known && settledA.value).toBe(0);
    expect(isKnowledge(c, readPt('C', 'y')).known).toBe(false);
  });
});

describe('#1473 — the after-render loop is abandoned when the figure changes', () => {
  /** A scheduler the test drives by hand: nothing runs until `run()`. */
  const manual = () => {
    const queue: Array<() => void> = [];
    const sched: SliceScheduler = {
      schedule: (fn) => {
        queue.push(fn);
        return fn;
      },
      cancel: (h) => {
        const i = queue.indexOf(h as () => void);
        if (i >= 0) queue.splice(i, 1);
      },
    };
    const run = () => {
      let n = 0;
      while (queue.length) {
        queue.shift()!();
        n += 1;
      }
      return n;
    };
    return { sched, run, queue };
  };

  const deferredWithPending = (lines: string[]) => {
    const c = derive(lines, 0).construction;
    const pool = configurationPool(c);
    pool.defer();
    isKnowledge(c, readPt('A', 'x')); // a row showed «בודק…»
    return { c, pool };
  };

  it('left alone, it completes the pool one seed per slice and settles once', () => {
    const { pool } = deferredWithPending(CASE_A);
    const m = manual();
    let settledCount = 0;
    completePoolAfterRender(pool, () => (settledCount += 1), m.sched);
    const slices = m.run();
    expect(pool.complete()).toBe(true);
    expect(settledCount).toBe(1);
    expect(slices).toBeGreaterThan(1);
  });

  it('cancelled mid-check (a line changed): the old pool is never advanced again and never settles', () => {
    const old = deferredWithPending(CASE_A);
    const m = manual();
    let staleLanded = 0;
    const cancel = completePoolAfterRender(old.pool, () => (staleLanded += 1), m.sched);
    m.queue.shift()!(); // one slice ran
    const readyAtCancel = old.pool.ready().length;
    cancel();
    m.run();
    expect(old.pool.ready().length).toBe(readyAtCancel);
    expect(old.pool.complete()).toBe(false);
    expect(staleLanded).toBe(0);
    // …and the NEW figure has its own pool and its own loop, which settles
    const next = deferredWithPending([...CASE_A, 'נקודה Z']);
    expect(next.pool).not.toBe(old.pool);
    let fresh = 0;
    completePoolAfterRender(next.pool, () => (fresh += 1), m.sched);
    m.run();
    expect(fresh).toBe(1);
    expect(staleLanded).toBe(0);
  });

  it('a pool already complete at the effect settles immediately, and only if a row was pending', () => {
    const c = derive(CASE_A, 0).construction;
    const pool = configurationPool(c);
    pool.fill();
    let n = 0;
    completePoolAfterRender(pool, () => (n += 1), manual().sched);
    expect(n).toBe(0); // nothing showed pending: no re-render owed
  });

  it('the page scheduler YIELDS between seeds and never waits for idle (browser pre-play: 20 of 21 idle slices fired by timeout)', async () => {
    const g = globalThis as { requestIdleCallback?: unknown };
    const had = g.requestIdleCallback;
    g.requestIdleCallback = () => {
      throw new Error('the pool must not wait for an idle period');
    };
    try {
      const { pool } = deferredWithPending(CASE_A);
      const done = new Promise<void>((resolve) => completePoolAfterRender(pool, resolve)); // default scheduler
      await done;
      expect(pool.complete()).toBe(true);
      // …and a cancelled macrotask never runs its slice
      const other = deferredWithPending([...CASE_A, 'נקודה Z']);
      let ran = 0;
      const h = yieldScheduler.schedule(() => (ran += 1));
      yieldScheduler.cancel(h);
      await new Promise((r) => setTimeout(r, 20));
      expect(ran).toBe(0);
      expect(other.pool.complete()).toBe(false);
    } finally {
      g.requestIdleCallback = had;
    }
  }, 60_000);
});
