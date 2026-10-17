/**
 * #2235 ([ADR-3D-351](../../docs/06b-decisions-3d.md#adr-3d-351)) — an UNNAMED shape noun is resolved against the figure.
 *
 * Measured at 4b0b4592 through `decideSubmit3`: every label-less triangle / quad sentence lowered onto the LITERAL letters
 * A, B, C(, D), so «משולש ABC» · «משולש DEF» · «המשולש ישר זווית» silently made ABC right-angled, «משולש DEF» · «המשולש
 * ישר זווית» minted a second triangle ABC, and the indefinite «משולש ישר זווית» after «משולש ABC» changed ABC itself.
 * Operator ruling 2026-10-16 (card `g2235-3d`, *"3-D follows 2-D"*): with one triangle drawn, a definite form applies to
 * it; with two or more, it is refused, naming them; the indefinite form draws a new triangle.
 *
 * Every verdict goes through `decideSubmit3`, the real submit decision; the ring is read from `derive3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { shapeNounArticle3, definiteShapeExample3 } from '../lexicon/shapePhrase3';
import { parse3 } from '../parser/parse3';
import type { Command3 } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

let n = 0;
const newId = () => `f${++n}`;

/** Submit each line in turn; every line but the last must record (or be already stated). */
function build(lines: string[]): { st: St; last: ReturnType<typeof decideSubmit3> } {
  let st: St = { facts: [], seed: 0 };
  let last: ReturnType<typeof decideSubmit3> = { kind: 'not-understood' };
  lines.forEach((u, i) => {
    last = decideSubmit3(st, u, newId);
    if (i < lines.length - 1) expect(['record', 'already-stated'], `«${u}» in ${JSON.stringify(lines)}: ${JSON.stringify(last)}`).toContain(last.kind);
    if (last.kind === 'record') st = { facts: last.facts, seed: last.seed };
    else if (last.kind === 'already-stated') st = { facts: last.facts, seed: st.seed };
  });
  return { st, last };
}

/** The commands the LAST fact applied as (its ring resolved), with its status. */
function lastApplied(st: St): { cmds: readonly Command3[]; status: unknown } {
  const f = st.facts[st.facts.length - 1];
  const d = derive3(st.facts, st.seed);
  return { cmds: d.resolvedCmds[f.id] ?? f.cmds, status: d.status[f.id] };
}

/** The ring of the last fact's polygon declaration, and the right-angle vertex if it states one. */
function ringOf(cmds: readonly Command3[]): { ring: string; right: string | null; kind: string } {
  const decl = cmds.find((k) => k.type === 'solid' || k.type === 'quad-shape') as { ids: string[]; type: string; kind?: string; base?: string };
  const right = cmds.find((k) => k.type === 'cos-angle') as { u: { from: string } } | undefined;
  return { ring: decl.ids.join(''), right: right ? right.u.from : null, kind: decl.kind ?? decl.base ?? '' };
}

function recordedRing(lines: string[]) {
  const { st, last } = build(lines);
  expect(last.kind, `${JSON.stringify(lines)}: ${JSON.stringify(last)}`).toBe('record');
  const { cmds, status } = lastApplied(st);
  expect(status, JSON.stringify(lines)).toBe('ok');
  return { ...ringOf(cmds), st };
}

