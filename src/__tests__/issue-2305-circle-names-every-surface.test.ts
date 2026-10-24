/**
 * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)) — the class lock: EVERY sentence that names a circle names one of
 * a concentric pair by its ROLE (operator ruling on #2264, 2026-10-16, option A), never by its id's mint suffix «O-2»
 * and never by its sibling's letter.
 *
 * Measured at 8784daef: the tangent refusal read «…במרכז המעגל O-2», the context-menu titles «⊙ O» / «⊙ O-2», a clicked
 * crossing of the inner circle was recorded as «K = חיתוך מעגל O ו-AB» (the OUTER circle's name), and every requirement
 * line about a pair circle printed «מעגל O-2». Root cause: each sentence spelled the name itself from the circle's id or
 * centre letter instead of through `circleRefs`. The fix is one wording function (`src/i18n/circleText.ts`) behind every
 * circle slot, and `crossingUtterance` reading `circleRefs`.
 *
 * The pair is built in three spellings (a named centre, no centre letter, English input), each rendered in both
 * locales. Template coverage is DISCOVERED, not listed: every he.json key whose template carries a circle slot
 * (`{{circle}}`, `{{circleThe}}`, `{{circleTo}}`, `{{circlePair}}`) must be
 * rendered here, so a new template that names a circle is caught. The two parser clarifications that LIST circles
 * (`input.ambiguousCircleRef`, `errors.reservedRadiusAmbiguous*`) are not in this item: their taught example names a
 * spelling the grammar does not read beside a pair (the #2305 escalation of 2026-10-23). ADR-760 (#2464) made the grammar
 * read it and reworded both; they are locked, with their taught sentences round-tripped, in
 * `src/app/__tests__/issue-2464-concentric-roles-per-span.test.ts`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import he from '@/i18n/locales/he.json';
import i18n from '@/i18n';
import { checkGivens, circleRefs, crossingUtterance, drawnCircles, findInkCrossings, type AnyCommand, type GivenViolation } from '@/engine';
import { circleResolver, explainError } from '@/i18n/humanizeError';
import { circleMenuTitle } from '@/i18n/circleText';
import { offArcNoticeText, violationText } from '@/i18n/violationText';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { stripFormatControls } from '../../shell/bidi';

const SPELLINGS: Record<string, { lines: string[]; locale: 'he' | 'en'; centre: boolean }> = {
  'named centre': { lines: ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'], locale: 'he', centre: true },
  'no centre letter': { lines: ['שני מעגלים בעלי מרכז משותף', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'], locale: 'he', centre: false },
  English: { lines: ['two concentric circles with centre O', 'the radius of the outer circle is 10', 'the radius of the inner circle is 9'], locale: 'en', centre: true },
};
const ROLE = { he: { outer: 'המעגל החיצוני', inner: 'המעגל הפנימי' }, en: { outer: 'the outer circle', inner: 'the inner circle' } } as const;
/** An id's mint suffix printed as a name: «O-2». */
const MINT = /\b[A-Z][A-Za-z0-9'′]*-\d+\b/;

async function submit(lines: string[], locale: 'he' | 'en'): Promise<string[]> {
  useGeoStore.getState().clear();
  const out: string[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } } as never, line, locale);
    out.push(v.kind);
    if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, line, `g${st.facts.length}`);
  }
  return out;
}

