/**
 * Round #2822 — the staging merge's insertion resolver (scripts/round-merge-insertions.mjs). Lives in
 * server/__tests__ for the isolation.test.ts reason: workspace tooling, run in every lane.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { mergeInsertions } from '../../scripts/round-merge-insertions.mjs';

describe('round staging merge — both branches inserted at the same point', () => {
  it('keeps both insertions and the shared closing lines ONCE (the round #2822 brace loss)', () => {
    const base = "describe('a', () => {\n  it('x', () => {});\n});\n";
    const ours = "describe('a', () => {\n  it('x', () => {});\n});\n\ndescribe('b', () => {\n  it('y', () => {\n  });\n});\n";
    const theirs = "describe('a', () => {\n  it('x', () => {});\n});\n\ndescribe('c', () => {\n  it('z', () => {\n  });\n});\n";
    const merged = mergeInsertions(base, ours, theirs) as string;
    expect(merged).toContain("describe('b'");
    expect(merged).toContain("describe('c'");
    const opens = (merged.match(/\{/g) ?? []).length;
    const closes = (merged.match(/\}/g) ?? []).length;
    expect(closes).toBe(opens);
    expect(merged.indexOf("describe('b'")).toBeLessThan(merged.indexOf("describe('c'"));
  });

  it('an insertion in the middle, shared suffix after it, keeps the suffix once', () => {
    const base = 'A\nZ\n';
    expect(mergeInsertions(base, 'A\nX1\nX2\nZ\n', 'A\nY1\nZ\n')).toBe('A\nX1\nX2\nY1\nZ\n');
  });

  it('a side that changed base lines is not a pure insertion — left for a hand merge', () => {
    expect(mergeInsertions('A\nB\nC\n', 'A\nB2\nC\n', 'A\nB\nY\nC\n')).toBeNull();
  });
});
