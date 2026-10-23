import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs tool script; there are no types to import and none are wanted.
import { codeTable, findMessage, formatResult, INLINE_BASELINE, REPO_ROOT } from '../lib/find-message-core.mjs';

/**
 * #2201 phase 4 — `npm run find-message`: one command finds any message, wherever it lives. Each lock is a place a
 * sentence can live; the tool is only worth running if it never comes back empty for one of them.
 */
type Row = { file: string; key: string; value: string };
type Result = { rows: Row[]; codes: { code: string; keys: string[] }[] };
const find = (q: string) => findMessage(q) as Promise<Result>;

describe('#2201 phase 4 — find-message', () => {
  it('a suite.* value is found once, in shell/ — never again under a product that merges it', async () => {
    const he = JSON.parse(readFileSync(join(REPO_ROOT, 'shell/locales/he.json'), 'utf8'));
    const label: string = he.suite.about.label;
    const { rows } = await find(label);
    const own = rows.filter((r) => r.key === 'suite.about.label');
    expect(own).toEqual([{ file: 'shell/locales/he.json', key: 'suite.about.label', value: label }]);

    // the whole class: every suite.* key any table reports sits in shell/ (the TS tables' suite merge is stubbed out)
    const suite = (await find('suite.')).rows.filter((r) => r.key.startsWith('suite.'));
    expect(suite.length).toBeGreaterThan(20);
    expect(suite.filter((r) => !r.file.startsWith('shell/'))).toEqual([]);
  });

  it('a product-only key is found in its product, in both languages, and nowhere else', async () => {
    const analytic = (await find('unstatedTitle')).rows.filter((r) => r.key === 'unstatedTitle');
    expect(analytic.map((r) => r.file).sort()).toEqual(['src-analytic/i18n/index.ts [en]', 'src-analytic/i18n/index.ts [he]']);
    expect(analytic.find((r) => r.file.endsWith('[he]'))?.value).toMatch(/[֐-׿]/);

    const complex = (await find('המדריך — מספרים מרוכבים')).rows;
    expect(complex).toContainEqual({ file: 'src-complex/i18n/index.ts [he]', key: 'manualTitle', value: 'המדריך — מספרים מרוכבים' });

    const twoD = (await find('values.queryTitle')).rows.filter((r) => r.key === 'values.queryTitle');
    expect(twoD.map((r) => r.file).sort()).toEqual(['src/i18n/locales/en.json', 'src/i18n/locales/he.json']);
  });

  it('a known inline literal from the ratchet baseline is found in its .ts file', async () => {
    const baseline: Record<string, number> = JSON.parse(readFileSync(join(REPO_ROOT, INLINE_BASELINE), 'utf8'));
    const file = 'src-complex/ui/manual.ts';
    expect(baseline[file]).toBeGreaterThan(0);
    // the first quoted Hebrew literal in it, read from the file (not hard-coded: the tool must find what is there)
    const literal = readFileSync(join(REPO_ROOT, file), 'utf8').match(/'([^'\n]*[֐-׿][^'\n]*)'/)?.[1];
    expect(literal).toBeTruthy();
    const { rows } = await find(literal!);
    expect(rows.some((r) => r.file.startsWith(`${file}:`) && r.key === '(inline)' && r.value.includes(literal!))).toBe(true);
  });

  it('a 2-D engine refusal is found by its CODE, with the keys it renders and their sentences', async () => {
    const { rows, codes } = await find('metric-impossible');
    expect(codes).toContainEqual({ code: 'metric-impossible', keys: ['errors.metricImpossibleTriangle', 'errors.metricImpossiblePath'] });
    expect(rows.some((r) => r.file === 'src/i18n/locales/he.json' && r.key === 'errors.metricImpossibleTriangle')).toBe(true);

    // and the reverse: a 2-D key names the code that renders it
    expect((await find('errors.sameSpot')).codes.map((c) => c.code)).toContain('same-spot');
    // a code with no ruled sentence says so
    expect(formatResult(await find('lines-parallel'))).toContain('code lines-parallel → (the floor: no ruled sentence)');
  });

  it('the code table is total: every EngineError variant has a row', () => {
    const union = readFileSync(join(REPO_ROOT, 'src/engine/errors.ts'), 'utf8');
    const declared = [...union.matchAll(/\|\s*\{\s*code:\s*'([\w-]+)'/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(40);
    expect(Object.keys(codeTable()).sort()).toEqual([...new Set(declared)].sort());
  });
});
