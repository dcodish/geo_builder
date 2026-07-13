/**
 * Issue #112 — NAME an auto-assigned circle centre after the fact.
 *
 * A student draws an unnamed circle (the system hides an auto-picked centre O). Later they say
 * «מרכז המעגל הוא P» / "the centre of the circle is P" to name it. Before this fix that minted a SECOND
 * circle (circle-P) instead of naming the one they drew; further attempts then hit "already exists". The
 * fix: `parseNameCenter` (intercepted by App.submit before the parser, like rename/swap) resolves the
 * hidden centre and calls the store's `nameCentre`, which RENAMES the centre O→P across every fact (incl.
 * `circle-O`→`circle-P` and `center:O`→P via the shared id-remap) AND reveals it (a named centre shows) —
 * one undo entry, never a second circle. The reveal-with-the-existing-letter case stays with the parser's
 * `nameCenter` rule; a fresh letter with an ambiguous (0 or ≥2 auto-centre) figure defers.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx, parseNameCenter } from '@/parser';
import { replay, useGeoStore } from '../geoStore';
import type { AnyCommand } from '@/engine';

const s = () => useGeoStore.getState();
function ctxNow() {
  const fig = replay(s().facts);
  return buildParseCtx(fig.construction, fig.positions);
}
/** App.submit-faithful: intercept parseNameCenter before parse (as App.tsx does). */
function submit(line: string) {
  const nc = parseNameCenter(line, ctxNow());
  if (nc) return { via: 'name-centre' as const, res: s().nameCentre(nc.from, nc.to) };
  const r = parse(line, ctxNow());
  if (!r.ok) return { via: 'parse-fail' as const, reason: r.reason };
  for (const cmd of r.commands) s().execute(cmd, line, `g-${line}`);
  return { via: 'parse' as const };
}
const circles = () =>
  replay(s().facts).construction.objects.filter((o): o is Extract<AnyCommand extends never ? never : any, { kind: 'circle' }> => (o as { kind: string }).kind === 'circle');

describe('issue #112 — name an auto-assigned circle centre', () => {
  it.each([
    ['He «מרכז המעגל הוא P»', ['מעגל', 'מרכז המעגל הוא P']],
    ['En "the center of the circle is P"', ['circle', 'the center of the circle is P']],
    ['He label-first «P מרכז המעגל»', ['מעגל', 'P מרכז המעגל']],
  ])('%s renames the hidden centre and reveals it — ONE circle, never two', (_t, lines) => {
    s().clear();
    for (const line of lines) submit(line);
    const cs = circles();
    expect(cs).toHaveLength(1);
    expect(cs[0].center).toBe('P');
    expect(cs[0].id).toBe('circle-P');
    expect(cs[0].autoCenter).toBeUndefined(); // revealed (a named centre shows)
    s().clear();
  });

  it('a subscript label «מרכז המעגל הוא O1» works', () => {
    s().clear();
    submit('מעגל');
    const out = submit('מרכז המעגל הוא O1');
    expect(out.via).toBe('name-centre');
    const cs = circles();
    expect(cs).toHaveLength(1);
    expect(cs[0].center).toBe('O1');
    s().clear();
  });

  it('one undo entry: naming the centre is a single undoable step', () => {
    s().clear();
    submit('מעגל');
    const before = s().facts.length;
    submit('מרכז המעגל הוא P');
    s().undo();
    // after undo, the circle is back to its auto-named state (centre P gone)
    expect(replay(s().facts).construction.objects.filter((o) => o.kind === 'circle')[0].center).toBe('O');
    expect(s().facts.length).toBe(before);
    s().clear();
  });

  it('no-theft: reveal-with-the-existing-letter goes through the parser rule, not a rename', () => {
    s().clear();
    submit('מעגל שמרכזו O'); // a NAMED centre O
    const out = submit('O מרכז המעגל'); // same letter → reveal, not rename
    expect(out.via).toBe('parse'); // parseNameCenter did NOT fire (X is not fresh)
    const cs = circles();
    expect(cs).toHaveLength(1);
    expect(cs[0].center).toBe('O');
    s().clear();
  });

  it('defers on an ambiguous figure (two unnamed circles) — parseNameCenter does not fire', () => {
    s().clear();
    submit('מעגל');
    submit('מעגל');
    expect(parseNameCenter('מרכז המעגל הוא P', ctxNow())).toBeNull();
    s().clear();
  });

  it('a taken letter is refused (would merge) — parseNameCenter defers', () => {
    s().clear();
    submit('משולש ABC');
    submit('מעגל');
    expect(parseNameCenter('מרכז המעגל הוא A', ctxNow())).toBeNull(); // A is a triangle vertex → not fresh
    s().clear();
  });

  it('re-lettering an already-NAMED sole centre also works (fresh target)', () => {
    s().clear();
    submit('מעגל שמרכזו O');
    const out = submit('מרכז המעגל הוא Q'); // O named, Q fresh → rename O→Q
    expect(out.via).toBe('name-centre');
    expect(circles()[0].center).toBe('Q');
    s().clear();
  });
});
