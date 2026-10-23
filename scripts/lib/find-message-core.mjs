/**
 * #2201 phase 4 — ONE COMMAND FINDS ANY MESSAGE: the search half of `npm run find-message -- "<text or key>"`.
 *
 * A sentence a student reads lives in one of four kinds of place, and before this tool finding it meant knowing
 * which one in advance:
 *   1. a JSON locale table — 2-D `src/i18n/locales`, 3-D `src3d/i18n/locales`, the suite's `shell/locales`;
 *   2. a TS locale table — the `he`/`en` objects of `src-analytic/i18n/index.ts` and `src-complex/i18n/index.ts`.
 *      They STAY TypeScript (their per-key comments record operator rulings a JSON conversion would delete), so they
 *      are loaded by an import: esbuild (a declared devDependency) bundles the module in memory with the shell's
 *      i18n bootstrap and the suite tables stubbed out, so what comes back is the product's OWN table and a
 *      `suite.*` key is reported once, in `shell/` (where it lives — ADR-W-148), never again under each product;
 *   3. an inline literal in code — the files the inline-Hebrew ratchet still allows
 *      (`shell/__tests__/fixtures/inline-hebrew-baseline.json`, ADR-W-153), grepped line by line;
 *   4. a 2-D engine refusal CODE (the error bank, ADR-756) — `src/i18n/humanizeError.ts`'s `wordingOf` switch is
 *      read with the TypeScript compiler API, so `metric-impossible` prints the keys it renders.
 *
 * Every match is a row `file · key · value`; a match is case-insensitive and a SUBSTRING of the key or the value.
 * No I/O beyond reading the repo; the CLI (`scripts/find-message.mjs`) prints. Tested by
 * `scripts/__tests__/find-message.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The JSON locale tables (every `<lang>.json` in each folder). */
export const JSON_LOCALE_DIRS = ['shell/locales', 'src/i18n/locales', 'src3d/i18n/locales'];
/** The TS locale tables: modules whose top-level `const he` / `const en` are the product's table. */
export const TS_LOCALE_MODULES = ['src-analytic/i18n/index.ts', 'src-complex/i18n/index.ts'];
/** The inline-Hebrew ratchet's baseline: the code files still allowed to carry inline text. */
export const INLINE_BASELINE = 'shell/__tests__/fixtures/inline-hebrew-baseline.json';
/** Where the 2-D engine's codes are mapped to their wording keys. */
export const CODE_SWITCH = 'src/i18n/humanizeError.ts';

const LANGS = ['he', 'en'];

/** `{ a: { b: 'x' } }` → `[['a.b', 'x']]` — i18next's dotted key path. */
export function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key));
    else out.push([key, Array.isArray(v) ? v.join(' | ') : String(v)]);
  }
  return out;
}

/** Every JSON table entry: `{ file, key, value }`. */
export function jsonEntries(root = REPO_ROOT) {
  const rows = [];
  for (const dir of JSON_LOCALE_DIRS) {
    for (const lang of LANGS) {
      const file = `${dir}/${lang}.json`;
      const abs = join(root, file);
      if (!existsSync(abs)) continue;
      for (const [key, value] of flatten(JSON.parse(readFileSync(abs, 'utf8')))) rows.push({ file, key, value });
    }
  }
  return rows;
}

/**
 * Import a TS locale module and return its own `he`/`en` tables. The module only exports the i18n instance built by
 * `createProductI18n({ resources: { he: { ...suiteHe, ...he }, … } })`, so the bootstrap is stubbed to hand its
 * options back and the suite JSON to `{}`: `resources.he` is then exactly the product's `he` (no i18next runs).
 */
export async function loadTsTable(rel, root = REPO_ROOT) {
  const stub = {
    name: 'find-message-stubs',
    setup(b) {
      b.onResolve({ filter: /shell[\\/]i18n(\.ts)?$/ }, (a) => ({ path: a.path, namespace: 'fm-i18n' }));
      b.onResolve({ filter: /shell[\\/]locales[\\/].*\.json$/ }, (a) => ({ path: a.path, namespace: 'fm-suite' }));
      b.onLoad({ filter: /.*/, namespace: 'fm-i18n' }, () => ({ contents: 'export const createProductI18n = (o) => o;', loader: 'js' }));
      b.onLoad({ filter: /.*/, namespace: 'fm-suite' }, () => ({ contents: 'export default {};', loader: 'js' }));
    },
  };
  const out = await build({
    entryPoints: [join(root, rel)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [stub],
  });
  const code = out.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const instance = Object.values(mod).find((v) => v && typeof v === 'object' && v.resources && v.resources.he);
  if (!instance) throw new Error(`find-message: no createProductI18n({ resources }) export in ${rel}`);
  return instance.resources;
}

/** Every TS table entry: `{ file: 'src-analytic/i18n/index.ts [he]', key, value }`. */
export async function tsEntries(root = REPO_ROOT) {
  const rows = [];
  for (const rel of TS_LOCALE_MODULES) {
    const resources = await loadTsTable(rel, root);
    for (const lang of LANGS)
      for (const [key, value] of flatten(resources[lang])) rows.push({ file: `${rel} [${lang}]`, key, value });
  }
  return rows;
}

/** The ratchet-allowed inline files, one row per line that matches: `{ file: 'path:line', key: '(inline)', value }`. */
export function inlineMatches(query, root = REPO_ROOT) {
  const q = query.toLowerCase();
  const baseline = JSON.parse(readFileSync(join(root, INLINE_BASELINE), 'utf8'));
  const rows = [];
  for (const file of Object.keys(baseline)) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    readFileSync(abs, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (line.toLowerCase().includes(q)) rows.push({ file: `${file}:${i + 1}`, key: '(inline)', value: line.trim() });
      });
  }
  return rows;
}

