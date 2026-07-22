/**
 * #264 (ADR-388) — collinear-containment ink dedup: ONE visible run = ONE ink owner.
 *
 * Prod session m01ophid (2026-07-22): the apex common-tangent figure («שני מעגלים משיקים מבחוץ» +
 * «מנקודה A יוצאים שני משיקים משותפים לשני המעגלים») draws, per tangent, BOTH the touch–touch
 * segment and the apex segment `apex–T1` — and because the derived apex lands beyond the SMALLER
 * (second) circle, `apex–T1` spans the whole tangent, double-inking the touch–touch stretch.
 * Hiding the spanning segment left the stretch drawn beneath ("it only hid AC") and its wide
 * hit-line occluded the contained segment's menu ("cannot hide the BC part"). The scene now marks
 * a segment collinearly contained in a longer one `covered` — no base ink, no hit-target; the
 * maximal container owns the run, so hide/dash act on the whole visible line.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { buildScene, markCoveredSegments } from '@/render/scene';
import type { SceneSegment } from '@/render/scene';

function factsFrom(lines: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const fig = replay(facts);
    const r = parse(line, buildParseCtx(fig.construction, fig.positions));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}

/** True when T's span is collinearly contained in S's (the test's own oracle, mirroring the rule). */
function containedIn(T: SceneSegment, S: SceneSegment): boolean {
  const len = Math.hypot(S.b.x - S.a.x, S.b.y - S.a.y);
  if (len < 1e-9) return false;
  const u = { x: (S.b.x - S.a.x) / len, y: (S.b.y - S.a.y) / len };
  const tol = 1e-6 * Math.max(1, len);
  const within = (p: { x: number; y: number }): boolean => {
    const dx = p.x - S.a.x;
    const dy = p.y - S.a.y;
    const along = dx * u.x + dy * u.y;
    return Math.abs(dx * u.y - dy * u.x) <= tol && along >= -tol && along <= len + tol;
  };
  return within(T.a) && within(T.b);
}

describe('#264 — the apex common-tangent figure inks each tangent as ONE ownable run', () => {
  const facts = factsFrom(['שני מעגלים משיקים מבחוץ', 'מנקודה A יוצאים שני משיקים משותפים לשני המעגלים']);
  const fig = replay(facts);

  it('builds green (control)', () => {
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
  });

  it('no two UNCOVERED segments contain one another — double ink is structurally gone', () => {
    const scene = buildScene(fig.construction, fig.positions);
    const live = scene.segments.filter((s) => !s.covered);
    for (const T of live)
      for (const S of live) {
        if (T === S) continue;
        expect(containedIn(T, S), `${T.id} still double-inked under ${S.id}`).toBe(false);
      }
  });

  it('each touch–touch segment is covered by its spanning apex segment — hiding the carrier hides the WHOLE tangent', () => {
    const scene = buildScene(fig.construction, fig.positions);
    // the two apex segments (A–T1 per tangent) span their tangents; the touch–touch segments ride under them
    const covered = scene.segments.filter((s) => s.covered);
    expect(covered.length).toBe(2);
    for (const c of covered) {
      const carrier = scene.segments.find((s) => !s.covered && containedIn(c, s));
      expect(carrier, `carrier for ${c.id}`).toBeTruthy();
      expect(carrier!.id.includes('A'), `the apex segment owns the run (got ${carrier!.id})`).toBe(true);
    }
  });
});

describe('markCoveredSegments — the rule itself', () => {
  const seg = (id: string, ax: number, ay: number, bx: number, by: number, aId?: string): SceneSegment => ({
    id,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    ...(aId ? { aId, bId: aId } : {}),
  });

  it('a chain S ⊃ T ⊃ U marks T and U against the MAXIMAL carrier S', () => {
    const segs = [seg('U', 2, 0, 3, 0), seg('S', 0, 0, 10, 0), seg('T', 1, 0, 4, 0)];
    markCoveredSegments(segs);
    expect(segs.find((s) => s.id === 'S')!.covered).toBeUndefined();
    expect(segs.find((s) => s.id === 'T')!.covered).toBe(true);
    expect(segs.find((s) => s.id === 'U')!.covered).toBe(true);
  });

  it('an exact duplicate pair keeps the NAMED segment (aId) as carrier', () => {
    const segs = [seg('line-derived', 0, 0, 5, 5), seg('seg-AB', 0, 0, 5, 5, 'A')];
    markCoveredSegments(segs);
    expect(segs.find((s) => s.id === 'seg-AB')!.covered).toBeUndefined();
    expect(segs.find((s) => s.id === 'line-derived')!.covered).toBe(true);
  });

  it('a mere partial overlap (neither contains the other) marks nothing', () => {
    const segs = [seg('L', 0, 0, 6, 0), seg('R', 4, 0, 10, 0)];
    markCoveredSegments(segs);
    expect(segs.every((s) => !s.covered)).toBe(true);
  });

  it('a nearby but off-line segment is never covered', () => {
    const segs = [seg('S', 0, 0, 10, 0), seg('T', 2, 0.01, 5, 0.01)];
    markCoveredSegments(segs);
    expect(segs.find((s) => s.id === 'T')!.covered).toBeUndefined();
  });

  it('triangle edges (shared endpoints, not collinear) are untouched', () => {
    const segs = [seg('AB', 0, 0, 4, 0), seg('BC', 4, 0, 2, 3), seg('CA', 2, 3, 0, 0)];
    markCoveredSegments(segs);
    expect(segs.every((s) => !s.covered)).toBe(true);
  });
});
