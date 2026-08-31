/**
 * #614 (ADR-3D-189) — CONTAINMENT GETS AN INPUT FORM: the tool can hear the phrase it prints.
 *
 * ADR-3D-154 added the panel's «מוכל במישור» row — the right call, since reporting a contained segment
 * as merely *parallel* would be a false statement. The consequence was an asymmetry the operator hit
 * within minutes: a student reads «CD מוכל במישור ABC» in ארגון נתונים, types that same sentence on
 * another figure, and is refused. ADR-3D-105 had left `contains` planned and unbuilt.
 *
 * The property this issue is really about is the ROUND TRIP: what the panel says, the input must accept.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { parse3 } from '../parser/parse3';
import { containmentDeviation } from '../engine/operands';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const state = () => useGeo3.getState();
function build(lines: string[]) {
  reset();
  const errs: string[] = [];
  for (const l of lines) {
    useGeo3.getState().submit(l);
    const e = state().lastError;
    if (e) errs.push(`${l} → ${JSON.stringify(e)}`);
  }
  return errs;
}
const CUBE = ["קובייה ABCDA'B'C'D'"];

describe('#614 — every operand kind, both frames, both languages, ONE command', () => {
  beforeEach(reset);

  it.each([
    ['AB מוכל במישור ABCD'],
    ['הקטע AB מונח על המישור ABCD'],
    ['AB נמצא במישור ABCD'],
    ['המישור ABCD מכיל את AB'],
    ['segment AB is contained in plane ABCD'],
    ['AB lies in plane ABCD'],
    ['plane ABCD contains AB'],
  ])('«%s» parses to the containment command', (line) => {
    const r = parse3(line);
    expect(r.ok, line).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'plane-rel', rel: 'contained' });
  });

  it('the two FRAMES reach the identical command — reach for one and the other silently drops', () => {
    const verb = parse3('AB מוכל במישור ABCD');
    const container = parse3('המישור ABCD מכיל את AB');
    expect(verb.ok && container.ok).toBe(true);
    expect(verb.ok && container.ok && container.commands).toEqual(verb.ok ? verb.commands : null);
  });

  it('a NAMED LINE goes through the S2 lane and lowers to line-rel', () => {
    const r = parse3('הישר ℓ מוכל במישור ABCD');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'line-rel', rel: 'contained', line: 'ℓ' });
  });

  it('a POLYGON RUN is the same relation — #532 capability 2', () => {
    for (const line of ["A'B'C'D' מונח על מישור π2", 'ACS מוכל במישור π2']) {
      const r = parse3(line);
      expect(r.ok, line).toBe(true);
      expect(r.ok && r.commands[0]).toMatchObject({ type: 'plane-rel', rel: 'contained' });
    }
  });

  it('a container that is NOT planar states nothing and is refused', () => {
    expect(parse3('AB מוכל בקטע CD').ok).toBe(false);
  });
});

describe('#614 — M1: it verifies, and it refuses honestly', () => {
  beforeEach(reset);

  it('a TRUE containment is accepted on a figure with no free dims (the #698 class, in the solver)', () => {
    // «nothing to flex» is not «no solution»: this errored `givens-contradict` before the fix
    expect(build([...CUBE, 'AB מוכל במישור ABCD'])).toEqual([]);
  });

  it('the CONTAINER frame is accepted the same way', () => {
    expect(build([...CUBE, 'המישור ABCD מכיל את AB'])).toEqual([]);
  });

  it('a FALSE containment refuses rather than drawing a figure that violates it', () => {
    const errs = build([...CUBE, "AA' מוכל במישור ABCD"]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('claim-refuted');
  });

  it('a named line lying in a face is accepted on an anchored cube', () => {
    expect(
      build([...CUBE, 'הישר ℓ: x = (0,0,0) + t(1,0,0)', 'A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)', 'הישר ℓ מוכל במישור ABCD']),
    ).toEqual([]);
  });
});

describe('#614 — THE ROUND TRIP: the input accepts what the panel prints', () => {
  beforeEach(reset);

  it('a figure whose panel says «BE מוכל במישור ABCD» accepts that exact sentence', () => {
    // the panel row (flood control suppresses a segment made only of the plane's OWN run, so E is needed)
    build([...CUBE, 'מישור ABCD', 'E אמצע AC', 'קטע BE']);
    const st = state();
    const row = dataView(derive3(st.facts, st.seed).construction, st.seed).mutual.find((m) => m.rel === 'contained');
    expect(row, 'the panel prints a containment row').toMatchObject({ a: 'BE', b: 'ABCD' });

    // …and the same sentence, typed on a fresh figure, is accepted
    expect(build([...CUBE, 'מישור ABCD', 'E אמצע AC', 'קטע BE', 'BE מוכל במישור ABCD'])).toEqual([]);
  });

  it('both lanes read ONE predicate, so they cannot drift about what «מוכל» means', () => {
    const line = { point: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } };
    const plane = { normal: { x: 0, y: 0, z: 1 }, d: 0 };
    const off = { normal: { x: 0, y: 0, z: 1 }, d: -5 };
    expect(containmentDeviation(line, plane)).toBeCloseTo(0, 12);
    expect(containmentDeviation(plane, line)).toBeCloseTo(0, 12); // order-independent
    expect(containmentDeviation(line, off)!).toBeGreaterThan(0.1); // parallel but OFF the plane
  });

  it('a PLANAR operand contained in a plane is the same statement as the planes coinciding', () => {
    const a = { normal: { x: 0, y: 0, z: 2 }, d: 0 };
    const b = { normal: { x: 0, y: 0, z: 1 }, d: 0 };
    expect(containmentDeviation(a, b)).toBeCloseTo(0, 12);
  });

  it('the ∥ sibling stays what it was — a contained object is not re-read as merely parallel', () => {
    // segment × point-run ∥ is a FROZEN owner (segPlaneRel), so this asserts the property rather than
    // the shape: it still parses, and containment did not annex its cell.
    const r = parse3("AB מקביל למישור A'B'C'D'");
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.ok ? r.commands : null)).not.toContain('contained');
  });
});