const KEY_SHAPE = /^(errors|input)\.[\w.]+$/;

/**
 * The 2-D engine's refusal codes → the translation keys each one can render, read from `wordingOf`'s switch.
 * A clause's keys are its wording's (`WORDINGS[id].keys ?? [key]`) plus every key literal it names (a nested reason,
 * a pick among several); a template key (`errors.ngonDefinite.${n}`) reads `errors.ngonDefinite.*`. A clause that
 * returns `null` renders the floor (`[]`). Fall-through labels share their clause.
 */
export function codeTable(root = REPO_ROOT) {
  const src = ts.createSourceFile(CODE_SWITCH, readFileSync(join(root, CODE_SWITCH), 'utf8'), ts.ScriptTarget.Latest, true);
  const wordings = {};
  let switchNode;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(src) === 'WORDINGS') {
      let init = n.initializer;
      while (init && !ts.isObjectLiteralExpression(init)) init = init.expression;
      for (const p of init?.properties ?? []) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        let key;
        let keys;
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q)) continue;
          const name = q.name.getText(src);
          if (name === 'keys' && ts.isArrayLiteralExpression(q.initializer)) keys = q.initializer.elements.filter(ts.isStringLiteral).map((e) => e.text);
          if (name === 'key' && ts.isStringLiteral(q.initializer)) key = q.initializer.text;
        }
        // the wording's own rule: `keys` (when it picks among several) or its one `key`
        wordings[p.name.getText(src)] = keys ?? (key ? [key] : []);
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'wordingOf') {
      const find = (m) => (ts.isSwitchStatement(m) ? m : ts.forEachChild(m, find));
      switchNode = find(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  if (!switchNode) throw new Error(`find-message: no wordingOf switch in ${CODE_SWITCH}`);

  const table = {};
  let pending = [];
  for (const clause of switchNode.caseBlock.clauses) {
    if (!ts.isCaseClause(clause)) continue;
    if (ts.isStringLiteral(clause.expression)) pending.push(clause.expression.text);
    if (clause.statements.length === 0) continue;
    const keys = new Set();
    const walk = (m) => {
      if (ts.isCallExpression(m) && m.expression.getText(src) === 'one' && m.arguments[0] && ts.isStringLiteral(m.arguments[0]))
        for (const k of wordings[m.arguments[0].text] ?? []) keys.add(k);
      if ((ts.isStringLiteral(m) || ts.isNoSubstitutionTemplateLiteral(m)) && KEY_SHAPE.test(m.text)) keys.add(m.text);
      if (ts.isTemplateExpression(m) && /^(errors|input)\./.test(m.head.text)) keys.add(`${m.head.text}*`);
      ts.forEachChild(m, walk);
    };
    clause.statements.forEach(walk);
    for (const code of pending) table[code] = [...keys];
    pending = [];
  }
  return table;
}

/** Does a key (possibly a `prefix.*` pattern from {@link codeTable}) cover `key`? */
const covers = (pattern, key) => (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : pattern === key);

/**
 * Search everything. Returns `{ rows, codes }`: `rows` are `{ file, key, value }` table and inline matches; `codes`
 * are `{ code, keys }` for every engine code whose NAME matches, or that renders a matched 2-D key. When a code's
 * name matches, the 2-D rows of the keys it renders are added too, so a code prints the sentence it shows.
 */
export async function findMessage(query, root = REPO_ROOT) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) throw new Error('find-message: give a text or a key to search for');
  const tables = [...jsonEntries(root), ...(await tsEntries(root))];
  const hit = (r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q);
  const rows = tables.filter(hit);

  const twoD = (r) => r.file.startsWith('src/i18n/locales/');
  const matched2dKeys = new Set(rows.filter(twoD).map((r) => r.key));
  const codes = [];
  for (const [code, keys] of Object.entries(codeTable(root))) {
    const byName = code.toLowerCase().includes(q);
    if (!byName && !keys.some((p) => [...matched2dKeys].some((k) => covers(p, k)))) continue;
    codes.push({ code, keys });
    if (byName)
      for (const r of tables)
        if (twoD(r) && keys.some((p) => covers(p, r.key)) && !rows.includes(r)) rows.push(r);
  }
  rows.push(...inlineMatches(q, root));
  return { rows, codes };
}

/** The printed form: one `file · key · value` line per row, the code mappings first. */
export function formatResult({ rows, codes }) {
  const lines = [];
  for (const { code, keys } of codes)
    lines.push(`${CODE_SWITCH} · code ${code} → ${keys.length ? keys.join(', ') : '(the floor: no ruled sentence)'}`);
  for (const r of rows) lines.push(`${r.file} · ${r.key} · ${r.value}`);
  if (lines.length === 0) lines.push('no match');
  return lines.join('\n');
}
