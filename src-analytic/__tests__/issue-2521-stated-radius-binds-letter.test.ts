/**
 * #2521 (ADR-AG-332) — A STATED VALUE BINDS A SIZE LETTER. «מעגל O שרדיוסו R» · «מעגל P שרדיוסו r» · «R > r» ·
 * «רדיוס מעגל P הוא 9» drew P at 9 and O at 3.46, green: the stated radius was substituted into the circle and its
 * constraints only, so «R > r» went on judging an orphaned `r` the canvas no longer showed; a later sentence naming `r`
 * read a ghost or was refused; and a letter called `r` was never retired (a text search matched the radius field).
 *
 * Calls the real path: `decideSubmit` for each line's verdict, `derive` for the figure, at seeds 0–11.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const O = 'מעגל O שרדיוסו R';
const P = 'מעגל P שרדיוסו r';

type Verdict = { kind: string; error?: { key?: string; code?: string; detail?: string } };

/** Every line through `decideSubmit`, in order; the recorded lines and each line's verdict kind / refusal key. */
function play(lines: readonly string[]): { kept: string[]; verdicts: Array<{ line: string; kind: string; key?: string }> } {
  const kept: string[] = [];
  const verdicts: Array<{ line: string; kind: string; key?: string }> = [];
  for (const line of lines) {
    const v = decideSubmit(line, kept, 0, derive(kept, 0)) as Verdict & { line?: string };
    verdicts.push({ line, kind: v.kind, key: v.error?.key ?? v.error?.code });
    if (v.kind === 'record') kept.push(v.line ?? line);
  }
  return { kept, verdicts };
}

function recordsAll(lines: readonly string[]): string[] {
  const { kept, verdicts } = play(lines);
  for (const v of verdicts) expect(v.kind, `«${v.line}»: ${JSON.stringify(v)}`).toBe('record');
  return kept;
}

/** The drawn radius of the circle with id `circle-at-<name>` (a centred circle), at `seed`. */
function radius(kept: readonly string[], name: string, seed: number): number {
  const d = derive(kept, seed);
  expect(d.faults, `faults at seed ${seed}`).toEqual([]);
  expect(d.figure.selectorsOk, `selectors hold at seed ${seed}`).toBe(true);
  const c = (d.figure.curves as unknown as Array<{ id: string; curve?: { r?: number } }>).find((k) => k.id === `circle-at-${name}`);
  expect(c?.curve?.r, `circle ${name} drawn at seed ${seed}`).toBeTypeOf('number');
  return c!.curve!.r!;
}

describe('#2521 — the report and every spelling of the radius sentence: O is drawn larger than P = 9', () => {
  const ROWS: Record<string, string[]> = {
    'A1 the report': [O, P, 'R > r', 'רדיוס מעגל P הוא 9'],
    'A5 «הרדיוס של»': [O, P, 'R > r', 'הרדיוס של מעגל P הוא 9'],
    'A12 «נתון»': ['נתון מעגל O שרדיוסו R', 'נתון מעגל P שרדיוסו r', 'R > r', 'רדיוס מעגל P הוא 9'],
    'A14 a restated creation': [O, P, 'R > r', 'מעגל P שרדיוסו 9'],
    'C8 «רדיוס המעגל»': [O, P, 'R > r', 'רדיוס המעגל P הוא 9'],
    'C9 English radius sentence': [O, P, 'R > r', 'the radius of circle P is 9'],
    'C10 all English': ['circle O with radius R', 'circle P with radius r', 'R > r', 'the radius of circle P is 9'],
    'A2 value first': [O, P, 'רדיוס מעגל P הוא 9', 'R > r'],
  };
  for (const [name, lines] of Object.entries(ROWS))
    it(name, () => {
      const kept = recordsAll(lines);
      for (const seed of SEEDS) {
        const rP = radius(kept, 'P', seed);
        const rO = radius(kept, 'O', seed);
        expect(rP).toBeCloseTo(9, 9);
        expect(rO, `seed ${seed}`).toBeGreaterThan(9);
      }
      const d = derive(kept, 0);
      expect(Object.keys(d.figure.env)).not.toContain('r');
      const R = d.construction.params.find((p) => p.sym === 'R');
      expect(R?.domain.min).toBe(9);
      expect(R?.domain.minOpen).toBe(true);
    });

  it('C6 other letters: «a > b» · «רדיוס מעגל P הוא 9»', () => {
    const kept = recordsAll(['מעגל O שרדיוסו a', 'מעגל P שרדיוסו b', 'a > b', 'רדיוס מעגל P הוא 9']);
    for (const seed of SEEDS) expect(radius(kept, 'O', seed)).toBeGreaterThan(radius(kept, 'P', seed));
  });
});

