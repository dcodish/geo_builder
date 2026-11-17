/**
 * #2868 (ADR-W-209) — the management console: the section builders over recorded data, the action allow-list,
 * the writes against a fake GitHub, the login (username + password), CSRF, and the readiness rules.
 */
import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyEdit, planAction, runWrites } from '../ops/actions';
import { csrfFor, makeSession, validSession, SESSION_MS } from '../ops/auth';
import { makeGh, type GhClient } from '../ops/github';
import { handleManagement, type ManagementOpts } from '../ops/handler';
import { backlog, cost, ledger, makeCtx, needsMe, optionsOf, pace, playBlocks, proposedLines, readiness, section, sinceLast, wsRow, type Plan } from '../ops/sections';
import { closesOf, deployRows, newestProdTag, type Issue, type Snapshot } from '../ops/snapshot';
import { BUILDERS, builderUsage, issueFor } from '../ops/usage';
import { t } from '../ops/text';
import type { UsageEvent } from '../eventLog';
// @ts-expect-error — a plain .mjs script; its pure exports are what is tested
import { memberVerdicts, questionState } from '../../scripts/ops/readiness.mjs';

const NOW = new Date('2026-11-13T10:00:00Z');

const issue = (n: number, over: Partial<Issue> = {}): Issue => ({
  n, title: `issue ${n}`, open: true, labels: [], body: '', created: '2026-11-01T00:00:00Z', closed: null,
  updated: '2026-11-12T00:00:00Z', reason: null, comments: 0, ...over,
});

const PLAN: Plan = {
  title: 'תוכנית', start: '2026-10-27', end: '2026-12-20',
  weeks: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, from: new Date(Date.UTC(2026, 9, 27 + (n - 1) * 7)).toISOString().slice(0, 10), label: `w${n}` })),
  groups: [{ p: 'an', label: 'אנליטית' }],
  workstreams: [
    { id: 'a', p: 'an', name: 'A', from: 1, to: 2, issues: [1, 2] },
    { id: 'b', p: 'an', name: 'B', from: 2, to: 5, issues: [3, 4, 5, 6] },
    { id: 'c', p: 'an', name: 'C', from: 5, to: 6, issues: [7] },
    { id: 'm', p: 'an', name: 'M', from: 3, to: 3, issues: [], milestone: true },
  ],
  pulled: [{ issue: 9, week: 3, at: '2026-11-10', by: 'operator' }],
};

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    asOf: NOW.toISOString(), open: [], recent: [], parked: [], prs: [], commits: [], live: null, deploys: [], rounds: [],
    files: { plan: PLAN, units: null, readiness: null, directions: null, spotAudits: null }, errors: [], ...over,
  };
}

// ── parsing ──────────────────────────────────────────────────────────────────

