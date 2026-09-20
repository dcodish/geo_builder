/**
 * #1196 — THE DATA PANEL SHOWS WHAT THE STUDENT STATED ABOUT VECTORS.
 *
 * **Operator, 2026-09-18, playing round #1193 T3.** *"the data panel says noting in known. we should be
 * able to say that AB=u and DC=3u."*
 *
 * The figure builds correctly — that is T3 passing. Beside it the panel said
 * «אין עדיין נתונים יציבים להצגה» — *no stable data to display yet* — on a figure where the student had
 * just written down **two** things that are true at every configuration.
 *
 * ## Root cause: the panel reports what it can MEASURE, and this figure's knowledge is RELATIONAL
 *
 * Every `DataPanel` field was a measurement: coordinates, a vector's components and magnitude, pinned
 * symbols. Each needs a number the figure holds still. This trapezoid has free dimensions, so `u` has no
 * determinable coordinates and no stated magnitude — its entry is dropped and the vectors section comes
 * back empty. The panel then correctly reported that it had nothing, **by its own definition of
 * "something"**.
 *
 * But «AB = u» and «DC = 3u» are not measurements awaiting a figure. They are GIVENS. The panel's own
 * hint promises them first — «הצגת הנתונים בכתיב וקטורי, בקואורדינטות ובגדלים» — and vector notation is
 * the one of the three that needs no determined figure at all.
 *
 * ## Scope, in the operator's words
 *
 * *"stated+what follows. this is important for students learning geometric vectors"* and *"we need to
 * keep it simple enough. so only stated vectors. anything else, the user can ask for specifically."*
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView, panelIsEmpty } from '../engine/dataView';

const st = () => useGeo3.getState();
beforeEach(() => {
  st().clear();
});

const panelFor = (lines: readonly string[]) => {
  for (const l of lines) st().submit(l);
  const d = derive3(st().facts, st().seed);
  return { panel: dataView(d.construction, st().seed), err: st().lastError };
};

/** The operator's own three lines. */
const T3 = ['טרפז ABCD', 'נסמן: AB = u', 'DC = 3u'];

describe('#1196 — the operator’s figure', () => {
  it('no longer reports that it knows nothing', () => {
    const { panel, err } = panelFor(T3);
    expect(err, 'the figure still builds — this issue was never about the build').toBeNull();
    expect(panelIsEmpty(panel), 'the panel claimed to have nothing to show').toBe(false);
  });

  it('shows both statements, in vector notation', () => {
    const { panel } = panelFor(T3);
    expect(panel.stated).toEqual(['u = AB⃗', 'DC⃗ = 3u']);
  });

  /**
   * THE PRECONDITION, so this file cannot go vacuous. The reason the panel was empty is that nothing
   * here is MEASURABLE — the trapezoid has free dimensions. If a later change happened to determine the
   * figure, the rows above would pass for the wrong reason.
   */
  it('…and it is still true that nothing here is measurable', () => {
    const { panel } = panelFor(T3);
    expect(panel.points, 'a coordinate became stable — the rows above no longer test what they were for').toEqual([]);
    expect(panel.vectors, 'a vector became measurable — likewise').toEqual([]);
  });
});

describe('#1196 — the rows are GIVENS, not measurements', () => {
  /**
   * True at every configuration is the defining property, so it is asserted across configurations rather
   * than at one. A measurement would change; a given does not.
   */
  it('the same rows appear at every configuration', () => {
    for (const l of T3) st().submit(l);
    const d = derive3(st().facts, st().seed);
    const rows = [0, 1, 2, 7, 99].map((seed) => dataView(d.construction, seed).stated.join(' | '));
    expect(new Set(rows).size, 'a stated given changed between configurations').toBe(1);
  });

  it('a naming alone is enough — «נסמן: AB = u» with no relation still shows', () => {
    const { panel } = panelFor(['טרפז ABCD', 'נסמן: AB = u']);
    expect(panel.stated).toEqual(['u = AB⃗']);
  });
});

/**
 * WHERE IT STOPS — *"only stated vectors. anything else, the user can ask for specifically."*
 *
 * A figure with no vector statement gets no rows here, however much else it knows. Without this the
 * section would grow into a second answer lane beside the ask.
 */
describe('#1196 — only STATED vectors', () => {
  it('a solid with no vector statement contributes no stated rows', () => {
    const { panel } = panelFor(["קובייה ABCDA'B'C'D'"]);
    expect(panel.stated).toEqual([]);
  });

  it('a plain segment is not a vector statement', () => {
    const { panel } = panelFor(['טרפז ABCD', 'קטע AC']);
    expect(panel.stated).toEqual([]);
  });

  /**
   * And the panel still says it has nothing when it genuinely has nothing — the empty message is not
   * broken by adding a section, which is the way this change could make the panel dishonest in the
   * other direction.
   */
  it('an empty canvas still reports an empty panel', () => {
    const { panel } = panelFor([]);
    expect(panelIsEmpty(panel)).toBe(true);
  });
});

/**
 * A DETERMINED figure keeps everything it had. The section is additive — it must not displace the
 * measurements, which are what the panel is for once the figure holds still.
 */
describe('#1196 — the measurable sections are untouched', () => {
  it('a pinned figure still reports its coordinates, and its stated vectors too', () => {
    const { panel } = panelFor(['נקודה A(0,0,0)', 'נקודה B(1,2,3)', 'נסמן: AB = u']);
    expect(panel.stated).toEqual(['u = AB⃗']);
    expect(panel.points.length, 'the coordinate rows are still there').toBeGreaterThan(0);
  });
});
