/**
 * #96 — the abbreviated "מ-X" (from X) external-point cue; #97 — a stated "on the circle" membership that a
 * relation clause dropped. Both surfaced building bagrut 2023 קיץ מועד א Q4.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

function build(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const u of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    expect(r.ok, `"${u}" should parse`).toBe(true);
    if (!r.ok) return facts;
    for (const cmd of r.commands) facts.push({ id: `f${facts.length}`, group: u, utterance: u, cmd, enabled: true });
  }
  return facts;
}
const kindOf = (facts: Fact[], id: string) => replay(facts).construction.objects.find((o) => o.id === id)?.kind;

describe('#96 — secant/tangent from an external point: abbreviated "מ-X"', () => {
  const setup = ['מעגל O', 'C על המעגל', 'מנקודה B מחוץ למעגל מעבירים משיק למעגל בנקודה C'];
  it('מ-B secant cuts the circle at E and A (the abbreviated "from B")', () => {
    const f = build([...setup, 'מ-B יוצא ישר החותך את המעגל בנקודות E ו A']);
    const cmds = f.map((x) => x.cmd);
    expect(cmds.some((c) => c.type === 'line-circle-intersection'), 'a secant crossing is built').toBe(true);
    for (const id of ['E', 'A']) expect(replay(f).construction.objects.some((o) => o.id === id), `${id} exists`).toBe(true);
  });
  it('the spelled-out "מנקודה B" still works (no regression)', () => {
    expect(() => build([...setup, 'מנקודה B יוצא ישר החותך את המעגל בנקודות E ו A'])).not.toThrow();
  });
  it('"מ-AB" is NOT read as "from A" (the single-label guard)', () => {
    // no external-point secant here — "מ-AB" is not a from-point cue; it must not misfire
    const r = parse('מ-AB חותך את המעגל בנקודות E ו F', { circles: ['O'], points: ['A', 'B'] } as never);
    // either not-handled or handled by another rule, but never a secant FROM "A"
    if (r.ok) expect(r.commands.every((c) => !(c.type === 'point-on-segment' && (c as { id: string }).id === 'A'))).toBe(true);
  });
});

describe('#97 — a point stated ON THE CIRCLE keeps its membership through a relation clause', () => {
  it('D על המעגל כך ש-CD מקביל ל-EA → D is ON the circle (not a free point)', () => {
    const f = build(['מעגל O', 'C על המעגל', 'E על המעגל', 'A על המעגל', 'D על המעגל כך ש-CD מקביל ל-EA']);
    expect(kindOf(f, 'D'), 'D on-circle, not free').toBe('on-circle');
    // the parallel relation is still asserted
    expect(f.some((x) => x.cmd.type === 'set-parallel'), 'CD ∥ EA still constrained').toBe(true);
  });
  it('English: "D on the circle such that CD ∥ EA"', () => {
    const f = build(['circle O', 'C on the circle', 'E on the circle', 'A on the circle', 'D on the circle such that CD ∥ EA']);
    expect(kindOf(f, 'D')).toBe('on-circle');
  });
  it('no spurious membership: "points A and C are on the circle" puts ONLY A, C on the circle (ADR-240 regression)', () => {
    const f = build(['circle O', 'points A and C are on the circle']);
    const onCircle = replay(f).construction.objects.filter((o) => o.kind === 'on-circle').map((o) => o.id).sort();
    expect(onCircle, 'only the stated A, C are on the circle — no phantom "E" from "are"').toEqual(['A', 'C']);
  });
});