describe('#2868 — reading issues and PRs', () => {
  it('finds a dossier\'s lettered options and the recommended one; a lone letter is not a list', () => {
    const body = '## Decision\nWhich?\n- **A** — keep it\n- **B** — drop it\n- **C** — ask\n\nRecommended: **B**';
    expect(optionsOf(body)).toEqual({ options: [{ key: 'A', label: 'keep it' }, { key: 'B', label: 'drop it' }, { key: 'C', label: 'ask' }], recommended: 'B' });
    expect(optionsOf('A) only one').options).toEqual([]);
    expect(optionsOf('- **B** — no A').options).toEqual([]);
  });

  it('reads a PR\'s play sections: route, lines, look-for', () => {
    const body = '## What\nx\n## Play (`/analytic.html`)\n```\nמעוין שצלעו 5\nגובה המעוין 4.8\n```\nClick DH.\n## Play (`/`)\n```\nמשולש ABC\n```\nHide AB.';
    expect(playBlocks(body)).toEqual([
      { path: '/analytic.html', lines: ['מעוין שצלעו 5', 'גובה המעוין 4.8'], note: 'Click DH.' },
      { path: '/', lines: ['משולש ABC'], note: 'Hide AB.' },
    ]);
  });

  it('a plan awaits approval only by its [proposed] outcome lines', () => {
    const body = '## Plan\n- x [proposed] not here\n## What the student will see\n- a [asked]\n- b [proposed]\n## Other';
    expect(proposedLines(body)).toEqual(['b [proposed]']);
    expect(section(body, /what the student/i)).toBe('- a [asked]\n- b [proposed]');
  });

  it('PR closes, deploy rows and the newest prod tag', () => {
    expect(closesOf('Closes #12\nFixes #3, #4 and #5').sort((a, b) => a - b)).toEqual([3, 4, 5, 12]);
    expect(deployRows('| Date | Tag |\n| --- |\n| 2026-11-12 | `prod/2026-11-12-4` | `34376eab` | 2-D, **proxy** | b | What |')).toEqual([
      { date: '2026-11-12', tag: 'prod/2026-11-12-4', commit: '34376eab', apps: '2-D, **proxy**', what: 'What' },
    ]);
    expect(newestProdTag(['prod/2026-11-12-9', 'prod/2026-11-12-10', 'prod/2026-11-11', 'v1'])).toBe('prod/2026-11-12-10');
  });

  it('reads a round\'s ledger lines as round-metrics does', () => {
    expect(ledger('queue: closed=9 filed=4 filed-open=2 found-in-round=3 on-main=7 on-approval=2\noperator: play=3 audits=1')).toEqual({
      queue: { closed: 9, filed: 4, filedOpen: 2, foundInRound: 3, onMain: 7, onApproval: 2 },
      operator: { play: 3, audit: 1 },
    });
  });
});

// ── sections ─────────────────────────────────────────────────────────────────

