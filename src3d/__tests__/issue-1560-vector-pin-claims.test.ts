/**
 * #1560 (ADR-3D-284) — a vector or dot product stated on EXISTING points is a given the tool must honour or
 * refuse, never a green row over a figure that contradicts it.
 *
 * «u = (…)» / «AB = (…)» / «u·v = 24» lower to pivot pins (`inject-vector`, `inject-pair`, `dot-given`). A pin
 * is read only where the pivot runs — a solid, or a never-positioned point. Over typed points it never runs,
 * and no claim was recorded beside the pin, so «u = (7,7,7)» read green beside u = (2,0,0). The fix records
 * a `given: true` claim beside each pin (`vec-val` / `dot-val`, the ADR-3D-030/282 "pin drives, claim
 * arbitrates" pattern) and lifts ADR-3D-282's "a given is judged on a placed figure only" rule from the
 * `coords-eq` case to the claim level.
 *
 * Every verdict goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { claimSeeds } from '../engine/claims';
import { resolve3 } from '../engine/evaluate';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { emptyConstruction3, type Claim3, type Command3, type Construction3 } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`setup line «${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

/** The figure's actual vector from→to at a seed. */
const vecAt = (facts: Fact3[], from: string, to: string, seed: number): number[] => {
  const pos = derive3(facts, seed).positions;
  const a = pos.get(from);
  const b = pos.get(to);
  if (!a || !b) throw new Error(`no ${from}/${to}`);
  return [b.x - a.x, b.y - a.y, b.z - a.z];
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

// the issue's setups
const TYPED = ['A(0,0,0)', 'B(2,0,0)', 'D(0,3,0)', 'נסמן: AB = u, AD = v'];
const PAIR = ['A(0,0,0)', 'B(2,0,0)'];
const MID = ['A(0,0,0)', 'C(2,0,0)', 'M אמצע AC'];
const CUBE = ["קובייה ABCDA'B'C'D'"];
const CUBE_UV = ["קובייה ABCDA'B'C'D'", 'נסמן: AB = u, AD = v'];

describe('#1560 — a false vector or dot product over typed points is refused (claim-refuted)', () => {
  // [row, setup, line, the vector the figure actually has (from, to, value)]
  const refuses: [string, string[], string, [string, string, number[]]][] = [
    ['M1 named vector, fully stated', TYPED, 'u = (7,7,7)', ['A', 'B', [2, 0, 0]]],
    ['M2 named vector, x stated, y/z symbolic', TYPED, 'u = (7, n, p)', ['A', 'B', [2, 0, 0]]],
    ['M3 pair', PAIR, 'AB = (5,5,5)', ['A', 'B', [2, 0, 0]]],
    ['M4 pair written the other way round', PAIR, 'BA = (5,5,5)', ['A', 'B', [2, 0, 0]]],
    ['M5 pair with the noun', PAIR, 'וקטור AB = (5,5,5)', ['A', 'B', [2, 0, 0]]],
    ['M6 pair, x stated, y/z symbolic', PAIR, 'AB = (5, n, p)', ['A', 'B', [2, 0, 0]]],
    ['M7 pair, x stated, y/z one-letter affine', PAIR, 'AB = (5, k, 2k)', ['A', 'B', [2, 0, 0]]],
    ['M8 pair onto a derived midpoint', MID, 'AM = (5,5,5)', ['A', 'M', [1, 0, 0]]],
  ];
  for (const [title, setup, line, [from, to, actual]] of refuses) {
    it(`${title}: «${line}» is refused and the figure is unchanged`, () => {
      const st = build(setup);
      // the figure really has a different vector at every verification seed — the refusal is the truth
      for (const s of claimSeeds(0)) expect(close(vecAt(st.facts, from, to, s), actual)).toBe(true);
      const v = decideSubmit3(st, line);
      expect(v.kind).toBe('refused');
      if (v.kind === 'refused') expect(v.error.code).toBe('claim-refuted');
      for (const s of claimSeeds(0)) expect(close(vecAt(st.facts, from, to, s), actual)).toBe(true);
    });
  }

  it('M9 a false dot product: «u·v = 24» is refused (u·v = 0 at every seed)', () => {
    const st = build(TYPED);
    for (const s of claimSeeds(0)) expect(dot(vecAt(st.facts, 'A', 'B', s), vecAt(st.facts, 'A', 'D', s))).toBeCloseTo(0, 9);
    const v = decideSubmit3(st, 'u·v = 24');
    expect(v.kind === 'refused' && v.error.code).toBe('claim-refuted');
  });
});

describe('#1560 — a TRUE restatement stays green', () => {
  const guards: [string, string[], string][] = [
    ['G1', TYPED, 'u = (2,0,0)'],
    ['G2', TYPED, 'u = (2, n, p)'],
    ['G3', PAIR, 'AB = (2,0,0)'],
    ['G4', PAIR, 'BA = (-2,0,0)'],
    ['G5', TYPED, 'u·v = 0'],
  ];
  for (const [row, setup, line] of guards) {
    it(`${row}: «${line}» records ok`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('record');
      if (v.kind === 'record') expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
    });
  }
});

