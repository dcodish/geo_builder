/**
 * #779 (P1) — lowercase labels defeated the dropped-given honesty gates.
 *
 * The parser's captures accept `[A-Za-z]` and upper-case on the way in, while every label-counting
 * gate extracted `[A-Z]` — so «מרכזו o. שתי נקודות על המעגל a ו b» committed GREEN with the two
 * stated points gone, while its uppercase twin correctly escalated (prod session `qouua77n`). Three
 * independent repairs, locked here:
 *
 *  1. GATE LAYER — `droppedNewLabels` + the accountant see stated labels case-blind (script-scoped:
 *     in Hebrew text every standalone Latin run is notation; Latin-only text keeps the uppercase
 *     read so English words never read as labels).
 *  2. CONVENTION — a parse that READ a lowercase label refuses and teaches the uppercase form
 *     (`lowercaseLabelFold`, the 3-D `scope:lowercase-labels` mirror at the commit seams), and a
 *     FAILED parse whose upper-cased candidate parses gets the same nudge (`upperCasedLabelCandidate`).
 *  3. COMPOUND AUDIT — the circle rule's DEFINITION path (centre/radius named) now asks the ADR-024
 *     leftover question before claiming; «מרכזו O. <second clause>» no longer lowers to a bare circle.
 *
 * Plus the catalog-wide property that keeps the asymmetry from ever returning: no supported catalog
 * line's lowercased variant can silently commit — it either fails to parse, trips a case-blind gate,
 * or lands in the convention nudge.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMAND_CATALOG,
  buildParseCtx,
  droppedNewLabels,
  introducedNewLabels,
  lowercaseLabelFold,
  lowercaseMeasureLetters,
  normalizeUtterance,
  parse,
  statedLabelTokens,
  upperCasedLabelCandidate,
} from '@/parser';
import { unaccountedSpans } from '@/parser/spanAccounting';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Id } from '@/engine';

function ctxAfter(utterances: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const fig = replay(facts);
    const ctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse(u, ctx);
    if (!r.ok) throw new Error(`prefix did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `f${g++}`, utterance: u, cmd: cmd as AnyCommand, enabled: true });
  }
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}

describe('#779 part 1 — the gate layer is case-blind', () => {
  it('the reported compound: lowercase and uppercase twins produce the IDENTICAL gate verdict', () => {
    const ctx = ctxAfter(['נתון מעגל שרדיוסו r']);
    const pts = ctx.points ?? [];
    const syms = (ctx.radiusSymbols ?? []).map((x) => x.name);
    const verdicts = ['מרכזו o. שתי נקודות על המעגל a ו b', 'מרכזו O. שתי נקודות על המעגל A ו B'].map((u) => {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return { dropped: [] as Id[], spans: [] as string[] };
      return {
        dropped: droppedNewLabels(u, r.commands, pts, syms).sort(),
        spans: unaccountedSpans(u, r.commands, { existingPoints: pts, radiusSymbols: syms })
          .filter((x) => x.kind === 'label')
          .map((x) => x.text)
          .sort(),
      };
    });
    // The P1's exact mechanism: the lowercase twin must flag A and B exactly as the uppercase one does.
    expect(verdicts[0].dropped, 'droppedNewLabels, lowercase').toEqual(['A', 'B']);
    expect(verdicts[0]).toEqual(verdicts[1]);
  });

  it('a lowercase measure letter is NOT a dropped label — the binding utterance and the bound reuse stay clean', () => {
    const empty = buildParseCtx(replay([]).construction, replay([]).positions);
    const r = parse('נתון מעגל שרדיוסו r', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(droppedNewLabels('נתון מעגל שרדיוסו r', r.commands, [])).toEqual([]);
    expect(unaccountedSpans('נתון מעגל שרדיוסו r', r.commands, {}).filter((x) => x.kind === 'label')).toEqual([]);
    expect(lowercaseLabelFold('נתון מעגל שרדיוסו r', r.commands), 'the case-preserving measure never nudges').toBeNull();
  });

  it('a lowercase-stated label the LLM echoes uppercase is stated, not invented; a real invention still flags', () => {
    expect(introducedNewLabels('שתי נקודות על המעגל a ו b', ['שתי נקודות על המעגל A ו B'], ['O'])).toEqual([]);
    expect(introducedNewLabels('שתי נקודות על המעגל a ו b', ['M אמצע AB', 'שתי נקודות על המעגל A ו B'], ['O'])).toEqual(['M']);
  });

  it('script scope: Hebrew singles are notation; English words never read as labels', () => {
    expect(statedLabelTokens(normalizeUtterance('שתי נקודות על המעגל a ו b')).sort()).toEqual(['A', 'B']);
    expect(statedLabelTokens(normalizeUtterance('משולש abc')).sort()).toEqual(['A', 'B', 'C']);
    // Latin-only: lowercase words (articles included) are words — only uppercase states a label.
    expect(statedLabelTokens(normalizeUtterance('a point on the circle'))).toEqual([]);
    expect(statedLabelTokens(normalizeUtterance('a point D on AB')).sort()).toEqual(['A', 'B', 'D']);
    // unit tokens are not labels even in Hebrew text
    expect(statedLabelTokens(normalizeUtterance('אורך הצלע 5 cm'))).toEqual([]);
  });
});

describe('#779 part 2 — the convention nudge (teach, never silently rewrite)', () => {
  const empty = () => buildParseCtx(replay([]).construction, replay([]).positions);

  it.each([
    ['משולש abc', 'משולש ABC'],
    ['triangle abc', 'triangle ABC'],
  ])('a folded parse of «%s» nudges with the corrected sentence', (u, corrected) => {
    const r = parse(u, empty());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fold = lowercaseLabelFold(u, r.commands);
    expect(fold).not.toBeNull();
    expect(fold!.corrected).toBe(corrected);
  });

  it('the reported compound nudges with the WHOLE line corrected — dropped-clause letters included', () => {
    const ctx = ctxAfter(['נתון מעגל שרדיוסו r']);
    const u = 'מרכזו o. שתי נקודות על המעגל a ו b';
    const r = parse(u, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fold = lowercaseLabelFold(u, r.commands);
    expect(fold).not.toBeNull();
    expect(fold!.corrected).toBe('מרכזו O. שתי נקודות על המעגל A ו B');
  });

  it('an English article never triggers the nudge; English lowercase labels correct in full', () => {
    const tri = ctxAfter(['משולש ABC']);
    const ok = parse('a point D on AB', tri);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(lowercaseLabelFold('a point D on AB', ok.commands)).toBeNull();
    const circ = ctxAfter(['מעגל O']);
    const low = parse('points a and b on the circle', circ);
    expect(low.ok).toBe(true);
    if (low.ok) {
      const fold = lowercaseLabelFold('points a and b on the circle', low.commands);
      expect(fold).not.toBeNull();
      expect(fold!.corrected).toBe('points A and B on the circle');
    }
  });

  it('the FAILED-parse candidate is proof-based: it lifts what would parse and stays null on prose', () => {
    expect(upperCasedLabelCandidate('משולש abc')).toBe('משולש ABC');
    // pure English prose: filler + >4-letter words lift nothing
    expect(upperCasedLabelCandidate('a point on the circle')).toBeNull();
  });

  it('the corrected sentence is the RAW text, case aside — normalization folds never leak into it', () => {
    // «עיגול» normalizes to «מעגל» for the rules; the suggestion must keep the student's own word.
    const r = parse('עיגול שמרכזו o', ctxAfter([]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fold = lowercaseLabelFold('עיגול שמרכזו o', r.commands);
    expect(fold).not.toBeNull();
    expect(fold!.corrected).toBe('עיגול שמרכזו O');
  });

  it('a bound lowercase measure letter is reported for the acceptance NOTE (never a refusal)', () => {
    const r = parse('נתון מעגל שרדיוסו r', ctxAfter([]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lowercaseMeasureLetters(r.commands)).toEqual(['r']);
    // the uppercase binding says nothing
    const R = parse('נתון מעגל שרדיוסו R', ctxAfter([]));
    if (R.ok) expect(lowercaseMeasureLetters(R.commands)).toEqual([]);
  });
});

describe('#779 part 3 — the circle rule DEFINITION path asks the leftover question', () => {
  const empty = () => buildParseCtx(replay([]).construction, replay([]).positions);

  it('«מרכזו O. <second clause>» never lowers to a circle command again', () => {
    const ctx = ctxAfter(['נתון מעגל שרדיוסו r']);
    for (const u of ['מרכזו O. שתי נקודות על המעגל A ו B', 'מרכזו o. שתי נקודות על המעגל a ו b']) {
      const r = parse(u, ctx);
      if (r.ok) expect(r.commands.map((c) => c.type), u).not.toContain('circle');
    }
  });

  it.each([
    'מעגל שמרכזו O',
    'מעגל שמרכזו בנקודה O',
    'מעגל שמרכזו O ורדיוסו 5',
    'מעגל שרדיוסו R ומרכזו O',
    'מעגל עם מרכז O',
    'נתון מעגל',
    'circle centered at O radius 5',
  ])('the supported definition form «%s» still parses to a circle', (u) => {
    const r = parse(u, empty());
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circle-through'), u).toBe(true);
  });

  it('«מעגל קטן שמרכזו P» beside an existing circle still parses (the size adjective survives the guard)', () => {
    const r = parse('מעגל קטן שמרכזו P', ctxAfter(['מעגל שמרכזו O']));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle')).toBe(true);
  });
});

describe('#779 — the qouua77n sequence never commits silently (pipeline-faithful)', () => {
  // Mirrors the submit pipeline's order exactly: parse → convention nudge → gate battery → commit.
  type Verdict = 'commit' | 'nudge' | 'escalate' | 'not-handled';
  const classify = (u: string, ctx: ReturnType<typeof buildParseCtx>): Verdict => {
    const r = parse(u, ctx);
    if (!r.ok) return 'not-handled';
    if (lowercaseLabelFold(u, r.commands)) return 'nudge';
    const pts = ctx.points ?? [];
    const syms = (ctx.radiusSymbols ?? []).map((x) => x.name);
    const dropped = [
      ...droppedNewLabels(u, r.commands, pts, syms),
      ...unaccountedSpans(u, r.commands, { existingPoints: pts, radiusSymbols: syms }).map((x) => x.text),
    ];
    return dropped.length ? 'escalate' : 'commit';
  };

  it('the lowercase compound NUDGES (never the green ✓ commit prod logged); the uppercase twin escalates', () => {
    const ctx = ctxAfter(['נתון מעגל שרדיוסו r']);
    expect(classify('מרכזו o. שתי נקודות על המעגל a ו b', ctx)).toBe('nudge');
    expect(classify('מרכזו O. שתי נקודות על המעגל A ו B', ctx)).toBe('escalate');
  });
});

describe('#779 — catalog-wide property: a lowercased variant can never silently commit', () => {
  const CTX = { circles: ['O'], points: ['O'] as Id[] };
  const cases = COMMAND_CATALOG.filter((c) => c.supported).flatMap((c) => [c.he, c.en]);

  it('every supported example, lowercased, either fails, trips a case-blind gate, or lands in the nudge', () => {
    const failures: string[] = [];
    for (const ex of cases) {
      const stated = statedLabelTokens(normalizeUtterance(ex));
      if (stated.length === 0) continue; // no labels — the variant is the same sentence
      const low = ex.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
      // Latin-only lines whose EVERY label lowercases to an English function word are undecidable at
      // token level (the article "a") — the documented boundary; Hebrew lines have no such carve-out.
      if (!/[א-ת]/.test(ex) && stated.every((l) => ['A', 'I'].includes(l.replace(/\d+/g, '')))) continue;
      const r = parse(low, CTX as never);
      if (!r.ok) continue; // an honest refusal/escalation — never a silent commit
      const fold = lowercaseLabelFold(low, r.commands);
      const dropped = droppedNewLabels(low, r.commands, CTX.points);
      const spans = unaccountedSpans(low, r.commands, { existingPoints: CTX.points });
      if (!fold && dropped.length === 0 && spans.length === 0) failures.push(`«${low}» (from «${ex}») parses clean with no nudge`);
    }
    expect(failures, `lowercased variants that would silently commit:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('the net is not vacuous — it sweeps the real catalog', () => {
    expect(cases.length).toBeGreaterThan(200);
  });
});
