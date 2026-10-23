/**
 * #1426 — the META-lock and the roster net for the privacy-disclosure checks (docs/28 §5c rule 5,
 * ADR-W-090).
 *
 * Four per-tree locks call `privacyDisclosureFaults` on their product's real declaration and real
 * bundle. This file proves those calls can FAIL: it runs the same function against deliberately
 * broken subjects, and runs the same scanner over a miniature tree whose wiring is known. The last
 * block reads the roster (`products.json`) so a fifth builder cannot ship without its own lock.
 *
 * Reading product files from a test is the `clean-export-registry-1391` pattern; `shell/` SOURCE
 * still imports no product.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DATA_SINKS, type DataSink, type PrivacyDeclaration } from '../frame/privacy';
import {
  REPO_ROOT,
  SINK_OF_ENDPOINT,
  SINK_SENTENCE,
  describesSink,
  entryOf,
  privacyDisclosureFaults,
  registryProducts,
  scanWiring,
  type WiringScan,
} from './fixtures/privacy-disclosure-rows';

/** A scan as if the bundle reached `sinks` (through their endpoints) and walked into `tree/`. */
function fakeScan(sinks: DataSink[], extra: Partial<WiringScan> = {}): WiringScan {
  const endpoints = new Map<string, string>();
  for (const s of sinks) {
    const name = Object.keys(SINK_OF_ENDPOINT).find((k) => SINK_OF_ENDPOINT[k] === s)!;
    endpoints.set(name, 'stub/wire.ts');
  }
  return { files: ['stub/main.tsx', 'stub/App.tsx'], endpoints, sinks: new Set(sinks), unclassified: [], ...extra };
}
/**
 * One sentence per sink, per locale, in the shipped notes' words (2-D's, at 77992ff8), with the bidi
 * isolates the real notes carry around the number. A synthetic note is these sentences, so the
 * #1426 rows below see a note whose text matches its list (#2203).
 */
const SENTENCE: Record<'he' | 'en', Record<DataSink, string>> = {
  he: {
    'usage-log': 'לצורך שיפור הכלי נשמרות ההוראות שהוקלדו (טקסט מתמטי בלבד) עם מזהה מבקר אנונימי — ללא כתובת ה-\u2066IP\u2069 — עד \u206630\u2069 יום.',
    llm: 'משפטים שהכלי לא הבין נשלחים לעיבוד בשירות בינה מלאכותית חיצוני.',
    'share-store': 'כשאתם לוחצים «העתק קישור», השרטוט ותמונה שלו נשמרים בשרת כדי שהקישור יעבוד.',
  },
  en: {
    'usage-log': 'To improve the tool, typed instructions (math text only) are kept for up to 30 days with an anonymous visitor id.',
    llm: 'Statements the tool does not understand are sent for processing to an external AI service.',
    'share-store': 'When you press “Copy link”, the figure and a picture of it are stored on the server so the link can work.',
  },
};
const noteText = (loc: 'he' | 'en', sinks: ReadonlyArray<DataSink>) =>
  [loc === 'he' ? 'פרטיות: אין הרשמה.' : 'Privacy: no sign-up.', ...sinks.map((x) => SENTENCE[loc][x])].join(' ');
const note = (discloses: DataSink[], text?: string): Record<string, PrivacyDeclaration> => ({
  he: { text: text ?? noteText('he', discloses), discloses },
  en: { text: text ?? noteText('en', discloses), discloses },
});