describe('#2521 — the other direction and the other circle hold on the canvas at every seed', () => {
  it('A6 «R < r» · «רדיוס מעגל O הוא 9» → P larger than 9', () => {
    const kept = recordsAll([O, P, 'R < r', 'רדיוס מעגל O הוא 9']);
    for (const seed of SEEDS) {
      expect(radius(kept, 'O', seed)).toBeCloseTo(9, 9);
      expect(radius(kept, 'P', seed)).toBeGreaterThan(9);
    }
  });
  it('A11 «R > r» · «רדיוס מעגל O הוא 2» → P in (0, 2)', () => {
    const kept = recordsAll([O, P, 'R > r', 'רדיוס מעגל O הוא 2']);
    for (const seed of SEEDS) {
      const rP = radius(kept, 'P', seed);
      expect(rP).toBeGreaterThan(0);
      expect(rP).toBeLessThan(2);
    }
  });
});

describe('#2521 — a relation stated after the value reads the value', () => {
  const RATIOS: Record<string, string> = { C1: 'R = 2r', C2: 'r:R = 1:2', C3: 'R/r = 2', C12: 'היחס בין R ל-r הוא 2:1' };
  for (const [name, rel] of Object.entries(RATIOS))
    it(`${name} «רדיוס מעגל P הוא 3» · «${rel}» → O = 6, as in the other order`, () => {
      const kept = recordsAll([O, P, 'רדיוס מעגל P הוא 3', rel]);
      const other = recordsAll([O, P, rel, 'רדיוס מעגל P הוא 3']);
      for (const seed of SEEDS) {
        expect(radius(kept, 'O', seed)).toBeCloseTo(6, 6);
        expect(radius(other, 'O', seed)).toBeCloseTo(6, 6);
      }
    });

  it('C7 an equation written with R after «רדיוס מעגל O הוא 5» draws its circle at radius 5', () => {
    const kept = recordsAll([O, 'רדיוס מעגל O הוא 5', '(x-1)^2+y^2=R^2']);
    for (const seed of SEEDS) {
      const d = derive(kept, seed);
      const curves = d.figure.curves as unknown as Array<{ id: string; curve?: { kind?: string; r?: number } }>;
      const eq = curves.find((k) => k.id !== 'circle-at-O' && k.curve?.kind === 'circle');
      expect(eq?.curve?.r).toBeCloseTo(5, 9);
    }
  });
});

describe('#2521 — a bound letter is not a ghost: a domain stated for it is a claim about its value', () => {
  it('C4\' «רדיוס מעגל P הוא 9» · «r < 5» → «r < 5» refused unsatisfiable, naming it', () => {
    const { verdicts } = play([O, P, 'רדיוס מעגל P הוא 9', 'r < 5']);
    expect(verdicts.slice(0, 3).map((v) => v.kind)).toEqual(['record', 'record', 'record']);
    expect(verdicts[3]).toMatchObject({ kind: 'refused', key: 'unsatisfiable' });
  });
  it('C4\'\' «רדיוס מעגל O הוא 5» · «R < 2» → refused unsatisfiable', () => {
    const { verdicts } = play([O, 'רדיוס מעגל O הוא 5', 'R < 2']);
    expect(verdicts[2]).toMatchObject({ kind: 'refused', key: 'unsatisfiable' });
  });
  it('a domain the value meets is already known («r < 10» after 9)', () => {
    const { verdicts } = play([O, P, 'רדיוס מעגל P הוא 9', 'r < 10']);
    expect(verdicts[3].kind).toBe('already-known');
  });
  it('the radius sentence restated after binding is already known, not a second binding', () => {
    const { verdicts } = play([O, P, 'R > r', 'רדיוס מעגל P הוא 9', 'רדיוס מעגל P הוא 9']);
    expect(verdicts[4].kind).toBe('already-known');
  });
});

