/**
 * #2305 (ADR-755) — golden (c): every sentence about a circle that is NOT one of a concentric pair is BYTE-IDENTICAL
 * to the text before the circle-naming seam (`circleRefs` → `circleText`) was put behind it.
 *
 * `circle-text-golden-2305.json` was captured at 8784daef, BEFORE any edit, by rendering each sentence through the
 * paths of that day (`t(messageKey, translateParams(params))`, `circle.replace(/^circle-/, '')`, `explainError(raw)`):
 * one named circle, two named circles, one anonymous circle, two anonymous circles, an anonymous circle beside a named
 * one — in Hebrew and English. This test renders the same inputs through today's seam (`violationText`,
 * `offArcNoticeText`, `circleMenuTitle`, `explainError` with the figure's `circleResolver`) and asserts the bytes,
 * bidi isolates included. It is what makes the ADR's `[2-D]` no-change line a measurement, not a claim.
 */
import { afterAll, describe, expect, it } from 'vitest';
import golden from './circle-text-golden-2305.json';
import i18n from '@/i18n';
import { checkGivens, circleRefs, type AnyCommand, type GivenViolation } from '@/engine';
import { circleResolver, explainError } from '@/i18n/humanizeError';
import { circleMenuTitle } from '@/i18n/circleText';
import { offArcNoticeText, violationText } from '@/i18n/violationText';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';

const FIGS: Record<string, string[]> = {
  single: ['מעגל O ברדיוס 5'],
  two: ['מעגל O ברדיוס 5', 'מעגל P ברדיוס 3'],
  anon: ['מעגל ברדיוס 3'],
  anonTwo: ['שני מעגלים זרים'],
  mixed: ['מעגל ברדיוס 3', 'מעגל P ברדיוס 4'],
};

async function submit(lines: string[]): Promise<void> {
  useGeoStore.getState().clear();
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } } as never, line, 'he');
    expect(v.kind, line).toBe('commit');
    if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, line, `g${st.facts.length}`);
  }
}

describe('#2305 golden (c) — a circle that is not one of a pair keeps every sentence byte for byte', () => {
  afterAll(() => i18n.changeLanguage('he'));
  for (const loc of ['he', 'en'] as const)
    for (const [name, lines] of Object.entries(FIGS))
      it(`${loc}: ${lines.join(' · ')}`, async () => {
        await i18n.changeLanguage(loc);
        const t = i18n.t.bind(i18n) as never as (k: string, o?: Record<string, unknown>) => string;
        await submit(lines);
        const st = useGeoStore.getState();
        const f = replay(st.facts, st.seed);
        const refs = circleRefs(f.construction);
        const ids = f.construction.objects.filter((o) => o.kind === 'circle').map((o) => o.id);
        const [c1, c2 = ids[0]] = ids;
        const rec: Record<string, string> = { ids: ids.join(',') };
        const cmds = st.facts.map((x) => x.cmd) as AnyCommand[];
        const circles = new Map(f.circles);
        const k1 = circles.get(c1)!;
        const ctr = k1.center;
        circles.set(c1, { ...k1, r: k1.r * 0.5 });
        const positions = new Map(f.positions);
        positions.set('A', { x: ctr.x + 0.1, y: ctr.y });
        positions.set('B', { x: ctr.x + 300, y: ctr.y });
        const extra = [
          { type: 'point-on-circle', id: 'A', circle: c1 },
          { type: 'tangent', id: 'tan-A', circle: c1, at: 'A' },
          { type: 'set-radius-ratio', c1, c2, k: 3 },
          { type: 'set-circle-position', relation: 'disjoint', a: c1, b: c2 },
          { type: 'set-circle-position', relation: 'contained', a: c1, b: c2 },
          { type: 'point-circle-side', id: 'B', circle: c1, side: 'inside' },
          { type: 'point-circle-side', id: 'A', circle: c1, side: 'outside' },
          { type: 'circles-tangent', circle1: c1, circle2: c2, external: true, at: 'A' },
        ];
        const vs = checkGivens([...cmds, ...extra] as never, positions as never, circles as never, f.construction);
        vs.forEach((v, i) => (rec[`v${i}:${v.messageKey}`] = violationText(v, t, refs)));
        const offArc: GivenViolation = { relation: 'point-off-arc', ids: ['A', c1], message: '', messageKey: 'figure.v.pointOffArc', params: { point: 'A', circle: c1.replace(/^circle-/, ''), off: '12.0' }, circleSlots: { circle: c1 } };
        rec.pointOffArc = violationText(offArc, t, refs);
        rec.offArc = offArcNoticeText({ point: 'A', circle: c1, off: '3' } as never, t, refs);
        rec.menu = circleMenuTitle(c1, refs, t);
        const letter = (id: string) => id.replace(/^circle-/, '');
        const raws: [string, string | undefined][] = [
          [`cannot take a tangent at the centre of ${c1}`, undefined],
          [`cannot construct K: circles ${c1} and ${c2} do not meet`, undefined],
          [`over-constrained: radius of ${c1} = 4 cannot hold`, undefined],
          [`over-constrained: radius of ${c1} = 4 cannot hold`, 'r = 4'],
          [`over-constrained: radius(${c1}) = 2 · radius(${c2}) cannot hold`, undefined],
          [`impossible: E on circle ${letter(c1)} contradicts E outside circle ${letter(c1)}`, undefined],
          [`impossible: E is the centre of circle ${letter(c1)} contradicts E inside circle ${letter(c1)}`, undefined],
        ];
        raws.forEach(([raw, said], i) => (rec[`r${i}`] = explainError(raw, t, said, undefined, circleResolver(refs))));
        for (const [tag, line] of [['rr', 'r = 3'], ['amb', 'נקודה A על המעגל'], ['cont', 'מעגל מוכל']] as const) {
          const v = (await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } } as never, line, 'he')) as {
            kind: string;
            note?: { explain: string } | { key: string; params?: Record<string, unknown> };
          };
          const n = v.note;
          rec[tag] = v.kind + ':' + (!n ? '' : 'explain' in n ? explainError(n.explain, t, line, undefined, circleResolver(refs)) : t(n.key, n.params));
        }
        expect(rec).toEqual((golden as Record<string, Record<string, string>>)[`${loc}:${name}`]);
      });
});