describe('#2868 — the sections', () => {
  it('pace: the roadmap rule, unchanged (done, behind past its weeks, first week on track, not started)', () => {
    const byN = new Map<number, Issue>([
      [1, issue(1, { open: false })], [2, issue(2, { open: false })],
      [3, issue(3)], [4, issue(4)], [5, issue(5)], [6, issue(6, { open: false })],
      [7, issue(7)],
    ]);
    const st = (id: string, today: string) => wsRow(PLAN, PLAN.workstreams.find((w) => w.id === id)!, byN, today).status;
    expect(st('a', '2026-11-13')).toBe('done');
    expect(st('b', '2026-11-05')).toBe('ontrack'); // its first week
    expect(st('b', '2026-12-10')).toBe('behind'); // past week 5 with work open
    expect(st('c', '2026-11-13')).toBe('idle');
    expect(st('m', '2026-11-13')).toBe('watch'); // the readiness check is due: he plays it
    // An issue closed before the plan's window (not in the snapshot) counts as closed, never vanishes.
    const gone = wsRow(PLAN, { ...PLAN.workstreams[0], issues: [1, 99] }, byN, '2026-11-13');
    expect([gone.closed, gone.unknown]).toEqual([2, 1]);
  });

  it('outside the plan: open P1/P2 in a taught tool that no row names and nobody pulled', () => {
    const s = snap({
      open: [
        issue(3, { labels: ['P2', 'analytic'] }),
        issue(20, { labels: ['P2', 'analytic'] }),
        issue(21, { labels: ['P1', '3d', 'wrong-answer'] }),
        issue(22, { labels: ['P3', 'analytic'] }),
        issue(23, { labels: ['P2', '2d'] }),
        issue(9, { labels: ['P2', 'analytic'] }),
      ],
    });
    expect(pace(makeCtx(s, '2026-11-13')).outside.map((i) => i.n)).toEqual([21, 20]);
  });

  it('readiness: an untranscribed question is counted as not yet tried; partial is its own state', () => {
    const units = { units: [{ id: 'u', name: 'U', builder: 'analytic', from: '2026-11-14', to: null, questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }] }] };
    const r = {
      measuredAt: '2026-11-13T00:00:00Z', commit: 'abc',
      units: { u: { questions: [{ id: 'q1', status: 'green' }, { id: 'q2', status: 'partial' }, { id: 'q3', status: 'red' }] } },
      history: [{ date: '2026-11-05', green: { u: 0 } }, { date: '2026-11-13', green: { u: 1 } }],
    };
    const [row] = readiness(units, r);
    expect([row.green, row.partial, row.red, row.untried, row.questions.length, row.greenWeekAgo]).toEqual([1, 1, 1, 1, 4, 0]);
    // No measure at all: every question is untried, never zero questions.
    expect(readiness(units, null)[0].untried).toBe(4);
  });

  it('needs me: decisions, PRs with their plays, audits, plans awaiting approval, the running round', () => {
    const s = snap({
      open: [
        issue(1, { labels: ['P1', '2d'] }),
        issue(2, { labels: ['needs-operator'], body: '## Decision\nPick\n- **A** — x\n- **B** — y' }),
        issue(3, { body: '## What the student will see\n- new chip [proposed]' }),
        issue(4, { labels: ['auto-ok'], body: '## What the student will see\n- new chip [proposed]' }),
      ],
      prs: [{ n: 50, title: 'pr', body: 'Closes #3\n## Play (`/`)\n```\nמשולש ABC\n```\nLook.', branch: 'feat/x', created: '', updated: '', draft: false, closes: [3] }],
      rounds: [issue(60, { title: 'fix-round 2026-11-12', body: '## Waiting on you\nT1 play\n## Ledger' })],
      files: { plan: PLAN, units: null, readiness: null, directions: null, spotAudits: { pending: [{ sheet: 's', id: 'P1', product: 'analytic', lines: ['x'], lookFor: 'y', queued: '2026-11-10' }] } },
    });
    const nm = needsMe(makeCtx(s, '2026-11-13'));
    expect(nm.p1.map((i) => i.n)).toEqual([1]);
    expect(nm.decisions[0].options.map((o) => o.key)).toEqual(['A', 'B']);
    expect(nm.prs[0].plays[0].lines).toEqual(['משולש ABC']);
    expect(nm.plans.map((p) => p.issue.n)).toEqual([3]);
    expect(nm.audits[0].url).toBe('https://themathbible.com/');
    expect(nm.round?.waiting).toBe('T1 play');
  });

  it('since: fixes and shelvings split by how they closed; deploys by date', () => {
    const s = snap({
      recent: [
        issue(1, { open: false, closed: '2026-11-12T12:00:00Z', reason: 'completed' }),
        issue(2, { open: false, closed: '2026-11-12T13:00:00Z', reason: 'not_planned', labels: ['icebox'] }),
        issue(3, { open: false, closed: '2026-11-01T00:00:00Z', reason: 'completed' }),
        issue(4, { created: '2026-11-12T09:00:00Z' }),
      ],
      deploys: [{ date: '2026-11-12', tag: 'prod/2026-11-12-4', commit: 'a', apps: '2-D', what: '' }, { date: '2026-11-01', tag: 'prod/2026-11-01', commit: 'b', apps: '2-D', what: '' }],
    });
    const r = sinceLast(makeCtx(s, '2026-11-13'), '2026-11-12T00:00:00Z');
    expect([r.fixed.map((i) => i.n), r.shelved.map((i) => i.n), r.filed.map((i) => i.n), r.deploys.length]).toEqual([[1], [2], [4], 1]);
  });

  it('backlog: features oldest first, flagged in or out of the plan; directions counted live', () => {
    const s = snap({
      open: [issue(3, { labels: ['feature', 'analytic'], created: '2026-10-01T00:00:00Z' }), issue(30, { labels: ['feature', 'analytic'], created: '2026-09-01T00:00:00Z' })],
      files: { plan: PLAN, units: null, readiness: null, directions: { asOf: '2026-10-26', products: [{ id: 'analytic', name: 'א', stage: 'now', directions: [{ name: 'd', what: 'w', issues: [3, 30, 999] }] }] }, spotAudits: null },
    });
    const b = backlog(makeCtx(s, '2026-11-13'));
    expect(b.byProduct.find((p) => p.product === 'analytic')!.rows.map((r) => [r.issue.n, r.inPlan])).toEqual([[30, false], [3, true]]);
    expect(b.directions[0].directions[0]).toMatchObject({ open: 2, closed: 1 });
  });

  it('cost: hours and the operator\'s minutes from the ledger; "—" when a round wrote none', () => {
    const s = snap({ rounds: [issue(70, { open: false, created: '2026-11-10T00:00:00Z', closed: '2026-11-10T06:00:00Z', body: 'queue: closed=5 filed=1 filed-open=1\noperator: play=2 audits=3' }), issue(71, { body: 'no ledger' })] });
    const [a, b] = cost(makeCtx(s, '2026-11-13'));
    expect([a.hours, a.minutes, a.queue?.closed]).toEqual([6, 9, 5]);
    expect([b.queue, b.minutes]).toEqual([null, null]);
  });
});

