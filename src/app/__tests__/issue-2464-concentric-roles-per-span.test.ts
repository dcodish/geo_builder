/**
 * #2464 + #2470 + #2305 M2/M3 ([ADR-760](../../../docs/06-decisions.md#adr-760)) — a concentric pair's circle named by
 * its ROLE is read where that role word stands, in every circle sentence.
 *
 * Measured at `main` 1944d866 through `decideDeterministic2D` → store → `replay`, the model stubbed:
 *  - «A על המעגל החיצוני ו-B על המעגל הפנימי» committed BOTH points on the outer circle (|OA| = |OB| = 5), green — the
 *    reverse put both on the inner one (#2464). ADR-244's post-pass read ONE role per sentence (the first).
 *  - «משיק למעגל החיצוני בנקודה A» beside a circle P also committed `circles-tangent O/P` (#2470): the role adjective
 *    «חיצוני» stayed in the text and `commonTangent` read it as an external common tangent's kind.
 *  - «רדיוס המעגל הפנימי הוא r», and every role sentence once a third circle existed, went to the AI (#2305's dead end:
 *    its two questions could not teach a role sentence that builds).
 *
 * Class: a reference to one circle of a concentric pair by its role is resolved per sentence instead of per span, and
 * the role word is left in the sentence for another rule (or gate) to read as its own word. Fixed at the parse boundary
 * (`resolvePairRoles`): each role span becomes its own circle's letter form before any rule runs.
 *
 * Expected circles come from the case TABLE (the role each span names), never from the code. Path: the submit
 * decision (`decideDeterministic2D`) + store + `replay`; the questions rendered through `renderNote` / the figure's
 * explainer, as the app renders them.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { circleRefs, type AnyCommand } from '@/engine';
import { buildParseCtx, parse } from '@/parser';
import { decideDeterministic2D } from '../decideDeterministic';
import { renderNote } from '../renderNote';
import { figureExplainer } from '../studentVocabulary';
import { replay, useGeoStore } from '@/store/geoStore';
import { stripFormatControls } from '../../../shell/bidi';

const PAIR = 'שני מעגלים בעלי מרכז משותף O';
const SIZED = [PAIR, 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'];
const FIGURES: Record<string, string[]> = { pair: [PAIR], sized: SIZED, withP: [...SIZED, 'מעגל P ברדיוס 3'] };
const OUTER = 'circle-O';
const INNER = 'circle-O-2';

type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});
afterAll(() => i18n.changeLanguage('he'));

async function decideNow(line: string, locale: 'he' | 'en' = 'he'): Promise<Verdict> {
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, locale);
}
/** Submit every line; each prefix line must commit. Returns the last line's verdict (committed when it commits). */
async function run(prefix: string[], line: string, locale: 'he' | 'en' = 'he'): Promise<Verdict> {
  for (const l of prefix) {
    const v = await decideNow(l);
    expect(v.kind, `prefix «${l}»`).toBe('commit');
    if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, l, `g${useGeoStore.getState().facts.length}`);
  }
  const v = await decideNow(line, locale);
  if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, line, `g${useGeoStore.getState().facts.length}`);
  return v;
}
const CIRCLE_KEYS = ['circle', 'circle1', 'circle2', 'c1', 'c2'];
const circlesNamed = (cmds: readonly AnyCommand[]) =>
  new Set(cmds.flatMap((c) => CIRCLE_KEYS.map((k) => (c as unknown as Record<string, unknown>)[k]).filter((v): v is string => typeof v === 'string' && v.startsWith('circle-'))));
