// Shared plumbing of the four timing harnesses' NODE-side scripts (drivers, confirm, profile, summarise) — #2867.
// Not an entry point. It knows nothing about any product: paths, argv, JSONL, the count buckets, and how to launch
// (and kill) one vite-node child. The harness .ts files do NOT import it — each harness imports only its own
// product tree (and shell/), so the four stay independent.
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root, from this file's own location (scripts/perf/lib/) — never a hard-coded machine path. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VITE_NODE = path.join(REPO, 'node_modules', 'vite-node', 'vite-node.mjs');

/** `--key value` / `--flag` reader over an argv slice. */
export function cli(argv = process.argv.slice(2)) {
  const arg = (k, d) => (argv.indexOf(k) >= 0 && argv.indexOf(k) + 1 < argv.length ? argv[argv.indexOf(k) + 1] : d);
  const has = (k) => argv.includes(k);
  /** argv entries that are neither a `--key` nor the value of one of `valued` */
  const positional = (valued = []) => argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.includes(argv[i - 1])));
  return { argv, arg, has, positional };
}

/** `[k, v, …]` for those of `keys` the caller gave — the corpus overrides a driver hands on to its harness. */
export const passThrough = (args, keys) => keys.flatMap((k) => (args.arg(k) ? [k, args.arg(k)] : []));

/** `--out <dir>` (relative to the cwd) or `reports/perf/<product>/` under the repo; created if absent. */
export function outDir(product, args) {
  const given = args.arg('--out');
  const dir = given ? path.resolve(given) : path.join(REPO, 'reports', 'perf', product);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A path as the console should show it: repo-relative when inside the repo. */
export const rel = (p) => {
  const r = path.relative(REPO, p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r.split(path.sep).join('/') : p;
};

/** Every parseable line of a JSONL file; a MISSING file is `[]` (the caller says "no data"). */
export function readJsonl(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      /* a torn last line (a killed child) is not data */
    }
  }
  return out;
}

/**
 * A full sweep replaces the previous one. Its files (and everything derived from them: a stale confirm pass merged
 * into a fresh sweep would be a wrong number) are MOVED to `<dir>/previous/` — one generation, a free "before".
 */
export function rotate(dir, names) {
  const present = names.filter((n) => existsSync(path.join(dir, n)));
  if (!present.length) return;
  const prev = path.join(dir, 'previous');
  mkdirSync(prev, { recursive: true });
  for (const n of present) {
    rmSync(path.join(prev, n), { recursive: true, force: true });
    renameSync(path.join(dir, n), path.join(prev, n));
  }
  console.log(`previous run moved to ${rel(prev)}/ (${present.join(', ')})`);
}

export const BUCKETS = ['<2s', '2-5s', '5-10s', '10-30s', '>=30s'];
export const bucket = (ms) => (ms >= 30000 ? '>=30s' : ms >= 10000 ? '10-30s' : ms >= 5000 ? '5-10s' : ms >= 2000 ? '2-5s' : '<2s');
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** rows → { key: { '<2s': n, … } } for every key `keysOf(row)` yields, bucketed on `msOf(row)`. */
export function countBuckets(rows, keysOf, msOf) {
  const t = {};
  for (const r of rows) {
    for (const k of keysOf(r)) {
      t[k] ??= Object.fromEntries(BUCKETS.map((b) => [b, 0]));
      t[k][bucket(msOf(r))] += 1;
    }
  }
  return t;
}
export function countsText(t, title = 'action') {
  const keys = Object.keys(t).sort();
  const w = Math.max(title.length, ...keys.map((k) => k.length)) + 2;
  const lines = [title.padEnd(w) + BUCKETS.map((b) => b.padStart(8)).join('') + '   total'];
  for (const k of keys) lines.push(k.padEnd(w) + BUCKETS.map((b) => String(t[k][b]).padStart(8)).join('') + String(Object.values(t[k]).reduce((a, b) => a + b, 0)).padStart(8));
  return lines.join('\n');
}
export function countsMarkdown(t, title = 'action') {
  const lines = [`| ${title} | <2 s | 2–5 s | 5–10 s | 10–30 s | ≥30 s | total |`, '|---|---|---|---|---|---|---|'];
  for (const k of Object.keys(t).sort()) lines.push(`| ${k} | ${BUCKETS.map((b) => t[k][b]).join(' | ')} | ${Object.values(t[k]).reduce((a, b) => a + b, 0)} |`);
  return lines.join('\n') + '\n';
}

/** The commit the numbers belong to (short sha, `+dirty` when the tree has uncommitted changes). */
/**
 * The work meter's three counts of one action (#2873, ADR-W-210), as text: solver work in units, never seconds —
 * all of it, the part on the page's UI thread, and the part before the figure can paint. Clock-free: comparable on
 * any machine under any load, except where a record says a wall-clock budget cut the action short.
 */
export const workText = (w) => (w ? `work ${w.total.toLocaleString('en-US')} · page ${w.page.toLocaleString('en-US')} · before paint ${w.prePaint.toLocaleString('en-US')}` : '');
/** The three counts summed over records that carry them. */
export function workSum(rows) {
  const t = { total: 0, page: 0, prePaint: 0, n: 0 };
  for (const r of rows) {
    if (!r?.work) continue;
    t.total += r.work.total;
    t.page += r.work.page;
    t.prePaint += r.work.prePaint;
    t.n += 1;
  }
  return t;
}
/** One line: the corpus's work, the share on the page and the share before the paint. */
export function workSummary(rows, unit) {
  const t = workSum(rows);
  if (!t.n || !t.total) return `work: no action recorded any (${unit})`;
  const pct = (x) => `${((100 * x) / t.total).toFixed(1)}%`;
  return `work over ${t.n} actions: ${t.total.toLocaleString('en-US')} units (${unit}) · on the page ${pct(t.page)} · before the paint ${pct(t.prePaint)}`;
}

export function commitStamp() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: REPO, encoding: 'utf8' }).trim() ? '+dirty' : '';
    return sha + dirty;
  } catch {
    return 'unknown';
  }
}

/** argv for one vite-node child: `[...viteNodeOptions, script, '--', ...scriptArgs]`, run by THIS node, no shell. */
const childArgv = (script, scriptArgs, viteOpts, nodeOpts) => [...nodeOpts, VITE_NODE, ...viteOpts, script, '--', ...scriptArgs];

/** Start a harness under vite-node from the repo root (async; the caller owns stdout and the watchdog). */
export function viteNode(script, scriptArgs = [], { viteOpts = [], nodeOpts = [], stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  return spawn(process.execPath, childArgv(script, scriptArgs, viteOpts, nodeOpts), { cwd: REPO, stdio, windowsHide: true });
}
/** Run a harness to completion (or `timeout` ms, then killed); returns `{ status, stdout, stderr, timedOut }`. */
export function viteNodeSync(script, scriptArgs = [], { viteOpts = [], nodeOpts = [], timeout = 600_000 } = {}) {
  const r = spawnSync(process.execPath, childArgv(script, scriptArgs, viteOpts, nodeOpts), { cwd: REPO, encoding: 'utf8', timeout, maxBuffer: 1 << 28, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT' };
}
/** Kill a child and everything under it (a hung solve does not answer a polite signal). */
export function killTree(child) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}

/** A file-system-safe name for a profile of one action. */
export const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);

/** Split stdout into complete lines as they arrive. */
export function lineReader(onLine) {
  let buf = '';
  return (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  };
}
