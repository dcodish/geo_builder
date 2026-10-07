/**
 * Issue #1844 (ADR-3D-308): a SHAPE's own condition draws nothing nobody named.
 *
 * The instance (measured on main @ e17a7d1e): «טרפז ABCD חסום במעגל», «טרפז שווה שוקיים ABCD», "isosceles
 * trapezoid ABCD inscribed in a circle" and «פירמידה ישרה שבסיסה טרפז שווה שוקיים» each drew the diagonal AC.
 * #1792 (ADR-3D-307) lowered the isosceles trapezoid to equal DIAGONALS, |AC| = |BD|, as an ordinary
 * `length-rel` command, and the `length-rel` apply branch auto-draws its lhs pair — the side effect of a
 * STATED sentence («|AC| = |BD|»), which the noun never was.
 *
 * The class: a shape-internal condition lowered through a command kind students also type inherits the
 * stated sentence's ink. The fix is a provenance marker (`origin: 'shape'`), stamped by the one seam every
 * shape lowering passes through (`shapeInternal3`) and honoured at every apply site that draws a relation's
 * operands (`length-rel`, `cos-angle`, `mutual-rel`). The condition still drives and is still judged.
 *
 * Locks: the exact lines at seeds 0–7 (segments = ring sides / solid edges, and the trapezoid IS isosceles);
 * the «|AC| = |BD|» control; the apply-level pair (marked vs unmarked) for each drawing kind; and a sweep over
 * every shape lowering the grammar has, with an exercised counter.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { quadShapeConstraints, shapeInternal3, type QuadBase } from '../engine/baseShapes';
import { emptyConstruction3, type Command3, type Construction3 } from '../engine/types';
import { dist3, type Vec3 } from '../engine/vec3';

const SEEDS = 8;
const RELATION_KINDS = new Set(['length-rel', 'cos-angle', 'mutual-rel', 'concyclic']);

/** Decide `lines` in order from an empty canvas; null when a line does not record. */
function build(lines: readonly string[]): Fact3[] | null {
  let facts: Fact3[] = [];
  let n = 0;
  for (const line of lines) {
    const v = decideDeterministic3({ facts, seed: 0 }, line, () => `f${++n}`);
    if (v.kind !== 'record') return null;
    facts = v.facts;
  }
  return facts;
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

/** Every auxiliary segment the figure draws that is NOT an edge of a solid (a polygon's ring included). */
function strayInk(c: Construction3): string[] {
  const edges = new Set(c.solids.flatMap((s) => s.edges.map(([a, b]) => pairKey(a, b))));
  return c.segments.filter(([a, b]) => !edges.has(pairKey(a, b))).map(([a, b]) => `${a}${b}`);
}

const at = (pos: Map<string, Vec3>, id: string): Vec3 => {
  const p = pos.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};

describe('#1844 the reported lines draw only the ring (and the solid), at seeds 0–7', () => {
  it.each([
    ['טרפז שווה שוקיים ABCD'],
    ['טרפז ABCD חסום במעגל'],
    ['isosceles trapezoid ABCD inscribed in a circle'],
    ['פירמידה ישרה שבסיסה טרפז שווה שוקיים'],
    ['פירמידה ישרה SABCD שבסיסה טרפז שווה שוקיים'],
  ])('«%s»: no AC, and the trapezoid is still isosceles', (line) => {
    const facts = build([line]);
    expect(facts, line).not.toBeNull();
    for (let seed = 0; seed < SEEDS; seed++) {
      const d = derive3(facts!, seed);
      for (const f of facts!) expect(d.status[f.id], `${line} @${seed}`).toBe('ok');
      expect(strayInk(d.construction), `${line} @${seed}`).toEqual([]);
      // the condition still DRIVES: the marker removed ink, not the given
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(d.positions, id));
      expect(Math.abs(dist3(A, C) - dist3(B, D)), `${line} @${seed}: |AC| = |BD|`).toBeLessThan(1e-6);
    }
  });

  it('the shape condition is still a given: it is lowered, marked, and judged beside its pin', () => {
    const facts = build(['טרפז שווה שוקיים ABCD'])!;
    const rel = facts[0].cmds.find((k) => k.type === 'length-rel');
    expect(rel).toMatchObject({ type: 'length-rel', a1: 'A', b1: 'C', rhs: { pair: ['B', 'D'] }, origin: 'shape' });
    const c = derive3(facts, 0).construction;
    expect(c.scalarPins.some((p) => p.kind === 'length-rel' && p.a1 === 'A' && p.b1 === 'C')).toBe(true);
    expect(c.claims.some((cl) => cl.type === 'length-rel' && cl.a1 === 'A' && cl.b1 === 'C' && cl.given === true)).toBe(true);
  });
});

describe('#1844 the control — a STUDENT\'s own relation still draws what it names', () => {
  it('«טרפז שווה שוקיים ABCD» · «|AC| = |BD|» draws AC', () => {
    const facts = build(['טרפז שווה שוקיים ABCD', '|AC| = |BD|']);
    expect(facts).not.toBeNull();
    const d = derive3(facts!, 0);
    for (const f of facts!) expect(d.status[f.id]).toBe('ok');
    expect(strayInk(d.construction)).toEqual(['AC']);
    // the typed relation is unmarked — the marker belongs to shape lowerings only
    const typed = facts![1].cmds.find((k) => k.type === 'length-rel');
    expect(typed && 'origin' in typed ? typed.origin : undefined).toBeUndefined();
  });

  it('«טרפז ABCD» · «|AC| = |BD|» draws AC (no shape condition to share the pair with)', () => {
    const facts = build(['טרפז ABCD', '|AC| = |BD|'])!;
    expect(strayInk(derive3(facts, 0).construction)).toEqual(['AC']);
  });
});

