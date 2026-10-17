/**
 * #1827 ([ADR-3D-337](../../../docs/06b-decisions-3d.md#adr-3d-337)) — ONE MAGNITUDE ATOM FOR EVERY
 * STATED-MAGNITUDE SLOT.
 *
 * Operator, prod 3-D, 2026-10-06: *"tool didnt accept AD=sqrt7"*. After «מלבן ABCD» and «AB=1», «AD=√7» was
 * «לא הצלחתי להבין את הנתון» while «|AD|=√7» built. The cause was a class: only `lengthRel` read its value
 * through `evalRadical`; the bare length, the area and the height-with-value slots matched the decimal-only
 * atom and read the capture with `+m[n]`. 2-D reads every one of these sentences (measured at 6096b643).
 *
 * The lock is a TOTALITY SWEEP, rule × spelling, with a guard on how many rules were exercised, so it cannot
 * pass by checking nothing. A second sweep holds the gate's half: a line the parser reads is never refused
 * `dropped-given` by the honesty gate, which used to re-read radicals with its own private grammar
 * («√(3/4)» as √3/4; «sqrt(7)» as a bare 7).
 */
import { describe, expect, it } from 'vitest';
import { evalRadical, parse3 } from '../parse3';
import { droppedGivenNumbers3 } from '../honesty3';
import { decideDeterministic3 } from '../../app/decideDeterministic3';
import { derive3, type Fact3 } from '../../store/store3';
import type { Command3 } from '../../engine/types';

/** Each spelling and the value it states. The `sqrt` rows are the keyboard spellings 2-D reads as √. */
const SPELLINGS: ReadonlyArray<readonly [string, number]> = [
  ['√7', Math.sqrt(7)],
  ['√(7)', Math.sqrt(7)],
  ['2√2', 2 * Math.SQRT2],
  ['√7/2', Math.sqrt(7) / 2],
  ['√(3/4)', Math.sqrt(0.75)],
  ['7/2', 3.5],
  ['2.5', 2.5],
  ['3', 3],
  ['sqrt(7)', Math.sqrt(7)],
  ['sqrt7', Math.sqrt(7)],
  ['\\sqrt{7}', Math.sqrt(7)],
];

type Reader = (cmds: Command3[]) => number | undefined;
const lengthOf: Reader = (cmds) => {
  for (const c of cmds) if (c.type === 'claim' && c.claim.type === 'length-eq') return c.claim.value;
  return undefined;
};
const areaOf: Reader = (cmds) => {
  for (const c of cmds) if (c.type === 'claim' && c.claim.type === 'area-eq') return c.claim.value;
  return undefined;
};
/** #2081 (ADR-3D-362): the two slots ADR-3D-337 §4 held for the operator's ruling. */
const coordXOf: Reader = (cmds) => {
  for (const c of cmds) if (c.type === 'claim' && c.claim.type === 'coords-eq') return c.claim.x ?? undefined;
  return undefined;
};
const distanceOf: Reader = (cmds) => {
  for (const c of cmds) if (c.type === 'distance-rel') return c.value;
  return undefined;
};
const heightLenOf: Reader = (cmds) => {
  for (const c of cmds) if (c.type === 'perp-to-base') return c.len;
  return undefined;
};

/** Every rule whose slot states a magnitude a 2-D sentence also states, with a template and its reader. */
const RULES: ReadonlyArray<{ rule: string; template: string; read: Reader }> = [
  { rule: 'lengthClaim (bare AB = v)', template: 'AD = {v}', read: lengthOf },
  { rule: 'lengthClaim, no spaces (the reported line)', template: 'AD={v}', read: lengthOf },
  { rule: 'lengthRel (|AB| = v)', template: '|AD| = {v}', read: lengthOf },
  { rule: 'areaClaim', template: 'שטח המשולש ABC = {v}', read: areaOf },
  { rule: 'readHeight3, segment-first', template: 'SO גובה הפירמידה = {v}', read: lengthOf },
  { rule: 'readHeight3, English', template: 'SO is the height of the pyramid = {v}', read: lengthOf },
  { rule: 'readHeight3, noun-first', template: 'גובה הפירמידה SO = {v}', read: lengthOf },
  { rule: 'heightFromApex', template: 'גובה הפירמידה הוא {v}', read: heightLenOf },
  // #2081 (ADR-3D-362, ruling 2026-10-14 card d14b-2081-roots A): the coordinate-claim and distance slots
  { rule: 'coordsClaim (A = (v,0,0))', template: 'A = ({v},0,0)', read: coordXOf },
  { rule: 'coordsClaim, no spaces', template: 'A=({v},0,0)', read: coordXOf },
  { rule: 'distanceGiven, «בין … ל…» point–plane', template: 'המרחק בין S למישור ABC הוא {v}', read: distanceOf },
  { rule: 'distanceGiven, «מ … ל…» point–line', template: 'המרחק מ S לישר AB הוא {v}', read: distanceOf },
  { rule: 'distanceGiven, «שווה ל-»', template: 'המרחק בין S למישור ABC שווה ל-{v}', read: distanceOf },
  { rule: 'distanceGiven, English', template: 'the distance between S and plane ABC is {v}', read: distanceOf },
];

