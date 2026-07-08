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
import { handleAdmin, aggregate, filterEvents, releasesOf, PROFILE_3D, type Stats } from '../admin';
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
