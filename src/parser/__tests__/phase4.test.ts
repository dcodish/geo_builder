/**
 * Phase-4 acceptance gate (docs/09-implementation-plan.md §Phase 4).
 * Parser table tests across the current vocabulary in Hebrew + English, negative
 * cases returning 'not-handled' (the boundary where the Phase-7 fallback
 * escalates), an end-to-end parse→engine check, and a coverage measure.
 */

import { describe, it, expect } from 'vitest';
import type { AnyCommand, Command } from '@/engine';
import { build } from '@/engine';
import { parse } from '../parse';
import { COMMAND_CATALOG } from '../catalog';

/** Parse and expect exactly one command equal to `expected`. */
function one(input: string, expected: AnyCommand) {
  const r = parse(input);
  expect(r.ok, `"${input}" should parse`).toBe(true);
  if (r.ok) {
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toEqual(expected);
  }
}

/** Parse and expect `expected` to be among the commands (the rule may also draw referenced segments). */
function has(input: string, expected: AnyCommand) {
  const r = parse(input);
  expect(r.ok, `"${input}" should parse`).toBe(true);
  if (r.ok) expect(r.commands).toContainEqual(expected);
}

describe('parser — square (he/en)', () => {
  const sq: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
  it('english', () => one('square ABCD', sq));
  it('hebrew', () => one('ריבוע ABCD', sq));
  it('spaced labels', () => one('square A B C D', sq));
  it('lowercase normalises to capitals', () => one('square abcd', sq));
  it('hebrew, labels before keyword', () => one('ABCD ריבוע', sq));
  it('english, labels before keyword', () => one('ABCD square', sq));
  it('does not mistake the keyword letters for labels', () => one('square ABCD', sq));
});

describe('parser — point on segment (he/en)', () => {
  it('english, no ratio (default)', () =>
    one('point G on AD', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' }));
  it('hebrew, no ratio', () => one('נקודה G על AD', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' }));
  it('english with percent', () =>
    one('point G on AD at 40%', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }));
  it('hebrew with percent', () =>
    one('נקודה G על AD ב-40%', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }));
});

describe('parser — point by distances (he/en)', () => {
  const c: Command = { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5 };
  it('english', () => one('C is 5 from A and 5 from B', c));
  it('english with "point"', () => one('point C is 5 from A and 5 from B', c));
  it('hebrew', () => one('C במרחק 5 מ-A ו-5 מ-B', c));
});

describe('parser — free point (he/en)', () => {
  it('english at (x,y)', () => one('point A at (0,0)', { type: 'free-point', id: 'A', x: 0, y: 0 }));
  it('hebrew', () => one('נקודה B ב-(6,0)', { type: 'free-point', id: 'B', x: 6, y: 0 }));
  it('equals form with negatives', () => one('A = (-3, 4)', { type: 'free-point', id: 'A', x: -3, y: 4 }));
});

describe('parser — angle constraint (he/en)', () => {
  // Stating the angle also draws its two arms (AG, AB) — the vertex A is the middle letter (FR-IN-7).
  const expected: Command[] = [
    { type: 'segment', a: 'A', b: 'G' },
    { type: 'segment', a: 'A', b: 'B' },
    { type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 },
  ];
  const arms = (input: string) => {
    const r = parse(input);
    expect(r.ok, `"${input}" should parse`).toBe(true);
    if (r.ok) expect(r.commands).toEqual(expected);
  };
  it('english =', () => arms('angle GAB = 37'));
  it('english with degrees', () => arms('angle GAB is 37 degrees'));
  it('hebrew', () => arms('זווית GAB = 37'));
  it('labels before keyword', () => arms('GAB = 37 angle'));
  it('hebrew, labels before keyword', () => arms('GAB = 37 זווית'));
});

describe('parser — distance/equal givens draw their segments (FR-IN-7)', () => {
  it('"AB = 6" draws AB then constrains it', () => {
    const r = parse('AB = 6');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands).toEqual([
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'set-distance', a: 'A', b: 'B', value: 6 },
      ]);
  });
  it('"AB = CD" draws both compared segments then sets them equal', () => {
    const r = parse('AB = CD');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands).toEqual([
        { type: 'segment', a: 'A', b: 'B' },
        { type: 'segment', a: 'C', b: 'D' },
        { type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' },
      ]);
  });
});

