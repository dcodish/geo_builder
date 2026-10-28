/**
 * #1995 batch 1 ([ADR-W-155](../../docs/06w-decisions-workspace.md#adr-w-155)) — 3-D's refusals that named an object
 * and stopped now give one next step, or say plainly there is none (the operator's rule of 2026-10-13, card 18 B).
 *
 * Each row submits the refusing sequence through the real decision (`decideDeterministic3` → `dispatchVerdict`, the
 * App3 submit) and reads the sentence through `errorText3`, as the student does. A row whose sentence TEACHES a next
 * step then submits that step and asserts it records — docs/17 §9, "a taught remedy is a grammar claim". Where the
 * sentence carries the spelling itself («למשל «מישור π3»»), the line submitted is read OUT OF the sentence, so the
 * message and the accepted spelling come from one source.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { useGeo3 } from '../store/store3';

type Lng = 'he' | 'en';
const st = () => useGeo3.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** One line through the App3 submit; the sentence the student reads, or null when the line was taken. */
function submit(line: string, lng: Lng = 'he'): string | null {
  const v = decideDeterministic3(st(), line);
  expect(v.kind, `«${line}» is not a guided line`).not.toBe('guided');
  if (v.kind === 'guided') return null;
  st().dispatchVerdict(v);
  const err = st().lastError;
  if (!err) return null;
  const t = i18n3d.getFixedT(lng);
  return plain(errorText3((k, o) => t(k, o) as string, err) ?? '');
}
function setUp(lines: readonly string[]) {
  for (const l of lines) expect(submit(l), `setup «${l}»`).toBeNull();
}
/** The example the sentence quotes after «למשל» / "for example" — the spelling it teaches. */
const taught = (sentence: string) => /(?:למשל|for example) «([^»]+)»/.exec(sentence)?.[1] ?? null;

const CUBE = "קובייה ABCDA'B'C'D'";
const PYRAMID = 'פירמידה SABCD';

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, queries: [], planeDisplay: {} } as never);
});

