#!/usr/bin/env node
/**
 * Stop hook — "a fix is not done until the operator can play it."
 *
 * Operator rule (2026-07-27): whenever Claude reports a fix as complete/ready, a dev test server must
 * ALREADY be running, and the message must carry the URL plus the concrete test cases to try. Claude
 * forgetting is the failure mode this removes: the hook reads the message Claude just sent, and if it
 * announces a finished fix while nothing is serving the app, it BLOCKS the turn (exit 2) and hands the
 * instruction back.
 *
 * Fails OPEN by design — any error, missing transcript, or unreadable git state exits 0. A broken hook
 * must never wedge a session; the cost of a miss is a reminder Claude gives itself, the cost of a false
 * block is the operator's time.
 *
 * Wired in .claude/settings.json as a `Stop` hook. Manual check: `node scripts/ensure-test-server.mjs`.
 */
import { createConnection } from 'node:net';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Vite's default port, plus the few it falls forward to when one is taken. */
const PORTS = [5173, 5174, 5175, 5176];

/**
 * Phrases that mean "I am telling the operator a fix is finished". Deliberately narrow: a turn that
 * merely mentions testing, or reports a diagnosis with nothing shipped, must not trip this.
 */
const DONE_PATTERNS = [
  /\bfix(es|ed)? #\d+/i,
  /\b(fix|change|feature) is (now )?(complete|done|ready|in|live)\b/i,
  /\bready (for|to) (test|play|try)\b/i,
  /\bready to be tested\b/i,
  /\b(committed|pushed) (and|,) (pushed|committed)\b/i,
  /\bfull suite (is )?green\b/i,
  /\bsuite green\b.*\bbuild clean\b/i,
  /\bgo ahead and (test|play|try)\b/i,
];

/** Phrases that say the work is explicitly NOT finished — these veto the patterns above. */
const NOT_DONE_PATTERNS = [/\bnot fixed\b/i, /\breverted\b/i, /\bstill open\b/i, /\bdid not fix\b/i];

/**
 * BOTH loopback families, because which one the dev server binds is not ours to assume: on this Windows
 * box Vite listens on `::1` only and `127.0.0.1` is refused outright — a v4-only probe reported "no
 * server" with the server plainly running (caught by pipe-testing the hook before wiring it up).
 */
const connects = (port, host) =>
  new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(400);
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  });

const listening = async (port) => (await Promise.all([connects(port, '127.0.0.1'), connects(port, '::1')])).some(Boolean);

/** The newest session transcript for this project, when the hook input didn't name one. */
function newestTranscript() {
  const root = join(homedir(), '.claude', 'projects');
  let best = null;
  for (const proj of readdirSync(root)) {
    if (!/geo.?builder/i.test(proj)) continue;
    const dir = join(root, proj);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(dir, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  }
  return best?.p ?? null;
}

/** The text of the LAST assistant message in a transcript (JSONL, one event per line). */
function lastAssistantText(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let ev;
    try {
      ev = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const msg = ev?.message ?? ev;
    if (msg?.role !== 'assistant' && ev?.type !== 'assistant') continue;
    const content = msg?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
      if (text.trim()) return text;
    }
  }
  return '';
}

async function main() {
  let input = {};
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    /* no stdin (manual run) — carry on */
  }
  if (input.stop_hook_active) return 0; // never loop on our own block

  const path = input.transcript_path ?? newestTranscript();
  if (!path) return 0;
  const text = lastAssistantText(path);
  if (!text) return 0;
  if (NOT_DONE_PATTERNS.some((re) => re.test(text))) return 0;
  if (!DONE_PATTERNS.some((re) => re.test(text))) return 0;

  const ports = await Promise.all(PORTS.map(listening));
  const up = PORTS.filter((_, i) => ports[i]);
  if (up.length) {
    // Server is up — remind Claude to hand over the URL + cases only if the message names neither.
    if (/localhost:\d{4}/.test(text)) return 0;
    process.stderr.write(
      `A dev server is running at http://localhost:${up[0]}/ but your message did not give the operator the URL.\n` +
        `Reply with: the URL, and the concrete test cases (exact utterances to type + what to look for) that exercise this fix.\n`,
    );
    return 2;
  }

  process.stderr.write(
    `You reported a fix as ready, but NO dev test server is running (checked ports ${PORTS.join(', ')}).\n` +
      `Operator rule: a fix is not done until they can play it. Before replying:\n` +
      `  1. Start it in the background:  npm run dev\n` +
      `  2. Confirm it is serving, then give the operator the URL (http://localhost:5173/ by default).\n` +
      `  3. List the concrete test cases for THIS fix — the exact utterances to type, and what to look for\n` +
      `     (including any before/after comparison, e.g. prod vs localhost).\n`,
  );
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0)); // fail open — a broken hook must never wedge the session
