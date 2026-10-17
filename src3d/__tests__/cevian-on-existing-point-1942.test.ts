/**
 * #1942 (ADR-3D-367; operator rulings 2026-10-09 / 2026-10-10 / 2026-10-14) — a ROLE stated about an EXISTING point
 * is a given about it, never a re-creation.
 *
 * Before (measured at 688dfb96): «משולש ABC · D על BC · AD גובה לצלע BC» refused «D כבר מוגדר בציור» while
 * «D על BC · AD ⊥ BC» built; «AD תיכון לצלע BC · AD חוצה זווית A» asked which angle at A (BAC, BAD, CAD) where
 * 2-D reads the triangle's angle and says so; and «AD תיכון לצלע BC שהוא גם גובה» got the parts list because the
 * taught pair did not record. Asserted on the DRAWING through the real `decideSubmit3` seam at 24 starting seeds.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, derive3, useGeo3, type Fact3, type StoreError3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { vertexAngleAt3 } from '../engine/vertexAngle3';
import { cross3, dot3, norm3, sub3 } from '../engine/vec3';
import type { Vec3 } from '../engine/vec3';

type St = { facts: Fact3[]; seed: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
let n = 0;
const id = () => `f${n++}`;

function build(lines: readonly string[], seed = 0): St {
  let st: St = { facts: [], seed };
  for (const line of lines) {
    const v = decideSubmit3(st, line, id);
    expect(v.kind, `«${line}» at seed ${seed}: ${JSON.stringify(v)}`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const last = (lines: readonly string[]) => decideSubmit3(build(lines.slice(0, -1)), lines[lines.length - 1], id);
const render = (err: StoreError3) =>
  (errorText3(i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string, err) ?? '').replace(/[⁦-⁩]/g, '');

/** Every row green; `foot` on LINE side[0]side[1]; apex→foot ⟂ the side; the altitude drawn as a segment. */
function assertAltitude(lines: readonly string[], apex: string, foot: string, side: [string, string]) {
  for (const s0 of SEEDS) {
    const st = build(lines, s0);
    const d = derive3(st.facts, st.seed);
    expect(Object.values(d.status).every((x) => x === 'ok'), `seed ${s0}: ${JSON.stringify(d.status)}`).toBe(true);
    const at = (k: string) => d.positions.get(k) as Vec3;
    const F = at(foot), X = at(apex), P = at(side[0]), Q = at(side[1]);
    const dir = sub3(Q, P);
    const scale = norm3(dir);
    expect(norm3(cross3(sub3(F, P), dir)) / scale, `seed ${s0}: ${foot} off line ${side.join('')}`).toBeLessThan(1e-6 * scale);
    expect(Math.abs(dot3(sub3(F, X), dir)) / (norm3(sub3(F, X)) * scale), `seed ${s0}: ${apex}${foot} not ⟂ ${side.join('')}`).toBeLessThan(1e-6);
    expect(d.construction.segments.some(([a, b]) => (a === apex && b === foot) || (a === foot && b === apex)), `seed ${s0}: no segment ${apex}${foot}`).toBe(true);
  }
}

const dist = (p: Vec3, q: Vec3) => norm3(sub3(p, q));
const angle = (v: Vec3, p: Vec3, q: Vec3) => Math.acos(dot3(sub3(p, v), sub3(q, v)) / (dist(p, v) * dist(q, v)));

describe('#1942 — an altitude onto an EXISTING D lowers to givens about D (24 seeds, on the drawing)', () => {
  it.each([
    ['a rider on BC (the reported sequence)', ['משולש ABC', 'D על BC', 'AD גובה לצלע BC']],
    ['a rider, the definite noun', ['משולש ABC', 'D על BC', 'AD הגובה לצלע BC']],
    ['the midpoint of BC', ['משולש ABC', 'D אמצע BC', 'AD גובה לצלע BC']],
    ['the median foot', ['משולש ABC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC']],
    ['the bisector foot', ['משולש ABC', 'AD חוצה זווית A', 'AD גובה לצלע BC']],
    ['English', ['triangle ABC', 'D on BC', 'AD is the altitude to BC']],
  ])('%s', (_name, lines) => assertAltitude(lines, 'A', 'D', ['B', 'C']));

  it('on a solid: a rider on a pyramid edge, the in-face altitude SD ⟂ BC', () => {
    assertAltitude(['פירמידה ABCS', 'D על BC', 'SD גובה לצלע BC'], 'S', 'D', ['B', 'C']);
  });

  it('the median foot stays the midpoint: AD is both the median and the altitude (BD = DC)', () => {
    for (const s0 of SEEDS) {
      const st = build(['משולש ABC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'], s0);
      const p = derive3(st.facts, st.seed).positions as Map<string, Vec3>;
      expect(dist(p.get('B')!, p.get('D')!), `seed ${s0}`).toBeCloseTo(dist(p.get('D')!, p.get('C')!), 6);
    }
  });

  it('stability: a free rider SLIDES to the foot — the triangle does not move', () => {
    for (const s0 of SEEDS) {
      const before = build(['משולש ABC', 'D על BC'], s0);
      const v = decideSubmit3(before, 'AD גובה לצלע BC', id);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') continue;
      const p0 = derive3(before.facts, before.seed).positions as Map<string, Vec3>;
      const p1 = derive3(v.facts, v.seed).positions as Map<string, Vec3>;
      for (const k of ['A', 'B', 'C']) expect(dist(p0.get(k)!, p1.get(k)!), `seed ${s0}: ${k} jumped`).toBeLessThan(1e-9);
    }
  });

  it('a determined figure the altitude cannot meet is refused naming the statements, never redrawn', () => {
    const v = last(['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 5', 'D אמצע BC', 'AD גובה לצלע BC']);
    expect(v).toMatchObject({ kind: 'refused', error: { code: 'givens-contradict', stated: 'AD גובה לצלע BC' } });
  });

  it.each([
    ['the side endpoint as the foot', ['משולש ABC', 'AB גובה לצלע BC'], 'B'],
    ['the other endpoint', ['משולש ABC', 'AC גובה לצלע BC'], 'C'],
    ['a vertex of a declared polygon', ['מרובע ABCD', 'AD גובה לצלע BC'], 'D'],
  ])('control — %s keeps the honest «already defined»', (_n, lines, letter) => {
    expect(last(lines)).toEqual({ kind: 'refused', error: { code: 'already-defined', id: letter } });
  });

  it('the reducer: a NEW letter still mints the foot (unchanged)', () => {
    const c = derive3(build(['משולש ABC']).facts, 0).construction;
    const r = applyCommand3(c, { type: 'altitude-foot', id: 'D', from: 'A', a: 'B', b: 'C' });
    expect(r.ok && r.next.points.get('D')).toEqual({ kind: 'foot-seg', from: 'A', a: 'B', b: 'C' });
  });
});

