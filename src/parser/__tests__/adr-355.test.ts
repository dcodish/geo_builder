/**
 * ADR-355 (issue #205) — the quarter/semicircle rules' NAMING honesty:
 *  (1) default labels NEVER bind existing points the utterance didn't name (the ADR-116/263
 *      label-hijack class — a bare «רבע מעגל» beside a triangle used to attach the quarter THROUGH
 *      the triangle's own A,B with a fresh auto centre);
 *  (2) a stated CENTRE reaches the rule («C מרכז רבע המעגל», «רבע מעגל שמרכזו C», one-letter
 *      «רבע מעגל C») — it used to be silently dropped because only a 3-letter run was read;
 *  (3) meaning the rule cannot express («החסום במשולש», a cut compound) STOPS — escalates whole,
 *      never a half-build (the semicircle rule's SHAPE_LEFTOVER discipline, now shared).
 *
 * Prod source: session cm4ak2yo (2026-07-17) — «C מרכז רבע מעגל החסום במשולש» after
 * «משולש ABC ישר זוית» lowered to a quarter through the triangle's A,B (deferred forever).
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function buildFacts(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
}
const parseCtx = (prefix: string[]) => {
  const { construction, positions } = replay(buildFacts(prefix));
  return buildParseCtx(construction, positions);
};
const ids = (cmds: AnyCommand[]) =>
  new Set(cmds.flatMap((c) => ['id', 'center', 'a', 'b', 'from', 'to', 'vertex', 'ray1', 'ray2'].map((k) => (c as Record<string, unknown>)[k]).filter((v): v is string => typeof v === 'string')));

describe('ADR-355 — quarter/semicircle naming honesty', () => {
  it("«C מרכז רבע מעגל החסום במשולש» STOPS (escalates whole) — never a quarter through the triangle's A,B", () => {
    const r = parse('C מרכז רבע מעגל החסום במשולש', parseCtx(['משולש ABC ישר זוית']));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-handled');
  });

  for (const [u, wantCenter] of [
    ['רבע מעגל שמרכזו C', 'C'],
    ['C מרכז רבע המעגל', 'C'],
    ['רבע מעגל C', 'C'],
    ['quarter circle with center C', 'C'],
  ] as const) {
    it(`stated centre reaches the rule: «${u}» → centre ${wantCenter}, fresh ends`, () => {
      const r = parse(u, parseCtx(['משולש ABC ישר זוית']));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const circle = r.commands.find((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle')!;
      expect(circle.center).toBe(wantCenter);
      expect(circle.autoCenter, 'a named centre is not anonymous').toBeUndefined();
      // The two arc ends are FRESH — never the triangle's A or B.
      const used = ids(r.commands);
      expect(used.has('A') || used.has('B'), 'no hijack of existing labels').toBe(false);
    });
  }

  it('bare «רבע מעגל» beside a triangle picks fresh labels for centre AND ends', () => {
    const r = parse('רבע מעגל', parseCtx(['משולש ABC']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used = ids(r.commands);
    for (const taken of ['A', 'B', 'C']) expect(used.has(taken), `${taken} not hijacked`).toBe(false);
  });

  it('bare «חצי מעגל» beside a triangle picks a fresh diameter — never the triangle A,B', () => {
    const r = parse('חצי מעגל', parseCtx(['משולש ABC']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used = ids(r.commands);
    for (const taken of ['A', 'B', 'C']) expect(used.has(taken), `${taken} not hijacked`).toBe(false);
  });

  it('bare «רבע מעגל» on an empty canvas keeps the O,A,B convention (byte-stable default)', () => {
    const r = parse('רבע מעגל', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circle = r.commands.find((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle')!;
    // The unnamed default centre stays the anonymous @ctr-O (ADR-342) — the O token, never a squat.
    expect(circle.id).toBe('circle-O');
    const used = ids(r.commands);
    expect(used.has('A') && used.has('B')).toBe(true);
  });

  it('the named run «רבע מעגל ODC» on existing points is untouched (M1 path)', () => {
    const r = parse('רבע מעגל ODC', parseCtx(['משולש ABC ישר זוית', 'O על AC', 'D על AB']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circle = r.commands.find((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle')!;
    expect(circle.center).toBe('O');
    const angle = r.commands.find((c): c is Extract<AnyCommand, { type: 'set-angle' }> => c.type === 'set-angle')!;
    expect(angle.vertex).toBe('O');
    expect([angle.ray1, angle.ray2].sort()).toEqual(['C', 'D']);
  });
});