const INVENTED = new Set(['circles-tangent', 'common-tangent', 'circle', 'circle-through', 'circle-position', 'set-circle-position']);
const figureNow = () => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed);
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 1 + 2: one role word, every construct × spelling × role × figure ─────────────────────────────────────────────
type RoleWords = Record<"outer" | "inner" | "toOuter" | "toInner" | "inOuter" | "inInner", string>;
const ROLE_HE: Record<"he1" | "he2", RoleWords> = {
  he1: { outer: 'המעגל החיצוני', inner: 'המעגל הפנימי', toOuter: 'למעגל החיצוני', toInner: 'למעגל הפנימי', inOuter: 'במעגל החיצוני', inInner: 'במעגל הפנימי' },
  he2: { outer: 'מעגל חיצוני', inner: 'מעגל פנימי', toOuter: 'למעגל חיצוני', toInner: 'למעגל פנימי', inOuter: 'במעגל חיצוני', inInner: 'במעגל פנימי' },
} as const;
type Role = 'outer' | 'inner';
const HE_CONSTRUCTS: [string, (w: RoleWords, r: Role) => string][] = [
  ['membership', (w, r) => `A על ${w[r]}`],
  ['tangent at a point', (w, r) => `משיק ${r === 'outer' ? w.toOuter : w.toInner} בנקודה A`],
  ['chord', (w, r) => `AB מיתר ${r === 'outer' ? w.inOuter : w.inInner}`],
  ['diameter', (w, r) => `AB קוטר ${r === 'outer' ? w.inOuter : w.inInner}`],
  ['radius letter', (w, r) => `רדיוס ${w[r]} הוא r`],
  ['inscribed triangle', (w, r) => `משולש ABC חסום ${r === 'outer' ? w.inOuter : w.inInner}`],
];
const EN_CONSTRUCTS: [string, (r: Role) => string][] = [
  ['membership', (r) => `A on the ${r} circle`],
  ['tangent at a point', (r) => `tangent to the ${r} circle at A`],
  ['chord', (r) => `chord AB of the ${r} circle`],
  ['diameter', (r) => `AB is a diameter of the ${r} circle`],
  ['radius letter', (r) => `the radius of the ${r} circle is r`],
  ['inscribed triangle', (r) => `triangle ABC inscribed in the ${r} circle`],
];

describe('#2464 / #2305 — one role word names its own circle, beside the pair alone and beside a third circle', () => {
  const rows: [string, string, string[], string, Role, 'he' | 'en'][] = [];
  for (const [fig, prefix] of Object.entries(FIGURES))
    for (const role of ['outer', 'inner'] as const) {
      for (const [sp, w] of Object.entries(ROLE_HE)) for (const [name, mk] of HE_CONSTRUCTS) rows.push([fig, `${sp} ${name}`, prefix, mk(w, role), role, 'he']);
      for (const [name, mk] of EN_CONSTRUCTS) rows.push([fig, `en ${name}`, prefix, mk(role), role, 'en']);
    }
  it.each(rows)('%s · %s · «%s»', async (_fig, _name, prefix, line, role, locale) => {
    const v = await run(prefix, line, locale);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    if (v.kind !== 'commit') return;
    // right circle: every circle the commands name is the one the role names
    expect([...circlesNamed(v.commands)]).toEqual([role === 'outer' ? OUTER : INNER]);
    // nothing invented: no relation to another circle, no new circle
    expect(v.commands.filter((c) => INVENTED.has(c.type)).map((c) => c.type)).toEqual([]);
    expect(figureNow().lastError).toBeNull();
  });
});