describe('#1942 — «זווית A» after a cevian is the triangle angle, said aloud (2-D, ADR-590)', () => {
  it.each([
    ['after a median', ['משולש ABC', 'AD תיכון לצלע BC', 'AD חוצה זווית A']],
    ['after an altitude', ['משולש ABC', 'AD גובה לצלע BC', 'AD חוצה זווית A']],
    ['English', ['triangle ABC', 'AD is the median to BC', 'AD is the bisector of angle A']],
  ])('%s: records, ∠BAD = ∠DAC at 24 seeds, reads as ∠CAB', (_n, lines) => {
    const v = last(lines);
    expect(v.kind).toBe('record');
    expect(v.kind === 'record' && v.readAs).toEqual(['CAB']);
    for (const s0 of SEEDS) {
      const st = build(lines, s0);
      const d = derive3(st.facts, st.seed);
      expect(Object.values(d.status).every((x) => x === 'ok'), `seed ${s0}`).toBe(true);
      const p = d.positions as Map<string, Vec3>;
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((k) => p.get(k)!);
      expect(angle(A, B, D), `seed ${s0}`).toBeCloseTo(angle(A, D, C), 6);
    }
  });

  it('the note on the committed step is 2-D\'s sentence, word for word', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
    for (const l of ['משולש ABC', 'AD תיכון לצלע BC']) useGeo3.getState().submit(l);
    expect(useGeo3.getState().lastNotice).toBeNull();
    useGeo3.getState().submit('AD חוצה זווית A');
    const notice = useGeo3.getState().lastNotice;
    expect(notice).toEqual({ code: 'vertex-angle-read-as', angles: '∠CAB' });
    expect(i18n3d.getFixedT('he')('notice.vertexAngleReadAs', { angles: '∠CAB' }).replace(/[⁦-⁩]/g, '')).toBe(
      'הובן כ-∠CAB — הזווית של המצולע בקודקוד הזה. לזווית אחרת שם, כתבו את שלוש האותיות שלה.',
    );
    // the student's own wording stays on the fact; the next statement clears the note
    expect(useGeo3.getState().facts.at(-1)!.utterance).toBe('AD חוצה זווית A');
    useGeo3.getState().submit('AB = 3');
    expect(useGeo3.getState().lastNotice).toBeNull();
  });

  it('a vertex with ONE angle reads it silently (#866, unchanged); a solid corner still asks', () => {
    const one = last(['משולש ABC', 'D על BC', 'AD חוצה זווית A']);
    expect(one.kind === 'record' && one.readAs).toBeUndefined();
    expect(last(['קובייה ABCDEFGH', 'AG חוצה זווית A'])).toMatchObject({ kind: 'refused', error: { code: 'ambiguous-angle-vertex', vertex: 'A' } });
  });

  it('the resolver: the bisector\'s own foot is never an arm of the polygon reading', () => {
    const q = derive3(build(['מרובע ABCD']).facts, 0).construction;
    const r = applyCommand3(q, { type: 'segment3', a: 'A', b: 'C' }); // a diagonal: three edges at A
    if (!r.ok) throw new Error('segment');
    const c = r.next;
    expect(vertexAngleAt3(c, 'A', ['D']).kind).toBe('ambiguous');
    expect(vertexAngleAt3(c, 'A', ['E'])).toEqual({ kind: 'polygon', angle: 'DAB' });
  });
});

describe('#1942 — «AD תיכון לצלע BC שהוא גם גובה» is taught the two lines, as in 2-D', () => {
  it('the lesson, in the exact Hebrew the student reads (2-D\'s input.scope.split-roles for the same line)', () => {
    const v = last(['משולש ABC', 'AD תיכון לצלע BC שהוא גם גובה']);
    expect(v).toEqual({ kind: 'refused', error: { code: 'split-roles', first: 'AD תיכון לצלע BC', second: 'AD גובה לצלע BC' } });
    if (v.kind === 'refused')
      expect(render(v.error)).toBe(
        'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו כל תפקיד בשורה נפרדת: «AD תיכון לצלע BC», ואחר כך «AD גובה לצלע BC».',
      );
  });

  it('each taught line, submitted, records — the lesson is proved, not promised', () => {
    assertAltitude(['משולש ABC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'], 'A', 'D', ['B', 'C']);
  });
});
