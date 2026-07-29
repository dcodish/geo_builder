/**
 * #407 (ADR-412): a midsegment RULE-DEFAULT anchor side yields to the student's explicit membership —
 * the M4 defaults-yield pre-scan (the ADR-163 shape). «DE קטע אמצעים במשולש ABC» seats D on the first
 * named side AB and pins it to that midpoint; the later «D על AC» used to STACK as a constraint, making
 * the system satisfiable only degenerately (mid(AB) ∈ AC ⇒ B on line AC — the operator's all-collinear
 * screenshot, area exactly 0, every row ✓). Now the rider re-seats onto the stated side and the variant
 * re-anchors. Identification is STRUCTURAL (rider + shape-variant share a GROUP), so a student-stated
 * rider (the 1-anchored ADR-199 form) is never touched.
 */
import { describe, expect, it } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';

function build(tag: string, steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${tag}g${gi}.${facts.length}`, utterance: u, group: `${tag}g${gi}`, cmd, enabled: true });
  }
  return facts;
}

const P = (fig: ReturnType<typeof replay>, id: string) => {
  const p = fig.positions.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (fig: ReturnType<typeof replay>) => {
  const [A, B, C] = ['A', 'B', 'C'].map((id) => P(fig, id));
  return Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
};

describe('#407/ADR-412 — the explicit side statement re-seats the default rider', () => {
  it('«D על AC» after the named-triangle midsegment moves D to mid-AC; the triangle stays a triangle', () => {
    const fig = replay(build('a', ['משולש ABC', 'DE קטע אמצעים במשולש ABC', 'D על AC']), 0);
    expect(fig.lastError).toBeNull();
    expect(Math.abs(dist(P(fig, 'A'), P(fig, 'D')) - dist(P(fig, 'D'), P(fig, 'C'))), 'D is the midpoint of AC').toBeLessThan(1e-6);
    expect(area(fig), 'the triangle did NOT collapse (was area = 0)').toBeGreaterThan(1);
  });

  it('restating the DEFAULT side «D על AB» is a satisfied no-op (no reseat, no conflict)', () => {
    const fig = replay(build('b', ['משולש ABC', 'DE קטע אמצעים במשולש ABC', 'D על AB']), 0);
    expect(fig.lastError).toBeNull();
    expect(Math.abs(dist(P(fig, 'A'), P(fig, 'D')) - dist(P(fig, 'D'), P(fig, 'B'))), 'D stays the midpoint of AB').toBeLessThan(1e-6);
    expect(area(fig)).toBeGreaterThan(1);
  });

  it('an explicit statement about the FREE endpoint PINS the variant («E על BC» → E = mid BC)', () => {
    const fig = replay(build('c', ['משולש ABC', 'DE קטע אמצעים במשולש ABC', 'E על BC']), 0);
    expect(fig.lastError).toBeNull();
    expect(Math.abs(dist(P(fig, 'B'), P(fig, 'E')) - dist(P(fig, 'E'), P(fig, 'C'))), 'E pinned to the midpoint of BC').toBeLessThan(1e-6);
    expect(Math.abs(dist(P(fig, 'A'), P(fig, 'D')) - dist(P(fig, 'D'), P(fig, 'B'))), 'D still the midpoint of AB').toBeLessThan(1e-6);
    expect(area(fig)).toBeGreaterThan(1);
  });

  it('a STUDENT-stated rider (the 1-anchored ADR-199 form) is never re-seated', () => {
    const fig = replay(build('d', ['משולש ABC', 'E על AC', 'EG קטע אמצעים']), 0);
    expect(fig.lastError).toBeNull();
    expect(Math.abs(dist(P(fig, 'A'), P(fig, 'E')) - dist(P(fig, 'E'), P(fig, 'C'))), 'E stays on ITS stated side AC').toBeLessThan(1e-6);
  });
});
