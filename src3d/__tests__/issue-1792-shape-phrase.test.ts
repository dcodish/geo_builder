/**
 * Issue #1792 (ADR-3D-307): ONE shape-phrase reader — an inscription honours the shape's adjective, a
 * quad's circumcircle is cyclic, a right trapezoid in a circle is refused, and the container marker
 * belongs to the whole phrase.
 *
 * The class (measured on main @ dc86550a): a shape-property adjective on a polygon noun, and the
 * inscription itself, were read by `polygonCircle3`'s private tests and a noun-only quad vocabulary.
 * «טרפז ישר זווית ABCD» and every quad inscription with an adjective was a dropped given; «טרפז / מקבילית /
 * מעוין / מרובע ABCD חסום במעגל» committed a ring NO circle passes through, green; "right trapezoid ABCD
 * inscribed in a circle" dropped "right" green; "circle inscribed in right triangle ABC" drew a
 * CIRCUMcircle.
 *
 * The lock is the class sweep: 8 nouns × {none, right, isosceles, equilateral} × the four inscription
 * frames × lettered/unlettered × He/En. Every row either COMMITS with its noun, its adjective and its
 * circle measured on the figure at 24 seeds, or does not commit (a refusal or an escalation). No row
 * commits without its property. The exercised counter keeps the sweep from passing by checking nothing.
 */

import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { readShapePhrase3 } from '../lexicon/shapePhrase3';
import { droppedShapeAdjective3 } from '../parser/honesty3';
import { parse3 } from '../parser/parse3';
import { errorText3 } from '../i18n/errorText3';
import { add3, cross3, dist3, dot3, norm3, scale3, sub3, type Vec3 } from '../engine/vec3';
import type { Command3 } from '../engine/types';

const SEEDS = 24;
const TOL = 1e-4;

type Noun = 'triangle' | 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'kite' | 'trapezoid' | 'quad';
type Adj = 'none' | 'right' | 'isosceles' | 'equilateral';
const NOUNS: Record<Noun, { he: string; en: string; n: 3 | 4 }> = {
  triangle: { he: 'משולש', en: 'triangle', n: 3 },
  square: { he: 'ריבוע', en: 'square', n: 4 },
  rectangle: { he: 'מלבן', en: 'rectangle', n: 4 },
  rhombus: { he: 'מעוין', en: 'rhombus', n: 4 },
  parallelogram: { he: 'מקבילית', en: 'parallelogram', n: 4 },
  kite: { he: 'דלתון', en: 'kite', n: 4 },
  trapezoid: { he: 'טרפז', en: 'trapezoid', n: 4 },
  quad: { he: 'מרובע', en: 'quadrilateral', n: 4 },
};
const ADJS: Record<Adj, { he: string; en: string }> = {
  none: { he: '', en: '' },
  right: { he: 'ישר זווית', en: 'right' },
  isosceles: { he: 'שווה שוקיים', en: 'isosceles' },
  equilateral: { he: 'שווה צלעות', en: 'equilateral' },
};
/** The four inscription frames; `circum` says whether the CIRCLE is the container. */
const FRAMES: { circum: boolean; he: (p: string) => string; en: (p: string) => string }[] = [
  { circum: true, he: (p) => `${p} חסום במעגל`, en: (p) => `${p} inscribed in a circle` },
  { circum: false, he: (p) => `מעגל חסום ב${p}`, en: (p) => `circle inscribed in ${p}` },
  { circum: true, he: (p) => `מעגל חוסם את ${p}`, en: (p) => `circle circumscribed about ${p}` },
  { circum: false, he: (p) => `${p} חוסם מעגל`, en: (p) => `${p} circumscribed about a circle` },
];

