/**
 * #1431 — «הנקודה» IS OPTIONAL IN THE DISTANCE GRAMMAR, ON BOTH SURFACES (ADR-AG-174).
 *
 * External review of prod: «המרחק של הנקודה A מהישר l1» was unreadable as an ask and not-handled
 * as a given, while the same sentence without «הנקודה» worked — the optional-subject-noun trap
 * (#1134/#1151's shape). One atom (`NOUN` in engine/lengths.ts) now carries the point nouns, so
 * the ask and the given read the same spelling by construction; the construct state «מרחק A מ-l1»
 * joins as a frame. The ruled contextual form («המרחק של הנקודה מהישר», no letters) answers
 * exactly when the figure holds one point and one line — by REWRITING into the lettered sentence,
 * so it can never drift from its synonym — and otherwise refuses naming the ambiguity.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

const fmt = (v: number) => `${Math.round(v * 100) / 100}`;
const FIGURE = ['נתון הישר l1: y=9', 'A(3,5)'];
const lines = (): string[] => {
  let out: string[] = [];
  for (const l of FIGURE) {
    const v = decideSubmit(l, out, 0);
    expect(v.kind, l).toBe('record');
    out = [...out, l];
  }
  return out;
};

describe('#1431 — every reported spelling, ask surface', () => {
  it.each([
    'המרחק של A מהישר l1',
    'המרחק של הנקודה A מהישר l1',
    'מרחק A מ-l1',
  ])('«%s» answers 4', (q) => {
    const a = ask(derive(lines(), 0), q, fmt);
    expect(a.unreadable, JSON.stringify(a)).toBeFalsy();
    expect(a.value).toBe('4');
  });
});

describe('#1431 — the given surface reads the same atom', () => {
  it.each([
    'המרחק של A מהישר l1 הוא 4',
    'המרחק של הנקודה A מהישר l1 הוא 4',
  ])('«%s» is accepted', (g) => {
    const v = decideSubmit(g, lines(), 0);
    expect(v.kind === 'record' || v.kind === 'already-known' || v.kind === 'already-follows', JSON.stringify(v)).toBe(true);
  });
});

describe('#1431 — the ruled contextual form', () => {
  it('one point and one line: «המרחק של הנקודה מהישר» answers through the lettered lane', () => {
    const a = ask(derive(lines(), 0), 'המרחק של הנקודה מהישר', fmt);
    expect(a.value).toBe('4');
    expect(a.trace, 'the rewrite reaches the ordinary lane — trace included').toBeTruthy();
  });

  it('two points: refused NAMING the ambiguity, never «לא הבנתי»', () => {
    const ls = [...lines()];
    const v = decideSubmit('B(7,1)', ls, 0);
    expect(v.kind).toBe('record');
    const a = ask(derive([...ls, 'B(7,1)'], 0), 'המרחק של הנקודה מהישר', fmt);
    expect(a.unreadable).toBeFalsy();
    expect(a.value).toBeNull();
    expect(a.contextual).toEqual({ points: 2, lines: 1 });
  });
});

describe('#1431 — neighbours unchanged', () => {
  it('«מרחק AB» (a bare pair after the noun) is NOT claimed by the construct frame', () => {
    // two points, no line — the construct frame requires the מ- join
    const ls = ['A(0,0)', 'B(3,4)'];
    const a = ask(derive(ls, 0), 'המרחק בין A ל-B', fmt);
    expect(a.value).toBe('5');
  });
});