describe('#1844 apply: every drawing relation kind skips its ink when shape-internal, and only then', () => {
  /** A free flat quad ABCD — four free dims, so every relation below drives. */
  const quad = (): Construction3 => {
    const r = applyCommand3(emptyConstruction3(), { type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.next;
  };
  const DIAGONAL_RELATIONS: Command3[] = [
    { type: 'length-rel', a1: 'A', b1: 'C', rhs: { pair: ['B', 'D'] }, c: 1 },
    { type: 'cos-angle', u: { kind: 'pair', from: 'A', to: 'C' }, v: { kind: 'pair', from: 'B', to: 'D' }, cos: 0 },
    { type: 'mutual-rel', rel: 'intersecting', a: { kind: 'segment', a: 'A', b: 'C' }, b: { kind: 'segment', a: 'B', b: 'D' } },
  ];
  it.each(DIAGONAL_RELATIONS.map((k) => [k.type, k] as const))('%s', (_kind, cmd) => {
    const stated = applyCommand3(quad(), cmd);
    const shaped = applyCommand3(quad(), shapeInternal3([cmd as Parameters<typeof shapeInternal3>[0][number]])[0]);
    expect(stated.ok && shaped.ok).toBe(true);
    if (!stated.ok || !shaped.ok) return;
    expect(strayInk(stated.next).sort(), 'a stated relation draws its operands').toEqual(
      cmd.type === 'length-rel' ? ['AC'] : ['AC', 'BD'],
    );
    expect(strayInk(shaped.next), 'a shape condition draws nothing').toEqual([]);
    // and nothing else changes: the same drive and the same judgement
    expect(shaped.next.scalarPins).toEqual(stated.next.scalarPins);
    expect(shaped.next.claims).toEqual(stated.next.claims);
    expect(shaped.next.requirements).toEqual(stated.next.requirements);
  });
});

describe('#1844 the sweep — no shape lowering emits an unmarked relation or draws a non-edge', () => {
  it('every `quadShapeConstraints` family is marked', () => {
    const bases: QuadBase[] = ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'quad'];
    let n = 0;
    for (const b of bases) {
      for (const k of quadShapeConstraints(b, ['A', 'B', 'C', 'D'])) {
        n++;
        expect(k, `${b}`).toMatchObject({ origin: 'shape' });
      }
    }
    expect(n).toBeGreaterThanOrEqual(12);
  });

  const QUADS = ['ריבוע', 'מלבן', 'מעוין', 'מקבילית', 'דלתון', 'טרפז', 'מרובע'];
  const QUADS_EN = ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'quadrilateral'];
  const lines: string[] = [];
  for (const [i, he] of QUADS.entries()) {
    const en = QUADS_EN[i];
    lines.push(`${he} ABCD`, `${he} ABCD חסום במעגל`, `${en} ABCD`, `${en} ABCD inscribed in a circle`);
    lines.push(`פירמידה ישרה SABCD שבסיסה ${he}`, `פירמידה SABCD שבסיסה ${he}`, `מנסרה ABCDA'B'C'D' שבסיסה ${he}`);
  }
  for (const adj of ['שווה שוקיים', 'ישר זווית']) {
    lines.push(`טרפז ${adj} ABCD`, `טרפז ${adj} ABCD חסום במעגל`, `פירמידה ישרה SABCD שבסיסה טרפז ${adj}`, `פירמידה SABCD שבסיסה טרפז ${adj}`);
  }
  lines.push('isosceles trapezoid ABCD', 'right trapezoid ABCD', 'פירמידה ישרה שבסיסה טרפז שווה שוקיים');
  for (const adj of ['שווה שוקיים', 'שווה צלעות', 'ישר זווית']) {
    lines.push(`משולש ${adj} ABC`, `משולש ${adj} ABC חסום במעגל`, `פירמידה ABCD שבסיסה משולש ${adj}`, `מנסרה ABCA'B'C' שבסיסה משולש ${adj}`);
  }
  lines.push('טטראדר שווה מקצועות ABCD', 'regular tetrahedron ABCD', 'מחומש ABCDE חסום במעגל', 'פירמידה ישרה SABC');

  it(`sweeps ${lines.length} shape lines`, () => {
    let recorded = 0;
    let relations = 0;
    for (const line of lines) {
      const facts = build([line]);
      if (!facts) continue; // a refusal or an escalation commits nothing — nothing to draw
      recorded++;
      for (const k of facts.flatMap((f) => f.cmds)) {
        if (!RELATION_KINDS.has(k.type)) continue;
        relations++;
        expect(k, `${line}: ${k.type} is a shape condition`).toMatchObject({ origin: 'shape' });
      }
      expect(strayInk(derive3(facts, 0).construction), line).toEqual([]);
    }
    // the exercised counter: the sweep must build figures and meet shape conditions, not pass on refusals
    expect(recorded).toBeGreaterThanOrEqual(50);
    expect(relations).toBeGreaterThanOrEqual(40);
  }, 120_000);
});