describe('parser — a drawn perpendicular/parallel line NAMED by points creates markers (ADR-036)', () => {
  it('"line PQ through P perpendicular to AB" marks the far end Q on the line', () => {
    const r = parse('line PQ through P perpendicular to AB');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = r.commands.find((c) => c.type === 'perpendicular-line') as { id: string; through: string };
    expect(line.through).toBe('P');
    const mark = r.commands.find((c) => c.type === 'point-on-line') as { id: string; line: string };
    expect(mark).toBeDefined();
    expect(mark.id).toBe('Q'); // P is the anchor (through-point); Q is the named far end
    expect(mark.line).toBe(line.id);
  });

  it('"line PQ through P parallel to AB" marks the far end Q (Hebrew too)', () => {
    for (const u of ['line PQ through P parallel to AB', 'הישר PQ דרך P מקביל ל-AB']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect((r.commands.find((c) => c.type === 'parallel-line') as { through: string }).through).toBe('P');
      expect((r.commands.find((c) => c.type === 'point-on-line') as { id: string }).id).toBe('Q');
    }
  });

  it('an UNNAMED perpendicular line ("line through P perpendicular to AB") creates NO marker', () => {
    const r = parse('line through P perpendicular to AB');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'point-on-line')).toBe(false);
  });
});

