/**
 * ANGLE ALIASES — the book's subscript notation (issue #235, ADR-386): «נסמן זוית BAM כ-A1» binds the
 * name to the angle identity; «זוית A1» then resolves through the alias at the parse seam, so every
 * angle-consuming rule gains it at once. Explicit-נסמן only (operator scoping 2026-07-22 — no
 * auto-numbering). Plus the bare-vertex EQUALITY «∠B=∠C» (the ADR-164 pattern, equality edition).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import type { ParseContext } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const factsOf = (steps: string[]): Fact[] => {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
};
const cmds = (u: string, ctx?: ParseContext) => {
  const r = parse(u, ctx);
  expect(r.ok, `${u} should parse`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('the naming statement (#235)', () => {
  it('«נסמן זוית BAM כ-A1» binds the alias (vertex = the middle letter) + draws the arms', () => {
    expect(cmds('נסמן זוית BAM כ-A1')).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segment', a: 'A', b: 'M' },
      { type: 'angle-alias', name: 'A1', vertex: 'A', ray1: 'B', ray2: 'M' },
    ]);
    expect(cmds('denote angle BAM as A1')).toEqual(cmds('נסמן זוית BAM כ-A1'));
    expect(cmds('נסמן זוית BAM ב-A1').find((c) => c.type === 'angle-alias')).toBeTruthy(); // the ב connector too
  });

  it('builds with the arc mark and the name label on the wedge', () => {
    const fig = replay(factsOf(['משולש ABM', 'נסמן זוית BAM כ-A1']));
    for (const s of Object.values(fig.status)) expect(s).toBe('ok');
    expect(fig.labels.angles).toContainEqual({ vertex: 'A', ray1: 'B', ray2: 'M', text: 'A1' });
    expect(fig.angleMarks).toContainEqual({ vertex: 'A', ray1: 'B', ray2: 'M', right: false });
  });

  it('a taken name refuses (existing point / an alias bound to a DIFFERENT angle); the SAME binding is idempotent', () => {
    const withPoint = factsOf(['משולש ABM', 'נקודה K1']);
    expect(parse('נסמן זוית BAM כ-K1', ctxOf(withPoint))).toEqual({ ok: false, reason: 'alias-taken', name: 'K1' });
    const withAlias = factsOf(['משולש ABM', 'נסמן זוית BAM כ-A1']);
    expect(parse('נסמן זוית ABM כ-A1', ctxOf(withAlias))).toEqual({ ok: false, reason: 'alias-taken', name: 'A1' });
    expect(parse('נסמן זוית MAB כ-A1', ctxOf(withAlias)).ok, 'same wedge, mirrored rays — idempotent restatement').toBe(true);
  });

  it('«נקודה A1» while the alias exists refuses instead of silently no-opping', () => {
    const facts = factsOf(['משולש ABM', 'נסמן זוית BAM כ-A1']);
    expect(parse('נקודה A1', ctxOf(facts))).toEqual({ ok: false, reason: 'alias-taken', name: 'A1' });
  });

  // no-theft: the ADR-031/118 נסמן measure family is untouched
  it('«נסמן את שטח ABC ב-S» stays the area measure label', () => {
    const facts = factsOf(['משולש ABC']);
    expect(cmds('נסמן את שטח ABC ב-S', ctxOf(facts))[0].type).toBe('measure-area');
  });
});

describe('alias references resolve through the parse seam (#235)', () => {
  const base = () => factsOf(['משולש ABM', 'נסמן זוית BAM כ-A1']);

  it('value, equality, acuteness and the keyboard <A1 all reach the aliased triple', () => {
    const ctx = ctxOf(base());
    expect(cmds('זוית A1 = 40', ctx).find((c) => c.type === 'set-angle')).toEqual({ type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'M', value: 40 });
    expect(cmds('<A1 = 40', ctx)).toEqual(cmds('∠A1 = 40', ctx)); // the #237 composition, for free
    expect(cmds('זוית A1 חדה', ctx).find((c) => c.type === 'set-angle-acuteness')).toBeTruthy();
    expect(cmds('זוית A1 = זוית ABM', ctx).find((c) => c.type === 'set-angle-ratio')).toBeTruthy();
  });

  it('a bare A1 outside an angle position stays a point token (the ADR-228 subscript convention)', () => {
    // No alias bound → «נקודה A1» is an ordinary point; the naming statement's own «כ-A1» is untouched.
    expect(cmds('נקודה A1')[0]).toMatchObject({ type: 'free-point', id: 'A1' });
  });

  it('«זוית A1 = זוית D1» over two aliases builds and drives the equality', () => {
    const facts = factsOf(['משולש ABM', 'משולש DEF', 'נסמן זוית BAM כ-A1', 'נסמן זוית EDF כ-D1', 'זוית A1 = זוית D1']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    for (const s of Object.values(fig.status)) expect(s).toBe('ok');
    expect(fig.violations).toEqual([]);
    const P = (id: string) => fig.positions.get(id)!;
    const ang = (a: string, v: string, b: string) => {
      const u = { x: P(a).x - P(v).x, y: P(a).y - P(v).y };
      const w = { x: P(b).x - P(v).x, y: P(b).y - P(v).y };
      return Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)));
    };
    expect(Math.abs(ang('B', 'A', 'M') - ang('E', 'D', 'F'))).toBeLessThan(0.02);
  });
});

describe('bare-vertex angle EQUALITY (#235, the ADR-164 pattern)', () => {
  it('«∠B=∠E» resolves both sides when each vertex has exactly two edges', () => {
    const ctx = ctxOf(factsOf(['משולש ABC', 'משולש DEF']));
    expect(cmds('∠B=∠E', ctx).find((c) => c.type === 'set-angle-ratio')).toEqual({ type: 'set-angle-ratio', v1: 'B', a1: 'A', b1: 'C', v2: 'E', a2: 'D', b2: 'F', k: 1 });
  });

  it('the mixed prod form «זוית B שווה לזוית EDF» resolves the bare side only', () => {
    const ctx = ctxOf(factsOf(['משולש ABC', 'משולש DEF']));
    expect(cmds('זוית B שווה לזוית EDF', ctx).find((c) => c.type === 'set-angle-ratio')).toEqual({ type: 'set-angle-ratio', v1: 'B', a1: 'A', b1: 'C', v2: 'D', a2: 'E', b2: 'F', k: 1 });
  });

  it('an ambiguous vertex (≠2 edges) clarifies — the message now suggests the נסמן syntax', () => {
    const ctx = ctxOf(factsOf(['משולש ABC', 'AD']));
    expect(parse('∠A=∠B', ctx)).toEqual({ ok: false, reason: 'ambiguous-angle', vertex: 'A' });
  });

  it('a single-vertex side must carry its OWN angle keyword («זוית ABC = C» is not an equality)', () => {
    const ctx = ctxOf(factsOf(['משולש ABC']));
    const r = parse('זוית ABC = C', ctx);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-angle-ratio')).toBe(false);
  });

  it('a numeric RHS still defers to the value rules («∠B = 90» keeps the ADR-164 path)', () => {
    const ctx = ctxOf(factsOf(['משולש ABC']));
    expect(cmds('∠B = 90', ctx).find((c) => c.type === 'set-angle')).toEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 });
  });
});
