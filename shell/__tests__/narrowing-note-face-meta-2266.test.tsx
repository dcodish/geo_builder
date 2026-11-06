/**
 * THE META-LOCK OF THE NOTE'S FACE (#2266, ADR-W-180) — `noteFaceFaults`, the check each builder's render lock calls, is
 * run against the faces the builders actually had: analytic's amber strip and 3-D's box without the ⓘ. A shared check
 * that passes everything would let all three locks go green with the rule held by nothing.
 */
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Banner, InfoNote } from '../frame/Banner';
import { NarrowingNote } from '../frame/NarrowingNote';
import { noteFaceFaults, noteMarkup } from './fixtures/narrowing-note-rows';

const strip = (el: ReactElement) => renderToStaticMarkup(<div data-testid="n">{el}</div>);

describe('#2266 — the note’s face catches a builder that differs', () => {
  it('the shared note passes, in every builder', () => {
    for (const b of ['2d', '3d', 'analytic'] as const) {
      expect(noteFaceFaults(noteMarkup(strip(<NarrowingNote>נוסח</NarrowingNote>), 'n'), b)).toEqual([]);
    }
  });

  it('catches analytic’s amber strip', () => {
    const amber = strip(
      <Banner kind="notice">
        <span>ⓘ </span>נוסח
      </Banner>,
    );
    expect(noteFaceFaults(noteMarkup(amber, 'n'), 'analytic')).toEqual(['the note in analytic is not on the blue information strip']);
  });

  it('catches 3-D’s missing ⓘ, on the strip and on its old box', () => {
    expect(noteFaceFaults(strip(<Banner kind="info">נוסח</Banner>), '3d')).toEqual(['the note in 3d has no ⓘ']);
    expect(noteFaceFaults(strip(<div role="note" className="border-blue-300 bg-blue-50">נוסח</div>), '3d')).toHaveLength(2);
  });

  it('the two-letters note: the strip passes in every builder that shows it, and complex’s amber is caught (q13)', () => {
    for (const b of ['2d', '3d', 'analytic', 'complex'] as const) {
      expect(noteFaceFaults(noteMarkup(strip(<InfoNote>A ו-B נפלו על אותה נקודה.</InfoNote>), 'n'), b)).toEqual([]);
    }
    expect(noteFaceFaults(strip(<Banner kind="notice">ⓘ A ו-B נפלו על אותה נקודה.</Banner>), 'complex')).toEqual(['the note in complex is not on the blue information strip']);
  });

  it('a note that is not on the page is a fault, not a pass', () => {
    expect(noteFaceFaults(noteMarkup('<div>page</div>', 'narrowed-note'), '2d')).toHaveLength(2);
  });

  it('a blue neighbour cannot vouch for an amber note', () => {
    const page = `<div data-testid="n">${renderToStaticMarkup(<Banner kind="notice">נוסח</Banner>)}</div>${strip(<NarrowingNote>אחר</NarrowingNote>)}`;
    expect(noteFaceFaults(noteMarkup(page, 'n'), '2d')).toHaveLength(2);
  });
});
