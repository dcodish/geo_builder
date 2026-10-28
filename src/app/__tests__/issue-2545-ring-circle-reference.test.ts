/**
 * #2545 ([ADR-768](../../../docs/06-decisions.md#adr-768)) — a circle named by its relation to a polygon («המעגל החוסם»,
 * «המעגל החסום», "the circumcircle") is read where the relation stands: it binds the described circle, or the line is
 * refused with the existing one-input-per-line message naming the two lines that build it (FR-IN-4g, ADR-603).
 *
 * Measured at d9494206 through `decideDeterministic2D`, the LLM mocked to throw: «משולש ABC» · «DE מיתר במעגל החוסם»
 * committed a free circle with D, E on it, |dist(centre, vertex) − r| = 3.77 / 1.00 / 5.00 at seed 0, every fact green.
 * All 34 rows of `REFUSED` + `AMBIGUOUS` + `WEAK` committed green there (34 of 34 fail before; ADR-768).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG, buildParseCtx, parse } from '@/parser';
import { RING_CIRCUM_HE, RING_INSCR_HE } from '@/parser/lexicon';

const st = () => useGeoStore.getState();

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `«${p}» builds: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind);
    commitVerdict(v, p);
  }
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockImplementation(() => {
    throw new Error('LIVE LLM CALLED');
  });
});

const parts = (first: string, second: string) => ({ key: 'input.scope.split-statements', params: { first, second, all: `(1) ${first}  (2) ${second}` } });
const T = ['משולש ABC'];
const TE = ['triangle ABC'];
const Q = ['מרובע ABCD'];
const CIRC = 'מעגל O חוסם את משולש ABC';
const IN = 'מעגל O חסום במשולש ABC';
const CIRC_EN = 'circle O circumscribes triangle ABC';
const IN_EN = 'circle O is inscribed in triangle ABC';

/** The plan's measured class (§1 A, A′, A″): prefix, line, the two taught lines. */
const REFUSED: [string, string[], string, string, string][] = [
  ['R1 the report', T, 'DE מיתר במעגל החוסם', CIRC, 'DE מיתר במעגל O'],
  ['R2 the report\'s twin', T, 'DE מיתר במעגל החוסם את המשולש', CIRC, 'DE מיתר במעגל O'],
  ['R5 «המיתר DE»', T, 'המיתר DE במעגל החוסם', CIRC, 'המיתר DE במעגל O'],
  ['R6 «מיתר DE … את המשולש»', T, 'מיתר DE במעגל החוסם את המשולש', CIRC, 'מיתר DE במעגל O'],
  ['K1 a point on it', T, 'P על המעגל החוסם', CIRC, 'P על מעגל O'],
  ['K2 «נקודה P»', T, 'נקודה P על המעגל החוסם', CIRC, 'נקודה P על מעגל O'],
  ['K3 «… את המשולש»', T, 'P על המעגל החוסם את המשולש', CIRC, 'P על מעגל O'],
  ['K4 a diameter', T, 'DE קוטר במעגל החוסם', CIRC, 'DE קוטר במעגל O'],
  ['K4b a diameter, «את המשולש»', T, 'DE קוטר במעגל החוסם את המשולש', CIRC, 'DE קוטר במעגל O'],
  ['K7 the incircle', T, 'DE מיתר במעגל החסום', IN, 'DE מיתר במעגל O'],
  ['K7b the incircle, «במשולש»', T, 'DE מיתר במעגל החסום במשולש', IN, 'DE מיתר במעגל O'],
  ['K8 a point on the incircle', T, 'P על המעגל החסום', IN, 'P על מעגל O'],
  ['K8b «… במשולש»', T, 'P על המעגל החסום במשולש', IN, 'P על מעגל O'],
  ['K9 a diameter of the incircle', T, 'DE קוטר במעגל החסום', IN, 'DE קוטר במעגל O'],
  ['K10 a quadrilateral', Q, 'EF מיתר במעגל החוסם', 'מעגל O חוסם את מרובע ABCD', 'EF מיתר במעגל O'],
  ['K10b «את המרובע»', Q, 'EF מיתר במעגל החוסם את המרובע', 'מעגל O חוסם את מרובע ABCD', 'EF מיתר במעגל O'],
  ['Y13 a vertex as an end', T, 'AD מיתר במעגל החוסם', CIRC, 'AD מיתר במעגל O'],
  ['E1 English, circumscribed', TE, 'DE is a chord of the circumscribed circle', CIRC_EN, 'DE is a chord of circle O'],
  ['E2 English, circumcircle', TE, 'DE is a chord of the circumcircle', CIRC_EN, 'DE is a chord of circle O'],
  ['E3 English, circumscribing', TE, 'DE is a chord in the circle circumscribing the triangle', CIRC_EN, 'DE is a chord in circle O'],
  ['E4 English, a point', TE, 'P is on the circumcircle', CIRC_EN, 'P is on circle O'],
  ['E5 English, «point P»', TE, 'point P on the circumscribed circle', CIRC_EN, 'point P on circle O'],
  ['E6 English, inscribed', TE, 'DE is a chord of the inscribed circle', IN_EN, 'DE is a chord of circle O'],
  ['E7 English, incircle', TE, 'P is on the incircle', IN_EN, 'P is on circle O'],
  // A′ — the triangle named, no circle drawn
  ['K4c a lettered diameter', T, 'BD קוטר במעגל החוסם את משולש ABC', CIRC, 'BD קוטר במעגל O'],
  ['Y14 a lettered chord', T, 'AD מיתר במעגל החוסם את משולש ABC', CIRC, 'AD מיתר במעגל O'],
  ['Y15 English, lettered', TE, 'BD is a diameter of the circle circumscribing triangle ABC', CIRC_EN, 'BD is a diameter of circle O'],
  // A″ — the one drawn circle is not the one named
  ['K11 an unrelated circle', ['מעגל O', ...T], 'DE מיתר במעגל החוסם', 'מעגל P חוסם את משולש ABC', 'DE מיתר במעגל P'],
  ['K11b an unrelated circle, a point', ['מעגל O', ...T], 'P על המעגל החוסם', 'מעגל Q חוסם את משולש ABC', 'P על מעגל Q'],
  ['K11c an unrelated circle, the incircle word', ['מעגל O', ...T], 'DE מיתר במעגל החסום', 'מעגל P חסום במשולש ABC', 'DE מיתר במעגל P'],
  ['Y6 «החוסם» beside the incircle', [...T, 'מעגל I חסום במשולש ABC'], 'DE מיתר במעגל החוסם', CIRC, 'DE מיתר במעגל O'],
  ['Y7 «החסום» beside the circumcircle', [...T, CIRC], 'DE מיתר במעגל החסום', 'מעגל P חסום במשולש ABC', 'DE מיתר במעגל P'],
];

