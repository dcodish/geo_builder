/**
 * #1698 (ADR-566) — a trigonometric given is a RATIO, never a number of degrees.
 *
 * Measured on main a8938c2d through `decideDeterministic2D`: every trig given on «משולש ABC» committed a
 * `set-angle` of the value's leading number IN DEGREES — «tan∢ABC = 2» drew a 2° angle, «cos∢ACB = 3/4» a
 * 3° one (the «/4» lost), «sin…» the same, «tan∢ABC > 1» a bound of 1°, «tan∢ABC = α» bound α to the angle
 * itself — every one a figure drawn green for a given nobody stated.
 *
 * These locks CALL the real decision (`decideDeterministic2D`, the submit gate's pre-LLM lane) and the
 * real `replay`; none re-implements the lowering. The expected angles are the trig inverses of the
 * student's value — the meaning of the sentence, not the parser's arithmetic.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { factsOf } from './scenario-pipeline';
import { at, angle, allStepsOk } from './scenarios-harness';

const DEG = 180 / Math.PI;

async function decide(prefix: string[], line: string): Promise<Verdict2D> {
  const facts = factsOf(prefix);
  const d = replay(facts, 0);
  return decideDeterministic2D({ facts, seed: 0, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

const committed = (v: Verdict2D): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
/** The angle (degrees) the committed line asserts, read off the committed command — whichever kind it is. */
const assertedDeg = (v: Verdict2D): number | undefined => {
  for (const c of committed(v)) {
    if (c.type === 'set-angle') return c.value;
    if (c.type === 'measure-angle' && 'value' in c.expr) return c.expr.value;
  }
  return undefined;
};

const TRI = ['משולש ABC'];

describe('#1698 — every spelling of a tan / cos given asserts the trig inverse of its value', () => {
  const CASES: [string, number][] = [
    ['tan∢ABC = 2', Math.atan(2) * DEG],
    ['tan(∢ABC) = 2', Math.atan(2) * DEG],
    ['tan∠ABC=2', Math.atan(2) * DEG],
    ['tg∢ABC = 2', Math.atan(2) * DEG],
    ['tan B = 2', Math.atan(2) * DEG],
    ['טנגנס הזווית ABC הוא 2', Math.atan(2) * DEG],
    ['נתון כי טנגנס הזווית ABC שווה ל-2', Math.atan(2) * DEG],
    ['נתון: tan∢ABC = 2', Math.atan(2) * DEG],
    ['tan of angle ABC = 2', Math.atan(2) * DEG],
    ['tan∢ABC = 3/4', Math.atan(0.75) * DEG],
    ['tan∢ABC = √3', 60],
    ['tan∢ABC = -2', 180 - Math.atan(2) * DEG], // negative tan: the obtuse angle
    ['cot∢ABC = 2', Math.atan(0.5) * DEG],
    ['קוסינוס הזווית ACB = 3/4', Math.acos(0.75) * DEG],
    ['cos∢ACB = 3/4', Math.acos(0.75) * DEG],
    ['cos∢ABC = -1/2', 120],
    ['the cosine of angle ABC is 0.5', 60],
  ];
  for (const [line, want] of CASES) {
    it(`«${line}» commits ∠ = ${want.toFixed(2)}°`, async () => {
      const v = await decide(TRI, line);
      expect(v.kind, `«${line}» is read deterministically`).toBe('commit');
      expect(assertedDeg(v)).toBeCloseTo(want, 9);
    });
  }

  // #1718 (ADR-572) amends ADR-566's «tan=2» label: the figure prints the ANGLE the given draws.
  it('the figure prints the resulting angle («63.43°»), never the ratio «tan=2»', async () => {
    const v = await decide(TRI, 'tan∢ABC = 2');
    const m = committed(v).find((c) => c.type === 'measure-angle');
    expect(m && m.type === 'measure-angle' && 'value' in m.expr ? m.expr.text : 'absent', 'no typed text rides the measure').toBeUndefined();
    const fig = replay(factsOf([...TRI, 'tan∢ABC = 2']), 0);
    const atB = fig.labels.angles.filter((l) => l.vertex === 'B');
    expect(atB.map((l) => l.text), 'the wedge at B carries the angle').toEqual(['63.43°']);
  });
});

