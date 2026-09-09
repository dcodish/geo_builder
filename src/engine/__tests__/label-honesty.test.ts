/**
 * #955 ([ADR-491](../../../docs/06-decisions.md#adr-491)) — the verifier holds every NUMERIC label to the
 * figure it annotates.
 *
 * The reported figure wrote «70°» on a corner drawn at 60° and returned `violations = []`: the verifier
 * checked constraints, and a label is not one. `checkLabels` is the ruling's required guard — "without it
 * this class goes silent again the next time a label source is added" — so it is locked DIRECTLY, with a
 * lying label injected, because after the fix no natural figure produces one (that is the point).
 */
import { describe, expect, it } from 'vitest';
import { checkLabels, type GivenViolation, type PrintedLabels } from '../verify';
import type { Vec } from '../types';

const P = (x: number, y: number): Vec => ({ x, y });
// A 3-4-5 right triangle: |AB| = 4, |AC| = 3, |BC| = 5; ∠BAC = 90°, ∠ABC = 36.87°; area 6.
const positions = new Map<string, Vec>([['A', P(0, 0)], ['B', P(4, 0)], ['C', P(0, 3)]]);
const none: PrintedLabels = { lengths: [], angles: [], areas: [] };
const labels = (over: Partial<PrintedLabels>): PrintedLabels => ({ ...none, ...over });

describe('#955 — a label that contradicts the drawing is a violation', () => {
  it('a length label', () => {
    const v = checkLabels(labels({ lengths: [{ a: 'A', b: 'B', text: '8' }] }), positions);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ relation: 'label', ids: ['A', 'B'], messageKey: 'figure.v.label', params: { what: 'AB', label: '8', drawn: '4' } });
  });

  it('an angle label', () => {
    const v = checkLabels(labels({ angles: [{ vertex: 'B', ray1: 'A', ray2: 'C', text: '70°' }] }), positions);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ relation: 'label', ids: ['B', 'A', 'C'], params: { what: '∠ABC', label: '70°', drawn: '36.87°' } });
  });

  it('an area label', () => {
    const v = checkLabels(labels({ areas: [{ ids: ['A', 'B', 'C'], text: '12' }] }), positions);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ relation: 'label', ids: ['A', 'B', 'C'], params: { what: 'ABC', label: '12', drawn: '6' } });
  });

  it('the English fallback names the label, the object and what is actually drawn', () => {
    const [v] = checkLabels(labels({ lengths: [{ a: 'B', b: 'C', text: '7' }] }), positions);
    expect(v.message).toBe('label «7» on BC does not match the drawing (5)');
  });
});

describe('#955 — what the check must NOT flag', () => {
  it('a truthful label, at every kind', () => {
    const v = checkLabels(
      labels({
        lengths: [{ a: 'A', b: 'B', text: '4' }, { a: 'B', b: 'C', text: '5' }],
        angles: [{ vertex: 'B', ray1: 'A', ray2: 'C', text: '36.87°' }, { vertex: 'A', ray1: 'B', ray2: 'C', text: '90°' }],
        areas: [{ ids: ['A', 'B', 'C'], text: '6' }],
      }),
      positions,
    );
    expect(v).toEqual([]);
  });

  it('symbolic, exact and alias texts assert no decimal — the student’s own writing is not measured', () => {
    const v = checkLabels(
      labels({
        lengths: [{ a: 'A', b: 'B', text: '3x' }, { a: 'B', b: 'C', text: '12√2' }, { a: 'A', b: 'C', text: '1.6R' }, { a: 'A', b: 'B', text: 'k + 2' }],
        // an angle-alias prints its digit WITHOUT a degree sign («A1» → "1"); a bare "1" is a name, not 1°
        angles: [{ vertex: 'B', ray1: 'A', ray2: 'C', text: 'α' }, { vertex: 'B', ray1: 'A', ray2: 'C', text: '1' }, { vertex: 'B', ray1: 'A', ray2: 'C', text: 'K1' }],
        areas: [{ ids: ['A', 'B', 'C'], text: '2π' }],
      }),
      positions,
    );
    expect(v).toEqual([]);
  });

  it('a label whose measure is ALREADY a reported violation is not reported twice — the given’s own violation says it', () => {
    const prior: GivenViolation[] = [{ relation: 'distance', ids: ['B', 'A'], message: '', messageKey: 'figure.v.constraint', params: {} }];
    const v = checkLabels(labels({ lengths: [{ a: 'A', b: 'B', text: '8' }] }), positions, prior);
    expect(v).toEqual([]);
  });

  it('a label whose points are not placed is skipped, not flagged', () => {
    const v = checkLabels(labels({ lengths: [{ a: 'A', b: 'Z', text: '9' }], angles: [{ vertex: 'Z', ray1: 'A', ray2: 'B', text: '30°' }] }), positions);
    expect(v).toEqual([]);
  });

  it('a degenerate measure (a zero-length ray) is not a mismatch', () => {
    const v = checkLabels(labels({ angles: [{ vertex: 'A', ray1: 'A', ray2: 'B', text: '30°' }] }), positions);
    expect(v).toEqual([]);
  });
});

describe('#955 — the tolerance is the verifier’s own, plus the half-unit the 2-dp print rounds away', () => {
  it('length: 2e-4 relative + 0.005', () => {
    expect(checkLabels(labels({ lengths: [{ a: 'A', b: 'B', text: '4.005' }] }), positions), 'inside').toEqual([]);
    expect(checkLabels(labels({ lengths: [{ a: 'A', b: 'B', text: '4.02' }] }), positions), 'outside').toHaveLength(1);
  });

  it('angle: ANGLE_EPS (0.5°) + 0.005', () => {
    expect(checkLabels(labels({ angles: [{ vertex: 'B', ray1: 'A', ray2: 'C', text: '37.3°' }] }), positions), 'inside').toEqual([]);
    expect(checkLabels(labels({ angles: [{ vertex: 'B', ray1: 'A', ray2: 'C', text: '37.5°' }] }), positions), 'outside').toHaveLength(1);
  });
});
