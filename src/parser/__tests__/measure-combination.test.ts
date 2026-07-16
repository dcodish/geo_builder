/**
 * Compound measure relations — the PARSER + GATE half (#153/#145/#154/#144).
 *
 * The class: a relation over ≥2 measure terms («קשת AC + קשת BE = קשת AD + קשת BC», «AB + CD = EF»,
 * «DM/ME = BM/DM») used to be TRUNCATED by the first-match-wins relation rules to its first bare
 * sub-relation and committed as a DIFFERENT, wrong constraint — with every token-presence honesty
 * gate silent (the wrong `set-equal` references the matched sub-relation's labels). P1 green-but-wrong.
 *
 * The fix under test: (a) `measureSum`/`lengthProduct` rules ahead of the truncating rules parse the
 * supported compounds into ONE structured constraint; (b) `droppedCompoundRelation` — the STRUCTURAL
 * honesty gate — refuses any lowering that doesn't carry the full term list (slot-count accounting),
 * so the unsupported remainder (mixed units, unequal degree) escalates to guidance, never a wrong build.
 */
import { describe, it, expect } from 'vitest';
import { parse, droppedCompoundRelation, type ParseContext } from '../parse';
import { classifyOutOfScope } from '../scope';
import { COMMAND_CATALOG } from '../catalog';
import type { AnyCommand } from '@/engine';

const CTX: ParseContext = {
  points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'M', 'R', 'O'],
  circles: ['O'],
  circleMembers: [{ id: 'circle-O', center: 'O', points: ['A', 'B', 'C', 'D', 'E'] }],
  neighbors: { A: ['B', 'C'], B: ['A', 'C'] },
};

const cmdsOf = (u: string, ctx: ParseContext = CTX): AnyCommand[] => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`did not parse: ${u} (${r.reason})`);
  return r.commands;
};
const only = (u: string, type: string, ctx: ParseContext = CTX) => {
  const found = cmdsOf(u, ctx).filter((c) => c.type === type);
  expect(found, `${u} → exactly one ${type}`).toHaveLength(1);
  return found[0] as unknown as Record<string, unknown>;
};

// ── the additive family parses to ONE set-measure-sum ───────────────────────

