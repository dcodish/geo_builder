// Every browser goes through the repo's harness (CLAUDE.md rule 2, #1955): it stubs /api/parse, so no model call can leave.
const launchBrowser = async (opts) => (await import(require('url').pathToFileURL(require('path').join(__dirname, '../../../scripts/lib/browser-harness.mjs')).href)).launchBrowser(opts);
const path = require('path');
(async () => {
  const b = await launchBrowser();
  const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const url = 'file:///' + path.resolve(__dirname, 'preview.html').split(path.sep).join('/');
  for (const v of (process.argv[2] || 'overview').split(',')) {
    await p.goto(url + '#' + v);
    await p.waitForTimeout(1500);
    await p.locator('.sheet').screenshot({ path: path.join(__dirname, `shot-${v}.png`) });
  }
  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})();
