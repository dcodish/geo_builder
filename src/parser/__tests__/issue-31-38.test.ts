/**
 * Issues #31 + #38 / ADR-283 — the ב CONTAINER MARKER governs over the חוסם/חסום verb letter.
 *
 * Operator prod report (session `jsptarcl`, 2026-07-11): the first step «משולש ABC חוסם במעגל»
 * (intent: the inscribed triangle — חוסם is the classic one-letter slip for חסום) was claimed by the
 * `incircle` rule's circumscribes branch and silently built the INCIRCLE DUAL (bisectors, incentre,
 * auto-named tangency feet) with every row ✓; the follow-up «BC קוטר» is geometrically impossible on
 * an incircle and everything downstream inherited the wrong figure.
 *
 * The class: the inscription DIRECTION was read from the verb letter alone, ignoring the ב container
 * marker that ADR-245 made authoritative. «חוסם במעגל» is self-contradictory as written (the verb says
 * the polygon contains the circle, the ב says the circle contains the polygon) and ungrammatical Hebrew
 * (circumscribing takes a direct object: חוסם **את** המעגל) — the ב-form only ever occurs as the slip.
 * Fix at the one boundary every rule reads (`normalizeInscriptionSlip` inside `normalizeUtterance`,
 * the עיגול→מעגל precedent): an active חוסם-family verb directly governing a ב-marked container noun
 * rewrites to the passive — the marker wins, deterministically, for every rule at once.
 *
 * The buildable half (the operator's exact sequence) is locked by scenario
 * `hosem-slip-container-marker-wins`.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { normalizeUtterance } from '@/parser/parse';

const types = (u: string): string[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`did not parse: ${u} (${(r as { reason?: string }).reason})`);
  return r.commands.map((c) => c.type);
};

describe('issues #31/#38 — normalizeInscriptionSlip: the ב container marker wins over the verb letter', () => {
  it('rewrites the active verb to the passive when it governs a ב-marked container noun', () => {
    expect(normalizeUtterance('משולש ABC חוסם במעגל')).toBe('משולש ABC חסום במעגל');
    expect(normalizeUtterance('מעגל חוסם במשולש ABC')).toBe('מעגל חסום במשולש ABC');
    // Feminine/plural forms map to their passive counterparts.
    expect(normalizeUtterance('מקבילית ABCD חוסמת במעגל')).toBe('מקבילית ABCD חסומה במעגל');
    expect(normalizeUtterance('משולשים חוסמים במעגל')).toBe('משולשים חסומים במעגל');
    // The English twin: "circumscribed in" carries the container marker — inscribed.
    expect(normalizeUtterance('triangle ABC circumscribed in a circle')).toBe('triangle ABC inscribed in a circle');
  });

  it('leaves genuine circumscribes statements untouched (direct object / bare — no conflicting marker)', () => {
    expect(normalizeUtterance('משולש DEF חוסם את המעגל')).toBe('משולש DEF חוסם את המעגל');
    expect(normalizeUtterance('משולש DEF חוסם מעגל')).toBe('משולש DEF חוסם מעגל');
    expect(normalizeUtterance('משולש DEF חוסם את המעגל O')).toBe('משולש DEF חוסם את המעגל O');
    expect(normalizeUtterance('triangle DEF circumscribes the circle')).toBe('triangle DEF circumscribes the circle');
    // The passive is already the passive.
    expect(normalizeUtterance('משולש ABC חסום במעגל')).toBe('משולש ABC חסום במעגל');
  });

  it('the slip parses to the INSCRIBED build (circumcircle), not the incircle dual', () => {
    const slip = types('משולש ABC חוסם במעגל');
    expect(slip).toContain('circle');
    expect(slip).toContain('point-on-circle'); // the vertices ride the circle — inscribed
    expect(slip).toContain('triangle');
    expect(slip).not.toContain('bisector'); // the incircle decomposition's fingerprint
    // Same for the English twin.
    expect(types('triangle ABC circumscribed in a circle')).toEqual(slip);
  });

  it('a genuine circumscribes statement still builds the incircle dual', () => {
    const inc = types('משולש DEF חוסם את המעגל');
    expect(inc).toContain('bisector');
    expect(inc).toContain('circle-through');
    expect(inc).not.toContain('point-on-circle');
    // The circle-first slip resolves by the marker too: the TRIANGLE is the container → incircle.
    expect(types('מעגל חוסם במשולש ABC')).toEqual(types('מעגל חסום במשולש ABC'));
  });
});