describe('#1426 — the privacy rows really check', () => {
  it('a note that declares exactly what is wired reports no faults', () => {
    expect(privacyDisclosureFaults({ declarations: note(['usage-log', 'llm']), scan: fakeScan(['usage-log', 'llm']), tree: 'stub' })).toEqual([]);
  });

  it('CATCHES a wired sink the note does not declare (the analytic report)', () => {
    const f = privacyDisclosureFaults({ declarations: note(['share-store']), scan: fakeScan(['usage-log', 'llm', 'share-store']), tree: 'stub' });
    expect(f.join(' | ')).toMatch(/WIRES 'usage-log'.*does not declare/);
    expect(f.join(' | ')).toMatch(/WIRES 'llm'.*does not declare/);
  });

  it('CATCHES a declared sink nothing wires (an over-claiming note)', () => {
    const f = privacyDisclosureFaults({ declarations: note(['llm', 'share-store']), scan: fakeScan(['share-store']), tree: 'stub' });
    expect(f.join(' | ')).toMatch(/DECLARES 'llm' but nothing/);
  });

  it('CATCHES an endpoint no one has classified', () => {
    const f = privacyDisclosureFaults({ declarations: note([]), scan: fakeScan([], { unclassified: ['api/telemetry (x.ts)'] }), tree: 'stub' });
    expect(f.join(' | ')).toMatch(/api\/telemetry.*does not classify/);
  });

  it('CATCHES two sentences glued with no space — the exact join analytic shipped', () => {
    const shipped = 'המשפטים שאתם מקלידים נשמרים בדפדפן שלכם.' + 'כשאתם לוחצים «העתק קישור»';
    const f = privacyDisclosureFaults({ declarations: note([], shipped), scan: fakeScan([]), tree: 'stub' });
    expect(f.join(' | ')).toMatch(/glued with no space/);
  });

  it('CATCHES an empty note, and a subject with no declaration at all', () => {
    expect(privacyDisclosureFaults({ declarations: note([], '  '), scan: fakeScan([]), tree: 'stub' }).join(' | ')).toMatch(/is empty/);
    expect(privacyDisclosureFaults({ declarations: {}, scan: fakeScan([]), tree: 'stub' }).join(' | ')).toMatch(/checked nothing/);
  });

  it('CATCHES a scan that resolved nothing — an empty wired set must not read as "no sinks"', () => {
    const f = privacyDisclosureFaults({ declarations: note([]), scan: fakeScan([], { files: ['stub/main.tsx'] }), tree: 'stub' });
    expect(f.join(' | ')).toMatch(/resolved nothing/);
  });

  it('every sink has at least one endpoint in the table — no sink is undetectable by construction', () => {
    for (const s of DATA_SINKS) expect(Object.values(SINK_OF_ENDPOINT), s).toContain(s);
  });
});

describe('#2203 — the note TEXT is held to the sinks it declares, both ways (ADR-W-090 Am. 1)', () => {
  const all = [...DATA_SINKS];
  const faultsOf = (declarations: Record<string, PrivacyDeclaration>, wired: DataSink[]) =>
    privacyDisclosureFaults({ declarations, scan: fakeScan(wired), tree: 'stub' });

  it('a note with one sentence per declared sink, and no other, reports no faults (every subset)', () => {
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const sinks = all.filter((_, i) => mask & (1 << i));
      expect(faultsOf(note(sinks), sinks), sinks.join(',') || '(none)').toEqual([]);
    }
  });

  for (const sink of DATA_SINKS) {
    it(`CATCHES a note that declares '${sink}' but has no sentence about it — in each locale`, () => {
      for (const loc of ['he', 'en'] as const) {
        const d = note(all);
        d[loc] = { text: noteText(loc, all.filter((x) => x !== sink)), discloses: all };
        expect(faultsOf(d, all)).toEqual([`[${loc}] DECLARES '${sink}' but the note has no sentence about it`]);
      }
    });

    it(`CATCHES a note that describes '${sink}' without declaring it (an over-claiming text)`, () => {
      const rest = all.filter((x) => x !== sink);
      for (const loc of ['he', 'en'] as const) {
        const d = note(rest);
        d[loc] = { text: noteText(loc, all), discloses: rest };
        expect(faultsOf(d, rest)).toEqual([`[${loc}] the note describes '${sink}', which this product does not declare`]);
      }
    });
  }

  it("CATCHES complex's note with an AI sentence added — complex declares no 'llm'", () => {
    const complexHe =
      'פרטיות: אין הרשמה ולא נאספים פרטים אישיים. ' + SENTENCE.he['usage-log'] + ' העבודה נשמרת בדפדפן שלכם ובקבצים שאתם בוחרים לשמור. ' + SENTENCE.he['share-store'];
    const sinks: DataSink[] = ['usage-log', 'share-store'];
    const ok = { he: { text: complexHe, discloses: sinks }, en: note(sinks).en };
    expect(faultsOf(ok, sinks)).toEqual([]);
    const added = { ...ok, he: { text: `${complexHe} ${SENTENCE.he.llm}`, discloses: sinks } };
    expect(faultsOf(added, sinks)).toEqual(["[he] the note describes 'llm', which this product does not declare"]);
  });

  it('half a sentence is not the sentence: «העתק קישור» without «נשמרים בשרת» does not describe the share store', () => {
    expect(describesSink('כשאתם לוחצים «העתק קישור», הקישור מועתק.', 'share-store', 'he')).toBe(false);
  });

  it('the bidi isolates around the number do not hide the retention sentence', () => {
    expect(SENTENCE.he['usage-log']).toMatch(/\u2066/);
    expect(describesSink(SENTENCE.he['usage-log'], 'usage-log', 'he')).toBe(true);
  });

  it('CATCHES a locale with no recogniser — an unchecked text must not pass as checked', () => {
    const f = faultsOf({ fr: { text: 'Une note.', discloses: [] } }, []);
    expect(f).toEqual(['[fr] SINK_SENTENCE has no recogniser for this locale — the note\'s text was not checked']);
  });

  it('every sink has a recogniser in both locales — the table is complete by type and by value', () => {
    for (const s of DATA_SINKS) for (const loc of ['he', 'en'] as const) expect(SINK_SENTENCE[s][loc].length, `${s}/${loc}`).toBeGreaterThan(0);
  });
});

