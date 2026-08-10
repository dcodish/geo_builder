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
import { inputPreview3, isolateLtrRuns3, RUN_CORE, RUN_DELIMS, textDir3 } from '../i18n/bidi';
import { SYMBOL_PALETTE_3 } from '../ui/symbols3';
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

/**
 * #482 round 2 — the operator re-tested the fix above and the row was STILL wrong.
 *
 * The assertions in the block above are all true of a BROKEN transform: `toContain(LRI)` says an isolate
 * exists, byte-reversibility says nothing was destroyed, idempotence says it does not nest. None of them
 * says the isolate COVERS THE RUN, which is the only property that matters on screen. That gap is why a
 * green suite shipped a visibly wrong fact list, so the fix here is the PROPERTY, not two more examples.
 */
describe('#482 round 2 — the isolate must COVER the run, not merely exist', () => {
  /** Every character of `s` that ends up outside an isolate. */
  const outside = (s: string): string => {
    let depth = 0;
    let out = '';
    for (const ch of isolateLtrRuns3(s)) {
      if (ch === LRI) depth++;
      else if (ch === PDI) depth--;
      else if (depth === 0) out += ch;
    }
    return out;
  };

  const CORPUS = [
    // the operator's screenshot, 2026-08-10 — a run ENDING in a closer, which is every parametric line
    'ישר l - x=(1,2,3)+t(m+2,m,m-2)',
    'הישר l: x=(1,2,3)+t(m-2,m,m+2)',
    'מישור π1: x+(m-2)y+(m-1)z-5=0',
    'הנקודה B על המישור (π2)',
    'הישר ℓ מקביל למישור π1',
    "התיבה ABCDA'B'C'D' גדולה",
    'הנקודה (1, 2, -3) בחלל',
    'הזווית α קטנה מ-β',
    'הוקטור u⃗ בכיוון ℓ',
    'הצלע AB = x² והשנייה ½',
  ];

  it.each(CORPUS)('no technical character is orphaned outside the isolate: %s', (s) => {
    const orphans = [...outside(s)].filter((c) => RUN_CORE.test(c));
    expect(orphans, `these were left for the RTL paragraph to reorder: ${JSON.stringify(orphans)}`).toEqual([]);
  });

  it.each(CORPUS)('no delimiter is separated from its partner: %s', (s) => {
    // A lone bracket outside the isolate is the visible defect: it is a NEUTRAL, so it takes the
    // paragraph direction, MIRRORS, and jumps to the far end of the row. The operator saw exactly this —
    // the `)` closing `t(…)` rendered as a `(` at the left edge of the fact list.
    const out = outside(s);
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      const opens = [...out].filter((c) => c === open).length;
      const closes = [...out].filter((c) => c === close).length;
      expect(opens, `an unmatched ${open} escaped the isolate in "${s}"`).toBe(closes);
    }
  });

  it('the operator’s line: the closing paren is INSIDE the isolate', () => {
    const out = isolateLtrRuns3('ישר l - x=(1,2,3)+t(m+2,m,m-2)');
    expect(out.endsWith(PDI), `the run must end at the paren, got ${JSON.stringify(out.slice(-4))}`).toBe(true);
  });

  it('a plane name is not split from its own digit', () => {
    const out = isolateLtrRuns3('מישור π1: x+(m-2)y+(m-1)z-5=0');
    expect(out).toContain(`${LRI}π1:`);
    expect(out.split(LRI).length - 1, 'π and 1 belong to ONE run').toBe(1);
  });

  it('the sentence’s OWN punctuation still stays outside — the property this must not trade away', () => {
    expect(isolateLtrRuns3('וכאן AB = 9.')).toBe(`וכאן ${LRI}AB = 9${PDI}.`);
    expect(isolateLtrRuns3('לא ניתן: AB = 9')).toBe(`לא ניתן: ${LRI}AB = 9${PDI}`);
    expect(isolateLtrRuns3('הצורה (ראו ABC) כאן')).toBe(`הצורה (ראו ${LRI}ABC${PDI}) כאן`);
  });
});

/**
 * The DRIFT LOCK — the actual root cause of round 2.
 *
 * `CORE` was hand-authored against a guessed alphabet while the palette grew independently in the JSX,
 * and nothing connected them: 13 of the 18 characters the tool OFFERS were missing from the class that
 * decides what belongs to a run, including every Greek letter and `ℓ` — the letters planes and lines are
 * NAMED with. Fixing π alone would have been the patch; this is the fix.
 */
describe('#482 — the bidi alphabet cannot drift from the palette the tool offers', () => {
  it('every character the symbol palette inserts is CORE or a run delimiter', () => {
    const holes = new Set<string>();
    for (const [, insert] of SYMBOL_PALETTE_3) {
      for (const ch of insert) if (!RUN_CORE.test(ch) && !RUN_DELIMS.includes(ch)) holes.add(ch);
    }
    expect(
      [...holes],
      'a palette button offers a character bidi does not know is technical — it will SPLIT the run it ' +
        'appears in. Add it to CORE in i18n/bidi.ts rather than deleting it here.',
    ).toEqual([]);
  });

  it('the palette still offers ∥ next to ⊥ (#493 — the parser accepts it, so it must be typeable)', () => {
    const inserts = SYMBOL_PALETTE_3.map(([, insert]) => insert);
    expect(inserts).toContain('∥');
    expect(inserts).toContain('⊥');
    // ASCII `||` is the MAGNITUDE insert and must never double as "parallel" — `|AB|` would go ambiguous.
    expect(inserts.filter((i) => i === '||'), 'exactly one owner of ASCII ||').toHaveLength(1);
  });
});

