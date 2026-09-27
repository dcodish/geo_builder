/**
 * The cross-product checks for the PRIVACY NOTE (#1426, ADR-W-090), written per docs/28 §5c.
 *
 * Analytic's note told students «המשפטים שאתם מקלידים נשמרים בדפדפן שלכם» for five days after its
 * usage log went live (#1243), and none of the three AI-using builders said that unrecognised
 * statements go to an external AI service. The class: **the note is prose and the sinks are code,
 * and nothing held one to the other.** Each product now declares its note as
 * `{ text, discloses }` (`shell/frame/privacy.ts`); these rows hold `discloses` to the product's real
 * wiring.
 *
 * ## What "real wiring" means here
 *
 * The WIRED set is measured, never listed: starting from the product's own entry (products.json →
 * its `devUrl` page → that page's `<script type="module" src>`), the scanner walks every import the
 * bundle can reach — static, dynamic, re-exports, and `new URL(…, import.meta.url)` workers, across
 * the product tree AND `shell/` — and collects the server endpoints (`…api/<name>`) that appear in
 * STRING or TEMPLATE literals. Comments do not count (2-D's session log mentions `/api/parse` in a
 * comment and reaches no model). Reachability rather than "the file exists" is the point: a module
 * that is on disk but not bundled sends nothing, and a sink moved to a new file is still found.
 *
 * Every reached endpoint must be CLASSIFIED — a data sink, or a named non-sink. A new endpoint no
 * one has classified fails, because "not in the table" must never read as "carries no student data".
 *
 * ## The rows
 *
 *  - every wired sink is declared (wiring one you did not declare fails);
 *  - every declared sink is wired (declaring one you do not have fails — an over-claiming note is
 *    also a false note, and it hides the next real change);
 *  - every reached endpoint is classified;
 *  - the note's text exists in every locale and no two sentences are glued together (the
 *    `'…שלכם.' + 'כשאתם…'` join both analytic and complex shipped);
 *  - the scan was EXERCISED: it reached the product's own tree beyond its entry. A scanner that
 *    silently resolves nothing would otherwise pass every product with an empty wired set.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DATA_SINKS, type DataSink, type PrivacyDeclaration } from '../../frame/privacy';

export const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * THE ENDPOINT TABLE — every `api/<name>` any product may reach, classified once. `null` is a named
 * NON-sink: it sends no student input. A new endpoint is a privacy decision and lands here first.
 */
export const SINK_OF_ENDPOINT: Readonly<Record<string, DataSink | null>> = {
  log: 'usage-log', // server/eventLog — typed statements, a few days, salted visitor hash
  parse: 'llm', // the model proxy — the unrecognised statement goes to an external AI service
  share: 'share-store', // «העתק קישור» — the figure and its picture are stored for the short link
  config: null, // GET the operator's per-tool config; sends only the tool id
};

/** A server endpoint as it appears in a literal: `api/x` at the start or after a `/`. */
const ENDPOINT = /(?:^|\/)api\/([A-Za-z][\w-]*)/g;

export interface WiringScan {
  /** Every source file the entry reaches, repo-relative with `/`. */
  files: string[];
  /** Every endpoint reached, with the first file that names it. */
  endpoints: Map<string, string>;
  /** The data sinks those endpoints are. */
  sinks: Set<DataSink>;
  /** Endpoints the table does not classify. */
  unclassified: string[];
}

function resolveSpec(fromFile: string, spec: string, root: string): string | null {
  const bare = spec.split('?')[0];
  let base: string;
  if (bare.startsWith('@/')) base = path.join(root, 'src', bare.slice(2));
  else if (bare.startsWith('.')) base = path.resolve(path.dirname(fromFile), bare);
  else return null; // a package — not ours to send anything on the product's behalf
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of candidates) if (/\.tsx?$/.test(c) && existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Walk the import graph from `entryFiles` (absolute paths) and collect the reached endpoints. */
export function scanWiring(entryFiles: string[], root: string = REPO_ROOT): WiringScan {
  const seen = new Set<string>();
  const endpoints = new Map<string, string>();
  const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');

  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const noteLiteral = (text: string) => {
      for (const m of text.matchAll(ENDPOINT)) if (!endpoints.has(m[1])) endpoints.set(m[1], rel(file));
    };
    const walk = (n: ts.Node): void => {
      let spec: string | undefined;
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        spec = n.moduleSpecifier.text;
      } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        spec = n.arguments[0].text;
      } else if (
        ts.isNewExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'URL' &&
        n.arguments?.[0] &&
        ts.isStringLiteral(n.arguments[0]) &&
        n.arguments[1]?.getText(sf) === 'import.meta.url'
      ) {
        spec = n.arguments[0].text; // a worker/asset bundled beside the module
      }
      if (spec !== undefined) {
        const r = resolveSpec(file, spec, root);
        if (r) visit(r);
        return;
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) noteLiteral(n.text);
      else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) noteLiteral(n.text);
      ts.forEachChild(n, walk);
    };
    walk(sf);
  };
  for (const e of entryFiles) visit(e);

  const sinks = new Set<DataSink>();
  const unclassified: string[] = [];
  for (const [name, where] of endpoints) {
    if (!(name in SINK_OF_ENDPOINT)) unclassified.push(`api/${name} (${where})`);
    else {
      const s = SINK_OF_ENDPOINT[name];
      if (s) sinks.add(s);
    }
  }
  return { files: [...seen].map(rel).sort(), endpoints, sinks, unclassified };
}