// ── usage ────────────────────────────────────────────────────────────────────

describe('#2868 — what real users failed this week', () => {
  const ev = (over: Partial<UsageEvent>): UsageEvent => ({ serverTs: '2026-11-12T10:00:00Z', iph: 'student', ev: 'submit', sid: 's1', source: 'parser', result: 'not-handled', utterance: 'x', ...over });
  const analytic = BUILDERS.find((b) => b.id === 'analytic')!;

  it('groups failed lines by text and outcome, leaves out his devices and last month', () => {
    const events = [
      ev({ utterance: 'אליפסה  שמוקדיה', sid: 's1' }),
      ev({ utterance: 'אליפסה שמוקדיה', sid: 's2' }),
      ev({ utterance: 'אליפסה שמוקדיה', sid: 's3', iph: 'me' }),
      ev({ utterance: 'old line', serverTs: '2026-10-01T00:00:00Z' }),
      ev({ utterance: 'ok line', result: 'ok' }),
      ev({ utterance: 'llm line', source: 'llm', result: 'lines' }),
    ];
    const u = builderUsage(analytic, events, { rev: 'r', generatedAt: '2026-11-11', verdicts: { 'llm line': 'built' } }, [issue(5, { title: '«אליפסה שמוקדיה» not read' })], new Set(['me']), NOW);
    expect(u.groups.map((g) => [g.line, g.outcome, g.sessions.length, g.issue?.n ?? null, g.stillFails])).toEqual([
      ['אליפסה שמוקדיה', 'not-understood', 2, 5, null],
      ['llm line', 'llm-built', 1, null, false],
    ]);
    expect([u.week.visitors, u.mine.submits]).toEqual([1, 1]);
  });

  it('a builder with no log says so instead of showing zero', () => {
    expect(builderUsage(analytic, null, null, [], new Set(), NOW).hasLog).toBe(false);
  });

  it('matches an issue by the student\'s words in its title; a short line matches nothing', () => {
    expect(issueFor('ab', [issue(1, { title: 'ab cd' })])).toBeNull();
    expect(issueFor('M על המעגל', [issue(1, { title: 'x', open: true }), issue(2, { title: '«M על המעגל» refused', open: false })])?.n).toBe(2);
  });
});

// ── actions ──────────────────────────────────────────────────────────────────

const form = (o: Record<string, string>) => new URLSearchParams(o);

