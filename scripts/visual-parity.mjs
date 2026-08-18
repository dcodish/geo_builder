// Cross-tool parity check (operator, 2026-08-18): load every builder and assert the SHARED chrome
// is geometrically and chromatically identical — bounding boxes of the suite/tool-row controls,
// computed styles of the title, body background. Prints PASS or a named DELTA per probe.
// B3-2d: the 2-D app joined the frame, so the check now compares ALL THREE pairwise against the
// complex baseline. Formal wiring into the readiness gate is #704's.
import { chromium } from 'playwright';

const TOOLS = [
  { id: '2d', url: 'http://localhost:5173/' },
  { id: '3d', url: 'http://localhost:5173/3d.html' },
  { id: 'complex', url: 'http://localhost:5173/complex.html' },
];

const browser = await chromium.launch();
const results = {};
for (const tool of TOOLS) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(tool.url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  // the 2-D first-load intro modal would sit over the chrome — dismiss it
  const dlg = p.locator('[role=dialog] button, .modal button');
  if (await dlg.count()) {
    await dlg.last().click().catch(() => {});
    await p.waitForTimeout(300);
  }
  const probe = async (name, locator) => {
    const el = p.locator(locator).first();
    if ((await el.count()) === 0) return { missing: true };
    const box = await el.boundingBox();
    const style = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return { font: s.fontSize, weight: s.fontWeight, color: s.color, bg: s.backgroundColor };
    });
    return { box, style };
  };
  results[tool.id] = {
    title: await probe('title', 'h1'),
    save: await probe('save', 'button:has-text("שמור")'),
    load: await probe('load', 'button:has-text("טען")'),
    about: await probe('about', 'button:has-text("אודות")'),
    english: await probe('english', 'button:has-text("English")'),
    strip: await probe('strip', 'nav'),
    body: await p.evaluate(() => getComputedStyle(document.body).backgroundColor),
    inputBox: await probe('inputBox', 'form input, input[dir=auto]'),
  };
  await p.close();
}
await browser.close();

let deltas = 0;
const near = (x, y, tol = 2) => Math.abs(x - y) <= tol;
const comparePair = (idA, idB) => {
  const a = results[idA];
  const b = results[idB];
  const cmpBox = (name, pa, pb, checkW = true) => {
    if (pa.missing || pb.missing) { console.log(`DELTA ${name}: missing in ${pa.missing ? idA : idB}`); deltas++; return; }
    const A = pa.box, B = pb.box;
    if (!near(A.x, B.x) || !near(A.y, B.y) || (checkW && !near(A.width, B.width)) || !near(A.height, B.height)) {
      console.log(`DELTA ${name}: ${idA}(x${A.x.toFixed(0)},y${A.y.toFixed(0)},w${A.width.toFixed(0)},h${A.height.toFixed(0)}) vs ${idB}(x${B.x.toFixed(0)},y${B.y.toFixed(0)},w${B.width.toFixed(0)},h${B.height.toFixed(0)})`);
      deltas++;
    } else console.log(`PASS  ${name}: same position/size`);
  };
  const cmpStyle = (name, pa, pb) => {
    if (pa.missing || pb.missing) return;
    const A = pa.style, B = pb.style;
    for (const k of ['font', 'weight', 'color']) {
      if (A[k] !== B[k]) { console.log(`DELTA ${name}.${k}: ${idA}=${A[k]} vs ${idB}=${B[k]}`); deltas++; }
      else console.log(`PASS  ${name}.${k}: ${A[k]}`);
    }
  };
  console.log(`--- ${idA} vs ${idB} ---`);
  cmpBox('save-button', a.save, b.save);
  cmpBox('load-button', a.load, b.load);
  cmpBox('about-button', a.about, b.about);
  cmpBox('english-button', a.english, b.english);
  cmpBox('title', a.title, b.title, false);
  cmpStyle('title', a.title, b.title);
  if (a.body !== b.body) { console.log(`DELTA body.bg: ${idA}=${a.body} vs ${idB}=${b.body}`); deltas++; }
  else console.log(`PASS  body.bg: ${a.body}`);
};
comparePair('3d', 'complex');
comparePair('2d', 'complex');
console.log(deltas === 0 ? 'PARITY: PASS — the shared chrome is identical' : `PARITY: ${deltas} delta(s)`);
