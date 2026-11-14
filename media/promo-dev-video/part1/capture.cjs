// Captures the real GitHub pages Part 1 shows (#2887). The repo is public; nothing here is private.
// Run: node capture.cjs   → assets/*.png
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });
const R = 'https://github.com/dcodish/geo_builder';
const SHOTS = [
  { name: 'issue-2848', url: `${R}/issues/2848`, clip: { x: 0, y: 0, width: 1280, height: 820 } },
  { name: 'commit-862ffd81', url: `${R}/commit/862ffd81`, clip: { x: 0, y: 0, width: 1280, height: 820 } },
  { name: 'deploy-log', url: `${R}/blob/main/docs/DEPLOY-LOG.md?plain=1#L13`, clip: { x: 0, y: 0, width: 1280, height: 820 } },
  { name: 'round-2855', url: `${R}/issues/2855`, clip: { x: 0, y: 0, width: 1280, height: 820 } },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5, colorScheme: 'light', locale: 'en-US' });
  const p = await ctx.newPage();
  for (const s of SHOTS) {
    await p.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `${s.name}.png`), clip: s.clip });
    console.log('captured', s.name);
  }
  await b.close();
})();
