// Summarise one V8 .cpuprofile written by a perf harness: the top functions by SELF and by INCLUSIVE time, as
// `name file:line  % of the profile`, repo-relative. One summariser for all four builders (#2867).
//
// Run (from the repo root):
//   node scripts/perf/lib/profsum.mjs <file.cpuprofile | dir> [topN] [underFunction] [--dump <dir>]
//     dir            → the LARGEST .cpuprofile in it
//     topN           → rows per table (default 25)
//     underFunction  → keep only samples whose stack contains that function (e.g. `findValidConfig`)
//     --dump <dir>   → exact line numbers through vite-node's own transformed modules + sourcemaps, dumped with
//                      `vite-node --options.debug.dumpModules=<dir> <harness>` (3d/profile3.mjs does this itself)
// Writes: nothing — it prints. Takes a second or two.
//
// LINE NUMBERS. A profile taken through vite-node carries the TRANSFORMED line. Without --dump each function is
// re-found in the real source by its declaration: a name declared once in its file is exact; a shared name is
// placed by interpolating between the file's uniquely-named neighbours; "~N" = no declaration found (an estimate).
//
// Percentages are comparable anywhere; the millisecond column is a timing, so only on a quiet machine.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO_FWD = REPO.split(path.sep).join('/').toLowerCase();
const PRODUCT = /^(src|src3d|src-analytic|src-complex|shell)\//;
const HARNESS = /^scripts\/perf\//;
const BS = String.fromCharCode(92);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, BS + '$&');

/** `file:///<repo>/src3d/engine/x.ts?v=1` → `src3d/engine/x.ts` */
function relOf(url) {
  let u = decodeURIComponent(url || '').replace(/^file:\/\/\/?/, '').replace(/\?.*$/, '').split(BS).join('/');
  const at = u.toLowerCase().indexOf(REPO_FWD + '/');
  if (at >= 0) u = u.slice(at + REPO_FWD.length + 1);
  return u;
}

/** Exact positions through a vite-node module dump (one `_<path with _>-<hash>.js` per module, sourcemap inline). */
function dumpMapper(dumpDir) {
  const files = readdirSync(dumpDir);
  const { TraceMap, originalPositionFor } = createRequire(path.join(REPO, 'package.json'))('@jridgewell/trace-mapping');
  const maps = new Map();
  const mapFor = (relPath) => {
    if (maps.has(relPath)) return maps.get(relPath);
    let m = null;
    const f = files.find((n) => n.startsWith('_' + relPath.replace(/[\\/.]/g, '_') + '-'));
    if (f) {
      const mm = readFileSync(path.join(dumpDir, f), 'utf8').match(/sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/);
      if (mm) m = new TraceMap(JSON.parse(Buffer.from(mm[1], 'base64').toString('utf8')));
    }
    maps.set(relPath, m);
    return m;
  };
  return (relPath, cf) => {
    const m = mapFor(relPath);
    // vite-node wraps line 1 in its async function header; only line-1 columns shift, which is ignored
    const o = m ? originalPositionFor(m, { line: cf.lineNumber + 1, column: Math.max(0, cf.columnNumber) }) : null;
    return o?.line ?? null;
  };
}

/** Declaration-based positions: where is `name` declared in the real source file? */
function sourceMapper(nodes) {
  const srcCache = new Map();
  const srcOf = (relPath) => {
    if (!srcCache.has(relPath)) {
      try {
        srcCache.set(relPath, readFileSync(path.join(REPO, relPath), 'utf8').split(/\r?\n/));
      } catch {
        srcCache.set(relPath, null);
      }
    }
    return srcCache.get(relPath);
  };
  const candCache = new Map();
  const candidates = (relPath, name) => {
    const key = relPath + '\n' + name;
    if (candCache.has(key)) return candCache.get(key);
    const lines = srcOf(relPath);
    const out = [];
    if (lines && name) {
      const n = escapeRe(name);
      const res = [
        new RegExp('function\\*?\\s+' + n + '\\b'),
        new RegExp('\\b(const|let|var)\\s+' + n + '\\s*[=:]'),
        new RegExp('^\\s*(export\\s+|async\\s+|private\\s+|public\\s+|static\\s+|get\\s+)*' + n + '\\s*[(<]'),
        new RegExp('\\b' + n + '\\s*:\\s*(async\\s*)?\\('),
      ];
      lines.forEach((l, i) => {
        if (res.some((re) => re.test(l))) out.push(i + 1);
      });
    }
    candCache.set(key, out);
    return out;
  };
  // anchors: transformed line → source line, from every function declared exactly once in its file
  const anchors = new Map();
  for (const n of nodes) {
    const relPath = relOf(n.callFrame.url);
    if (!PRODUCT.test(relPath) || !n.callFrame.functionName) continue;
    const c = candidates(relPath, n.callFrame.functionName);
    if (c.length !== 1) continue;
    if (!anchors.has(relPath)) anchors.set(relPath, new Map());
    anchors.get(relPath).set(n.callFrame.lineNumber + 1, c[0]);
  }
  const estimate = (relPath, t) => {
    const a = [...(anchors.get(relPath) ?? new Map()).entries()].sort((x, y) => x[0] - y[0]);
    if (!a.length) return t;
    let lo = null;
    let hi = null;
    for (const q of a) {
      if (q[0] <= t) lo = q;
      else {
        hi = q;
        break;
      }
    }
    if (lo && hi) return lo[1] + ((t - lo[0]) * (hi[1] - lo[1])) / (hi[0] - lo[0]);
    const q = lo ?? hi;
    return q[1] + (t - q[0]);
  };
  return (relPath, cf) => {
    const t = cf.lineNumber + 1;
    const c = candidates(relPath, cf.functionName);
    if (c.length === 1) return c[0];
    const est = estimate(relPath, t);
    if (c.length === 0) return '~' + Math.round(est);
    return c.reduce((x, y) => (Math.abs(y - est) < Math.abs(x - est) ? y : x));
  };
}

