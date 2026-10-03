/**
 * THE PANEL'S POINT READING — one decision, two surfaces (#1433, extracting App.tsx's `pointText`).
 *
 * The data panel decided what a point's row says (a value, the #1036 option set, the student's own
 * expression, the #1023 line dependency, the half-pinned form, or the open dash) while the ask lane
 * gated on `isKnowledge` alone — so asking «C» answered «לא ניתן לחשב מהנתונים» beside a panel row
 * listing both of C's options. Extracted so BOTH surfaces call the SAME decision and the lock can
 * CALL it rather than reproduce it (the #1102 rule this tree already records).
 */
import type { derive } from '../engine/derive';
import { exprText } from '../engine/expr';
import { knownCurve, knownValue, knownValues, reportPending } from '../engine/evaluate';
import { valueText } from './panelRows';

/** A coordinate's verdict; `pending` = not yet read over the whole configuration pool (#1473). */
type Know = { known: boolean; value?: number; pending?: boolean };

export function pointText(
  d: ReturnType<typeof derive>,
  id: string,
  kx: Know,
  ky: Know,
  fmt: (v: number) => string,
): string {
  if (kx.known && ky.known) return `(${fmt(kx.value as number)}, ${fmt(ky.value as number)})`;

  /**
   * A DISCRETE SET of positions (#1036) — «הבחן בין שני מקרים», which the corpus asks about six
   * times in the forty «lines and points» exercises. Asked SECOND, after the determined case and
   * before the dependency: neither member is knowledge, but the set is, and printing one member
   * alone would be the cardinal sin while printing nothing throws away the shape of the answer.
   */
  // #1716 (ADR-AG-226): the panel's ONE value gate — at most two positions are listed; more read as open.
  const verdict = knownValues(
    d.construction,
    (f) => {
      const q = f.points.find((r) => r.id === id);
      return q ? [q.x, q.y] : null;
    },
    2,
    // the walk the render path has always paid for an open point (#1473 B′)
    { fillPool: true },
  );
  const options = verdict.known ? undefined : verdict.options;
  if (options) {
    // The DRAWN one is marked, which is what connects this row to «הציגו תצורה אחרת».
    const here = d.figure.points.find((q) => q.id === id);
    return options
      .map((v) => {
        const text = `(${fmt(v[0])}, ${fmt(v[1])})`;
        const drawn = here && Math.hypot(here.x - v[0], here.y - v[1]) < 1e-6;
        return drawn ? `[${text}]` : text;
      })
      .join(' או ');
  }

  /**
   * NOT YET SETTLED (#1473, ADR-AG-180): a coordinate the partial configuration pool reads as invariant
   * is pending, and nothing below may stand in for it — not the half-pinned form (which would print the
   * pending coordinate's sibling as if the row were settled) and not the dash (which would claim
   * "open"). Reported to the enclosing `settled` probe; the row shows «בודק…» until the pool completes.
   */
  if (kx.pending || ky.pending) {
    reportPending(d.construction);
    return '—';
  }

  /**
   * A COORDINATE THE STUDENT WROTE IS SHOWN, EVEN WHEN IT IS NOT A NUMBER (#1226): the tool holds
   * `A.x` as their own `-9a`, and `exprText` renders it. Only a STATED point with a non-numeric
   * coordinate — a carrier point is `free` and a midpoint `derived`, so neither reaches this.
   */
  const stated = d.construction.objects.find((o) => o.id === id);
  if (stated?.kind === 'point' && (stated.x.kind !== 'num' || stated.y.kind !== 'num')) {
    return `(${exprText(stated.x)}, ${exprText(stated.y)})`;
  }

  const on = d.construction.constraints.find((k) => k.t === 'on-curve' && k.id === id);
  if (on && on.t === 'on-curve') {
    // The SAME gate the curve rows use: a carrier whose coefficients still move says nothing here.
    const line = knownCurve(d.construction, on.curve);
    if (line && line.kind === 'line' && Math.abs(line.b) > 1e-12 && Math.abs(line.a) > 1e-12) {
      const slope = -line.a / line.b;
      const intercept = -line.c / line.b;
      const sx = `x_${id}`;
      const term = Math.abs(slope - 1) < 1e-12 ? sx : Math.abs(slope + 1) < 1e-12 ? `-${sx}` : `${fmt(slope)}·${sx}`;
      const tail = Math.abs(intercept) < 1e-12 ? '' : intercept > 0 ? ` + ${fmt(intercept)}` : ` - ${fmt(-intercept)}`;
      return `(${sx}, ${term}${tail})`;
    }
  }

  // One coordinate pinned and the other open — «B על ציר ה-x» — reads the same way.
  if (kx.known !== ky.known) {
    return kx.known ? `(${fmt(kx.value as number)}, y_${id})` : `(x_${id}, ${fmt(ky.value as number)})`;
  }
  return '—';
}

/**
 * #1433 — the ONE scalar knowledge gate for ask answers: a single value when the figure forces one,
 * else the resolution-aware OPTION SET joined the way the panel joins point options («3.16 או
 * 5.83»), else null (open / uncomputable — the caller words which). `askNoValue` is thereby
 * reserved for a figure that truly determines nothing finite.
 */
export function scalarText(
  c: ReturnType<typeof derive>['construction'],
  read: Parameters<typeof knownValue>[1],
  fmt: (v: number) => string,
): string | null {
  // #1716 (ADR-AG-226): the panel's one value gate and its one formatter — the ask lane cannot disagree with a row.
  return valueText(knownValue(c, read), fmt);
}
