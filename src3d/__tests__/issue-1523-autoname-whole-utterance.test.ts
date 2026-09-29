/**
 * #1523 (ADR-3D-287) — «x אמצע SA» drew the midpoint under ANOTHER letter and said nothing about `x`.
 *
 * Operator, playing round #1517 T5: «when i write x אמצע SA it shows M as the middle of SA and says nothing
 * about x. If i write capital X the shape is correct.» Measured on main 842ede39: «x אמצע SA» lowered to
 * `midpoint-auto {a:S, b:A}` — the subject-less arm counted two label tokens and threw the lowercase
 * subject away; so did «hello אמצע SA», «אמצע SA הוא x» and «אמצע AB = 3».
 *
 * Two halves, both at their chokepoints:
 *  1. the subject position of a midpoint statement is an FR-SP-8 ANCHOR — a single lowercase letter there
 *     folds to its label in `normalize3` (x/y/z included: an axis is never "the midpoint of SA");
 *  2. the subject-less arm invents the point's name, so it matches only a sentence that is NOTHING BUT
 *     the midpoint noun phrase — any other word means "not this rule", never "ignore it".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { normalize3, parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
type V = { x: number; y: number; z: number };
const dist = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe('#1523 — the operator\'s exact sequence', () => {
  beforeEach(reset);

  it('pyramid · X על SA · M אמצע SX · delete X · «x אמצע SA» → X at SA\'s midpoint, M\'s row valid again', () => {
    submit('פירמידה SABCD');
    submit('X על SA');
    submit('M אמצע SX');
    const xRow = state().facts.find((f) => f.utterance === 'X על SA')!;
    state().remove(xRow.id);
    submit('x אמצע SA');
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    // the student's letter, not an invented one
    expect(pos.get('X')).toBeDefined();
    expect(pos.get('N')).toBeUndefined();
    expect(dist(pos.get('X')!, pos.get('S')!)).toBeCloseTo(dist(pos.get('X')!, pos.get('A')!), 9);
    expect(dist(pos.get('X')!, pos.get('S')!) + dist(pos.get('X')!, pos.get('A')!)).toBeCloseTo(dist(pos.get('S')!, pos.get('A')!), 9);
  });

  it('a TAKEN letter gets the existing refusal (the statement is a given about X, never a fresh point)', () => {
    submit('פירמידה SABCD');
    submit('X על SB');
    submit('x אמצע SA');
    expect(state().lastError).toMatchObject({ code: 'claim-refuted' });
    expect(state().facts.map((f) => f.utterance)).toEqual(['פירמידה SABCD', 'X על SB']);
  });
});

describe('#1523 — the subject position is an FR-SP-8 anchor', () => {
  const twins: [string, string][] = [
    ['x אמצע SA', 'X אמצע SA'],
    ['y אמצע SA', 'Y אמצע SA'],
    ['m אמצע SA', 'M אמצע SA'],
    ['k אמצע SA', 'K אמצע SA'],
    ['u אמצע SA', 'U אמצע SA'],
    ['x1 אמצע SA', 'X1 אמצע SA'],
    ["x' אמצע SA", "X' אמצע SA"],
    ['x היא אמצע SA', 'X היא אמצע SA'],
    ['x אמצע הקטע SA', 'X אמצע הקטע SA'],
    ['הנקודה x אמצע SA', 'הנקודה X אמצע SA'],
    ['x is the midpoint of SA', 'X is the midpoint of SA'],
    ['point x is the midpoint of SA', 'point X is the midpoint of SA'],
  ];
  for (const [lower, upper] of twins) {
    it(`«${lower}» parses exactly like «${upper}»`, () => {
      expect(normalize3(lower)).toBe(normalize3(upper));
      const r = parse3(lower);
      expect(r).toEqual(parse3(upper));
      expect(r).toMatchObject({ ok: true, commands: [{ type: 'point-on-segment3', t: 0.5 }] });
    });
  }

  it('the anchor is the midpoint frame, nothing wider: the lone-axis and adjective boundaries hold', () => {
    expect(normalize3('נקודה x')).toBe('נקודה x'); // #181's axis exemption, where no frame proves a label
    expect(normalize3('x אמצעי SA')).toBe('x אמצעי SA'); // «אמצעי» is the perp-bisector adjective (#330)
    expect(normalize3('x על SA')).toBe('x על SA'); // un-anchored remainder stays with the #353 convention
  });
});

describe('#1523 — the subject-less arm consumes the WHOLE utterance', () => {
  for (const u of ['xy אמצע SA', 'hello אמצע SA', 'x midpoint of SA', 'אמצע SA הוא x', 'אמצע AB = 3', 'נקודה אמצע SA']) {
    it(`«${u}» never mints a letter (declines instead)`, () => {
      const r = parse3(u);
      expect(r.ok && r.commands.some((c) => c.type === 'midpoint-auto'), JSON.stringify(r)).toBe(false);
    });
  }

  for (const [u, a, b] of [
    ['אמצע SA', 'S', 'A'],
    ["אמצע BB'", 'B', "B'"],
    ['אמצע הקטע SA', 'S', 'A'],
    ['נקודת האמצע של SA', 'S', 'A'],
    ['אמצע אלכסון BD', 'B', 'D'],
    ["midpoint of BB'", 'B', "B'"],
    ['the midpoint of SA', 'S', 'A'],
    ["Midpoint of BB'", 'B', "B'"],
    ['middle of AB', 'A', 'B'],
  ] as const) {
    it(`«${u}» still auto-names`, () => {
      expect(parse3(u)).toEqual({ ok: true, commands: [{ type: 'midpoint-auto', a, b }] });
    });
  }
});

describe('#1523 — class sweep: no catalog statement silently drops a lowercase subject', () => {
  // Every catalog line that opens with a single-letter subject, re-typed with that subject lowercase (and
  // as `x`, the reported letter). The lowering must either keep the letter or decline — never succeed
  // while the letter appears nowhere in the commands.
  const cases: string[] = [];
  for (const e of COMMAND_CATALOG_3D) {
    for (const u of [e.he, e.en]) {
      const m = u.match(/^([A-Z])(\d*'?)\s+(.*)$/);
      if (!m || !parse3(u).ok) continue;
      for (const letter of [m[1].toLowerCase(), 'x']) cases.push(`${letter}${m[2]} ${m[3]}`);
    }
  }

  it('the sweep is exercised', () => expect(cases.length).toBeGreaterThan(40));

  it('every lowercase-subject line keeps its letter or declines', () => {
    const dropped: string[] = [];
    for (const u of cases) {
      const r = parse3(u);
      if (!r.ok) continue;
      const subject = u.split(/\s/)[0];
      const J = JSON.stringify(r.commands);
      if (!J.includes(`"${subject.toUpperCase()}"`) && !J.includes(`"${subject}"`)) dropped.push(u);
    }
    expect(dropped).toEqual([]);
  });
});