/** The summary text of one profile. `opts`: `{ top = 25, under, dump }`. */
export function profsum(target, opts = {}) {
  const top = opts.top ?? 25;
  let file = target;
  if (statSync(file).isDirectory()) {
    const all = readdirSync(file).filter((f) => f.endsWith('.cpuprofile')).map((f) => path.join(file, f));
    if (!all.length) return `no data: no .cpuprofile in ${file}`;
    file = all.sort((a, b) => statSync(b).size - statSync(a).size)[0];
  }
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const dt = new Map();
  for (let i = 0; i < p.samples.length; i += 1) dt.set(p.samples[i], (dt.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0));

  const exact = opts.dump && existsSync(opts.dump) ? dumpMapper(opts.dump) : null;
  const declared = sourceMapper(p.nodes);
  const labels = new Map();
  for (const n of p.nodes) {
    const cf = n.callFrame;
    const relPath = relOf(cf.url);
    let line = cf.lineNumber + 1;
    if (PRODUCT.test(relPath)) line = (exact && exact(relPath, cf)) ?? declared(relPath, cf);
    labels.set(n.id, `${cf.functionName || '(anon)'} ${relPath}:${line}`);
  }

  const self = new Map();
  const incl = new Map();
  let total = 0;
  for (const [id, t] of dt) {
    // the profiler's own `Profiler.stop` round-trip (the harness stops it in-process) is not the action's time
    if (byId.get(id).callFrame.url === 'node:inspector') continue;
    if (opts.under) {
      let ok = false;
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        if (byId.get(cur).callFrame.functionName === opts.under) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
    }
    total += t;
    const l0 = labels.get(id);
    self.set(l0, (self.get(l0) ?? 0) + t);
    const seen = new Set(); // a recursive function is credited once per sample, not once per frame
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const l = labels.get(cur);
      if (seen.has(l)) continue;
      seen.add(l);
      incl.set(l, (incl.get(l) ?? 0) + t);
    }
  }
  const out = [`profile ${path.basename(file)} — ${(total / 1000).toFixed(0)} ms sampled${opts.under ? `, under ${opts.under}` : ''}${exact ? ' (lines: sourcemap)' : ' (lines: by declaration)'}`];
  if (!total) return out.concat(opts.under ? `no data: no sample under ${opts.under}` : 'no data: the profile holds no samples').join('\n');
  const table = (m, title, keep) => {
    out.push(`\n== ${title}`);
    for (const [l, t] of [...m].filter(([l]) => !/^\((root|program|idle)\)/.test(l) && keep(l)).sort((a, b) => b[1] - a[1]).slice(0, top))
      out.push(`${((100 * t) / total).toFixed(1).padStart(5)}%  ${(t / 1000).toFixed(0).padStart(7)} ms  ${l}`);
  };
  table(self, 'SELF', () => true);
  // inclusive: the harness's own frames (they contain everything) and node internals say nothing
  table(incl, 'INCLUSIVE (product code)', (l) => {
    const where = l.slice(l.indexOf(' ') + 1);
    return PRODUCT.test(where) && !HARNESS.test(where);
  });
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--dump');
  const dump = di >= 0 ? argv[di + 1] : undefined;
  const pos = argv.filter((a, i) => a !== '--dump' && !(di >= 0 && i === di + 1));
  if (!pos[0] || !existsSync(pos[0])) {
    console.log(pos[0] ? `no data: ${pos[0]} does not exist` : 'usage: node scripts/perf/lib/profsum.mjs <file.cpuprofile | dir> [topN] [underFunction] [--dump <dir>]');
    process.exit(pos[0] ? 0 : 1);
  }
  console.log(profsum(pos[0], { top: pos[1] ? Number(pos[1]) : 25, under: pos[2], dump }));
}
