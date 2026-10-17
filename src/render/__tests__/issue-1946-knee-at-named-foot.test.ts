/**
 * #1946 + #2103 ([ADR-731](../../../docs/06-decisions.md#adr-731)) — A STATED ⟂ WHOSE RIGHT ANGLE SITS AT A
 * NAMED POINT IS MARKED AT REST, ONCE, IN THE CORNER THE STATEMENT NAMES.
 *
 * Operator rulings: 2026-10-10 (option C, *"a stated ⟂ whose right angle sits at a NAMED point is a VALUE, so the
 * knee is drawn at rest, in both 2-D and 3-D"*; follow-up *"A single knee at D, on the DC side — the right angle is
 * stated once, so it is marked once"*), 2026-10-14 (card d14b-1946-side A: *"toward the second-named letter of the
 * other segment … It never flips when the figure is cycled"*) and 2026-10-15 (#2103 card 7 A: *"at a named
 * crossing, the right-angle mark sits in the corner toward each segment's second-named letter (for «AC ⟂ BD» at O:
 * ∠COD)"*).
 *
 * Measured on `main` @ 688dfb96 through `decideDeterministic2D` → `commitVerdict` → `replay`: every row below drew
 * NO at-rest knee (`angleMarkFor`'s `set-perpendicular` arm returned null without a shared endpoint id, and `foot`
 * had no arm). The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { searchAnotherView, type AngleMark } from '@/replay/core';
import { buildScene, relationMarks } from '@/render/scene';
import type { Fact } from '@/store/geoStore';

const st = () => useGeoStore.getState();

async function play(lines: string[]): Promise<Fact[]> {
  st().clear();
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as { kind: string };
    expect(['commit', 'noop'], `«${line}» → ${v.kind}`).toContain(v.kind);
    if (v.kind === 'commit') commitVerdict(v as never, line); // a restatement the figure entails is a no-op row
  }
  return st().facts;
}

/** The knees as `V:r1r2` with the rays sorted — the wedge's letters, independent of ray order. */
const knees = (marks: AngleMark[]) => marks.filter((m) => m.right).map((m) => `${m.vertex}:${[m.ray1, m.ray2].sort().join('')}`).sort();

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const TRI = ['משולש ABC', 'D על BC'];