describe('#1560 — the solid and free-vector lanes are unchanged (the pivot still drives)', () => {
  // [row, setup, line, from, to, the stated vector the figure must carry]
  const drives: [string, string[], string, string, string, number[]][] = [
    ['S1', CUBE_UV, 'u = (3,0,0)', 'A', 'B', [3, 0, 0]],
    ['S2', CUBE_UV, 'u = (2,1,2)', 'A', 'B', [2, 1, 2]],
    ['S3', CUBE, 'AB = (3,0,0)', 'A', 'B', [3, 0, 0]],
    ['S4', CUBE, 'AB = (2,1,2)', 'A', 'B', [2, 1, 2]],
    ['S7', ['וקטור AB', 'נסמן: AB = u'], 'u = (5,5,5)', 'A', 'B', [5, 5, 5]],
    ['S8', ['וקטור AB'], 'AB = (5,5,5)', 'A', 'B', [5, 5, 5]],
  ];
  for (const [row, setup, line, from, to, want] of drives) {
    it(`${row}: «${line}» records ok and the figure carries it at every claim seed`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
      for (const s of claimSeeds(v.seed)) {
        const got = vecAt(v.facts, from, to, s);
        expect(got.map((x, i) => Math.abs(x - want[i]) < 1e-4)).toEqual([true, true, true]);
      }
    });
  }

  const dots: [string, string[], string, [string, string], [string, string], number][] = [
    ['S5', [...CUBE, "נסמן: AB = u, AC' = v"], 'u·v = 9', ['A', 'B'], ['A', "C'"], 9],
    ['S6', CUBE_UV, 'u·v = 0', ['A', 'B'], ['A', 'D'], 0],
  ];
  for (const [row, setup, line, [a1, b1], [a2, b2], want] of dots) {
    it(`${row}: «${line}» records ok and the dot product holds at every claim seed`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
      for (const s of claimSeeds(v.seed)) expect(dot(vecAt(v.facts, a1, b1, s), vecAt(v.facts, a2, b2, s))).toBeCloseTo(want, 4);
    });
  }

  // the pin-owner guard keeps speaking where the pivot finds no placement: the claim-level `given` rule
  // makes the new claims vacuous there, so the refusal is the one the student saw before
  const refusals: [string, string[], string, string][] = [
    ['S9', [...CUBE, 'A(0,0,0)', 'B(2,0,0)', 'נסמן: AB = u, AD = v'], 'u = (7,7,7)', 'injection-unsatisfiable'],
    ['S10', [...CUBE, 'A(0,0,0)', 'B(2,0,0)'], 'AB = (5,5,5)', 'givens-contradict'],
    ['S11', CUBE_UV, 'u·v = 24', 'givens-contradict'],
    ['S13 pair, a free vector elsewhere', ['וקטור KL', 'A(0,0,0)', 'B(2,0,0)'], 'AB = (5,5,5)', 'givens-contradict'],
  ];
  for (const [row, setup, line, code] of refusals) {
    it(`${row}: «${line}» still refuses ${code}`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('refused');
      if (v.kind === 'refused') expect(v.error.code).toBe(code);
    });
  }
});

describe('#1560 — structural: each anchor-lane pin records its given claim beside it', () => {
  const fold = (lines: readonly string[]): Construction3 => {
    let c = emptyConstruction3();
    for (const f of build(lines).facts) for (const cmd of f.cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error(`fold: ${JSON.stringify(r.error)}`);
      c = r.next;
    }
    return c;
  };
  const added = (c: Construction3, cmd: Command3): Claim3[] => {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.next.claims.slice(c.claims.length);
  };
  const c = fold(TYPED);

  it('inject-vector adds one vec-val over the named atom, given: true', () => {
    expect(added(c, { type: 'inject-vector', name: 'u', x: 7, y: 7, z: 7 })).toEqual([
      { type: 'vec-val', atom: { kind: 'named', name: 'u' }, x: 7, y: 7, z: 7, given: true },
    ]);
  });
  it('inject-pair adds one vec-val over the pair atom, given: true', () => {
    expect(added(c, { type: 'inject-pair', a: 'B', b: 'A', x: 5, y: 5, z: 5 })).toEqual([
      { type: 'vec-val', atom: { kind: 'pair', from: 'B', to: 'A' }, x: 5, y: 5, z: 5, given: true },
    ]);
  });
  it('dot-given adds one dot-val, given: true', () => {
    expect(added(c, { type: 'dot-given', v1: 'u', v2: 'v', value: 24 })).toEqual([
      { type: 'dot-val', a: { kind: 'named', name: 'u' }, b: { kind: 'named', name: 'v' }, value: 24, given: true },
    ]);
  });
  it('a partial statement records nulls; an all-unstated one records nothing', () => {
    expect(added(c, { type: 'inject-vector', name: 'u', x: 7, y: null, z: null })).toEqual([
      { type: 'vec-val', atom: { kind: 'named', name: 'u' }, x: 7, y: null, z: null, given: true },
    ]);
    expect(added(c, { type: 'inject-vector', name: 'u', x: null, y: null, z: null })).toEqual([]);
  });
  it('the claims come from the real parse: «u = (7, n, p)» and «AB = (5, k, 2k)» carry x only', () => {
    for (const [line, atom] of [
      ['u = (7, n, p)', { kind: 'named', name: 'u' }],
      ['AB = (5, k, 2k)', { kind: 'pair', from: 'A', to: 'B' }],
    ] as const) {
      const p = parse3(line);
      expect(p.ok).toBe(true);
      if (!p.ok) continue;
      let next = c;
      for (const cmd of p.commands) {
        const r = applyCommand3(next, cmd);
        expect(r.ok).toBe(true);
        if (r.ok) next = r.next;
      }
      expect(next.claims.slice(c.claims.length)).toEqual([{ type: 'vec-val', atom, x: line.startsWith('u') ? 7 : 5, y: null, z: null, given: true }]);
    }
  });
});

