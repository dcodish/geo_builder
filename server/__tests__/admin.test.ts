/**
 * Admin dashboard — auth gate + aggregation, NO network.
 *
 * Verifies the stateless signed-cookie session (login → cookie → guard, tampering
 * rejected) and that `aggregate` turns a fixed event log into the right numbers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleAdmin, aggregate, type Stats } from '../admin';
import type { UsageEvent } from '../eventLog';

const OPTS = { username: 'teacher', password: 's3cret', cookieSecret: 'sign-me', base: '/admin' };

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(s?: string) {
      this.body = s ?? '';
    },
  };
}

async function* chunks(parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}

function mockReq(method: string, url: string, parts: string[] = [], headers: Record<string, string> = {}) {
  const req = chunks(parts) as AsyncGenerator<Buffer> & {
    method: string;
    url: string;
    socket: { remoteAddress: string };
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = headers;
  return req;
}

const run = (req: ReturnType<typeof mockReq>, res: ReturnType<typeof mockRes>, logPath: string) =>
  handleAdmin(req as unknown as IncomingMessage, res as unknown as ServerResponse, { ...OPTS, logPath });

function cookieFrom(setCookie: string): string {
  return setCookie.split(';')[0]; // "geo_admin=VALUE"
}

let logPath = '';
beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'geo-admin-'));
  logPath = path.join(dir, 'events.jsonl');
  await writeFile(logPath, '', 'utf8');
});
afterEach(async () => {
  if (logPath) await rm(path.dirname(logPath), { recursive: true, force: true }).catch(() => {});
});

describe('admin auth gate', () => {
  it('shows the login form (not the dashboard) with no cookie', async () => {
    const res = mockRes();
    await run(mockReq('GET', '/admin'), res, logPath);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('כניסת מנהל'); // login heading
    expect(res.body).not.toContain('מבקרים ייחודיים'); // a dashboard-only marker (the <title> shares 'דוח שימוש')
  });

  it('rejects wrong credentials with 401 and re-shows the form', async () => {
    const res = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=wrong']), res, logPath);
    expect(res.statusCode).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('accepts correct credentials, sets an HttpOnly cookie, and redirects', async () => {
    const res = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), res, logPath);
    expect(res.statusCode).toBe(303);
    const sc = res.headers['set-cookie'];
    expect(sc).toContain('geo_admin=');
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('Path=/admin');
    expect(res.headers['location']).toBe('/admin');
  });

  it('serves the dashboard with a valid cookie from login', async () => {
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);

    const res = mockRes();
    await run(mockReq('GET', '/admin', [], { cookie }), res, logPath);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('דוח שימוש'); // dashboard heading
  });

  it('rejects a tampered cookie (falls back to the login form)', async () => {
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const good = cookieFrom(login.headers['set-cookie']);
    const tampered = good.slice(0, -2) + (good.endsWith('aa') ? 'bb' : 'aa');

    const res = mockRes();
    await run(mockReq('GET', '/admin', [], { cookie: tampered }), res, logPath);
    expect(res.body).toContain('כניסת מנהל');
  });

  it('logout clears the cookie', async () => {
    const res = mockRes();
    await run(mockReq('GET', '/admin/logout'), res, logPath);
    expect(res.statusCode).toBe(303);
    expect(res.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('never authenticates when no password is configured', async () => {
    const res = mockRes();
    await handleAdmin(
      mockReq('POST', '/admin/login', ['username=&password=']) as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      { username: '', password: '', cookieSecret: 'x', base: '/admin', logPath },
    );
    expect(res.statusCode).toBe(401);
  });
});

describe('aggregate', () => {
  const sample: UsageEvent[] = [
    { serverTs: '2026-06-20T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1' },
    { serverTs: '2026-06-20T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser', result: 'ok' },
    { serverTs: '2026-06-20T09:02:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser', result: 'ok' },
    { serverTs: '2026-06-21T11:00:00Z', iph: 'h2', ev: 'session', sid: 's2' },
    { serverTs: '2026-06-21T11:01:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'draw a weird thing', locale: 'en', source: 'llm', result: 'ok' },
    { serverTs: '2026-06-21T11:02:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'gibberish xyz', locale: 'en', source: 'llm', result: 'not-understood' },
  ];

  let s: Stats;
  beforeEach(() => {
    s = aggregate(sample);
  });

  it('counts unique visitors and sessions by distinct hash/sid', () => {
    expect(s.visitors).toBe(2);
    expect(s.sessions).toBe(2);
  });

  it('counts submits and LLM fallbacks', () => {
    expect(s.submits).toBe(4);
    expect(s.llmFallbacks).toBe(2);
  });

  it('classifies outcomes from source + result', () => {
    const by = Object.fromEntries(s.outcomes.map((o) => [o.key, o.count]));
    expect(by.parsed).toBe(2);
    expect(by['llm-built']).toBe(1);
    expect(by['not-understood']).toBe(1);
  });

  it('splits language and ranks top utterances', () => {
    expect(s.langs.he).toBe(2);
    expect(s.langs.en).toBe(2);
    expect(s.topUtterances[0]).toEqual({ utterance: 'ריבוע ABCD', count: 2 });
  });

  it('buckets activity by day', () => {
    expect(s.byDay.map((d) => d.day)).toEqual(['2026-06-20', '2026-06-21']);
    expect(s.byDay[0].submits).toBe(2);
  });

  it('returns recent submits newest-first', () => {
    expect(s.recent[0].utterance).toBe('gibberish xyz');
    expect(s.recent).toHaveLength(4);
  });

  it('handles an empty log without throwing', () => {
    const empty = aggregate([]);
    expect(empty.visitors).toBe(0);
    expect(empty.outcomes).toEqual([]);
  });
});
