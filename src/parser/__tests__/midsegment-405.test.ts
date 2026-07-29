/**
 * #405 (ADR-411): «DE קטע אמצעים» must NEVER lower to a bare segment — the silent-drop class.
 * BOTH-anchored → the DETERMINED lowering (one midpoint pin per endpoint + the drawn segment);
 * ZERO-anchored with exactly ONE triangle in the figure → binds to it (the ADR-245 definite-reference
 * pattern, the #71 decomposition); every OTHER configuration → the `droppedMidsegment` gate escalates
 * (`not-handled`), never a bare `segment` claim that silently drops the given. Mirrored He/En.
 * History (worktree sweep at 6 refs back to ADR-199's birth): the bare-segment claim was byte-identical
 * at every prod tag — a hole since the rule was born, masked by seed 0 sampling the rider at t = 0.5.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import type { ParseContext } from '@/parser';

const triangleCtx: ParseContext = {
  points: ['A', 'B', 'C'],
  neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] },
  polygons: [['A', 'B', 'C']],
};
const bothAnchored: ParseContext = {
  ...triangleCtx,
  points: ['A', 'B', 'C', 'D', 'E'],
  onSegment: { D: ['A', 'B'], E: ['A', 'C'] },
};

const determined = [
  { type: 'set-equal', a: 'A', b: 'D', c: 'D', d: 'B' },
  { type: 'set-equal', a: 'A', b: 'E', c: 'E', d: 'C' },
  { type: 'segment', a: 'D', b: 'E' },
];

describe('#405/ADR-411 — the determined (both-anchored) midsegment', () => {
  it('«DE קטע אמצעים» with D on AB and E on AC pins BOTH midpoints (the prod figure)', () => {
    const r = parse('DE קטע אמצעים', bothAnchored);
    expect(r.ok && r.commands).toEqual(determined);
  });

  it('the En mirror «DE midsegment» lowers identically', () => {
    const r = parse('DE midsegment', bothAnchored);
    expect(r.ok && r.commands).toEqual(determined);
  });

  it('an endpoint anchored as an EXISTING midpoint still yields the determined lowering (ADR-199 Am. anchor universe)', () => {
    const ctx: ParseContext = { ...bothAnchored, onSegment: { E: ['A', 'C'] }, midpointOf: { D: ['A', 'B'] } };
    const r = parse('DE קטע אמצעים', ctx);
    expect(r.ok && r.commands).toEqual(determined);
  });

  it('both endpoints on the SAME host is not a midsegment — refused (not-handled), never a bare segment', () => {
    const ctx: ParseContext = { ...bothAnchored, onSegment: { D: ['A', 'B'], E: ['A', 'B'] } };
    expect(parse('DE קטע אמצעים', ctx)).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('#405/ADR-411 — the zero-anchored bare form', () => {
  // The rider's host segment AB is auto-drawn by the shared rider post-pass (a triangle side — idempotent ink).
  const bound = [
    { type: 'segment', a: 'A', b: 'B' },
    { type: 'point-on-segment', id: 'D', a: 'A', b: 'B' },
    { type: 'shape-variant', shape: 'midsegment', ids: ['A', 'B', 'C', 'D', 'E'], variant: 0 },
  ];

  it('«DE קטע אמצעים» with ONE triangle in the figure binds to it (rider + cyclable shape-variant)', () => {
    const r = parse('DE קטע אמצעים', triangleCtx);
    expect(r.ok && r.commands).toEqual(bound);
  });

  it('the En mirror «DE midsegment» binds identically', () => {
    const r = parse('DE midsegment', triangleCtx);
    expect(r.ok && r.commands).toEqual(bound);
  });

  it('TWO candidate triangles → honest escalation (never a guess, never a bare segment)', () => {
    const ctx: ParseContext = {
      points: ['A', 'B', 'C', 'F'],
      polygons: [
        ['A', 'B', 'C'],
        ['A', 'B', 'F'],
      ],
    };
    expect(parse('DE קטע אמצעים', ctx)).toEqual({ ok: false, reason: 'not-handled' });
  });

  it('an EMPTY figure → honest escalation (was: a bare segment minting TWO free points, E floating)', () => {
    expect(parse('DE קטע אמצעים', {})).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('#405/ADR-411 — the droppedMidsegment gate never blocks the working forms', () => {
  it('the base-named form still lowers to midpoints (gate transparent)', () => {
    const r = parse('קטע האמצעים לצלע BC במשולש ABC', { points: ['A', 'B', 'C'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'midpoint')).toBe(true);
  });

  it('the 1-anchored ADR-199 form still emits its shape-variant (gate transparent)', () => {
    const r = parse('EG קטע אמצעים', {
      points: ['A', 'B', 'C', 'E'],
      onSegment: { E: ['A', 'C'] },
      neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'shape-variant' && c.shape === 'midsegment')).toBe(true);
  });
});