// ── two role words in one line ────────────────────────────────────────────────────────────────────────────────────
describe('#2464 — two role words in one line: each point on its own circle', () => {
  const MEMBERS: [string, Record<string, string>][] = [
    ['A על המעגל החיצוני ו-B על המעגל הפנימי', { A: OUTER, B: INNER }],
    ['A על המעגל הפנימי ו-B על המעגל החיצוני', { A: INNER, B: OUTER }],
    ['A על מעגל חיצוני ו-B על מעגל פנימי', { A: OUTER, B: INNER }],
    ['נקודה A על המעגל החיצוני ונקודה B על המעגל הפנימי', { A: OUTER, B: INNER }],
    ['A על המעגל החיצוני, B על המעגל הפנימי', { A: OUTER, B: INNER }],
    ['A ו-B על המעגל החיצוני ו-C על המעגל הפנימי', { A: OUTER, B: OUTER, C: INNER }],
    ['A על המעגל הגדול ו-B על המעגל הקטן', { A: OUTER, B: INNER }],
    ['AB מיתר במעגל החיצוני ו-CD מיתר במעגל הפנימי', { A: OUTER, B: OUTER, C: INNER, D: INNER }],
    ['A on the outer circle and B on the inner circle', { A: OUTER, B: INNER }],
    ['A on the inner circle and B on the outer circle', { A: INNER, B: OUTER }],
  ];
  for (const fig of ['pair', 'sized', 'withP'])
    it.each(MEMBERS)(`${fig} · «%s»`, async (line, want) => {
      const v = await run(FIGURES[fig], line, /[א-ת]/.test(line) ? 'he' : 'en');
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      const f = figureNow();
      expect(f.lastError).toBeNull();
      expect(f.violations).toEqual([]);
      const O = f.positions.get('O')!;
      for (const [p, c] of Object.entries(want)) expect(dist(O, f.positions.get(p)!), `|O${p}| = r of ${c}`).toBeCloseTo(f.circles.get(c)!.r, 6);
    });

  it('«AB קוטר במעגל החיצוני ו-CD קוטר במעגל הפנימי» → one diameter per circle', async () => {
    const v = await run([PAIR], 'AB קוטר במעגל החיצוני ו-CD קוטר במעגל הפנימי');
    expect(v.kind === 'commit' && v.commands.map((c) => [c.type, (c as { circle?: string }).circle])).toEqual([['diameter', OUTER], ['diameter', INNER]]);
  });

  // the chord-tangent family: the letter form «מיתר AB במעגל O משיק למעגל Q» builds (FR-IN-4g, ADR-736)
  it.each([
    ['מיתר AB במעגל החיצוני משיק למעגל הפנימי', 'he'],
    ['AB מיתר במעגל החיצוני המשיק למעגל הפנימי', 'he'],
    ['chord AB of the outer circle is tangent to the inner circle', 'en'],
  ] as const)('«%s» → AB a chord of the outer circle touching the inner one (it was refused as self-contradictory)', async (line, locale) => {
    const v = await run([PAIR], line, locale);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    const f = figureNow();
    expect(f.lastError).toBeNull();
    const O = f.positions.get('O')!;
    const [A, B] = [f.positions.get('A')!, f.positions.get('B')!];
    expect(dist(O, A)).toBeCloseTo(f.circles.get(OUTER)!.r, 6);
    expect(dist(O, B)).toBeCloseTo(f.circles.get(OUTER)!.r, 6);
    // distance from O to the line AB is the inner radius
    const d = Math.abs((B.x - A.x) * (A.y - O.y) - (A.x - O.x) * (B.y - A.y)) / dist(A, B);
    expect(d).toBeCloseTo(f.circles.get(INNER)!.r, 5);
  });
});

// ── #2470: a role word never adds a relation ─────────────────────────────────────────────────────────────────────
describe('#2470 — a tangent to one circle of the pair beside a circle P draws the tangent only', () => {
  it.each([
    ['מעגל P', 'משיק למעגל החיצוני בנקודה A', OUTER],
    ['מעגל P ברדיוס 3', 'משיק למעגל החיצוני בנקודה A', OUTER],
    ['מעגל P', 'משיק למעגל הפנימי בנקודה A', INNER],
    ['מעגל P', 'משיק למעגל חיצוני בנקודה A', OUTER],
  ])('after «%s»: «%s»', async (pLine, line, circle) => {
    await run([PAIR, 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'], pLine);
    const before = figureNow();
    const v = await run([], line);
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'tangent', id: 'tan-A', circle, at: 'A', visible: true }]);
    const after = figureNow();
    // stability: P and every earlier point stay where they were
    for (const id of ['O', 'P']) expect(after.positions.get(id)).toEqual(before.positions.get(id));
    expect(after.circles.get('circle-P')!.r).toBeCloseTo(before.circles.get('circle-P')!.r, 9);
  });

  it('«TA משיק למעגל החיצוני בנקודה A» beside P: A on the outer circle, TA ⟂ the radius — no common tangent, A not put on P', async () => {
    const v = await run(FIGURES.withP, 'TA משיק למעגל החיצוני בנקודה A');
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands.some((c) => c.type === 'common-tangent' || c.type === 'circles-tangent')).toBe(false);
    expect(v.commands.some((c) => c.type === 'point-on-circle' && c.circle === 'circle-P')).toBe(false);
    expect([...circlesNamed(v.commands)]).toEqual([OUTER]);
  });

  it('«הקטע AB משיק למעגל הפנימי בנקודה C» beside P: the tangent at C only', async () => {
    const v = await run(FIGURES.withP, 'הקטע AB משיק למעגל הפנימי בנקודה C');
    expect(v.kind === 'commit' && v.commands.map((c) => c.type)).toEqual(['tangent', 'point-on-line', 'point-on-line']);
    expect(v.kind === 'commit' && [...circlesNamed(v.commands)]).toEqual([INNER]);
  });
});