interface RegistryProduct {
  id: string;
  tree: string;
  devUrl: string;
  enabled: boolean;
}

export function registryProducts(root: string = REPO_ROOT): RegistryProduct[] {
  return (JSON.parse(readFileSync(path.join(root, 'products.json'), 'utf8')) as { products: RegistryProduct[] }).products;
}

/** The product's bundle entry, read from its page — the same place Vite starts. */
export function entryOf(productId: string, root: string = REPO_ROOT): string {
  const p = registryProducts(root).find((x) => x.id === productId);
  if (!p) throw new Error(`privacy lock: product '${productId}' is not in products.json`);
  const page = p.devUrl === '/' ? 'index.html' : p.devUrl.replace(/^\//, '');
  const html = readFileSync(path.join(root, page), 'utf8');
  const m = html.match(/<script[^>]*type="module"[^>]*src="\/([^"]+)"/);
  if (!m) throw new Error(`privacy lock: ${page} has no module script`);
  return path.join(root, m[1]);
}

export interface PrivacySubject {
  /** The declaration the product hands `AppFrame`, built once per locale through its real i18n. */
  declarations: Record<string, PrivacyDeclaration>;
  /** What the product's bundle really reaches. */
  scan: WiringScan;
  /** The product's tree (`src-analytic`) — the exercised-scan row checks the walk entered it. */
  tree: string;
}

/** A sentence end glued to the next sentence's first letter: `…שלכם.כשאתם…`, `…browser.When…`. */
const GLUED = /[.!?;:](?=\p{L})/u;

/** Every violated property, named. Empty array = the product's note matches its wiring. */
export function privacyDisclosureFaults(s: PrivacySubject): string[] {
  const faults: string[] = [];
  const locales = Object.keys(s.declarations);
  if (locales.length === 0) faults.push('no declaration was supplied — the lock checked nothing');

  // the scan was exercised: it entered the product's own tree beyond the entry file
  const own = s.scan.files.filter((f) => f.startsWith(`${s.tree}/`));
  if (own.length < 2) faults.push(`the wiring scan reached ${own.length} file(s) of ${s.tree}/ — it resolved nothing, so it proves nothing`);

  for (const u of s.scan.unclassified) {
    faults.push(`reaches ${u}, which SINK_OF_ENDPOINT does not classify — decide whether it carries student input`);
  }

  for (const loc of locales) {
    const d = s.declarations[loc];
    for (const x of d.discloses) {
      if (!(DATA_SINKS as ReadonlyArray<string>).includes(x)) faults.push(`[${loc}] declares an unknown sink '${x}'`);
    }
    for (const sink of s.scan.sinks) {
      if (!d.discloses.includes(sink)) {
        const via = [...s.scan.endpoints].find(([name]) => SINK_OF_ENDPOINT[name] === sink);
        faults.push(`[${loc}] WIRES '${sink}' (api/${via?.[0]} in ${via?.[1]}) but the privacy note does not declare it`);
      }
    }
    for (const x of d.discloses) {
      if (!s.scan.sinks.has(x)) faults.push(`[${loc}] DECLARES '${x}' but nothing the bundle reaches wires it`);
    }
    if (d.text.trim().length === 0) faults.push(`[${loc}] the privacy note is empty`);
    const glued = d.text.match(GLUED);
    if (glued) {
      const at = glued.index ?? 0;
      faults.push(`[${loc}] two sentences are glued with no space: «…${d.text.slice(Math.max(0, at - 12), at + 12)}…»`);
    }
  }
  return faults;
}

/** The per-tree lock: one row, so a failure names every fault at once. */
export function privacyDisclosureSuite(productId: string, declare: (locale: string) => PrivacyDeclaration): void {
  const product = registryProducts().find((p) => p.id === productId);
  describe(`#1426 — ${productId}'s privacy note declares exactly what it wires (ADR-W-090)`, () => {
    it('the product is registered', () => {
      expect(product, `'${productId}' is not in products.json`).toBeDefined();
    });
    it('declared sinks == wired sinks, in every locale, and the note reads as sentences', () => {
      const scan = scanWiring([entryOf(productId)]);
      const declarations = { he: declare('he'), en: declare('en') };
      expect(privacyDisclosureFaults({ declarations, scan, tree: product!.tree })).toEqual([]);
    });
  });
}
