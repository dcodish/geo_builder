/**
 * A CONIC MAY BE NAMED, AND EVERY REFERENCE SITE INHERITS IT (#1271 + #1336, ADR-AG-170).
 *
 * Operator: *"since we can have more than 1 parabola on a diagram, we need to support things like
 * «נתונה פרבולה I - y^2=2x»"*, widened 2026-09-20: *"we need to support all such forms of
 * writing."* And #1336 (playing round #1332 T14): «פרבולה I: y^2=2x» reached the LLM escape and
 * came back «not understood» — for a sentence whose only problem was that a parabola could not
 * carry a name.
 *
 * One naming clause for both conics (a third copy per kind is the #1233/#1267 shape), the
 * connective set the textbook prints («שמשוואתה», «:», «-», «היא»), gender tolerated, ids
 * `parabola-I`/`ellipse-I` beside `circle-I`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { runFallback } from '../app/fallback';
import { decideSubmit } from '../app/submit';
import { errorText, type Translate } from '../app/errorText';
import { refKindOf, statedName } from '../engine/names';
import { analyticI18n } from '../i18n';

const conicIds = (d: ReturnType<typeof derive>) => d.construction.objects.filter((o) => o.kind === 'curve').map((o) => o.id);

describe('#1271 — every naming spelling, per conic kind × connective', () => {
  it.each([
    ['נתונה פרבולה I - y^2=2x', 'parabola-I'],
    ['נתונה פרבולה I שמשוואתה y^2=2x', 'parabola-I'],
    ['נתון פרבולה I שמשוואתו y^2=2x', 'parabola-I'],
    ['פרבולה I: y^2=2x', 'parabola-I'],
    ['נתונה אליפסה I שמשוואתה x^2/9+y^2/4=1', 'ellipse-I'],
    ['אליפסה II - x^2/25+y^2/9=1', 'ellipse-II'],
    ['parabola I: y^2=2x', 'parabola-I'],
    ['נתון מעגל I - x^2+y^2=16', 'circle-I'],
  ])('«%s» → %s', (line, id) => {
    const d = derive([line], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d)).toEqual([id]);
  });

  it('TWO named parabolas are separately referable — his own reason for asking', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=2x', 'נתונה פרבולה II שמשוואתה y^2=8x'], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d).sort()).toEqual(['parabola-I', 'parabola-II']);
  });

  it('the anonymous forms keep working exactly as today', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=2x', 'y^2=8x'], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d)).toHaveLength(2);
    expect(conicIds(d).every((id) => id.startsWith('curve-anon'))).toBe(true);
  });

  it('restating a named conic is ONE object (ADR-AG-023)', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=2x', 'פרבולה I: y^2=2x'], 0);
    expect(conicIds(d)).toEqual(['parabola-I']);
  });
});

describe('#1271 — the reference sites', () => {
  it('«P על הפרבולה I» puts P on THAT parabola', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=8x', 'נתונה פרבולה II שמשוואתה y^2=2x', 'P על הפרבולה I'], 0);
    expect(d.faults).toEqual([]);
    const p = d.figure.points.find((q) => q.id === 'P')!;
    expect(Math.abs(p.y * p.y - 8 * p.x)).toBeLessThan(1e-6);
  });

  it('a crossing sentence with the named parabola builds', () => {
    const d = derive(['נתון הישר l1: y=4', 'נתונה פרבולה I שמשוואתה y^2=8x', 'A נקודת החיתוך של הישר l1 עם הפרבולה I'], 0);
    expect(d.faults).toEqual([]);
    const a = d.figure.points.find((q) => q.id === 'A')!;
    expect(a.y).toBeCloseTo(4, 5);
    expect(a.x).toBeCloseTo(2, 5);
  });
});

describe('#1336 — the escape is not entered, and a rejected completion is not «not understood»', () => {
  it('«פרבולה I: y^2=2x» now parses DIRECTLY — the escape never fires for it', () => {
    expect(parseLine('פרבולה I: y^2=2x').ok).toBe(true);
  });

  it('runFallback carries the refusal CODE on a rejected completion, and never the model’s text as the message', async () => {
    // The model answers a line the tool refuses (an unknown reference) — the caller must be able
    // to say "understood, unsupported" without naming the model's line.
    const out = await runFallback('משפט כלשהו', [], 0, async () => ({ steps: ['P על המעגל VII'] }) as never);
    expect(out.kind).toBe('rejected');
    if (out.kind === 'rejected') {
      expect(out.code).toBeTruthy();
    }
  });
});

/**
 * AMENDMENT 1 — the 2026-09-29 pre-play (ADR-AG-170 Am. 1). Every case drives the REAL submit path
 * (`decideSubmit`, the line the page records or refuses) and, for refusals, the SAME `errorText` the
 * page renders — never a re-spelled key table.
 */
