/**
 * #2188 ([ADR-672](../../../docs/06-decisions.md#adr-672)) — A RESTATED TANGENCY KEEPS THE KIND STATED EARLIER (operator
 * ruling 2026-10-16, card 14 A: *"Keep the kind stated earlier"*).
 *
 * Measured at `062d059b` through `decideDeterministic2D` → `commitVerdict` → `replay`: after «המעגלים O ו-P משיקים
 * מבפנים», «המעגלים O ו-P משיקים בנקודה X» lowered `circles-tangent … external:true` — the figure jumped to external and
 * the earlier internal row turned red; with stated radii 5 and 2 it was refused over-constrained; «AB משיק משותף
 * למעגלים O ו-P בנקודה X» re-asserted `set-line [O, X, P]` (an external order) and turned the internal row red. Root
 * cause: three lowerings defaulted to external and the parser never read what the construction already states about
 * the pair. Fix: the tangency record carries its kind, `statedTangencies` exposes it, and every restatement without a
 * kind word inherits it.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function play(pre: string[], last: string, lang: 'he' | 'en' = 'he') {
  st().clear();
  const submit = async (line: string, l: 'he' | 'en') => {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, l);
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line, /[a-z]{3}/.test(line) ? 'en' : 'he')).kind, `«${line}» commits`).toBe('commit');
  const before = new Map(replay(st().facts, st().seed).positions);
  const n0 = st().facts.length;
  const v = await submit(last, lang);
  return { kind: v.kind, before, added: st().facts.slice(n0).map((f) => f.cmd as AnyCommand) };
}

function kindAt(seed: number) {
  const r = replay(st().facts, seed);
  const O = r.positions.get('O')!, P = r.positions.get('P')!;
  const ro = r.circles.get('circle-O')!.r, rp = r.circles.get('circle-P')!.r;
  const d = Math.hypot(O.x - P.x, O.y - P.y);
  return { kind: Math.abs(d - (ro + rp)) < 1e-4 ? 'EXT' : Math.abs(d - Math.abs(ro - rp)) < 1e-4 ? 'INT' : 'none', r, d };
}

/** Internal at seeds 0–3, green, the touch named X (no M), O and P unmoved from the prior line. */
function expectInternalAtX(r: { kind: string; before: Map<string, { x: number; y: number }> }, touch = 'X') {
  expect(r.kind).toBe('commit');
  for (const seed of [0, 1, 2, 3]) {
    const k = kindAt(seed);
    expect(k.kind, `seed ${seed}`).toBe('INT');
    expect(k.r.violations, `seed ${seed} green`).toEqual([]);
  }
  const f = replay(st().facts, st().seed);
  expect(f.positions.has(touch), `${touch} drawn`).toBe(true);
  if (touch !== 'M') expect(f.positions.has('M'), 'the touch letter M yielded').toBe(false);
  for (const id of ['O', 'P']) {
    const a = r.before.get(id)!, b = f.positions.get(id)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y), `${id} unmoved`).toBeLessThan(1e-9);
  }
  expect(llmParseMock).not.toHaveBeenCalled();
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const INT = [...PAIR, 'המעגלים O ו-P משיקים מבפנים'];

describe('#2188 — after «…משיקים מבפנים», a restatement naming no kind stays internal', () => {
  const TWINS = [
    'המעגלים O ו-P משיקים בנקודה X', // the report
    'המעגלים O ו-P משיקים זה לזה בנקודה X',
    'המעגלים משיקים בנקודה X',
    'שני המעגלים משיקים בנקודה X',
    'המעגלים P ו-O משיקים בנקודה X', // pair reversed
    'מעגל P משיק למעגל O בנקודה X',
  ];
  for (const line of TWINS) it(`«${line}» → INT at X`, async () => expectInternalAtX(await play(INT, line)));
  it('English: "circles O and P are tangent at X" → INT at X', async () => expectInternalAtX(await play(INT, 'circles O and P are tangent at X', 'en')));

  for (const line of ['המעגלים O ו-P משיקים', 'מעגל O משיק למעגל P', 'המעגלים משיקים'])
    it(`no touch named: «${line}» → stays INT, green`, async () => {
      const r = await play(INT, line);
      // #2209 (ADR-703): the restatement lowers onto the stated tangency (its touch M, its kind), so it adds nothing
      expect(r.kind).toBe('noop');
      for (const seed of [0, 1, 2, 3]) expect(kindAt(seed).kind).toBe('INT');
      expect(kindAt(0).r.violations).toEqual([]);
    });

  for (const [how, first] of [
    ['"internally"', ['circle O', 'circle P', 'circles O and P are internally tangent']],
    ['one by one', [...PAIR, 'מעגל O ומעגל P משיקים מבפנים']],
    ['«פנימית»', [...PAIR, 'המעגלים O ו-P משיקים פנימית']],
    ['on an empty figure', ['המעגלים O ו-P משיקים מבפנים']],
  ] as const)
    it(`the internal kind first stated ${how}, then the twin → INT at X`, async () => expectInternalAtX(await play([...first], 'המעגלים O ו-P משיקים בנקודה X')));

  // Stated radii pin |OP| = 3, so the restating line re-seats the pair — exactly as the 2-D control «…משיקים מבפנים
  // בנקודה X» (the kind word typed) does: the lock is equality with that control, not "unmoved".
  it('stated radii 5 and 2: the twin builds (|OP| = 3), the figure of «…מבפנים בנקודה X» — was refused over-constrained', async () => {
    const pre = ['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים מבפנים'];
    const r = await play(pre, 'המעגלים O ו-P משיקים בנקודה X');
    expect(r.kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) expect(kindAt(seed).kind).toBe('INT');
    expect(kindAt(0).r.violations).toEqual([]);
    expect(kindAt(0).d).toBeCloseTo(3, 6);
    const ours = replay(st().facts, st().seed).positions;
    await play(pre, 'המעגלים O ו-P משיקים מבפנים בנקודה X');
    const control = replay(st().facts, st().seed).positions;
    for (const id of ['O', 'P', 'X']) expect(Math.hypot(ours.get(id)!.x - control.get(id)!.x, ours.get(id)!.y - control.get(id)!.y), id).toBeLessThan(1e-9);
  });
});

