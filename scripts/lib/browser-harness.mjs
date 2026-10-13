/**
 * THE BROWSER HARNESS — the one place a repo script launches a browser (#1955, ADR-W-127).
 *
 * Every Playwright script in this repo (the play-sheet driver, the visual smoke, the OG/icon
 * renderers, the parity probe, a session's bespoke probe) launches through `launchBrowser()`, and
 * `scripts/__tests__/browser-harness-chokepoint.test.ts` fails if any other file imports
 * `playwright`. Why one door: the dev server's `/api/parse` is a LIVE Anthropic call whenever
 * `.env.local` holds a key, and a script typing a line the deterministic grammar does not read
 * would make it with no operator present — CLAUDE.md rule 2. On 2026-10-09 an ad-hoc probe made 18.
 *
 * What the door does to every context it opens:
 *   1. routes every `…/api/parse` request to the MODEL STUB (`model-stub.mjs`): the proxy's keyless
 *      answer by default, or the canonical lines a case declared as the oracle (`modelAnswers`);
 *   2. keeps a LEDGER on the context (and on a page from `browser.newPage`): `calls` (what the stub
 *      answered) and `leaks` (an /api/parse request that finished WITHOUT passing the stub — reached
 *      the network). `ledgerProblems()` turns a leak into a loud failure;
 *   3. blocks service workers, which Playwright's routing cannot see through.
 *
 * The dev proxy refuses a headless caller on its own as well (`server/llmProxy.ts`), so a probe
 * that bypasses this door still cannot spend — but this door is the contract.
 */
import { chromium } from 'playwright';
import { isParseUrl, modelStubAnswer } from './model-stub.mjs';

/**
 * Install the stub and the ledger on one context. Exported for a script that must build its own
 * context through `browser.newContext` — which, from `launchBrowser`, already does this.
 */
export async function guardContext(ctx, modelAnswers = {}) {
  if (ctx.modelLedger) return ctx.modelLedger;
  const ledger = { calls: [], leaks: [] };
  const stubbed = new WeakSet();
  await ctx.route(
    (url) => isParseUrl(url),
    async (route) => {
      const req = route.request();
      stubbed.add(req);
      const a = modelStubAnswer(req.postData(), modelAnswers);
      ledger.calls.push({ utterance: a.utterance, tool: a.tool, status: a.status, mocked: a.mocked });
      await route.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) });
    },
  );
  const audit = (req) => {
    if (isParseUrl(req.url()) && !stubbed.has(req)) ledger.leaks.push(req.url());
  };
  ctx.on('requestfinished', audit);
  ctx.on('requestfailed', audit);
  ctx.modelLedger = ledger;
  return ledger;
}

/**
 * Launch Chromium with the guard on every context. Returns the Playwright Browser, whose
 * `newContext(opts)` and `newPage(opts)` take one extra option, `modelAnswers`
 * (`{ "<utterance>": ["canonical line", …] }`), and are otherwise Playwright's own.
 */
export async function launchBrowser(launchOpts) {
  const browser = await chromium.launch(launchOpts);
  const rawNewContext = browser.newContext.bind(browser);
  browser.newContext = async ({ modelAnswers, ...opts } = {}) => {
    const ctx = await rawNewContext({ serviceWorkers: 'block', ...opts });
    await guardContext(ctx, modelAnswers);
    return ctx;
  };
  // Playwright's own `newPage` opens a context the page owns; this one does the same through the
  // guarded `newContext`, and closes that context with the page.
  browser.newPage = async (opts = {}) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.modelLedger = ctx.modelLedger;
    page.once('close', () => {
      ctx.close().catch(() => {});
    });
    return page;
  };
  return browser;
}
