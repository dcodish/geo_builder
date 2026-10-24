/**
 * #2532 ([ADR-765](../../../docs/06-decisions.md#adr-765)) — an incidence clause the reading never read refuses the
 * line whole, with the existing one-input-per-line message (FR-IN-4g, ADR-603; CLAUDE.md rule 7's P1 exception).
 *
 * Measured at 045a8546 through `decideDeterministic2D`, the LLM mocked: «מעגל O» · «AB מיתר העובר דרך מרכז המעגל»
 * committed the chord alone, dist(O, AB) = 0.97 / 0.00 / 3.69 / 0.92 at seeds 0–3, every fact green. Every row of
 * the refusal table below committed green there (the fails-before count is in ADR-765).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';

const st = () => useGeoStore.getState();

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `«${p}» builds: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind);
    commitVerdict(v, p);
  }
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const parts = (...p: string[]) => ({ key: 'input.scope.split-statements', params: { first: p[0], second: p[1], all: p.map((x, i) => `(${i + 1}) ${x}`).join('  ') } });

const O = ['מעגל O'];
const EN_O = ['circle O'];
const CENTRE = 'העובר דרך מרכז המעגל';

/** The plan's measured class (§1), each row: prefix, line, the parts the refusal lists. */
const REFUSED: [string, string[], string, string[]][] = [
  ['01 the report', O, `AB מיתר ${CENTRE}`, ['AB מיתר', CENTRE]],
  ['02 «שעובר»', O, 'AB מיתר שעובר דרך מרכז המעגל', ['AB מיתר', 'שעובר דרך מרכז המעגל']],
  ['03 the definite noun first', O, `המיתר AB ${CENTRE}`, ['המיתר AB', CENTRE]],
  ['04 the noun first', O, `מיתר AB ${CENTRE}`, ['מיתר AB', CENTRE]],
  ['05 a letter inside the phrase', O, 'AB מיתר העובר דרך מרכז מעגל O', ['AB מיתר', 'העובר דרך מרכז מעגל O']],
  ['07 «העובר במרכז»', O, 'AB מיתר העובר במרכז המעגל', ['AB מיתר', 'העובר במרכז המעגל']],
  ['08 «המרכז»', O, 'AB מיתר העובר דרך המרכז', ['AB מיתר', 'העובר דרך המרכז']],
  ['09 «מרכזו»', O, 'AB מיתר במעגל העובר דרך מרכזו', ['AB מיתר במעגל', 'העובר דרך מרכזו']],
  ['R1 a co-reference letter', O, 'AB מיתר במעגל O העובר דרך O', ['AB מיתר במעגל O', 'העובר דרך O']],
  ['R3 «במעגל O … מרכזו»', O, 'AB מיתר במעגל O העובר דרך מרכזו', ['AB מיתר במעגל O', 'העובר דרך מרכזו']],
  ['11 the main verb', O, 'המיתר AB עובר דרך מרכז המעגל', ['המיתר AB', 'עובר דרך מרכז המעגל']],
  ['R10 «ועובר»', O, 'AB מיתר ועובר דרך מרכז המעגל', ['AB מיתר', 'ועובר דרך מרכז המעגל']],
  ['R11 a comma', O, `AB מיתר, ${CENTRE}`, ['AB מיתר', CENTRE]],
  ['16 «במרכז»', O, 'AB מיתר במרכז המעגל', ['AB מיתר', 'במרכז המעגל']],
  ['14 an empty canvas', [], `AB מיתר ${CENTRE}`, ['AB מיתר', CENTRE]],
  ['R6 an unnamed circle', ['מעגל'], `AB מיתר ${CENTRE}`, ['AB מיתר', CENTRE]],
  ['R7 two circles, one named', ['מעגל O', 'מעגל P'], `AB מיתר במעגל O ${CENTRE}`, ['AB מיתר במעגל O', CENTRE]],
  ['E1 English', EN_O, 'AB is a chord passing through the centre of the circle', ['AB is a chord', 'passing through the centre of the circle']],
  ['E2 English, bare "through"', EN_O, 'chord AB through the center of the circle', ['chord AB', 'through the center of the circle']],
  ['E4 English, "the centre"', EN_O, 'AB is a chord through the centre', ['AB is a chord', 'through the centre']],
  ['R4 English, "its centre"', EN_O, 'AB is a chord of circle O through its centre', ['AB is a chord of circle O', 'through its centre']],
  ['S1 a segment', O, `AB קטע ${CENTRE}`, ['AB קטע', CENTRE]],
  ['R5 a segment, English', EN_O, 'segment AB through the centre of the circle', ['segment AB', 'through the centre of the circle']],
  ['R15 a tangent', ['מעגל O', 'C על מעגל O'], `AB משיק למעגל בנקודה C ${CENTRE}`, ['AB משיק למעגל בנקודה C', CENTRE]],
  ['R16 an altitude', ['משולש ABC', 'מעגל O'], `AD גובה ${CENTRE}`, ['AD גובה', CENTRE]],
  ['S9 a median', ['משולש ABC'], `AD תיכון ${CENTRE}`, ['AD תיכון', CENTRE]],
  ['R13 «המעגל החוסם»', ['משולש ABC'], 'DE מיתר העובר דרך מרכז המעגל החוסם', ['DE מיתר', 'העובר דרך מרכז המעגל החוסם']],
  ['S7 «אמצע AB»', ['מעגל O', 'AB מיתר'], 'CD מיתר העובר דרך אמצע AB', ['CD מיתר', 'העובר דרך אמצע AB']],
  // ADR-603 decision 7, "Refuse it too": the clause happens to hold for a diameter, and it is still unread
  ['the diameter (true, and unread)', O, `AB קוטר ${CENTRE}`, ['AB קוטר', CENTRE]],
];