describe('#2545 — a relation the reading never read refuses the line whole, teaching the two lines', () => {
  it.each(REFUSED)('%s: %j · «%s»', async (_id, prefix, line, first, second) => {
    await drive(prefix);
    const before = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 400)).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.category).toBe('guided');
    expect(v.note).toEqual(parts(first, second));
    expect(v.logs.at(-1)).toMatchObject({ source: 'scope', result: 'scope:split-statements:unread-ring' });
    commitVerdict(v, line);
    expect(st().facts.length, 'nothing committed').toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  // #1183: a taught remedy is a hypothesis — both lines, typed in turn, build the described circle with the chord on it
  it.each(REFUSED)('%s: the taught lines build it', async (_id, prefix, line, first, second) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    for (const l of [first, second]) {
      const w = await decideHere(l);
      expect(w.kind, `«${l}»: ${JSON.stringify(w).slice(0, 300)}`).toBe('commit');
      commitVerdict(w, l);
    }
    const f = replay(st().facts, st().seed);
    expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
  });

  it('Y8 two triangles, bare: asks which triangle, naming them (ADR-685)', async () => {
    await drive(['משולש ABC', 'משולש DEF']);
    const v = await decideHere('GH מיתר במעגל החוסם');
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.category).toBe('clarify');
    expect(v.note).toEqual({
      key: 'input.ambiguousDefiniteShape',
      params: { sentence: 'GH מיתר במעגל החוסם', shapes: 'ABC, DEF', example: 'GH מיתר במעגל החוסם את משולש ABC', plural: { t: 'input.shapePlural.3' } },
    });
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('K12 an empty canvas: never committed — the weak path, naming the relation', async () => {
    const v = await decideHere('DE מיתר במעגל החוסם');
    expect(v.kind).toBe('escalate');
    if (v.kind !== 'escalate') return;
    expect(v.weak).toBe('dropped');
    expect(String(v.logs.find((l) => String(l.result).startsWith('weak:dropped'))?.result)).toContain('unread-ring:במעגל החוסם');
  });
});