const at = (pos: Map<string, Vec3>, id: string): Vec3 => {
  const p = pos.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
const cosAt = (v: Vec3, p: Vec3, q: Vec3): number => dot3(sub3(p, v), sub3(q, v)) / (norm3(sub3(p, v)) * norm3(sub3(q, v)));
const parallel = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean => norm3(cross3(sub3(b, a), sub3(d, c))) / (dist3(a, b) * dist3(c, d)) < TOL;
const eq = (x: number, y: number): boolean => Math.abs(x - y) < TOL * Math.max(1, x, y);

/** The NOUN's own property on the drawn ring (inclusive: a square is a rhombus). */
function nounHolds(noun: Noun, r: Vec3[]): boolean {
  const [a, b, c, d] = r;
  const s = r.map((p, i) => dist3(p, r[(i + 1) % r.length]));
  const right = (i: number) => Math.abs(cosAt(r[i], r[(i + r.length - 1) % r.length], r[(i + 1) % r.length])) < TOL;
  switch (noun) {
    case 'square': return s.every((x) => eq(x, s[0])) && right(0);
    case 'rectangle': return right(0) && right(1) && right(2);
    case 'rhombus': return s.every((x) => eq(x, s[0]));
    case 'parallelogram': return parallel(a, b, d, c) && parallel(a, d, b, c);
    case 'kite': return eq(dist3(a, b), dist3(a, d)) && eq(dist3(c, b), dist3(c, d));
    case 'trapezoid': return parallel(a, b, d, c);
    default: return true;
  }
}

/** The ADJECTIVE's property on the drawn ring. */
function adjHolds(noun: Noun, adj: Adj, r: Vec3[]): boolean {
  const s = r.map((p, i) => dist3(p, r[(i + 1) % r.length]));
  const anyRight = r.some((v, i) => Math.abs(cosAt(v, r[(i + r.length - 1) % r.length], r[(i + 1) % r.length])) < TOL);
  if (adj === 'none') return true;
  if (adj === 'right') return anyRight;
  if (adj === 'equilateral') return s.every((x) => eq(x, s[0]));
  // isosceles: a triangle's two equal sides; a trapezoid's equal diagonals (equivalently, equal legs off a parallelogram)
  if (noun === 'trapezoid') return eq(dist3(r[0], r[2]), dist3(r[1], r[3]));
  return eq(s[0], s[1]) || eq(s[1], s[2]) || eq(s[2], s[0]);
}

/** The circle holds on the figure: through every vertex (circum), or tangent to every side inside it. */
function circleHolds(circum: boolean, r: Vec3[], k: { center: Vec3; radius: number }): boolean {
  if (circum) return r.every((p) => eq(dist3(p, k.center), k.radius));
  return r.every((p, i) => {
    const q = r[(i + 1) % r.length];
    const d = sub3(q, p);
    const t = dot3(sub3(k.center, p), d) / dot3(d, d);
    const foot = add3(p, scale3(d, t));
    return t > -TOL && t < 1 + TOL && eq(dist3(foot, k.center), k.radius);
  });
}

type Outcome = { committed: boolean; reason: string };

/** Decide `line` on an empty canvas; when it commits, measure noun/adjective/circle at every seed. */
function measure(line: string, noun: Noun, adj: Adj, circum: boolean | null): Outcome {
  let n = 0;
  const v = decideDeterministic3({ facts: [], seed: 0 }, line, () => `f${++n}`);
  if (v.kind !== 'record') return { committed: false, reason: v.kind === 'refused' ? v.error.code : v.kind };
  const ids = NOUNS[noun].n === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  for (let seed = 0; seed < SEEDS; seed++) {
    const d = derive3(v.facts, seed);
    for (const f of v.facts) expect(d.status[f.id], `${line} @${seed}`).toBe('ok');
    const ring = ids.map((id) => at(d.positions, id));
    expect(nounHolds(noun, ring), `${line} @${seed}: noun`).toBe(true);
    expect(adjHolds(noun, adj, ring), `${line} @${seed}: adjective`).toBe(true);
    if (circum !== null) {
      const k = d.resolved.circles3[0];
      expect(k, `${line}: a circle`).toBeDefined();
      expect(circleHolds(circum, ring, k), `${line} @${seed}: circle`).toBe(true);
    }
  }
  return { committed: true, reason: 'record' };
}

describe('#1792 the class sweep — every row commits WITH its property, or does not commit', () => {
  const rows: { line: string; noun: Noun; adj: Adj; circum: boolean }[] = [];
  for (const noun of Object.keys(NOUNS) as Noun[]) {
    for (const adj of Object.keys(ADJS) as Adj[]) {
      for (const frame of FRAMES) {
        for (const lettered of [true, false]) {
          const ring = lettered ? (NOUNS[noun].n === 3 ? ' ABC' : ' ABCD') : '';
          const he = [NOUNS[noun].he, ADJS[adj].he].filter(Boolean).join(' ') + ring;
          const en = [ADJS[adj].en, NOUNS[noun].en].filter(Boolean).join(' ') + ring;
          rows.push({ line: frame.he(he), noun, adj, circum: frame.circum });
          rows.push({ line: frame.en(en), noun, adj, circum: frame.circum });
        }
      }
    }
  }

  it(`sweeps ${rows.length} rows at ${SEEDS} seeds`, () => {
    const tally: Record<string, number> = {};
    for (const r of rows) {
      const o = measure(r.line, r.noun, r.adj, r.circum);
      tally[o.reason] = (tally[o.reason] ?? 0) + 1;
    }
    // the exercised counter: the sweep must actually build figures, not pass by refusing everything
    expect(tally.record ?? 0).toBeGreaterThanOrEqual(64); // measured: 64 commit, 8 ruled refusals, 36 incircle-needs-triangle, the rest escalate
    // and the ruled refusal is reached by its own rows
    expect(tally['inscribed-contradicts-noun'] ?? 0).toBeGreaterThanOrEqual(8);
  }, 300_000);
});

describe('#1792 the measured instances', () => {
  it.each([
    ['טרפז ABCD חסום במעגל', 'trapezoid', 'isosceles'],
    ['מקבילית ABCD חסומה במעגל', 'rectangle', 'none'],
    ['מעוין ABCD חסום במעגל', 'square', 'none'],
    ['מרובע ABCD חסום במעגל', 'quad', 'none'],
    ['דלתון ABCD חסום במעגל', 'kite', 'right'],
    ['טרפז שווה שוקיים ABCD חסום במעגל', 'trapezoid', 'isosceles'],
  ] as [string, Noun, Adj][])('«%s» draws the cyclic member, every vertex on the circle', (line, member, adj) => {
    expect(measure(line, member, adj, true).committed).toBe(true);
  });

  it('a pentagon in a circle is drawn cyclic too (each vertex past the third is put on the circle)', () => {
    let n = 0;
    const v = decideDeterministic3({ facts: [], seed: 0 }, 'מחומש ABCDE חסום במעגל', () => `f${++n}`);
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    for (let seed = 0; seed < SEEDS; seed++) {
      const d = derive3(v.facts, seed);
      const ring = ['A', 'B', 'C', 'D', 'E'].map((id) => at(d.positions, id));
      expect(circleHolds(true, ring, d.resolved.circles3[0]), `@${seed}`).toBe(true);
    }
  });

  it.each([
    ['טרפז ישר זווית ABCD', 'trapezoid', 'right'],
    ['right trapezoid ABCD', 'trapezoid', 'right'],
    ['טרפז שווה שוקיים ABCD', 'trapezoid', 'isosceles'],
    ['isosceles trapezoid ABCD', 'trapezoid', 'isosceles'],
  ] as [string, Noun, Adj][])('the standalone «%s» builds with its adjective', (line, noun, adj) => {
    expect(measure(line, noun, adj, null).committed).toBe(true);
  });

  it('"circle inscribed in right triangle ABC" draws the INcircle of a right triangle (arm C)', () => {
    const r = parse3('circle inscribed in right triangle ABC');
    expect(r.ok && r.commands.some((c) => c.type === 'circle3' && c.def.kind === 'incircle')).toBe(true);
    expect(measure('circle inscribed in right triangle ABC', 'triangle', 'right', false).committed).toBe(true);
    expect(measure('circle inscribed in an isosceles triangle ABC', 'triangle', 'isosceles', false).committed).toBe(true);
  });

  it('an adjective the noun cannot carry escalates — never committed without it', () => {
    for (const line of ['מרובע ישר זווית ABCD חסום במעגל', 'מרובע ישר זווית ABCD', 'right-angled quadrilateral ABCD inscribed in a circle']) {
      const v = decideDeterministic3({ facts: [], seed: 0 }, line);
      expect(v.kind, line).not.toBe('record');
    }
  });

  it('a stated right angle elsewhere on the ring retires the right trapezoid\'s soft default (M4)', () => {
    let n = 0;
    let st: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
    for (const line of ['טרפז ישר זווית ABCD', 'זווית ABC = 90']) {
      const v = decideDeterministic3(st, line, () => `f${++n}`);
      expect(v.kind, line).toBe('record');
      if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
    }
    const d = derive3(st.facts, st.seed);
    const [a, b, c, dd] = ['A', 'B', 'C', 'D'].map((id) => at(d.positions, id));
    expect(Math.abs(cosAt(b, a, c))).toBeLessThan(TOL); // the stated corner
    expect(Math.abs(cosAt(a, dd, b))).toBeGreaterThan(0.05); // the default did not stack into a rectangle
  });
});

describe('#1792 the #1554 ruling — a right trapezoid in a circle is refused, naming both shapes', () => {
  it.each(['טרפז ישר זווית ABCD חסום במעגל', 'טרפז ישר זווית חסום במעגל', 'right trapezoid ABCD inscribed in a circle', 'מעגל חוסם את טרפז ישר זווית ABCD'])(
    '«%s»',
    (line) => {
      const v = decideDeterministic3({ facts: [], seed: 0 }, line);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.error).toMatchObject({ code: 'inscribed-contradicts-noun', shape: 'rightTrapezoid', forced: 'rectangle', sentence: line });
      const msg = errorText3((k, o) => `${k}${o ? JSON.stringify(o) : ''}`, v.error);
      expect(msg).toContain('err.inscribedContradictsNoun');
      expect(msg).toContain('notice.shape.rightTrapezoid');
      expect(msg).toContain('notice.shape.rectangle');
    },
  );
  it('the inverse direction is not the ruling: a circle IN a right trapezoid is not refused by it', () => {
    const r = parse3('מעגל חסום בטרפז ישר זווית ABCD');
    expect(!r.ok && r.reason === 'inscribed-contradicts-noun').toBe(false);
  });
});

