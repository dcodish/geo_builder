/**
 * THE ANALYTIC CORPUS WALK — three corpus-wide locks that read the same derivations, made in one pass (#2739).
 *
 * 1. #1473 (ADR-AG-180) — THE CLASS INVARIANT: no value the panel settles as KNOWN varies over the configurations
 *    the tool would draw.
 *
 *    > Over the #1289 corpus, and the same corpus with an unrelated «נקודה Z» appended, every parameter,
 *    > coordinate and listed-curve coefficient that `panelKnowledge` prints as known takes the same value at
 *    > `drawableAt` seeds 0..47 — twice the pool — wherever it exists.
 *
 *    The «נקודה Z» variant is the ordinary mid-build state that exposed the class: a continuous DOF anywhere
 *    in the figure spent the old three-configuration sample on the continuous family, and the discrete root
 *    was never varied. Measured before the fix: 8 lies in 3 figures as-is, 13 in 7 with Z.
 *
 *    It calls `panelKnowledge` (the decision the page renders from), never a copy of its gates.
 *
 * 2. #1473 — the conic memo's identity lock: every figure derives to the same signature with the memo off.
 *
 * 3. #1289 (ADR-AG-152) — "freedom in the panel, certainty in every value" is unrepresentable: a figure that
 *    reports `reportedDof > 0` has at least one quantity the panel shows as unknown. Its predicate self-test
 *    and source check stay in `panel-freedom-invariant-1289.test.ts`.
 *
 * ## One derivation per corpus item, not three (#2739, ADR-W-191)
 *
 * All three are statements about `derive(lines, 0)` with the memo on, and about `panelKnowledge` of it. They
 * ran as three walks in three cold workers: #1473's sweep derived every item and read its panel, the memo lock
 * derived every item again with the memo on (the very same derivation) before the memo-off one, and #1289's
 * file derived every item a third time and read the same panel. Now each item is derived ONCE with the memo on;
 * that derivation is the memo lock's "on" side, #1473's subject and #1289's subject, and only the memo-off
 * derive and #1473's wide sweep are added to it. A green figure the panel settles nothing about has no claim a
 * seed could contradict, so its sweep is skipped: the lie list is the same by construction.
 *
 * Same corpus, same seeds 0..47, same assertions and floors: only repeated work is gone.
 *
 * SLOW TIER (docs/08). SHARDED (#2736): not a test file. `issue-1473-pool-invariant.test.ts` (shard 1) and
 * `-2` … `-8.test.ts` each register one round-robin slice of the corpus (`i % n === k - 1`; the Z variant slices
 * its own list the same way), so the eight files walk the whole corpus exactly once between them. The
 * whole-corpus non-vacuity floors are kept at full strength by proof, not by a weaker threshold: every shard
 * asserts its slice clears `floor / n` STRICTLY, so the n slices together clear `floor` strictly — the original
 * claim.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, figureSignature, type Figure } from '../engine/evaluate';
import { __setConicMemo } from '../engine/conic';
import { reportedDof } from '../engine/carriers';
import { normalizedLine } from '../engine/lines';
import { SOLVE_RESOLUTION } from '../engine/solve';
import { panelKnowledge, panelShowsUnknown } from '../app/panelRows';
import type { NumCurve } from '../engine/types';
import type { Derivation } from '../engine/derive';
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

/** A derivation the locks judge: no fault, nothing unsatisfied, something drawn. */
const isGreen = (d: Derivation) => d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.points.length + d.figure.curves.length > 0;

/** Every value the panel settles as known — one claim per parameter, coordinate and listed-curve coefficient. */
type Claim = { what: string; value: number; read: (f: Figure) => number | null };
function claimsOf(pk: ReturnType<typeof panelKnowledge>): Claim[] {
  const claims: Claim[] = [];
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
  return claims;
}

/** #1473: every claim a wide-sweep configuration contradicts. No claim, nothing to contradict: no sweep. */
function liesOf(lines: readonly string[], d: Derivation, claims: readonly Claim[], out: string[]): void {
  if (claims.length === 0) return;
  for (let s = 0; s < WIDE; s += 1) {
    const f = drawableAt(d.construction, s);
    const span = spanOf(f);
    for (const cl of claims) {
      const v = cl.read(f);
      if (v !== null && Number.isFinite(v) && differs(cl.value, v, span)) out.push(`${JSON.stringify(lines)} ${cl.what}: printed ${cl.value}, seed ${s} draws ${v}`);
    }
  }
}

/** `figureSignature(derive(lines, 0).figure)` with the conic memo as given, `throws` when the derive throws. */
function signedWithMemo(lines: readonly string[], memo: boolean): string {
  __setConicMemo(memo);
  try {
    return figureSignature(derive(lines, 0).figure);
  } catch {
    return 'throws';
  } finally {
    __setConicMemo(true);
  }
}

