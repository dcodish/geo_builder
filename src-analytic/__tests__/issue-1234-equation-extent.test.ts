/**
 * #1236 + #1234 (ADR-AG-111) — the noun decides the object's EXTENT, and a bounded one draws only
 * the segment.
 *
 * Two halves of one sentence, neither observable without the other:
 *
 *  - **#1236, recognition.** `HE_LINE` was `ה?(?:ישר|אלכסון)` — a two-member list that decided
 *    whether a sentence was understood at all. «משוואת הצלע BD היא 4x+5y=0» was `not-handled` while
 *    «משוואת הישר BD …» worked, for one noun's difference. The list had already been fixed once, one
 *    member at a time (#1070 added «אלכסון»).
 *  - **#1234, semantics.** «משוואת CE היא x-3y=0» minted `line-CE` BESIDE the `seg-CE` the figure
 *    already held — one name, two drawn objects, `faults: []`.
 *
 * **Operator ruling, 2026-09-19:** *"משוואת הישר should draw the line. משוואת הצלע or הקטע should
 * draw a segment (in not yet draw)"* and, asked whether the infinite line still EXISTS behind a
 * bounded noun, *"only draws CE"*.
 *
 * The locks below are the ruling's own table, driven end to end through `derive`, plus the negative
 * control that an unknown noun still mints nothing.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { crossingsOf } from '../engine/crossings';

/** The operator's own figure, up to the line under test. */
const BASE = ['משולש ABC', 'BD תיכון לצלע AC', 'CE תיכון לצלע AB'];

type Shape = { drawn: string[]; carriers: string[]; segEnds: string[] };

const shapeOf = (seq: string[], seed = 0): Shape => {
  const { figure } = derive(seq, seed) as unknown as {
    figure: { curves: { id: string; stated: boolean }[]; segments: { ends: [string, string] }[] };
  };
  return {
    drawn: figure.curves.filter((c) => c.stated).map((c) => c.id),
    carriers: figure.curves.filter((c) => !c.stated).map((c) => c.id),
    segEnds: figure.segments.map((s) => [...s.ends].sort().join('')),
  };
};

describe('ADR-AG-111 — recognition: the noun is no longer a gate (#1236)', () => {
  it.each([
    ['ישר'], ['אלכסון'], ['צלע'], ['קטע'],
    ['תיכון'], ['גובה'], ['שוק'], ['בסיס'], ['יתר'],
  ])('«%s» is understood', (noun) => {
    expect(parseLine(`משוואת ה${noun} BD היא 4x+5y=0`).ok).toBe(true);
  });

  // THE NEGATIVE CONTROL. The registry is still a list, deliberately: an unknown noun must mint
  // nothing rather than have the tool guess at a word it does not know.
  it.each([['הפיל'], ['המחברת'], ['השולחן']])('an unknown noun «%s» stays not-handled', (noun) => {
    const r = parseLine(`משוואת ${noun} BD היא 4x+5y=0`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-handled');
  });

  // Every spelling of one extent produces the SAME object id, so two phrasings can never become two
  // objects for one line (the ADR-AG-023 identity rule).
  it('every noun naming the same line gives it the same id', () => {
    const idOf = (noun: string): string | undefined => {
      const r = parseLine(`משוואת ${noun} BD היא 4x+5y=0`);
      return r.ok ? (r.facts.find((f) => f.t === 'curve') as { id?: string } | undefined)?.id : undefined;
    };
    const ids = ['הישר', 'הצלע', 'הקטע', 'התיכון', ''].map(idOf);
    expect(new Set(ids)).toEqual(new Set(['line-BD']));
  });
});

describe('ADR-AG-111 — the noun decides the extent (#1234)', () => {
  /** The ruling's own table, end to end. */
  it('«משוואת הישר CE» draws the infinite line', () => {
    const s = shapeOf([...BASE, 'משוואת הישר CE היא x-3y=0']);
    expect(s.drawn).toContain('line-CE');
  });

  it('«משוואת הצלע CE» draws ONLY CE — the line is an undrawn carrier', () => {
    const s = shapeOf([...BASE, 'משוואת הצלע CE היא x-3y=0']);
    expect(s.drawn).toEqual([]);
    expect(s.carriers).toContain('line-CE');
    expect(s.segEnds).toContain('CE');
  });

  it('a bounded noun MINTS the segment when the figure has none — «in not yet draw»', () => {
    const s = shapeOf(['משוואת הצלע PQ היא x-3y=0']);
    expect(s.segEnds).toContain('PQ');
    expect(s.drawn).toEqual([]);
  });

  /**
   * THE REPORTED LINE. It carries no noun, so it takes the extent the object ALREADY has — the only
   * reading under which the operator's figure is actually fixed. Decided at the FOLD, because
   * `parseLine` takes no figure context and structurally cannot know whether `seg-CE` exists.
   */
  it('the bare form inherits an existing segment’s extent — no twin', () => {
    const s = shapeOf([...BASE, 'משוואת CE היא x-3y=0']);
    expect(s.drawn, 'no line is drawn beside the median that is already there').toEqual([]);
    expect(s.carriers).toContain('line-CE');
    expect(s.segEnds).toContain('CE');
  });

  it('the bare form still draws a line when the name holds nothing yet', () => {
    const s = shapeOf(['משוואת PQ היא x-3y=0']);
    expect(s.drawn).toContain('line-PQ');
    expect(s.segEnds).toEqual([]);
  });

  /**
   * THE SYMPTOM THAT OPENED #1234: the twin made 2 of every 3 crossing rings spurious. The reported
   * sequence must now offer exactly what the same figure WITHOUT the equation offers — asserted as a
   * comparison between the two figures, never as a hard-coded ring count, so the lock cannot go
   * green by matching a number that happens to be right today.
   */
  it('the reported sequence offers no more rings than the figure without the equation', () => {
    const rings = (seq: string[], seed: number): number => {
      const d = derive(seq, seed);
      return crossingsOf(d.figure, d.construction).length;
    };
    for (let seed = 0; seed < 8; seed += 1) {
      expect(rings([...BASE, 'משוואת CE היא x-3y=0'], seed)).toBe(rings(BASE, seed));
    }
  });
});
