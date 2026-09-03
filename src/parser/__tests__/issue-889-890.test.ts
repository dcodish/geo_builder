/**
 * #889 and #890 — two honesty defects found play-verifying #461, one in it and one older.
 *
 * **#889 — one message answering two different questions.** #461's shape-plus-construct ask reused
 * #519's `ambiguous-shape`, whose template hardcodes «צורות», «בשרטוט» and the literal word
 * «אלכסוני» before the example. Those are the vocabulary of a DIFFERENT question:
 *
 * | | #519 `ambiguousShapeAsk` | #461 `shapeWithConstruct` |
 * | --- | --- | --- |
 * | asks | which of these EXISTING SHAPES? | which VARIANT of this construct? |
 * | candidates | polygons on the figure | constructs that do not exist yet |
 * | the answer | the construct re-aimed: «אלכסוני ABCD» | the candidate itself: «גובה מ-A» |
 *
 * Shared, it emitted «אלכסוני גובה מ-⁧A⁩» — not a sentence in any language — and told an English
 * speaker to type «גובה מ-A». [docs/10 §5 guideline 8](../../../docs/10-pedagogy.md): a refusal
 * teaches the REASON, and two different reasons read as two different sentences.
 *
 * The ask and its answer are one question, so the rule owns both halves: «מרובע ABCD עם אלכסון AC»
 * — the candidate typed back into the sentence it was asked about — must BUILD. An ask whose own
 * example does not parse is a dead end.
 *
 * **#890 — the stated shape vanished.** «טרפז ABCD שהאלכסונים שלו נחתכים בנקודה M» parsed to ONE
 * `line-line-intersection` referencing A, B, C, D. No trapezoid: the honesty invariant *no stated
 * object is ever silently dropped*, broken outright — and the student was then told «הצעד הזה
 * מסתמך על M שעדיין לא הוגדרו», blamed for `M`, the one thing they had got right. Pre-existing, not
 * a #461 regression: `compoundSuchThat` is byte-identical to `prod/2026-09-02-2` and the #461
 * splitter requires «עם», which this sentence does not contain.
 *
 * `specialPointMeet` read the ring out of the sentence's own «טרפז ABCD» and emitted the crossing
 * over it without ever building it. The catalog's own example — "G is the intersection of the
 * diagonals of quadrilateral ABCD" — has shipped that way for as long as the coverage tests have
 * asserted `.ok` and never that the line DRAWS. It did not: zero points.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, ctxOf } from '../../__tests__/scenario-pipeline';
import { parse } from '..';
import { replay } from '../../store/geoStore';
import he from '../../i18n/locales/he.json';
import en from '../../i18n/locales/en.json';

const fresh = () => ctxOf(factsOf([]));
const p = (line: string) => parse(line, fresh());

describe('#889 — the construct ask is its own question', () => {
  it("does NOT borrow #519's shape reason", () => {
    const r = p('מרובע ABCD עם אלכסון');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-construct');
  });

  it("#519's own ask is untouched — the two reasons stay two", () => {
    const r = parse('האלכסונים נחתכים', ctxOf(factsOf(['טרפז ABCD', 'טרפז EFGH'])));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-shape');
  });

  it('both messages exist in both locales, and neither is the other', () => {
    for (const loc of [he, en] as unknown as { input: Record<string, string> }[]) {
      expect(loc.input.ambiguousConstruct).toBeTruthy();
      expect(loc.input.ambiguousShape).toBeTruthy();
      expect(loc.input.ambiguousConstruct).not.toBe(loc.input.ambiguousShape);
    }
  });

  it('the construct message hardcodes NO construct word — that was the «אלכסוני גובה מ-A» bug', () => {
    for (const loc of [he, en] as unknown as { input: Record<string, string> }[]) {
      expect(loc.input.ambiguousConstruct).not.toMatch(/אלכסון/);
      expect(loc.input.ambiguousConstruct).not.toMatch(/diagonal/i);
    }
  });

  it('its placeholders are the ones the pipeline supplies', () => {
    for (const loc of [he, en] as unknown as { input: Record<string, string> }[]) {
      for (const k of ['noun', 'options', 'first']) {
        expect(loc.input.ambiguousConstruct, k).toContain(`{{${k}}}`);
      }
    }
  });

  describe('the ask quotes answers that actually parse', () => {
    it.each([
      ['מרובע ABCD עם אלכסון', 'מרובע ABCD עם '],
      ['ריבוע ABCD עם אלכסון', 'ריבוע ABCD עם '],
      ['quadrilateral ABCD with diagonal', 'quadrilateral ABCD with '],
    ])('«%s» — every option, put back in the sentence, builds', (line, prefix) => {
      const r = p(line);
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'ambiguous-construct') {
        expect(r.options.length).toBeGreaterThan(1);
        for (const opt of r.options) expect(p(prefix + opt).ok, prefix + opt).toBe(true);
      } else {
        expect.fail(`expected ambiguous-construct, got ${!r.ok ? r.reason : 'ok'}`);
      }
    });
  });

  describe('the named diagonal builds — in the sentence it was asked about', () => {
    it.each([
      ['מרובע ABCD עם אלכסון AC', 'A', 'C'],
      ['מרובע ABCD עם אלכסון BD', 'B', 'D'],
      ['rectangle ABCD with diagonal AC', 'A', 'C'],
    ])('«%s»', (line, a, b) => {
      const r = p(line);
      expect(r.ok, line).toBe(true);
      if (r.ok) {
        expect(r.commands.map((c) => c.type)).toEqual([expect.any(String), 'segment']);
        expect(r.commands[1]).toMatchObject({ type: 'segment', a, b });
      }
    });

    it('it draws — the figure is real, not just a parse', () => {
      const d = replay(factsOf(['מרובע ABCD עם אלכסון AC']), 0);
      expect(Object.values(d.status).every((v) => v === 'ok')).toBe(true);
    });

    /**
     * ADJACENT vertices are a SIDE. Drawing AB and calling it the diagonal would answer the question
     * with something the student did not ask for — the ADR-052 guess, arriving through the answer
     * lane instead of the ask lane.
     */
    it.each(['מרובע ABCD עם אלכסון AB', 'מרובע ABCD עם אלכסון AD', 'מרובע ABCD עם אלכסון AX'])(
      '«%s» is not a diagonal and does not build',
      (line) => {
        expect(p(line).ok).toBe(false);
      },
    );
  });
});

