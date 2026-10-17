/**
 * #1904 item B′ (ADR-3D-317) — a role word the reading never read refuses the line in 3-D, as in 2-D (ADR-604).
 *
 * Before: «משולש ABC» · «AD תיכון לצלע BC שהוא גם גובה» recorded the median alone (AD not perpendicular to BC),
 * green, and so did 24 more measured spellings: «…שהוא גם חוצה זווית / אנך / מאונך ל-BC», «…ו-AD גובה»,
 * «…שמאונך לה», three English lines. The operator's rulings (2026-10-08): *"a line that loses a part gets the
 * existing one-input-per-line message"*, *"Refuse it too"*; W22: *"Teach the lines"* — one line per role, a lock
 * driving the taught lines in 3-D. A taught pair is offered only when it is PROVED to record on the figure.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, derive3, useGeo3, type Fact3, type StoreError3 } from '../store/store3';
import { refusalCategory3 } from '../app/decideDeterministic3';
import { unreadRoles3 } from '../store/unreadRoles3';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { dot3, norm3, sub3 } from '../engine/vec3';

type St = { facts: Fact3[]; seed: number };
let n = 0;
const id = () => `r${n++}`;
function run(lines: string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l, id);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const TRI = run(['משולש ABC']);
const render = (lng: string, err: StoreError3) =>
  (errorText3(i18n3d.getFixedT(lng) as (k: string, o?: Record<string, unknown>) => string, err) ?? '').replace(/[⁦-⁩]/g, '');
const refusal = (line: string) => {
  const v = decideSubmit3(TRI, line, id);
  expect(v.kind, line).toBe('refused');
  return v.kind === 'refused' ? v.error : null;
};
const PARTS = (all: string) => ({ code: 'split-statements', all });

describe('#1904 — a dropped role is refused whole, never recorded without it (the 24 measured 3-D lines)', () => {
  it.each([
    ['AD תיכון לצלע BC שהוא גם אנך', '(1) AD תיכון לצלע BC  (2) שהוא גם אנך'],
    ['AD תיכון לצלע BC שהוא גם אנך ל-BC', '(1) AD תיכון לצלע BC  (2) שהוא גם אנך ל-BC'],
    ['AD תיכון לצלע BC שהוא גם מאונך ל-BC', '(1) AD תיכון לצלע BC  (2) שהוא גם מאונך ל-BC'],
    ['AD תיכון לצלע BC ומאונך לה', '(1) AD תיכון לצלע BC  (2) ומאונך לה'],
    ['AD תיכון לצלע BC שמאונך לה', '(1) AD תיכון לצלע BC  (2) שמאונך לה'],
    ['AD תיכון לצלע BC שחוצה את זווית A', '(1) AD תיכון לצלע BC  (2) שחוצה את זווית A'],
    ['AD תיכון לצלע BC וחוצה את זווית A', '(1) AD תיכון לצלע BC  (2) וחוצה את זווית A'],
    ['AD תיכון לצלע BC שהוא גם חוצה את הזווית', '(1) AD תיכון לצלע BC  (2) שהוא גם חוצה את הזווית'],
    ['AD תיכון לצלע BC שהוא גם חוצה את BC', '(1) AD תיכון לצלע BC  (2) שהוא גם חוצה את BC'],
  ])('«%s»', (line, all) => {
    const err = refusal(line);
    expect(err).toEqual(PARTS(all));
    expect(refusalCategory3(err!)).toBe('guided');
  });

  // #1942 (ADR-3D-367): 3-D now places an altitude and a bisector on an EXISTING D, so the taught pair records and the
  // lesson replaces the parts list for these lines (ADR-3D-317's own rule) — each verdict is 2-D's (measured at 688dfb96).
  it.each([
    ['AD תיכון לצלע BC שהוא גם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC שהיא גם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC שהוא גם גובה לצלע BC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון במשולש ABC שהוא גם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC, שהוא גם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC והוא גם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC וגם גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC והגובה AD', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC ו-AD גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC שגם הוא גובה', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'],
    ['AD תיכון לצלע BC שהוא גם חוצה זווית', 'AD תיכון לצלע BC', 'AD חוצה זווית A'],
    ['AD תיכון לצלע BC שהוא גם חוצה זווית A', 'AD תיכון לצלע BC', 'AD חוצה זווית A'],
    ['AD is the median to BC that is also the angle bisector', 'AD is the median to BC', 'AD is the bisector of angle A'],
  ])('«%s» is taught one line per role', (line, first, second) => {
    const err = refusal(line);
    expect(err).toEqual({ code: 'split-roles', first, second });
    expect(refusalCategory3(err!)).toBe('guided');
  });

  it('the reported line, in the exact Hebrew the student reads', () => {
    // #1942: the lesson, now that both taught lines record — 2-D's `input.scope.split-roles` sentence for the same line
    expect(render('he', refusal('AD תיכון לצלע BC שהוא גם גובה')!)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו כל תפקיד בשורה נפרדת: «AD תיכון לצלע BC», ואחר כך «AD גובה לצלע BC».',
    );
    // a line whose second part is not a taught role keeps the parts list, word for word
    expect(render('he', refusal('AD תיכון לצלע BC שהוא גם אנך')!)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: (1) AD תיכון לצלע BC  (2) שהוא גם אנך',
    );
  });
});

describe('#1904 — W22: the refusal teaches one line per role when the taught lines record', () => {
  it.each(['AD is the altitude to BC and also the median', 'AD is the altitude to BC that is also a median'])('«%s»', (line) => {
    const err = refusal(line);
    expect(err).toEqual({ code: 'split-roles', first: 'AD is the altitude to BC', second: 'AD is the median to BC' });
    expect(render('en', err!)).toBe(
      'One given per line — that way the tool can build and verify each one separately. Write each role on its own line: «AD is the altitude to BC», and then «AD is the median to BC».',
    );
  });

  it('the taught lines BUILD: AD is perpendicular to BC and D is its midpoint', () => {
    const st = run(['משולש ABC', 'AD is the altitude to BC', 'AD is the median to BC']);
    for (const seed of [0, 1, 2]) {
      const d = derive3(st.facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
      const p = d.positions;
      const ad = sub3(p.get('D')!, p.get('A')!);
      const bc = sub3(p.get('C')!, p.get('B')!);
      expect(Math.abs(dot3(ad, bc)) / (norm3(ad) * norm3(bc))).toBeLessThan(1e-6);
      expect(norm3(sub3(p.get('B')!, p.get('D')!))).toBeCloseTo(norm3(sub3(p.get('C')!, p.get('D')!)), 6);
    }
  });

  it('#1942: the median-first pair now RECORDS, so the one-line form is taught (the proof the lesson rests on)', () => {
    // until #1942 «AD תיכון לצלע BC» then «AD גובה לצלע BC» was refused `already-defined D` and the line fell back to the parts
    expect(() => run(['משולש ABC', 'AD תיכון לצלע BC', 'AD גובה לצלע BC'])).not.toThrow();
    expect(refusal('AD תיכון לצלע BC שהוא גם גובה')).toEqual({ code: 'split-roles', first: 'AD תיכון לצלע BC', second: 'AD גובה לצלע BC' });
  });

  it('the ✎ edit seam refuses the same edit and keeps the old statement', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.getState().submit('משולש ABC');
    useGeo3.getState().submit('AD תיכון לצלע BC');
    const fid = useGeo3.getState().facts[1].id;
    expect(useGeo3.getState().replaceFact(fid, 'AD תיכון לצלע BC שהוא גם גובה')).toBe(false);
    expect(useGeo3.getState().lastError).toEqual({ code: 'split-roles', first: 'AD תיכון לצלע BC', second: 'AD גובה לצלע BC' });
    expect(useGeo3.getState().facts[1].utterance).toBe('AD תיכון לצלע BC');
  });
});

describe('#1904 — still works (one role per line, and a role stated twice)', () => {
  it.each(['AD גובה לצלע BC', 'AD תיכון לצלע BC', 'AD חוצה זווית A', 'AD גובה'])('«%s» records', (line) => {
    expect(decideSubmit3(TRI, line, id).kind).toBe('record');
  });

  it('a role word stated twice and read together is a co-reference, not a lost role', () => {
    const u = 'AD תיכון לצלע BC שהוא תיכון';
    const r = parse3(u);
    if (r.ok) expect(unreadRoles3(u, r.commands)).toBeNull();
  });
});

describe('#1904 — the false-refusal nets', () => {
  const lowering = (t: string) => {
    const r = parse3(t);
    return r.ok && r.commands.length ? r.commands : null;
  };
  it('no catalog example is flagged (He and En), with role words exercised', () => {
    let read = 0;
    let roles = 0;
    for (const e of COMMAND_CATALOG_3D) {
      for (const u of [e.he, e.en]) {
        if (!u) continue;
        const c = lowering(u);
        if (!c) continue;
        read++;
        if (/גוב|תיכו|חוצ|מאונ|אנך|altitude|median|bisect|perpendicular|height/i.test(u)) roles++;
        expect(unreadRoles3(u, c), u).toBeNull();
      }
    }
    expect(read).toBeGreaterThanOrEqual(450);
    expect(roles).toBeGreaterThanOrEqual(50);
  });

  it('no fixture step is flagged', () => {
    const dir = join(__dirname, '..', '..', 'fixtures3');
    let steps = 0;
    for (const fn of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      for (const f of (JSON.parse(readFileSync(join(dir, fn), 'utf8')).facts ?? []) as { utterance?: string }[]) {
        const c = f.utterance ? lowering(f.utterance) : null;
        if (!c) continue;
        steps++;
        expect(unreadRoles3(f.utterance!, c), `${fn}: ${f.utterance}`).toBeNull();
      }
    }
    expect(steps).toBeGreaterThanOrEqual(200);
  });
});
