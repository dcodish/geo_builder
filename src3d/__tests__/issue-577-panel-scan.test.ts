/**
 * Issues #577 + #558 (ADR-3D-154): the data panel's mutual-relation scan is ONE universe, ONE loop.
 *
 * It used to be two hand-built loops — an S4 block over drawn segments + named lines, and a #384 block
 * over planes — and that shape IS the defect: a pair whose sides sat in different loops could never be
 * asked about. Three live consequences:
 *
 *  - **#577** «vector FG ∥ מישור ABCD» produced no row, even though the STATEMENT lane already
 *    verifies and drives exactly that relation (`relDeviation`, ADR-3D-105). The engine understood
 *    more than the UI communicated — the ADR-3D-108 theme.
 *  - **#577** declared vectors and ink arrows were in NO universe, so they got no rows at all.
 *  - **#558** a named line could not be compared against a solid's undrawn EDGE, so the book's
 *    «ℓ ⟂ BCK ⇒ ℓ ⟂ B'C'» never appeared.
 *
 * A third loop would have recommitted the class error, so the universe is built once and partitioned,
 * and one loop dispatches on the sides' kinds.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const panel = () => dataView(derive3(state().facts, state().seed).construction, state().seed);
/** Is there a row about this unordered pair with this relation? */
const row = (a: string, b: string, rel: string) =>
  panel().mutual.some((m) => m.rel === rel && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));

describe('#577 — the LINEAR×PLANE column (the reported cell)', () => {
  beforeEach(reset);

  it("a declared VECTOR parallel to a plane produces a row (the operator's report)", () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('מישור ABCD'); // the panel's scope rule: a plane the student NAMED (ADR-3D-104)
    submit("נסמן: A'B' = g"); // a top-face vector — parallel to the base at every configuration
    expect(state().lastError).toBeNull();
    // the row is labelled by the ENDPOINT PAIR the student wrote: declaring the vector also draws the
    // segment (a statement leaves ink), and the dedup keeps one object under the name that was typed
    // rather than emitting the same physical object twice under two aliases
    expect(row("A'B'", 'ABCD', 'parallel'), 'the mixed cell must be scanned at all').toBe(true);
  });

  it('the mixed row is marked `mixed`, with the LINEAR side first (the wording is asymmetric)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('מישור ABCD');
    submit("נסמן: A'B' = g");
    const m = panel().mutual.find((r) => r.rel === 'parallel' && r.b === 'ABCD');
    expect(m?.mixed, '«מקבילים» misreads for a plane — the App needs to know').toBe(true);
    expect(m?.a, 'the linear side leads').toBe("A'B'");
  });

  it('a declared vector whose endpoints are the plane\'s OWN run is skipped as noise, like a segment', () => {
    // the flood control does not care which alias the object arrived under — AB is an edge of the
    // run ABC either way. (In practice a declared vector always HAS a drawn twin, because declaring
    // it leaves ink; the vector entry in the universe is what makes the two agree rather than race.)
    submit('פירמידה SABC');
    submit('מישור ABC');
    submit('נסמן: AB = u');
    expect(state().lastError).toBeNull();
    expect(panel().mutual.some((m) => m.b === 'ABC' && (m.a === 'u' || m.a === 'AB'))).toBe(false);
  });

  it('a SEGMENT perpendicular to a plane produces a row', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('מישור ABCD');
    submit("AA'"); // a vertical edge, drawn — ⟂ to the base
    expect(row("AA'", 'ABCD', 'perpendicular')).toBe(true);
  });

  it('CONTAINED is its own row — a segment lying IN the plane is NOT reported as "parallel"', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('מישור ABC'); // the base plane, named by three of its four corners
    submit('CD'); // D is outside the run, so this is not the own-run skip — and CD lies in the plane
    expect(row('CD', 'ABC', 'contained'), 'a contained segment gets its own row').toBe(true);
    expect(row('CD', 'ABC', 'parallel'), 'and never the false "parallel" reading').toBe(false);
  });

  it('the knowledge gate holds: a relation true at only SOME configurations gets no row', () => {
    submit('פירמידה משולשת ABCD');
    submit('מישור ABC');
    submit('AD');
    expect(row('AD', 'ABC', 'parallel'), 'AD meets ABC — never parallel').toBe(false);
    expect(row('AD', 'ABC', 'perpendicular'), 'a FREE tetra is not perpendicular at every seed').toBe(false);
  });

  it("flood control: a plane's OWN edge or diagonal earns no row (contained by construction)", () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('מישור ABCD');
    submit('AB'); // an edge of the run
    submit('AC'); // a diagonal of the same run
    expect(panel().mutual.some((m) => m.b === 'ABCD' && (m.a === 'AB' || m.a === 'AC')), 'noise, not knowledge').toBe(false);
  });

  it('a generic CROSSING is not reported — only ∥ / ⟂ / contained are knowledge (#384 precedent)', () => {
    submit('פירמידה SABC');
    submit('מישור ABC');
    submit('SA');
    expect(panel().mutual.some((m) => m.b === 'ABC' && m.a === 'SA' && m.rel === 'intersecting')).toBe(false);
  });
});

