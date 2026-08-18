/**
 * #464 — an LTR technical run inside an RTL Hebrew sentence must not be reordered.
 *
 * Operator report, 2026-08-09: the triangle-inequality error rendered `|BC| = 10` as `10 = |BC|` and
 * `|AC| + |BA| = 9` as `9 = |BA| + |AC|`. Almost every character in such a run — `| = +`, digits,
 * `∠ ⊥ ∥ △ √` — is NEUTRAL to the bidi algorithm, which resolves it to the paragraph direction.
 *
 * The first attempt at this fix isolated the INTERPOLATED value at its call site, and this file is
 * partly a record of why that was wrong: the run is usually composed from the message template's own
 * literals plus the value (`"|{{seg}}| = {{value}}"` builds its pipes and its `=` in the message), so the
 * complete run exists only in the RENDERED string. Hence one i18next post-processor over every `t()`.
 *
 * The load-bearing test here is not any single message — it is the SAFETY property over the whole
 * bundle: isolation adds two zero-width characters and must never change a single visible character of
 * any message. A sweeping transform that can corrupt one string in 300 is worse than the bug it fixes.
 */
import { describe, expect, it } from 'vitest';
import { isolateLtrRuns, RUN_CORE, RUN_DELIMS } from '../bidi';
import { GREEK, SYMBOL_SPECS, SYMBOLS } from '@/ui/symbols';
import he from '../locales/he.json';
import en from '../locales/en.json';

const LRI = '⁦';
const PDI = '⁩';
const strip = (s: string) => s.replace(/[⁦⁩]/g, '');
const HEBREW = /[א-ת]/;
const CORE = /[A-Za-z0-9|∠∡∢⊥∥△▲√⌢°]/;

