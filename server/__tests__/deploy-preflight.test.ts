/**
 * #1130 — THE RUNBOOK'S OLD DEPLOY RULE WAS UNSOUND, AND THIS IS THE PROOF THAT KEEPS IT RETIRED.
 *
 * The proxy step used to be decided by a QUESTION — *"did `server/` change?"* — and it shipped stale
 * server code **twice**. The failure mode is invisible by construction: the stale artifact keeps
 * working, so nothing surfaces until someone diffs it by hand. A convention that depends on
 * remembering is not a check.
 *
 * The rule is not merely fragile; it is **wrong**, because the bundle's inputs are far wider than
 * `server/`. That is what this file asserts — by asking **esbuild** what goes into the bundle, through
 * the same options `npm run build:proxy` uses (`proxyBuildOptions`), rather than describing the import
 * graph a second time. A test that re-implemented the graph would drift exactly as the RUNBOOK
 * sentence did (ADR-W-053 / #1102).
 *
 * This suite has no network and no deploy: it builds in memory and reads the repo.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — a plain .mjs build script, deliberately untyped
import { proxyInputs, proxyBuildOptions } from '../build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('#1130 — the proxy bundle is WIDER than server/', () => {
  it('the old rule is unsound: most of the bundle comes from outside server/', async () => {
    const inputs: string[] = await proxyInputs(root);
    const outside = inputs.filter((p) => !p.startsWith('server/'));

    // An oracle with nothing to check passes by checking nothing.
    expect(inputs.length, 'the bundle has first-party inputs at all').toBeGreaterThan(5);
    /**
     * THE ASSERTION THAT RETIRES THE RULE. If this ever became empty, "did `server/` change?" would be
     * a sound decision rule again — and only then may the RUNBOOK go back to asking it.
     */
    expect(outside.length, `the bundle's inputs outside server/:\n${outside.join('\n')}`).toBeGreaterThan(0);
    // Measured at the time of writing: 20 of 26 first-party modules. Asserted as a majority rather
    // than a count, so adding one module does not fail a test about the RULE.
    expect(outside.length).toBeGreaterThan(inputs.length / 2);
  });

  it('a change in ANY product tree can change the proxy — which is why the rule could not work', async () => {
    const inputs: string[] = await proxyInputs(root);
    /**
     * The concrete shape of the trap: the 2-D and 3-D catalogs are the LLM's own vocabulary and they
     * are compiled into the proxy. Editing a catalog row is a change no one would call a "server
     * change", and it makes the deployed proxy stale.
     */
    const trees = ['src/', 'src3d/'].filter((t) => inputs.some((p) => p.startsWith(t)));
    expect(trees, 'the product trees that reach the proxy').toEqual(['src/', 'src3d/']);
    expect(inputs).toContain('src/parser/catalog.ts');
    expect(inputs).toContain('src3d/parser/catalog3.ts');
  });

  it('the build options are SHARED, not described twice', () => {
    // The preflight and this lock both read the real build's options; a second copy is how the
    // RUNBOOK sentence drifted from the build in the first place.
    const opts = proxyBuildOptions(root);
    expect(opts.bundle).toBe(true);
    expect(String(opts.outfile).replace(/\\/g, '/')).toContain('dist-server/proxy.mjs');
    expect(String(opts.entryPoints[0]).replace(/\\/g, '/')).toContain('server/standalone.ts');
  });

  it('the preflight exists, is wired as a script, and the RUNBOOK sends you to it', () => {
    expect(existsSync(resolve(root, 'scripts', 'deploy-preflight.mjs'))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['deploy:preflight']).toContain('deploy-preflight.mjs');

    const runbook = readFileSync(resolve(root, 'docs', 'RUNBOOK.md'), 'utf8');
    expect(runbook).toContain('deploy:preflight');
    /**
     * The retired rule may be DISCUSSED — the RUNBOOK explains what it replaced and why — but never
     * INSTRUCTED. So blockquotes and headings are exempt and every other line is checked: any line
     * that decides the proxy step by asking which files changed is the defect, whatever its wording.
     */
    const instructions = runbook
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('>') && !l.trimStart().startsWith('#'));
    const offenders = instructions.filter((l) =>
      /(?:did|only if|only when)\s+.{0,3}server\/.{0,3}\s+chang/i.test(l),
    );
    expect(offenders, `the retired rule is being INSTRUCTED again:\n${offenders.join('\n')}`).toEqual([]);
  });
});
