/**
 * #2430 ([ADR-752](../../docs/06-decisions.md#adr-752)) — A COMMON TANGENT PINNED TO THE TOUCH POINT BY A LATER LINE IS
 * THE TANGENT AT IT, IN EITHER ORDER (operator ruling 2026-10-21 on #2430: "2430 - yes"; the 2-D twin of ADR-AG-321).
 *
 * Measured at main 37800b85 through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked, on «מעגל M» ·
 * «מעגל N» · «המעגלים משיקים בנקודה T» · «AB משיק משותף למעגלים M ו-N»: «T על AB» and «T נמצאת על AB» were refused
 * `over-constrained: T, A, B collinear cannot hold` (~20 s); «T על הישר AB», «הישר AB עובר דרך T» and «AB משיק למעגל M
 * בנקודה T» committed DEFERRED with T 4.186 off AB (14–27 s). `commonTangent` decided the two-touch reading from the lines
 * typed before it, and a two-touch tangent can never pass through T.
 *
 * Every tangency below is computed HERE from the resolved circles and the drawn letters. The model is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function submit(line: string): Promise<{ v: Verdict; ms: number }> {
  const f = replay(st().facts, st().seed);
  const t0 = performance.now();
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  const ms = performance.now() - t0;
  commitVerdict(v, line);
  return { v, ms };
}
async function play(lines: string[]) {
  st().clear();
  for (const line of lines.slice(0, -1)) expect((await submit(line)).v.kind, `«${line}» commits`).toBe('commit');
  const before = st().facts.slice();
  const { v, ms } = await submit(lines[lines.length - 1]);
  return { v, ms, before };
}
const distToLine = (p: Vec, a: Vec, d: Vec) => Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x) / Math.hypot(d.x, d.y);

/** AB tangent to both circles, through T, A and B two distinct points, green, at `seed`. */
function expectAbAtT(seed = st().seed, facts: Fact[] = st().facts) {
  const r = replay(facts, seed);
  expect(r.lastError, `seed ${seed}`).toBeNull();
  expect(r.violations, `seed ${seed} green`).toEqual([]);
  const circles = [...r.circles.values()];
  expect(circles.length, 'exactly the two circles').toBe(2);
  const [A, B, T] = ['A', 'B', 'T'].map((k) => r.positions.get(k)!);
  const d = { x: B.x - A.x, y: B.y - A.y };
  expect(Math.hypot(d.x, d.y), `seed ${seed}: A ≠ B`).toBeGreaterThan(0.05 * Math.max(...circles.map((c) => c.r)));
  for (const c of circles) expect(Math.abs(distToLine(c.center, A, d) - c.r), `seed ${seed}: tangent to both circles`).toBeLessThan(1e-6);
  expect(distToLine(T, A, d), `seed ${seed}: through T`).toBeLessThan(1e-6);
  return r;
}
/** The shown configuration and up to three more from «הציגו תצורה אחרת». */
function expectAcrossConfigs() {
  for (let k = 0; k <= 3; k++) {
    if (k > 0 && !st().cycleVariant()) break;
    expectAbAtT();
  }
}

beforeEach(() => llmParseMock.mockReset());

const EXT = ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T'];
const AB = 'AB משיק משותף למעגלים M ו-N';
const LATER = ['T על AB', 'T על הישר AB', 'T נמצאת על AB', 'הישר AB עובר דרך T', 'AB משיק למעגל M בנקודה T'];

