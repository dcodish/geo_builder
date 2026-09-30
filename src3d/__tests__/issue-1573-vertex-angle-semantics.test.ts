/**
 * #1573 / #1592 (ADR-3D-290) — ONE ANGLE SENTENCE, ONE MEANING, AND THE CANVAS PAINTS ONLY WHAT HOLDS.
 *
 * «הזווית BAD היא θ» (the angle AT A, 0–180°) and «הזווית בין AB לבין AD היא θ» (the angle between two
 * LINES, ≤ 90°) are different statements. Both used to lower to `angle-seg-eq`, and apply told them apart
 * by the figure's state: a pinned figure read the vertex angle, a fixed one the line angle — so on typed
 * points a true obtuse angle was refused and its false supplement accepted green (#1573, P1). The vertex
 * form now lowers to its own `vertex-angle-eq`; every lane (fixed claim, pivot pin, coord-sym root-find,
 * canvas arc, knee) reads what the sentence measures.
 *
 * #1592: a stated angle's value is painted on the canvas only where the drawn figure satisfies it — the
 * verifier's own measure — so an edit that breaks the given leaves no «135°» over a 45° corner.
 *
 * Every submit goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { claimSeeds, vertexAngleDeg } from '../engine/claims';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { rightAngles3 } from '../render/rightAngles';

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

const verdict = (st: St, line: string) => {
  const v = decideSubmit3(st, line);
  return v.kind === 'refused' ? v.error.code : v.kind;
};

/** Replace one fact's statement in place, as the step-list edit does (without its acceptance gate). */
const edit = (st: St, index: number, utterance: string): St => {
  const p = parse3(utterance);
  if (!p.ok) throw new Error(`edit «${utterance}» does not parse`);
  return { ...st, facts: st.facts.map((f, i) => (i === index ? { ...f, utterance, cmds: p.commands } : f)) };
};

const arcTexts = (st: St) => {
  const d = derive3(st.facts, st.seed);
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).angles.map((a) => a.text);
};

const OBTUSE = ['A(0,0,0)', 'B(1,0,0)', 'D(-1,1,0)']; // ∠BAD = 135°, the line angle between AB and AD = 45°

describe('#1573 — on a FIXED figure a vertex angle is the angle at the vertex', () => {
  const vertexSpellings = (deg: number) => [
    `הזווית BAD היא ${deg}`,
    `זווית BAD = ${deg}`,
    `∠BAD = ${deg}`,
    `∠DAB = ${deg}`, // the mirrored arms state the same corner
    `angle BAD is ${deg}`,
  ];
  for (const line of vertexSpellings(135)) it(`the TRUE «${line}» records`, () => expect(verdict(build(OBTUSE), line)).toBe('record'));
  for (const line of vertexSpellings(45)) it(`the FALSE supplement «${line}» is refused`, () => expect(verdict(build(OBTUSE), line)).toBe('claim-refuted'));

  it('a right vertex angle is unchanged: true 90 records, false 90 refuses', () => {
    expect(verdict(build(['A(0,0,0)', 'B(1,0,0)', 'D(0,2,0)']), 'הזווית BAD היא 90')).toBe('record');
    expect(verdict(build(OBTUSE), 'הזווית BAD היא 90')).toBe('claim-refuted');
  });

  it('a vertex named by its letter alone («זווית A = 135», two edges at A) is the vertex angle too', () => {
    const st = build([...OBTUSE, 'AB', 'AD']);
    expect(verdict(st, 'זווית A = 135')).toBe('record');
    expect(verdict(st, 'זווית A = 45')).toBe('claim-refuted');
  });
});

describe('#1573 — the LINE angle keeps its ≤ 90° meaning on the same figure', () => {
  it('«הזווית בין AB לבין AD היא 45» records (the lines meet at 45° although the corner is 135°)', () => {
    expect(verdict(build(OBTUSE), 'הזווית בין AB לבין AD היא 45')).toBe('record');
    expect(verdict(build(OBTUSE), 'the angle between AB and AD is 45')).toBe('record');
  });
  it('the exam wording «גודל הזווית שבין הישר AB ובין הישר AD הוא 45» records', () => {
    expect(verdict(build(OBTUSE), 'גודל הזווית שבין הישר AB ובין הישר AD הוא 45')).toBe('record');
  });
});

describe('#1573 — on a PINNED figure each sentence drives its own quantity', () => {
  it('the #425 pyramid «זווית DAB = 120» still builds, and ∠DAB is 120 at every verification seed', () => {
    const st = build(['פירמידה משולשת ABCD', 'AB', '|AB|=|BC|', 'AC', '|AB|=|AC|', 'AD', 'BD']);
    const v = decideSubmit3(st, 'זווית DAB = 120');
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
    for (const s of claimSeeds(v.seed)) expect(vertexAngleDeg(derive3(v.facts, s).positions, 'A', 'D', 'B')).toBeCloseTo(120, 3);
  });
});

describe('#1573 — on a COORD-SYM figure the parameter is root-found against the SIGNED vertex angle', () => {
  it('«∠BAM = 135» with M(k,1,0) picks k = −1 only (the line angle would also admit k = +1)', () => {
    const st = build(['A(0,0,0)', 'B(1,0,0)', 'נתונה נקודה M(k,1,0)']);
    const v = decideSubmit3(st, '∠BAM = 135');
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    const d = derive3(v.facts, v.seed);
    expect(d.status[v.fact.id]).toBe('ok');
    expect(d.resolved.param?.roots).toHaveLength(1);
    expect(d.positions.get('M')!.x).toBeCloseTo(-1, 4);
  });
});

describe('#1592 — the canvas paints a stated angle only where it holds', () => {
  it('the operator’s T4: «הזווית BAD היא 135» on the obtuse corner draws «135°»', () => {
    expect(arcTexts(build([...OBTUSE, 'כדור', 'הזווית BAD היא 135']))).toContain('135°');
  });

  it('the operator’s T5: after D is edited to (1,1,0) the given is broken and NO «135°» is drawn', () => {
    const st = edit(build([...OBTUSE, 'כדור', 'הזווית BAD היא 135']), 2, 'D(1,1,0)');
    const d = derive3(st.facts, st.seed);
    expect(d.status[st.facts[4].id]).not.toBe('ok'); // the row is marked broken
    expect(arcTexts(st)).not.toContain('135°');
  });

  it('a stated right angle draws its knee only while it holds', () => {
    const square = build(['A(0,0,0)', 'B(1,0,0)', 'D(0,1,0)', 'כדור', 'הזווית BAD היא 90']);
    const knees = (st: St) => {
      const d = derive3(st.facts, st.seed);
      return rightAngles3(d.construction, d.resolved, 1).filter((k) => {
        const a = d.positions.get('A')!;
        return Math.hypot(k.vertex.x - a.x, k.vertex.y - a.y, k.vertex.z - a.z) < 1e-9;
      });
    };
    expect(knees(square)).toHaveLength(1);
    expect(knees(edit(square, 2, 'D(1,1,0)'))).toHaveLength(0);
  });

  it('a line angle is drawn on its ≤ 90° side: «הזווית בין AB לבין AD היא 45» on the 135° corner draws «45°»', () => {
    expect(arcTexts(build([...OBTUSE, 'הזווית בין AB לבין AD היא 45']))).toContain('45°');
  });
});
