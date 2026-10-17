/**
 * #2077 (ADR-3D-368) — A COMPONENT GIVEN IS PRINTED AS THE GIVEN IT IS.
 *
 * Operator, 2026-10-13: *"AB = (k-1,k,3) - shouldnt the data panel show this?"* «נתונים שנתתם» listed the
 * naming rows (`u = AB⃗`) and `vec-eq` relations only, never a vector VALUE the student stated, with a
 * letter or without one; and a point's free axis printed «?» where the student had written a letter.
 *
 * Ruling 2026-10-14 (card d14-2077-after, option B): *"the data panel holds the truth. so once k is known,
 * we use it."* A component prints as typed while a letter in it is open, and as its value once every letter
 * in it is known. Card d14-2077-point, option A: «A(1, t, 2)», like analytic.
 *
 * Measured at the student's entry point: `submit` → `derive3` → `dataView` (what App3 renders as is).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { parse3 } from '../parser/parse3';

const st = () => useGeo3.getState();
beforeEach(() => st().clear());

/** The panel after each line, every line asserted green. */
const panels = (lines: readonly string[]) =>
  lines.map((l) => {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
    const d = derive3(st().facts, st().seed);
    return dataView(d.construction, st().seed);
  });

const PYR = 'פירמידה משולשת ABCD';

describe('#2077 — the operator’s exact sequence (T47)', () => {
  it('the stated vector shows at once, as typed, and switches to values once k is known', () => {
    const [, afterGiven, afterK] = panels([PYR, 'AB = (k-1,k,3)', 'k = 2']);
    expect(afterGiven.stated).toEqual(['AB⃗ = (k-1, k, 3)']);
    expect(afterGiven.params.map((p) => p.text)).toEqual(['k = ?']);
    expect(afterK.stated).toEqual(['AB⃗ = (1, 2, 3)']);
    expect(afterK.params.map((p) => p.text)).toEqual(['k = 2']);
  });

  it('the row is seed-invariant (a given, not a measurement)', () => {
    panels([PYR, 'AB = (k-1,k,3)']);
    const c = derive3(st().facts, st().seed).construction;
    const rows = [0, 1, 7].map((seed) => dataView(c, seed).stated.join(' | '));
    expect(new Set(rows).size).toBe(1);
  });

  it('renders in the panel markup the way App3 renders a stated row', () => {
    const [, p] = panels([PYR, 'AB = (k-1,k,3)']);
    // App3's stated section: `<span className="font-medium"><MathRun>{r}</MathRun></span>`, MathRun = `<span dir="ltr">`
    const html = renderToStaticMarkup(
      createElement('span', { className: 'font-medium' }, createElement('span', { dir: 'ltr', className: 'inline-block' }, p.stated[0])),
    );
    expect(html).toContain('(k-1, k, 3)');
    expect(html).toContain('AB');
  });
});

describe('#2077 — the same missing row in the other spellings of a stated vector', () => {
  it('a numeric pair vector, its components as typed («1/2» stays «1/2»)', () => {
    expect(panels([PYR, 'AB = (1,2,3)'])[1].stated).toEqual(['AB⃗ = (1, 2, 3)']);
    st().clear();
    expect(panels([PYR, 'AB = (1/2,2,3)'])[1].stated).toEqual(['AB⃗ = (1/2, 2, 3)']);
  });

  it('a named vector, before and after its letter is known', () => {
    const [, named, given, valued] = panels([PYR, 'נסמן: AB = u', 'u = (k-1,k,3)', 'k = 2']);
    expect(named.stated).toEqual(['u = AB⃗']);
    expect(given.stated).toEqual(['u = AB⃗', 'u = (k-1, k, 3)']);
    expect(valued.stated).toEqual(['u = AB⃗', 'u = (1, 2, 3)']);
  });

  it('the injection prefix, Hebrew and English', () => {
    expect(panels([PYR, 'נתון: AB = (k-1,k,3)'])[1].stated).toEqual(['AB⃗ = (k-1, k, 3)']);
    st().clear();
    expect(panels(['triangular pyramid ABCD', 'given: AB = (k-1, k, 3)'])[1].stated).toEqual(['AB⃗ = (k-1, k, 3)']);
  });

  it('two letters, one valued: only the valued component switches', () => {
    const [, both, one] = panels([PYR, 'AB = (k, t, 1)', 'k = 2']);
    expect(both.stated).toEqual(['AB⃗ = (k, t, 1)']);
    expect(one.stated).toEqual(['AB⃗ = (2, t, 1)']);
  });

  it('rows from several tuples keep the order they were stated in', () => {
    const p = panels([PYR, 'נסמן: AC = v', 'v = (1,0,2)', 'AB = (k-1,k,3)']).at(-1)!;
    expect(p.stated).toEqual(['v = AC⃗', 'v = (1, 0, 2)', 'AB⃗ = (k-1, k, 3)']);
  });
});

describe('#2077 — a stated point keeps the letter, not «?»', () => {
  it('«A(1,t,2)» reads «A(1, t, 2)», then «A(1, 3, 2)» once t = 3', () => {
    const [open, valued] = panels(['A(1,t,2)', 't = 3']);
    expect(open.points).toEqual(['A(1, t, 2)']);
    expect(open.pointCoords.A?.text).toBe('(1, t, 2)');
    expect(open.pointComps.A, 'a letter is a name, not a value').toEqual(['1', '?', '2']);
    expect(valued.points).toEqual(['A(1, 3, 2)']);
  });

  it('the ask lane answers the row; a single coordinate stays undetermined', () => {
    panels(['A(1,t,2)']);
    const c = derive3(st().facts, st().seed).construction;
    expect(answerQuery(c, 'A', st().seed).answer).toBe('(1, t, 2)');
    const y = answerQuery(c, 'y של A', st().seed);
    expect(y.answer).toBeNull();
    expect(y.note).toBe('undetermined');
  });
});

describe('#2077 — the typed text is a display channel the parser carries on every component reader', () => {
  it.each([
    ['AB = (k-1,k,3)', ['k-1', 'k', '3']],
    ['u = ( 1 , 2 ,3 )', ['1', '2', '3']],
    ['A(1,t,2)', ['1', 't', '2']],
    ['נתונות הנקודות: B(2t, t, k)', ['2t', 't', 'k']],
    ['given: AB = (k-1, k, 3)', ['k-1', 'k', '3']],
  ])('«%s»', (line, srcs) => {
    const r = parse3(line);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.commands[0] as { srcs?: string[] }).srcs).toEqual(srcs);
  });
});
