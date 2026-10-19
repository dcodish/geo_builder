/**
 * #2197 ([ADR-736](../../../docs/06-decisions.md#adr-736)) — A PAIR STATED AS A ROLE OF ONE CIRCLE AND TANGENT TO ANOTHER
 * HOLDS BOTH, OR THE LINE IS NOT COMMITTED.
 *
 * Measured on #2185's tip (ec91bf9b) through `decideDeterministic2D` → `commitVerdict` → `replay`: «AB מיתר במעגל O ומשיק
 * למעגל P» committed green with NO segment AB and a tangent from P to circle O (A its touch point); dist(P, AB) − r_P =
 * −1.26 / 6.26 / 1.57 / −3.50 at seeds 0–3. «AB קוטר במעגל O ומשיק למעגל P» put A on B. Two mechanisms: `tangentChord`
 * (the rule written for the statement) declined without a named touch and never read the diameter noun, so
 * `tangentFromExternal` took the line and read the name P as an apex; and the tangent verb gate was paid by a tangent
 * to ANY circle (the Thales aux of a tangent to O).
 *
 * Tangency is read off the replayed positions: dist(target centre, line AB) − r < 1e-6 and the foot inside AB. The model
 * is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { clauseCoverageVerdict } from '@/app/clauseCoverage';
import { buildParseCtx, droppedGivenVerbs, parse } from '@/parser';
import { VERB_TANGENT } from '@/parser/parse';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[א-ת]/.test(line) ? 'he' : 'en');
  commitVerdict(v, line);
  return v;
}
async function play(pre: string[], last: string) {
  st().clear();
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const n0 = st().facts.length;
  const v = await submit(last);
  return { kind: v.kind, note: (v as { note?: { key?: string } | null }).note?.key, added: st().facts.length - n0 };
}

/** AB as drawn at `seed`: ends on the host, the segment present, tangent to the target with the touch inside AB. */
function holds(host: string, target: string, seed: number, [a, b] = ['A', 'B']) {
  const r = replay(st().facts, seed);
  const A = r.positions.get(a)!, B = r.positions.get(b)!;
  const h = r.circles.get(`circle-${host}`)!, t = r.circles.get(`circle-${target}`)!;
  const on = (X: { x: number; y: number }) => Math.abs(Math.hypot(X.x - h.center.x, X.y - h.center.y) - h.r);
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
  const dist = Math.abs(dx * (t.center.y - A.y) - dy * (t.center.x - A.x)) / L;
  const foot = ((t.center.x - A.x) * dx + (t.center.y - A.y) * dy) / (L * L);
  const seg = st().facts.some((f) => f.enabled !== false && f.cmd.type === 'segment' && [f.cmd.a, f.cmd.b].sort().join('') === [a, b].sort().join(''));
  return { onHost: on(A) < 1e-6 && on(B) < 1e-6, seg, tangent: Math.abs(dist - t.r) < 1e-6, inside: foot >= -1e-9 && foot <= 1 + 1e-9, len: L, green: r.violations.length === 0 && r.lastError === null };
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2197 — a chord (or diameter) of one circle tangent to another: AB drawn, touching the other circle inside AB', () => {
  const ROWS: [string[], string, string, string][] = [
    [PAIR, 'AB מיתר במעגל O ומשיק למעגל P', 'O', 'P'], // the report
    [PAIR, 'AB מיתר במעגל O, משיק למעגל P', 'O', 'P'],
    [PAIR, 'AB מיתר במעגל O וגם משיק למעגל P', 'O', 'P'],
    [PAIR, 'המיתר AB במעגל O משיק למעגל P', 'O', 'P'],
    [PAIR, 'המיתר AB של מעגל O משיק למעגל P', 'O', 'P'],
    [PAIR, 'AB מיתר במעגל O שמשיק למעגל P', 'O', 'P'],
    [PAIR, 'AB מיתר במעגל O והוא משיק למעגל P', 'O', 'P'],
    [PAIR_EN, 'AB is a chord of circle O and tangent to circle P', 'O', 'P'],
    [PAIR, 'AB מיתר במעגל P ומשיק למעגל O', 'P', 'O'], // the circles swapped
    [PAIR, 'AB קוטר במעגל O ומשיק למעגל P', 'O', 'P'], // the diameter noun (A ≡ B before)
  ];
  for (const [pre, line, host, target] of ROWS)
    it(`«${line}» → AB on circle ${host}, drawn, tangent to circle ${target} (seeds 0–3)`, async () => {
      expect((await play(pre, line)).kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) {
        const h = holds(host, target, seed);
        expect(h, `seed ${seed}`).toMatchObject({ onHost: true, seg: true, tangent: true, inside: true, green: true });
        expect(h.len, `seed ${seed}: |AB| > 0`).toBeGreaterThan(1e-3);
      }
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('the diameter passes through its circle’s centre', async () => {
    await play(PAIR, 'AB קוטר במעגל O ומשיק למעגל P');
    for (const seed of [0, 1, 2, 3]) {
      const r = replay(st().facts, seed);
      const A = r.positions.get('A')!, B = r.positions.get('B')!, O = r.positions.get('O')!;
      expect(Math.hypot((A.x + B.x) / 2 - O.x, (A.y + B.y) / 2 - O.y), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });

  it('the one line draws exactly the two lines «AB מיתר במעגל O» · «AB משיק למעגל P», seed for seed', async () => {
    const snap = () => [0, 1, 2, 3].map((seed) => {
      const r = replay(st().facts, seed);
      return ['A', 'B', 'O', 'P'].map((id) => r.positions.get(id)!).map((p) => [p.x, p.y]).concat([[r.circles.get('circle-P')!.r, 0]]);
    });
    await play(PAIR, 'AB מיתר במעגל O ומשיק למעגל P');
    const one = snap();
    await play([...PAIR, 'AB מיתר במעגל O'], 'AB משיק למעגל P');
    const two = snap();
    one.flat(2).forEach((v, i) => expect(v).toBeCloseTo(two.flat(2)[i], 9));
  });

  it('«HK מיתר במעגל O ומשיק למעגל P» (scenario compound-line-all-or-none-1798, step 6) → HK drawn, tangent to P', async () => {
    expect((await play(PAIR, 'HK מיתר במעגל O ומשיק למעגל P')).kind).toBe('commit');
    expect(holds('O', 'P', 0, ['H', 'K'])).toMatchObject({ onHost: true, seg: true, tangent: true, inside: true, green: true });
  });

  it('the 24-seed whole-rate on the report: tangent inside AB, |AB| > 0, green at every seed', async () => {
    await play(PAIR, 'AB מיתר במעגל O ומשיק למעגל P');
    let whole = 0;
    for (let seed = 0; seed < 24; seed++) {
      const h = holds('O', 'P', seed);
      if (h.onHost && h.seg && h.tangent && h.inside && h.green && h.len > 1e-3) whole++;
    }
    expect(whole).toBeGreaterThanOrEqual(20);
  });
});

describe('#2197 — the touch named at an end', () => {
  it('«AB מיתר במעגל O ומשיק למעגל P בנקודה B» (unchanged) → B on P, PB ⟂ AB', async () => {
    expect((await play(PAIR, 'AB מיתר במעגל O ומשיק למעגל P בנקודה B')).kind).toBe('commit');
    expect(holds('O', 'P', 0)).toMatchObject({ onHost: true, seg: true, tangent: true, green: true });
  });
  it('«AB קוטר במעגל O ומשיק למעגל P בנקודה B» builds (was refused split-statements) → a diameter of O touching P at B', async () => {
    expect((await play(PAIR, 'AB קוטר במעגל O ומשיק למעגל P בנקודה B')).kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) {
      expect(holds('O', 'P', seed), `seed ${seed}`).toMatchObject({ onHost: true, seg: true, tangent: true, green: true });
      const r = replay(st().facts, seed);
      const B = r.positions.get('B')!, P = r.positions.get('P')!;
      expect(Math.abs(Math.hypot(B.x - P.x, B.y - P.y) - r.circles.get('circle-P')!.r), `seed ${seed}: the touch is B`).toBeLessThan(1e-6);
    }
  });
});

describe('#2197 — never committed with a circle’s role dropped', () => {
  // The chord + chord / chord + diameter rows: after #2185 (ADR-735) the second circle's name is unaccounted, so the
  // line goes to the AI. Building them whole (#2216 / #1950's "builds whole with the tip") needs a reading this fix does
  // not add — locked here only as never green with the second role missing.
  for (const [line, role] of [
    ['AB מיתר במעגל O ומיתר במעגל P', 'chord'],
    ['AB מיתר במעגל O וקוטר במעגל P', 'diameter'],
    ['AB קוטר במעגל O ומיתר במעגל P', 'chord'],
  ] as const)
    it(`«${line}» is never committed with circle P's ${role} dropped`, async () => {
      const r = await play(PAIR, line);
      if (r.kind === 'commit') {
        const g = replay(st().facts, 0);
        const A = g.positions.get('A')!, P = g.positions.get('P')!, rp = g.circles.get('circle-P')!.r;
        expect(Math.abs(Math.hypot(A.x - P.x, A.y - P.y) - rp)).toBeLessThan(1e-6);
      } else expect(r.added).toBe(0);
    });
});

describe('#2197 — controls (unchanged at ec91bf9b)', () => {
  it('«AB משיק למעגל P ומיתר במעגל O» (tangent first) is not committed', async () => {
    const r = await play(PAIR, 'AB משיק למעגל P ומיתר במעגל O');
    expect(r.kind).not.toBe('commit');
    expect(r.added).toBe(0);
  });
  it('on an empty figure the report is not committed', async () => {
    const r = await play([], 'AB מיתר במעגל O ומשיק למעגל P');
    expect(r.kind).not.toBe('commit');
  });
  it('after «CD קוטר במעגל O»: «AB מיתר במעגל O ומקביל ל-CD» keeps both predicates', async () => {
    expect((await play(['מעגל O', 'CD קוטר במעגל O'], 'AB מיתר במעגל O ומקביל ל-CD')).kind).toBe('commit');
  });
  it('«AB ו AD משיקים למעגל O» (the corner tangent, a radius-⟂ from O) still commits', async () => {
    expect((await play(['מעגל O'], 'AB ו AD משיקים למעגל O')).kind).toBe('commit');
  });
  it('«מעגל P משיק למעגל O מבפנים» (a circle subject, ADR-669) still commits', async () => {
    expect((await play(PAIR, 'מעגל P משיק למעגל O מבפנים')).kind).toBe('commit');
  });
});

describe('#2197 Net A — the tangent verb is evidenced only by a construction about the circle it governs', () => {
  const MISBOUND: AnyCommand[] = [
    { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
    { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
    { type: 'midpoint', id: '~tanmid-OP', a: 'O', b: 'P' },
    { type: 'circle-through', id: 'tanaux-OP', center: '~tanmid-OP', through: 'O', hidden: true },
    { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'tanaux-OP', branch: 0 },
    { type: 'segment', a: 'P', b: 'A' },
  ] as AnyCommand[];
  it('a tangent to circle O (the Thales aux from P) does not evidence «משיק למעגל P»', () => {
    expect(droppedGivenVerbs('AB מיתר במעגל O ומשיק למעגל P', MISBOUND)).toContain(VERB_TANGENT);
  });
  it('the foot from P on circle P does', () => {
    const OK: AnyCommand[] = [
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'foot', id: '@tang-P-A-B', from: 'P', a: 'A', b: 'B' },
      { type: 'point-on-circle', id: '@tang-P-A-B', circle: 'circle-P' },
      { type: 'set-line', points: ['A', '@tang-P-A-B', 'B'] },
    ] as AnyCommand[];
    expect(droppedGivenVerbs('AB מיתר במעגל O ומשיק למעגל P', OK)).not.toContain(VERB_TANGENT);
  });
  it('a radius-⟂ from the governed centre evidences it', () => {
    const PERP: AnyCommand[] = [
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'set-perpendicular', a: 'O', b: 'B', c: 'A', d: 'B', implicit: true },
      { type: 'segment', a: 'A', b: 'B' },
    ] as AnyCommand[];
    expect(droppedGivenVerbs('AB משיק למעגל O בנקודה B', PERP)).not.toContain(VERB_TANGENT);
  });
});

describe('#2197 — both seams ask one clause-coverage verdict', () => {
  function makeDeps() {
    const notes: string[] = [];
    const deps: EditDeps = { t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} };
    return { deps, notes };
  }
  function submitStep(utterance: string): string {
    const view = replay(st().facts, st().seed);
    const r = parse(utterance, buildParseCtx(view.construction, view.positions));
    if (!r.ok) throw new Error(`«${utterance}» must parse`);
    st().executeMany(r.commands, utterance);
    return groupKey(st().facts[st().facts.length - 1]);
  }
  it('clauseCoverageVerdict refuses a lowering that leaves a clause untraced («AB מקביל ל-CD ו-D על BC» read as the parallel alone)', () => {
    st().clear();
    submitStep('משולש BCX');
    submitStep('קטע AB');
    submitStep('קטע CD');
    const view = replay(st().facts, st().seed);
    const ctx = buildParseCtx(view.construction, view.positions);
    const parallelOnly: AnyCommand[] = [{ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'D' } as AnyCommand];
    expect(clauseCoverageVerdict('AB מקביל ל-CD ו-D על BC', parallelOnly, ctx, st().facts, st().seed)).toMatchObject({ messageKey: 'input.scope.split-statements' });
  });
  for (const line of ['AB מיתר במעגל O ומשיק למעגל P', 'AB קוטר במעגל O ומשיק למעגל P'])
    it(`✎ editing «AB מיתר במעגל O» into «${line}» builds the tangent figure`, () => {
      st().clear();
      submitStep('מעגל O');
      submitStep('מעגל P');
      const key = submitStep('AB מיתר במעגל O');
      const { deps } = makeDeps();
      expect(runEditCommit(key, line, deps)).toBe(true);
      for (const seed of [0, 1, 2, 3]) expect(holds('O', 'P', seed), `seed ${seed}`).toMatchObject({ onHost: true, seg: true, tangent: true, inside: true });
    });
  for (const line of ['AB מיתר במעגל O וקוטר במעגל P', 'AB קוטר במעגל O ומיתר במעגל P'])
    it(`✎ editing into «${line}» is refused (circle P's role would be dropped)`, () => {
      st().clear();
      submitStep('מעגל O');
      submitStep('מעגל P');
      const key = submitStep('AB מיתר במעגל O');
      const before = st().facts.length;
      const { deps, notes } = makeDeps();
      expect(runEditCommit(key, line, deps)).toBe(false);
      expect(st().facts.length).toBe(before);
      expect(notes.at(-1)).toMatch(/^steps\.edit/);
    });
});