describe('#1946 — a named foot on the other segment: one knee, toward its second-named letter', () => {
  const ROWS: [string[], string][] = [
    [[...TRI, 'AD ⟂ BC'], 'D:AC'],
    [[...TRI, 'AD ⊥ BC'], 'D:AC'],
    [[...TRI, 'AD מאונך ל-BC'], 'D:AC'],
    [[...TRI, 'AD ⟂ CB'], 'D:AB'],
    [[...TRI, 'AD גובה'], 'D:AC'],
    [[...TRI, 'AD גובה לצלע CB'], 'D:AB'],
    [['משולש ABC', 'AD גובה'], 'D:AC'],
    [['משולש ABC', 'F רגל האנך מ-A ל-BC'], 'F:AC'],
  ];
  for (const [lines, want] of ROWS) {
    it(`${lines.join(' · ')} → one knee ${want}`, async () => {
      const facts = await play(lines);
      const r = replay(facts, 0);
      expect(Object.values(r.status).every((s) => s === 'ok')).toBe(true);
      expect(knees(r.angleMarks)).toEqual([want]);
    });
  }

  it('the side never flips: seeds 0–5 and three presses of «הציגו תצורה אחרת», on a drawing where B is the farther end', async () => {
    const facts = await play([...TRI, 'AD ⟂ BC']);
    const r0 = replay(facts, 0);
    const [B, C, D] = ['B', 'C', 'D'].map((id) => r0.positions.get(id)!);
    expect(Math.hypot(B.x - D.x, B.y - D.y), 'DB is the longer half at seed 0').toBeGreaterThan(Math.hypot(C.x - D.x, C.y - D.y));
    for (let seed = 0; seed <= 5; seed++) expect(knees(replay(facts, seed).angleMarks), `seed ${seed}`).toEqual(['D:AC']);
    let cur = { facts, seed: 0 };
    for (let k = 0; k < 3; k++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      if (!next) break;
      cur = next;
      expect(knees(replay(cur.facts, cur.seed).angleMarks), `press ${k + 1}`).toEqual(['D:AC']);
    }
  });

  it('a wedge already carrying a value is not marked twice: «זווית ADB = 90» keeps its knee and the ⟂ adds none', async () => {
    expect(knees(replay(await play([...TRI, 'AD ⟂ BC', 'זווית ADB = 90']), 0).angleMarks)).toEqual(['D:AB']);
    expect(knees(replay(await play([...TRI, 'זווית ADB = 90', 'AD ⟂ BC']), 0).angleMarks)).toEqual(['D:AB']);
  });

  it('the same right angle stated twice («AD ⟂ BC» and «AD גובה») is one knee', async () => {
    expect(knees(replay(await play([...TRI, 'AD ⟂ BC', 'AD גובה']), 0).angleMarks)).toEqual(['D:AC']);
  });

  it('an auto-named foot is not one the student named: «גובה מ-A» draws no knee', async () => {
    const facts = await play(['משולש ABC', 'הגובה מ-A']);
    expect(facts.some((f) => f.cmd.type === 'foot' && !f.cmd.named), 'the foot is auto-named').toBe(true);
    expect(knees(replay(facts, 0).angleMarks)).toEqual([]);
  });

  it('controls unchanged: the shared vertex («AB ⟂ AC») and the value («זווית ADB = 90»)', async () => {
    expect(knees(replay(await play(['משולש ABC', 'AB ⟂ AC']), 0).angleMarks)).toEqual(['A:BC']);
    expect(knees(replay(await play([...TRI, 'זווית ADB = 90']), 0).angleMarks)).toEqual(['D:AB']);
  });
});

describe('#2103 — a named crossing: one knee, toward each segment’s second-named letter', () => {
  const O = 'O נקודת חיתוך האלכסונים';
  const ROWS: [string[], string][] = [
    [['ריבוע ABCD', O, 'AC ⟂ BD'], 'O:CD'],
    [['ריבוע ABCD', O, 'AC ⊥ BD'], 'O:CD'],
    [['ריבוע ABCD', O, 'CA ⟂ BD'], 'O:AD'],
    [['ריבוע ABCD', O, 'BD ⟂ AC'], 'O:CD'],
    [['ריבוע ABCD', O, 'BD מאונך ל-AC'], 'O:CD'],
    [['מעוין ABCD', O, 'AC ⟂ BD'], 'O:CD'],
    [['מרובע ABCD', O, 'AC ⟂ BD'], 'O:CD'],
    [['מרובע ABCD', 'AC', 'BD', 'O נקודת החיתוך של AC ו-BD', 'AC ⟂ BD'], 'O:CD'],
  ];
  for (const [lines, want] of ROWS) {
    it(`${lines.join(' · ')} → one knee ${want}`, async () => {
      const r = replay(await play(lines), 0);
      expect(knees(r.angleMarks).filter((k) => k.startsWith('O:'))).toEqual([want]);
    });
  }

  it('the corner never flips: seeds 0–5 and three presses of «הציגו תצורה אחרת»', async () => {
    const facts = await play(['מרובע ABCD', O, 'AC ⟂ BD']);
    for (let seed = 0; seed <= 5; seed++) expect(knees(replay(facts, seed).angleMarks), `seed ${seed}`).toEqual(['O:CD']);
    let cur = { facts, seed: 0 };
    for (let k = 0; k < 3; k++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      if (!next) break;
      cur = next;
      expect(knees(replay(cur.facts, cur.seed).angleMarks), `press ${k + 1}`).toEqual(['O:CD']);
    }
  });

  it('an unnamed crossing stays unmarked (B2, #2091): «ריבוע ABCD» · «AC ⟂ BD»', async () => {
    expect(knees(replay(await play(['ריבוע ABCD', 'AC ⟂ BD']), 0).angleMarks)).toEqual([]);
  });

  it('a letter that only sits on the crossing names nothing: «O אמצע AC»', async () => {
    expect(knees(replay(await play(['ריבוע ABCD', 'O אמצע AC', 'AC ⟂ BD']), 0).angleMarks)).toEqual([]);
  });

  it('with «זווית AOB = 90» also stated, O carries one knee', async () => {
    expect(knees(replay(await play(['ריבוע ABCD', O, 'AC ⟂ BD', 'זווית AOB = 90']), 0).angleMarks)).toEqual(['O:AB']);
  });
});

