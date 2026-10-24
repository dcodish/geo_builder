/**
 * #2483 + #2345 ([ADR-758](../../../docs/06-decisions.md#adr-758)) — a partial circle's stated angle is a GIVEN, and an
 * arc's ends are points ON its circle.
 *
 * Measured at main 1944d866 through this very path (`decideDeterministic2D` → `useGeoStore.execute` → `replay`):
 *  - «רבע מעגל AOB» · «קשת BO=40» committed ∠BAO = 40 with every row `ok`: the quarter's 90° at A became 40°, green
 *    (the operator's T35 report: "it draws the 40 which contradicts the first line"). Sixteen sequences of that shape
 *    across the quarter and the half circle, both letter orders, both languages, and every reader that can move an end
 *    (an arc value, a central angle, a base angle, an arc ratio, an arc sum);
 *  - «רבע מעגל AOB» · «קשת AB = 40» lowered ∠AAB and was refused by the engine («repeats its vertex»), shown as the floor;
 *  - with two circles that both carry A and B, «קשת AB = 40» silently used circle O.
 *
 * The CLASS lock: on every figure below, no arc or angle line commits a figure that contradicts an earlier given —
 * it refuses, or after the commit every construct's stated angle still measures, at seeds 0–2, with no violation.
 * No outcome is the engine's repeated-vertex refusal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he'): Promise<Verdict> {
  const { refused } = driveThroughGate(prefix);
  expect(refused, `the prefix builds: ${prefix.join(' · ')}`).toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** A construct whose central angle the student STATED: centre, the two ends, the angle (degrees, ≤ 180). */
interface Held {
  centre: string;
  a: string;
  b: string;
  deg: number;
}

