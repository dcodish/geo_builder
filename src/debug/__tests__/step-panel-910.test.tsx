/**
 * #910 ([ADR-581](../../../docs/06-decisions.md#adr-581)) — the dev step-through panel over `replaySession`.
 *
 * The two locks the issue's plan names:
 *  1. selecting step k yields the SAME figure as replaying the first k+1 utterances — the invariant the
 *     whole tool rests on (`figureAtStep` re-derives from the facts committed so far);
 *  2. the panel renders a known multi-step session's categories in order.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/i18n';
import { figureAtStep, replaySession, seedAtStep } from '@/validation/replaySession';
import type { Derived } from '@/store/geoStore';
import StepPanel, { linesOf } from '../StepPanel';

const SESSION = ['ריבוע ABCD', 'M אמצע AB', 'קשקוש בלי שום משמעות', 'ריבוע ABCD', 'N אמצע CD'];

const sameFigure = (a: Derived, b: Derived, what: string) => {
  expect([...a.positions.keys()].sort(), what).toEqual([...b.positions.keys()].sort());
  for (const [id, p] of a.positions) {
    const q = b.positions.get(id)!;
    expect(p.x, `${what}: ${id}.x`).toBeCloseTo(q.x, 9);
    expect(p.y, `${what}: ${id}.y`).toBeCloseTo(q.y, 9);
  }
};

describe('#910 — figureAtStep: step k is the first k+1 utterances, re-derived from facts', () => {
  for (const satisfyingSeed of [true, false]) {
    it(`every step's figure equals the prefix session's final figure (satisfyingSeed=${satisfyingSeed})`, () => {
      const r = replaySession(SESSION, { satisfyingSeed });
      expect(r.factsAfter).toHaveLength(SESSION.length);
      for (let k = 0; k < SESSION.length; k++) {
        const prefix = replaySession(SESSION.slice(0, k + 1), { satisfyingSeed });
        expect(r.factsAfter[k], `facts after step ${k + 1}`).toEqual(prefix.factsAfter[k]);
        sameFigure(figureAtStep(r, k, { satisfyingSeed }), prefix.final, `step ${k + 1}`);
      }
      // …so the last step's figure IS the report's final figure.
      sameFigure(figureAtStep(r, SESSION.length - 1, { satisfyingSeed }), r.final, 'last step');
    });
  }

  it('a step that commits nothing leaves the fact list as it was; one that commits grows it', () => {
    const r = replaySession(SESSION);
    expect(r.steps.map((s) => s.committed)).toEqual([true, true, false, false, true]);
    expect(r.factsAfter[2]).toEqual(r.factsAfter[1]);
    expect(r.factsAfter[3]).toEqual(r.factsAfter[1]);
    expect(r.factsAfter[4].length).toBeGreaterThan(r.factsAfter[3].length);
    expect(figureAtStep(r, 0).positions.has('M')).toBe(false);
    expect(figureAtStep(r, 1).positions.has('M')).toBe(true);
    expect(seedAtStep(r, 1, { satisfyingSeed: false })).toBe(0);
  });

  it('a rename step relabels only from that step on — earlier steps keep the letters they had', () => {
    const r = replaySession(['משולש ABC', 'M אמצע AB', 'שנה M ל-K']);
    expect(r.steps[2].category).toBe('edit');
    expect(figureAtStep(r, 1).positions.has('M')).toBe(true);
    expect(figureAtStep(r, 2).positions.has('K')).toBe(true);
    expect(figureAtStep(r, 2).positions.has('M')).toBe(false);
  });
});

describe('#910 — the panel', () => {
  it('splits the pasted text into one utterance per non-blank line', () => {
    expect(linesOf('ריבוע ABCD\r\n\n  M אמצע AB  \n')).toEqual(['ריבוע ABCD', 'M אמצע AB']);
  });

  it("renders a known session's step categories in order, and step k's figure when one is selected", () => {
    const html = renderToStaticMarkup(<StepPanel initialText={SESSION.join('\n')} initialSelected={1} />);
    const cats = [...html.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]);
    expect(cats).toEqual(['ok', 'ok', 'coverage-gap', 'empty', 'ok']);
    expect(html).toContain('data-testid="dev-step-figure"');
    expect(html).toContain('<svg');
  });

  it('renders no figure until a step is selected', () => {
    const html = renderToStaticMarkup(<StepPanel initialText={SESSION.join('\n')} />);
    expect(html).toContain('data-testid="dev-step-list"');
    expect(html).not.toContain('data-testid="dev-step-figure"');
  });
});