describe('#2868 — the action allow-list', () => {
  it('a ruling: a dated comment quoting him, then needs-operator removed', () => {
    const r = planAction(form({ action: 'rule', issue: '12', option: 'b', optionLabel: 'drop it', note: 'כן, B' }), NOW);
    expect(r.ok).toBe(true);
    expect(r.writes.map((w) => w.op)).toEqual(['comment', 'removeLabel']);
    const body = (r.writes[0] as { body: string }).body;
    expect(body).toContain('## Operator ruling — 2026-11-13 (management page)');
    expect(body).toContain('**Choice: B** — drop it');
    expect(body).toContain('> כן, B');
    expect(body).toContain('נכתב בדף הניהול');
  });

  it('refuses what is outside the list or incomplete, and writes nothing', () => {
    for (const f of <Record<string, string>[]>[
      { action: 'merge', pr: '5' },
      { action: 'rule', issue: '12' },
      { action: 'rule', issue: 'x', note: 'n' },
      { action: 'play', pr: '5', verdict: 'fail' },
      { action: 'play', pr: '5', verdict: 'maybe' },
      { action: 'priority', issue: '5', to: 'P0' },
      { action: 'park', issue: '5' },
      { action: 'audit', sheet: '../x', id: 'P1', verdict: 'pass' },
      { action: 'file', builder: 'nope', line: 'x' },
    ]) {
      const r = planAction(form(f), NOW);
      expect(r.ok, JSON.stringify(f)).toBe(false);
      expect(r.writes).toEqual([]);
    }
  });

  it('approve, priority, park, pull, file: the writes each one makes', () => {
    expect(planAction(form({ action: 'approve', issue: '7' }), NOW).writes.map((w) => w.op)).toEqual(['comment', 'addLabels']);
    expect(planAction(form({ action: 'priority', issue: '7', from: 'P2', to: 'P1' }), NOW).writes).toEqual([
      { op: 'removeLabel', issue: 7, label: 'P2' }, { op: 'addLabels', issue: 7, labels: ['P1'] }, expect.objectContaining({ op: 'comment' }),
    ]);
    expect(planAction(form({ action: 'park', issue: '7', note: 'next year' }), NOW).writes.map((w) => w.op)).toEqual(['comment', 'addLabels', 'close']);
    expect(planAction(form({ action: 'pull', issue: '7', week: '4' }), NOW).writes.map((w) => w.op)).toEqual(['editJson', 'comment']);
    const filed = planAction(form({ action: 'file', builder: 'analytic', line: 'אליפסה   שמוקדיה', outcome: 'not-understood' }), NOW).writes[0];
    expect(filed).toMatchObject({ op: 'create', title: '«אליפסה שמוקדיה» (analytic, a user\'s line)', labels: ['analytic', 'reported'] });
  });

  it('the JSON edits: a pull appends to the plan; an audit verdict moves pending → results', () => {
    expect(applyEdit('pull', { pulled: [{ issue: 1 }] }, { issue: 7, week: 4, at: '2026-11-13', by: 'op' })).toEqual({ pulled: [{ issue: 1 }, { at: '2026-11-13', by: 'op', issue: 7, week: 4 }] });
    const led = { pending: [{ sheet: 's', id: 'P1', kind: 'analytic:assertion' }], results: [], demoted: {} };
    expect(applyEdit('recordAudit', led, { sheet: 's', id: 'P1', pass: false, date: '2026-11-13', note: 'n' })).toEqual({
      pending: [], results: [{ sheet: 's', id: 'P1', kind: 'analytic:assertion', pass: false, date: '2026-11-13', note: 'n' }], demoted: { 'analytic:assertion': 0 },
    });
  });
});

// ── a fake GitHub ────────────────────────────────────────────────────────────