describe('#2430 — a later line that pins the common tangent to T redraws it as the tangent at T', () => {
  for (const later of LATER)
    it(`«${AB}» then «${later}» → AB is the tangent at T, a NEW committed fact, green in the shown and cycled configurations`, async () => {
      const { v, before } = await play([...EXT, AB, later]);
      expect(v.kind).toBe('commit');
      expect((v as { deferred?: boolean }).deferred, 'committed, not deferred').toBeFalsy();
      expect(st().facts.length, 'the line is recorded as a new fact').toBeGreaterThan(before.length);
      for (const [id, s] of Object.entries(replay(st().facts, st().seed).status)) expect(s, `status of fact ${id}`).toBe('ok');
      expectAcrossConfigs();
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('the later line answers in under a second (it took 14–26 s)', async () => {
    for (const later of LATER) {
      const { ms } = await play([...EXT, AB, later]);
      expect(ms, `«${later}»`).toBeLessThan(1000);
    }
  });

  it('the same figure as the other order: AB is the drawn tangent at T with A and B riding it, either order', async () => {
    // Positions are not compared: the FORWARD order moves the radii and T («T על AB» over fresh endpoints recruits the
    // circles, #2412, open), while this order keeps them (the stability case below). The construction is the same.
    const shape = () => {
      const r = expectAbAtT();
      const obj = (id: string) => r.construction.objects.find((o) => o.id === id);
      expect(obj('tan-T')?.kind, 'tan-T drawn').toBe('line');
      for (const k of ['A', 'B']) expect(obj(k), `${k} rides tan-T`).toMatchObject({ kind: 'on-line', line: 'tan-T' });
      return r.circles.size;
    };
    await play([...EXT, 'T על AB', AB]);
    const fwd = shape();
    await play([...EXT, AB, 'T על AB']);
    expect(shape()).toBe(fwd);
  });

  it('stability: M, N, T and both radii do not move across the later line; only A and B move', async () => {
    const { before } = await play([...EXT, AB, 'T על AB']);
    const r0 = replay(before, st().seed), r1 = replay(st().facts, st().seed);
    const c0 = [...r0.circles.values()], c1 = [...r1.circles.values()];
    c0.forEach((c, i) => {
      expect(Math.hypot(c.center.x - c1[i].center.x, c.center.y - c1[i].center.y), `centre ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(c.r - c1[i].r), `radius ${i}`).toBeLessThan(1e-6);
    });
    const [T0, T1] = [r0.positions.get('T')!, r1.positions.get('T')!];
    expect(Math.hypot(T0.x - T1.x, T0.y - T1.y), 'T').toBeLessThan(1e-6);
  });

  it('«… לשני המעגלים», and an unrelated line in between', async () => {
    const { v } = await play([...EXT, 'AB משיק משותף לשני המעגלים', 'נקודה P', 'T על AB']);
    expect(v.kind).toBe('commit');
    expectAbAtT();
  });

  it('existing free A and B (pulled onto the circles as touches) are seated on the tangent at T', async () => {
    const { v } = await play([...EXT, 'נקודה A', 'נקודה B', AB, 'T על AB']);
    expect(v.kind).toBe('commit');
    expectAbAtT();
  });

  it('unticking the later line restores the two-touch tangent (A on M, B on N, T off AB)', async () => {
    await play([...EXT, AB, 'T על AB']);
    const last = st().facts[st().facts.length - 1];
    st().toggle(last.id);
    const r = replay(st().facts, st().seed);
    expect(r.violations).toEqual([]);
    expect(r.construction.objects.some((o) => o.kind === 'line' && o.id === 'tan-T'), 'no tangent at T').toBe(false);
    const [A, B, T] = ['A', 'B', 'T'].map((k) => r.positions.get(k)!);
    expect(distToLine(T, A, { x: B.x - A.x, y: B.y - A.y }), 'T is off the two-touch tangent').toBeGreaterThan(1e-3);
  });
});

describe('#2430 — the kept refusals (ADR-740 H5) and the control', () => {
  it('«AB משיק משותף חיצוני …» then «T על AB» stays refused: no external common tangent passes through an external touch', async () => {
    const { v } = await play([...EXT, 'AB משיק משותף חיצוני למעגלים M ו-N', 'T על AB']);
    expect(v.kind === 'commit' && !(v as { deferred?: boolean }).deferred, JSON.stringify(v).slice(0, 200)).toBe(false);
  });

  it('the line at T already drawn (the #2405 set) then «T על AB» on an external tangent stays refused', async () => {
    const { v } = await play([...EXT, 'כל המשיקים המשותפים לשני המעגלים', 'T על AB']);
    expect(v.kind === 'commit' && !(v as { deferred?: boolean }).deferred, JSON.stringify(v).slice(0, 200)).toBe(false);
  });

  it('control: a two-touch tangent on an apart pair is unchanged by an unrelated later line', async () => {
    const { v } = await play(['שני מעגלים זרים', 'AB משיק משותף לשני המעגלים', 'נקודה P']);
    expect(v.kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    expect(r.violations).toEqual([]);
    expect(r.construction.objects.some((o) => o.kind === 'line' && o.id.startsWith('tan-'))).toBe(false);
    expect(r.construction.objects.some((o) => o.kind === 'on-circle' && o.id === 'A')).toBe(true);
  });
});