// ── the controls and the refusals ─────────────────────────────────────────────────────────────────────────────────
describe('#2464 — questions, refusals and unchanged readings', () => {
  it('a role AND the shared centre letter as a circle asks which circle (ADR-244), in either order', async () => {
    for (const line of ['A על מעגל O ו-B על המעגל הפנימי', 'A על המעגל הפנימי ו-B על מעגל O']) {
      useGeoStore.getState().clear();
      const v = await run([PAIR], line);
      expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.ambiguousCircle', params: { center: 'O' } });
    }
  });

  it('the question\'s taught spellings build in a two-role line (docs/17 §9)', async () => {
    const he = i18n.getFixedT('he')('input.ambiguousCircle', { center: 'O' });
    const taught = [...he.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(taught).toEqual(['המעגל החיצוני', 'המעגל הפנימי']);
    const v = await run([PAIR], `A על ${taught[0]} ו-B על ${taught[1]}`);
    expect(v.kind === 'commit' && v.commands.map((c) => (c as { circle?: string }).circle).sort()).toEqual([OUTER, INNER]);
  });

  it('two concentric pairs: a role names no single circle → the AI, never a pick', async () => {
    const v = await run([PAIR, 'שני מעגלים בעלי מרכז משותף Q'], 'A על המעגל החיצוני ו-B על המעגל הפנימי');
    expect(v.kind).toBe('escalate');
  });

  it('"AB is a diameter of the inner circle" is a diameter of the inner circle — no new circle (it drew one)', async () => {
    const v = await run(SIZED, 'AB is a diameter of the inner circle', 'en');
    expect(v.kind === 'commit' && v.commands.map((c) => [c.type, (c as { circle?: string }).circle])).toEqual([['diameter', INNER]]);
  });

  it('the pair stated equal is still refused (ADR-713)', async () => {
    const v = await run([PAIR], 'רדיוס המעגל החיצוני שווה לרדיוס המעגל הפנימי');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toMatch(/equal-circles-nested|equalCirclesNested|nested/i);
  });

  it('the ratio of #2459 reads byte-identical (both circles by role)', async () => {
    const v = await run([PAIR, 'רדיוס מעגל פנימי 1.5'], 'רדיוס המעגל החיצוני גדול פי 2 מרדיוס המעגל הפנימי');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-radius-ratio', c1: OUTER, c2: INNER, k: 2 }]);
  });

  it('a relation between the pair\'s OWN two circles stays unread, as before', async () => {
    for (const line of ['המעגל הפנימי משיק למעגל החיצוני', 'משיק משותף חיצוני למעגל הפנימי ולמעגל החיצוני']) {
      useGeoStore.getState().clear();
      const v = await run([PAIR], line);
      expect(v.kind, line).toBe('escalate');
    }
  });

  it('«B על המעגל הפנימי כך ש-AB משיק למעגל הפנימי» answers as its letter form does (refused, unchanged)', async () => {
    const role = await run([PAIR], 'B על המעגל הפנימי כך ש-AB משיק למעגל הפנימי');
    useGeoStore.getState().clear();
    const letter = await run(['מעגל O ברדיוס 5'], 'B על מעגל O כך ש-AB משיק למעגל O');
    expect(role.kind).toBe(letter.kind);
    expect(role.kind === 'refuse' && role.note && 'key' in role.note && role.note.key).toBe('input.sentenceSelfConflict');
  });

  it('stability: the earlier points do not move when a role line lands', async () => {
    await run([PAIR, 'A על המעגל החיצוני'], 'B על המעגל הפנימי');
    const before = figureNow();
    await run([], 'C על המעגל החיצוני ו-D על המעגל הפנימי');
    const after = figureNow();
    for (const id of ['O', 'A', 'B']) expect(after.positions.get(id)).toEqual(before.positions.get(id));
  });

  it('the LLM seam: the canonical decomposition re-parses to the same commands with the same context', async () => {
    await run([], PAIR);
    const f = figureNow();
    const ctx = buildParseCtx(f.construction, f.positions);
    const whole = parse('A על המעגל החיצוני ו-B על המעגל הפנימי', ctx);
    const lines = ['A על המעגל החיצוני', 'B על המעגל הפנימי'].map((l) => parse(l, ctx));
    expect(whole.ok && lines.every((r) => r.ok)).toBe(true);
    const flat = lines.flatMap((r) => (r.ok ? r.commands : []));
    expect(whole.ok && [...whole.commands].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(
      [...flat].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  });
});

// ── #2305 M2 / M3: the two questions list and teach by role, and what they teach builds ─────────────────────────────
describe('#2305 M2/M3 — the questions that list circles name the pair by role; the taught sentence builds', () => {
  async function question(prefix: string[], line: string, lang: 'he' | 'en'): Promise<string> {
    useGeoStore.getState().clear();
    for (const l of prefix) {
      const v = await decideNow(l);
      expect(v.kind, l).toBe('commit');
      if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, l, `g${useGeoStore.getState().facts.length}`);
    }
    const v = await decideNow(line);
    expect(v.kind).toBe('refuse');
    await i18n.changeLanguage(lang);
    const t = i18n.t.bind(i18n) as never as (k: string, o?: Record<string, unknown>) => string;
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const explain = figureExplainer(t, f.construction, st.facts);
    return stripFormatControls(v.kind === 'refuse' ? renderNote(v.note, { t, explain: (raw) => explain(raw, line), said: line, circles: circleRefs(f.construction) }) : '');
  }
  const ROLES = { he: ['המעגל החיצוני', 'המעגל הפנימי'], en: ['the outer circle', 'the inner circle'] } as const;

  for (const lang of ['he', 'en'] as const) {
    it(`M2 «r = 3» beside the sized pair lists the roles and teaches a role sentence (${lang})`, async () => {
      const text = await question(SIZED, 'r = 3', lang);
      expect(text).toContain(`(${ROLES[lang][0]}, ${ROLES[lang][1]})`);
      expect(text).not.toMatch(/\(O, O\)|O-2/);
      const taught = text.match(/«([^«»]*\br\b[^«»]*)»\.?$/)?.[1] ?? text.match(/«(רדיוס[^»]*)»/)?.[1];
      expect(taught, text).toBeTruthy();
      // the taught sentence is a grammar claim (docs/17 §9): it builds, binding r to the circle it names
      useGeoStore.getState().clear();
      const v = await run(SIZED, taught!, lang);
      expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'radius-symbol', circle: INNER, name: 'r' }]);
    });

    it(`M3 an unqualified «המעגל» with the pair and P lists all three and suggests a role (${lang})`, async () => {
      const text = await question(FIGURES.withP, 'נקודה A על המעגל', lang);
      expect(text).toContain(`(${ROLES[lang][0]}, ${ROLES[lang][1]}, P)`);
      expect(text).toContain(`«${ROLES[lang][0]}»`);
      // the suggestion, put in the student's sentence, builds
      useGeoStore.getState().clear();
      const v = await run(FIGURES.withP, 'נקודה A על המעגל החיצוני');
      expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'point-on-circle', id: 'A', circle: OUTER }]);
    });

    it(`control: two circles with their own centres keep today's words (${lang})`, async () => {
      const m2 = await question(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5'], 'r = 4', lang);
      expect(m2).toContain('(O, P)');
      expect(m2).toContain(lang === 'he' ? '«רדיוס מעגל P הוא r»' : '«the radius of circle P is r»');
      const m3 = await question(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5'], 'נקודה A על המעגל', lang);
      expect(m3).toContain('(O, P)');
      expect(m3).toContain(lang === 'he' ? '«מעגל O»' : '«circle O»');
    });
  }
});