const angleAt = (pos: ReadonlyMap<string, { x: number; y: number }>, h: Held): number => {
  const c = pos.get(h.centre)!;
  const p = pos.get(h.a)!;
  const q = pos.get(h.b)!;
  const u = { x: p.x - c.x, y: p.y - c.y };
  const v = { x: q.x - c.x, y: q.y - c.y };
  const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

/**
 * The verdict is honest: a refusal (never the engine's repeated-vertex sentence), or a commit after which every held
 * angle still measures at seeds 0–2 with no violation.
 */
function expectHonest(v: Verdict, prefix: string[], line: string, held: Held[]): void {
  const tag = `${prefix.join(' · ')} · ${line}`;
  expect(JSON.stringify(v), `${tag}: never the repeated-vertex refusal`).not.toMatch(/repeats its vertex/);
  if (v.kind !== 'commit') return;
  const g = `g${useGeoStore.getState().facts.length}`;
  for (const c of v.commands) useGeoStore.getState().execute(c, line, g);
  const facts = useGeoStore.getState().facts;
  for (const seed of [0, 1, 2]) {
    const fig = replay(facts, seed);
    expect(fig.violations, `${tag} @${seed}: no violation`).toEqual([]);
    for (const h of held) expect(Math.abs(angleAt(fig.positions, h) - h.deg), `${tag} @${seed}: ∠${h.a}${h.centre}${h.b} stays ${h.deg}°`).toBeLessThan(1e-4);
  }
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The figures of the measured matrix, each with what it states. The MIDDLE letter is the centre (#2486, ADR-759); an O-family first letter too. */
const FIGURES: { prefix: string[]; held: Held[] }[] = [
  { prefix: ['רבע מעגל AOB'], held: [{ centre: 'O', a: 'A', b: 'B', deg: 90 }] },
  { prefix: ['רבע מעגל BAO'], held: [{ centre: 'A', a: 'B', b: 'O', deg: 90 }] },
  { prefix: ['רבע מעגל OAB'], held: [{ centre: 'O', a: 'A', b: 'B', deg: 90 }] },
  { prefix: ['חצי מעגל AOB'], held: [{ centre: 'O', a: 'A', b: 'B', deg: 180 }] },
  { prefix: ['חצי מעגל BAO'], held: [{ centre: 'A', a: 'B', b: 'O', deg: 180 }] },
  { prefix: ['חצי מעגל OAB'], held: [{ centre: 'O', a: 'A', b: 'B', deg: 180 }] },
  { prefix: ['גזרה OAB בזווית 90'], held: [{ centre: 'O', a: 'A', b: 'B', deg: 90 }] },
  { prefix: ['גזרה AOB'], held: [] },
  { prefix: ['מעגל O', 'A על המעגל', 'B על המעגל'], held: [] },
];

const ARC_LINES = ['קשת AB = 40', 'קשת AB = 40°', 'קשת BO = 40', 'קשת BO=40', 'קשת OB = 40', 'קשת AO = 40', 'קשת OA = 40'];

describe('#2483 — no arc line bends a construct’s stated angle (the class)', () => {
  for (const f of FIGURES)
    for (const line of ARC_LINES)
      it(`${f.prefix.join(' · ')} · «${line}»`, async () => {
        expectHonest(await decide(f.prefix, line), f.prefix, line, f.held);
      }, 60_000);

  it.each([
    [['quarter circle AOB'], 'arc BO = 40', [{ centre: 'O', a: 'A', b: 'B', deg: 90 }]],
    [['quarter circle BAO'], 'arc BO = 40', [{ centre: 'A', a: 'B', b: 'O', deg: 90 }]],
    [['quarter circle OAB'], 'arc AB = 40', [{ centre: 'O', a: 'A', b: 'B', deg: 90 }]],
  ] as [string[], string, Held[]][])('English: %j · «%s»', async (prefix, line, held) => {
    expectHonest(await decide(prefix, line, 'en'), prefix, line, held);
  }, 60_000);
});

describe('#2483 — the other readers that move an end are refused too', () => {
  const Q: Held = { centre: 'O', a: 'A', b: 'B', deg: 90 };
  const H: Held = { centre: 'O', a: 'A', b: 'B', deg: 180 };
  it.each([
    [['רבע מעגל OAB'], '∠AOB = 40', [Q]],
    [['רבע מעגל OAB'], 'זווית מרכזית AOB = 40', [Q]],
    [['רבע מעגל OAB'], '∠OAB = 30', [Q]],
    [['רבע מעגל OAB', 'C על הקשת AB'], 'קשת AC = 2 קשת CB', [Q]],
    [['רבע מעגל OAB', 'C על הקשת AB'], 'קשת AC + קשת CB = 100', [Q]],
    [['חצי מעגל OAB'], '∠AOB = 100', [H]],
    [['חצי מעגל OAB', 'C על חצי המעגל', '∠AOC = 50'], '∠COB = 50', [H]],
    [['חצי מעגל OAB', 'C על חצי המעגל'], 'קשת AC = 2 קשת CB', [H]],
    [['חצי מעגל OAB', 'C על חצי המעגל'], 'AC = 6', [H]],
  ] as [string[], string, Held[]][])('%j · «%s»', async (prefix, line, held) => {
    expectHonest(await decide(prefix, line), prefix, line, held);
  }, 60_000);

  it('the T35 line is REFUSED, and the quarter keeps its 90°', async () => {
    const v = await decide(['רבע מעגל AOB'], 'קשת BO=40');
    expect(v.kind).toBe('refuse');
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(angleAt(fig.positions, { centre: 'O', a: 'A', b: 'B', deg: 90 })).toBeCloseTo(90, 6); // centre O since #2486
  }, 60_000);

  it('a point ON the quarter’s arc carries the arc value: C moves, the quarter stays 90°', async () => {
    const prefix = ['רבע מעגל OAB', 'C על הקשת AB'];
    const v = await decide(prefix, 'קשת AC = 40');
    expect(v.kind).toBe('commit');
    expectHonest(v, prefix, 'קשת AC = 40', [Q, { centre: 'O', a: 'A', b: 'C', deg: 40 }, { centre: 'O', a: 'C', b: 'B', deg: 50 }]);
  }, 60_000);

  it('the half circle’s Thales point lands on the drawn half: «AC = 6» builds with no violation', async () => {
    const prefix = ['חצי מעגל OAB', 'C על חצי המעגל'];
    const v = await decide(prefix, 'AC = 6');
    expect(v.kind).toBe('commit');
    expectHonest(v, prefix, 'AC = 6', [H]);
  }, 60_000);
});

describe('#2345 — an arc end that is the circle’s centre is refused naming the statement', () => {
  /** the sentence as the student reads it, the bidi isolation marks around Latin runs dropped */
  const he = (k: string, o: Record<string, string>) => (i18n.getFixedT('he')(k, o) as string).replace(/[⁦-⁩]/g, '');

  it.each([
    // letters re-based to the middle-letter centre (#2486): A is the centre of «… BAO», O of «… AOB»
    [['רבע מעגל BAO'], 'קשת AB = 40'],
    [['חצי מעגל BAO'], 'קשת AB = 40'],
    [['רבע מעגל BAO'], 'קשת AB = 90'],
    [['רבע מעגל AOB'], 'קשת AO = 40'],
    [['רבע מעגל OAB'], 'קשת BO = 40'],
    [['רבע מעגל BAO'], 'קשת AB = 2 קשת BO'],
  ])('%j · «%s»: refused, the point named, no step (none builds)', async (prefix, line) => {
    const v = await decide(prefix, line);
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.note).toMatchObject({ key: 'input.arcEndIsCentreNoStep', params: { detail: line } });
    const text = he('input.arcEndIsCentreNoStep', (v.note as { params: Record<string, string> }).params);
    expect(text).toContain(`«${line}»`);
    expect(text).not.toMatch(/∠/);
  }, 60_000);

  /** §9 taught-remedy lock: the step the sentence offers is submitted through the same path, and it builds. */
  it.each([
    [['מעגל O', 'A על המעגל', 'B על המעגל'], 'קשת OB = 40'],
    [['גזרה AOB'], 'קשת BO = 40'],
  ])('%j · «%s»: the offered step is a line that builds', async (prefix, line) => {
    const v = await decide(prefix, line);
    expect(v.kind).toBe('refuse');
    const note = (v as { note: { key: string; params: Record<string, string> } }).note;
    expect(note.key).toBe('input.arcEndIsCentre');
    const step = note.params.step;
    expect(he('input.arcEndIsCentre', note.params)).toContain(`«${step}»`);
    const proof = await decide(prefix, step);
    expect(proof.kind, `the taught «${step}» builds`).toBe('commit');
  }, 60_000);
});

describe('#2483 — a point stated on two circles: the arc asks which circle', () => {
  it('A and B on both O and P → «קשת AB = 40» asks, never a silent pick', async () => {
    const v = await decide(['מעגל O', 'מעגל P', 'A על מעגל O', 'B על מעגל O', 'A על מעגל P', 'B על מעגל P'], 'קשת AB = 40');
    expect(v.kind).toBe('refuse');
    expect((v as { note: { key: string } }).note.key).toBe('input.ambiguousCircleRef');
  }, 60_000);

  it('[unchanged] B only on P → the arc still resolves to P', async () => {
    const v = await decide(['מעגל O', 'מעגל P', 'A על מעגל P', 'B על מעגל P'], 'קשת AB = 40');
    expect(v.kind).toBe('commit');
    const cmds = v.kind === 'commit' ? (v.commands as readonly { arcOf?: string }[]) : [];
    expect(cmds.some((c) => c.arcOf === 'circle-P')).toBe(true);
  }, 60_000);
});

describe('#2483 — stability and ADR-052', () => {
  it('«רבע מעגל OAB» and «חצי מעגל OAB» alone draw the same first figure as before (θ gauge unchanged)', () => {
    for (const [line, want] of [
      ['רבע מעגל OAB', { O: [0, 0], A: [5, 0], B: [0, 5] }],
      ['חצי מעגל OAB', { O: [0, 0], A: [-5, 0], B: [5, 0] }],
    ] as const) {
      const { facts } = driveThroughGate([line]);
      const fig = replay(facts, 0);
      for (const [id, [x, y]] of Object.entries(want)) {
        expect(fig.positions.get(id)!.x, `${line} ${id}.x`).toBeCloseTo(x, 9);
        expect(fig.positions.get(id)!.y, `${line} ${id}.y`).toBeCloseTo(y, 9);
      }
    }
  });

  it('the radius stays a free DOF: it varies across configurations, the arms stay equal, the angle stays', () => {
    for (const [line, deg] of [['רבע מעגל OAB', 90], ['חצי מעגל OAB', 180]] as const) {
      const { facts } = driveThroughGate([line]);
      const radii = new Set<string>();
      for (const seed of [0, 1, 2, 3]) {
        const fig = replay(facts, seed);
        const p = fig.positions;
        const rA = Math.hypot(p.get('A')!.x - p.get('O')!.x, p.get('A')!.y - p.get('O')!.y);
        const rB = Math.hypot(p.get('B')!.x - p.get('O')!.x, p.get('B')!.y - p.get('O')!.y);
        expect(Math.abs(rA - rB), `${line} @${seed}`).toBeLessThan(1e-9);
        expect(angleAt(p, { centre: 'O', a: 'A', b: 'B', deg })).toBeCloseTo(deg, 6);
        radii.add(rA.toFixed(3));
      }
      expect(radii.size, `${line}: the radius is sampled`).toBeGreaterThan(1);
    }
  });
});