describe('#1426 — the wiring scanner measures a known miniature bundle', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'privacy-scan-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const put = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  put(
    'p/main.tsx',
    [
      "import { a } from './a';",
      "import { unused } from 'some-package';",
      "export { b } from './sub';",
      'void a; void unused;',
      "void import('./lazy');",
      "new Worker(new URL('./worker.ts', import.meta.url));",
    ].join('\n'),
  );
  // a comment naming an endpoint wires nothing; a template literal does
  put('p/a.ts', '// posts to /api/log in production\nexport const a = (base: string) => fetch(`${base}api/parse`);\n');
  put('p/sub/index.ts', "export const b = '/api/config';\n");
  put('p/lazy.ts', "export const s = (base: string) => `${base}api/share`;\n");
  put('p/worker.ts', "export const w = 'x/api/telemetry';\n");
  put('p/orphan.ts', "export const o = '/api/log'; // on disk, never imported\n");

  const scan = scanWiring([path.join(dir, 'p/main.tsx')], dir);

  it('follows static, re-export, dynamic and worker edges — and nothing else', () => {
    expect(scan.files).toEqual(['p/a.ts', 'p/lazy.ts', 'p/main.tsx', 'p/sub/index.ts', 'p/worker.ts']);
  });
  it('finds the sinks in literals only: llm and share-store, never the commented or orphaned log', () => {
    expect([...scan.sinks].sort()).toEqual(['llm', 'share-store']);
  });
  it('flags the unclassified endpoint and not the named non-sink', () => {
    expect(scan.unclassified).toEqual(['api/telemetry (p/worker.ts)']);
    expect(scan.endpoints.has('config')).toBe(true);
  });
});

describe('#1426 — every registered builder carries its privacy lock (the roster, not a list)', () => {
  const builders = registryProducts().filter((p) => p.enabled);

  it('the roster is read, not assumed', () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
  });

  for (const p of builders) {
    it(`${p.id}: its tree has a lock that runs the shared suite for '${p.id}'`, () => {
      const lock = path.join(REPO_ROOT, p.tree, '__tests__', 'privacy-disclosure-1426.test.ts');
      expect(existsSync(lock), `${p.tree}/__tests__/privacy-disclosure-1426.test.ts is missing`).toBe(true);
      expect(readFileSync(lock, 'utf8')).toContain(`privacyDisclosureSuite('${p.id}'`);
    });
    it(`${p.id}: its bundle entry resolves and the scan walks into ${p.tree}/`, () => {
      const scan = scanWiring([entryOf(p.id)]);
      expect(scan.files.filter((f) => f.startsWith(`${p.tree}/`)).length).toBeGreaterThan(10);
    });
  }
});
