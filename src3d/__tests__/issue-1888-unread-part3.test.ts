/**
 * #1888 item B (ADR-3D-316, ADR-W-120) — a line that loses a PART is refused whole in 3-D, as in 2-D (ADR-603).
 *
 * Before: «משולש ABC ישר זווית ב-A» recorded the triangle with its right angle at B (3-D's default), «ב-A»
 * never read; «משולש ABC שווה שוקיים ב-B» recorded apex A; «טרפז ABCD ישר זווית ב-B» the right angle at A;
 * and a «ב-X» tail on a prism, a pyramid or a plane statement was dropped green the same way.
 *
 * The operator's rulings (2026-10-08): *"a line that loses a part gets the existing one-input-per-line
 * message … in every builder"*; *"refuse it too"* when the drawing happens to agree (ב-B, where 3-D's default
 * angle already sits); and for «משולש ABC ישר זווית ב-B», *"Teach the right form"* — the triangle, then the
 * angle at the named vertex. A taught remedy is a hypothesis, so this file DRIVES the taught lines and
 * asserts they build with the right angle where the student named it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSteps3, decideSubmit3, derive3, useGeo3, type Fact3, type StoreError3 } from '../store/store3';
import { decideDeterministic3, refusalCategory3 } from '../app/decideDeterministic3';
import { unreadParts3, LABEL3 } from '../store/unreadParts3';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { dot3, norm3, sub3 } from '../engine/vec3';

type St = { facts: Fact3[]; seed: number };
const EMPTY: St = { facts: [], seed: 0 };

let n = 0;
const id = () => `f${n++}`;
function run(lines: string[]): St {
  let st = EMPTY;
  for (const l of lines) {
    const v = decideSubmit3(st, l, id);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
// the 3-D locale isolates each interpolation (bidi); the text the student reads is compared without the marks
const render = (lng: string, err: StoreError3) =>
  (errorText3(i18n3d.getFixedT(lng) as (k: string, o?: Record<string, unknown>) => string, err) ?? '').replace(/[⁦-⁩]/g, '');

const TEACH = (tri: string, angle: string) =>
  `בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו קודם «משולש ${tri}», ואחר כך בשורה נפרדת «∠${angle} = 90°».`;
const SPLIT = (all: string) => `בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: ${all}`;

describe('#1888 — «משולש ABC ישר זווית ב-<V>» is refused and taught, any vertex, any figure before it', () => {
  const CONTEXTS: [string, string[]][] = [
    ['empty canvas', []],
    ['after «משולש ABC»', ['משולש ABC']],
  ];
  it.each([
    ['B', 'ABC'],
    ['A', 'CAB'],
    ['C', 'BCA'],
  ])('ב-%s teaches «∠%s = 90°»', (v, angle) => {
    for (const [, ctx] of CONTEXTS) {
      const st = run(ctx);
      const verdict = decideSubmit3(st, `משולש ABC ישר זווית ב-${v}`, id);
      expect(verdict.kind).toBe('refused');
      if (verdict.kind !== 'refused') return;
      expect(verdict.error).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle, rest: '' });
      expect(render('he', verdict.error)).toBe(TEACH('ABC', angle));
      expect(render('en', verdict.error)).toContain(`«∠${angle} = 90°»`);
      // answered on purpose, never escalated to the model
      expect(refusalCategory3(verdict.error)).toBe('guided');
      expect(decideDeterministic3(st, `משולש ABC ישר זווית ב-${v}`, id).kind).toBe('refused');
    }
  });

  it.each([
    ['B', 'ABC', 'B'],
    ['A', 'CAB', 'A'],
    ['C', 'BCA', 'C'],
  ])('the taught lines BUILD: «משולש ABC» then «∠%s…» puts the right angle at the named vertex', (_v, angle, at) => {
    const st = run(['משולש ABC', `∠${angle} = 90°`]);
    for (const seed of [0, 1, 2]) {
      const d = derive3(st.facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
      const p = d.positions;
      const [a, b] = ['ABC'.replace(at, '')[0], 'ABC'.replace(at, '')[1]];
      const u = sub3(p.get(a)!, p.get(at)!);
      const w = sub3(p.get(b)!, p.get(at)!);
      expect(Math.abs(dot3(u, w)) / (norm3(u) * norm3(w))).toBeLessThan(1e-6);
    }
  });

  it('a different triangle name teaches its own letters', () => {
    const v = decideSubmit3(EMPTY, 'משולש KLM ישר זווית ב-K', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'right-angle-vertex', triangle: 'KLM', angle: 'MKL', rest: '' });
  });
});

describe('#1888 — the other measured 3-D drops are refused with the one-input-per-line message and the parts', () => {
  it.each([
    ['משולש ABC שווה שוקיים ב-B', '(1) משולש ABC שווה שוקיים  (2) ב-B'],
    ['טרפז ABCD ישר זווית ב-B', '(1) טרפז ABCD ישר זווית  (2) ב-B'],
    ["מנסרה ABCA'B'C' ב-A", "(1) מנסרה ABCA'B'C'  (2) ב-A"],
    ['מקבילון ABCDEFGH ב-C', '(1) מקבילון ABCDEFGH  (2) ב-C'],
  ])('«%s»', (line, all) => {
    const v = decideSubmit3(EMPTY, line, id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'split-statements', all });
    if (v.kind === 'refused') expect(render('he', v.error)).toBe(SPLIT(all));
  });

  it('the ✎ edit seam refuses the same line and keeps the old statement', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.getState().submit('משולש ABC');
    const fid = useGeo3.getState().facts[0].id;
    expect(useGeo3.getState().replaceFact(fid, 'משולש ABC ישר זווית ב-A')).toBe(false);
    expect(useGeo3.getState().lastError).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'CAB', rest: '' });
    expect(useGeo3.getState().facts[0].utterance).toBe('משולש ABC');
  });

  it('the LLM lane is not re-read (its commands are the model\'s, not this utterance\'s reading)', () => {
    const v = decideSteps3(EMPTY, 'משולש ABC שווה שוקיים ב-B', ['משולש ABC שווה שוקיים ב-B'], id);
    expect(v.kind).toBe('record');
  });

  it('a right triangle that says more is listed, not taught (the two taught lines would drop the rest)', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC ישר זווית ושווה שוקיים ב-A', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'split-statements', all: '(1) משולש ABC ישר זווית ושווה שוקיים  (2) ב-A' });
  });
});

describe('#1888 — still works (a compound whose every part is honoured, and lines that state no vertex)', () => {
  it.each(['משולש ABC ישר זווית', 'משולש ABC שווה שוקיים', 'משולש ABC ישר זווית ושווה שוקיים', 'D על BC כך ש-BD = DC'])('«%s» records', (line) => {
    const st = line.startsWith('D ') ? run(['משולש ABC']) : EMPTY;
    expect(decideSubmit3(st, line, id).kind).toBe('record');
  });

  it.each(['פירמידה SABC שבסיסה משולש ABC', 'שרטט פירמידה SABC שבסיסה משולש ישר זווית ושווה שוקיים ABC', 'pyramid SABC with a right triangle base ABC'])(
    'a base named by the vertices the line declares is context, not a lost part: «%s»',
    (line) => {
      expect(decideSubmit3(EMPTY, line, id).kind).toBe('record');
    },
  );

  it('a SCENE name on the figure is context, not a lost part: «SM הגובה לצלע BC במשולש SBC» on a pyramid', () => {
    const st = run(['פירמידה SABC']);
    expect(decideSubmit3(st, 'SM הגובה לצלע BC במשולש SBC', id).kind).toBe('record');
  });
});

describe('#1888 — the class nets (ADR-3D-316)', () => {
  const catalog: string[] = [];
  for (const e of COMMAND_CATALOG_3D) {
    if (e.he) catalog.push(e.he);
    if (e.en) catalog.push(e.en);
  }
  const lowering = (t: string) => {
    const r = parse3(t);
    return r.ok && r.commands.length ? r.commands : null;
  };

  it('no catalog example is flagged (false-refusal net)', () => {
    let read = 0;
    for (const u of catalog) {
      const c = lowering(u);
      if (!c) continue;
      read++;
      expect(unreadParts3(u, c, []), u).toBeNull();
    }
    expect(read).toBeGreaterThanOrEqual(450);
  });

  it('no fixture step is flagged (false-refusal net over the saved sessions)', () => {
    const dir = join(__dirname, '..', '..', 'fixtures3');
    let steps = 0;
    for (const fn of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const facts = (JSON.parse(readFileSync(join(dir, fn), 'utf8')).facts ?? []) as { utterance?: string }[];
      for (const f of facts) {
        if (!f.utterance) continue;
        const c = lowering(f.utterance);
        if (!c) continue;
        steps++;
        expect(unreadParts3(f.utterance, c, []), `${fn}: ${f.utterance}`).toBeNull();
      }
    }
    expect(steps).toBeGreaterThanOrEqual(200);
  });

  it('property: no catalog example plus a «ב-X» / "at X" qualifier of its own letters records with the same lowering, unless it is a co-reference', () => {
    let swept = 0;
    for (const u of catalog) {
      const base = lowering(u);
      if (!base) continue;
      const he = /[א-ת]/.test(u);
      const runs: string[] = u.match(/(?<![A-Za-z])(?:[A-Z]\d*'*)+(?![A-Za-z])/g) ?? [];
      for (const L of [...new Set(u.match(LABEL3) ?? [])].slice(0, 3)) {
        const line = `${u}${he ? ` ב-${L}` : ` at ${L}`}`;
        const c = lowering(line);
        if (!c || JSON.stringify(c) !== JSON.stringify(base)) continue;
        swept++;
        const coRef = runs.includes(L); // the student named the same single point twice («…שקודקודו S … ב-S»)
        if (coRef) continue;
        expect(decideSubmit3(EMPTY, line, id).kind, line).not.toBe('record');
      }
    }
    expect(swept).toBeGreaterThanOrEqual(200);
  });
});