describe('#2532 — a through-clause the reading never read refuses the line whole', () => {
  it.each(REFUSED)('%s: %j · «%s»', async (_id, prefix, line, expected) => {
    await drive(prefix);
    const before = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 400)).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.category).toBe('guided');
    expect(v.note).toEqual(parts(...expected));
    expect(v.logs.at(-1)).toMatchObject({ source: 'scope', result: 'scope:split-statements:unread-through' });
    commitVerdict(v, line);
    expect(st().facts.length, 'nothing committed').toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  // S5: the secant reads its circle from INSIDE the phrase («…מרכז המעגל»), so no prefix of the line reads
  // («AB חותך» alone is not read): no parts to show, and the line takes the weak path, never a commit (ADR-765)
  it('S5 a secant: «AB חותך העובר דרך מרכז המעגל» is never committed — it escalates as dropped', async () => {
    await drive(O);
    const v = await decideHere(`AB חותך ${CENTRE}`);
    expect(v.kind).toBe('escalate');
    expect(v.kind === 'escalate' && v.weak).toBe('dropped');
    if (v.kind !== 'escalate') return;
    expect(String(v.logs.find((l) => String(l.result).startsWith('weak:dropped'))?.result)).toContain(`unread-through:${CENTRE}`);
  });

  it('the letter-named twin keeps the refusal it had (#1888\'s label member speaks first)', async () => {
    await drive(O);
    const v = await decideHere('AB מיתר העובר דרך O');
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.note).toEqual(parts('AB מיתר', 'העובר דרך O'));
    expect(v.logs.at(-1)).toMatchObject({ result: 'scope:split-statements:unread-part' });
  });
});

describe('still works — a through-clause the reading reads, and the lines around it', () => {
  it.each([
    [O, 'AB קוטר'],
    [O, 'AB קוטר במעגל O'],
    [['מעגל O', 'C על מעגל O'], 'AB קוטר העובר דרך C'],
    [['נקודה A'], 'מעגל העובר דרך A'],
    [O, 'המעגל עובר דרך A'],
    [O, 'קוטר העובר בנקודה A במעגל O'],
    [['A על מעגל O1', 'B על מעגל O2'], 'AB עובר דרך מרכזי המעגלים'],
    // the verb is a connective before a point the reading resolves (the tangent at the touch T): the verb-only finding
    // does not stand (ADR-765's refinement, #2406's H16)
    [['מעגל O', 'מעגל P', 'המעגלים משיקים מבפנים בנקודה T'], 'המשיק העובר בנקודה המשותפת לשני המעגלים'],
    [['מעגל O', 'AB מיתר'], 'O על AB'],
    [['מעגל O', 'AB מיתר'], 'AB קוטר'],
  ] as [string[], string][])('%j · «%s» commits', async (prefix, line) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a clause no rule reads at all keeps escalating (unchanged)', async () => {
    await drive(['מעגל O', 'נקודה C']);
    const v = await decideHere('AB מיתר העובר דרך C');
    expect(v.kind).toBe('escalate');
  });

  // the honest remedy the student can type today: two lines
  it('«מעגל O» · «AB מיתר» · «O על AB» builds with O on AB at every seed', async () => {
    await drive(['מעגל O', 'AB מיתר', 'O על AB']);
    for (let seed = 0; seed < 8; seed++) {
      const f = replay(st().facts, seed);
      expect(Object.values(f.status).every((s) => s === 'ok'), `seed ${seed}`).toBe(true);
      const [A, B, C] = ['A', 'B', 'O'].map((k) => f.positions.get(k)!);
      const d = Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y);
      expect(d, `dist(O, AB) at seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('the ✎ edit seam refuses the same lines inline, naming the phrase', () => {
  function submit(u: string): string {
    const v = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(v.construction, v.positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    st().executeMany(r.commands, u);
    const f = st().facts;
    return groupKey(f[f.length - 1]);
  }
  it.each([
    ['AB מיתר', `AB מיתר ${CENTRE}`, CENTRE],
    ['AB קוטר', `AB קוטר ${CENTRE}`, CENTRE],
  ])('editing «%s» into «%s» is refused: «%s»', (first, edit, item) => {
    st().clear();
    submit('מעגל O');
    const key = submit(first);
    const notes: string[] = [];
    const ok = runEditCommit(key, edit, { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(notes.at(-1)).toBe(`steps.editDropped:${JSON.stringify({ items: item })}`);
  });
});
