/**
 * #4 ([ADR-585](../../docs/06-decisions.md#adr-585)) — an accepted step COMMITS the free vertices its own
 * solve moved, so later steps neither re-pay that solve nor spring the vertices back.
 *
 * The operator's kite sequence (scenario `area-ratio-converges-points-allowed`): «BE⊥DC» puts E's foot
 * outside segment DC at the default kite, so `evaluate`'s convex ladder recruits the free vertices B, D
 * (ADR-097) to draw it. That recruitment was ephemeral: B and D kept their infeasible stored values, every
 * later step's evaluate re-ran the failing driven-only solve and then the recruited one (~85k evaluateCore
 * calls per step, 88% of the figure's cold cost), and B jumped back to its old place at the area-ratio step.
 *
 * Operation counts (evaluateCore work units), never wall-clock. The facts are INLINE (the parse-time
 * `factsOf` would warm the fold memo), so the first replay below is genuinely cold. Measured: cold
 * 484,883 before → 122,909 after; the step after «BE⊥DC» 85,358 → 2,065.
 */
import { describe, expect, it } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { work } from '@/engine/solveBudget';
import { carrierParams, resolveDrivenMemo } from '@/engine/evaluate';

// ABCD דלתון חסום במעגל · AB=AD · CB=CD · E על DC · BE⊥DC · AC · N = חיתוך BE ו-AC · שטח משולש NCE= רבע שטח משולש ACD
const FACTS = [
  {"id":"g0.0","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"circle","id":"circle-O","center":"@ctr-O","radius":5,"freeRadius":true,"autoCenter":true},"enabled":true},
  {"id":"g0.1","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"point-on-circle","id":"A","circle":"circle-O","theta":1.5707963267948966,"free":true},"enabled":true},
  {"id":"g0.2","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"point-on-circle","id":"B","circle":"circle-O","theta":5.934119456780721,"free":true},"enabled":true},
  {"id":"g0.3","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"point-on-circle","id":"C","circle":"circle-O","theta":4.71238898038469,"free":true},"enabled":true},
  {"id":"g0.4","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"point-on-circle","id":"D","circle":"circle-O","theta":3.490658503988659,"free":true},"enabled":true},
  {"id":"g0.5","utterance":"ABCD דלתון חסום במעגל","group":"g0","cmd":{"type":"shape-variant","shape":"kite","ids":["A","B","C","D"],"variant":0},"enabled":true},
  {"id":"g1.6","utterance":"AB=AD","group":"g1","cmd":{"type":"segment","a":"A","b":"B"},"enabled":true},
  {"id":"g1.7","utterance":"AB=AD","group":"g1","cmd":{"type":"segment","a":"A","b":"D"},"enabled":true},
  {"id":"g1.8","utterance":"AB=AD","group":"g1","cmd":{"type":"set-equal","a":"A","b":"B","c":"A","d":"D"},"enabled":true},
  {"id":"g2.9","utterance":"CB=CD","group":"g2","cmd":{"type":"segment","a":"C","b":"B"},"enabled":true},
  {"id":"g2.10","utterance":"CB=CD","group":"g2","cmd":{"type":"segment","a":"C","b":"D"},"enabled":true},
  {"id":"g2.11","utterance":"CB=CD","group":"g2","cmd":{"type":"set-equal","a":"C","b":"B","c":"C","d":"D"},"enabled":true},
  {"id":"g3.12","utterance":"E על DC","group":"g3","cmd":{"type":"segment","a":"D","b":"C"},"enabled":true},
  {"id":"g3.13","utterance":"E על DC","group":"g3","cmd":{"type":"point-on-segment","id":"E","a":"D","b":"C"},"enabled":true},
  {"id":"g4.14","utterance":"BE⊥DC","group":"g4","cmd":{"type":"segment","a":"B","b":"E"},"enabled":true},
  {"id":"g4.15","utterance":"BE⊥DC","group":"g4","cmd":{"type":"segment","a":"D","b":"C"},"enabled":true},
  {"id":"g4.16","utterance":"BE⊥DC","group":"g4","cmd":{"type":"set-perpendicular","a":"B","b":"E","c":"D","d":"C"},"enabled":true},
  {"id":"g5.17","utterance":"AC","group":"g5","cmd":{"type":"segment","a":"A","b":"C"},"enabled":true},
  {"id":"g6.18","utterance":"N = חיתוך BE ו-AC","group":"g6","cmd":{"type":"segment","a":"B","b":"E"},"enabled":true},
  {"id":"g6.19","utterance":"N = חיתוך BE ו-AC","group":"g6","cmd":{"type":"segment","a":"A","b":"C"},"enabled":true},
  {"id":"g6.20","utterance":"N = חיתוך BE ו-AC","group":"g6","cmd":{"type":"line-line-intersection","id":"N","a":"B","b":"E","c":"A","d":"C","onSeg":true},"enabled":true},
  {"id":"g7.21","utterance":"שטח משולש NCE= רבע שטח משולש ACD","group":"g7","cmd":{"type":"set-area-ratio","ids1":["N","C","E"],"ids2":["A","C","D"],"k":0.25},"enabled":true},
] as Fact[];
const PERP = 17; // facts up to and including «BE⊥DC»

describe('#4 — the drawn free vertices are committed at accept (ADR-585)', () => {
  // ORDER MATTERS: the first test is the cold measurement; the rest reuse the warm fold memo.
  it('cold replay of the whole figure stays well under the pre-fix cost (operation count, cold and warm)', () => {
    let w = work.done;
    const fig = replay(FACTS, 0);
    const cold = work.done - w;
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    expect(cold, `cold work ${cold}`).toBeLessThan(200_000); // 484,883 before, 122,909 after
    w = work.done;
    replay(FACTS.map((f) => ({ ...f })), 0); // content-equal copy: the fold memo serves it
    expect(work.done - w).toBe(0);
  });

  it('a step after «BE⊥DC» no longer re-pays the recruited solve', () => {
    replay(FACTS.slice(0, PERP), 0);
    const w = work.done;
    replay(FACTS.slice(0, PERP + 1), 0); // «AC» — a segment, no new constraint
    const step = work.done - w;
    expect(step, `marginal work ${step}`).toBeLessThan(20_000); // 85,358 before, 2,065 after
  });

  it('the accepted construction carries no ephemeral recruitment: every undriven carrier is stored at its drawn value', () => {
    const fig = replay(FACTS.slice(0, PERP), 0);
    const baked = new Map(resolveDrivenMemo(fig.construction).objects.map((o) => [o.id, o] as const));
    let undriven = 0;
    for (const o of fig.construction.objects) {
      if ((o as { solve?: unknown }).solve !== undefined) continue;
      const was = carrierParams(o);
      const b = baked.get(o.id);
      if (!was || !b || b.kind !== o.kind) continue;
      undriven++;
      expect(carrierParams(b), `${o.id} moved by the solve but not committed`).toEqual(was);
    }
    expect(undriven).toBeGreaterThanOrEqual(2); // B and D at least — the check exercised something
  });

  it('stability: B, a free vertex no later given touches, does not jump when the area ratio is added', () => {
    const before = replay(FACTS.slice(0, FACTS.length - 1), 0).positions.get('B')!;
    const after = replay(FACTS, 0).positions.get('B')!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-6);
  });
});
