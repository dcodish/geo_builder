/**
 * #1709 ([ADR-567](../../docs/06-decisions.md#adr-567)) — circles a statement tells apart ASK which one. The operator's
 * #1688 ruling (2026-10-02): two fresh INTERCHANGEABLE circles are named by order on first mention; circles a statement
 * tells apart ask which one. A nested pair is told apart by «מוכל בתוך … הגדול», yet «מעגל מוכל בתוך המעגל הגדול» ·
 * «C על מעגל P» silently named the OUTER circle P.
 *
 * Measured root cause: a stated containment drives nothing (a strict inequality), so it lived only in its fact command
 * (`set-circle-position`). The figure the interchangeability test (`autosInterchangeable`, `parser/context.ts`) reads
 * held two identical unnamed circles. The fix records the stated mutual position on the construction (the ADR-549
 * requirement records) and the test reads every requirement record.
 *
 * The runner is the real pre-LLM decision `runSubmit` dispatches — `decideDeterministic2D` — with each accepted line
 * applied to the store as the pipeline applies it (store ops, then the binds, then the one batch commit). The model is
 * mocked and never asked (standing rule 2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { llmParse } from '@/parser/llm';
import { buildParseCtx } from '@/parser';
import { sideImpossibility } from '@/engine/sideFeasibility';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const NESTED = 'מעגל מוכל בתוך המעגל הגדול';

async function run(lines: string[], locale: 'he' | 'en' = 'he'): Promise<Verdict2D[]> {
  st().clear();
  const out: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    if (v.kind === 'store-op') {
      const res = v.op === 'name-centre' ? st().nameCentre(v.from, v.to) : v.op === 'rename' ? st().rename(v.from, v.to) : v.op === 'swap' ? st().swap(v.from, v.to) : st().merge(v.from, v.to);
      expect(res, `«${line}» store op`).toEqual({ ok: true });
      // a size qualifier both refers and asserts (#102) — the pipeline commits its order (submitPipeline.ts)
      if (v.op === 'name-centre' && v.assert) st().execute({ type: 'set-radius-order', outer: v.assert.outer, inner: v.assert.inner }, line);
    } else {
      commitVerdict(v, line); // #1697: the pipeline's own commit — the naming is a fact of the line
    }
    out.push(v);
  }
  return out;
}
const fig = () => replay(st().facts, st().seed);
type Circ = { id: string; center: string; autoCenter?: boolean; radius: { value: number } };
const circles = () => fig().construction.objects.filter((o) => o.kind === 'circle') as unknown as Circ[];
const pos = (id: string): Vec => {
  const p = fig().positions.get(id);
  expect(p, `${id} has a position`).toBeDefined();
  return p!;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const allOk = () => {
  const f = fig();
  expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
  expect(f.violations).toEqual([]);
};
const built = (vs: Verdict2D[]) => vs.forEach((v, i) => expect(['commit', 'noop', 'store-op'], `line ${i + 1}: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind));
/** The which-circle question (#186): a clarify that names the student's letter, and nothing committed. */
const asks = (v: Verdict2D, letter: string) => {
  expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('refuse');
  const r = v as Extract<Verdict2D, { kind: 'refuse' }>;
  expect(r.category).toBe('clarify');
  expect(r.note).toEqual({ key: 'input.unknownCircle', params: { center: letter } });
};
const unnamed = () => circles().filter((c) => c.center.startsWith('@ctr-')).length;
/** The circle point `p` rides, and whether it is the containing (bigger) one of the pair. */
const ridesOuter = (p: string): boolean => {
  const P = pos(p);
  const [a, b] = circles();
  const onA = Math.abs(dist(P, pos(a.center)) - a.radius.value);
  const onB = Math.abs(dist(P, pos(b.center)) - b.radius.value);
  const on = onA < onB ? a : b;
  const other = on === a ? b : a;
  return on.radius.value > other.radius.value;
};

beforeEach(() => vi.mocked(llmParse).mockClear());