/** Every leaf string of a locale bundle, with its dotted key. */
function leaves(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]];
  if (o && typeof o === 'object') {
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

describe('#464 — the reported message', () => {
  it('«|BC| = 10» and «|AC| + |BA| = 9» are each isolated as one LTR run', () => {
    const rendered =
      'לא ניתן: |BC| = 10 — סכום שתי צלעות תמיד גדול מהצלע השלישית, וכאן |AC| + |BA| = 9. בדקו את הנתונים.';
    const out = isolateLtrRuns(rendered);
    expect(out).toContain(`${LRI}|BC| = 10${PDI}`);
    expect(out).toContain(`${LRI}|AC| + |BA| = 9${PDI}`);
    // the sentence's OWN punctuation stays outside the isolate — isolating it would move it
    expect(out).not.toContain(`${LRI}:`);
    expect(out).not.toContain(`.${PDI}`);
  });
});

describe('#464 — the transform is layout-only', () => {
  it.each([...leaves(he)])('he.%s keeps every visible character', (_key, s) => {
    expect(strip(isolateLtrRuns(s))).toBe(s);
  });

  it('an English (no-Hebrew) message is returned untouched', () => {
    for (const [, s] of leaves(en)) expect(isolateLtrRuns(s)).toBe(s);
  });

  it('never nests — a string already carrying isolates is left alone', () => {
    const once = isolateLtrRuns('הזווית ∠BAC = 50 גדולה');
    expect(isolateLtrRuns(once)).toBe(once);
  });
});

describe('#464 — coverage: EVERY Hebrew message with a technical run gets one', () => {
  // The operator asked for all similar messages, not just the reported one. This is that check, and it
  // is derived from the bundle rather than a hand-listed set, so a message added later is covered too.
  const needsIsolation = leaves(he).filter(([, s]) => {
    if (!HEBREW.test(s)) return false;
    // a CORE character sitting outside every Hebrew word — i.e. a genuine LTR run
    return s.split(/[א-ת]+/).some((gap) => CORE.test(gap));
  });

  it('the corpus is real, not an empty loop', () => {
    expect(needsIsolation.length).toBeGreaterThan(20);
  });

  it.each(needsIsolation)('he.%s is isolated', (_key, s) => {
    expect(isolateLtrRuns(s)).toContain(LRI);
  });
});

describe('#464 — the shape of a run', () => {
  it.each([
    ['a label run', 'המשולש ABC גדול', `המשולש ${LRI}ABC${PDI} גדול`],
    ['a glyph-led run', 'הזווית ∠BAC = 50 מעלות', `הזווית ${LRI}∠BAC = 50${PDI} מעלות`],
    ['trailing punctuation stays out', 'וכאן AB = 9.', `וכאן ${LRI}AB = 9${PDI}.`],
    ['leading punctuation stays out', 'לא ניתן: AB = 9', `לא ניתן: ${LRI}AB = 9${PDI}`],
    ['no core char → untouched', 'אין כאן — כלום', 'אין כאן — כלום'],
    // Balanced delimiters that HUG the run come INSIDE it: left outside they are neutrals, and the
    // algorithm mirrors them — the pair would render inverted around content laid out LTR.
    ['hugging quotes come inside', 'כמו "DE ∥ BC" למשל', `כמו ${LRI}"DE ∥ BC"${PDI} למשל`],
    ['a coordinate triple keeps its parens', 'הנקודה (1, 2, -3) בחלל', `הנקודה ${LRI}(1, 2, -3)${PDI} בחלל`],
    ['nested quote-in-paren', 'ראו ("AB") כאן', `ראו ${LRI}("AB")${PDI} כאן`],
    // ...but only when BALANCED. Here the `(` belongs to the Hebrew sentence, not to the run.
    ['an unbalanced bracket is left alone', 'הצורה (ראו ABC) כאן', `הצורה (ראו ${LRI}ABC${PDI}) כאן`],
  ])('%s', (_label, input, expected) => {
    expect(isolateLtrRuns(input)).toBe(expected);
  });
});

/**
 * #482 — reported against 3-D, fixed in both trees (copied pattern, docs/20 §12 rule 1).
 *
 * Two defects, one root: the run BOUNDARY rule and the run ALPHABET. The boundary trimmed to the last
 * CORE character, so a run ending in a closer — `√(2/3)`, a coordinate pair, `S_{ABC}` — orphaned that
 * closer outside the isolate, where it is a neutral: it takes the RTL paragraph direction, MIRRORS, and
 * lands at the wrong end of the line. The alphabet had drifted from `ui/symbols.ts`, so twelve characters
 * the app OFFERS were unknown to bidi and SPLIT any run they appeared in.
 *
 * The lesson from round 1 in the 3-D tree: asserting an isolate EXISTS passes on a broken transform. The
 * property is that it COVERS the run.
 */
describe('#482 — the isolate must COVER the run, and the alphabet must not drift', () => {
  /** Every character of `s` that ends up outside an isolate. */
  const outside = (s: string): string => {
    let depth = 0;
    let out = '';
    for (const ch of isolateLtrRuns(s)) {
      if (ch === LRI) depth++;
      else if (ch === PDI) depth--;
      else if (depth === 0) out += ch;
    }
    return out;
  };

  const CORPUS = [
    'הצלע AD = √(2/3) במשולש',
    'השטח S_{ABC} = 13 והשאר',
    'הקשת ⌢{AC} שווה לקשת ⌢{BE}',
    'הזווית α קטנה מ-β',
    'הצלע AB = x² והשנייה ½',
    'המשולש ABC ≅ DEF כאן',
    'הצורה ABC ~ DEF דומה',
    'הנקודה (1, 2) במישור',
    'וכאן |BC| = 10 בסוף',
  ];

  it.each(CORPUS)('no technical character is orphaned outside the isolate: %s', (s) => {
    const orphans = [...outside(s)].filter((c) => RUN_CORE.test(c));
    expect(orphans, `left for the RTL paragraph to reorder: ${JSON.stringify(orphans)}`).toEqual([]);
  });

  it.each(CORPUS)('no delimiter is separated from its partner: %s', (s) => {
    const out = outside(s);
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      const opens = [...out].filter((c) => c === open).length;
      const closes = [...out].filter((c) => c === close).length;
      expect(opens, `an unmatched ${open} escaped the isolate in "${s}"`).toBe(closes);
    }
  });

  it('a run ending in a closer keeps it: √(2/3)', () => {
    expect(isolateLtrRuns('הצלע AD = √(2/3) במשולש')).toBe(`הצלע ${LRI}AD = √(2/3)${PDI} במשולש`);
  });

  it('the sentence’s OWN punctuation still stays outside — not traded away for the fix', () => {
    expect(isolateLtrRuns('וכאן AB = 9.')).toBe(`וכאן ${LRI}AB = 9${PDI}.`);
    expect(isolateLtrRuns('הצורה (ראו ABC) כאן')).toBe(`הצורה (ראו ${LRI}ABC${PDI}) כאן`);
  });

  it('every character the symbol palette inserts is CORE or a run delimiter', () => {
    const holes = new Set<string>();
    for (const ins of [...GREEK, ...SYMBOLS.map((s) => s.insert)]) {
      for (const ch of ins) if (!RUN_CORE.test(ch) && !RUN_DELIMS.includes(ch)) holes.add(ch);
    }
    expect(
      [...holes],
      'a palette button offers a character bidi does not know is technical — it will SPLIT the run it ' +
        'appears in. Add it to CORE in i18n/bidi.ts rather than deleting it here.',
    ).toEqual([]);
  });

  it('the SHARED palette carries the WHOLE vocabulary — nothing dropped at the B4-2d adoption', () => {
    // Operator, playing B4-2d: "do we have all the symbols we had? It seems a bit small." The
    // shared spec derives from GREEK + SYMBOLS, so a drop would be a derivation bug — this pins
    // the count and every label so it cannot happen silently.
    expect(SYMBOL_SPECS).toHaveLength(GREEK.length + SYMBOLS.length);
    expect(SYMBOL_SPECS.map((s) => s.label)).toEqual([...GREEK, ...SYMBOLS.map((s) => s.label)]);
    // and the caret templates became WRAPS whose halves recompose the exact old insert
    for (const s of SYMBOLS) {
      const spec = SYMBOL_SPECS.find((x) => x.label === s.label)!;
      expect(spec.before + (spec.after ?? '')).toBe(s.insert);
    }
  });
});