describe('#2188 — the common tangent at the touch keeps the internal kind', () => {
  /** INT, green, the tangent line drawn at the touch ⟂ OP. */
  function expectTangentAtTouch(touch: string) {
    for (const seed of [0, 1, 2, 3]) {
      const k = kindAt(seed);
      expect(k.kind, `seed ${seed}`).toBe('INT');
      expect(k.r.violations).toEqual([]);
    }
    const f = replay(st().facts, st().seed);
    const line = f.construction.objects.find((o) => o.kind === 'line' && o.id === `tan-${touch}`);
    expect(line, `tangent line at ${touch}`).toBeDefined();
    expect(llmParseMock).not.toHaveBeenCalled();
  }
  it('«AB משיק משותף למעגלים O ו-P בנקודה X» → INT, tangent at X', async () => {
    expect((await play(INT, 'AB משיק משותף למעגלים O ו-P בנקודה X')).kind).toBe('commit');
    expectTangentAtTouch('X');
  });
  it('«המשיק המשותף למעגלים O ו-P בנקודה X» → INT, tangent at X', async () => {
    expect((await play(INT, 'המשיק המשותף למעגלים O ו-P בנקודה X')).kind).toBe('commit');
    expectTangentAtTouch('X');
  });
  it('the touch T already named: «…משיקים מבפנים בנקודה T» · «AB משיק משותף … בנקודה T» → INT, tangent at T', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P משיקים מבפנים בנקודה T'], 'AB משיק משותף למעגלים O ו-P בנקודה T');
    expect(r.kind).toBe('commit');
    expect(r.added.some((c) => c.type === 'set-line'), 'no external order re-asserted').toBe(false);
    expectTangentAtTouch('T');
  });
});

describe('#2188 — the kind lives in the restatement’s own fact', () => {
  it('deleting the earlier «…משיקים מבפנים» line leaves the circles internally tangent at X', async () => {
    await play(INT, 'המעגלים O ו-P משיקים בנקודה X');
    const first = st().facts.find((f) => f.utterance === 'המעגלים O ו-P משיקים מבפנים')!;
    st().removeGroup(groupKey(first));
    expect(kindAt(0).kind).toBe('INT');
    expect(kindAt(0).r.violations).toEqual([]);
  });
});

describe('#2188 — controls', () => {
  it('external first: the twin stays EXT, green', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P משיקים מבחוץ'], 'המעגלים O ו-P משיקים בנקודה X');
    expect(r.kind).toBe('commit');
    expect(kindAt(0).kind).toBe('EXT');
    expect(kindAt(0).r.violations).toEqual([]);
  });
  it('no kind stated: the twin alone is EXT', async () => {
    await play(PAIR, 'המעגלים O ו-P משיקים בנקודה X');
    expect(kindAt(0).kind).toBe('EXT');
  });
  // #2339 (ADR-743) re-based: an explicit «מבחוץ» against the stated internal kind is a contradiction, refused before
  // commit (it used to commit EXT with the earlier internal row red); the explicit word is still read, never inherited over.
  it('an explicit «מבחוץ» on the restatement is read — and refused as contradicting the internal kind', async () => {
    const r = await play(INT, 'המעגלים O ו-P משיקים מבחוץ בנקודה X');
    expect(r.kind).toBe('refuse');
    expect(kindAt(0).kind).toBe('INT');
    expect(kindAt(0).r.violations).toEqual([]);
  });
  it('the two-line membership form «X על מעגל O» · «X על מעגל P» after INT is unchanged (INT, X only)', async () => {
    await play([...INT, 'X על מעגל O'], 'X על מעגל P');
    expect(kindAt(0).kind).toBe('INT');
    expect(replay(st().facts, st().seed).positions.has('M')).toBe(false);
  });
  it('the external twin of the common tangent at X draws EXT, green', async () => {
    expect((await play([...PAIR, 'המעגלים O ו-P משיקים מבחוץ'], 'AB משיק משותף למעגלים O ו-P בנקודה X')).kind).toBe('commit');
    expect(kindAt(0).kind).toBe('EXT');
    expect(kindAt(0).r.violations).toEqual([]);
  });
  it('«…משיקים מבפנים» · «…משיקים ברדיוסים שווים» is never committed GREEN with the circles collapsed', async () => {
    const r = await play(INT, 'המעגלים O ו-P משיקים ברדיוסים שווים');
    if (r.kind === 'commit') expect(kindAt(0).r.violations.length, 'a red row, never a green collapse').toBeGreaterThan(0);
  });
});