describe('#1698 — the DRAWN angle equals the trig inverse at every seed', () => {
  const DRAWN: [string, string, number][] = [
    ['tan∢ABC = 2', 'B', Math.atan(2) * DEG],
    ['cos∢ACB = 3/4', 'C', Math.acos(0.75) * DEG],
    ['tan∢ABC = -2', 'B', 180 - Math.atan(2) * DEG],
    ['טנגנס הזווית ABC הוא 2', 'B', Math.atan(2) * DEG],
  ];
  for (const [line, vertex, want] of DRAWN) {
    it(`«${line}»: ∠ at ${vertex} = ${want.toFixed(2)}° at seeds 0–5`, () => {
      const facts = factsOf([...TRI, line]);
      for (let seed = 0; seed < 6; seed++) {
        const fig = replay(facts, seed);
        allStepsOk(fig);
        const [p, q] = vertex === 'B' ? ['A', 'C'] : ['A', 'B'];
        expect(angle(at(fig, p), at(fig, vertex), at(fig, q)), `seed ${seed}`).toBeCloseTo(want, 4);
      }
    });
  }
});

describe('#1698 — what names no single angle is refused by name, never drawn and never escalated', () => {
  const REFUSED: [string, string][] = [
    ['cos∢ABC = 2', 'input.trigGiven.out-of-range'],
    ['קוסינוס הזווית ACB = 5/4', 'input.trigGiven.out-of-range'],
    ['sin∢ACB = 3/4', 'input.trigGiven.sine-two-angles'],
    ['סינוס הזווית ACB = 3/4', 'input.trigGiven.sine-two-angles'],
    ['tan∢ABC > 1', 'input.trigGiven.form'],
    ['tan∢ABC = α', 'input.trigGiven.form'],
    ['זווית B שטנגנס שלה 2', 'input.trigGiven.form'],
  ];
  for (const [line, key] of REFUSED) {
    it(`«${line}» → ${key}`, async () => {
      const v = await decide(TRI, line);
      expect(v.kind).toBe('refuse');
      expect(v.kind === 'refuse' && 'key' in v.note ? v.note.key : undefined).toBe(key);
    });
  }
  it('the refusal never consults the model', () => expect(llmParseMock).not.toHaveBeenCalled());
});

describe('#1698 — a fraction in degrees is one value, never its numerator', () => {
  it('«∢ABC = 90/2» asserts 45°', async () => {
    expect(assertedDeg(await decide(TRI, '∢ABC = 90/2'))).toBeCloseTo(45, 9);
  });
});

describe('#1698 — stability: the trig given is the same constraint as its angle in degrees', () => {
  /** Replace the trig line's measure by the plain degree given it means — the twin a student could type. */
  const degreeTwin = (facts: Fact[]): Fact[] =>
    facts.map((f) =>
      f.cmd.type === 'measure-angle' && 'value' in f.cmd.expr
        ? { ...f, cmd: { type: 'set-angle', vertex: f.cmd.vertex, ray1: f.cmd.ray1, ray2: f.cmd.ray2, value: f.cmd.expr.value } as AnyCommand }
        : f,
    );
  it('«tan∢ABC = 2» moves the figure exactly as «∢ABC = 63.43…°» does, at every seed', () => {
    const facts = factsOf([...TRI, 'tan∢ABC = 2']);
    const twin = degreeTwin(facts);
    expect(twin.some((f, i) => f.cmd !== facts[i].cmd), 'the twin really differs').toBe(true);
    for (let seed = 0; seed < 4; seed++) {
      const a = replay(facts, seed), b = replay(twin, seed);
      for (const id of ['A', 'B', 'C']) {
        const p = at(a, id), q = at(b, id);
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${id} at seed ${seed}`).toBeLessThan(1e-9);
      }
    }
  });
  it('a later additive line leaves every point of the tan figure where it was', () => {
    const before = replay(factsOf([...TRI, 'tan∢ABC = 2']), 0);
    const after = replay(factsOf([...TRI, 'tan∢ABC = 2', 'M אמצע AC']), 0);
    allStepsOk(after);
    for (const id of ['A', 'B', 'C']) {
      const p = at(before, id), q = at(after, id);
      expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeLessThan(1e-9);
    }
  });
});