describe('#1946 — the relations layer draws no second knee for a right angle already marked at rest', () => {
  it('the forced ∠ADB and ∠ADC (the same two lines at D) yield to the at-rest ∠ADC knee', async () => {
    const facts = await play([...TRI, 'AD ⟂ BC']);
    const r = replay(facts, 0);
    const forced = {
      equalSegments: [],
      equalAngles: [],
      definiteAngles: [
        { vertex: 'D', a: 'A', b: 'B', valueDeg: 90 },
        { vertex: 'D', a: 'A', b: 'C', valueDeg: 90 },
      ],
      definiteLengths: [],
      samplesUsed: 0,
    } as never;
    expect(relationMarks(forced, r.positions).rightAngles).toHaveLength(2); // without the at-rest knees: both halves
    expect(relationMarks(forced, r.positions, [], r.angleMarks.filter((m) => m.right)).rightAngles).toHaveLength(0);
  });

  it('a forced right angle between OTHER lines at the same vertex is still drawn', async () => {
    const r = replay(await play([...TRI, 'AD ⟂ BC']), 0);
    const forced = { equalSegments: [], equalAngles: [], definiteAngles: [{ vertex: 'A', a: 'B', b: 'D', valueDeg: 90 }], definiteLengths: [], samplesUsed: 0 } as never;
    expect(relationMarks(forced, r.positions, [], r.angleMarks.filter((m) => m.right)).rightAngles).toHaveLength(1);
  });
});

describe('#1946 — a knee at a named point is not covered by that point’s letter', () => {
  const O = 'O נקודת חיתוך האלכסונים';
  for (const lines of [['ריבוע ABCD', O, 'AC ⟂ BD'], ['מעוין ABCD', O, 'AC ⟂ BD'], ['מרובע ABCD', O, 'AC ⟂ BD'], [...TRI, 'AD ⟂ BC']]) {
    it(`${lines.join(' · ')}: the label direction is outside the knee's corner, at seeds 0–3`, async () => {
      const facts = await play(lines);
      for (let seed = 0; seed < 4; seed++) {
        const r = replay(facts, seed);
        const knee = r.angleMarks.find((m) => m.right && (m.vertex === 'O' || m.vertex === 'D'))!;
        const s = buildScene(r.construction, r.positions, r.labels, r.angleMarks);
        const p = s.points.find((q) => q.id === knee.vertex)!;
        const V = r.positions.get(knee.vertex)!;
        const u = (id: string) => { const P = r.positions.get(id)!; const d = Math.hypot(P.x - V.x, P.y - V.y); return { x: (P.x - V.x) / d, y: (P.y - V.y) / d }; };
        const [u1, u2] = [u(knee.ray1), u(knee.ray2)];
        const diag = { x: u1.x + u2.x, y: u1.y + u2.y };
        const cos = (diag.x * p.labelDir.x + diag.y * p.labelDir.y) / Math.hypot(diag.x, diag.y) / Math.hypot(p.labelDir.x, p.labelDir.y);
        expect(cos, `seed ${seed}: the label is more than 45° off the knee's diagonal`).toBeLessThan(Math.SQRT1_2);
      }
    });
  }
});
