/**
 * #1497 ([ADR-3D-426](../../docs/06b-decisions-3d.md#adr-3d-426)) — A GIVEN PRINTS AS THE STUDENT TYPED IT.
 *
 * Operator, 2026-09-28 (3-D): *"data was entered as 2/3 and datapanel shows 0.666 - we need to keep the format of
 * entry"*. Ruled for all tools the same day: a given prints as typed, a derived value goes through the tiers, and a
 * typed `√8` stays `√8`. Newer, sr-22 (ADR-W-175): a typed decimal reads two decimals when needed.
 *
 * Through the real store, canvas and panel.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dataView, statedVectorRows } from '../engine/dataView';

const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
function play(us: string[]) {
  reset();
  for (const u of us) st().submit(u);
  expect(st().lastError, us.join(' · ')).toBeNull();
  const d = derive3(st().facts, st().seed);
  return { d, panel: dataView(d.construction, 0) };
}
const OP = ['פירמידה משולשת ABCS', 'D על SB', 'נסמן: SB = u'];

describe('#1497 — the operator’s sequence: a coefficient', () => {
  beforeEach(reset);

  it('«SD = (2/3)u» reads «2/3u» in the given block, never 0.6667', () => {
    const { panel } = play([...OP, 'SD = (2/3)u']);
    expect(panel.stated.some((r) => r.endsWith('= 2/3u'))).toBe(true);
    expect(panel.stated.join(' ')).not.toContain('0.6667');
  });

  it.each([
    ['SD = 0.5u', '= 0.5u'],
    ['SD = 2/6u', '= 2/6u'],
    ['SD = 0.6667u', '= 0.67u'], // sr-22
  ])('«%s» reads «%s»', (line, tail) => {
    const { panel } = play([...OP, line]);
    expect(panel.stated.some((r) => r.endsWith(tail)), panel.stated.join(' | ')).toBe(true);
  });

  it('the decomposition row, which the tool derived, stays on the tiers', () => {
    const { panel } = play([...OP, 'SD = (2/3)u']);
    const sd = panel.vectors.find((v) => v.label === 'SD');
    expect(sd?.decomp ?? '').not.toContain('0.6667');
  });
});

describe('#1497 — a coordinate', () => {
  beforeEach(reset);

  it('«B(0.5,0,0)» · «C(0,1.25,0)» keep their decimals; the row and the canvas read one text', () => {
    const { panel } = play(['A(0,0,0)', 'B(0.5,0,0)', 'C(0,1.25,0)']);
    expect(panel.points).toEqual(['A(0, 0, 0)', 'B(0.5, 0, 0)', 'C(0, 1.25, 0)']);
    expect(panel.pointCoords.B.text).toBe('(0.5, 0, 0)');
    expect(panel.pointComps.C).toEqual(['0', '1.25', '0']);
  });

  it.each([
    ['B(2/3,0,0)', 'B(2/3, 0, 0)'],
    ['B(√8,0,0)', 'B(√8, 0, 0)'],
    ['B(4/6,0,0)', 'B(4/6, 0, 0)'],
    ['B(7.9999,0,0)', 'B(8, 0, 0)'], // sr-22
    ['B(-√2,0,0)', 'B(-√2, 0, 0)'],
  ])('«%s» reads «%s»', (line, row) => {
    expect(play(['A(0,0,0)', line]).panel.points).toContain(row);
  });

  it('a statement about a point that exists prints too', () => {
    const { panel } = play(['קטע AB', 'A(0,0,0)', 'B(0.5,0,0)']);
    expect(panel.points).toContain('B(0.5, 0, 0)');
  });

  it('a stated vector tuple reads the same way', () => {
    const { panel } = play(['v = (0.5,√8,7.9999)']);
    expect(panel.stated).toContain('v = (0.5, √8, 8)');
  });
});

describe('#1497 — a length: one text on the edge and in the panel', () => {
  beforeEach(reset);
  const TRI = ['משולש ABC'];
  const read = (line: string) => {
    const { d, panel } = play([...TRI, line]);
    const s = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    return { canvas: s.measures[0]?.text, panel: panel.vectors.find((v) => v.label === 'AB')?.mag };
  };

  it.each([
    ['AB = √8', '√8'],
    ['|AB| = √8', '√8'],
    ['אורך AB הוא √8', '√8'],
    ['AB = 4/6', '4/6'],
    ['AB = 0.5', '0.5'],
    ['AB = 2/3', '2/3'],
    ['AB = 1.25', '1.25'],
  ])('«%s» reads «%s»', (line, text) => {
    expect(read(line)).toEqual({ canvas: text, panel: `|AB| = ${text}` });
  });

  it('what the tool computed keeps its tiers: AB² is 8, and a square’s derived side is 2√2', () => {
    const { panel } = play(['ריבוע ABCD', 'AB = √8', 'קטע AD']);
    expect(panel.vectors.find((v) => v.label === 'AB')?.sq).toBe('AB² = 8');
    expect(panel.relations.join(' ')).not.toContain('2.83');
  });
});

describe('#1497 — free vectors', () => {
  beforeEach(reset);

  it('«u = 2.5v» and «|u| = 2.5|v|» keep the typed coefficient', () => {
    expect(play(['וקטור u', 'וקטור v', 'u = 2.5v']).panel.stated).toContain('u = 2.5v');
    expect(play(['וקטור u', 'וקטור v', '|u| = 2.5|v|']).panel.stated).toContain('|u| = 2.5|v|');
    expect(play(['וקטור u', 'וקטור v', '|u| = 2/3|v|']).panel.stated).toContain('|u| = 2/3|v|');
  });
});

describe('#1497 — old saves', () => {
  it('a claim with no spelling keeps the tiers, and a #2361 `decimal` mark still reads as the decimal', () => {
    const c = (claim: Record<string, unknown>) => ({ vectors: new Map(), claims: [claim] }) as never;
    expect(statedVectorRows(c({ type: 'vec-eq', lhs: [{ coeff: 1, atom: { kind: 'named', name: 'u' } }], rhs: [{ coeff: 2 / 3, atom: { kind: 'named', name: 'v' } }] }))).toEqual(['u = 2/3v']);
  });
});