describe('#2235 — the article reader (the 3-D copy of 2-D\'s #2205 reader)', () => {
  it.each([
    ['המשולש ישר זווית', 'definite'],
    ['המשולש', 'definite'],
    ['שהמשולש ישר זווית', 'definite'],
    ['והמשולש שווה שוקיים', 'definite'],
    ['the triangle is isosceles', 'definite'],
    ['the right triangle', 'definite'],
    ['הריבוע', 'definite'],
    ['משולש ישר זווית', 'indefinite'],
    ['ומשולש', 'indefinite'],
    ['a right triangle', 'indefinite'],
    ['במשולש ישר זווית', 'prefixed'],
    ['למרובע', 'prefixed'],
    ['AB = 3', 'indefinite'],
  ] as const)('«%s» → %s', (s, article) => {
    expect(shapeNounArticle3(s)).toBe(article);
  });

  it('the parser emits a reference only where no letters were written', () => {
    const r = parse3('המשולש ישר זווית');
    expect(r.ok && r.commands.map((k) => k.type)).toEqual(['shape-ref3']);
    const named = parse3('המשולש DEF ישר זווית');
    expect(named.ok && named.commands.map((k) => k.type)).toEqual(['solid', 'cos-angle']);
  });
});

describe('#2235 — a definite noun is the figure\'s one declared ring of its size', () => {
  it.each([
    [['משולש ABC', 'המשולש ישר זווית'], 'ABC', 'B'],
    [['משולש DEF', 'המשולש ישר זווית'], 'DEF', 'E'],
    [['משולש DEF', 'המשולש הוא ישר זווית'], 'DEF', 'E'],
    [['triangle DEF', 'the triangle is a right triangle'], 'DEF', 'E'],
    [['פירמידה SABCD', 'משולש SAB', 'המשולש ישר זווית'], 'SAB', 'A'],
    [['המשולש ישר זווית'], 'ABC', 'B'], // D1: an empty figure — the default letters, as today
    [['פירמידה SABC', 'המשולש ישר זווית'], 'ABC', 'B'], // out of class (Found work 1): no declared flat triangle
  ])('%j → ring %s, right angle at %s', (lines, ring, right) => {
    const r = recordedRing(lines);
    expect(r.ring).toBe(ring);
    expect(r.right).toBe(right);
  });

  it('«משולש DEF» · «המשולש ישר זווית» mints no second triangle (no point A)', () => {
    const { st } = build(['משולש DEF', 'המשולש ישר זווית']);
    const d = derive3(st.facts, st.seed);
    expect([...d.construction.points.keys()].sort()).toEqual(['D', 'E', 'F']);
  });

  it.each([
    [['משולש DEF', 'המשולש שווה שוקיים'], 'DEF'],
    [['משולש DEF', 'המשולש שווה צלעות'], 'DEF'],
    [['מרובע ABCD', 'הריבוע'], 'ABCD'], // 2-D C5: ABCD becomes a square
  ])('%j → on %s', (lines, ring) => {
    expect(recordedRing(lines).ring).toBe(ring);
  });

  it.each([
    [['משולש ABC', 'המשולש']],
    [['ריבוע ABCD', 'הריבוע']],
    [['משולש ישר זווית ABC', 'המשולש ישר זווית']],
    [['משולש DEF', 'המשולש ישר זווית', 'המשולש ישר זווית']],
  ])('%j → already stated', (lines) => {
    expect(build(lines).last.kind).toBe('already-stated');
  });

  it('definite = named: the same figure as the sentence naming the ring, at seeds 0–3', () => {
    for (const [ref, named] of [
      [['משולש DEF', 'המשולש ישר זווית'], ['משולש DEF', 'המשולש DEF ישר זווית']],
      [['פירמידה SABCD', 'משולש SAB', 'המשולש ישר זווית'], ['פירמידה SABCD', 'משולש SAB', 'המשולש SAB ישר זווית']],
    ]) {
      const a = build(ref).st;
      const b = build(named).st;
      for (let seed = 0; seed <= 3; seed++) {
        const pa = derive3(a.facts, seed).positions;
        const pb = derive3(b.facts, seed).positions;
        expect([...pa.keys()].sort()).toEqual([...pb.keys()].sort());
        for (const [id, p] of pa) {
          const q = pb.get(id)!;
          expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), `${id} @ seed ${seed}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('entry order: a triangle added AFTER the definite line leaves the first one right-angled', () => {
    const { st } = build(['משולש DEF', 'המשולש ישר זווית', 'משולש GHI']);
    const d = derive3(st.facts, st.seed);
    const ref = st.facts[1];
    expect(d.status[ref.id]).toBe('ok');
    expect(ringOf(d.resolvedCmds[ref.id]).ring).toBe('DEF');
  });
});

describe('#2235 — two or more: refused, naming them', () => {
  it.each([
    [['משולש ABC', 'משולש DEF', 'המשולש ישר זווית'], ['ABC', 'DEF'], 'המשולש ABC ישר זווית'],
    [['משולש ABC', 'משולש DEF', 'המשולש'], ['ABC', 'DEF'], 'המשולש ABC'],
    [['משולש ABC', 'משולש DEF', 'המשולש שווה צלעות'], ['ABC', 'DEF'], 'המשולש ABC שווה צלעות'],
    [['משולש ABC', 'משולש DEF', 'the triangle is isosceles'], ['ABC', 'DEF'], 'the triangle ABC is isosceles'],
    [['ריבוע ABCD', 'ריבוע EFGH', 'הריבוע'], ['ABCD', 'EFGH'], 'הריבוע ABCD'],
  ])('%j → ambiguous-definite-shape %j, example «%s»', (lines, shapes, example) => {
    const { st, last } = build(lines);
    expect(last.kind).toBe('refused');
    if (last.kind !== 'refused') return;
    expect(last.error).toMatchObject({ code: 'ambiguous-definite-shape', shapes, sentence: lines[lines.length - 1], example });
    // the taught remedy is a sentence the tool ACCEPTS (docs/17 §9): it records, or — the bare noun naming a ring
    // already drawn — answers «already stated», as the named sentence always has
    expect(['record', 'already-stated'], example).toContain(decideSubmit3(st, example, newId).kind);
  });

  it('the example puts the letters right after the noun', () => {
    expect(definiteShapeExample3('המשולש ישר זווית', 'ABC')).toBe('המשולש ABC ישר זווית');
    expect(definiteShapeExample3('the triangle is isosceles', 'DEF')).toBe('the triangle DEF is isosceles');
  });
});

describe('#2235 — an indefinite noun draws a new ring on the letters 2-D gives', () => {
  it.each([
    [['משולש ABC', 'משולש ישר זווית'], 'DEF', 'E'], // C1 — 2-D: right-triangle D,E,F
    [['משולש ABC', 'משולש'], 'DEF', null], // C2 — 2-D: triangle D,E,F
    [['משולש ABC', 'משולש שווה שוקיים'], 'DEF', null], // 2-D: isosceles D,E,F
    [['משולש ABC', 'במשולש ישר זווית'], 'DEF', 'E'], // prefixed — 2-D: right-triangle D,E,F
    [['משולש ABC', 'משולש DEF', 'משולש ישר זווית'], 'GHI', 'H'], // C3 — 2-D: right-triangle G,H,I
    [['משולש DEF', 'משולש ישר זווית'], 'ABC', 'B'], // C4 — 2-D: right-triangle A,B,C
    [['משולש ABC', 'משולש', 'משולש'], 'GHI', null],
    [['משולש ישר זווית'], 'ABC', 'B'], // D1
    [['ריבוע ABCD', 'ריבוע'], 'EFGH', null], // 2-D: square E,F,G,H
  ])('%j → a new ring %s', (lines, ring, right) => {
    const r = recordedRing(lines);
    expect(r.ring).toBe(ring);
    expect(r.right).toBe(right);
    const d = derive3(r.st.facts, r.st.seed);
    expect(d.construction.solids.filter((s) => s.kind.startsWith('polygon')).length, 'the figure holds one more ring').toBe(
      lines.filter((l) => /משולש|ריבוע/.test(l)).length,
    );
  });

  it('C5 control: a labelled sentence is untouched', () => {
    expect(recordedRing(['משולש ABC', 'משולש ישר זווית DEF']).ring).toBe('DEF');
  });
});