describe('#1995 batch 1 — 3-D: the refusal names the statement and gives one next step', () => {
  it('already-defined: edit or delete the row that defined it', () => {
    setUp([CUBE]);
    expect(submit('פירמידה ABCDS')).toBe('«A» כבר מוגדר בציור, ולא ניתן להגדיר אותו מחדש. כדי לשנות אותו, ערכו או מחקו את השורה שהגדירה אותו.');
  });

  it('rename with no such point: says plainly there is nothing to rename', () => {
    setUp(['קובייה ABCD']);
    expect(submit('שנה שם Z ל-Q')).toBe('אין בציור נקודה בשם «Z», ולכן אין מה לשנות.');
    expect(submit('שנה שם A ל-Q')).toBeNull();
  });

  it('swap with a missing point: says plainly there is nothing to swap, and what can be swapped', () => {
    setUp(['קובייה ABCD']);
    expect(submit('החלף בין Z ל-B')).toBe('«Z» או «B» אינה בציור, ולכן אין מה להחליף — אפשר להחליף רק בין שתי נקודות שבציור.');
    expect(submit('החלף בין A ל-B')).toBeNull();
  });

  // ⚠ REWRITTEN by #1467 (ADR-3D-382; the operator's T41, 2026-10-24: "we can create a point X so the claim satisfies"):
  // the "define it first" sentence is no longer reached for a point named by its letter — X is created, free.
  it('unknown point: the line is taken, and X is created', () => {
    setUp([CUBE]);
    expect(submit('E אמצע XC')).toBeNull();
  });

  it('no solution: check the values — a value that fits is taken', () => {
    setUp([PYRAMID, 'E על SA כך ש-SE = t·SA']);
    expect(submit('t = 2')).toBe('לא נמצא מיקום ל-«E» שמקיים את הנתון הזה. בדקו את הערכים בשורה ובנתונים שהיא נשענת עליהם.');
    expect(submit('t = 1/2')).toBeNull();
  });

  it('not on the segment: check the segment and the condition — the longer segment is taken', () => {
    setUp([CUBE, "נסמן AB = u, AD = v, AA' = w", "M אמצע AA'", "N אמצע BB'", "R אמצע NB'"]);
    expect(submit('P על הקטע AM כך ש-RP = αu + βv')).toBe('«P» יוצאת אל מחוץ לקטע, ולכן הנתון לא מתקיים על הקטע עצמו. בדקו את הקטע ואת התנאי שבשורה.');
    expect(submit("P על הקטע AA' כך ש-RP = αu + βv")).toBeNull();
  });

  it('unknown plane: the taught «מישור π3» is taken (read out of the sentence)', () => {
    setUp([CUBE]);
    const s = submit("הישר AC' מאונך למישור π3")!;
    expect(s).toBe('המישור «π3» עדיין לא הוגדר. הגדירו אותו תחילה — למשל «מישור π3» — ואז כתבו את השורה שוב.');
    expect(taught(s)).toBe('מישור π3');
    expect(submit(taught(s)!)).toBeNull();
  });

  it('unknown line: the taught «ישר k» is taken, and then the line itself', () => {
    setUp(['קובייה ABCD']);
    const s = submit('הישר k מאונך למישור ABC')!;
    expect(s).toBe('הישר «k» עדיין לא הוגדר. הגדירו אותו תחילה — למשל «ישר k» — ואז כתבו את השורה שוב.');
    expect(submit(taught(s)!)).toBeNull();
    expect(submit('הישר k מאונך למישור ABC')).toBeNull();
  });

  it('symbolic new point: the taught «N(1,2,3)» is taken', () => {
    setUp([PYRAMID, 'B(2t, t, k)']);
    const s = submit('N(k,p,3)')!;
    expect(s).toBe('נקודה חדשה «N» צריכה שיעורים מספריים, למשל «N(1,2,3)». אותיות מותרות רק בשיעורים של נקודה שכבר קיימת בציור.');
    expect(submit(taught(s)!)).toBeNull();
  });

  it('sign unsatisfiable: says plainly the givens already fix it', () => {
    setUp([CUBE, 'A(0,0,0)', 'AB=(2,0,0)', 'AD=(0,2,0)', "AA'=(0,0,2)"]);
    expect(submit('שיעור ה-x של C שלילי')).toBe('אף תצורה של הנתונים אינה נותנת לשיעור של «C» את הסימן הזה — הנתונים כבר קובעים אותו אחרת, ולכן הנתון לא נוסף.');
  });

  it('no such solid: write the claim about a solid in the figure, with its letters', () => {
    setUp([PYRAMID]);
    expect(submit('נפח הפירמידה WXYZ = 11')).toBe('אין בציור גוף «WXYZ» אחד בדיוק, ולכן לא ברור על איזה גוף הטענה. כתבו את הטענה על גוף שבציור, עם האותיות שלו.');
    expect(submit('נפח הפירמידה SABCD = 11')).toBeNull();
  });

  // ⚠ REWRITTEN by #1467 (ADR-3D-382; the operator's T49, 2026-10-24: "same comment"): Q is created and P is defined.
  it('two unknowns: the relation is taken, Q created free', () => {
    setUp(['קובייה ABCD']);
    expect(submit('PQ = 2AB')).toBeNull();
  });

  it('line misses plane: says plainly there is no crossing (no «at the chosen parameter» — it is parallel for every m)', () => {
    setUp(['המישור π1: z - 3 = 0', 'הישר ℓ: x = (0,0,0) + t(1, m, 0)']);
    expect(submit('ℓ חותך את π1 בנקודה A')).toBe('הישר מקביל למישור, ולכן אין להם נקודת חיתוך «A».');
  });

  it('segments do not meet: check the letters — the real diagonals are taken', () => {
    setUp([CUBE]);
    expect(submit("האלכסונים AC ו-B'D' נפגשים בנקודה E")).toBe("הקטעים «AC» ו-«B'D'» אינם נפגשים, ולכן אין להם נקודת מפגש «E». בדקו את אותיות הקטעים.");
    expect(submit('האלכסונים AC ו-BD נפגשים בנקודה E')).toBeNull();
  });

  it('crossing off the segment: says plainly there is no crossing on it', () => {
    setUp([CUBE, 'A(0,0,0)', 'AB=(2,0,0)', 'AD=(0,2,0)', "AA'=(0,0,2)", 'המישור π: z = 5']);
    expect(submit("הקטע AA' חותך את π בנקודה P")).toBe('המישור חוצה את הישר מחוץ לקטע שציינתם, ולכן אין על הקטע נקודת חיתוך «P».');
  });

  it('angle bound unsatisfiable: no empty «ב-» any more; a reachable range is taken', () => {
    setUp([PYRAMID]);
    const s = submit('179 < ∠SAB < 180');
    expect(s).toBe('אין תצורה של הציור שבה הזווית נמצאת בתחום הזה, ולכן הנתון לא נוסף. בדקו את גבולות התחום.');
    expect(s).not.toMatch(/ב- /);
    expect(submit('60 < ∠SAB < 90')).toBeNull();
  });

  it('not a diagonal: write two non-adjacent vertices — such a pair is taken', () => {
    setUp([CUBE]);
    expect(submit('אלכסון AB')).toBe('«AB» הוא צלע של הגוף, לא אלכסון. אלכסון מחבר שני קודקודים שאינם שכנים — כתבו שני קודקודים כאלה.');
    expect(submit('אלכסון AC')).toBeNull();
  });

  it('not a main diagonal: write two opposite vertices — such a pair is taken', () => {
    setUp([CUBE]);
    expect(submit('אלכסון ראשי AC')).toBe('«AC» הוא אלכסון של פאה, לא אלכסון ראשי. אלכסון ראשי מחבר שני קודקודים נגדיים דרך פנים הגוף — כתבו שני קודקודים כאלה.');
    expect(submit("אלכסון ראשי AC'")).toBeNull();
  });
});

describe('#1995 batch 1 — 3-D: the English twins take the same shape, and teach spellings that are read', () => {
  it('unknown plane / line: the taught «plane π3» and «line k» are taken', () => {
    setUp([CUBE]);
    const p = submit("הישר AC' מאונך למישור π3", 'en')!;
    expect(p).toBe('Plane «π3» is not defined yet. Define it first — for example «plane π3» — then type the line again.');
    expect(submit(taught(p)!)).toBeNull();
    const l = submit('הישר k מאונך למישור ABC', 'en')!;
    expect(l).toBe('Line «k» is not defined yet. Define it first — for example «line k» — then type the line again.');
    expect(submit(taught(l)!)).toBeNull();
  });

  it('symbolic new point', () => {
    setUp([PYRAMID, 'B(2t, t, k)']);
    const s = submit('N(k,p,3)', 'en')!;
    expect(s).toBe('A new point «N» needs numeric coordinates, for example «N(1,2,3)». Letters are only allowed in the coordinates of a point already in the figure.');
    expect(submit(taught(s)!)).toBeNull();
  });
});
