/**
 * #468 — the 3-D half of #464: an LTR technical run inside an RTL Hebrew sentence must not be reordered.
 *
 * The mechanism is COPIED from 2-D as a pattern, never imported (docs/20 §12 rule 1), and so are the two
 * properties that make a sweeping transform safe to run over every user-facing string.
 *
 * The load-bearing one is SAFETY, not any single message: isolation adds two zero-width characters and
 * must never change a visible character of any message. A transform that can corrupt one string in 300 is
 * worse than the bug it fixes. The COVERAGE sweep is derived from the bundle rather than hand-listed, so a
 * message added later is checked without anyone remembering to add it.
 *
 * 3-D carries one hazard 2-D does not: labels are PRIMED (`A'B'C'D'`), so the prime must sit inside the
 * isolate or a run would end mid-label.
 */
import { describe, expect, it } from 'vitest';
import { isolateLtrRuns3 } from '../i18n/bidi';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const LRI = '⁦';
const PDI = '⁩';
const strip = (s: string) => s.replace(/[⁦⁩]/g, '');
const HEBREW = /[א-ת]/;
const CORE = /[A-Za-z0-9'|∠∡∢⊥∥△▲√⌢°]/;

function leaves(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]];
  if (o && typeof o === 'object') {
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

describe('#468 — the transform is layout-only', () => {
  it.each([...leaves(he)])('he.%s keeps every visible character', (_key, s) => {
    expect(strip(isolateLtrRuns3(s))).toBe(s);
  });

  it('an English (no-Hebrew) message is returned untouched', () => {
    for (const [, s] of leaves(en)) expect(isolateLtrRuns3(s)).toBe(s);
  });

  it('never nests', () => {
    const once = isolateLtrRuns3("התיבה ABCDA'B'C'D' גדולה");
    expect(isolateLtrRuns3(once)).toBe(once);
  });
});

describe('#468 — coverage: every Hebrew message with a technical run gets one', () => {
  const needsIsolation = leaves(he).filter(([, s]) => {
    if (!HEBREW.test(s)) return false;
    return s.split(/[א-ת]+/).some((gap) => CORE.test(gap));
  });

  it('the corpus is real, not an empty loop', () => {
    expect(needsIsolation.length).toBeGreaterThan(10);
  });

  it.each(needsIsolation)('he.%s is isolated', (_key, s) => {
    expect(isolateLtrRuns3(s)).toContain(LRI);
  });
});

describe('#468 — the shape of a run, including the 3-D hazards', () => {
  it.each([
    ['a PRIMED label run stays whole', "התיבה ABCDA'B'C'D' גדולה", `התיבה ${LRI}ABCDA'B'C'D'${PDI} גדולה`],
    // The 3-D case that makes bracket absorption load-bearing: a coordinate triple IS a parenthesised
    // run, so parens left outside the isolate would be mirrored around LTR content.
    ['a coordinate triple keeps its parens', 'הנקודה (1, 2, -3) בחלל', `הנקודה ${LRI}(1, 2, -3)${PDI} בחלל`],
    ['an unbalanced bracket is left alone', 'הצורה (ראו ABC) כאן', `הצורה (ראו ${LRI}ABC${PDI}) כאן`],
    ['trailing punctuation stays out', 'וכאן AB = 9.', `וכאן ${LRI}AB = 9${PDI}.`],
    ['leading punctuation stays out', 'לא ניתן: AB = 9', `לא ניתן: ${LRI}AB = 9${PDI}`],
    ['no core char → untouched', 'אין כאן — כלום', 'אין כאן — כלום'],
  ])('%s', (_label, input, expected) => {
    expect(isolateLtrRuns3(input)).toBe(expected);
  });
});

/**
 * #482 — the transform must also cover the STUDENT'S OWN text. ADR-3D-116 put the isolation on the
 * i18next post-processor, which is one chokepoint for every translated message and the right place for
 * those — but an utterance never passes through `t()`, so the fact list rendered the operator's own
 * equations reversed. These are the exact rows from the prod session of 2026-08-09.
 */
describe('#482 — a student utterance is isolated like a message', () => {
  const UTTERANCES = [
    'ישר l - x=(1,2,3)+t(m-2,m, m+2)',
    'מישור π1 - x+(m-2)y+(m-1)z-5',
    'l מקביל ל- π1',
    'הישר ℓ מקביל למישור π1',
    'B על מישור π2',
    'A נקודת החיתוך של ℓ עם π1',
  ];

  it.each(UTTERANCES)('%s gets an isolate around its technical run', (u) => {
    expect(isolateLtrRuns3(u)).toContain(LRI);
  });

  it.each(UTTERANCES)('%s is byte-for-byte recoverable (display-only, never the stored fact)', (u) => {
    const stripped = isolateLtrRuns3(u).split(LRI).join('').split(PDI).join('');
    expect(stripped).toBe(u);
  });

  it('is idempotent, so a re-render cannot nest isolates', () => {
    for (const u of UTTERANCES) {
      const once = isolateLtrRuns3(u);
      expect(isolateLtrRuns3(once)).toBe(once);
    }
  });

  it('a pure-LTR utterance is returned untouched (an English session is unaffected)', () => {
    const en = 'line l: x = (1,2,3) + t(m-2, m, m+2)';
    expect(isolateLtrRuns3(en)).toBe(en);
  });

  it("the operator's plane equation keeps its whole run together, not letter by letter", () => {
    // the defect looked like this: the neutral run `- x+(m-2)y+(m-1)z-5` resolving to the RTL paragraph
    const out = isolateLtrRuns3('מישור π1 - x+(m-2)y+(m-1)z-5');
    expect(out.split(LRI).length - 1, 'one run, one isolate — not one per token').toBe(1);
  });
});