describe('#558 — a named LINE against SOLID EDGES', () => {
  beforeEach(reset);

  it("an UNDRAWN solid edge earns a row against a named line (the book's «ℓ⊥BCK ⇒ ℓ⊥B'C'»)", () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('ישר k');
    submit('הישר k מאונך למישור ABCD'); // k ⟂ the base ⇒ k ⟂ EVERY base edge, drawn or not
    expect(state().lastError).toBeNull();
    const rows = panel().mutual.filter((m) => m.a === 'k' || m.b === 'k');
    expect(rows.length, 'the line must reach the solid edges').toBeGreaterThan(0);
    // CD is an undrawn base edge — the whole point of #558
    expect(row('k', 'CD', 'perpendicular'), 'the #558 cell').toBe(true);
  });

  it('edge×edge pairs are NOT enumerated — that is the flood the scope rule keeps out', () => {
    submit("תיבה ABCDA'B'C'D'");
    // no named line at all: the solid's own edges must produce no rows among themselves
    const rows = panel().mutual;
    expect(rows.filter((m) => m.rel === 'parallel' || m.rel === 'skew' || m.rel === 'intersecting')).toHaveLength(0);
  });

  it('an edge pair reports only the INFORMATIVE relations — no skew/intersecting noise', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('ישר k');
    submit('הישר k מאונך למישור ABCD');
    expect(panel().mutual.some((m) => (m.a === 'k' || m.b === 'k') && (m.rel === 'skew' || m.rel === 'intersecting'))).toBe(false);
  });

  it('the pre-#558 workaround (draw the edge) still gives the same answer', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('CD'); // draw it — what the operator had to do before
    submit('ישר k');
    submit('הישר k מאונך למישור ABCD');
    expect(row('k', 'CD', 'perpendicular')).toBe(true);
  });
});

describe('#577 — the universe is deduplicated and the old columns are unchanged', () => {
  beforeEach(reset);

  it('a vector and the segment over the SAME endpoints yield one object, not two', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('AB');
    submit('נסמן: AB=u'); // the same physical pair, named
    const labels = panel().mutual.flatMap((m) => [m.a, m.b]);
    expect(labels.filter((l) => l === 'AB').length === 0 || labels.filter((l) => l === 'u').length === 0,
      'the same pair must not appear under both names').toBe(true);
  });

  it('linear×linear rows are unchanged (the S4 column)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('AB');
    submit("C'D'");
    expect(row('AB', "C'D'", 'parallel')).toBe(true);
  });

  it('plane×plane rows are unchanged — including planes SHARING two points', () => {
    // the regression this bundle nearly introduced: a shared-endpoint skip is a LINEAR notion, and
    // hoisting it over the whole loop silently dropped «ABC ⟂ ABD», which share A and B
    submit('פירמידה משולשת ABCD');
    submit('המישור ABC מאונך למישור ABD');
    expect(state().lastError).toBeNull();
    expect(row('ABC', 'ABD', 'perpendicular')).toBe(true);
  });
});