describe('#2521 — a contradiction is refused on the line that completes it; the figure keeps the earlier lines', () => {
  it('A8 «R > r» · «רדיוס מעגל O הוא 5» · «רדיוס מעגל P הוא 9» → the last line refused', () => {
    const { kept, verdicts } = play([O, P, 'R > r', 'רדיוס מעגל O הוא 5', 'רדיוס מעגל P הוא 9']);
    expect(verdicts.slice(0, 4).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    expect(verdicts[4].kind).toBe('refused');
    expect(['out-of-domain', 'unsatisfiable']).toContain(verdicts[4].key);
    for (const seed of SEEDS) {
      expect(radius(kept, 'O', seed)).toBeCloseTo(5, 9);
      expect(radius(kept, 'P', seed)).toBeLessThan(5);
    }
  });
  it('the reverse order: «רדיוס מעגל O הוא 5» · «רדיוס מעגל P הוא 9» · «R > r» → «R > r» refused', () => {
    const { verdicts } = play([O, P, 'רדיוס מעגל O הוא 5', 'רדיוס מעגל P הוא 9', 'R > r']);
    expect(verdicts.slice(0, 4).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    expect(verdicts[4]).toMatchObject({ kind: 'refused', key: 'unsatisfiable' });
  });
});

describe('#2521 — the ghost freedom: a stated radius consumes the letter, whatever it is called', () => {
  for (const letter of ['r', 'R', 'a', 'k', 'b'])
    it(`«O(0,0)» · «מעגל O שרדיוסו ${letter}» · «רדיוס מעגל O הוא 3» → carrierDof 0, env {}`, () => {
      const kept = recordsAll(['O(0,0)', `מעגל O שרדיוסו ${letter}`, 'רדיוס מעגל O הוא 3']);
      const d = derive(kept, 0);
      expect(d.figure.carrierDof).toBe(0);
      expect(d.figure.env).toEqual({});
      expect(d.construction.params).toEqual([]);
    });
});

describe('#2521 — controls: verdicts and drawn values as before', () => {
  it('A7 / A13 «R = 2r» or «R/r = 2» · «רדיוס מעגל P הוא 3» → O = 6', () => {
    for (const rel of ['R = 2r', 'R/r = 2']) {
      const kept = recordsAll([O, P, rel, 'רדיוס מעגל P הוא 3']);
      for (const seed of SEEDS) expect(radius(kept, 'O', seed)).toBeCloseTo(6, 6);
    }
  });
  it('A10 «מעגל P שרדיוסו 9» · «R > 9» → O > 9', () => {
    const kept = recordsAll([O, 'מעגל P שרדיוסו 9', 'R > 9']);
    for (const seed of SEEDS) expect(radius(kept, 'O', seed)).toBeGreaterThan(9);
  });
  it('B12 «R > 4» · «רדיוס מעגל O הוא 2» → refused out-of-domain', () => {
    const { verdicts } = play([O, 'R > 4', 'רדיוס מעגל O הוא 2']);
    expect(verdicts[2]).toMatchObject({ kind: 'refused', key: 'out-of-domain' });
  });
  it('B5 / B6 angle letters: «α > β» with «∢BCA = 80°» in either order → α > 80', () => {
    const head = ['משולש ABC', '∢ABC = α', '∢BCA = β'];
    for (const tail of [['α > β', '∢BCA = 80°'], ['∢BCA = 80°', 'α > β']]) {
      const kept = recordsAll([...head, ...tail]);
      for (const seed of [0, 1, 2]) {
        const d = derive(kept, seed);
        expect(d.faults).toEqual([]);
        expect(d.figure.env['α']).toBeGreaterThan(80);
      }
    }
  });
  it('B15 a free centre leaves r free: «R > r» · «O(0,0)» · «A(9,0)» · «A על מעגל P» builds, R > r on the canvas', () => {
    const kept = recordsAll([O, P, 'R > r', 'O(0,0)', 'A(9,0)', 'A על מעגל P']);
    for (const seed of [0, 1, 2]) expect(radius(kept, 'O', seed)).toBeGreaterThan(radius(kept, 'P', seed));
  });
});

/*
 * A seed whose «R > r» drawing was its OWN sample (the centres where the two circles alone put them) keeps it when the
 * radius is stated. A seed where «R > r» failed natively was drawn from another seed's sample (the walk); once the
 * value makes the seed's own sample valid, it is drawn there — that is the seed's configuration, not a jump.
 */
describe('#2521 — stability: line 4 of the report moves neither centre', () => {
  it('O and P are where they were before «רדיוס מעגל P הוא 9», at every seed natively drawn', () => {
    const kept = recordsAll([O, P, 'R > r', 'רדיוס מעגל P הוא 9']);
    let native = 0;
    const at = (lines: readonly string[], seed: number, id: string) => {
      const p = derive(lines, seed).figure.points.find((q) => q.id === id)!;
      return [p.x, p.y];
    };
    for (const seed of SEEDS) {
      const own = ['O', 'P'].map((id) => at(kept.slice(0, 2), seed, id));
      const before = ['O', 'P'].map((id) => at(kept.slice(0, 3), seed, id));
      if (JSON.stringify(own) !== JSON.stringify(before)) continue;
      native++;
      expect(['O', 'P'].map((id) => at(kept, seed, id)), `seed ${seed}`).toEqual(before);
    }
    expect(native).toBeGreaterThan(0);
    expect(['O', 'P'].map((id) => at(kept, 0, id))).toEqual(['O', 'P'].map((id) => at(kept.slice(0, 3), 0, id)));
  });
});

describe('#2521 — one binding seam (M2): `substituteSym` is called only by `bindSymbol` and `readBound`', () => {
  it('every call site of substituteSym sits inside one of the two', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../engine/apply.ts'), 'utf8');
    const lines = src.split('\n');
    let current = '';
    const callers = new Set<string>();
    for (const line of lines) {
      const fn = /^(?:export )?function (\w+)/.exec(line);
      if (fn) current = fn[1];
      if (/substituteSym\(/.test(line) && !/^function substituteSym/.test(line)) callers.add(current);
    }
    expect([...callers].sort()).toEqual(['bindSymbol', 'readBound']);
  });
});

describe('#2521 — the fixture of the report replays green', () => {
  it('issue-2521-radius-letter-binds.analytic.json', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fx = JSON.parse(readFileSync(join(here, 'fixtures/issue-2521-radius-letter-binds.analytic.json'), 'utf8')) as { lines: string[]; seed: number };
    const d = derive(fx.lines, fx.seed);
    expect(d.faults).toEqual([]);
    expect(radius(fx.lines, 'O', fx.seed)).toBeGreaterThan(radius(fx.lines, 'P', fx.seed));
  });
});