describe('measureSum — sums of arcs / segments / angles (#153/#154)', () => {
  it('the operator’s exact Q22 arc-sum (He, glued =) — 4 central-angle terms, nothing dropped', () => {
    const c = only('קשת AC + קשת BE= קשת AD + קשת BC', 'set-measure-sum');
    expect(c.unit).toBe('angle');
    expect(c.coefs).toEqual([1, 1, -1, -1]);
    expect(c.points).toEqual(['A', 'O', 'C', 'B', 'O', 'E', 'A', 'O', 'D', 'B', 'O', 'C']);
    expect(c.target).toBe(0);
  });

  it('English mirror', () => {
    const c = only('arc AC + arc BE = arc AD + arc BC', 'set-measure-sum');
    expect(c.coefs).toEqual([1, 1, -1, -1]);
  });

  it('the ⌢ glyph form and the ⌢{} toolbar template (#155)', () => {
    const c = only('⌢AC + ⌢BE = ⌢AD + ⌢BC', 'set-measure-sum');
    expect(c.coefs).toEqual([1, 1, -1, -1]);
    expect(c.points).toEqual(['A', 'O', 'C', 'B', 'O', 'E', 'A', 'O', 'D', 'B', 'O', 'C']);
    // the braced template the button inserts — same lowering (labelRun reads through the braces)
    expect(only('⌢{AC} + ⌢{BE} = ⌢{AD} + ⌢{BC}', 'set-measure-sum')).toMatchObject({ coefs: [1, 1, -1, -1] });
    // the single-arc ratio keeps its lane in the braced form too
    expect(only('⌢{DE} = 2 ⌢{CE}', 'set-angle-ratio')).toMatchObject({ k: 2 });
  });

  it('segment sums: «AB + CD = EF + GH», «AB + CD = EF»', () => {
    expect(only('AB + CD = EF + GH', 'set-measure-sum')).toMatchObject({ unit: 'length', coefs: [1, 1, -1, -1], target: 0 });
    expect(only('AB + CD = EF', 'set-measure-sum')).toMatchObject({ unit: 'length', coefs: [1, 1, -1], points: ['A', 'B', 'C', 'D', 'E', 'F'] });
  });

  it('angle sums, 3-letter form (He + En) — the middle letter is each vertex', () => {
    const he = only('זווית ABC + זווית DEF = זווית GHI', 'set-measure-sum');
    expect(he).toMatchObject({ unit: 'angle', coefs: [1, 1, -1], points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] });
    expect(only('angle ABC + angle DEF = angle GHI', 'set-measure-sum')).toMatchObject({ unit: 'angle' });
  });

  it('numeric target: «∠A + ∠B = 180» resolves single-vertex arms from ctx.neighbors (ADR-164)', () => {
    const c = only('∠A + ∠B = 180', 'set-measure-sum');
    expect(c).toMatchObject({ unit: 'angle', coefs: [1, 1], points: ['B', 'A', 'C', 'A', 'B', 'C'], target: 180 });
  });

  it('a single-vertex angle with ≠2 edges is an ambiguous-angle CLARIFICATION, never a guess', () => {
    const r = parse('∠A + ∠B = 180', { ...CTX, neighbors: { A: ['B', 'C', 'D'], B: ['A', 'C'] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('ambiguous-angle');
  });

  it('coefficients ride NUMEXPR: «2*AB = CD + EF» (the ADR-250-flagged form now BUILDS)', () => {
    expect(only('2*AB = CD + EF', 'set-measure-sum')).toMatchObject({ coefs: [2, -1, -1] });
  });

  it('draws the named segments/arms (idempotent), never radii for arc terms', () => {
    const cs = cmdsOf('AB + CD = EF');
    expect(cs.filter((c) => c.type === 'segment')).toHaveLength(3);
    const arcs = cmdsOf('קשת AC + קשת BE= קשת AD + קשת BC');
    expect(arcs.filter((c) => c.type === 'segment')).toHaveLength(0); // arcs live on the circle boundary (ADR-116)
  });
});

// ── the multiplicative family parses to ONE set-length-product ──────────────

describe('lengthProduct — products / proportions of lengths (#145/#144)', () => {
  it('the o90iuwwh prod forms — quotients cross-multiplied, products verbatim', () => {
    expect(only('DM/ME=BM/DM', 'set-length-product')).toMatchObject({ k: 1, lhs: ['D', 'M', 'D', 'M'], rhs: ['B', 'M', 'M', 'E'] });
    expect(only('DM*ME=BM*DR', 'set-length-product')).toMatchObject({ k: 1, lhs: ['D', 'M', 'M', 'E'], rhs: ['B', 'M', 'D', 'R'] });
    expect(only('BE/BR=DM/ME', 'set-length-product')).toMatchObject({ k: 1 });
    expect(only('4*DM*DM=BM*ME', 'set-length-product')).toMatchObject({ k: 4, lhs: ['D', 'M', 'D', 'M'] });
  });

  it('the · glyph and the ² / ^2 square forms', () => {
    expect(only('DM·ME = BM·DR', 'set-length-product')).toMatchObject({ lhs: ['D', 'M', 'M', 'E'] });
    expect(only('DM^2 = BM*ME', 'set-length-product')).toMatchObject({ lhs: ['D', 'M', 'D', 'M'] });
    expect(only('DM² = BM*ME', 'set-length-product')).toMatchObject({ lhs: ['D', 'M', 'D', 'M'] });
  });
});

// ── no-theft: the bare forms keep their existing rules ──────────────────────

describe('no theft — bare single-term relations are byte-unchanged', () => {
  const KEEP: [string, string][] = [
    ['AB = CD', 'set-equal'],
    ['קשת AC = קשת BE', 'set-angle-ratio'],
    ['קשת DE = 2 קשת CE', 'set-angle-ratio'],
    ['AB/CD = 2/3', 'set-ratio'],
    ['זווית ABC = זווית DEF', 'set-angle-ratio'],
    ['AB = 2 AD', 'set-ratio'],
    ['AC=√(3)CO', 'set-ratio'],
    ['DF:FC = 1:2', 'set-ratio'],
  ];
  for (const [u, expected] of KEEP) {
    it(`«${u}» still lowers via ${expected}`, () => {
      const cs = cmdsOf(u);
      expect(cs.some((c) => c.type === expected), `${u} → ${expected}`).toBe(true);
      expect(cs.some((c) => c.type === 'set-measure-sum' || c.type === 'set-length-product')).toBe(false);
    });
  }

  it('«D = חיתוך AK ו-CL» — the conjunction hyphen is NOT a minus (the ו-CL trap)', () => {
    const cs = cmdsOf('D = חיתוך AK ו-CL');
    expect(cs.some((c) => c.type === 'line-line-intersection')).toBe(true);
  });
});

// ── the honest remainder: refused + guided, never built wrong ───────────────

describe('unsupported compounds are REFUSED (gate) and classified for guidance', () => {
  it('a mixed length+angle sum «AB + ∠ABC = 90» no longer commits a truncated set-angle', () => {
    const r = parse('AB + ∠ABC = 90', CTX);
    expect(r.ok).toBe(false); // the chokepoint downgraded the angle rule's truncated claim
    expect(classifyOutOfScope('AB + ∠ABC = 90')?.category).toBe('compound-relation');
  });

  it('an unequal-degree product «4*DM/ME=BM*DM» no longer commits a truncated set-equal', () => {
    const r = parse('4*DM/ME=BM*DM', CTX);
    expect(r.ok).toBe(false); // the chokepoint gate downgraded equalSegments' truncated claim
    // No never-parseable lexical signature (a coefficient·quotient CAN be balanced and parse), so this
    // variant takes the ordinary honesty lane, not the guidance classifier: the gate also refuses any
    // LLM re-lowering that drops the structure (the App's stillDropped → labelsDropped message).
    expect(droppedCompoundRelation('4*DM/ME=BM*DM', [{ type: 'set-equal', a: 'M', b: 'E', c: 'B', d: 'M' }] as unknown as AnyCommand[])).toHaveLength(1);
  });

  it('the guidance insertion point does not steal the analytic lane, and never matches supported compounds', () => {
    expect(classifyOutOfScope('y = 2x + 3')?.category).toBe('analytic');
    // the scope invariant (a pattern must never match a parseable example) — the supported shapes stay null
    expect(classifyOutOfScope('arc AC + arc BE = arc AD + arc BC in circle O')).toBeNull();
    expect(classifyOutOfScope('קשת AC + קשת BE = קשת AD + קשת BC במעגל O')).toBeNull();
    expect(classifyOutOfScope('DM*ME = BM*DR')).toBeNull();
    expect(classifyOutOfScope('AB + CD = EF')).toBeNull();
  });
});

// ── droppedCompoundRelation — the structural gate itself ────────────────────

describe('droppedCompoundRelation — the fifth honesty gate (#153/#145)', () => {
  const wrongArc = [{ type: 'set-angle-ratio', v1: 'O', a1: 'A', b1: 'C', v2: 'O', a2: 'A', b2: 'D', k: 1 }] as unknown as AnyCommand[];
  const wrongEq = [{ type: 'set-equal', a: 'M', b: 'E', c: 'B', d: 'M' }] as unknown as AnyCommand[];

  it('FIRES on the historical truncated lowerings (the exact P1 wrong commits)', () => {
    expect(droppedCompoundRelation('קשת AC + קשת BE= קשת AD + קשת BC', wrongArc)).toHaveLength(1);
    expect(droppedCompoundRelation('AB + CD = EF + GH', [{ type: 'set-equal', a: 'C', b: 'D', c: 'E', d: 'F' }] as unknown as AnyCommand[])).toHaveLength(1);
    expect(droppedCompoundRelation('DM/ME=BM/DM', wrongEq)).toHaveLength(1);
    expect(droppedCompoundRelation('DM*ME=BM*DR', wrongEq)).toHaveLength(1);
    expect(droppedCompoundRelation('זווית ABC + זווית DEF = זווית GHI', [{ type: 'set-angle-ratio', v1: 'B', a1: 'A', b1: 'C', v2: 'H', a2: 'G', b2: 'I', k: 1 }] as unknown as AnyCommand[])).toHaveLength(1);
  });

  it('slot-count accounting is load-bearing: all labels present but too few term slots still fires', () => {
    // A 2-term sum carrying all 8 labels cannot represent a stated 4-term sum.
    const underSlotted = [
      { type: 'set-measure-sum', unit: 'length', coefs: [1, -1], points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], target: 0 },
    ] as unknown as AnyCommand[];
    expect(droppedCompoundRelation('AB + CD = EF + GH', underSlotted)).toHaveLength(1);
  });

  it('SILENT on the correct structured lowerings (the real parses)', () => {
    for (const u of ['קשת AC + קשת BE= קשת AD + קשת BC', 'AB + CD = EF + GH', 'DM/ME=BM/DM', '∠A + ∠B = 180', '2*AB = CD + EF']) {
      expect(droppedCompoundRelation(u, cmdsOf(u)), u).toEqual([]);
    }
  });

  it('never fires on the excluded lanes (colon ratios, coordinates, area forms, chains, symbol algebra)', () => {
    expect(droppedCompoundRelation('DF:FC = 1:2', [])).toEqual([]);
    expect(droppedCompoundRelation('A=(3,5)', [])).toEqual([]);
    expect(droppedCompoundRelation('S_{ABC}=4S_{NCE}', [])).toEqual([]);
    expect(droppedCompoundRelation('שטח ABF גדול פי 2 משטח BFE', [])).toEqual([]);
    expect(droppedCompoundRelation('היקף המשולש ABC = 20', [])).toEqual([]);
    expect(droppedCompoundRelation('AB = AC = 3x', [])).toEqual([]); // a chain
    expect(droppedCompoundRelation('x + y = 90', [])).toEqual([]); // lowercase symbol algebra
    expect(droppedCompoundRelation('D = חיתוך AK ו-CL', [])).toEqual([]); // conjunction hyphen ≠ minus
  });

  it('catalog-wide zero false positives (the #140 lesson, from day one)', () => {
    for (const c of COMMAND_CATALOG) {
      if (!c.supported) continue;
      for (const ex of [c.he, c.en]) {
        const r = parse(ex);
        if (!r.ok) continue; // parseability is the catalog guard's job; here only the structural honesty
        expect(droppedCompoundRelation(ex, r.commands), `false positive on catalog example: ${ex}`).toEqual([]);
      }
    }
  });
});