function fakeGitHub(files: Record<string, string> = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const p = new URL(url).pathname.replace('/repos/o/r/', '');
    const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET' && p.startsWith('contents/')) {
      const f = decodeURIComponent(p.slice('contents/'.length));
      if (!(f in files)) return new Response('nf', { status: 404 });
      if (init?.headers?.accept?.includes('raw')) return new Response(files[f]);
      return json({ sha: `sha-${f}`, content: Buffer.from(files[f]).toString('base64') });
    }
    if (method === 'PUT' && p.startsWith('contents/')) {
      const f = decodeURIComponent(p.slice('contents/'.length));
      if ((body as { sha: string }).sha !== `sha-${f}`) return json({ message: 'conflict' }, 409);
      files[f] = Buffer.from((body as { content: string }).content, 'base64').toString('utf8');
      return json({});
    }
    if (method === 'POST' && p === 'issues') return json({ number: 4242 });
    if (method === 'DELETE') return new Response('', { status: 404 });
    if (method !== 'GET') return json({});
    if (p.startsWith('git/matching-refs')) return json([]);
    if (new URL(url).pathname.startsWith('/search/')) return json({ items: [] });
    return json([]);
  }) as unknown as typeof fetch;
  return { gh: makeGh({ token: 't', repo: 'o/r', fetchImpl }), calls, files };
}

describe('#2868 — writes against a fake GitHub', () => {
  it('a ruling posts the comment and tolerates a label already gone', async () => {
    const { gh, calls } = fakeGitHub();
    await runWrites(gh, planAction(form({ action: 'rule', issue: '12', note: 'yes' }), NOW).writes);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['POST /repos/o/r/issues/12/comments', 'DELETE /repos/o/r/issues/12/labels/needs-operator']);
  });

  it('a pull commits ops/plan.json pinned to the sha it read, on the configured branch', async () => {
    const { gh, files, calls } = fakeGitHub({ 'ops/plan.json': JSON.stringify({ pulled: [] }) });
    await runWrites(gh, planAction(form({ action: 'pull', issue: '7', week: '4' }), NOW).writes, 'feat/x');
    expect(JSON.parse(files['ops/plan.json']).pulled).toEqual([expect.objectContaining({ issue: 7, week: 4 })]);
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ sha: 'sha-ops/plan.json', branch: 'feat/x' });
  });

  it('filing a line returns the new issue number', async () => {
    const { gh } = fakeGitHub();
    expect(await runWrites(gh, planAction(form({ action: 'file', builder: '3d', line: 'וקטור u' }), NOW).writes)).toEqual({ created: 4242 });
  });

  it('caches reads, and a write drops the cache', async () => {
    const { gh, calls } = fakeGitHub({ 'a.json': '{}' });
    await gh.file('a.json');
    await gh.file('a.json');
    expect(calls.length).toBe(1);
    await gh.send('POST', 'issues/1/comments', { body: 'x' });
    await gh.file('a.json');
    expect(calls.length).toBe(3);
  });
});

// ── auth ─────────────────────────────────────────────────────────────────────

describe('#2868 — the session', () => {
  it('a session expires after 8 hours and needs its secret', () => {
    const s = makeSession('k', 0);
    expect(validSession(s, 'k', SESSION_MS - 1)).toBe(true);
    expect(validSession(s, 'k', SESSION_MS + 1)).toBe(false);
    expect(validSession(s, 'other', 1)).toBe(false);
    expect(validSession(s, '', 1)).toBe(false);
  });
});

// ── the handler ──────────────────────────────────────────────────────────────

function mockRes() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: '',
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
    end(s?: string) { this.body = s ?? ''; },
  };
}
let ip = 0;
function mockReq(method: string, url: string, body = '', headers: Record<string, string> = {}) {
  async function* chunks() { if (body) yield Buffer.from(body); }
  return Object.assign(chunks(), { method, url, headers, socket: { remoteAddress: `10.8.0.${ip++}` } });
}