interface AsIsWalk {
  /** #1473 as-is */
  lies: string[];
  figures: number;
  known: number;
  /** the conic memo lock */
  memoDiff: string[];
  memoSigned: number;
  /** #1289 */
  freedomBad: string[];
  free: number;
}

/** The as-is corpus slice, walked once: each item derived once with the memo on, read by all three locks. */
function walkAsIs(seqs: readonly string[][]): AsIsWalk {
  const w: AsIsWalk = { lies: [], figures: 0, known: 0, memoDiff: [], memoSigned: 0, freedomBad: [], free: 0 };
  for (const lines of seqs) {
    let d: Derivation | null;
    let on: string;
    try {
      d = derive(lines, 0);
      on = figureSignature(d.figure);
    } catch {
      d = null;
      on = 'throws';
    }
    if (d && isGreen(d)) {
      w.figures += 1;
      const pk = panelKnowledge(d);
      const claims = claimsOf(pk);
      w.known += claims.length;
      liesOf(lines, d, claims, w.lies);
      if (reportedDof(d.construction, d.figure.carrierDof) > 0) {
        w.free += 1;
        if (!panelShowsUnknown(pk)) w.freedomBad.push(JSON.stringify(lines));
      }
    }
    w.memoSigned += 1;
    if (on !== signedWithMemo(lines, false)) w.memoDiff.push(JSON.stringify(lines));
  }
  w.lies = [...new Set(w.lies)];
  return w;
}

/** #1473 over the Z variant: the lie list and the number of green figures. */
function walkWithZ(seqs: readonly string[][]): { lies: string[]; figures: number } {
  const lies: string[] = [];
  let figures = 0;
  for (const lines of seqs) {
    let d: Derivation;
    try {
      d = derive(lines, 0);
    } catch {
      continue;
    }
    if (!isGreen(d)) continue;
    figures += 1;
    liesOf(lines, d, claimsOf(panelKnowledge(d)), lies);
  }
  return { lies: [...new Set(lies)], figures };
}

/** Shard k of n (1-based) of the corpus: round-robin, so the slices are disjoint, cover it, and are even. */
const slice = <T>(items: readonly T[], k: number, n: number): T[] => items.filter((_, i) => i % n === k - 1);

/** Register shard `k` of `n` of the analytic corpus walk (#2736, #2739). */
export function poolInvariantShard(k: number, n: number): void {
  const tag = ` (shard ${k}/${n})`;
  const corpus = analyticCorpus();
  // Walked on first use, once per shard file: three `it`s below read the one walk.
  let asIs: AsIsWalk | undefined;
  const walked = () => (asIs ??= walkAsIs(slice(corpus, k, n)));

  describe(`#1473 — a value the panel settles as known never varies over the configurations the tool draws${tag}`, () => {
    it(`the corpus as-is${tag}`, () => {
      const r = walked();
      expect(r.lies).toEqual([]);
      // the sweep exercised real claims — a net that checks nothing passes by default. Whole-corpus floors
      // 400 figures / 1000 claims: each of the n slices clears floor/n strictly, so together they clear it.
      expect(r.figures).toBeGreaterThan(400 / n);
      expect(r.known).toBeGreaterThan(1000 / n);
    }, 900_000);

    it(`the corpus with an unrelated «נקודה Z» appended (the mid-build state that exposed the class)${tag}`, () => {
      const r = walkWithZ(slice(corpus.filter((s) => !s.includes(Z)).map((s) => [...s, Z]), k, n));
      expect(r.lies).toEqual([]);
      expect(r.figures).toBeGreaterThan(400 / n);
    }, 900_000);

    if (k === 1) {
      it(`the ${n} slices walk the corpus exactly once${tag}`, () => {
        for (const items of [corpus, corpus.filter((s) => !s.includes(Z))]) {
          const seen = new Array<number>(items.length).fill(0);
          let total = 0;
          for (let j = 1; j <= n; j += 1) {
            const idx = slice(items.map((_, i) => i), j, n);
            total += idx.length;
            for (const i of idx) seen[i] += 1;
          }
          expect(total).toBe(items.length);
          expect(seen.every((x) => x === 1)).toBe(true);
        }
      });
    }
  });

  describe(`#1473 — the conic memo changes no figure in the corpus${tag}`, () => {
    it(`derive(lines, 0) signs identically with the memo off${tag}`, () => {
      const r = walked();
      expect(r.memoDiff).toEqual([]);
      // whole-corpus floor 400, by the same per-slice proof
      expect(r.memoSigned).toBeGreaterThan(400 / n);
    }, 900_000);
  });

  describe(`#1289 — freedom in the panel means something in the panel is unknown${tag}`, () => {
    it(`holds over every figure the analytic suite and catalog build${tag}`, () => {
      const r = walked();
      expect(r.freedomBad).toEqual([]);
      // the net actually exercised free figures — whole-corpus floor 100, by the same per-slice proof
      expect(r.free).toBeGreaterThan(100 / n);
    }, 900_000);
  });
}
