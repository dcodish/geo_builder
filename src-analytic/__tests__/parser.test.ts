/**
 * The parser's contract, and the catalog's guard.
 *
 * The guard is the important half: `catalogAnalytic.ts` is simultaneously the reference, the
 * coverage map and the LLM's allowed vocabulary (ADR-AG-005 D8), so an entry that stops parsing
 * must fail the suite rather than quietly become documentation — and the model must never be
 * taught to emit a line the re-parse would refuse.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { parseLine } from '../parser/parseAnalytic';
import { fold } from '../engine/apply';
import { evaluate } from '../engine/evaluate';

describe('catalog — every entry parses, in BOTH languages', () => {
  for (const entry of COMMAND_CATALOG_ANALYTIC) {
    it(`${entry.family} · ${entry.he}`, () => {
      const he = parseLine(entry.he);
      const en = parseLine(entry.en);
      expect(he.ok, `He did not parse: ${entry.he}`).toBe(true);
      expect(en.ok, `En did not parse: ${entry.en}`).toBe(true);
      if (he.ok && en.ok) {
        // The two languages must lower to the SAME fact kinds — a catalog row whose halves mean
        // different things is a drift the panel would advertise as one command.
        expect(he.facts.map((f) => f.t)).toEqual(en.facts.map((f) => f.t));
      }
    });
  }
});

describe('parser — the corpus phrasings', () => {
  it('reads a point with and without its subject noun', () => {
    for (const s of ['נתונה הנקודה A(2,6)', 'הנקודה A(2,6)', 'נקודה A(2,6)', 'A(2,6)']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
      if (r.ok) {
        expect(r.facts).toHaveLength(1);
        expect(r.facts[0].t).toBe('point');
      }
    }
  });

  it('reads several points from one line, the way the exam lists them', () => {
    const r = parseLine('נתונות הנקודות A(0,24), B(18,0)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.map((f) => (f.t === 'point' ? f.id : ''))).toEqual(['A', 'B']);
  });

  it('reads a parameter inside a coordinate', () => {
    const r = parseLine('A(-9a,0)');
    expect(r.ok).toBe(true);
  });

  it('reads a line named ℓ1 — typed, and in its typeset form', () => {
    for (const s of ['נתון הישר l1: 4y-3x-20=0', 'נתון הישר ℓ1: 4y-3x-20=0']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
      if (r.ok && r.facts[0].t === 'curve') expect(r.facts[0].curve.kind).toBe('line');
    }
  });

  it('reads a vertical line and a diagonal one', () => {
    for (const s of ['הישר x=-4', 'הישר y=x']) {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
    }
  });

  it('names circles by their Roman numeral, the corpus s own device', () => {
    const one = parseLine('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9');
    const two = parseLine('נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1');
    expect(one.ok && two.ok).toBe(true);
    if (one.ok && two.ok) {
      expect(one.facts[0].t === 'curve' && one.facts[0].id).toBe('circle-I');
      expect(two.facts[0].t === 'curve' && two.facts[0].id).toBe('circle-II');
    }
  });

  it('gives an unnamed object an id derived from its own equation, so restating it is idempotent', () => {
    const a = parseLine('הישר y=2x+1');
    const b = parseLine('הישר y = 2x + 1');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok && a.facts[0].t === 'curve' && b.facts[0].t === 'curve') {
      expect(a.facts[0].id).toBe(b.facts[0].id);
    }
  });

  it('returns not-handled for input no rule matched — the LLM escalation seam', () => {
    const r = parseLine('משהו שאף כלל לא מכיר');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-handled');
  });

  it('refuses a matched sentence whose equation is malformed, rather than dropping it', () => {
    const r = parseLine('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-equation');
  });

  it('does not half-read a point line that says more than it can lower', () => {
    const r = parseLine('נתונה הנקודה A(2,6) הנמצאת על האליפסה');
    expect(r.ok).toBe(false); // F2 incidence is a later family — never a silent drop of the rest
  });
});

describe('end to end — a figure builds from typed lines', () => {
  it('draws two circles and a line together', () => {
    const src = [
      'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
      'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1',
      'נתון הישר l1: y=x',
      'A(2,6)',
    ];
    const facts = src.flatMap((s) => {
      const r = parseLine(s);
      if (!r.ok) throw new Error(`${s}: ${r.code}`);
      return r.facts;
    });
    const { construction, errors } = fold(facts);
    expect(errors.every((e) => e === null)).toBe(true);
    const fig = evaluate(construction, 0);
    expect(fig.curves).toHaveLength(3);
    expect(fig.points).toHaveLength(1);
    expect(fig.vacant).toEqual([]);
    const circle = fig.curves.find((c) => c.id === 'circle-I');
    expect(circle?.curve.kind).toBe('circle');
    if (circle?.curve.kind === 'circle') expect(circle.curve.r).toBeCloseTo(3, 9);
  });
});