describe('parser — Phase-5a constructs (he/en)', () => {
  it('parallelogram', () => one('parallelogram ABCD', { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }));
  it('parallelogram (hebrew, reversed)', () => one('ABCD מקבילית', { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }));
  it('quadrilateral', () => one('quadrilateral PQRS', { type: 'quadrilateral', ids: ['P', 'Q', 'R', 'S'] }));
  it('segment', () => one('segment AC', { type: 'segment', a: 'A', b: 'C' }));
  it('diagonal synonym', () => one('diagonal BD', { type: 'segment', a: 'B', b: 'D' }));
  it('segment (hebrew)', () => one('קטע AC', { type: 'segment', a: 'A', b: 'C' }));
  it('line∩line intersection (english)', () =>
    has('E is the intersection of AC and BD', { type: 'line-line-intersection', id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' }));
  it('line∩line intersection (hebrew)', () =>
    has('M חיתוך AC ו-BD', { type: 'line-line-intersection', id: 'M', a: 'A', b: 'C', c: 'B', d: 'D' }));
  it('also draws the two referenced segments', () => {
    const r = parse('E is the intersection of AC and BD');
    expect(r.ok && r.commands.filter((c) => c.type === 'segment').length).toBe(2); // AC and BD drawn
  });
});

describe('parser — out-of-grammar returns not-handled (the fallback boundary)', () => {
  for (const bad of [
    '',
    'hello there',
    'draw something nice',
    'draw a circle somewhere', // a circle with no centre named — nothing to build
    'make it bigger',
  ]) {
    it(`"${bad}"`, () => {
      const r = parse(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not-handled');
    });
  }
});

describe('parser — lines-first intersection phrasing (he/en)', () => {
  const e: Command = { type: 'line-line-intersection', id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' };
  it('english', () => has('the diagonals AC and BD intersect at point E', e));
  it('hebrew (inflected נחתכים)', () => has('האלכסונים AC ו-BD נחתכים בנקודה E', e));
});

describe('parser — cut-form intersection (verb BETWEEN the two segments)', () => {
  // "BD cuts OC at A" — A = line BD ∩ line OC. The reported case: this used to escalate to the LLM,
  // which rewrote it lossily as "A on the extension of BD" (dropping the OC half) — wrong point.
  const a: Command = { type: 'line-line-intersection', id: 'A', a: 'B', b: 'D', c: 'O', d: 'C' };
  it('hebrew "BD חותך את OC בנקודה A" (non-directional)', () => has('BD חותך את OC בנקודה A', a));
  it('english "BD cuts OC at A" (non-directional)', () => has('BD cuts OC at A', a));
  // A "המשך"/extension operand is DIRECTIONAL — A must be beyond the 2nd point (ADR-054). Detected per
  // operand (which side of the cut verb the word falls on), so a one-sided extension only flags its side.
  it('"המשך BD חותך את המשך OC" → both directional (dir1 + dir2)', () =>
    has('המשך BD חותך את המשך OC בנקודה A', { ...a, dir1: true, dir2: true }));
  it('"המשך BD חותך את OC" → only the first is directional (dir1)', () =>
    has('המשך BD חותך את OC בנקודה A', { ...a, dir1: true }));
  it('still routes "… cuts circle P …" to the circle rule, not line∩line', () => {
    const r = parse('AC חותך מעגל P בנקודה E', { circles: ['P'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const types = r.commands.map((c) => c.type);
      expect(types).toContain('line-circle-intersection');
      expect(types).not.toContain('line-line-intersection');
    }
  });
});

describe('parser — implicit circle reference (the figure has one circle)', () => {
  const ctx = { circles: ['O'] };
  it('resolves an unnamed tangent∩line to the only circle, both phrasings + extension (He/En)', () => {
    for (const u of [
      'המשיק בנקודה D והמשך AB נפגשים בנקודה E', // the reported case
      'the tangent at D and the extension of AB meet at E',
    ]) {
      const r = parse(u, ctx);
      expect(r.ok, `"${u}" should parse with an implicit circle`).toBe(true);
      if (r.ok) {
        const types = r.commands.map((c) => c.type);
        expect(types).toContain('line-intersection'); // E = tangent ∩ AB
        // exactly the named points D, E (+ A, B) — no invented intermediate point
        const ids = new Set(r.commands.flatMap((c) => Object.entries(c).filter(([k]) => /^(id|a|b|at)$/.test(k)).map(([, v]) => v)));
        expect(ids.has('F')).toBe(false); // the LLM used to invent F — the deterministic parse never does
      }
    }
  });
  it('"chord AB" / "diameter DE" resolve the only circle', () => {
    expect(parse('chord AB', ctx).ok).toBe(true);
    expect(parse('diameter DE', ctx).ok).toBe(true);
  });
  it('with NO circle present, an unnamed tangent escalates (does not misparse)', () => {
    expect(parse('the tangent at D and AB meet at E', { circles: [] }).ok).toBe(false);
  });
  it('with TWO circles, an unnamed reference is ambiguous → escalates', () => {
    expect(parse('the tangent at D and AB meet at E', { circles: ['O', 'P'] }).ok).toBe(false);
  });
});

describe('parser — filler words are not labels', () => {
  it('"connect A to B" reads A,B — not T,O', () =>
    one('connect A to B', { type: 'segment', a: 'A', b: 'B' }));
  it('uppercase ON is still a label pair (segment ON)', () =>
    one('segment ON', { type: 'segment', a: 'O', b: 'N' }));
});

describe('parser — an explicitly NAMED foot keeps its name (not auto-renamed)', () => {
  // "G is the foot of the perpendicular from E to AB" must name the foot G — the
  // altitude rule must not grab it and auto-name the foot (which collided with F).
  it('names the foot G, not an auto letter', () =>
    one('G is the foot of the perpendicular from E to AB', { type: 'foot', id: 'G', from: 'E', a: 'A', b: 'B' }));
  it('the original corpus phrasing still names F', () =>
    one('F is the foot of the perpendicular from C to AD', { type: 'foot', id: 'F', from: 'C', a: 'A', b: 'D' }));
});

describe('parser — a NAMED altitude segment honours the foot the student gave', () => {
  // "CD גובה …" names the altitude segment: C is the apex (vertex), D is the FOOT on the opposite
  // side. The foot must be named D, NOT auto-named F (the "asked for CD, got CF" bug). Before the fix
  // these phrasings were not-handled → the LLM rephrased to "altitude from C" → the foot became F.
  const cmds = (input: string, ctx?: Parameters<typeof parse>[1]) => {
    const r = parse(input, ctx);
    expect(r.ok, `"${input}" should parse`).toBe(true);
    return r.ok ? r.commands : [];
  };
  const footD = { type: 'foot', id: 'D', from: 'C', a: 'A', b: 'B' };
  const segCD = { type: 'segment', a: 'C', b: 'D' };
  it('"CD גובה ל AB" → foot D on AB (not an auto-named F)', () =>
    expect(cmds('CD גובה ל AB', { points: ['A', 'B', 'C'] })).toEqual([footD, segCD]));
  it('"CD גובה במשולש ABC" → triangle + foot D + segment CD', () =>
    expect(cmds('CD גובה במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual([{ type: 'triangle', ids: ['A', 'B', 'C'] }, footD, segCD]));
  it('English "CD is the altitude in ABC" names the foot D', () =>
    expect(cmds('CD is the altitude in ABC', { points: ['A', 'B', 'C'] })).toEqual([{ type: 'triangle', ids: ['A', 'B', 'C'] }, footD, segCD]));
  // the bare "CD גובה" (no side/triangle stated) derives the opposite side from the EXISTING triangle in
  // context — this is the form the operator actually typed, which used to escalate to the LLM → foot F.
  it('bare "CD גובה" on an existing triangle ABC → foot D (side from context, no triangle re-emit)', () =>
    expect(cmds('CD גובה', { points: ['A', 'B', 'C'] })).toEqual([footD, segCD]));
  it('bare "CD גובה" with NO triangle in context is not-handled (correctly escalates)', () =>
    expect(parse('CD גובה', { points: [] }).ok).toBe(false));
  // keyword-FIRST order (the name follows the keyword) must keep the foot too — the original CF symptom
  it('"הגובה CD במשולש ABC" (keyword-first) names the foot D', () =>
    expect(cmds('הגובה CD במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual([{ type: 'triangle', ids: ['A', 'B', 'C'] }, footD, segCD]));
  it('English "the altitude CD in ABC" (keyword-first) names the foot D', () =>
    expect(cmds('the altitude CD in ABC', { points: ['A', 'B', 'C'] })).toEqual([{ type: 'triangle', ids: ['A', 'B', 'C'] }, footD, segCD]));
  it('a lowercase connector after the keyword is NOT read as a name ("height from A to BC" → auto F)', () =>
    expect(cmds('height from A to BC')).toEqual([{ type: 'foot', id: 'F', from: 'A', a: 'B', b: 'C' }, { type: 'segment', a: 'A', b: 'F' }]));
  it('the unnamed "גובה מ-A במשולש ABC" still auto-names the foot F (unchanged)', () =>
    expect(cmds('גובה מ-A במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'foot', id: 'F', from: 'A', a: 'B', b: 'C' },
      { type: 'segment', a: 'A', b: 'F' },
    ]));
  it('"EF אנך ל AB" stays the ⟂ CONSTRAINT — the named-foot form never steals it', () =>
    expect(cmds('EF אנך ל AB', { points: ['A', 'B', 'E', 'F'] })).toEqual([
      { type: 'segment', a: 'E', b: 'F' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'set-perpendicular', a: 'E', b: 'F', c: 'A', d: 'B' },
    ]));
});

describe('parser — a NAMED midsegment honours its endpoint labels', () => {
  // "PQ קטע אמצעים …" names the midsegment's two endpoints (the midpoints of the apex's sides). They
  // must be named P,Q, NOT auto-named M,N (the altitude "CD→CF" bug class).
  const cmds = (input: string, ctx?: Parameters<typeof parse>[1]) => {
    const r = parse(input, ctx);
    expect(r.ok, `"${input}" should parse`).toBe(true);
    return r.ok ? r.commands : [];
  };
  const namedPQ = [
    { type: 'midpoint', id: 'P', a: 'A', b: 'B' },
    { type: 'midpoint', id: 'Q', a: 'A', b: 'C' },
    { type: 'segment', a: 'P', b: 'Q' },
  ];
  it('"PQ קטע אמצעים לצלע BC במשולש ABC" → midpoints named P,Q (not M,N)', () =>
    expect(cmds('PQ קטע אמצעים לצלע BC במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual(namedPQ));
  it('keyword-first "קטע האמצעים PQ לצלע BC במשולש ABC" names P,Q', () =>
    expect(cmds('קטע האמצעים PQ לצלע BC במשולש ABC', { points: ['A', 'B', 'C'] })).toEqual(namedPQ));
  it('English "PQ is the midsegment to BC in triangle ABC" names P,Q', () =>
    expect(cmds('PQ is the midsegment to BC in triangle ABC', { points: ['A', 'B', 'C'] })).toEqual(namedPQ));
  it('the unnamed "the midsegment to BC in triangle ABC" still auto-names M,N (connector "to" is not a name)', () =>
    expect(cmds('the midsegment to BC in triangle ABC', { points: ['A', 'B', 'C'] })).toEqual([
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'N', a: 'A', b: 'C' },
      { type: 'segment', a: 'M', b: 'N' },
    ]));
});

/**
 * Misparse defense: the dangerous failure is not the miss (a miss escalates to
 * the Phase-7 fallback) but the silent HALF-parse that draws a wrong figure.
 * Every utterance here mentions an out-of-grammar construct (or an unreadable
 * phrasing of an in-grammar one) and must return not-handled — never a
 * partial command.
 */
describe('parser — misparse defense (out-of-grammar must not half-parse)', () => {
  for (const u of [
    // A shape carrying a constraint is a compound the LLM should decompose — the
    // shape rule must not silently drop the "= 6".
    'square ABCD with AB = 6',
    'parallelogram ABCD where AB = CD',
    // recognised intersection keyword but unreadable sentence → stop, not "segment"
    'the diagonals intersect somewhere',
  ]) {
    it(`"${u}"`, () => {
      const r = parse(u);
      expect(r.ok, `"${u}" must not be (mis)parsed`).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not-handled');
    });
  }
});

describe('parser → engine (end to end)', () => {
  it('a typed sequence parses into commands the engine builds', () => {
    const utterances = [
      'point A at (0,0)',
      'point B at (6,0)',
      'C is 5 from A and 5 from B',
    ];
    const commands = utterances.flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`failed to parse "${u}"`);
      return r.commands;
    });
    const { positions } = build(commands);
    expect(positions.get('C')).toBeTruthy();
  });
});

describe('parser — coverage on the in-grammar sample', () => {
  it('handles every intended phrasing (miss-rate 0 on this set)', () => {
    const sample = [
      'square ABCD',
      'ריבוע ABCD',
      'point G on AD',
      'נקודה G על AD',
      'point G on AD at 40%',
      'C is 5 from A and 5 from B',
      'C במרחק 5 מ-A ו-5 מ-B',
      'point A at (0,0)',
      'נקודה B ב-(6,0)',
      'angle GAB = 37',
      'זווית GAB = 37',
    ];
    const handled = sample.filter((u) => parse(u).ok).length;
    expect(handled).toBe(sample.length);
  });

  // The catalog is the user-facing reference *and* the coverage map: an entry
  // marked supported must parse in both locales, or the help panel lies.
  it('every supported catalog example parses (He + En)', () => {
    for (const c of COMMAND_CATALOG.filter((c) => c.supported)) {
      expect(parse(c.en).ok, `EN catalog example should parse: "${c.en}"`).toBe(true);
      expect(parse(c.he).ok, `HE catalog example should parse: "${c.he}"`).toBe(true);
    }
  });
});

// R6a — a length equation's RHS must be read WHOLE: a greedy rule can no longer grab a numeric/var
// prefix and silently drop a trailing radical / exponent / unit (the ADR-024/026 half-parse class).
// The greedy rules (distanceConstraint, measureLength) are anchored to end-of-input, so an unreadable
// RHS escalates (not-handled → LLM) instead of becoming a wrong partial parse.
describe('parser — length-equation RHS is read whole (no prefix half-parse, R6a)', () => {
  it('√ coverage: "AB = 12√x" is a √ measure, never set-distance 12', () => {
    one('AB = 12√x', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 12, var: 'x', pow: 0.5 } });
  });

  it('a power RHS "AB = 3x²" is read whole (pow 2), not half-parsed to "3x"', () => {
    has('AB = 3x²', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 3, var: 'x', pow: 2 } });
  });

  it('a clean numeric RHS still works: "AB = 6" → set-distance 6', () => {
    has('AB = 6', { type: 'set-distance', a: 'A', b: 'B', value: 6 });
  });

  it('an UNREADABLE RHS escalates instead of half-parsing: "AB = 5∛x" is NOT set-distance 5', () => {
    const r = parse('AB = 5∛x'); // ∛ (cube root) is unhandled — must not silently become "= 5"
    expect(r.ok).toBe(false); // not-handled → the App escalates to the LLM intact
    // and specifically: it never produced a bare set-distance 5 (the prefix half-parse)
    if (r.ok) expect((r as { commands: AnyCommand[] }).commands).not.toContainEqual({ type: 'set-distance', a: 'A', b: 'B', value: 5 });
  });
});
