// Records player.html in real time at 1920×1080 and encodes out/part1-look.mp4 (#2887).
// The recording starts before the page has loaded; the lead-in is trimmed at the moment play() starts.
// Every browser goes through the repo's harness (CLAUDE.md rule 2, #1955): it stubs /api/parse, so no model call can leave.
const launchBrowser = async (opts) => (await import(require('url').pathToFileURL(require('path').join(__dirname, '../../../scripts/lib/browser-harness.mjs')).href)).launchBrowser(opts);
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } });
  const t0 = Date.now();
  let startedAt = null;
  const p = await ctx.newPage();
  await p.exposeFunction('__started', () => { startedAt = Date.now(); });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file:///' + path.join(__dirname, 'player.html').split(path.sep).join('/'));
  await p.waitForFunction(() => window.__done === true, null, { timeout: 300000, polling: 500 });
  const err = await p.evaluate(() => window.__error || null);
  const video = p.video();
  await ctx.close();
  await b.close();
  const webm = await video.path();
  const lead = startedAt ? (startedAt - t0) / 1000 : 0;
  const mp4 = path.join(OUT, 'part1-look.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', mp4]);
  fs.unlinkSync(webm);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim();
  console.log(JSON.stringify({ mp4, lead: lead.toFixed(2), duration: Number(dur).toFixed(1), error: err, pageErrors: errs }));
})();