/** Every he.json key whose template carries a circle slot — the coverage this test must reach. */
function circleSlotKeys(): string[] {
  const out: string[] = [];
  const walk = (o: unknown, path: string) => {
    if (typeof o === 'string') {
      if (/\{\{(circle|circleThe|circleTo|circlePair)\}\}/.test(o) && !path.startsWith('circleName.')) out.push(path);
      return;
    }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(he, '');
  return out.sort();
}

describe('#2305 — one of a concentric pair is named by its role in every sentence', () => {
  afterAll(() => i18n.changeLanguage('he'));
  for (const [name, sp] of Object.entries(SPELLINGS))
    for (const loc of ['he', 'en'] as const)
      it(`${name}, rendered in ${loc}`, async () => {
        expect(await submit(sp.lines, sp.locale)).toEqual(['commit', 'commit', 'commit']);
        await i18n.changeLanguage(loc);
        const t = i18n.t.bind(i18n) as never as (k: string, o?: Record<string, unknown>) => string;
        const st = useGeoStore.getState();
        const f = replay(st.facts, st.seed);
        const refs = circleRefs(f.construction);
        expect(refs.get('circle-O')).toEqual({ via: 'role', role: 'outer' });
        expect(refs.get('circle-O-2')).toEqual({ via: 'role', role: 'inner' });
        const rendered = new Map<string, string>(); // key → text
        const say = (key: string, text: string) => rendered.set(key, stripFormatControls(text));

        // the verifier's requirement lines, each forged to fail on the INNER circle (and the pair)
        const O = f.circles.get('circle-O-2')!.center;
        const circles = new Map(f.circles);
        circles.set('circle-O-2', { ...circles.get('circle-O-2')!, r: 7 });
        const positions = new Map(f.positions);
        positions.set('A', { x: O.x + 3, y: O.y });
        positions.set('B', { x: O.x + 30, y: O.y });
        const extra = [
          { type: 'point-on-circle', id: 'A', circle: 'circle-O-2' },
          { type: 'tangent', id: 'tan-A', circle: 'circle-O-2', at: 'A' },
          { type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-O-2', k: 3 },
          { type: 'set-circle-position', relation: 'disjoint', a: 'circle-O', b: 'circle-O-2' },
          { type: 'set-circle-position', relation: 'contained', a: 'circle-O-2', b: 'circle-O' },
          { type: 'point-circle-side', id: 'B', circle: 'circle-O-2', side: 'inside' },
          { type: 'point-circle-side', id: 'A', circle: 'circle-O-2', side: 'outside' },
          { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-O-2', external: true, at: 'A' },
        ];
        const cmds = st.facts.map((x) => x.cmd) as AnyCommand[];
        for (const v of checkGivens([...cmds, ...extra] as never, positions as never, circles as never, f.construction)) say(v.messageKey, violationText(v, t, refs));
        const offArc: GivenViolation = { relation: 'point-off-arc', ids: ['A', 'circle-O-2'], message: '', messageKey: 'figure.v.pointOffArc', params: { point: 'A', circle: 'O-2', off: '12.0' }, circleSlots: { circle: 'circle-O-2' } };
        say('figure.v.pointOffArc', violationText(offArc, t, refs));
        say('figure.offArcNotice', offArcNoticeText({ point: 'A', circle: 'circle-O-2', off: '3' } as never, t, refs));

        // the refusals, from the engine's own wire strings (ids), through the figure's resolver
        const resolver = circleResolver(refs);
        const refusals: [string, string][] = [
          ['errors.tangentAtCentre', 'cannot take a tangent at the centre of circle-O-2'],
          ['errors.circlesDontMeet', 'cannot construct K: circles circle-O and circle-O-2 do not meet'],
          ['errors.restatedSize', 'over-constrained: radius of circle-O-2 = 4 cannot hold'],
          ['errors.desc.radiusOf', 'over-constrained: radius(circle-O) = 2 · radius(circle-O-2) cannot hold'],
          ['errors.stmt.onCircle', 'impossible: E on circle O-2 contradicts E outside circle O'],
          ['errors.stmt.outsideCircle', 'impossible: E outside circle O-2 contradicts E on circle O'],
          ['errors.stmt.insideCircle', 'impossible: E inside circle O-2 contradicts E on circle O'],
          ['errors.stmt.centreOfCircle', 'impossible: E is the centre of circle O-2 contradicts E on circle O'],
        ];
        for (const [key, raw] of refusals) say(key, explainError(raw, t, undefined, undefined, resolver));

        // coverage: every template that names a circle was rendered
        expect([...rendered.keys()].filter((k) => circleSlotKeys().includes(k)).sort()).toEqual(circleSlotKeys());
        for (const [key, text] of rendered) {
          if (!circleSlotKeys().includes(key)) continue;
          expect(text, key).not.toMatch(MINT);
          expect(text, key).toContain(loc === 'he' ? 'מעגל הפנימי' : ROLE.en.inner); // «המעגל הפנימי» or the fused «למעגל הפנימי»
        }
        // the pair reads as two roles, never «המעגלים O ו-O-2»
        expect(rendered.get('figure.v.circlesDisjoint')).toContain(`${ROLE[loc].outer} ${loc === 'he' ? 'ו' : 'and '}${ROLE[loc].inner}`);

        // the context-menu titles
        expect([circleMenuTitle('circle-O', refs, t), circleMenuTitle('circle-O-2', refs, t)]).toEqual([`⊙ ${ROLE[loc].outer}`, `⊙ ${ROLE[loc].inner}`]);
      });
});

describe('#2305 — M1 through the submit door: the tangent at the centre names the inner circle', () => {
  for (const [name, sp] of Object.entries(SPELLINGS).filter(([, s]) => s.centre))
    it(name, async () => {
      await submit(sp.lines, sp.locale);
      await i18n.changeLanguage('he');
      const st = useGeoStore.getState();
      const f = replay(st.facts, st.seed);
      const line = sp.locale === 'he' ? 'משיק למעגל הפנימי בנקודה O' : 'a tangent to the inner circle at O';
      const v = (await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } } as never, line, sp.locale)) as { kind: string; note?: { explain?: string } };
      expect(v.kind, JSON.stringify(v)).toBe('refuse');
      const text = stripFormatControls(explainError(v.note!.explain!, i18n.t.bind(i18n) as never, line, undefined, circleResolver(circleRefs(f.construction))));
      expect(text).toContain('לא ניתן לצייר משיק במרכז המעגל הפנימי.');
      expect(text).not.toMatch(MINT);
    });
});

describe('#2305 — a clicked crossing of a pair circle records a step that names THAT circle', () => {
  for (const [name, sp] of Object.entries(SPELLINGS).filter(([, s]) => s.locale === 'he'))
    it(name, async () => {
      const lines = [...sp.lines, 'קוטר AB במעגל החיצוני'];
      expect(await submit(lines, 'he')).toEqual(['commit', 'commit', 'commit', 'commit']);
      const st = useGeoStore.getState();
      const f = replay(st.facts, st.seed);
      const xs = findInkCrossings(f.construction, f.positions, { circles: drawnCircles(f.construction, f.circles) } as never).filter((x) => x.circle1 === 'circle-O-2');
      expect(xs.length, 'the inner circle crosses AB').toBeGreaterThan(0);
      for (const lang of ['he', 'en'] as const) {
        const said = crossingUtterance(xs[0], 'K', lang, f.construction);
        expect(said).toBe(lang === 'he' ? 'K = חיתוך המעגל הפנימי ו-AB' : 'K = intersection of the inner circle and AB');
        // typed back, the sentence builds the crossing on the SAME circle
        expect(await submit([...lines, said], lang)).toEqual(['commit', 'commit', 'commit', 'commit', 'commit']);
        const after = useGeoStore.getState();
        const k = replay(after.facts, after.seed).construction.objects.find((o) => o.id === 'K') as { circle?: string } | undefined;
        expect(k?.circle, said).toBe('circle-O-2');
      }
    });
});
