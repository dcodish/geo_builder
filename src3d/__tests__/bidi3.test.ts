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
