/**
 * Issue #311 / ADR-3D-072 — a TWO-basis (or one-basis) figure decomposes derived vectors in its
 * declared span; out-of-span targets stay honestly undetermined.
 *
 * Operator (2026-07-25, local test): pyramid ABCS, SD=(2/3)SB, F midpoint SC, BC=v, SB=u,
 * FE=u/6-v/6, segment DE — querying DE answered «לא נקבע על ידי הנתונים» although DE = ⅓·v exactly.
 * Root cause: `basisDecompose` and `parametricDecomp` hard-required THREE declared basis vectors
 * (`if (basis.length < 3) return null`), and the query lane carried its own inline 3×3 copy with the
 * same gate — so every planar sub-figure (a very common bagrut shape) refused wholesale. The fix is
 * rank-aware: n×n Gram normal equations over the declared 1–3 vectors, accepted only when the
 * residual vanishes (in-span decomposes; out-of-span stays null — never a least-squares guess).
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { answerQuery } from '../engine/queries';
import { dataView } from '../engine/dataView';

function build(utts: string[]): Fact3[] {
  return utts.map((u, i) => {
    const r = parse3(u);
    expect(r.ok, `parse: ${u}`).toBe(true);
    return { id: `f${i}`, utterance: u, cmds: r.ok ? r.commands : [], enabled: true };
  });
}

const OPERATOR_SEQ = (feSign: '-' | '+') => [
  'פירמידה משולשת ABCS',
  'SD=(2/3)SB',
  'F אמצע SC',
  'BC=v',
  'SB=u',
  `FE=u/6${feSign}v/6`,
  'DE',
];

describe('#311 — the operator’s exact sequence (two declared basis vectors)', () => {
  it('DE decomposes to 1/3·v in the panel AND the query lane (they share the core)', () => {
    const d = derive3(build(OPERATOR_SEQ('-')), 0);
    for (const [id, st] of Object.entries(d.status)) expect(st, id).toBe('ok');
    const q = answerQuery(d.construction, 'DE', 0);
    expect(q.answer).toBe('1/3·v');
    expect(JSON.stringify(dataView(d.construction, 0))).toContain('1/3·v');
  });

  it('the + variant: DE = 2/3·v, and E lies ON edge SC (u+v = S→C forces it — the placement the operator read as wrong is the unique correct point)', () => {
    const d = derive3(build(OPERATOR_SEQ('+')), 0);
    const q = answerQuery(d.construction, 'DE', 0);
    expect(q.answer).toBe('2/3·v');
    for (const seed of [0, 1013]) {
      const pos = resolve3(d.construction, seed).positions;
      const S = pos.get('S')!, C = pos.get('C')!, E = pos.get('E')!;
      // E = S + t·(C−S) with t = 2/3 — collinear with SC, inside the edge.
      const t = { x: C.x - S.x, y: C.y - S.y, z: C.z - S.z };
      const e = { x: E.x - S.x, y: E.y - S.y, z: E.z - S.z };
      const cross = Math.hypot(e.y * t.z - e.z * t.y, e.z * t.x - e.x * t.z, e.x * t.y - e.y * t.x);
      expect(cross).toBeLessThan(1e-6 * Math.hypot(t.x, t.y, t.z) ** 2);
      const param = (e.x * t.x + e.y * t.y + e.z * t.z) / (t.x ** 2 + t.y ** 2 + t.z ** 2);
      expect(param).toBeCloseTo(2 / 3, 6);
    }
  });

  it('an OUT-OF-SPAN target stays honestly undetermined (SA is not in span(u,v))', () => {
    const d = derive3(build(OPERATOR_SEQ('-')), 0);
    const q = answerQuery(d.construction, 'וקטור SA', 0);
    expect(q.answer ?? null).toBeNull();
  });
});

describe('#311 — one declared basis vector (collinear span)', () => {
  it('SD decomposes to 2/3·u with only u declared', () => {
    const d = derive3(build(['פירמידה משולשת ABCS', 'SD=(2/3)SB', 'SB=u']), 0);
    const q = answerQuery(d.construction, 'וקטור SD', 0);
    expect(q.answer).toBe('2/3·u');
  });
});
