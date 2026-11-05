/**
 * #2341 (ADR-3D-423) — a point's coordinates restated in the other spelling are already known.
 *
 * Operator, playing round #2304 T29 (2026-10-17): *"the test passes but the 3rd line should not be accepted and we say
 * that it is already known"*. «B(√2,0,0)» · «B=(√2,0,0)» lower to different commands, so the #613 twin rule missed them
 * and the line became a ✓ row.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, useGeo3, type Fact3 } from '../store/store3';

const st = () => useGeo3.getState();

function build(lines: readonly string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» is context`).toBeNull();
  }
}
const verdict = (line: string) => decideDeterministic3(st(), line).kind;

beforeEach(() => build([]));

describe("#2341 — the operator's sequence", () => {
  it('«B=(√2,0,0)» after «B(√2,0,0)»: no row, the note, the figure unchanged', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    const before = derive3(st().facts, st().seed).positions.get('B');
    st().submit('B=(√2,0,0)');
    expect(st().facts.map((f) => f.utterance)).toEqual(['A(0,0,0)', 'B(√2,0,0)']);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-stated' });
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
    expect(verdict(line)).toBe('already-stated');
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

describe('#2341 — the boundary: these keep their row', () => {
  it("a coordinate line on a point the student never gave coordinates is their ANSWER (ADR-3D-075)", () => {
    build(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB']);
    expect(verdict('M=(1,0,0)')).toBe('record');
  });

  it('a wrong answer on such a point is still refused', () => {
    build(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB']);
    st().submit('M=(3,0,0)');
    expect(st().lastError?.code).toBe('claim-refuted');
  });

  it('a partly symbolic point states no numbers to compare', () => {
    build(['A(0,0,0)', 'B(a,0,0)', 'a = 2']);
    expect(verdict('B=(2,0,0)')).toBe('record');
  });

  it('a saved row replays as saved: a load never reads the submit decision', () => {
    build(['A(0,0,0)', 'B(√2,0,0)']);
    const old: Fact3 = { id: 'old', utterance: 'B=(√2,0,0)', cmds: [{ type: 'claim', claim: { type: 'coords-eq', id: 'B', x: Math.SQRT2, y: 0, z: 0 } }], enabled: true };
    expect(derive3([...st().facts, old], 0).status.old).toBe('ok');
  });
});