/**
 * #482 half (b) — the operator's ruling (2026-08-10): OPTION 3, the read-only live preview.
 *
 * The input box stays raw (isolates corrupt an editable value's caret; forced dir="ltr" is the reverted
 * 2-D #118). `inputPreview3` is the pure seam the App renders: the isolated text when isolation would
 * change the layout, null when the box already shows the truth — so the preview appears exactly when,
 * and only when, the box is lying.
 */
describe('#482(b) — the input preview appears exactly when the box lies about layout', () => {
  it.each([
    'ישר l2 : x=(m,2m,3)+t(1,1,1)',
    'הישר l: x=(1,2,3)+t(m-2,m,m+2)',
    'מישור π1: x+(m-2)y+(m-1)z-5=0',
    'B על המישור π2',
  ])('a mixed-direction line previews, isolated: %s', (s) => {
    const p = inputPreview3(s);
    expect(p, 'mixed He+math must preview').not.toBeNull();
    expect(p!).toContain(LRI);
    expect(p!.split(LRI).join('').split(PDI).join(''), 'the preview is the SAME text, laid out — never rewritten').toBe(s);
  });

  it('a pure-Hebrew line has no preview (the box already shows the truth)', () => {
    expect(inputPreview3('שרטטו קובייה גדולה')).toBeNull();
  });

  it('a pure-LTR line has no preview (an English session is unaffected)', () => {
    expect(inputPreview3('line l: x=(1,2,3)+t(m-2,m,m+2)')).toBeNull();
    expect(inputPreview3('')).toBeNull();
  });

  it('the preview container direction is decided by CONTENT, not by the first strong char (#118)', () => {
    // the 2-D lesson: «C במרחק…» starts with a strong-LTR label, but it is a Hebrew sentence.
    expect(textDir3('C במרחק 4 מהמישור')).toBe('rtl');
    expect(textDir3('line l: x=(1,2,3)')).toBe('ltr');
  });
});

/**
 * #482(b) round 2 — the operator typed and "got the same output as I type": mid-way through
 * «…+t(m-2,…» the text ends in `t(m-`, and the finished-sentence boundary rule left that `-` outside
 * the isolate — a neutral in an RTL paragraph, it jumped to the far left, and the preview reproduced
 * the box's lie at exactly the moment it exists to correct.
 *
 * The lock is a TYPING SIMULATION, not the one screenshot: at every prefix of the operator's line, the
 * preview must never leave a non-Hebrew tail dangling after the last isolate. The strict rule is a
 * property of finished sentences; a live line's tail is an incomplete run by definition.
 */
describe('#482(b) — the live-tail rule: no keystroke may dangle', () => {
  const LINE = 'הישר l: x=(1,2,3)+t(m-2,m,m+2)';

  it('every prefix of the operator’s line previews with the tail INSIDE the last isolate', () => {
    for (let n = 1; n <= LINE.length; n++) {
      const prefix = LINE.slice(0, n);
      const p = inputPreview3(prefix);
      if (p === null) continue; // no run yet — nothing to lay out
      const tail = p.slice(p.lastIndexOf(PDI) + 1);
      expect(
        tail === '' || HEBREW.test(tail),
        `at keystroke ${n} («${prefix}») the tail «${tail}» dangles outside the isolate`,
      ).toBe(true);
    }
  });

  it('the mid-typing moment from the screenshot: the trailing hyphen is covered', () => {
    const p = inputPreview3('הישר l: x=(1,2,3)+t(m-')!;
    expect(p.endsWith(PDI), 'the isolate must extend through the unfinished tail').toBe(true);
    expect(p.split(LRI).join('').split(PDI).join('')).toBe('הישר l: x=(1,2,3)+t(m-');
  });

  it('a Hebrew continuation after the run is NOT swallowed', () => {
    const p = inputPreview3('הישר l מקביל למישור');
    // runs isolated, Hebrew tail outside — the live-tail rule only claims a non-Hebrew tail
    if (p !== null) expect(HEBREW.test(p.slice(p.lastIndexOf(PDI) + 1))).toBe(true);
  });

  it('the FACT LIST keeps the strict finished-sentence rule — the live-tail rule is preview-only', () => {
    // a submitted sentence's trailing period stays outside (isolateLtrRuns3 is unchanged by this rule)
    expect(isolateLtrRuns3('וכאן AB = 9.')).toBe(`וכאן ${LRI}AB = 9${PDI}.`);
  });

  it('still byte-exact and still gated: pure-Hebrew and pure-LTR lines preview as null', () => {
    expect(inputPreview3('שרטטו קובייה')).toBeNull();
    expect(inputPreview3('line l: x=(1,2,3)+t(m-')).toBeNull();
  });
});
