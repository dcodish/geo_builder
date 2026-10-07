#!/usr/bin/env node
/**
 * #1853 (ADR-W-115) — the LIVE ROUND DASHBOARD (tracking only), I/O half. One append-only event log per round; every
 * actor in the round writes to it, and the orchestrator projects it onto the published dashboard.
 *
 *   node scripts/round-event.mjs emit <round> round <phase> [--note "…"] [--data '{…}']
 *   node scripts/round-event.mjs emit <round> item <key> <phase> [--note "…"] [--data '{…}']
 *   node scripts/round-event.mjs note <round> "<text>"
 *   node scripts/round-event.mjs state <round> [--out <file>]     — the folded state document (JSON)
 *   node scripts/round-event.mjs page <round> --out <file>        — the dashboard page, titled for this round
 *   node scripts/round-event.mjs watch <round>                    — one line per new event (for Monitor)
 *   node scripts/round-event.mjs path <round>                     — where the log lives
 *
 * `<round>` is the round issue's number — or, for a single-issue fix session, the issue's own number.
 * `<key>` is the item's issue number, or `N+M` for a bundle. Phases: `scripts/lib/round-core.mjs`.
 *
 * THE LOG lives in the git COMMON dir (`git rev-parse --git-common-dir`), like the suite lock
 * (ADR-W-114): every worktree of the repo sees the same file, so an item agent in its own worktree
 * emits into the round's one log with no setup, and git never commits it. A line is validated BEFORE
 * it is written — a typo'd phase fails the agent's command rather than vanishing from the page — and
 * written with a single append, so concurrent agents never interleave inside a line.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fold, parseLog, statsLine, validateEvent } from './lib/round-core.mjs';

const HERE = resolve(fileURLToPath(import.meta.url), '..', '..');
const TEMPLATE = join(HERE, 'scripts', 'round-dashboard', 'dashboard.html');

/** The round's log: an explicit directory override (tests), else `<git common dir>/geo-rounds/`. */
export function logPath(round, cwd = process.cwd()) {
  let dir = process.env.GEO_ROUND_LOG_DIR;
  if (!dir) {
    const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
    const common = (r.stdout ?? '').trim() || join(HERE, '.git');
    dir = join(isAbsolute(common) ? common : resolve(cwd, common), 'geo-rounds');
  }
  return join(dir, `${round}.jsonl`);
}

function fail(msg) {
  console.error(`round-event: ${msg}`);
  process.exit(2);
}

/** `--flag value` pairs after the positionals. */
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, flags };
}

function append(round, ev) {
  const problems = validateEvent(ev);
  if (problems.length) fail(`refused (${problems.join('; ')})`);
  const file = logPath(round);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(ev)}\n`);
}

export function readState(round) {
  const file = logPath(round);
  const { events, rejected } = parseLog(existsSync(file) ? readFileSync(file, 'utf8') : '');
  return fold(events, { round: Number(round), rejected });
}

const short = (ev) =>
  ev.kind === 'item'
    ? `#${ev.item} → ${ev.phase}${ev.note ? ` · ${ev.note}` : ''}`
    : ev.kind === 'round'
      ? `round → ${ev.phase}${ev.note ? ` · ${ev.note}` : ''}`
      : `note · ${ev.note}`;

function watch(round) {
  const file = logPath(round);
  let offset = existsSync(file) ? statSync(file).size : 0;
  let carry = '';
  console.log(`watching ${file}`);
  setInterval(() => {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size <= offset) return;
    const buf = readFileSync(file).subarray(offset, size);
    offset = size;
    const text = carry + buf.toString('utf8');
    const lines = text.split('\n');
    carry = lines.pop();
    for (const line of lines) {
      try {
        console.log(short(JSON.parse(line)));
      } catch {
        console.log('(unreadable line)');
      }
    }
  }, 1000);
}

function main(argv) {
  const [cmd, round, ...rest] = argv;
  if (!cmd || !round || !/^\d+$/.test(round)) fail('usage: round-event.mjs <emit|note|state|page|watch|path> <round#> …');
  const { pos, flags } = parseArgs(rest);
  const t = new Date().toISOString();
  const data = flags.data !== undefined ? (() => {
    try {
      return JSON.parse(flags.data);
    } catch (e) {
      return fail(`--data is not JSON: ${e.message}`);
    }
  })() : undefined;

  if (cmd === 'emit') {
    const [kind, ...args] = pos;
    if (kind === 'round') append(round, { t, kind, phase: args[0], note: flags.note, data });
    else if (kind === 'item') append(round, { t, kind, item: args[0], phase: args[1], note: flags.note, data });
    else fail('emit takes `round <phase>` or `item <key> <phase>`');
  } else if (cmd === 'note') {
    append(round, { t, kind: 'note', note: pos.join(' ') });
  } else if (cmd === 'state') {
    const state = readState(round);
    const json = JSON.stringify(state, null, 1);
    if (flags.out) {
      writeFileSync(flags.out, json);
      console.log(`${flags.out} · ${state.counts.done}/${state.counts.total} items done · round ${state.phase ?? '(not started)'} · ${statsLine(state)}`);
    } else console.log(json);
  } else if (cmd === 'page') {
    if (!flags.out) fail('page needs --out');
    const title = `מעקב סבב #${round}`;
    writeFileSync(flags.out, readFileSync(TEMPLATE, 'utf8').replaceAll('{{TITLE}}', () => title));
    console.log(flags.out);
  } else if (cmd === 'watch') {
    watch(round);
  } else if (cmd === 'path') {
    console.log(logPath(round));
  } else fail(`unknown command «${cmd}»`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
