/**
 * #1449 — «הזווית בין המישורים π1 ו-π2» / «נפח החרוט» answered «לא זוהה» (ADR-3D-279): the ask lane
 * read only point-run angles and polyhedra, while the statement lane checked and accepted the same
 * sentences with a value. The question is now read BY the statement grammar, so a sayable measure is
 * askable by construction.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { angleAskOperands, parse3, revolutionAskOf } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const ask = (text: string) => {
  const st = useGeo3.getState();
  return answerQuery(derive3(st.facts, st.seed).construction, text, st.seed);
};
const build = (...lines: string[]) => {
  reset();
  lines.forEach(submit);
  expect(useGeo3.getState().lastError, lines.join(' · ')).toBeNull();
};

beforeEach(reset);

describe('#1449 — the measured asks answer', () => {
  it.each([
    'הזווית בין המישורים π1 ו-π2',
    'הזווית בין המישור π1 לבין המישור π2',
    'הזווית בין π1 ל-π2',
    'the angle between planes π1 and π2',
    'the angle between the plane π1 and the plane π2',
    '∠(π1,π2)',
  ])('named planes: «%s» → 54.74°', (q) => {
    build('המישור π1: z = 3', 'המישור π2: x + y + z = 1');
    expect(ask(q).answer).toBe('54.74°');
  });

  it('…and with the angle given first (his re-report, T4 of round #1469)', () => {
    build('המישור π1: z = 3', 'המישור π2: x + y + z = 1', 'הזווית בין המישורים π1 ו-π2 היא 54.74');
    expect(ask('הזווית בין המישורים π1 ו-π2').answer).toBe('54.74°');
  });

  it.each([
    'הזווית בין הישר ℓ1 לבין המישור π1',
    'הזווית בין הישר l1 לבין המישור π1',
    'the angle between the line ℓ1 and the plane π1',
    'הזווית בין l1 ל-π1',
  ])('named line × plane: «%s» → 35.26°', (q) => {
    build('הישר ℓ1: x = t(1,1,1)', 'המישור π1: z = 0');
    expect(ask(q).answer).toBe('35.26°');
  });

  it('the plural frame over point-run planes, and the forms that already worked stay', () => {
    build("קובייה ABCDA'B'C'D'");
    expect(ask("הזווית בין המישורים ABC ו-A'BC").answer).toBe('45°');
    expect(ask("הזווית בין המישור ABC למישור A'BC").answer).toBe('45°');
    expect(ask("הזווית בין AC' למישור ABCD").answer).toBe('35.26°');
  });

  it.each([
    ['נפח החרוט', '100π'],
    ['volume of the cone', '100π'],
    ['the volume of the cone', '100π'],
    ['שטח המעטפת של החרוט', '65π'],
    ['the lateral area of the cone', '65π'],
    ['שטח הפנים של החרוט', '90π'],
  ])('cone r = 5, h = 12: «%s» → %s', (q, want) => {
    build('חרוט שרדיוס בסיסו 5 וגובהו 12');
    expect(ask(q).answer).toBe(want);
  });

  it('cylinder and sphere', () => {
    build('גליל שרדיוס בסיסו 3 וגובהו 4');
    expect(ask('נפח הגליל').answer).toBe('36π');
    expect(ask('שטח המעטפת של הגליל').answer).toBe('24π');
    expect(ask('שטח הפנים של הגליל').answer).toBe('42π');
    build('כדור שרדיוסו 3');
    expect(ask('נפח הכדור').answer).toBe('36π');
    expect(ask('שטח הפנים של הכדור').answer).toBe('36π');
  });
});

describe('#1449 — the honest refusals', () => {
  it('an object the figure lacks names an object, not points', () => {
    build('המישור π1: z = 3', 'המישור π2: x + y + z = 1');
    expect(ask('הזווית בין π1 ל-π3')).toMatchObject({ answer: null, note: 'noObject' });
    build('כדור שרדיוסו 3');
    expect(ask('נפח החרוט')).toMatchObject({ answer: null, note: 'noObject' });
  });

  it('an unstated size is undetermined (a free DOF, ADR-052), never a sampled number', () => {
    build('חרוט');
    expect(ask('נפח החרוט')).toMatchObject({ answer: null, note: 'undetermined' });
  });
});

describe('#1449 — the total surface is sayable too, and checked', () => {
  it('«שטח הפנים של החרוט = 90π» verifies; «= 80π» is refuted', () => {
    build('חרוט שרדיוס בסיסו 5 וגובהו 12');
    submit('שטח הפנים של החרוט = 90π');
    expect(useGeo3.getState().lastError).toBeNull();
    build('חרוט שרדיוס בסיסו 5 וגובהו 12');
    submit('שטח הפנים של החרוט = 80π');
    expect(useGeo3.getState().lastError).not.toBeNull();
  });
});

/**
 * The class guard: every catalog statement that states an angle between objects or a revolution
 * measure is askable with its value dropped — through the SAME readers the ask lane calls.
 */
describe('#1449 — sayable ⇒ askable, over the whole catalog', () => {
  const VALUE_TAIL = /\s*(?:היא|הוא|is|=|שווה\s+ל?-?)\s*-?[\d.√/]+\s*(?:°|π|pi)?\s*$/;
  const rows = COMMAND_CATALOG_3D.flatMap((e) => [e.he, e.en]).filter((u): u is string => typeof u === 'string');
  const measured: string[] = [];
  for (const u of rows) {
    const r = parse3(u);
    if (!r.ok || r.commands.length !== 1) continue;
    const cmd = r.commands[0];
    const isAngle = (cmd.type === 'plane-rel' || cmd.type === 'line-rel') ? cmd.rel === 'angle' && cmd.deg !== undefined : cmd.type === 'line-plane-angle' && cmd.deg !== undefined;
    const isRev = cmd.type === 'claim' && (cmd.claim.type === 'volume-eq' || cmd.claim.type === 'lateral-area-eq' || cmd.claim.type === 'surface-area-eq');
    if ((isAngle || isRev) && VALUE_TAIL.test(u)) measured.push(u);
  }

  it('the catalog carries such statements (the guard checks something)', () => {
    expect(measured.length).toBeGreaterThanOrEqual(4);
  });

  it.each(measured.map((u) => [u]))('«%s» — its question is read', (u) => {
    const q = u.replace(VALUE_TAIL, '');
    expect(angleAskOperands(q) ?? revolutionAskOf(q), q).not.toBeNull();
  });
});
