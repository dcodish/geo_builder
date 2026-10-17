/**
 * #2081 ([ADR-3D-362](../../docs/06b-decisions-3d.md#adr-3d-362)) — the value readers ADR-3D-337 §4 held.
 *
 * Measured at de7c221f through `decideSubmit3`: «A=(√2,0,0)» was `not-understood` while «A(√2,0,0)» built;
 * «המרחק בין S למישור ABC הוא √2» was `not-understood` while «… הוא 2» built; «X_B=3» was `not-understood`
 * while «x_B=3» built. Operator ruling 2026-10-14 (cards `d14b-2081-roots` A and `d14b-2081-upper` A): read them.
 *
 * Every verdict goes through `decideSubmit3`, the real submit decision; the figure is read from `derive3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { normalize3, parse3 } from '../parser/parse3';

type St = { facts: Fact3[]; seed: number };
let n = 0;
const newId = () => `f${++n}`;

/** Submit each line in turn; every line but the last must record. Returns the state and the last verdict. */
function build(lines: string[]): { st: St; last: ReturnType<typeof decideSubmit3> } {
  let st: St = { facts: [], seed: 0 };
  let last: ReturnType<typeof decideSubmit3> = { kind: 'not-understood' };
  lines.forEach((u, i) => {
    last = decideSubmit3(st, u, newId);
    if (i < lines.length - 1) expect(last.kind, `«${u}» in ${JSON.stringify(lines)}: ${JSON.stringify(last)}`).toBe('record');
    if (last.kind === 'record') st = { facts: last.facts, seed: last.seed };
  });
  return { st, last };
}

function recordsGreen(lines: string[]): St {
  const { st, last } = build(lines);
  expect(last.kind, `${JSON.stringify(lines)}: ${JSON.stringify(last)}`).toBe('record');
  const d = derive3(st.facts, st.seed);
  for (const f of st.facts) expect(d.status[f.id], `«${f.utterance}»`).toBe('ok');
  return st;
}

const BOX = "תיבה ABCDA'B'C'D'";

describe('#2081 item 1 — a radical in the coordinate-claim slot «A = (…)»', () => {
  it.each(['A=(√1,0,0)', 'A = (1,0,0)'])('«A(1,0,0)» ⏎ «%s» records and verifies', (claim) => {
    recordsGreen(['A(1,0,0)', claim]);
  });

  it.each(['B=(√2,0,0)', 'B = (√(2),0,0)', 'B=(sqrt(2),0,0)', 'B=(2√2/2,0,0)'])(
    'a TRUE radical claim verifies: «A(0,0,0)» ⏎ «B(√2,0,0)» ⏎ «%s»',
    (claim) => {
      recordsGreen(['A(0,0,0)', 'B(√2,0,0)', claim]);
    },
  );

  it('a FALSE radical claim is refused as a wrong claim, like its decimal twin', () => {
    const { last } = build(['A(0,0,0)', 'B(√2,0,0)', 'B=(√3,0,0)']);
    expect(last).toMatchObject({ kind: 'refused', error: { code: 'claim-refuted' } });
    const twin = build(['A(0,0,0)', 'B(2,0,0)', 'B=(3,0,0)']);
    expect(twin.last).toMatchObject({ kind: 'refused', error: { code: 'claim-refuted' } });
  });

  it.each(['A=(√2,0,0)', 'A=(-√2,0,0)', 'A=(2√3,1,0)', 'A=(√2/2,0,0)', 'A=(0,0,√(3/4))', 'A=(1/2,0,0)', 'A=(½,0,0)', 'A=(sqrt(2),0,0)'])(
    'on a box, «%s» gets the verdict of its decimal twin «A=(0,0,0)»',
    (claim) => {
      const twin = build([BOX, 'A=(0,0,0)']).last.kind;
      expect(build([BOX, claim]).last.kind).toBe(twin);
    },
  );

  it('the components carry the stated values', () => {
    const r = parse3('A=(-√2,½,√(3/4))');
    expect(r.ok).toBe(true);
    const c = r.ok ? r.commands.find((k) => k.type === 'claim') : undefined;
    expect(c && c.type === 'claim' && c.claim.type === 'coords-eq' ? [c.claim.x, c.claim.y, c.claim.z] : null).toEqual([
      -Math.SQRT2,
      0.5,
      Math.sqrt(0.75),
    ]);
  });

  it('the controls are left alone: the ratio slot and a symbolic claim', () => {
    expect(build([BOX, 'AB:AD = 1:√2']).last.kind).toBe('not-understood');
    expect(build([BOX, 'A=(0,0,t)']).last.kind).toBe('not-understood');
  });
});

describe('#2081 item 1 — a radical in the distance slot', () => {
  it('«פירמידה SABCD» ⏎ «המרחק בין S למישור ABC הוא √2» drives the distance to √2', () => {
    const st = recordsGreen(['פירמידה SABCD', 'המרחק בין S למישור ABC הוא √2']);
    const d = derive3(st.facts, st.seed);
    const [s, a, b, c] = ['S', 'A', 'B', 'C'].map((k) => d.positions.get(k)!);
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const nrm = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const len = Math.hypot(nrm.x, nrm.y, nrm.z);
    const dist = Math.abs(nrm.x * (s.x - a.x) + nrm.y * (s.y - a.y) + nrm.z * (s.z - a.z)) / len;
    expect(dist).toBeCloseTo(Math.SQRT2, 6);
  });

  it.each([
    'המרחק בין S למישור ABC הוא 3/2',
    'המרחק בין S למישור ABC הוא √(3/4)',
    'המרחק מ S לישר AB הוא 2√3',
    'the distance between S and plane ABC is sqrt(2)',
  ])('«%s» builds as «… הוא 2» does', (line) => {
    const twin = build(['פירמידה SABCD', 'המרחק בין S למישור ABC הוא 2']).last.kind;
    expect(twin).toBe('record');
    recordsGreen(['פירמידה SABCD', line]);
  });
});

describe('#2081 item 2 — the uppercase axis letter of a coordinate token', () => {
  const PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['X_B=3', 'x_B=3'],
    ['X_{B}=3', 'x_{B}=3'],
    ['B_X=3', 'B_x=3'],
    ['B_{X}=3', 'B_{x}=3'],
    ['Z_B=3', 'z_B=3'],
    ['Y_B=-1', 'y_B=-1'],
    ['X_B>0', 'x_B>0'],
    ["X_B'=3", "x_B'=3"],
  ];
  const CONTEXTS: ReadonlyArray<readonly string[]> = [[BOX], ['B(1,2,3)'], []];

  it.each(PAIRS)('«%s» gets exactly the verdict of «%s», on a box, on a stated point and on an empty canvas', (up, low) => {
    for (const ctx of CONTEXTS) {
      const a = build([...ctx, up]).last;
      const b = build([...ctx, low]).last;
      expect(a.kind, `${JSON.stringify(ctx)} «${up}»`).toBe(b.kind);
      if (a.kind === 'record' && b.kind === 'record') {
        expect(a.facts[a.facts.length - 1].cmds).toEqual(b.facts[b.facts.length - 1].cmds);
      }
    }
  });

  it('the recorded line is the one the student typed', () => {
    const { last } = build([BOX, 'X_B=3']);
    expect(last.kind).toBe('record');
    if (last.kind === 'record') expect(last.facts[last.facts.length - 1].utterance).toBe('X_B=3');
  });

  it.each(['A_1', 'X_1', 'X_{12}', 'XB', 'XB = 3', 'AX_BC', 'S_{XYZ}'])('the fold leaves «%s» as typed', (s) => {
    expect(normalize3(s)).toBe(s);
  });
});
