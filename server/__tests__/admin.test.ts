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
import { handleAdmin, aggregate, filterEvents, releasesOf, readVerdicts, sessionsOf, unattributedCount, formatCommands, PROFILE_3D, type Stats } from '../admin';
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

// Each request gets a UNIQUE client IP by default, so the module-level login rate-limiter (SEC-6) doesn't
// accumulate across tests and spuriously 429 a later login. A test that needs several requests to share a
// client (the brute-force test) passes an explicit `x-forwarded-for`.
let ipCounter = 0;
function mockReq(method: string, url: string, parts: string[] = [], headers: Record<string, string> = {}) {
  const req = chunks(parts) as AsyncGenerator<Buffer> & {
    method: string;
    url: string;
    socket: { remoteAddress: string };
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.socket = { remoteAddress: `10.9.0.${ipCounter++}` };
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
    expect(res.body).toContain('console.anthropic.com/settings/usage'); // API-cost link
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

  it('rate-limits admin-login brute-force per IP (SEC-6)', async () => {
    // All attempts share ONE client IP (fixed XFF), so the 11th+ within the window is throttled.
    let last = mockRes();
    for (let i = 0; i < 12; i++) {
      last = mockRes();
      await run(mockReq('POST', '/admin/login', ['username=teacher&password=wrong'], { 'x-forwarded-for': '198.51.100.7' }), last, logPath);
    }
    expect(last.statusCode).toBe(429); // throttled (not another 401) once over the per-IP attempt limit
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

  // SEC-3: a forged/valid cookie must NOT reach the dashboard when the server has no cookie secret
  // configured. Previously the secret fell back to a committed default, so a cookie forged under that
  // default authenticated even with a blank password ("effectively locked" was not actually locked).
  it('rejects a well-formed cookie when the server cookie secret is UNSET (fail-closed, SEC-3)', async () => {
    // Mint a valid cookie against the real secret via a properly-configured server…
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    // …then present it to a server whose cookieSecret is EMPTY (the unconfigured production default now).
    const res = mockRes();
    await handleAdmin(
      mockReq('GET', '/admin', [], { cookie }) as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      { username: 'teacher', password: 's3cret', cookieSecret: '', base: '/admin', logPath },
    );
    expect(res.body).toContain('כניסת מנהל'); // login form, NOT the dashboard
    expect(res.body).not.toContain('מבקרים ייחודיים'); // a dashboard-only marker (the <title> shares 'דוח שימוש')
  });

  it('login is refused (401) when the cookie secret is unset, even with correct credentials (SEC-3)', async () => {
    const res = mockRes();
    await handleAdmin(
      mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']) as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      { username: 'teacher', password: 's3cret', cookieSecret: '', base: '/admin', logPath },
    );
    expect(res.statusCode).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
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
    // Two deliberately out-of-scope inputs (the SPA tags these `scope:<category>`, source 'scope').
    { serverTs: '2026-06-21T11:03:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'זוויות מתחלפות', locale: 'he', source: 'scope', result: 'scope:angle-relation' },
    { serverTs: '2026-06-21T11:04:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'הוכח שהמשולש שווה שוקיים', locale: 'he', source: 'scope', result: 'scope:proof' },
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
    expect(s.submits).toBe(6);
    expect(s.llmFallbacks).toBe(2); // the two `scope` events are NOT LLM fallbacks
  });

  it('classifies outcomes from source + result', () => {
    const by = Object.fromEntries(s.outcomes.map((o) => [o.key, o.count]));
    expect(by.parsed).toBe(2);
    expect(by['llm-built']).toBe(1);
    expect(by['not-understood']).toBe(1); // a genuine gap — NOT inflated by the out-of-scope inputs
    expect(by['out-of-scope']).toBe(2);
  });

  it('separates real gaps (to implement) from out-of-scope (no need)', () => {
    expect(s.realGaps).toBe(1); // only the genuine `not-understood`
    expect(s.outOfScope).toBe(2);
  });

  it('breaks out-of-scope down by sub-category', () => {
    const by = Object.fromEntries(s.scopeBreakdown.map((o) => [o.key, o.count]));
    expect(by['angle-relation']).toBe(1);
    expect(by.proof).toBe(1);
    expect(by.compute).toBeUndefined(); // none in the sample → filtered out
  });

  it('builds the per-card drill-down lists (utterances behind the counts)', () => {
    expect(s.gapUtterances).toEqual([
      { utterance: 'gibberish xyz', count: 1, locale: 'en', lastSeen: '2026-06-21T11:02:00Z' },
    ]);
    expect(s.scopeUtterances.map((r) => r.utterance).sort()).toEqual(['הוכח שהמשולש שווה שוקיים', 'זוויות מתחלפות']);
  });

  it('splits language and ranks top utterances', () => {
    expect(s.langs.he).toBe(4);
    expect(s.langs.en).toBe(2);
    expect(s.topUtterances[0]).toEqual({ utterance: 'ריבוע ABCD', count: 2 });
  });

  it('buckets activity by day', () => {
    expect(s.byDay.map((d) => d.day)).toEqual(['2026-06-20', '2026-06-21']);
    expect(s.byDay[0].submits).toBe(2);
  });

  it('returns recent submits newest-first', () => {
    expect(s.recent[0].utterance).toBe('הוכח שהמשולש שווה שוקיים');
    expect(s.recent).toHaveLength(6);
  });

  it('handles an empty log without throwing', () => {
    const empty = aggregate([]);
    expect(empty.visitors).toBe(0);
    expect(empty.outcomes).toEqual([]);
  });

  it("files a proxy-throttle submit (source 'limit') under its own bucket, not 'edit' (V2, review 2026-07-03)", () => {
    // The SEC-2 tag exists so the operator can SEE how often the daily ceiling / per-IP limit fires;
    // the old unknown-source fallback buried it in the rename/merge 'edit' bar.
    const throttled = aggregate([
      { serverTs: '2026-06-22T10:00:00Z', iph: 'h3', ev: 'submit', sid: 's3', utterance: 'משולש ABC', locale: 'he', source: 'limit', result: 'daily-limit' },
      { serverTs: '2026-06-22T10:01:00Z', iph: 'h3', ev: 'submit', sid: 's3', utterance: 'swap C and D', locale: 'en', source: 'swap', result: 'ok' },
    ]);
    const by = Object.fromEntries(throttled.outcomes.map((o) => [o.key, o.count]));
    expect(by.throttled).toBe(1);
    expect(by.edit).toBe(1); // real edits still land in edit
  });
});

describe('the 3-D dashboard profile (PROFILE_3D)', () => {
  // The 3-D SPA logs only `parser` / `llm` sources; a non-ok parser result is a REASONED refusal code.
  const sample3: UsageEvent[] = [
    { serverTs: '2026-07-08T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1' },
    { serverTs: '2026-07-08T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'קובייה ABCDA׳B׳C׳D׳', locale: 'he', source: 'parser', result: 'ok' },
    { serverTs: '2026-07-08T09:02:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'מנסרה נטויה', locale: 'he', source: 'parser', result: 'oblique-prism' },
    { serverTs: '2026-07-08T09:03:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'AM = u + v', locale: 'en', source: 'parser', result: 'claim-refuted' },
    { serverTs: '2026-07-08T09:04:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'weird solid', locale: 'en', source: 'llm', result: 'ok' },
    { serverTs: '2026-07-08T09:05:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'gibberish', locale: 'en', source: 'llm', result: 'not-understood' },
  ];

  it('classifies parsed / llm-built / refused / real-gap from the 3-D source+result', () => {
    const by = Object.fromEntries(aggregate(sample3, PROFILE_3D).outcomes.map((o) => [o.key, o.count]));
    expect(by.parsed).toBe(1);
    expect(by.refused).toBe(2); // oblique-prism + claim-refuted — honest refusals, NOT gaps
    expect(by['llm-built']).toBe(1);
    expect(by['not-understood']).toBe(1); // the only real gap to implement
  });

  it('the two clickable cards are the real gaps and the reasoned refusals', () => {
    const s = aggregate(sample3, PROFILE_3D);
    expect(s.realGaps).toBe(1);
    expect(s.outOfScope).toBe(2); // the secondary bucket = refusals for the 3-D profile
    expect(s.gapUtterances.map((r) => r.utterance)).toEqual(['gibberish']);
    expect(s.scopeUtterances.map((r) => r.utterance).sort()).toEqual(['AM = u + v', 'מנסרה נטויה']);
  });

  it('breaks refusals down by their code (each labelled)', () => {
    const by = Object.fromEntries(aggregate(sample3, PROFILE_3D).scopeBreakdown.map((o) => [o.key, o.count]));
    expect(by['oblique-prism']).toBe(1);
    expect(by['claim-refuted']).toBe(1);
  });

  it('the dashboard renders the 3-D title with a valid cookie', async () => {
    // seed the 3-D events file, then log in and fetch the dashboard against the 3-D profile
    const dir = await mkdtemp(path.join(tmpdir(), 'geo-admin3-'));
    const log3 = path.join(dir, 'events-3d.jsonl');
    await writeFile(log3, sample3.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    try {
      const login = mockReq('POST', '/admin3/login', ['username=teacher&password=s3cret'], {
        'content-type': 'application/x-www-form-urlencoded',
      });
      const loginRes = mockRes();
      await handleAdmin(login as unknown as IncomingMessage, loginRes as unknown as ServerResponse, {
        ...OPTS,
        base: '/admin3',
        logPath: log3,
        profile: PROFILE_3D,
      });
      const cookie = cookieFrom(loginRes.headers['set-cookie']);
      const dashReq = mockReq('GET', '/admin3', [], { cookie });
      const dashRes = mockRes();
      await handleAdmin(dashReq as unknown as IncomingMessage, dashRes as unknown as ServerResponse, {
        ...OPTS,
        base: '/admin3',
        logPath: log3,
        profile: PROFILE_3D,
      });
      expect(dashRes.statusCode).toBe(200);
      expect(dashRes.body).toContain('3D Builder — דוח שימוש');
      expect(dashRes.body).toContain('סירובים מנומקים'); // the 3-D secondary card label
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('dashboard filtering (release + date)', () => {
  // two releases: r1 (an old build whose fixed error type still appears) and r2 (the post-fix build)
  const evs: UsageEvent[] = [
    { serverTs: '2026-06-20T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1', rel: 'r1' },
    { serverTs: '2026-06-20T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'E על המיתר AC', locale: 'he', source: 'llm', result: 'not-understood', rel: 'r1' },
    { serverTs: '2026-06-29T10:00:00Z', iph: 'h2', ev: 'session', sid: 's2', rel: 'r2' },
    { serverTs: '2026-06-29T10:01:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser', result: 'ok', rel: 'r2' },
  ];

  it('filterEvents by `since` keeps only events on/after that day', () => {
    expect(filterEvents(evs, { since: '2026-06-29' })).toHaveLength(2);
    expect(filterEvents(evs, { since: '2026-06-20' })).toHaveLength(4);
  });

  it('filterEvents by `rel` keeps only that release; "all" keeps everything', () => {
    expect(filterEvents(evs, { rel: 'r2' })).toHaveLength(2);
    expect(filterEvents(evs, { rel: 'all' })).toHaveLength(4);
  });

  it('releasesOf lists distinct releases, most-recent-first', () => {
    expect(releasesOf(evs)).toEqual(['r2', 'r1']);
  });

  it('renders the filter bar with each release as an option', async () => {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    const res = mockRes();
    await run(mockReq('GET', '/admin', [], { cookie }), res, logPath);
    expect(res.body).toContain('class="filters"');
    expect(res.body).toContain('<option value="r2"');
    expect(res.body).toContain('<option value="r1"');
  });

  it('filtering by ?rel=r2 drops the old release\'s events (the fixed error type disappears)', async () => {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    const res = mockRes();
    await run(mockReq('GET', '/admin?rel=r2', [], { cookie }), res, logPath);
    expect(res.body).toContain('מסונן'); // "filtered" marker shown
    expect(res.body).toContain('ריבוע ABCD'); // r2's utterance is present
    expect(res.body).not.toContain('E על המיתר AC'); // r1's (fixed) failure is filtered out
  });
});

describe('drill-down into the real-gap / out-of-scope cards', () => {
  const evs: UsageEvent[] = [
    { serverTs: '2026-06-20T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1' },
    { serverTs: '2026-06-20T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'a real gap here', locale: 'en', source: 'llm', result: 'not-understood' },
    { serverTs: '2026-06-28T09:02:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'זוויות מתחלפות', locale: 'he', source: 'scope', result: 'scope:angle-relation' },
  ];

  async function dash(url: string) {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    const res = mockRes();
    await run(mockReq('GET', url, [], { cookie }), res, logPath);
    return res;
  }

  it('the real-gaps card is a clickable link to ?view=gaps', async () => {
    const res = await dash('/admin');
    expect(res.body).toContain('cardlink');
    expect(res.body).toContain('view=gaps');
    expect(res.body).not.toContain('משפטים שלא הובנו'); // the drill panel is NOT rendered until opened
  });

  it('?view=gaps opens the drill panel listing the gap utterances', async () => {
    const res = await dash('/admin?view=gaps');
    expect(res.body).toContain('פערים אמיתיים — משפטים שלא הובנו'); // the drill panel title
    expect(res.body).toContain('a real gap here');
  });

  it('?view=scope opens the out-of-scope drill panel', async () => {
    const res = await dash('/admin?view=scope');
    expect(res.body).toContain('מחוץ לתחום — משפטים');
    expect(res.body).toContain('זוויות מתחלפות');
  });

  it('the drill respects the active date filter (no gaps in a later window)', async () => {
    const res = await dash('/admin?view=gaps&since=2026-06-25');
    expect(res.body).toContain('אין פריטים'); // the gap is older than `since` → empty drill
    expect(res.body).not.toContain('a real gap here');
  });

  it('the filter form preserves the open view (changing the date keeps the drill open)', async () => {
    const res = await dash('/admin?view=gaps');
    expect(res.body).toContain('<input type="hidden" name="view" value="gaps">');
  });

  it('ignores an unknown view value', async () => {
    const res = await dash('/admin?view=bogus');
    expect(res.body).not.toContain('משפטים שלא הובנו');
  });
});

describe('#183 — the gap card re-verifies against the triage verdict map', () => {
  const evs: UsageEvent[] = [
    { serverTs: '2026-07-01T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1' },
    { serverTs: '2026-07-01T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'גובה מ B', locale: 'he', source: 'llm', result: 'not-understood' },
    { serverTs: '2026-07-02T09:01:00Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'גובה מ B', locale: 'he', source: 'llm', result: 'not-understood' },
    { serverTs: '2026-07-03T09:01:00Z', iph: 'h3', ev: 'submit', sid: 's3', utterance: 'משהו שעדיין נכשל', locale: 'he', source: 'llm', result: 'not-understood' },
  ];

  async function dashWith(verdicts: object | string | null, url = '/admin?view=gaps') {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    if (verdicts !== null) {
      const body = typeof verdicts === 'string' ? verdicts : JSON.stringify(verdicts);
      await writeFile(path.join(path.dirname(logPath), 'verdicts-2d.json'), body, 'utf8');
    }
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    const res = mockRes();
    await run(mockReq('GET', url, [], { cookie }), res, logPath);
    return res;
  }

  it('readVerdicts: absent → null, torn → null, valid → parsed', async () => {
    expect(await readVerdicts(path.join(path.dirname(logPath), 'nope.json'))).toBeNull();
    const torn = path.join(path.dirname(logPath), 'torn.json');
    await writeFile(torn, '{"rev": "abc", "verd', 'utf8');
    expect(await readVerdicts(torn)).toBeNull();
    const good = path.join(path.dirname(logPath), 'good.json');
    await writeFile(good, JSON.stringify({ rev: 'abc1234', generatedAt: '2026-07-17T10:00:00Z', verdicts: { 'x': 'built' } }), 'utf8');
    expect((await readVerdicts(good))?.rev).toBe('abc1234');
  });

  it('with NO verdict file the drill says plainly that nothing was re-verified', async () => {
    const res = await dashWith(null);
    expect(res.body).toContain('אין נתוני אימות');
    expect(res.body).toContain('גובה מ B'); // both rows still listed as-is
    expect(res.body).toContain('משהו שעדיין נכשל');
  });

  it('a verified-BUILT row moves out of the worklist into «תוקן מאז», the rest carry their verdict', async () => {
    const res = await dashWith({
      rev: 'abc1234',
      generatedAt: '2026-07-17T10:00:00Z',
      verdicts: { 'גובה מ B': 'built', 'משהו שעדיין נכשל': 'not-handled' },
    });
    expect(res.body).toContain('נבדק מחדש מול הקוד הנוכחי');
    expect(res.body).toContain('abc1234'); // the revision is visible, so staleness is judgeable
    expect(res.body).toContain('תוקן מאז — נבנה בקוד הנוכחי (1)');
    expect(res.body).toContain('✗ עדיין פער'); // the open row's current verdict
    // the fixed section lists the fixed utterance AFTER the open table (moved, not annotated in place)
    expect(res.body.indexOf('משהו שעדיין נכשל')).toBeLessThan(res.body.indexOf('גובה מ B'));
  });

  it('the gap CARD shows the still-open count (prod events minus verified-built ones)', async () => {
    const res = await dashWith(
      { rev: 'abc1234', generatedAt: '2026-07-17T10:00:00Z', verdicts: { 'גובה מ B': 'built' } },
      '/admin',
    );
    // 3 gap events total, 2 of them the fixed utterance → the card reads 1 with the fixed note
    expect(res.body).toContain('תוקנו מאז: 2');
    expect(res.body).toMatch(/<div class="n">1<\/div><div class="l">פערים אמיתיים/);
  });

  it('an unknown verdict for a listed row renders as unknown (—), never as fixed', async () => {
    const res = await dashWith({ rev: 'abc1234', generatedAt: '2026-07-17T10:00:00Z', verdicts: {} });
    expect(res.body).toContain('נבדק מחדש מול הקוד הנוכחי');
    expect(res.body).not.toContain('תוקן מאז');
    expect(res.body).toContain('גובה מ B');
  });
});

describe('#470 — the sessions view (what one visit typed, in order)', () => {
  // Two interleaved sessions + one unattributable event: flat time order tells you nothing about either.
  const evs: UsageEvent[] = [
    { serverTs: '2026-06-20T09:00:00Z', iph: 'h1', ev: 'session', sid: 's1', rel: 'abc123' },
    { serverTs: '2026-06-20T09:00:30Z', iph: 'h2', ev: 'session', sid: 's2', rel: 'abc123' },
    { serverTs: '2026-06-20T09:01:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser' },
    { serverTs: '2026-06-20T09:01:30Z', iph: 'h2', ev: 'submit', sid: 's2', utterance: 'other session line', locale: 'en', source: 'parser' },
    { serverTs: '2026-06-20T09:02:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'נקודה G על AD', locale: 'he', source: 'llm', result: 'ok', commands: '["point G on AD"]' },
    { serverTs: '2026-06-20T09:02:30Z', iph: 'h1', ev: 'action', sid: 's1', action: 'show-another', detail: 'seed=7', result: 'changed' },
    { serverTs: '2026-06-20T09:03:00Z', iph: 'h1', ev: 'submit', sid: 's1', utterance: 'משהו שלא הובן', locale: 'he', source: 'llm', result: 'not-understood' },
    { serverTs: '2026-06-20T09:04:00Z', iph: 'h9', ev: 'submit', utterance: 'no session id', locale: 'he', source: 'parser' },
  ];

  async function dash(url: string) {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const cookie = cookieFrom(login.headers['set-cookie']);
    const res = mockRes();
    await run(mockReq('GET', url, [], { cookie }), res, logPath);
    return res;
  }

  /** Just the sessions PANEL — the page below it (recent activity, top utterances) repeats the same text. */
  const panel = (body: string) => {
    const from = body.indexOf('סשנים — מה הוקלד');
    return from < 0 ? '' : body.slice(from, body.indexOf('פעילות יומית', from));
  };

  it('sessionsOf groups by sid, keeps log order inside a session, and counts submits + gaps', () => {
    const rows = sessionsOf(evs);
    expect(rows.map((r) => r.sid)).toEqual(['s2', 's1']); // newest-started session first (s2 loaded 30 s after s1)
    const s1 = rows.find((r) => r.sid === 's1')!;
    expect(s1.submits).toBe(3);
    expect(s1.gaps).toBe(1); // the llm/not-understood one
    expect(s1.locale).toBe('he');
    expect(s1.rel).toBe('abc123');
    expect(s1.start).toBe('2026-06-20T09:00:00Z');
    expect(s1.end).toBe('2026-06-20T09:03:00Z');
    // the `session` page-load marker bounds the session but is not a step; the action IS one, in place
    expect(s1.steps.map((st) => st.ev)).toEqual(['submit', 'submit', 'action', 'submit']);
    expect(s1.steps.map((st) => st.utterance ?? st.action)).toEqual(['ריבוע ABCD', 'נקודה G על AD', 'show-another', 'משהו שלא הובן']);
    expect(s1.steps[1].commands).toBe('["point G on AD"]');
    expect(s1.steps[3].outcome).toBe('not-understood');
  });

  it('an event with no sid is never folded into a fake session — it is counted instead', () => {
    expect(sessionsOf(evs).some((r) => r.steps.some((s) => s.utterance === 'no session id'))).toBe(false);
    expect(unattributedCount(evs)).toBe(1);
  });

  it('the sessions card links to ?view=sessions and the panel is not rendered until opened', async () => {
    const res = await dash('/admin');
    expect(res.body).toContain('view=sessions');
    expect(res.body).not.toContain('סשנים — מה הוקלד');
  });

  it('?view=sessions renders each session with its ordered steps, LLM commands and actions', async () => {
    const res = await dash('/admin?view=sessions');
    expect(res.body).toContain('סשנים — מה הוקלד'); // panel title
    expect(res.body).toContain('ריבוע ABCD');
    expect(res.body).toContain('↳ point G on AD'); // the committed commands, flattened readably
    expect(res.body).toContain('["point G on AD"]'.replace(/"/g, '&quot;')); // …with the raw JSON kept in the title
    expect(res.body).toContain('show-another'); // the store action sits inside the timeline
    expect(res.body).toContain('seed=7');
    expect(res.body).toContain('1 אירועים ללא מזהה סשן'); // the unattributable event is stated, not dropped silently
    // s1's steps live inside s1's OWN block (after its id, and after the whole s2 block), in typed order
    const s1Block = panel(res.body).slice(panel(res.body).indexOf('>s1<'));
    expect(s1Block.indexOf('ריבוע ABCD')).toBeGreaterThan(-1);
    expect(s1Block.indexOf('ריבוע ABCD')).toBeLessThan(s1Block.indexOf('משהו שלא הובן'));
    expect(s1Block).not.toContain('other session line'); // s2 is a separate block, rendered before s1
  });

  it('?sid= pins one session (open) and hides the others', async () => {
    const res = await dash('/admin?view=sessions&sid=s1');
    expect(panel(res.body)).toContain('ריבוע ABCD');
    expect(panel(res.body)).not.toContain('other session line');
    expect(panel(res.body)).toContain('<details class="sess" open>');
  });

  it('an unknown session id says so honestly instead of showing an empty list', async () => {
    const res = await dash('/admin?view=sessions&sid=nope');
    expect(panel(res.body)).toContain('לא נמצא סשן');
    expect(panel(res.body)).not.toContain('ריבוע ABCD');
  });

  it('the sessions view respects the date filter', async () => {
    const res = await dash('/admin?view=sessions&since=2026-06-25');
    expect(panel(res.body)).toContain('אין סשנים בטווח');
    expect(panel(res.body)).not.toContain('ריבוע ABCD');
  });

  it('recent activity links each row to its session', async () => {
    const res = await dash('/admin');
    expect(res.body).toContain('view=sessions&sid=s1');
  });

  it('formatCommands flattens both products’ shapes and never hides an unparseable one', () => {
    // 2-D: an array of command objects
    expect(formatCommands('[{"type":"segment","a":"A","b":"C"},{"type":"point-on-segment","id":"B","a":"A","b":"C"}]')).toBe(
      'segment A C · point-on-segment B A C',
    );
    // 3-D: an array of canonical lines
    expect(formatCommands('["ABCD.EFGH קובייה","AB=u"]')).toBe('ABCD.EFGH קובייה · AB=u');
    // truncated by the 900-char cap / not JSON at all → shown verbatim, never swallowed
    expect(formatCommands('[{"type":"segm')).toBe('[{"type":"segm');
    expect(formatCommands('{"type":"segment"}')).toBe('{"type":"segment"}');
  });

  it('the 3-D profile classifies a session’s steps with its OWN outcome labels', () => {
    const rows = sessionsOf(
      [
        { serverTs: '2026-06-20T09:00:00Z', iph: 'h1', ev: 'session', sid: 'x1' },
        { serverTs: '2026-06-20T09:01:00Z', iph: 'h1', ev: 'submit', sid: 'x1', utterance: 'מנסרה נטויה', locale: 'he', source: 'parser', result: 'oblique-prism' },
      ],
      PROFILE_3D,
    );
    expect(rows[0].steps[0].outcome).toBe('refused'); // a reasoned refusal, NOT a gap
    expect(rows[0].gaps).toBe(0);
  });
});

describe('#470 — a session that spans midnight states its end DATE (not a bare HH:MM)', () => {
  const evs: UsageEvent[] = [
    { serverTs: '2026-06-20T23:50:00Z', iph: 'h1', ev: 'session', sid: 'n1' },
    { serverTs: '2026-06-21T00:10:00Z', iph: 'h1', ev: 'submit', sid: 'n1', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser' },
  ];

  it('renders the full end timestamp when the session ends on a later day', async () => {
    await writeFile(logPath, evs.map((e) => JSON.stringify(e)).join('\n'), 'utf8');
    const login = mockRes();
    await run(mockReq('POST', '/admin/login', ['username=teacher&password=s3cret']), login, logPath);
    const res = mockRes();
    await run(mockReq('GET', '/admin?view=sessions', [], { cookie: cookieFrom(login.headers['set-cookie']) }), res, logPath);
    expect(res.body).toContain('→ 2026-06-21 00:10'); // not a bare "00:10", which would read as running backwards
  });
});