const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
const distLine = (c: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.abs((q.x - p.x) * (p.y - c.y) - (p.x - c.x) * (q.y - p.y)) / d(p, q);

/** The controls (2-D at d9494206): the described circle is drawn, and the line binds it. */
const BINDS: [string, string[], string, string[], 'circ' | 'in'][] = [
  ['C1', [...T, CIRC], 'DE מיתר במעגל החוסם', ['D', 'E'], 'circ'],
  ['C2', ['משולש ABC חסום במעגל'], 'DE מיתר במעגל החוסם', ['D', 'E'], 'circ'],
  ['C2b', ['משולש ABC חסום במעגל'], 'DE מיתר במעגל החוסם את המשולש', ['D', 'E'], 'circ'],
  ['C8', [...T, IN], 'DE מיתר במעגל החסום', ['D', 'E'], 'in'],
  ['Y1 beside another circle, lettered', [...T, CIRC, 'מעגל P'], 'DE מיתר במעגל החוסם את משולש ABC', ['D', 'E'], 'circ'],
  ['Y2', [...T, CIRC], 'DE מיתר במעגל החוסם את משולש ABC', ['D', 'E'], 'circ'],
  ['Y3', [...T, CIRC], 'BD קוטר במעגל החוסם את משולש ABC', ['D'], 'circ'],
  ['Y9', [...T, CIRC], 'P על המעגל החוסם', ['P'], 'circ'],
  ['Y10', [...T, CIRC], 'DE משיק למעגל החוסם בנקודה A', [], 'circ'],
  ['Y11', [...T, CIRC], 'DE משיק למעגל החוסם את משולש ABC בנקודה A', [], 'circ'],
  ['touch list', [...T, 'הצלעות AB, BC ו-CA משיקות למעגל O'], 'DE מיתר במעגל החסום', ['D', 'E'], 'in'],
  ['ring around the circle', ['מעגל O', 'משולש ABC חוסם את מעגל O'], 'P על המעגל החסום', ['P'], 'in'],
];

describe('still works — the described circle is drawn, and the line binds it (2-D at d9494206)', () => {
  it.each(BINDS)('%s: %j · «%s» puts its points on the described circle at seeds 0–7', async (_id, prefix, line, members, kind) => {
    await drive(prefix);
    const before = new Map(['A', 'B', 'C'].map((k) => [k, replay(st().facts, st().seed).positions.get(k)!]));
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    commitVerdict(v, line);
    expect(llmParseMock).not.toHaveBeenCalled();
    // stability: the triangle does not move
    const now = replay(st().facts, st().seed).positions;
    for (const [k, p] of before) expect(d(now.get(k)!, p), `${k} did not jump`).toBeLessThan(1e-9);
    for (let seed = 0; seed < 8; seed++) {
      const f = replay(st().facts, seed);
      expect(Object.values(f.status).every((s) => s === 'ok'), `seed ${seed}`).toBe(true);
      expect(f.circles.size, 'one circle bound, none minted').toBe(prefix.includes('מעגל P') ? 2 : 1);
      const c = [...f.circles.values()].find((x) => ['A', 'B', 'C'].every((k) => kind === 'in' || Math.abs(d(f.positions.get(k)!, x.center) - x.r) < 1e-6))!;
      expect(c, 'the described circle').toBeDefined();
      for (const m of members) expect(Math.abs(d(f.positions.get(m)!, c.center) - c.r), `${m} on it at seed ${seed}`).toBeLessThan(1e-6);
      if (kind === 'in') {
        const P = (k: string) => f.positions.get(k)!;
        for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) expect(Math.abs(distLine(c.center, P(a), P(b)) - c.r), `${a}${b} tangent`).toBeLessThan(1e-6);
      }
    }
  });
});