type Verdict = ReturnType<typeof decideSubmit>;
const he = analyticI18n.getFixedT('he') as unknown as Translate;
const en = analyticI18n.getFixedT('en') as unknown as Translate;

/** Submit each line in turn, as the page does: recorded lines accumulate, the LAST verdict is returned. */
const play = (seq: readonly string[]): { last: Verdict; lines: string[] } => {
  const lines: string[] = [];
  let last: Verdict = { kind: 'ignored' };
  for (const raw of seq) {
    last = decideSubmit(raw, lines, 0);
    if (last.kind === 'record') lines.push(raw);
  }
  return { last, lines };
};
const refusal = (seq: readonly string[]) => {
  const { last } = play(seq);
  if (last.kind !== 'refused') throw new Error(`expected a refusal for «${seq.at(-1)}», got ${last.kind}`);
  return last.error;
};
const recordsAll = (seq: readonly string[]) => {
  const { lines } = play(seq);
  expect(lines, seq.join(' / ')).toEqual([...seq]);
  return derive(lines, 0);
};
const pointOf = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((q) => q.id === id)!;

describe('Am. 1 · the verb crossings reach a NAMED conic through #1429’s one resolver', () => {
  const verbs = (line: string, curve: string) => [
    `הישר ${line} חותך את ${curve} בנקודה A`,
    `הישר ${line} ו${curve} נחתכים בנקודה A`,
    `A נקודת החיתוך של הישר ${line} עם ${curve}`,
  ];
  it.each([
    ['parabola', ['נתון הישר l1: y=4', 'נתונה פרבולה I שמשוואתה y^2=8x'], 'הפרבולה I', [2, 4]],
    ['ellipse', ['נתון הישר l1: y=0', 'נתונה אליפסה I שמשוואתה x^2/9+y^2/4=1'], 'האליפסה I', [3, 0]],
    ['named circle', ['נתון הישר l1: y=0', 'נתון מעגל I שמשוואתו x^2+y^2=16'], 'המעגל I', [4, 0]],
    ['digit-named circle', ['נתון הישר l1: y=0', 'נתון מעגל 1 שמשוואתו x^2+y^2=16'], 'המעגל 1', [4, 0]],
  ] as const)('%s — all three verb forms put A on the crossing', (_k, setup, curve, [x, y]) => {
    for (const sentence of verbs('l1', curve)) {
      const d = recordsAll([...setup, sentence]);
      const a = pointOf(d, 'A');
      expect(Math.abs(Math.abs(a.x) - x) + Math.abs(a.y - y), sentence).toBeLessThan(1e-6);
    }
  });
});

describe('Am. 1 · no refusal prints an internal id, and each curve kind has its own noun', () => {
  const RAW_ID = /\b(?:line|circle|parabola|ellipse|curve)-[A-Za-z0-9]/;
  it.each([
    ['parabola', ['P על הפרבולה I'], 'parabola', 'הפרבולה I עדיין לא הוגדרה'],
    ['parabola, another numeral', ['נתונה פרבולה I שמשוואתה y^2=8x', 'P על הפרבולה III'], 'parabola', 'הפרבולה III עדיין לא הוגדרה'],
    ['ellipse', ['P על האליפסה II'], 'ellipse', 'האליפסה II עדיין לא הוגדרה'],
    ['circle', ['P על המעגל II'], 'circle', 'המעגל II עדיין לא הוגדר'],
    ['circle by digit', ['P על המעגל 2'], 'circle', 'המעגל II עדיין לא הוגדר'],
    ['line', ['A(0,0)', 'נקודה D היא חיתוך של l7 ו- l8'], 'line', 'הישר l7 עדיין לא הוגדר'],
    ['en parabola', ['P is on the parabola I'], 'parabola', null],
  ] as const)('%s', (_what, seq, kind, heText) => {
    const e = refusal(seq);
    expect(e.key).toBe('unknown-reference');
    expect((e as { expected?: string }).expected).toBe(kind);
    const textHe = errorText(e, he).replace(/[⁦-⁩]/g, '');
    const textEn = errorText(e, en).replace(/[⁦-⁩]/g, '');
    expect(textHe).not.toMatch(RAW_ID);
    expect(textEn).not.toMatch(RAW_ID);
    if (heText) expect(textHe).toContain(heText);
  });

  it('the one table: every prefixed kind maps to its noun and the name the student wrote', () => {
    expect(['line-l7', 'circle-I', 'parabola-I', 'ellipse-II', 'circle-at-O', 'A'].map((id) => [refKindOf(id), statedName(id)])).toEqual([
      ['line', 'l7'],
      ['circle', 'I'],
      ['parabola', 'I'],
      ['ellipse', 'II'],
      ['circle', 'O'],
      ['point', 'A'],
    ]);
  });
});

