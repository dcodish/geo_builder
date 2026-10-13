import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs tool script; there are no types to import and none are wanted.
import { isParseUrl, ledgerProblems, modelStubAnswer, NOT_CONFIGURED, validateModelAnswers } from '../lib/model-stub.mjs';
// @ts-expect-error — as above.
import { caseVerdict, validateSheet } from '../lib/play-sheet-core.mjs';

/**
 * #1955 (ADR-W-127) — no script reaches the live model.
 *
 * The pre-play driver and the visual smoke typed lines into a dev server whose `/api/parse` is a
 * live Anthropic call when `.env.local` holds a key; a line the grammar did not read was therefore
 * a model call nobody authorised (CLAUDE.md rule 2 — 18 of them on 2026-10-09). The fix has three
 * parts, each locked here: the stub's answers, the one door every browser goes through, and the dev
 * proxy's refusal of a headless caller (that one in
 * `server/__tests__/llm-proxy-headless-1955.test.ts`, inside the typed tree).
 */

const REPO = join(__dirname, '..', '..');

describe('#1955 — the model stub answers every /api/parse', () => {
  it('recognises the proxy under every base, and nothing else', () => {
    expect(isParseUrl('http://localhost:5173/api/parse')).toBe(true);
    expect(isParseUrl('https://example.org/geo-builder/api/parse')).toBe(true);
    expect(isParseUrl('http://localhost:5173/analytic-builder/api/parse?x=1')).toBe(true);
    expect(isParseUrl('http://localhost:5173/api/parser')).toBe(false);
    expect(isParseUrl('http://localhost:5173/api/log')).toBe(false);
    expect(isParseUrl('not a url')).toBe(false);
  });

  it('answers as a keyless proxy by default — the answer every client reads as "the refusal stands"', () => {
    const a = modelStubAnswer(JSON.stringify({ utterance: 'משהו שהדקדוק לא קורא', tool: '3d' }), {});
    expect(a).toMatchObject({ status: 503, body: { error: 'no-api-key' }, tool: '3d', mocked: null });
    expect(NOT_CONFIGURED.status).toBe(503);
  });

  it('answers a declared utterance with the oracle lines, as the proxy would ({ steps })', () => {
    const answers = { 'בנו ריבוע עם צלע 5': ['ריבוע ABCD', 'AB = 5'] };
    const a = modelStubAnswer(JSON.stringify({ utterance: '  בנו ריבוע⁦ עם צלע 5⁩ ' }), answers);
    expect(a).toMatchObject({ status: 200, body: { steps: ['ריבוע ABCD', 'AB = 5'] }, tool: '2d', mocked: 'בנו ריבוע עם צלע 5' });
  });

  it('an unreadable body still gets the keyless answer, never a pass-through', () => {
    expect(modelStubAnswer('{not json', { x: ['y'] }).status).toBe(503);
    expect(modelStubAnswer(null, {}).status).toBe(503);
  });

  it('a leak is a loud failure, and so is an oracle answer no request used', () => {
    const answers = { 'שורה א': ['ריבוע ABCD'] };
    expect(ledgerProblems({ calls: [{ mocked: 'שורה א' }], leaks: [] }, answers)).toEqual([]);
    const leak = ledgerProblems({ calls: [], leaks: ['http://localhost:5173/api/parse'] }, {});
    expect(leak[0]).toContain('LIVE MODEL CALL');
    expect(ledgerProblems({ calls: [{ mocked: null }], leaks: [] }, answers)[0]).toContain('never asked for');
  });

  it('a sheet case may declare `llm` only as utterance → non-empty canonical lines', () => {
    expect(validateModelAnswers(undefined)).toEqual([]);
    expect(validateModelAnswers({ a: ['b'] })).toEqual([]);
    expect(validateModelAnswers(['b'])).toHaveLength(1);
    expect(validateModelAnswers({ a: [] })).toHaveLength(1);
    expect(validateModelAnswers({ a: 'b' })).toHaveLength(1);
    const PRODUCTS = { '2d': { urlPath: '/', inputHint: 'x', askHint: 'y' } };
    const base = { id: 'T1', title: 't', class: 'verified', product: '2d', base: 'http://localhost:5173', lines: ['l'], lookFor: 'f' };
    expect(validateSheet({ name: 's', cases: [{ ...base, llm: { l: ['ריבוע ABCD'] } }] }, PRODUCTS)).toEqual([]);
    expect(validateSheet({ name: 's', cases: [{ ...base, llm: { l: [] } }] }, PRODUCTS).join()).toContain('canonical lines');
  });

  it('the case verdict carries the model problems', () => {
    const drive = { steps: [], askSteps: [], bodyText: '', pageErrors: [], captureProblems: [], modelProblems: ['LIVE MODEL CALL — x'] };
    expect(caseVerdict({ id: 'T1' }, drive)).toEqual(['LIVE MODEL CALL — x']);
  });
});

describe('#1955 — ONE door: only the harness imports playwright', () => {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-server', 'reports', 'logs', 'coverage']);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith('dist')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?[jt]sx?|cjs)$/.test(name)) files.push(p);
    }
  };
  walk(REPO);
  const IMPORTS_PLAYWRIGHT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:playwright(?:-core)?|@playwright\/test)['"]/;
  const THIS_FILE = relative(REPO, __filename).replace(/\\/g, '/');

  it('every browser-launching file goes through scripts/lib/browser-harness.mjs', () => {
    const offenders = files
      .map((f) => relative(REPO, f).replace(/\\/g, '/'))
      .filter((rel) => rel !== 'scripts/lib/browser-harness.mjs' && rel !== THIS_FILE)
      .filter((rel) => IMPORTS_PLAYWRIGHT.test(readFileSync(join(REPO, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the scan is live — it finds the harness itself', () => {
    expect(IMPORTS_PLAYWRIGHT.test(readFileSync(join(REPO, 'scripts/lib/browser-harness.mjs'), 'utf8'))).toBe(true);
  });

  it('the harness guards every context it opens', () => {
    const src = readFileSync(join(REPO, 'scripts/lib/browser-harness.mjs'), 'utf8');
    expect(src).toMatch(/browser\.newContext\s*=/);
    expect(src).toMatch(/browser\.newPage\s*=/);
    expect(src).toMatch(/ctx\.route\(/);
    expect(src).toMatch(/serviceWorkers:\s*'block'/);
  });
});