describe('#2868 — the console routes', () => {
  const opts = (over: Partial<ManagementOpts> = {}): ManagementOpts => ({
    username: 'op', password: 'pw', cookieSecret: 'cs', base: '/m', gh: fakeGitHub().gh, writes: 'on', ref: 'main',
    eventLogs: {}, ipSalt: 'salt', stateFile: path.join(mkdtempSync(path.join(tmpdir(), 'mgmt-')), 'state.json'), now: () => NOW, ...over,
  });
  const go = async (o: ManagementOpts, req: ReturnType<typeof mockReq>) => {
    const res = mockRes();
    await handleManagement(req as unknown as IncomingMessage, res as unknown as ServerResponse, o);
    return res;
  };

  it('without a session: the login form, never the data', async () => {
    const res = await go(opts(), mockReq('GET', '/management'));
    expect(res.body).toContain('name="password"');
    expect(res.body).not.toContain('name="code"'); // no authenticator code (operator, 2026-11-13)
    expect(res.body).not.toContain('מה מחכה לי</h1>');
  });

  it('a wrong password is refused; the right username and password open a session scoped to the console', async () => {
    const bad = await go(opts(), mockReq('POST', '/management/login', 'username=op&password=nope'));
    expect(bad.statusCode).toBe(401);
    expect(bad.headers['set-cookie']).toBeUndefined();
    const good = await go(opts(), mockReq('POST', '/management/login', 'username=op&password=pw'));
    expect(good.statusCode).toBe(303);
    expect(good.headers['set-cookie']).toMatch(/^geo_mgmt=.*HttpOnly; Secure; SameSite=Strict; Path=\/m/);
  });

  it('a POST without the CSRF token is refused; with it, a dry run sends nothing', async () => {
    const o = opts({ writes: 'dry' });
    const session = makeSession('cs', NOW.getTime());
    const cookie = { cookie: `geo_mgmt=${session}` };
    const noToken = await go(o, mockReq('POST', '/management/act', 'action=note&issue=5&note=x', cookie));
    expect(noToken.statusCode).toBe(403);
    const fg = fakeGitHub();
    const dry = await go({ ...o, gh: fg.gh }, mockReq('POST', '/management/act', `action=note&issue=5&note=x&csrf=${csrfFor(session, 'cs')}`, cookie));
    expect(dry.statusCode).toBe(303);
    expect(decodeURIComponent(dry.headers.location)).toContain('מצב ניסיון');
    expect(fg.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('with writes on, an action reaches GitHub; with writes off, nothing does', async () => {
    const session = makeSession('cs', NOW.getTime());
    const body = `action=note&issue=5&note=x&csrf=${csrfFor(session, 'cs')}`;
    const on = fakeGitHub();
    await go(opts({ gh: on.gh }), mockReq('POST', '/management/act', body, { cookie: `geo_mgmt=${session}` }));
    expect(on.calls.map((c) => c.method)).toEqual(['POST']);
    const off = fakeGitHub();
    const res = await go(opts({ writes: 'off', gh: off.gh }), mockReq('POST', '/management/act', body, { cookie: `geo_mgmt=${session}` }));
    expect(decodeURIComponent(res.headers.location)).toContain('קריאה בלבד');
    expect(off.calls).toEqual([]);
  });

  it('a cross-origin POST is refused even with a token', async () => {
    const session = makeSession('cs', NOW.getTime());
    const res = await go(opts(), mockReq('POST', '/management/act', `action=note&issue=5&note=x&csrf=${csrfFor(session, 'cs')}`, { cookie: `geo_mgmt=${session}`, origin: 'https://evil.example', host: 'themathbible.com' }));
    expect(res.statusCode).toBe(403);
  });

  it('every screen renders from an empty GitHub, with a strict no-script CSP', async () => {
    const session = makeSession('cs', NOW.getTime());
    for (const p of ['', '/since', '/plan', '/live', '/backlog', '/usage', '/cost', '/issue?n=5']) {
      const res = await go(opts(), mockReq('GET', `/management${p}`, '', { cookie: `geo_mgmt=${session}` }));
      expect(res.statusCode, p).toBe(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.body).not.toMatch(/<script/i);
      expect(res.body).toContain('dir="rtl"');
    }
  });

  it('a builder with no log on this server is named, not shown as zero', async () => {
    const session = makeSession('cs', NOW.getTime());
    const res = await go(opts({ eventLogs: { complex: null } }), mockReq('GET', '/management/usage', '', { cookie: `geo_mgmt=${session}` }));
    expect(res.body).toContain('אין לכלי הזה יומן אירועים');
  });
});

// ── readiness rules (scripts/ops/readiness.mjs) ──────────────────────────────

describe('#2868 — unit readiness rules', () => {
  const v = (map: Record<string, { green: boolean; failing?: string }>) => (m: { kind: string; ref?: string; file?: string }) => map[m.ref ?? m.file ?? ''] ?? null;

  it('green only when every member passes; partial when some do; untried with no member', () => {
    expect(questionState({ id: 'q', member: null }, v({}))).toEqual({ status: 'untried' });
    expect(questionState({ id: 'q', member: { kind: 'corpus471', ref: '1' } }, v({ 1: { green: true } }))).toEqual({ status: 'green' });
    expect(questionState({ id: 'q', member: { kind: 'corpus572', ref: '3' }, otherMembers: [{ kind: 'fixture', file: 'src-analytic/__tests__/fixtures/f.analytic.json' }] },
      v({ 3: { green: false, failing: '«x»' }, 'src-analytic/__tests__/fixtures/f.analytic.json': { green: true } }))).toEqual({ status: 'partial', failing: 'corpus572 3: «x»' });
    expect(questionState({ id: 'q', member: { kind: 'corpus471', ref: '1' } }, v({ 1: { green: false } })).status).toBe('red');
  });

  it('a member nobody measured is an error, never a silent pass', () => {
    expect(() => questionState({ id: 'q', member: { kind: 'corpus471', ref: '404' } }, v({}))).toThrow(/not measured/);
  });

  it('folds a vitest JSON report onto fixture and test members', () => {
    const report = { testResults: [
      { name: 'C:/r/src-analytic/__tests__/fixtures.test.ts', assertionResults: [
        { ancestorTitles: ['net', 'ok-1 — x'], title: 'a', status: 'passed' },
        { ancestorTitles: ['net', 'bad-2 — y'], title: 'b', status: 'failed' },
      ] },
      { name: 'C:/r/src3d/__tests__/scenarios3.test.ts', assertionResults: [{ ancestorTitles: ['GATE — 2019'], title: 't', status: 'passed' }] },
    ] };
    const members = [
      { kind: 'fixture', file: 'src-analytic/__tests__/fixtures/ok-1.analytic.json' },
      { kind: 'fixture', file: 'src-analytic/__tests__/fixtures/bad-2.analytic.json' },
      { kind: 'test', file: 'src3d/__tests__/scenarios3.test.ts', name: 'GATE — 2019' },
    ];
    const out = memberVerdicts([report], members);
    expect(members.map((m) => out.get(JSON.stringify(m)))).toEqual([{ green: true }, { green: false, failing: 'b' }, { green: true }]);
  });
});

// keep the type import used
export type _G = GhClient;

// ── the words table (server/ops/he.json, ADR-W-153) ──────────────────────────

describe('#2868 — every console text key resolves, and none is orphaned', () => {
  it('t() keys used in server/ops exist in he.json, and every he.json text is used', () => {
    const dir = path.join(__dirname, '..', 'ops');
    const used = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/\bt\('([\w.]+)'\)/g)) used.add(m[1]);
    }
    const table = JSON.parse(readFileSync(path.join(dir, 'he.json'), 'utf8'));
    const leaves: string[] = [];
    const walk = (o: Record<string, unknown>, pre: string) => {
      for (const [k, v] of Object.entries(o)) if (k !== '$comment') typeof v === 'string' ? leaves.push(pre + k) : walk(v as Record<string, unknown>, `${pre}${k}.`);
    };
    walk(table, '');
    for (const k of used) expect(() => t(k), k).not.toThrow();
    expect(leaves.filter((k) => !used.has(k))).toEqual([]);
  });
});
