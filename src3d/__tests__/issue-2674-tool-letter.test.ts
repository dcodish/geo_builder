/**
 * #2674 (ADR-3D-415) — a student's letter on a point the TOOL lettered takes the tool's letter over, as in 2-D
 * (ADR-653) and analytic (ADR-AG-387). Operator ruling 2026-11-03: *"Rename the tool's letter to the student's, no
 * message (2-D's way, in every builder)"*.
 *
 * «אמצע BB'» letters its point from the pool (M first) at apply; «E אמצע BB'» then names the same point. The figure
 * keeps one point, E, with no coincidence notice, and M goes back to the pool (2-D: the next unnamed midpoint is M).
 * Typed through the store the App submits to (`useGeo3.submit`), read from `derive3`, the derivation App3 renders.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const CUBE = "קובייה ABCDA'B'C'D'";

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
});

function type(lines: readonly string[]): void {
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
}
const drawn = () => derive3(st().facts, st().seed);
const points = () => [...drawn().construction.points.keys()];
const allOk = () => Object.values(drawn().status).every((s) => s === 'ok');

describe('#2674 — 3-D: the student letter takes the tool letter over', () => {
  it.each([
    [[CUBE, "אמצע BB'", "E אמצע BB'"]],
    [[CUBE, "אמצע BB'", "E אמצע B'B"]], // the segment either way round is one point
    [[CUBE, "midpoint of BB'", "E is the midpoint of BB'"]],
    [['A(0,0,0)', 'B(2,0,0)', 'אמצע AB', 'E אמצע AB']],
  ])('%j: one point E, no M, no notice', (lines) => {
    type(lines);
    expect(st().facts).toHaveLength(lines.length); // the student's line keeps its row (2-D: "+0 objects")
    expect(allOk()).toBe(true);
    expect(points()).toContain('E');
    expect(points()).not.toContain('M');
    expect(drawn().coincidences).toEqual([]);
  });

  it('the decision the App dispatches records it (decideDeterministic3)', () => {
    type([CUBE, "אמצע BB'"]);
    const v = decideDeterministic3(st(), "E אמצע BB'");
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(v.facts.find((f) => f.utterance === "אמצע BB'")!.cmds).toEqual([{ type: 'midpoint-auto', a: 'B', b: "B'", id: 'E' }]);
  });

  it("the tool's letter goes back to the pool: the next unnamed midpoint is M (2-D's next letter)", () => {
    type([CUBE, "אמצע BB'", "E אמצע BB'", "אמצע CC'"]);
    expect(points()).toEqual(expect.arrayContaining(['E', 'M']));
    expect(points()).not.toContain('N');
    expect(drawn().coincidences).toEqual([]);
  });

  it('the unnamed midpoint typed again is still already known', () => {
    type([CUBE, "אמצע BB'", "E אמצע BB'"]);
    st().submit("אמצע BB'");
    expect(st().lastNotice).toEqual({ code: 'already-stated' });
    expect(st().facts).toHaveLength(3);
  });

  it('one undo step restores the tool letter', () => {
    type([CUBE, "אמצע BB'"]);
    st().submit("E אמצע BB'");
    useGeo3.temporal.getState().undo();
    expect(st().facts).toHaveLength(2);
    expect(points()).toContain('M');
    expect(points()).not.toContain('E');
  });

  it('a later rename reaches the named point', () => {
    type([CUBE, "אמצע BB'", "E אמצע BB'", 'שנה שם E ל-K']);
    expect(points()).toContain('K');
    expect(points()).not.toContain('E');
    expect(drawn().coincidences).toEqual([]);
  });

  it('the ✎ edit seam names it the same way', () => {
    type([CUBE, "אמצע BB'", "AM = 3"]);
    // M is the student's once a line types it; an edit that no longer types it hands M back to the tool's point
    const last = st().facts.at(-1)!;
    expect(st().replaceFact(last.id, "E אמצע BB'")).toBe(true);
    expect(points()).not.toContain('M');
    expect(drawn().coincidences).toEqual([]);
  });
});

describe('#2674 — controls: what is NOT a tool letter keeps the notice (#1595 ruling B)', () => {
  it('a letter the student typed («AM = 3») is the student\'s: M and E stay two names, with the notice', () => {
    type([CUBE, "אמצע BB'", 'BM = 1', "E אמצע BB'"]);
    expect(points()).toEqual(expect.arrayContaining(['M', 'E']));
    expect(drawn().coincidences).toEqual([['M', 'E']]);
  });

  it('two student letters on one midpoint keep the notice', () => {
    type([CUBE, "M אמצע BB'", "E אמצע BB'"]);
    expect(points()).toEqual(expect.arrayContaining(['M', 'E']));
    expect(drawn().coincidences).toEqual([['M', 'E']]);
  });

  it('a student point on a DIFFERENT definition is not renamed', () => {
    type([CUBE, "אמצע BB'", "E אמצע CC'"]);
    expect(points()).toEqual(expect.arrayContaining(['M', 'E']));
    expect(drawn().coincidences).toEqual([]);
  });
});