describe('#1792 the reader and the gate', () => {
  it('the noun decides the arity; an adjective is consumed only where it lowers', () => {
    expect(readShapePhrase3('טרפז ישר זווית ABCD')).toMatchObject({ noun: 'trapezoid', arity: 4, consumed: ['right'], unconsumed: [], cyclic: { shape: 'rightTrapezoid', forced: 'rectangle' } });
    expect(readShapePhrase3('isosceles trapezoid ABCD')).toMatchObject({ noun: 'trapezoid', consumed: ['isosceles'], cyclic: 'yes' });
    expect(readShapePhrase3('מרובע ישר זווית ABCD')).toMatchObject({ noun: 'quad', consumed: [], unconsumed: ['right'] });
    expect(readShapePhrase3('משולש ישר זווית ושווה שוקיים ABC')).toMatchObject({ noun: 'triangle', arity: 3, consumed: ['right', 'isosceles'] });
    expect(readShapePhrase3('right prism ABCA\'B\'C\'')).toBeNull(); // a solid's own rightness is not a shape adjective
    expect(readShapePhrase3('ישר זווית ABC')).toMatchObject({ noun: null, arity: 3 });
  });

  it('the English right angle is watched on every polygon noun, not only "triangle"', () => {
    const quad: Command3[] = [{ type: 'quad-shape', base: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }];
    expect(droppedShapeAdjective3('right trapezoid ABCD', quad)).toEqual(['right']);
  });

  it('per phrase: a right angle on ANOTHER ring does not account for the adjective', () => {
    const cmds: Command3[] = [
      { type: 'quad-shape', base: 'trapezoid', ids: ['A', 'B', 'C', 'D'] },
      { type: 'solid', kind: 'polygon3', ids: ['E', 'F', 'G'] },
      { type: 'cos-angle', u: { kind: 'pair', from: 'F', to: 'E' }, v: { kind: 'pair', from: 'F', to: 'G' }, cos: 0 },
    ];
    expect(droppedShapeAdjective3('טרפז ישר זווית ABCD', cmds)).toEqual(['ישר זווית']);
    const own: Command3[] = [cmds[0], { type: 'cos-angle', u: { kind: 'pair', from: 'A', to: 'D' }, v: { kind: 'pair', from: 'A', to: 'B' }, cos: 0 }];
    expect(droppedShapeAdjective3('טרפז ישר זווית ABCD', own)).toEqual([]);
  });

  it('the backstop: a circle through a non-cyclic ring is refuted, whatever produced the line', () => {
    // the commands an LLM line could carry: the trapezoid and its circle, no cyclic fix
    const facts: Fact3[] = [{
      id: 'f1', utterance: 'x', enabled: true,
      cmds: [{ type: 'quad-shape', base: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }, { type: 'circle3', id: 'circle-ABCD', def: { kind: 'circum', ring: ['A', 'B', 'C', 'D'] } }],
    }];
    const refuted = Array.from({ length: SEEDS }, (_, s) => derive3(facts, s).status.f1).filter((x) => x !== 'ok');
    expect(refuted.length).toBeGreaterThan(0);
  });
});