describe('the declarations and the cut sentence are untouched (subject position)', () => {
  it.each([
    [T, 'המעגל החוסם את משולש ABC', 'circumcircle'],
    [T, 'מעגל חוסם את ABC', 'circumcircle'],
    [T, 'המשולש חסום במעגל', 'circumcircle'],
    [T, 'מעגל O חסום במשולש', 'circle-through'],
    [T, 'מעגל חסום במשולש', 'circle-through'],
  ] as [string[], string, string][])('%j · «%s» still builds its circle', async (prefix, line, type) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands.some((c) => c.type === type)).toBe(true);
  });

  it('the cut sentence creates its circle HIDDEN (#86 ruling)', async () => {
    await drive(['מרובע CEFO', 'AC']);
    const v = await decideHere('המעגל החוסם את מרובע CEFO חותך את AC בנקודה D');
    expect(v.kind).toBe('commit');
    commitVerdict(v, 'cut');
    const circles = replay(st().facts, st().seed).construction.objects.filter((o) => o.kind === 'circle');
    expect(circles).toHaveLength(1);
    expect((circles[0] as { hidden?: boolean }).hidden).toBe(true);
  });
});

describe('the lines that escalated keep escalating (unchanged)', () => {
  it.each([
    [T, 'DE מיתר במעגל החוסם את משולש ABC'],
    [T, 'DE מיתר במעגל החוסם את המשולש ABC'],
    [T, 'P על המעגל החוסם את משולש ABC'],
    [T, 'DE משיק למעגל החוסם'],
    [T, 'DE משיק למעגל החוסם בנקודה A'],
    [T, 'DE חותך את המעגל החוסם'],
    [T, 'DE מיתר במעגל החסום במשולש ABC'],
    [T, 'DE משיק למעגל החוסם את משולש ABC בנקודה A'],
    [TE, 'P is on the circle circumscribing triangle ABC'],
    [TE, 'DE is a chord of the circle circumscribing triangle ABC'],
    // which drawn circle a bare relation means beside another is #2560's question: not chosen here
    [[...T, CIRC, 'מעגל I חסום במשולש ABC'], 'DE מיתר במעגל החוסם'],
    [[...T, CIRC, 'מעגל I חסום במשולש ABC'], 'DE מיתר במעגל החסום'],
    [[...T, CIRC, 'מעגל P'], 'DE מיתר במעגל החוסם'],
  ] as [string[], string][])('%j · «%s» escalates', async (prefix, line) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('escalate');
  });
});

describe('ADR-650\'s voice trap, side by side', () => {
  it('«חוסם» is the circumscribed circle and «חסום» the inscribed one', () => {
    expect(new RegExp(`^(?:${RING_CIRCUM_HE})$`).test('חוסם')).toBe(true);
    expect(new RegExp(`^(?:${RING_CIRCUM_HE})$`).test('חסום')).toBe(false);
    expect(new RegExp(`^(?:${RING_INSCR_HE})$`).test('חסום')).toBe(true);
    expect(new RegExp(`^(?:${RING_INSCR_HE})$`).test('חוסם')).toBe(false);
  });
});