describe('#1827 — every stated-magnitude slot reads every value spelling', () => {
  it('rule × spelling: parses, and the value is the one the spelling states', () => {
    const exercised = new Set<string>();
    let checks = 0;
    for (const { rule, template, read } of RULES) {
      for (const [spelling, value] of SPELLINGS) {
        const line = template.replace('{v}', spelling);
        const r = parse3(line);
        expect(r.ok, `${rule}: «${line}»`).toBe(true);
        if (!r.ok) continue;
        const got = read(r.commands);
        expect(got, `${rule}: «${line}»`).toBeCloseTo(value, 12);
        exercised.add(rule);
        checks++;
      }
    }
    // the guard: the sweep cannot pass by matching nothing
    expect(exercised.size).toBe(RULES.length);
    expect(checks).toBe(RULES.length * SPELLINGS.length);
  });

  it('the atom and its reader agree: the glyph spellings evaluate exactly as the parser lowers them', () => {
    for (const [spelling, value] of SPELLINGS) {
      if (/sqrt/.test(spelling)) continue; // folded to √ at normalize3, before the reader sees it
      expect(evalRadical(spelling), spelling).toBeCloseTo(value, 12);
    }
  });

  it('a malformed value still refuses — never a NaN or an Infinity in a figure', () => {
    for (const line of ['AD = √-2', 'AD = 3/0', 'AD = √(1/0)', 'שטח המשולש ABC = 3/0', 'גובה הפירמידה הוא 3/0', 'A=(3/0,0,0)', 'A=(√(1/0),0,0)', 'המרחק בין S למישור ABC הוא 3/0']) {
      expect(parse3(line).ok, line).toBe(false);
    }
  });

  it('an ANGLE stays a decimal slot (its unit is the degree; out of scope)', () => {
    expect(parse3('∠ABC = √3').ok).toBe(false);
  });
});

describe('#1827 — the honesty gate agrees with the parser on every value it reads', () => {
  it('a line the parser reads is never flagged dropped-given', () => {
    let checks = 0;
    for (const { template } of RULES) {
      for (const [spelling] of SPELLINGS) {
        const line = template.replace('{v}', spelling);
        const r = parse3(line);
        if (!r.ok) continue;
        expect(droppedGivenNumbers3(line, r.commands), `«${line}»`).toEqual([]);
        checks++;
      }
    }
    expect(checks).toBe(RULES.length * SPELLINGS.length);
  });

  it('the gate still flags a radical the commands did NOT carry', () => {
    expect(droppedGivenNumbers3('AD = √(3/4)', [{ type: 'segment3', a: 'A', b: 'D' }])).toEqual(['√(3/4)']);
    expect(droppedGivenNumbers3('AD = sqrt(7)', [{ type: 'segment3', a: 'A', b: 'D' }])).toEqual(['√(7)']);
  });
});

describe("#1827 — the operator's exact sequence, through the App's own decision", () => {
  it('«מלבן ABCD ⏎ AB=1 ⏎ AD=√7» records, and the figure verifies with |AD| = √7', () => {
    let st: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
    let n = 0;
    for (const line of ['מלבן ABCD', 'AB=1', 'AD=√7']) {
      const v = decideDeterministic3(st, line, () => `f${++n}`);
      expect(v.kind, line).toBe('record');
      if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
    }
    const d = derive3(st.facts, st.seed);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const a = d.positions.get('A')!;
    const dd = d.positions.get('D')!;
    expect(Math.hypot(a.x - dd.x, a.y - dd.y, a.z - dd.z)).toBeCloseTo(Math.sqrt(7), 6);
  });
});