describe('#890 — a STATED shape materialises', () => {
  it.each([
    ['טרפז ABCD שהאלכסונים שלו נחתכים בנקודה M', 'trapezoid'],
    ['מלבן ABCD שהאלכסונים שלו נחתכים בנקודה M', 'rectangle'],
    ['טרפז ABCD שאלכסוניו נחתכים בנקודה M', 'trapezoid'],
    ['מרובע ABCD שהאלכסונים נחתכים בנקודה M', 'quadrilateral'],
    ['G is the intersection of the diagonals of quadrilateral ABCD', 'quadrilateral'],
  ])('«%s» builds the shape, not a headless crossing', (line, shape) => {
    const r = p(line);
    expect(r.ok, line).toBe(true);
    if (r.ok) {
      expect(r.commands[0].type, 'the stated shape comes FIRST').toBe(shape);
      expect(r.commands.map((c) => c.type)).toContain('line-line-intersection');
    }
  });

  it.each([
    'טרפז ABCD שהאלכסונים שלו נחתכים בנקודה M',
    'מרובע ABCD שהאלכסונים נחתכים בנקודה M',
    'G is the intersection of the diagonals of quadrilateral ABCD',
    'משולש ABC שהתיכונים שלו נחתכים בנקודה M',
    'משולש ABC שהגבהים שלו נחתכים בנקודה H',
  ])('«%s» DRAWS — every status ok, the vertices resolve', (line) => {
    const d = replay(factsOf([line]), 0);
    expect(Object.entries(d.status).filter(([, v]) => v !== 'ok'), line).toEqual([]);
    expect(d.positions.size).toBeGreaterThanOrEqual(5);
  });

  /**
   * The catalog is the user-facing reference AND the coverage map, and this example has been in it,
   * green, for as long as the coverage test has asserted `.ok` — which it does without ever asking
   * whether the line DRAWS. It did not: zero points, «unresolved dependencies for: G».
   */
  it("the catalog's own example is not just parseable — it draws", () => {
    const d = replay(factsOf(['G is the intersection of the diagonals of quadrilateral ABCD']), 0);
    expect(Object.values(d.status).every((v) => v === 'ok')).toBe(true);
    expect(d.positions.size, 'four vertices and the crossing').toBe(5);
  });

  describe('what materialising deliberately does NOT reach', () => {
    /**
     * TWO shape nouns and only one declared: «אלכסוני הריבוע» names a square that does not exist
     * beside a trapezoid that does. Materialising here would bind the trapezoid's crossing under the
     * square's name — the #770 P1 honesty class. One noun, or this rule does not decide.
     */
    it('a second, undeclared kind noun still refuses by name (#770)', () => {
      const r = p('טרפז ABCD, אלכסוני הריבוע נפגשים בנקודה M');
      if (r.ok) {
        expect(r.commands.find((c) => c.type === 'line-line-intersection')).toBeUndefined();
      }
    });

    it('a shape ALREADY on the figure is not re-declared', () => {
      const r = parse('מפגש התיכונים במשולש ABC', ctxOf(factsOf(['משולש ABC'])));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type)).not.toContain('triangle');
    });

    it('and the run-only form, which states no shape, declares nothing', () => {
      const r = parse('אלכסוני ABCD נחתכים בנקודה M', ctxOf(factsOf(['ריבוע ABCD'])));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['line-line-intersection']);
    });
  });
});
