/**
 * #2341 (ADR-3D-423) — a point's coordinates restated in the other spelling are already known.
 *
 * Operator, playing round #2304 T29 (2026-10-17): *"the test passes but the 3rd line should not be accepted and we say
 * that it is already known"*. «B(√2,0,0)» · «B=(√2,0,0)» lower to different commands, so the #613 twin rule missed them
 * and the line became a ✓ row.
 *
 * ADR-3D-449 — the general rule (operator 2026-11-06: *"In all cases it should say כבר קיים"*; [judged] Q-2341,
 * 2026-11-09): any statement the figure before it already holds in every admissible configuration is answered by
 * `impliedByPrior3` in `decideCommands3`, the same `already-stated` verdict, with no row.
 *
 * #2790 ([ADR-3D-484](../../docs/06b-decisions-3d.md#adr-3d-484), ADR-W-200, operator 2026-11-09) — the same detector,
 * a new outcome: the line is accepted as its own row, `held`, with the notice «זה כבר קיים באיור — נוסף כנתון נפרד.», and is
 * drawn like any row (its knee, its value). Every "no row" below is re-based to "its own row"; the rows' set is unchanged.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { decideSteps3, derive3, useGeo3, type Fact3 } from '../store/store3';

const st = () => useGeo3.getState();

function build(lines: readonly string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» is context`).toBeNull();
  }
}
const verdict = (line: string) => {
  const v = decideDeterministic3(st(), line);
  return v.kind === 'record' && v.held ? 'held' : v.kind;
};

beforeEach(() => build([]));

describe("#2341 — the operator's sequence", () => {
  it('«B=(√2,0,0)» after «B(√2,0,0)»: its own row, the note, the figure unchanged', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    const before = derive3(st().facts, st().seed).positions.get('B');
    st().submit('B=(√2,0,0)');
    expect(st().facts.map((f) => f.utterance)).toEqual(['A(0,0,0)', 'B(√2,0,0)', 'B=(√2,0,0)']);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-held' });
    expect(derive3(st().facts, st().seed).positions.get('B')).toEqual(before);
  });

  it('a contradiction is still refused', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    st().submit('B=(2,0,0)');
    expect(st().lastError?.code).toBe('claim-refuted');
    expect(st().facts).toHaveLength(2);
  });

  it('on a NEW point the equation is still its first statement', () => {
    build(['A(0,0,0)']);
    expect(verdict('B=(√2,0,0)')).toBe('record');
  });
});

describe('#2341 — the class: one statement in two spellings', () => {
  it.each([
    [['A(1,2,3)'], 'A = (1, 2, 3)'],
    [['A = (1,2,3)'], 'A(1,2,3)'], // the other order
    [['A(1,2,3)'], 'A=(1,2,3)'],
    [['A(1/2,0,0)'], 'A=(0.5,0,0)'], // the same number in another form
    [['A(0,0,0)', 'B(2,0,0)', 'K על AB', 'K(1,0,0)'], 'K=(1,0,0)'], // a rider placed by its coordinates
  ])('%j + «%s»', (lines, line) => {
    build(lines);
    expect(verdict(line)).toBe('held');
  });

  it('a muted twin is re-ticked with no note, as the #613 rule does', () => {
    build(['B(1,2,3)']);
    const twin = st().facts[0];
    st().toggle(twin.id);
    st().submit('B=(1,2,3)');
    expect(st().facts).toHaveLength(1);
    expect(st().facts[0].enabled).toBe(true);
    expect(st().lastNotice).toBeNull();
  });
});

describe('#2341 — a length restated, [judged] q21 2026-11-05 (2-D\'s noop)', () => {
  it.each([
    [['משולש ABC', 'AB = 3'], 'BA = 3'], // the ruled line
    [['משולש ABC', 'BA = 3'], 'AB = 3'], // the other order
    [['משולש ABC', 'AB = 3'], 'BA = 6/2'], // another spelling of the value
    [['משולש ABC', 'AB = 3'], '|BA| = 3'],
    [['משולש ABC', 'AB = 3'], 'AB = 3.0'],
    [['משולש ABC', 'AB = 2.5'], 'BA = 5/2'],
    [['משולש ABC', 'AB = √2'], 'BA = √2'],
    [["קובייה ABCDA'B'C'D'", 'AB = 3'], 'BA = 3'],
    [['A(0,0,0)', 'B(3,0,0)', 'AB = 3'], 'BA = 3'],
  ])('%j + «%s»: its own row, the note', (lines, line) => {
    build(lines);
    const rows = st().facts.length;
    st().submit(line);
    expect(st().facts).toHaveLength(rows + 1);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-held' });
  });

  it.each(['BA = 4', 'AB = 4'])('«AB = 3» + «%s» is still refused', (line) => {
    build(['משולש ABC', 'AB = 3']);
    st().submit(line);
    expect(st().lastError?.code).toBe('givens-contradict');
    expect(st().facts).toHaveLength(2);
  });

  it('a muted twin is re-ticked with no note', () => {
    build(['משולש ABC', 'AB = 3']);
    const twin = st().facts[1];
    st().toggle(twin.id);
    st().submit('BA = 3');
    expect(st().facts).toHaveLength(2);
    expect(st().facts[1].enabled).toBe(true);
    expect(st().lastNotice).toBeNull();
  });

  it('a first value on a segment the figure already fixes is already known ([judged] Q-2341, 2026-11-09)', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    expect(verdict('AB = √2')).toBe('held');
    expect(verdict('BA = √2')).toBe('held');
  });
});

describe('#2341 — ADR-3D-449: a statement the figure already holds is already known', () => {
  const known = (lines: readonly string[], line: string) => {
    build(lines);
    const rows = st().facts.length;
    st().submit(line);
    expect(st().lastError, line).toBeNull();
    expect(st().facts, line).toHaveLength(rows + 1);
    expect(st().lastNotice, line).toEqual({ code: 'already-held' });
  };

  it.each([
    [["קובייה ABCDA'B'C'D'"], 'AB ∥ CD'], // ruled 2026-11-06
    [["cube ABCDA'B'C'D'"], 'AB ∥ CD'],
    [["קובייה ABCDA'B'C'D'"], 'CD ∥ AB'], // the other letter order
    [['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB'], 'M=(1,0,0)'], // ruled: a correct computed answer
    [['A(0,0,0)', 'B(2,0,0)', 'M is the midpoint of AB'], 'M = (1, 0, 0)'],
    [["קובייה ABCDA'B'C'D'"], 'AB ⟂ AD'], // ruled
    [["cube ABCDA'B'C'D'"], 'AB is perpendicular to AD'],
    [['A(0,0,0)', 'B(3,0,0)'], 'AB = 3'], // [judged] Q-2341
    [["קובייה ABCDA'B'C'D'"], 'זווית DAB = 90'], // [judged] Q-2341
    [['ריבוע ABCD'], 'AB ∥ CD'],
    [["קובייה ABCDA'B'C'D'"], "AA' מאונך למישור ABCD"],
    [["תיבה ABCDA'B'C'D'"], "המישור ABC מקביל למישור A'B'C'"],
    [['המישור π1: z = 0', 'המישור π2: x = 0'], 'π1 ניצב ל-π2'],
    [['A(0,0,0)', 'B(a,0,0)', 'a = 2'], 'B=(2,0,0)'], // the letter is decided, so the point is
  ])('%j + «%s»: its own row, the note', (lines, line) => known(lines, line));

  // #2790 (ADR-3D-484): the row is drawn like any accepted row (ADR-W-118 B2): its right-angle knee is back
  it('«AB ⟂ AD» on a cube draws its right-angle knee, as the same line on any figure does', () => {
    build(["קובייה ABCDA'B'C'D'"]);
    const before = derive3(st().facts, st().seed);
    const marks = buildScene3(before.construction, before.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).marks.length;
    st().submit('AB ⟂ AD');
    const after = derive3(st().facts, st().seed);
    expect(buildScene3(after.construction, after.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).marks.length).toBeGreaterThan(marks);
  });

  it('the figure does not change', () => {
    build(["קובייה ABCDA'B'C'D'"]);
    const before = derive3(st().facts, st().seed).positions;
    st().submit('AB ∥ CD');
    expect(derive3(st().facts, st().seed).positions).toEqual(before);
  });

  it('the notice is cleared by the next ordinary statement', () => {
    build(["קובייה ABCDA'B'C'D'"]);
    st().submit('AB ∥ CD');
    expect(st().lastNotice).toEqual({ code: 'already-held' });
    st().submit("M אמצע AB");
    expect(st().lastNotice).toBeNull();
    expect(st().facts).toHaveLength(3);
  });

  it('the model lane asks without the rule, as it always has (the twin rule is the grammar lane\'s)', () => {
    build(["קובייה ABCDA'B'C'D'"]);
    expect(decideSteps3(st(), 'AB ∥ CD', ['AB ∥ CD']).kind).toBe('record');
  });
});

describe('#2341 — ADR-3D-449: the boundary — what still commits', () => {
  it('a false statement is still refused (FR-CL-1)', () => {
    build(["קובייה ABCDA'B'C'D'"]);
    st().submit('AB ∥ AD');
    expect(st().lastError?.code).toBe('claim-refuted');
    expect(st().facts).toHaveLength(1);
  });

  it('a wrong answer on a computed point is still refused', () => {
    build(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB']);
    st().submit('M=(3,0,0)');
    expect(st().lastError?.code).toBe('claim-refuted');
  });

  it.each([
    [["קובייה ABCDA'B'C'D'"], 'AB = 1'], // a free magnitude: the cube's size is pinned, even at its drawn value (ADR-052)
    [["קובייה ABCDA'B'C'D'"], 'AB = 3'],
    [['משולש ABC'], 'AB = 3'], // a free triangle's side
    [["תיבה ABCDA'B'C'D'"], 'AB = BC'], // true only at some configurations of the box
    [['טטראדר ABCD'], 'AB ⟂ CD'], // a pin on a free figure
    [['A(0,0,0)'], 'B=(√2,0,0)'], // a new point
    [["קובייה ABCDA'B'C'D'"], 'E אמצע AB'], // a construction
    [['A(0,0,0)', 'B(1,0,0)'], 'AB'], // a line that only draws
    [['פירמידה SABC'], 'משולש ABC'], // a shape declared over existing points (#613's lock)
    [["קובייה ABCDA'B'C'D'"], 'מרובע ABC\'D\''],
    // a statement that turns a DEFAULT reading into a given (M4; 2-D's ADR-605 row): true at every sample, still new
    [['טרפז ABCD'], 'AB ∥ DC'], // the noun's parallel pair, which a later «AD ∥ BC» would otherwise re-seat
    [['משולש ישר זווית ABC'], 'AB ⟂ BC'], // the soft right-angle vertex
    [['משולש שווה שוקיים ABC'], '|AB| = |AC|'], // the soft equal pair
  ])('%j + «%s» records a row', (lines, line) => {
    build(lines);
    expect(verdict(line)).toBe('record');
  });

  it('a sign selects among configurations, so it commits even where every sample obeys it', () => {
    build(['A(0,0,0)', 'B(a,0,0)']);
    expect(verdict('a חיובי')).not.toBe('held');
  });
});

describe('#2341 — a load replays as saved', () => {
  it('a saved row replays as saved: a load never reads the submit decision', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    const old: Fact3 = { id: 'old', utterance: 'B=(√2,0,0)', cmds: [{ type: 'claim', claim: { type: 'coords-eq', id: 'B', x: Math.SQRT2, y: 0, z: 0 } }], enabled: true };
    expect(derive3([...st().facts, old], 0).status.old).toBe('ok');
  });
});
