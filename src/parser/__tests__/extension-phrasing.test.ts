/**
 * Extension-of phrasing vocabulary (issue #47) — the "המשך" operand accepts more real-prod wordings.
 * Forms landed in the P3 shell+parser bundle:
 *   1. "ההמשך של BE …" (definite article + של) — already worked structurally; the real prod blocker was
 *      the crossing marker "ב F" (bare bet + a space, no hyphen) not being recognised. That marker gap is
 *      the class fix in `crossingAfterCircle` (all four circle-crossing rules inherit it).
 *   2. "המשך הגובה AD …" (a noun-flavoured operand, ADR-269 class) — already worked.
 *   4. "המשך CD היא נקודה A" (copula: extension-word first, point last) — the mirror phrasing.
 * Form 3 (plural distribute "המשכי הגבהים …") is split to its own feature (#148 — engine-touching).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const cmds = (u: string, ctx = {}) => {
  const r = parse(u, ctx);
  expect(r.ok, `should parse: ${u}`).toBe(true);
  return r.ok ? r.commands : [];
};
const notHandled = (u: string, ctx = {}) => {
  const r = parse(u, ctx);
  return r.ok ? r.commands.map((c) => c.type) : ['NOT-HANDLED'];
};

const CIRCLE = { circles: ['O'], points: ['A', 'B', 'C', 'D', 'E'] };

describe('extension-of phrasing (issue #47)', () => {
  it('form 1 — "ההמשך של BE" with the bare spaced "ב F" crossing marker', () => {
    // The real prod blocker: "ב F" (no hyphen) — "בנקודה F" and "ב-F" already worked.
    expect(cmds('ההמשך של BE חותך את המעגל ב F', CIRCLE)).toContainEqual({
      type: 'extend-onto-circle',
      id: 'F',
      a: 'B',
      b: 'E',
      circle: 'circle-O',
    });
  });

  it('the spaced "ב F" marker works for the plain "המשך BE" too (class fix, not just the של form)', () => {
    expect(cmds('המשך BE חותך את המעגל ב F', CIRCLE)).toContainEqual({
      type: 'extend-onto-circle',
      id: 'F',
      a: 'B',
      b: 'E',
      circle: 'circle-O',
    });
  });

  it('form 2 — a noun-flavoured operand "המשך הגובה AD"', () => {
    expect(cmds('המשך הגובה AD חותך את המעגל בנקודה K', { ...CIRCLE, points: ['A', 'D'] })).toContainEqual({
      type: 'extend-onto-circle',
      id: 'K',
      a: 'A',
      b: 'D',
      circle: 'circle-O',
    });
  });

  it('form 4 — copula "המשך CD היא נקודה A" (a NEW point → on the extension, t>1)', () => {
    expect(cmds('המשך CD היא נקודה A')).toContainEqual({
      type: 'point-on-segment',
      id: 'A',
      a: 'C',
      b: 'D',
      t: 1.3,
      extension: true,
    });
  });

  it('form 4 — copula on an EXISTING target → an ordered collinearity constraint (ADR-124)', () => {
    expect(cmds('המשך CD היא נקודה A', { points: ['A'] })).toContainEqual({
      type: 'set-line',
      points: ['C', 'D', 'A'],
    });
  });

  it('form 4 — English "the extension of CD is point A"', () => {
    expect(cmds('the extension of CD is point A')).toContainEqual({
      type: 'point-on-segment',
      id: 'A',
      a: 'C',
      b: 'D',
      t: 1.3,
      extension: true,
    });
  });

  // The existing extension scenarios must be byte-unchanged.
  it('baselines: "F על המשך AD" and "המשך AC חותך את מעגל P בנקודה D" unchanged', () => {
    expect(notHandled('נקודה F על המשך AD')).toContain('point-on-segment');
    expect(cmds('המשך AC חותך את מעגל P בנקודה D', { circles: ['P'], points: ['A', 'C'] })).toContainEqual({
      type: 'extend-onto-circle',
      id: 'D',
      a: 'A',
      b: 'C',
      circle: 'circle-P',
    });
  });
});
