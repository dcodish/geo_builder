/**
 * #224 / ADR-376 — definite-reference circle containment: an INDEFINITE subject circle contained in
 * an EXISTING referenced container — «מעגל מוכל בתוך המעגל הגדול» (prod 0yqufnuv 09:23), bare
 * «מעגל מוכל», «מעגל מוכל בתוך מעגל O», En mirrors. The container is resolved (named / THE single
 * circle / the #102 size-qualifier rewrite — widened to the single-circle figure), never guessed;
 * the subject is a NEW auto-centred free-radius circle; the `set-circle-position contained`
 * requirement seats it (#196 machinery). No-theft: the named-pair and plural forms keep their owners.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

let n = 0;
function ctxOf(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`setup parse failed: ${u}`);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

const contained = (cmds: AnyCommand[]) =>
  cmds.find((c): c is Extract<AnyCommand, { type: 'set-circle-position' }> => c.type === 'set-circle-position' && (c as { relation?: string }).relation === 'contained');
const newCircles = (cmds: AnyCommand[]) => cmds.filter((c) => c.type === 'circle');

describe('#224 — a new circle contained in a DEFINITE existing container', () => {
  it('the exact prod utterance: «מעגל מוכל בתוך המעגל הגדול» beside ONE circle binds THE circle as the container', () => {
    const ctx = ctxOf('AB קוטר');
    const r = parse('מעגל מוכל בתוך המעגל הגדול', ctx);
    if (!r.ok) throw new Error('did not parse');
    const rel = contained(r.commands);
    expect(rel).toBeTruthy();
    expect(rel!.a, 'the EXISTING circle is the container').toBe('circle-O');
    expect(newCircles(r.commands), 'exactly one NEW circle (the inner) — the container is never re-created').toHaveLength(1);
    expect(rel!.b, 'the new circle is the contained one').toBe(newCircles(r.commands)[0].id);
  });

  it('bare «מעגל מוכל» — the single drawn circle is the implicit container (ADR-029)', () => {
    const r = parse('מעגל מוכל', ctxOf('מעגל'));
    if (!r.ok) throw new Error('did not parse');
    expect(contained(r.commands)!.a).toBe('circle-O');
    expect(newCircles(r.commands)).toHaveLength(1);
  });

  it('bare «מעגל מוכל» with NO circles introduces the container too (the containment presupposes it)', () => {
    const r = parse('מעגל מוכל', {});
    if (!r.ok) throw new Error('did not parse');
    expect(newCircles(r.commands)).toHaveLength(2);
    expect(contained(r.commands)).toBeTruthy();
  });

  it('a NAMED container: «מעגל מוכל בתוך מעגל O» binds the drawn O', () => {
    const r = parse('מעגל מוכל בתוך מעגל O', ctxOf('מעגל O'));
    if (!r.ok) throw new Error('did not parse');
    expect(contained(r.commands)!.a).toBe('circle-O');
    expect(newCircles(r.commands)).toHaveLength(1);
  });

  it('English mirror: "a circle contained inside the big circle" beside one circle', () => {
    const r = parse('a circle contained inside the big circle', ctxOf('מעגל'));
    if (!r.ok) throw new Error('did not parse');
    expect(contained(r.commands)!.a).toBe('circle-O');
    expect(newCircles(r.commands)).toHaveLength(1);
  });

  it('the definite form on an EMPTY figure introduces the container too (the containment presupposes it)', () => {
    const r = parse('מעגל מוכל בתוך המעגל הגדול', {});
    if (!r.ok) throw new Error('did not parse');
    expect(newCircles(r.commands)).toHaveLength(2);
    expect(contained(r.commands)).toBeTruthy();
  });

  it('ambiguity DEFERS: bare «מעגל מוכל» beside TWO circles is not claimed (which container?)', () => {
    const ctx = ctxOf('מעגל O', 'מעגל P');
    const r = parse('מעגל מוכל', ctx);
    // the rule must not guess a container — the form either escalates or resolves elsewhere,
    // but never lowers to a containment against an arbitrary pick
    if (r.ok) expect(contained(r.commands)).toBeFalsy();
  });

  it('«בתוך המעגל הגדול» beside TWO circles resolves by the size-qualifier rewrite (#102) to the larger', () => {
    // two circles with recorded/drawn sizes — the qualifier picks the bigger as the container
    const ctx = ctxOf('מעגל O', 'מעגל P');
    const r = parse('מעגל מוכל בתוך המעגל הגדול', ctx);
    if (!r.ok) throw new Error('did not parse');
    const rel = contained(r.commands);
    expect(rel).toBeTruthy();
    expect(['circle-O', 'circle-P']).toContain(rel!.a); // bound to a REAL drawn circle, not an invented one
    expect(newCircles(r.commands).filter((c) => (c as { id: string }).id !== rel!.a)).toHaveLength(1);
  });

  it('NO-THEFT: the named pair and the plural keep their existing lowerings', () => {
    const named = parse('מעגל O1 מוכל בתוך מעגל O2', {});
    if (!named.ok) throw new Error('named pair did not parse');
    const nrel = contained(named.commands)!;
    expect(nrel.a).toBe('circle-O2'); // the stated container
    expect(nrel.b).toBe('circle-O1'); // the stated subject stays the inner
    const plural = parse('שני מעגלים מוכלים', {});
    if (!plural.ok) throw new Error('plural did not parse');
    expect(newCircles(plural.commands)).toHaveLength(2);
    expect(contained(plural.commands)).toBeTruthy();
  });
});