describe('#1709 — a nested pair is told apart, so a new letter asks which circle', () => {
  it('the report: «מעגל מוכל בתוך המעגל הגדול» · «C על מעגל P» asks which circle; nothing is named', async () => {
    const vs = await run([NESTED, 'C על מעגל P']);
    built(vs.slice(0, 1));
    asks(vs[1], 'P');
    expect(unnamed(), 'both circles stay unnamed').toBe(2);
    expect(fig().construction.objects.some((o) => o.id === 'C'), 'C is not placed on a guessed circle').toBe(false);
    expect(llmParse).not.toHaveBeenCalled();
  });

  it('«O מרכז המעגל» on the nested pair asks too', async () => {
    const vs = await run([NESTED, 'O מרכז המעגל']);
    asks(vs[1], 'O');
    expect(unnamed()).toBe(2);
  });

  it('the plural «שני מעגלים מוכלים» · «C על מעגל P» asks', async () => {
    const vs = await run(['שני מעגלים מוכלים', 'C על מעגל P']);
    asks(vs[1], 'P');
  });

  it('English: "a circle contained in the big circle" · "C on circle P" asks', async () => {
    const vs = await run(['a circle contained in the big circle', 'C on circle P'], 'en');
    asks(vs[1], 'P');
  });

  it('the remedy drives: «מרכז המעגל הקטן הוא P» · «C על מעגל P» · «D על מעגל O» — C on the inner, D on the outer', async () => {
    built(await run([NESTED, 'מרכז המעגל הקטן הוא P', 'C על מעגל P', 'D על מעגל O']));
    expect(ridesOuter('C'), 'C rides the contained circle P').toBe(false);
    expect(ridesOuter('D'), 'D rides the container, named O by use (the only unnamed one left)').toBe(true);
    const P = circles().find((c) => c.center === 'P')!, O = circles().find((c) => c.center === 'O')!;
    expect(dist(pos('O'), pos('P')) + P.radius.value, 'P lies strictly inside O').toBeLessThan(O.radius.value);
    allOk();
  });

  it('the taught remedy «מרכז המעגל הימני הוא P» (the note’s example) also drives', async () => {
    built(await run([NESTED, 'מרכז המעגל הימני הוא P', 'C על מעגל P']));
    expect(circles().some((c) => c.center === 'P')).toBe(true);
    allOk();
  });
});

describe('#1709 — the interchangeability test reads the stated relations', () => {
  const ctxAfter = async (lines: string[]) => {
    await run(lines);
    const f = fig();
    return { f, ctx: buildParseCtx(f.construction, f.positions) };
  };

  it('a nested pair carries its containment record and is NOT interchangeable', async () => {
    const { f, ctx } = await ctxAfter([NESTED]);
    expect(f.construction.requirements).toEqual([{ kind: 'circle-position', relation: 'contained', a: 'circle-O', b: 'circle-P' }]);
    expect(ctx.autosInterchangeable).toBe(false);
    expect(sideImpossibility(f.construction), 'a position record is no side').toBeNull();
  });

  it('a disjoint pair is an unordered relation — still interchangeable', async () => {
    const { f, ctx } = await ctxAfter(['שני מעגלים זרים']);
    expect(f.construction.requirements?.[0]).toMatchObject({ kind: 'circle-position', relation: 'disjoint' });
    expect(ctx.autosInterchangeable).toBe(true);
  });

  it('the bare «שני מעגלים» states no position — records nothing, interchangeable', async () => {
    const { f, ctx } = await ctxAfter(['שני מעגלים']);
    expect(f.construction.requirements).toBeUndefined();
    expect(ctx.autosInterchangeable).toBe(true);
  });
});

describe('#1709 controls — the #1688 ruling (b) and the other tell-apart relations are unchanged', () => {
  it('a fresh intersecting pair is still named by order: «C על מעגל P» · «D על מעגל O» build', async () => {
    built(await run(['שני מעגלים נחתכים', 'C על מעגל P', 'D על מעגל O']));
    expect(circles().map((c) => c.center).sort()).toEqual(['O', 'P']);
    allOk();
  });

  it('an externally tangent pair is still named by order', async () => {
    built(await run(['שני מעגלים משיקים מבחוץ', 'C על מעגל P', 'D על מעגל O']));
    expect(circles().map((c) => c.center).sort()).toEqual(['O', 'P']);
    allOk();
  });

  it('a disjoint pair is still named by order', async () => {
    built(await run(['שני מעגלים זרים', 'C על מעגל P', 'D על מעגל O']));
    expect(circles().map((c) => c.center).sort()).toEqual(['O', 'P']);
    allOk();
  });

  it('one stated bigger («C על המעגל הגדול») asks', async () => {
    const vs = await run(['שני מעגלים נחתכים', 'C על המעגל הגדול', 'D על מעגל P']);
    built(vs.slice(0, 2));
    asks(vs[2], 'P');
  });

  it('a stated radius («רדיוס המעגל הגדול הוא 5») asks', async () => {
    const vs = await run(['שני מעגלים נחתכים', 'רדיוס המעגל הגדול הוא 5', 'C על מעגל P']);
    built(vs.slice(0, 2));
    asks(vs[2], 'P');
  });

  it('an internally tangent pair asks (its relation was already asymmetric)', async () => {
    const vs = await run(['שני מעגלים משיקים מבפנים', 'C על מעגל P']);
    asks(vs[1], 'P');
  });
});
