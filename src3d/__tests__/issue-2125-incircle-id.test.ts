/**
 * #2125 (ADR-3D-342) — the two circles of one triangle are two circles. An UNNAMED circle of a ring was keyed by the
 * ring alone (`circle-ABC`), so after «מעגל חוסם את ABC» the incircle «מעגל חסום במשולש ABC» was refused
 * «"ABC" כבר מוגדר בציור» (and the other order alike). The id is now keyed by (kind, ring): the circumcircle keeps
 * `circle-ABC`, the incircle is `circle-in-ABC` (analytic's spelling). 2-D draws both (measured at e4d52c83).
 *
 * Class: two unnamed circles of different kinds on the same ring collide on one id. Locked across both orders, both
 * voices of each relation, both languages, the triangle and a solid's face; a same-kind restatement in ANOTHER spelling
 * is still answered «already in the figure» (measured: `already-stated`, as before); a refusal that names the incircle
 * names the ring's letters, never `in-ABC`; an old saved file whose incircle holds `circle-ABC` loads.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { ringCircleId3 } from '../engine/types';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';

type State = { facts: Fact3[]; seed: number };
function run(lines: string[]) {
  let s: State = { facts: [], seed: 0 };
  const kinds: string[] = [];
  let lastErr: unknown = null;
  for (const line of lines) {
    const v = decideSubmit3(s, line);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.code}` : v.kind);
    if (v.kind === 'refused') lastErr = v.error;
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
  }
  const d = derive3(s.facts, s.seed);
  return { kinds, lastErr, s, d };
}
const circlesOf = (r: ReturnType<typeof run>) =>
  r.d.construction.circles3.map((k) => `${k.id}:${k.def.kind}`).sort();

const CIRCUM = ['מעגל חוסם את ABC', 'משולש ABC חסום במעגל', 'a circle circumscribed about triangle ABC'];
const INCIRCLE = ['מעגל חסום במשולש ABC', 'ABC חוסם מעגל', 'circle inscribed in triangle ABC'];

describe('#2125 — the circumcircle and the incircle of one triangle build together', () => {
  for (const c of CIRCUM) {
    for (const i of INCIRCLE) {
      for (const [first, second] of [[c, i], [i, c]]) {
        it(`«${first}» · «${second}»`, () => {
          const r = run(['משולש ABC', first, second]);
          expect(r.kinds).toEqual(['record', 'record', 'record']);
          expect(circlesOf(r)).toEqual(['circle-ABC:circum', 'circle-in-ABC:incircle']);
          for (const f of r.s.facts) expect(r.d.status[f.id], f.utterance).toBe('ok');
          // both are drawn, and they are different circles
          expect(r.d.resolved.circles3.map((k) => k.id).sort()).toEqual(['circle-ABC', 'circle-in-ABC']);
          const [a, b] = r.d.resolved.circles3;
          expect(Math.abs(a.radius - b.radius)).toBeGreaterThan(1e-6);
        });
      }
    }
  }

  it('on a solid’s face too: a pyramid’s base carries both circles', () => {
    const r = run(['פירמידה SABC', 'מעגל חוסם את ABC', 'מעגל חסום במשולש ABC']);
    expect(r.kinds).toEqual(['record', 'record', 'record']);
    expect(circlesOf(r)).toEqual(['circle-ABC:circum', 'circle-in-ABC:incircle']);
  });

  it('a named circle keeps its letter (unchanged)', () => {
    const r = run(['משולש ABC', 'משולש ABC חסום במעגל O', 'מעגל P חסום במשולש ABC']);
    expect(circlesOf(r)).toEqual(['circle-O:circum', 'circle-P:incircle']);
  });

  it('the id is a function of (kind, ring) alone', () => {
    expect(ringCircleId3('circum', ['A', 'B', 'C'])).toBe('circle-ABC');
    expect(ringCircleId3('incircle', ['A', 'B', 'C'])).toBe('circle-in-ABC');
  });
});

describe('#2125 — the same circle stated twice is still the same circle (unchanged)', () => {
  const text = (err: unknown) =>
    (errorText3((k, o) => i18n3d.t(k, o) as string, err as never) ?? '').replace(/[⁦-⁩]/g, '');

  it.each([
    ['מעגל חסום במשולש ABC', 'ABC חוסם מעגל'],
    ['ABC חוסם מעגל', 'circle inscribed in triangle ABC'],
    ['מעגל חוסם את ABC', 'משולש ABC חסום במעגל'],
  ])('«%s» then «%s» — the same circle, already in the figure', (first, again) => {
    const r = run(['משולש ABC', first, again]);
    expect(r.kinds.at(-1)).toBe('already-stated');
    expect(r.d.construction.circles3).toHaveLength(1);
  });

  it('a refusal naming the incircle names the ring’s letters, never «circle-in-ABC» / «in-ABC»', () => {
    const t = text({ code: 'already-defined', id: 'circle-in-ABC' });
    expect(t).toContain('«ABC»');
    expect(t).not.toContain('circle');
    expect(t).not.toContain('in-');
  });

  it('the identical line again is already stated', () => {
    expect(run(['משולש ABC', 'מעגל חסום במשולש ABC', 'מעגל חסום במשולש ABC']).kinds.at(-1)).toBe('already-stated');
  });
});

describe('#2125 — an old saved file whose incircle holds circle-ABC still loads', () => {
  const file = (cmds: unknown[][]) =>
    JSON.stringify({
      schemaVersion: 2, app: '3d-builder', seed: 0,
      facts: [
        { utterance: 'משולש ABC', cmds: [{ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] }] },
        ...cmds.map((c, i) => ({ utterance: `line ${i}`, cmds: c })),
      ],
    });
  const oldIncircle = [
    { type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] },
    { type: 'circle3', id: 'circle-ABC', def: { kind: 'incircle', ring: ['A', 'B', 'C'] } },
  ];

  it('loads and replays green, the incircle drawn under its stored id', () => {
    const r = deserializeFigure3(file([oldIncircle]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = derive3(r.facts, r.seed);
    for (const f of r.facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.circles3.map((k) => `${k.id}:${k.def.kind}`)).toEqual(['circle-ABC:incircle']);
    expect(d.resolved.circles3).toHaveLength(1);
  });
});
