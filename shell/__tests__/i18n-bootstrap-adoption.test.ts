/**
 * #2201 phase 0 — every builder boots its i18n through the ONE shared bootstrap, `shell/i18n.ts`
 * `createProductI18n`.
 *
 * Until phase 0, 2-D and 3-D each hand-rolled the i18next init (2-D on the global singleton), so the
 * suite's i18n policy (Hebrew default and fallback, he/en, no escaping, own instance per builder) was
 * written three times and could drift. This is a SOURCE-level guard in the style of the isolation test:
 * the roster is `products.json`, and each enabled builder's `<tree>/i18n/index.ts` must
 *   (a) import `createProductI18n` from `shell/i18n` and call it;
 *   (b) never init, create or configure an i18next instance itself (`.init(`, `.use(`, `createInstance`);
 *   (c) never import a VALUE from `i18next` (a type-only import is fine).
 *
 * Reading product files from a test is the `seam-registry.test.ts` pattern; `shell/` source still
 * imports no product.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const registry = JSON.parse(readFileSync(path.join(ROOT, 'products.json'), 'utf8')) as {
  products: { id: string; tree: string; enabled: boolean }[];
};
const builders = registry.products.filter((p) => p.enabled);

/** Every way a bootstrap file can fall short of "calls the shared bootstrap and nothing else". */
function bootstrapViolations(source: string, fileName = 'index.ts'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  let importsShared = false;
  let callsShared = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (/(^|\/)shell\/i18n$/.test(from) && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        if (clause.namedBindings.elements.some((e) => e.name.text === 'createProductI18n')) importsShared = true;
      }
      if (from === 'i18next' && clause && !clause.isTypeOnly) {
        const named = clause.namedBindings;
        const allTypeOnly =
          !clause.name && named !== undefined && ts.isNamedImports(named) && named.elements.every((e) => e.isTypeOnly);
        if (!allTypeOnly) out.push(`imports a value from 'i18next'`);
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'createProductI18n') callsShared = true;
      if (ts.isPropertyAccessExpression(callee) && ['init', 'use', 'createInstance'].includes(callee.name.text)) {
        out.push(`calls .${callee.name.text}( itself`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!importsShared) out.push(`does not import createProductI18n from shell/i18n`);
  if (!callsShared) out.push(`does not call createProductI18n`);
  return out;
}

describe('#2201 phase 0 — every builder boots i18n through shell/i18n createProductI18n', () => {
  it('the roster is read, not assumed (four enabled builders)', () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
  });

  for (const b of builders) {
    it(`${b.id}: ${b.tree}/i18n/index.ts calls the shared bootstrap and never inits i18next itself`, () => {
      const file = path.join(ROOT, b.tree, 'i18n', 'index.ts');
      expect(existsSync(file), `${b.tree}/i18n/index.ts exists`).toBe(true);
      expect(bootstrapViolations(readFileSync(file, 'utf8'), file)).toEqual([]);
    });
  }

  it('non-vacuity: the guard catches the hand-rolled bootstraps 2-D and 3-D had before phase 0', () => {
    const twoD = [
      "import i18n from 'i18next';",
      "import { initReactI18next } from 'react-i18next';",
      'i18n.use(initReactI18next).use(bidiPostProcessor).init({ lng: "he" });',
      'export default i18n;',
    ].join('\n');
    const threeD = [
      "import i18next from 'i18next';",
      'const i18n3d = i18next.createInstance();',
      'i18n3d.use(initReactI18next).init({ lng: "he" });',
      'export default i18n3d;',
    ].join('\n');
    for (const src of [twoD, threeD]) {
      const v = bootstrapViolations(src);
      expect(v).toContain(`imports a value from 'i18next'`);
      expect(v).toContain('calls .init( itself');
      expect(v).toContain('does not call createProductI18n');
    }
    expect(bootstrapViolations(threeD)).toContain('calls .createInstance( itself');
    // A type-only import stays legal.
    expect(
      bootstrapViolations(
        "import type { i18n } from 'i18next';\nimport { createProductI18n } from '../../shell/i18n';\nexport const x: i18n = createProductI18n({ resources: { he: {}, en: {} } });",
      ),
    ).toEqual([]);
  });
});