describe('the ✎ edit seam refuses the same line inline, naming the relation', () => {
  function submit(u: string): string {
    const v = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(v.construction, v.positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    st().executeMany(r.commands, u);
    const f = st().facts;
    return groupKey(f[f.length - 1]);
  }
  it('editing «DE מיתר» into «DE מיתר במעגל החוסם» is refused', () => {
    submit('משולש ABC');
    const key = submit('DE מיתר');
    const notes: string[] = [];
    const ok = runEditCommit(key, 'DE מיתר במעגל החוסם', { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(notes.at(-1)).toBe(`steps.editDropped:${JSON.stringify({ items: 'במעגל החוסם' })}`);
  });
});

/** The catalog sweep: every example holding a relation word keeps its verdict on an empty canvas in both locales — measured
 *  byte-identical (verdict and commands) at d9494206 and at this fix. The cut line's own refusal was the missing-point one,
 *  which ADR-W-162 (#1467) replaced: A, B, C and E are now created and the line builds its own circle by definition. */
const CATALOG_VERDICTS: [string, string, string][] = [
  ["he","מעוין BDEF חסום במשולש ABC","commit"],
  ["he","מלבן DEFG חסום במשולש ABC","commit"],
  ["he","ריבוע DEFG חסום במשולש ABC","commit"],
  ["he","משולש ABC חסום במעגל O","commit"],
  ["he","משולש ישר-זווית ABC חסום במעגל","commit"],
  ["he","מעגל חוסם את ABC","commit"],
  ["he","מעגל חוסם את המחומש ABCDE","commit"],
  ["he","המעגל החוסם את משולש ABC חותך את CE בנקודה D","commit"],
  ["he","מעגל חסום במשולש ABC","commit"],
  ["he","משולש DEF חוסם את המעגל","commit"],
  ["he","מעגל חסום בטרפז ABCD","commit"],
  ["he","במרובע ABCD חסום מעגל O","commit"],
  ["he","מעגל חסום בדלתון ABCD","commit"],
  ["he","מעגל חסום ב-ABC","commit"],
  ["he","טרפז ABCD חסום במעגל","commit"],
  ["he","מחומש משוכלל ABCDE חסום במעגל","commit"],
  ["he","מחומש ABCDE חסום במעגל","commit"],
  ["en","rhombus BDEF inscribed in triangle ABC","commit"],
  ["en","rectangle DEFG inscribed in triangle ABC","commit"],
  ["en","square DEFG inscribed in triangle ABC","commit"],
  ["en","triangle ABC inscribed in circle O","commit"],
  ["en","right triangle ABC inscribed in a circle","commit"],
  ["en","a circle circumscribes the pentagon ABCDE","commit"],
  ["en","circle inscribed in triangle ABC","commit"],
  ["en","triangle DEF circumscribes the circle","commit"],
  ["en","circle inscribed in trapezoid ABCD","commit"],
  ["en","in quadrilateral ABCD a circle is inscribed","commit"],
  ["en","circle inscribed in kite ABCD","commit"],
  ["en","circle inscribed in ABC","commit"],
  ["en","trapezoid ABCD inscribed in a circle","commit"],
  ["en","regular pentagon ABCDE inscribed in a circle","commit"],
  ["en","pentagon ABCDE inscribed in a circle","commit"],
];

describe('the catalog sweep — no example holding «חוסם/חסום» changes its verdict', () => {
  it('the measured set is the catalog\'s', () => {
    const found = (['he', 'en'] as const).flatMap((lang) => COMMAND_CATALOG.filter((d) => d.supported).map((d) => [lang, lang === 'he' ? d.he : d.en] as const)).filter(([, ex]) => /חוס|חסו|circumscrib|inscrib|circumcircle|incircle/i.test(ex));
    expect(found.map(([l, ex]) => `${l}|${ex}`)).toEqual(CATALOG_VERDICTS.map(([l, ex]) => `${l}|${ex}`));
  });
  it.each(CATALOG_VERDICTS)('%s «%s» → %s', async (lang, ex, kind) => {
    st().clear();
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, ex, lang as 'he' | 'en');
    expect(v.kind).toBe(kind);
  });
});
