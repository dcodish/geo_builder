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
const note = (discloses: DataSink[], text = 'A note. Another sentence.'): Record<string, PrivacyDeclaration> => ({
  he: { text, discloses },
  en: { text, discloses },
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
