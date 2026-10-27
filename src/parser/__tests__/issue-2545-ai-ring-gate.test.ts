/**
 * #2545 ([ADR-768](../../../docs/06-decisions.md#adr-768)) — the AI seam's `direction` exemption: «המעגל החוסם» in
 * argument position names the DESCRIBED circle, so an answer that puts the points on another circle dropped the word.
 *
 * Measured at d9494206 as the oracle: an answer putting D and E on an unrelated circle O returned [] for «DE מיתר במעגל
 * החוסם», «… החסום» — any drawn circle satisfied "a definite reference to a circle already drawn".
 */
import { describe, expect, it } from 'vitest';
import type { AnyCommand } from '@/engine';
import { buildParseCtx, parse } from '@/parser';
import { droppedPropertyWords } from '@/parser/propertyWords';
import { replay, useGeoStore } from '@/store/geoStore';

/** The figure's parse context after these lines (each parsed in the figure before it). */
function ctxAfter(lines: string[]) {
  const st = useGeoStore.getState();
  st.clear();
  for (const l of lines) {
    const f = replay(useGeoStore.getState().facts, 0);
    const r = parse(l, buildParseCtx(f.construction, f.positions));
    if (!r.ok) throw new Error(`no parse: ${l}`);
    useGeoStore.getState().executeMany(r.commands, l);
  }
  const f = replay(useGeoStore.getState().facts, 0);
  return buildParseCtx(f.construction, f.positions);
}

const onCircle = (circle: string): AnyCommand[] => [
  { type: 'point-on-circle', id: 'D', circle },
  { type: 'point-on-circle', id: 'E', circle },
  { type: 'segment', a: 'D', b: 'E' },
];

describe('#2545 — an AI answer must bind the circle a relation word describes', () => {
  it.each([
    ['DE מיתר במעגל החוסם', 'החוסם'],
    ['DE מיתר במעגל החסום', 'החסום'],
    ['DE is a chord of the circumscribed circle', 'circumscribed'],
  ])('an answer on an unrelated circle O: «%s» names «%s»', (line, word) => {
    const ctx = ctxAfter(['מעגל O', 'משולש ABC']);
    expect(droppedPropertyWords(line, onCircle('circle-O'), ctx)).toEqual([word]);
  });

  it('an answer on the incircle names «החוסם»', () => {
    const ctx = ctxAfter(['משולש ABC', 'מעגל O חסום במשולש ABC']);
    expect(droppedPropertyWords('DE מיתר במעגל החוסם', onCircle('circle-O'), ctx)).toEqual(['החוסם']);
  });

  it('an answer on an empty canvas names «החוסם» — there is no ring to describe', () => {
    const ctx = ctxAfter([]);
    expect(droppedPropertyWords('DE מיתר במעגל החוסם', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true }, ...onCircle('circle-O')], ctx)).toEqual(['החוסם']);
  });

  it.each([
    ['DE מיתר במעגל החוסם', ['משולש ABC', 'מעגל O חוסם את משולש ABC']],
    ['DE מיתר במעגל החסום', ['משולש ABC', 'מעגל O חסום במשולש ABC']],
    ['DE is a chord of the circumscribed circle', ['triangle ABC', 'circle O circumscribes triangle ABC']],
  ] as [string, string[]][])('an answer on the described circle: «%s» → []', (line, prefix) => {
    expect(droppedPropertyWords(line, onCircle('circle-O'), ctxAfter(prefix))).toEqual([]);
  });

  it('an answer that BUILDS the circumcircle of the ring and binds it → []', () => {
    const ctx = ctxAfter(['משולש ABC', 'מעגל O']);
    const built: AnyCommand[] = [{ type: 'circumcircle', id: 'circle-P', center: 'P', a: 'A', b: 'B', c: 'C' } as AnyCommand, ...onCircle('circle-P')];
    expect(droppedPropertyWords('DE מיתר במעגל החוסם', built, ctx)).toEqual([]);
  });

  it('a subject-position relation keeps its exemption (unchanged)', () => {
    const ctx = ctxAfter(['משולש ABC', 'מעגל O חוסם את משולש ABC', 'CE']);
    const ans: AnyCommand[] = [{ type: 'line-circle-intersection', id: 'D', line: 'line-CE', circle: 'circle-O' } as AnyCommand];
    expect(droppedPropertyWords('המעגל החוסם את משולש ABC חותך את CE בנקודה D', ans, ctx)).toEqual([]);
  });
});