describe('Am. 1 · the noun is CHECKED against the equation (02c R7) — every noun × every family', () => {
  const EQ = { line: 'y=2x+1', circle: 'x^2+y^2=16', parabola: 'y^2=2x', ellipse: 'x^2/9+y^2/4=1' } as const;
  const NOUN_HE = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' } as const;
  type K = keyof typeof EQ;
  const named: Record<K, (eq: string) => string> = {
    line: (eq) => `נתון הישר l1: ${eq}`,
    circle: (eq) => `נתון מעגל I שמשוואתו ${eq}`,
    parabola: (eq) => `נתונה פרבולה I שמשוואתה ${eq}`,
    ellipse: (eq) => `נתונה אליפסה I שמשוואתה ${eq}`,
  };
  const anonymous: Record<K, (eq: string) => string> = {
    line: (eq) => `נתון הישר ${eq}`,
    circle: (eq) => `נתון מעגל שמשוואתו ${eq}`,
    parabola: (eq) => `נתונה פרבולה שמשוואתה ${eq}`,
    ellipse: (eq) => `נתונה אליפסה שמשוואתה ${eq}`,
  };
  const kinds = Object.keys(EQ) as K[];
  const cases = kinds.flatMap((noun) => kinds.map((fam) => [noun, fam] as const));

  it.each(cases)('noun %s × equation of a %s', (noun, fam) => {
    for (const form of [named, anonymous]) {
      const line = form[noun](EQ[fam]);
      const v = decideSubmit(line, [], 0);
      if (noun === fam) {
        expect(v.kind, line).toBe('record');
        continue;
      }
      // A REFUSAL, naming what the equation IS and what the sentence called it — never drawn.
      expect(v.kind, line).toBe('refused');
      if (v.kind !== 'refused') continue;
      expect(v.error).toMatchObject({ key: 'kind-mismatch', existing: `curve:${fam}`, expected: noun });
      const text = errorText(v.error, he).replace(/[⁦-⁩]/g, '');
      expect(text, line).toContain(`מתארת ${NOUN_HE[fam]}, לא ${NOUN_HE[noun]}`);
    }
  });

  it('a hyperbola under the ellipse noun keeps its more specific scope refusal', () => {
    const v = decideSubmit('נתונה אליפסה I שמשוואתה x^2/9-y^2/4=1', [], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('out-of-scope');
  });
});

describe('Am. 1 · one canonical numeral — «1» and «I» are one name, for every numeral-named kind', () => {
  it.each([
    ['parabola', 'נתונה פרבולה 1: y^2=2x', ['P על הפרבולה I', 'P על הפרבולה 1'], 'נתונה פרבולה I: y^2=2x', 'נתונה פרבולה I: y^2=8x'],
    ['ellipse', 'נתונה אליפסה 2: x^2/9+y^2/4=1', ['P על האליפסה II', 'P על האליפסה 2'], 'נתונה אליפסה II: x^2/9+y^2/4=1', 'נתונה אליפסה II: x^2/25+y^2/4=1'],
    ['circle', 'נתון מעגל 1: x^2+y^2=16', ['P על המעגל I', 'P על המעגל 1'], 'נתון מעגל I: x^2+y^2=16', 'נתון מעגל I: x^2+y^2=9'],
  ])('%s: declared by digit, referred to by either spelling, restated as ONE object', (_k, declare, refs, same, other) => {
    for (const ref of refs) {
      const d = recordsAll([declare, ref]);
      expect(d.construction.objects.filter((o) => o.kind === 'curve')).toHaveLength(1);
      expect(d.faults).toEqual([]);
    }
    // The Roman restatement of the same equation is the same object, already known …
    expect(decideSubmit(same, [declare], 0).kind).toBe('already-known');
    // … and a different equation under the other spelling is a CONTRADICTION, never a second curve.
    const v = decideSubmit(other, [declare], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('conflicting-restatement');
  });

  it('the label keeps the student’s own numeral', () => {
    const d = recordsAll(['נתונה פרבולה 1: y^2=2x']);
    expect(d.figure.curves.map((c) => [c.id, c.label.name])).toEqual([['parabola-I', 'פרבולה 1']]);
  });

  it('a digit still names a LINE (#1257 ruling) — lines keep their own token, unchanged', () => {
    const d = recordsAll(['משוואת ישר 1 היא 2x-y+8=0']);
    expect(d.figure.curves.map((c) => c.id)).toEqual(['line-1']);
  });
});

describe('Am. 1 · one connective grammar for every naming clause', () => {
  it.each([
    ['«משוואת» prefix, parabola', 'משוואת הפרבולה I היא y^2=2x', 'parabola-I'],
    ['«משוואת» prefix, ellipse, colon', 'משוואת האליפסה II: x^2/9+y^2/4=1', 'ellipse-II'],
    ['«משוואת» prefix, circle (unchanged)', 'משוואת המעגל I היא x^2+y^2=9', 'circle-I'],
    ['«הינה», parabola', 'הפרבולה I הינה y^2=2x', 'parabola-I'],
    ['«הינו», circle', 'המעגל I הינו x^2+y^2=9', 'circle-I'],
    ['«הינה» after «משוואת»', 'משוואת המעגל I הינה x^2+y^2=9', 'circle-I'],
    ['«הינו», line', 'הישר l1 הינו y=2x', 'line-l1'],
    ['comma, parabola', 'נתונה פרבולה I, שמשוואתה y^2=2x', 'parabola-I'],
    ['comma, ellipse', 'נתונה אליפסה II, שמשוואתה x^2/9+y^2/4=1', 'ellipse-II'],
    ['comma, circle', 'נתון מעגל I, שמשוואתו x^2+y^2=9', 'circle-I'],
    ['comma, line', 'נתון הישר l1, שמשוואתו y=2x', 'line-l1'],
    ['«שמשוואתו», line', 'נתון הישר l1 שמשוואתו y=2x', 'line-l1'],
    ['en, the parabola II is', 'the parabola II is y^2=4x', 'parabola-II'],
  ])('%s', (_what, line, id) => {
    const d = recordsAll([line]);
    expect(d.figure.curves.map((c) => c.id)).toEqual([id]);
  });

  it('comma after a CENTRE letter still names the centre (#1059)', () => {
    const d = recordsAll(['נתון מעגל O, שמשוואתו (x-3)^2+(y-4)^2=9']);
    const o = pointOf(d, 'O');
    expect([o.x, o.y]).toEqual([3, 4]);
  });
});

describe('Am. 1 · a curve named by its noun alone — the refusal names the candidates, and its example records', () => {
  it('two named parabolas: names both, and teaches «P על הפרבולה I»', () => {
    const setup = ['נתונה פרבולה I שמשוואתה y^2=8x', 'נתונה פרבולה II שמשוואתה y^2=2x'];
    const e = refusal([...setup, 'P על הפרבולה']);
    expect(e).toMatchObject({ key: 'ambiguous-curve', expected: 'parabola', candidates: ['I', 'II'] });
    const text = errorText(e, he).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('הפרבולה I, הפרבולה II');
    expect(text).toContain('«P על הפרבולה I»');
    expect(text).not.toContain('דלתון');
    // The taught remedy is a hypothesis until it records.
    expect(decideSubmit('P על הפרבולה I', setup, 0).kind).toBe('record');
  });

  it('two UNNAMED parabolas: the example refers by equation, and records', () => {
    const setup = ['נתונה פרבולה שמשוואתה y^2=8x', 'נתונה פרבולה שמשוואתה y^2=2x'];
    const e = refusal([...setup, 'P על הפרבולה']);
    const text = errorText(e, he).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('«P על הפרבולה y^2=8x»');
    expect(decideSubmit('P על הפרבולה y^2=8x', setup, 0).kind).toBe('record');
  });

  it('two circles, contextual «P על המעגל»: the same refusal, the circle noun', () => {
    const setup = ['נתון מעגל I שמשוואתו x^2+y^2=9', 'נתון מעגל II שמשוואתו x^2+y^2=4'];
    const text = errorText(refusal([...setup, 'P על המעגל']), he).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('«P על המעגל I»');
    expect(decideSubmit('P על המעגל I', setup, 0).kind).toBe('record');
  });

  it('no parabola at all: says there is none, and never teaches a kite', () => {
    const text = errorText(refusal(['P על הפרבולה']), he).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('בשרטוט עדיין אין פרבולה');
    expect(text).not.toContain('דלתון');
  });

  it('English renders the same refusal with its own nouns', () => {
    const e = refusal(['נתונה פרבולה I שמשוואתה y^2=8x', 'נתונה פרבולה II שמשוואתה y^2=2x', 'P is on the parabola']);
    const text = errorText(e, en).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('the parabola I, the parabola II');
    expect(text).toContain('"P is on the parabola I"');
  });
});