/**
 * THE CLASS INVARIANT. Fold every sequence the 3-D suite already knows (fixtures3, the catalog, every string
 * array in `src3d/__tests__` — the #1394 harvest) plus this file's rows at APPLY level: a fact that adds a
 * vector, pair or dot pin while the pivot never runs on the figure must also add a claim — or it is a given
 * nobody reads. The exercised counter keeps it from passing by checking nothing. The sibling #1567 widens
 * this to every pin family (length / angle / ratio / ⊥ pins routed on a revolution's free dims).
 */
describe('#1560 — invariant: no anchor-lane pin without an arbiter where the pivot never runs', () => {
  const HERE = __dirname;
  const FIXTURES = path.resolve(HERE, '../../fixtures3');
  const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
  const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
  const ITEM = new RegExp(STR, 'g');

  const sequences = (): string[][] => {
    const out: string[][] = [];
    if (existsSync(FIXTURES)) {
      for (const file of readdirSync(FIXTURES).filter((n) => n.endsWith('.geo3.json'))) {
        const saved = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { facts: { utterance: string }[] };
        out.push(saved.facts.map((f) => f.utterance));
      }
    }
    for (const c of COMMAND_CATALOG_3D) out.push([c.he], [c.en]);
    for (const f of readdirSync(HERE).filter((n) => /\.tsx?$/.test(n))) {
      const src = readFileSync(path.join(HERE, f), 'utf8');
      for (const m of src.matchAll(ARRAY)) out.push([...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1')));
    }
    // this file's rows as whole sequences (setup + line), so the counter sees the reported cases
    for (const [setup, line] of [
      [TYPED, 'u = (7,7,7)'], [TYPED, 'u = (7, n, p)'], [PAIR, 'AB = (5,5,5)'], [PAIR, 'BA = (5,5,5)'],
      [PAIR, 'וקטור AB = (5,5,5)'], [PAIR, 'AB = (5, n, p)'], [PAIR, 'AB = (5, k, 2k)'], [MID, 'AM = (5,5,5)'], [TYPED, 'u·v = 24'],
      [TYPED, 'u = (2,0,0)'], [TYPED, 'u = (2, n, p)'], [PAIR, 'AB = (2,0,0)'], [PAIR, 'BA = (-2,0,0)'], [TYPED, 'u·v = 0'],
    ] as [string[], string][]) out.push([...setup, line]);
    return out;
  };

  const pinCount = (c: Construction3) => c.vectorPins.length + c.pairPins.length + c.scalarPins.filter((p) => p.kind === 'dot').length;
  const statesANumber = (cmd: Command3) =>
    cmd.type === 'dot-given' || ((cmd.type === 'inject-vector' || cmd.type === 'inject-pair') && (cmd.x !== null || cmd.y !== null || cmd.z !== null));

  it('every such fact records a claim (exercised on at least the nine reported rows)', () => {
    let exercised = 0;
    const offenders: string[] = [];
    for (const lines of sequences()) {
      let c = emptyConstruction3();
      const pinFacts: { line: string; claimed: boolean }[] = [];
      for (const line of lines) {
        const p = parse3(line);
        if (!p.ok) continue;
        let probe = c;
        let ok = true;
        for (const cmd of p.commands) {
          const r = applyCommand3(probe, cmd);
          if (!r.ok) { ok = false; break; }
          probe = r.next;
        }
        if (!ok) continue; // a failing fact commits nothing (#1413)
        if (pinCount(probe) > pinCount(c) && p.commands.some(statesANumber)) pinFacts.push({ line, claimed: probe.claims.length > c.claims.length });
        c = probe;
      }
      if (pinFacts.length === 0) continue;
      if (resolve3(c, 0).pivot !== null) continue; // the pivot runs: its pin-owner guard arbitrates
      for (const f of pinFacts) {
        exercised++;
        if (!f.claimed) offenders.push(`${JSON.stringify(lines)} → «${f.line}»`);
      }
    }
    expect(offenders).toEqual([]);
    // the nine reported rows (M1–M9) and the five true restatements (G1–G5); the harvested corpus adds 0 today
    expect(exercised).toBeGreaterThanOrEqual(14);
  }, 120_000);
});
