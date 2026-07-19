/**
 * Issue #159 — the unbuilt half of the ADR-029 implicit circle reference: the tangent/secant rules
 * could RESOLVE "the circle" (named, or the single one) but never INTRODUCE one, so the opener
 * «מנקודה A יוצאים שני משיקים למעגל» fell off the deterministic path to the LLM — whose rescue pinned
 * an unstated radius 5 (ADR-052 violation) and was non-deterministic (the operator's "שני works, 2
 * doesn't" was pure LLM luck). The named-but-absent sibling («…למעגל O», no circle O yet) parsed `ok`
 * but emitted dangling refs against a circle never created — nothing was built.
 *
 * Fix: `resolveOrIntroduceCircle` — existing → resolve (byte-identical); named+absent → create it
 * (free radius); unnamed + NO circle in the figure → introduce an auto-centred free-radius circle;
 * unnamed beside ≥2 circles → defer. Routed through `tangentsFromExternal`, `tangentFromExternal`,
 * `secantFromExternal`; the resolve-only helpers keep their contracts (a plain line∩line must never
 * grab a circle).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function factsFrom(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const allOk = (facts: Fact[]) => {
  const fig = replay(facts);
  for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
  return fig;
};
type CircleCmd = Extract<AnyCommand, { type: 'circle' }>;

describe('#159 — resolve-or-introduce for the tangent/secant family', () => {
  it.each([
    ['He word count', 'מנקודה A יוצאים שני משיקים למעגל'],
    ['He digit count', 'מנקודה A יוצאים 2 משיקים למעגל'],
    ['En', 'from point A two tangents to the circle'],
  ])('%s as the FIRST step introduces the circle with a FREE radius and builds — no LLM', (_t, u) => {
    const r = parse(u, { points: [], circles: [] });
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    const circle = r.commands.find((c) => c.type === 'circle') as CircleCmd | undefined;
    expect(circle, 'the circle is introduced by the sentence itself').toBeTruthy();
    expect(circle!.freeRadius, 'ADR-052 — the unstated radius is a FREE DOF, never the LLM-pinned 5').toBe(true);
    const facts = factsFrom([u]);
    const fig = allOk(facts);
    const tangents = fig.construction.objects.filter((o) => o.kind === 'segment' && [o.a, o.b].includes('A'));
    expect(tangents.length, 'both tangent segments from A drawn').toBeGreaterThanOrEqual(2);
  });

  it('NAMED + ABSENT: «מנקודה A יוצאים שני משיקים למעגל O» creates circle O (was dangling refs, built nothing)', () => {
    const facts = factsFrom(['מנקודה A יוצאים שני משיקים למעגל O']);
    const fig = allOk(facts);
    expect(fig.construction.objects.some((o) => o.kind === 'circle' && o.id === 'circle-O')).toBe(true);
  });

  it('NAMED + PRESENT / UNNAMED + PRESENT: an existing circle is resolved, never re-created (byte-identical no-theft)', () => {
    const base = factsFrom(['מעגל O']);
    for (const u of ['מנקודה A יוצאים שני משיקים למעגל O', 'מנקודה A יוצאים שני משיקים למעגל']) {
      const r = parse(u, ctxOf(base));
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circle-through' && !String(c.id).startsWith('tanaux')), `${u} must not create a second circle`).toBe(false);
    }
  });

  it('UNNAMED beside TWO circles stays ambiguous — defers, never introduces a third', () => {
    const base = factsFrom(['מעגל O', 'מעגל P']);
    expect(parse('מנקודה A יוצאים שני משיקים למעגל', ctxOf(base)).ok).toBe(false);
  });

  it('the SINGLE-tangent sibling: «מנקודה E יוצא משיק למעגל O» on an empty figure creates circle O and builds', () => {
    const facts = factsFrom(['מנקודה E יוצא משיק למעגל O']);
    const fig = allOk(facts);
    expect(fig.construction.objects.some((o) => o.kind === 'circle' && o.id === 'circle-O')).toBe(true);
  });

  it('the SECANT sibling: the external-secant opener introduces its circle', () => {
    const facts = factsFrom(['מנקודה E מחוץ למעגל ישר חותך את המעגל בנקודות A ו-B']);
    const fig = allOk(facts);
    expect(fig.construction.objects.some((o) => o.kind === 'circle')).toBe(true);
  });
});
