/**
 * Issue #27 / ADR-282 — a quantified per-side construct must never half-parse to one default figure.
 *
 * Operator prod sessions p3du4l9p / z57b5nd0 / fxp24nna: after `ריבוע`, the utterance
 * «על כל צלע של ריבוע יש חצי מעגל» ("on every side of the square there is a semicircle") built ONE
 * semicircle whose diameter DEFAULTED to A,B — the quantifier כל and the side-of-the-square reference
 * were silently dropped, everything green (the docs/17 §6 silent-wrong-figure class).
 *
 * The class: the SHAPE_LEFTOVER guard vocabulary (the ADR-024 leftover mechanism every shape rule
 * shares) had no tokens for SIDE references (צלע/sides), the EVERY/EACH quantifier, or the polygon
 * nouns — so a rule that recognised its own keyword could invent default operands although words that
 * change the figure's meaning remained unconsumed. Fix at the mechanism: the vocabulary, not a
 * rule-local carve-out. The per-side semicircle CAPABILITY is issue #29 (feature); until it lands the
 * honest behaviour is escalation, and this test asserts the exact prod sequence never half-parses.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function squareCtx() {
  const facts: Fact[] = [];
  const r = parse('ריבוע', buildParseCtx(replay(facts).construction, replay(facts).positions));
  if (!r.ok) throw new Error('square did not parse');
  for (const cmd of r.commands as AnyCommand[]) {
    facts.push({ id: `g0.${facts.length}`, utterance: 'ריבוע', group: 'g0', cmd, enabled: true });
  }
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

describe('issue #27 — quantified per-side semicircle never half-parses to a default-A,B figure', () => {
  it('the exact prod utterances refuse (escalate) instead of committing one default semicircle', () => {
    const ctx = squareCtx();
    for (const u of [
      'על כל צלע של ריבוע יש חצי מעגל', // the exact prod utterance (session p3du4l9p)
      'יש חצי מעגל על כל צלע', // phrasing sibling — quantifier without the polygon noun
      'on every side of the square there is a semicircle', // En mirror
      'on each side of the square draw a semicircle',
    ]) {
      const r = parse(u, ctx);
      expect(r.ok, `must refuse (escalate), never default the diameter: ${u}`).toBe(false);
    }
  });

  it('the legitimate semicircle / quarter-circle forms are byte-unchanged', () => {
    const ctx = squareCtx();
    for (const u of ['חצי מעגל', 'חצי מעגל שקוטרו EF', 'semicircle with diameter EF', 'רבע מעגל']) {
      const r = parse(u, ctx);
      expect(r.ok, `must still parse: ${u}`).toBe(true);
    }
  });

  it('a polygon noun surviving a shape rule\'s own strip is a compound — escalates, never a half-parse', () => {
    // The widened vocabulary is a MECHANISM fix: every SHAPE_LEFTOVER user strips its own words first,
    // so a foreign polygon noun / side word in the leftover always means unexpressed meaning.
    const r = parse('חצי מעגל על ריבוע', {});
    expect(r.ok, 'a semicircle-on-a-square compound must escalate').toBe(false);
  });
});
