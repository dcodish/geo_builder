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
 * (docs/08): the sweep evaluates 48 seeds of every corpus figure.
 *
 * The second half is the conic memo's identity lock over the same corpus: every figure derives to the same
 * signature with the memo off.
 *
 * SHARDED (#2736): not a test file. `issue-1473-pool-invariant.test.ts` (shard 1) and `-2` … `-8.test.ts`
 * each register one round-robin slice of the corpus (`(i + shift) % n === k - 1`; the memo lock rotates by
 * one shard), so the eight files walk the whole corpus exactly once per test between them (shard 1 asserts
 * both partitions). The whole-corpus non-vacuity floors are
 * kept at full strength by proof, not by a weaker threshold: every shard asserts its slice clears
 * `floor / n` STRICTLY, so the n slices together clear `floor` strictly — the original claim.
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

/**
 * Shard k of n (1-based) of the corpus: round-robin, so the slices are disjoint, cover it, and are even.
 * `shift` rotates which shard an item lands in: the memo lock uses shift 1, so no item's sweep and memo
 * derives pile into the same file (one corpus item, #1554's noun list, derives in ~160 s on its own).
 */
const slice = <T>(items: readonly T[], k: number, n: number, shift = 0): T[] => items.filter((_, i) => (i + shift) % n === k - 1);
const MEMO_SHIFT = 1;

/** Register shard `k` of `n` of #1473's pool invariant (#2736). */
export function poolInvariantShard(k: number, n: number): void {
  const tag = ` (shard ${k}/${n})`;

  describe(`#1473 — a value the panel settles as known never varies over the configurations the tool draws${tag}`, () => {
    const corpus = analyticCorpus();

    it(`the corpus as-is${tag}`, () => {
      const r = lies(slice(corpus, k, n));
      expect(r.lies).toEqual([]);
      // the sweep exercised real claims — a net that checks nothing passes by default. Whole-corpus floors
      // 400 figures / 1000 claims: each of the n slices clears floor/n strictly, so together they clear it.
      expect(r.figures).toBeGreaterThan(400 / n);
      expect(r.known).toBeGreaterThan(1000 / n);
    }, 900_000);

    it(`the corpus with an unrelated «נקודה Z» appended (the mid-build state that exposed the class)${tag}`, () => {
      const r = lies(slice(corpus.filter((s) => !s.includes(Z)).map((s) => [...s, Z]), k, n));
      expect(r.lies).toEqual([]);
      expect(r.figures).toBeGreaterThan(400 / n);
    }, 900_000);

    if (k === 1) {
      it(`the ${n} slices walk the corpus exactly once${tag}`, () => {
        const seen = new Array<number>(corpus.length).fill(0);
        let total = 0;
        for (const shift of [0, MEMO_SHIFT]) {
          seen.fill(0);
          total = 0;
          for (let j = 1; j <= n; j += 1) {
            const idx = slice(corpus.map((_, i) => i), j, n, shift);
            total += idx.length;
            for (const i of idx) seen[i] += 1;
          }
          expect(total).toBe(corpus.length);
          expect(seen.every((x) => x === 1)).toBe(true);
        }
      });
    }
  });

  describe(`#1473 — the conic memo changes no figure in the corpus${tag}`, () => {
    it(`derive(lines, 0) signs identically with the memo off${tag}`, () => {
      const diff: string[] = [];
      let m = 0;
      for (const lines of slice(analyticCorpus(), k, n, MEMO_SHIFT)) {
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
        m += 1;
        if (on !== off) diff.push(JSON.stringify(lines));
      }
      expect(diff).toEqual([]);
      // whole-corpus floor 400, by the same per-slice proof
      expect(m).toBeGreaterThan(400 / n);
    }, 900_000);
  });
}
