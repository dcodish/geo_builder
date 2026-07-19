/**
 * Issue #184 (feature, FR-IN-11, ADR-368) — the student who doesn't name things.
 *
 * The engine already auto-named for median/altitude/foot; midpoint, diameter, tangent, centre, and
 * the unnamed secant still required a student-supplied name — same student, same sentence shape,
 * arbitrary split (verbatim prod misses, ~6 distinct users). One shared discipline: strict
 * LAST-RESORT rules that fire only when nothing beyond the construct noun + a circle reference +
 * request words remains, resolve the circle per ADR-029, and auto-name via freeLabel (every existing
 * label excluded, the ADR-263 foot-naming rule).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

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

describe('#184 — auto-name the unnamed construct', () => {
  it.each([['הוסף אמצע צלע AB'], ['אמצע AB'], ['midpoint of AB']])('midpoint: %s auto-names a FRESH label', (u) => {
    const base = factsFrom(['משולש ABC']);
    const r = parse(u, ctxOf(base));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    const mid = r.commands.find((c) => c.type === 'midpoint') as { id?: string } | undefined;
    expect(mid).toBeTruthy();
    expect(['A', 'B', 'C']).not.toContain(mid!.id); // never hijacks an existing label (ADR-263 discipline)
  });

  it.each([['להוסיף משיק למעגל'], ['משיק למעגל'], ['a tangent to the circle']])('tangent: %s draws a tangent at an auto-named free touch', (u) => {
    const base = factsFrom(['מעגל O']);
    const r = parse(u, ctxOf(base));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'tangent')).toBe(true);
    expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as { free?: boolean }).free)).toBe(true);
  });

  it.each([['קוטר'], ['a diameter'], ['הוסף קוטר']])('diameter: %s builds an auto-named diameter of THE circle', (u) => {
    const base = factsFrom(['מעגל O']);
    const r = parse(u, ctxOf(base));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'diameter')).toBe(true);
  });

  it.each([['ישר החותך את המעגל בשתי נקודות'], ['a line cutting the circle at two points']])(
    'secant: %s puts two auto-named points on the circle + the drawn secant',
    (u) => {
      const base = factsFrom(['מעגל O']);
      const r = parse(u, ctxOf(base));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      expect(r.commands.filter((c) => c.type === 'point-on-circle')).toHaveLength(2);
      expect(r.commands.some((c) => c.type === 'segment')).toBe(true);
    },
  );

  it('secant with crossings-only names: «ישר החותך את המעגל בנקודות C ו-D» uses the stated names', () => {
    const base = factsFrom(['מעגל O']);
    const r = parse('ישר החותך את המעגל בנקודות C ו-D', ctxOf(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.commands.filter((c) => c.type === 'point-on-circle').map((c) => (c as { id: string }).id);
    expect(ids.sort()).toEqual(['C', 'D']);
  });

  it.each([['נתון מעגל'], ['given a circle']])('bare circle: %s creates a default circle', (u) => {
    const r = parse(u, { points: [], circles: [] });
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle')).toBe(true);
  });

  it('«מעגל עם מרכז O» creates circle O with a visible named centre', () => {
    const r = parse('מעגל עם מרכז O', { points: [], circles: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = r.commands.find((x) => x.type === 'circle') as { center?: string; autoCenter?: boolean } | undefined;
      expect(c?.center).toBe('O');
      expect(c?.autoCenter).toBeUndefined();
    }
  });

  it.each([['להוסיף את מרכז המעגל'], ['the centre of the circle']])('centre: %s reveals the hidden centre of THE circle', (u) => {
    const base = factsFrom(['מעגל']); // unnamed → anonymous auto centre
    const r = parse(u, ctxOf(base));
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'name-center')).toBe(true);
  });

  it('the whole unnamed chain builds end-to-end', () => {
    const fig = allOk(factsFrom(['נתון מעגל', 'קוטר', 'משיק למעגל', 'מרכז המעגל']));
    expect(fig.construction.objects.some((o) => o.kind === 'circle')).toBe(true);
  });

  it('no-theft: richer phrasings keep their owners', () => {
    const tri = factsFrom(['משולש ABC']);
    const named = parse('M אמצע AB', ctxOf(tri));
    expect(named.ok && named.commands.some((c) => c.type === 'midpoint' && (c as { id: string }).id === 'M')).toBe(true);
    const circ = factsFrom(['מעגל O']);
    const fromE = parse('מנקודה E יוצא משיק למעגל O', ctxOf(circ));
    expect(fromE.ok && fromE.commands.some((c) => c.type === 'circle-circle-intersection'), 'the external-tangent Thales owner').toBe(true);
    const namedLine = parse('הישר AB חותך את המעגל בנקודות C ו-D', ctxOf(factsFrom(['מעגל O', 'A מחוץ למעגל', 'B מחוץ למעגל'])));
    expect(namedLine.ok && namedLine.commands.some((c) => c.type === 'line-circle-intersection'), 'the named-line cut owner').toBe(true);
    // ambiguity: with TWO circles a bare «משיק למעגל» / «קוטר» defers (which circle?)
    const two = factsFrom(['מעגל O', 'מעגל P']);
    expect(parse('משיק למעגל', ctxOf(two)).ok).toBe(false);
    expect(parse('קוטר', ctxOf(two)).ok).toBe(false);
  });
});
