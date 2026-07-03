/**
 * Usage-event sink — validation, IP hashing, and append, NO network.
 *
 * The sink is best-effort and privacy-preserving: it stores a salted hash of the
 * IP (never the raw address), rejects malformed/oversized input, and appends one
 * JSON line per accepted event.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleLog, hashIp, pruneOldEvents } from '../eventLog';

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    end(s?: string) {
      this.body = s ?? '';
    },
  };
}

async function* chunks(parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}

function mockReq(method: string, ip: string, parts: string[] = [], headers: Record<string, string> = {}) {
  const req = chunks(parts) as AsyncGenerator<Buffer> & {
    method: string;
    socket: { remoteAddress: string };
    headers: Record<string, string>;
  };
  req.method = method;
  req.socket = { remoteAddress: ip };
  req.headers = headers;
  return req;
}

const run = (req: ReturnType<typeof mockReq>, res: ReturnType<typeof mockRes>, logPath: string, ip = 'salt') =>
  handleLog(req as unknown as IncomingMessage, res as unknown as ServerResponse, { ipSalt: ip, logPath });

let logPath = '';
beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'geo-events-'));
  logPath = path.join(dir, 'events.jsonl');
});
afterEach(async () => {
  if (logPath) await rm(path.dirname(logPath), { recursive: true, force: true }).catch(() => {});
});

describe('pruneOldEvents — age-based retention (SEC-7)', () => {
  const line = (ts: string, u: string) => JSON.stringify({ serverTs: ts, iph: 'h', ev: 'submit', utterance: u });
  it('drops events older than the cutoff and keeps recent ones', () => {
    const text = [line('2026-06-01T00:00:00Z', 'old'), line('2026-07-01T00:00:00Z', 'recent'), ''].join('\n');
    const cutoff = Date.parse('2026-06-25T00:00:00Z');
    const kept = pruneOldEvents(text, cutoff);
    expect(kept).toContain('recent');
    expect(kept).not.toContain('old');
    expect(kept.endsWith('\n')).toBe(true);
  });
  it('keeps an unparseable or undated line rather than losing data', () => {
    const text = ['not json', line('2020-01-01T00:00:00Z', 'ancient'), JSON.stringify({ ev: 'submit', utterance: 'nodate' }), ''].join('\n');
    const kept = pruneOldEvents(text, Date.parse('2026-01-01T00:00:00Z'));
    expect(kept).toContain('not json'); // malformed → kept
    expect(kept).toContain('nodate'); // no serverTs → kept
    expect(kept).not.toContain('ancient'); // dated + old → dropped
  });
  it('an all-old log prunes to empty (no stray blank line)', () => {
    const text = line('2020-01-01T00:00:00Z', 'x') + '\n';
    expect(pruneOldEvents(text, Date.parse('2026-01-01T00:00:00Z'))).toBe('');
  });
});

describe('hashIp', () => {
  it('is deterministic per (ip, salt) and not the raw ip', () => {
    const h = hashIp('203.0.113.7', 'salt-A');
    expect(h).toBe(hashIp('203.0.113.7', 'salt-A'));
    expect(h).not.toContain('203.0.113.7');
    expect(h).toHaveLength(16);
  });
  it('changes with the salt (rotating the salt resets visitor identity)', () => {
    expect(hashIp('203.0.113.7', 'salt-A')).not.toBe(hashIp('203.0.113.7', 'salt-B'));
  });
});

describe('concurrent prune + appends lose nothing (V1, review 2026-07-03)', () => {
  it('every 204-acknowledged event survives the daily prune rewrite', async () => {
    // The prune is a read-modify-write; before the writers were serialized, an append landing inside
    // its window was clobbered (an event that had already received its 204 vanished from the file).
    process.env.EVENTS_RETENTION_DAYS = '30';
    try {
      await writeFile(
        logPath,
        JSON.stringify({ serverTs: '2020-01-01T00:00:00Z', iph: 'h', ev: 'submit', utterance: 'ancient' }) + '\n',
        'utf8',
      );
      const N = 30;
      const codes = await Promise.all(
        Array.from({ length: N }, (_, i) => {
          const res = mockRes();
          return run(
            mockReq('POST', `10.0.1.${i % 250}`, [JSON.stringify({ ev: 'submit', utterance: `probe-${i}` })]),
            res,
            logPath,
          ).then(() => res.statusCode);
        }),
      );
      expect(codes.every((c) => c === 204)).toBe(true);
      const text = await readFile(logPath, 'utf8');
      for (let i = 0; i < N; i++) expect(text, `event probe-${i} was acknowledged and must survive`).toContain(`probe-${i}`);
      expect(text).not.toContain('ancient'); // the prune itself still ran
    } finally {
      delete process.env.EVENTS_RETENTION_DAYS;
    }
  });
});

describe('handleLog', () => {
  it('rejects a non-POST with 405', async () => {
    const res = mockRes();
    await run(mockReq('GET', '10.0.0.1'), res, logPath);
    expect(res.statusCode).toBe(405);
  });

  it('caps the body with 413', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.2', ['x'.repeat(9000)]), res, logPath);
    expect(res.statusCode).toBe(413);
  });

  it('rejects bad JSON with 400', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.3', ['not json']), res, logPath);
    expect(res.statusCode).toBe(400);
  });

  it('drops an event with an unknown `ev` with 400', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.4', [JSON.stringify({ ev: 'hack', utterance: 'x' })]), res, logPath);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a submit, hashes the IP, and appends one line (no raw IP stored)', async () => {
    const res = mockRes();
    const ev = { ev: 'submit', sid: 'abc123', t: '2026-06-28T10:00:00.000Z', utterance: 'square ABCD', locale: 'en', source: 'parser' };
    await run(mockReq('POST', '198.51.100.9', [JSON.stringify(ev)], { 'x-forwarded-for': '198.51.100.9' }), res, logPath, 'the-salt');
    expect(res.statusCode).toBe(204);

    const text = await readFile(logPath, 'utf8');
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(1);
    const stored = JSON.parse(lines[0]);
    expect(stored.ev).toBe('submit');
    expect(stored.utterance).toBe('square ABCD');
    expect(stored.iph).toBe(hashIp('198.51.100.9', 'the-salt'));
    expect(stored.serverTs).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain('198.51.100.9'); // raw IP never persisted
  });

  it('keeps only lean fields (drops anything extra the client sent)', async () => {
    const res = mockRes();
    const ev = { ev: 'submit', utterance: 'x', evil: 'payload', commands: [{ big: 'object' }] };
    await run(mockReq('POST', '10.0.0.7', [JSON.stringify(ev)]), res, logPath);
    const stored = JSON.parse((await readFile(logPath, 'utf8')).trim());
    expect(stored.evil).toBeUndefined();
    expect(stored.commands).toBeUndefined();
  });
});
