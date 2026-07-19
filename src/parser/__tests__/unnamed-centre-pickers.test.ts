/**
 * Issue #213 — the unnamed-centre pickers were blind to ANONYMOUS centres (ADR-342's own seam).
 *
 * Operator prod repro (2026-07-19): a square with an unnamed semicircle outside each side — the SECOND
 * unnamed semicircle re-picked the letter O (its hand-rolled picker consulted ctx.points only, and an
 * ADR-342 anonymous centre '@ctr-O' never appears there — it lives in ctx.circles), re-emitted the
 * first semicircle's ids, and refused «@ctr-O coincides with its constructed target». Class members:
 * `semicircle`, `quarterCircle`, `sector` — all now use the shared freeLabel([points, circles], …)
 * discipline that `semicirclesOnEverySide` already proved correct.
 *
 * Ride-along: `semicirclesOnEverySide` accepted «מחוץ לריבוע» but silently DROPPED it (no per-side
 * bulge) — a stated side-of-the-shape given became an unasserted default drawing.
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
const circlesOf = (facts: Fact[]) =>
  replay(facts)
    .construction.objects.filter((o) => o.kind === 'circle')
    .map((o) => o.id);

describe('#213 — unnamed-centre pickers consult ctx.circles', () => {
  it('two unnamed SEMICIRCLES on different square sides pick DISTINCT centres and both build', () => {
    const facts = runLines(['ריבוע', 'BC קוטר חצי מעגל מחוץ לריבוע', 'AD קוטר חצי מעגל מחוץ לריבוע']);
    const ids = circlesOf(facts);
    expect(new Set(ids).size, `distinct circle ids: ${ids.join(', ')}`).toBe(2);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
  });

  it('two unnamed QUARTER-circles coexist (distinct centres)', () => {
    const facts = runLines(['רבע מעגל', 'רבע מעגל']);
    const ids = circlesOf(facts);
    expect(new Set(ids).size, `distinct circle ids: ${ids.join(', ')}`).toBe(2);
  });

  it('two unnamed SECTORS coexist (distinct centres)', () => {
    const facts = runLines(['גזרה', 'גזרה']);
    const ids = circlesOf(facts);
    expect(new Set(ids).size, `distinct circle ids: ${ids.join(', ')}`).toBe(2);
  });

  it.each([['מבחוץ', 'BC קוטר חצי מעגל מבחוץ'], ['בחוץ', 'BC קוטר חצי מעגל בחוץ']])(
    '#222: the bare ADVERB side word (%s) binds the bulge like «מחוץ לריבוע» — never silently dropped',
    (_t, u) => {
      const facts = runLines(['ריבוע']);
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const arc = r.commands.find((c) => c.type === 'arc') as { bulgeRef?: string; bulgeToward?: boolean } | undefined;
      expect(arc?.bulgeRef, 'the outward reference bound').toBeTruthy();
      expect(arc?.bulgeToward, 'outside ⇒ away from the reference vertex').toBeUndefined();
    },
  );

  it('#222: the quantified bare adverb «על כל צלע של הריבוע יש חצי מעגל מבחוץ» carries the bulge per side', () => {
    const facts = runLines(['ריבוע ABCD', 'על כל צלע של הריבוע יש חצי מעגל מבחוץ']);
    const arcs = replay(facts).construction.objects.filter((o) => o.kind === 'arc');
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) expect((arc as { bulgeRef?: string }).bulgeRef, 'each side arc bound outward').toBeTruthy();
  });

  it('ride-along: the quantified «על כל צלע של הריבוע יש חצי מעגל מחוץ לריבוע» carries the bulge per side', () => {
    const facts = runLines(['ריבוע ABCD', 'על כל צלע של הריבוע יש חצי מעגל מחוץ לריבוע']);
    const arcs = replay(facts).construction.objects.filter((o) => o.kind === 'arc');
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect((arc as { bulgeRef?: string }).bulgeRef, 'each side arc carries its outward reference').toBeTruthy();
      expect((arc as { bulgeToward?: boolean }).bulgeToward, 'outside ⇒ away from the reference vertex').toBeUndefined();
    }
  });
});
