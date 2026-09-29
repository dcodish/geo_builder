/**
 * #1473 (ADR-AG-180) — THE CLASS INVARIANT: no value the panel settles as KNOWN varies over the configurations
 * the tool would draw.
 *
 * > Over the #1289 corpus, and the same corpus with an unrelated «נקודה Z» appended, every parameter,
 * > coordinate and listed-curve coefficient that `panelKnowledge` prints as known takes the same value at
 * > `drawableAt` seeds 0..47 — twice the pool — wherever it exists.
 *
 * The «נקודה Z» variant is the ordinary mid-build state that exposed the class: a continuous DOF anywhere
 * in the figure spent the old three-configuration sample on the continuous family, and the discrete root
 * was never varied. Measured before the fix: 8 lies in 3 figures as-is, 13 in 7 with Z.
 *
 * It calls `panelKnowledge` (the decision the page renders from), never a copy of its gates. SLOW TIER
 * (docs/08): the sweep evaluates 48 seeds of ~1150 figures.
 *
 * The second half is the conic memo's identity lock over the same corpus: every figure derives to the same
 * signature with the memo off.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, figureSignature, type Figure } from '../engine/evaluate';
import { __setConicMemo } from '../engine/conic';
import { normalizedLine } from '../engine/lines';
import { SOLVE_RESOLUTION } from '../engine/solve';
import { panelKnowledge } from '../app/panelRows';
import type { NumCurve } from '../engine/types';
import { analyticCorpus } from './analyticCorpus';

const WIDE = 48;
const Z = 'נקודה Z';

/**
 * Two readings are DIFFERENT when the solver can tell them apart: more than `SOLVE_RESOLUTION` (ADR-AG-136)
 * of the scale, which includes that configuration's own extent — the residuals are scale-normalised, so a
 * seed that throws a free point 2340 units out solves `MA = MB` to 4e-5 of that span (M.x = 2.097 there is
 * not a second answer). Every lie #1473 measured differed by O(1) of the figure's scale.
 */
const differs = (v: number, w: number, span: number) => Math.abs(v - w) > SOLVE_RESOLUTION * Math.max(1, Math.abs(v), Math.abs(w), span);
const spanOf = (f: Figure) => Math.max(0, ...f.points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));

function coefficients(cu: NumCurve): number[] {
  if (cu.kind === 'line') {
    const k = normalizedLine(cu.a, cu.b, cu.c);
    return k ? [k.a, k.b, k.c] : [cu.a, cu.b, cu.c];
  }
  return Object.values(cu).filter((v): v is number => typeof v === 'number');
}

function green(lines: string[]) {
  let d;
  try {
    d = derive(lines, 0);
  } catch {
    return null;
  }
  if (d.faults.length > 0 || d.figure.unsatisfied.length > 0) return null;
  if (d.figure.points.length + d.figure.curves.length === 0) return null;
  return d;
}

/** Every value the panel settles as known that a wide-sweep configuration contradicts. */
function lies(seqs: readonly string[][]): { lies: string[]; figures: number; known: number } {
  const out: string[] = [];
  let figures = 0;
  let known = 0;
  for (const lines of seqs) {
    const d = green(lines);
    if (!d) continue;
    figures += 1;
    const c = d.construction;
    const pk = panelKnowledge(d);
    const claims: Array<{ what: string; value: number; read: (f: Figure) => number | null }> = [];
    for (const p of pk.params) if (p.k.known) claims.push({ what: `param ${p.sym}`, value: p.k.value, read: (f) => f.env[p.sym] ?? null });
    for (const p of pk.points) {
      for (const axis of ['x', 'y'] as const) {
        const k = p[axis];
        if (k.known) claims.push({ what: `${p.id}.${axis}`, value: k.value, read: (f) => f.points.find((q) => q.id === p.id)?.[axis] ?? null });
      }
    }
    for (const cu of pk.curves) {
      if (!cu.known) continue;
      const mine = coefficients(cu.known);
      mine.forEach((value, i) =>
        claims.push({
          what: `${cu.id}[${i}]`,
          value,
          read: (f) => {
            const there = f.curves.find((q) => q.id === cu.id)?.curve;
            return there && there.kind === cu.known!.kind ? coefficients(there)[i] : null;
          },
        }),
      );
    }
    known += claims.length;
    for (let s = 0; s < WIDE; s += 1) {
      const f = drawableAt(c, s);
      const span = spanOf(f);
      for (const cl of claims) {
        const v = cl.read(f);
        if (v !== null && Number.isFinite(v) && differs(cl.value, v, span)) out.push(`${JSON.stringify(lines)} ${cl.what}: printed ${cl.value}, seed ${s} draws ${v}`);
      }
    }
  }
  return { lies: [...new Set(out)], figures, known };
}

describe('#1473 — a value the panel settles as known never varies over the configurations the tool draws', () => {
  const corpus = analyticCorpus();

  it('the corpus as-is', () => {
    const r = lies(corpus);
    expect(r.lies).toEqual([]);
    // the sweep exercised real claims — a net that checks nothing passes by default
    expect(r.figures).toBeGreaterThan(400);
    expect(r.known).toBeGreaterThan(1000);
  }, 900_000);

  it('the corpus with an unrelated «נקודה Z» appended (the mid-build state that exposed the class)', () => {
    const r = lies(corpus.filter((s) => !s.includes(Z)).map((s) => [...s, Z]));
    expect(r.lies).toEqual([]);
    expect(r.figures).toBeGreaterThan(400);
  }, 900_000);
});

describe('#1473 — the conic memo changes no figure in the corpus', () => {
  it('derive(lines, 0) signs identically with the memo off', () => {
    const diff: string[] = [];
    let n = 0;
    for (const lines of analyticCorpus()) {
      const sig = (memo: boolean) => {
        __setConicMemo(memo);
        try {
          return figureSignature(derive(lines, 0).figure);
        } catch {
          return 'throws';
        } finally {
          __setConicMemo(true);
        }
      };
      const on = sig(true);
      const off = sig(false);
      n += 1;
      if (on !== off) diff.push(JSON.stringify(lines));
    }
    expect(diff).toEqual([]);
    expect(n).toBeGreaterThan(400);
  }, 900_000);
});
