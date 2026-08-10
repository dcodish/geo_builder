/**
 * #506 — the «ן-» for «ו-» keyboard slip, normalised at the input seam.
 *
 * Final-nun sits beside vav, and the slip recurs across the 2026-08-10 triage INSIDE otherwise-real
 * constructions — «O - חיתוך של AC ן- DB», «הנקודות F ו- G הן אמצעי הקטעים BC ן- DO». Each occurrence
 * turns a mostly-parseable compound into a partial parse that the honesty gates (correctly) stop,
 * costing a paid LLM escalation on input whose intent is unambiguous.
 *
 * Safe because a STANDALONE final-nun is not a Hebrew word: in the connective position between two
 * label tokens it can only be the ו-connective mistyped. The normalization is POSITION-ANCHORED and
 * never global — final-nun legitimately ENDS words («סימון», «אלכסון», «הן»), and a global replace
 * would corrupt the vocabulary it is meant to rescue.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, buildParseCtx, droppedNewLabels, normalizeUtterance, parse } from '@/parser';
import { replay } from '@/store/geoStore';

describe('#506 — the connective slip', () => {
  it('the prod rows normalise to the ו-connective', () => {
    expect(normalizeUtterance('O - חיתוך של AC ן- DB')).toBe('O - חיתוך של AC ו- DB');
    expect(normalizeUtterance('הנקודות F ו- G הן אמצעי הקטעים BC ן- DO')).toBe('הנקודות F ו- G הן אמצעי הקטעים BC ו- DO');
  });

  it('a word ENDING in final-nun is untouched — the anchor is the whole safety argument', () => {
    for (const u of ['אלכסון ABCD', 'סימון', 'הן אמצעי הקטעים', 'המשולש שווה שוקיים ן']) {
      expect(normalizeUtterance(u), u).toContain(u.replace(/\s+$/, '').split(' ')[0]);
    }
    expect(normalizeUtterance('אלכסון ABCD')).toBe('אלכסון ABCD');
    expect(normalizeUtterance('סימון')).toBe('סימון');
    expect(normalizeUtterance('הן אמצעי')).toBe('הן אמצעי');
  });

  it('the reported row now lowers FULLY, with no dropped label (it used to escalate)', () => {
    const facts: Parameters<typeof replay>[0] = [];
    const step = (u: string) => {
      const fig = replay(facts);
      const r = parse(u, buildParseCtx(fig.construction, fig.positions));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      expect(droppedNewLabels(u, r.commands, fig.construction.objects.map((o) => o.id)), u).toEqual([]);
      for (const c of r.commands) facts.push({ id: `${facts.length}`, group: u, enabled: true, utterance: u, cmd: c });
    };
    step('מקבילית ABCD');
    step('O - חיתוך של AC ן- DB');
  });

  it('CATALOG-WIDE: no supported example changes under the normalization', () => {
    // The #140 net's method — the corpus is the proof that a position-anchored fold is safe, not an
    // argument about where final-nun can appear.
    const changed = COMMAND_CATALOG.filter((c) => c.supported)
      .flatMap((c) => [c.he, c.en])
      .filter((ex) => /ן/.test(ex) && normalizeUtterance(ex) !== normalizeUtterance(ex.replace(/ן/g, 'ן')));
    expect(changed).toEqual([]);
  });
});
