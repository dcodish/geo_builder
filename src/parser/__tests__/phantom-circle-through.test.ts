/**
 * Issue #180 — a bare «דרך X» inside ANOTHER construct must not mint a phantom circle.
 *
 * Prod (log-triage 2026-07-17, re-verified on HEAD): «דרך A עובר משיק למעגל» (a TANGENT through A) was
 * claimed by the `circle` rule — a bare `דרך <Label>` anywhere set `isDef`, so the sentence became a
 * circle DEFINITION: a brand-new `circle-through` through A, the stated tangent noun silently dropped,
 * then an opaque refusal naming objects the student never mentioned. The `centered` signal got the
 * "a reference is not a definition" guard (the ישר-through-centre fix); the `through` signal — the same
 * class — did not. The guard now defers when a construct noun / cut verb / line noun survives the
 * strip, so the tangent/secant rules (or the LLM) own the utterance.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
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

describe('#180 — the through-signal guard on the circle rule', () => {
  it('the exact prod utterances DEFER (escalate) instead of minting a circle through A', () => {
    const base = runLines(['מעגל O']);
    for (const u of [
      'דרך A עובר משיק למעגל', // the reduced repro
      'דרך A עובר משיק למעגל O שחותך את מעגל Q בנקודה K', // prod verbatim
      'through A passes a tangent to the circle', // En mirror
    ]) {
      const r = parse(u, ctxOf(base));
      if (r.ok) {
        // If some rule legitimately claims it (e.g. a future tangent-through-point owner), it must
        // NOT be a circle definition through A — that is the phantom this issue closes.
        const phantom = r.commands.some((c) => c.type === 'circle-through' && (c as { through?: string }).through === 'A');
        expect(phantom, `${u} must never lower to a circle THROUGH A`).toBe(false);
      } else {
        expect(r.reason).toBe('not-handled');
      }
    }
  });

  it('typo variant «דרך A עובר משיק למעגך Q בנקודה K» stays unclaimed (honest escalation)', () => {
    const base = runLines(['מעגל O']);
    const r = parse('דרך A עובר משיק למעגך Q בנקודה K', ctxOf(base));
    if (r.ok) {
      const phantom = r.commands.some((c) => c.type === 'circle-through');
      expect(phantom).toBe(false);
    }
  });

  it('regression: a GENUINE circle-through definition is byte-identical', () => {
    for (const u of ['מעגל העובר דרך A', 'circle through A']) {
      const r = parse(u, { points: ['A'], circles: [] });
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        expect(r.commands).toHaveLength(1);
        expect(r.commands[0]).toMatchObject({ type: 'circle-through', through: 'A' });
      }
    }
  });

  it('regression: the guarded `centered` sibling «ישר AD עובר דרך מרכז המעגל» still creates NO circle', () => {
    const base = runLines(['מעגל O', 'A על המעגל', 'D על המעגל']);
    const r = parse('ישר AD עובר דרך מרכז המעגל', ctxOf(base));
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circle-through')).toBe(false);
  });

  it('no-theft: with A EXISTING, «דרך A עובר משיק למעגל» keeps its deterministic tangent owner', () => {
    const facts = runLines(['מעגל O', 'A מחוץ למעגל']);
    const r = parse('דרך A עובר משיק למעגל', ctxOf(facts));
    expect(r.ok, 'tangent-from-external still owns the existing-A form').toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle-through' && (c as { through?: string }).through === 'A')).toBe(false);
  });
});
