/**
 * #461 — «מלבן ABCD עם אלכסונים» BUILDS: the shape-plus-construct family.
 *
 * [ADR-430](../../../docs/06-decisions.md#adr-430) added the MECHANISM — the dropped-construct gate
 * refuses rather than committing a bare rectangle with a green ✓ — and deliberately not the capability.
 * So the whole family escalated, and escalating is not support: it is unreliable and invisible to the
 * student (ADR-428). This is the deterministic build.
 *
 * Implemented as a SPLITTER rather than a shape×construct table, so the family cannot be
 * half-supported: the left half goes through the real grammar (every shape that lane reads), and the
 * right half is synthesized from the shape's own labels and parsed the same way.
 *
 * **Ambiguity refuses, it never guesses** (ADR-052) — the issue's own requirement. A bare «אלכסון» on a
 * quad is either diagonal and a bare «גובה» on a triangle is one of three, so those ASK, naming the
 * forms that would answer. The plural «אלכסונים» is unambiguous: it is both.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, ctxOf } from '../../__tests__/scenario-pipeline';
import { parse } from '..';
import { replay } from '../../store/geoStore';

const fresh = () => ctxOf(factsOf([]));
const p = (line: string) => parse(line, fresh());

describe('#461 — the shape and its construct in one line', () => {
  it.each([
    ['מלבן ABCD עם אלכסונים', 'rectangle'],
    ['ריבוע ABCD עם אלכסונים', 'square'],
    ['מרובע ABCD עם אלכסונים', 'quadrilateral'],
    ['טרפז ABCD עם אלכסונים', 'trapezoid'],
    ['rectangle ABCD with diagonals', 'rectangle'],
  ])('«%s» builds the shape AND the diagonals', (line, shape) => {
    const r = p(line);
    expect(r.ok, line).toBe(true);
    if (r.ok) {
      expect(r.commands.map((c) => c.type)).toEqual([shape, 'line-line-intersection']);
    }
  });

  it('the reported line draws a real figure — both diagonals, meeting', () => {
    const d = replay(factsOf(['מלבן ABCD עם אלכסונים']), 0);
    expect(Object.values(d.status).every((v) => v === 'ok')).toBe(true);
    expect(d.positions.size, 'four vertices plus the crossing').toBeGreaterThanOrEqual(5);
  });

  it('the SPLIT is what makes it a family — a shape the rule never heard of comes along', () => {
    // nothing about «דלתון» is written into the rule; it works because the left half is real grammar
    const r = p('דלתון ABCD עם אלכסונים');
    expect(r.ok).toBe(true);
  });

  describe('ambiguity asks, naming the forms that would answer', () => {
    it('a SINGLE diagonal on a quad — which one?', () => {
      const r = p('ריבוע ABCD עם אלכסון');
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'ambiguous-construct') {
        expect(r.options).toEqual(['אלכסון AC', 'אלכסון BD']);
      } else {
        expect.fail(`expected ambiguous-construct, got ${!r.ok ? r.reason : 'ok'}`);
      }
    });

    it.each([
      ['משולש ABC עם גובה', 'גובה'],
      ['משולש ABC עם תיכון', 'תיכון'],
      ['משולש ABC עם חוצה זווית', 'חוצה זווית'],
    ])('«%s» — one per vertex, so it names the three', (line, noun) => {
      const r = p(line);
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'ambiguous-construct') {
        expect(r.options).toEqual([`${noun} מ-A`, `${noun} מ-B`, `${noun} מ-C`]);
      } else {
        expect.fail(`expected ambiguous-construct, got ${!r.ok ? r.reason : 'ok'}`);
      }
    });

    it('an ENGLISH line is answered in English (#889) — it used to be handed «גובה מ-A»', () => {
      const r = p('triangle ABC with an altitude');
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'ambiguous-construct') {
        expect(r.options).toEqual(['altitude from A', 'altitude from B', 'altitude from C']);
      } else {
        expect.fail(`expected ambiguous-construct, got ${!r.ok ? r.reason : 'ok'}`);
      }
    });

    it('the question SURVIVES the dropped-noun gate — it used to be replaced by not-handled', () => {
      // ADR-430's gate saw an unconsumed «אלכסון» and overrode the clarify, sending a recognised
      // ambiguity to the LLM: the #516 class arriving through the gate rather than through a rule
      const r = p('ריבוע ABCD עם אלכסון');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).not.toBe('not-handled');
    });
  });

  describe('the gate and the neighbours are untouched', () => {
    it('a bare shape still builds exactly as before', () => {
      const r = p('מלבן ABCD');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['rectangle']);
    });

    it('«עם» in a line whose left half is NOT a shape is left alone', () => {
      // the splitter declines unless the left half DECLARES a shape (≥3 labels)
      const r = p('נקודה D על AB עם משהו');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['segment', 'point-on-segment']);
    });

    /**
     * Shape + GIVEN is a DIFFERENT question and stays out of scope. A generic "parse the right half
     * too" was tried and swallowed all of these, which a dozen locks (#497, phase4's misparse defence)
     * deliberately keep escalating. Deciding that silently, inside a diagonals feature, is exactly the
     * kind of quiet scope widening the never-patch rule is about.
     */
    it.each([
      'square ABCD with AB = 6',
      'kite ABCD with AB = 6',
      'triangle ABC with angle BAC = 37',
      'משולש ABC עם זווית BAC = 37',
      'square ABCD with point E on AB',
      'משולש ABC עם נקודה D על AB',
    ])('«%s» still escalates — shape + GIVEN is not this feature', (line) => {
      expect(p(line).ok).toBe(false);
    });

    it('a construct that names what it needs still builds', () => {
      const r = parse('גובה מ-A', ctxOf(factsOf(['משולש ABC'])));
      expect(r.ok).toBe(true);
    });
  });
});
