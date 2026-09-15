/**
 * The analytic builder's app shell.
 *
 * Everything visible here that is not the figure comes from `shell/` — frame, switcher, workbench,
 * input area, fact list, data panel, quick chips, canvas controls, theme. That is not thrift, it is
 * the V0 acceptance gate: [ADR-AG-004](../docs/06c-decisions-analytic.md#adr-ag-004) makes suite
 * conformance half of what V0 must pass, because "make it match the others" is the item that slips
 * to a follow-up when a new product is being built fast. This product is the first born after the
 * shared chassis existed ([docs/28 §5](../docs/28-product-unification.md) Phase 4), and mounting
 * rather than re-deriving the chrome is the whole return on that work.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import registry from '../products.json';
import { AppFrame } from '../shell/frame/AppFrame';
import { DataPanel } from '../shell/frame/DataPanel';
import { FactList } from '../shell/frame/FactList';
import { InputArea } from '../shell/frame/InputArea';
import { QuickChips } from '../shell/frame/QuickChips';
import { ToolButton } from '../shell/frame/ToolButton';
import { Workbench } from '../shell/frame/Workbench';
import { canvasClusterStyle, canvasCtrlStyle, clampZoom, CANVAS_ZOOM_STEP } from '../shell/frame/canvasControls';
import { fmtNum } from '../shell/format';
import { color, fs } from '../shell/theme';
import { paramRegister, reportedDof } from './engine/carriers';
import { derive } from './engine/derive';
import { domainText, positionalOf, type NumCurve } from './engine/types';
import { isKnowledge, knownCurve } from './engine/evaluate';
import { ellipseFoci, parabolaFocus } from './engine/curves';
import { analyticBidi } from './i18n';
import { Figure } from './render/Figure';
import { buildScene } from './render/scene';
import { useAnalyticStore, type InputError } from './store/useAnalyticStore';
import { parseLine } from './parser/parseAnalytic';

declare const __BUILD__: string;

/** The empty-canvas first click. RAW commands (ADR-W-029) — exactly what a student would type. */
const QUICK_COMMANDS = [
  'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
  'נתון הישר l1: y=x',
  'נתונה פרבולה קנונית שמשוואתה y^2=54x',
  'נתונה הנקודה A(2,6)',
];

const CANVAS_W = 720;
const CANVAS_H = 720;

/**
 * The locale key describing WHAT a clashing name already holds (#1046).
 *
 * The engine hands over a token (`derived:centroid`, `curve:ellipse`) and never a sentence, so the
 * description is rendered here, in the student's language, from the construct's own corpus noun.
 * An unrecognised token falls back to the generic noun rather than printing itself: a message
 * leaking `derived:centroid` at a student would be internal state, which the honesty invariants
 * forbid outright.
 */
function existingKey(error: InputError): string {
  const token = 'existing' in error ? error.existing : undefined;
  const byToken: Record<string, string> = {
    point: 'kindPoint',
    free: 'kindFree',
    segment: 'kindSegment',
    polygon: 'kindPolygon',
    'curve:line': 'kindLine',
    'curve:circle': 'kindCircle',
    'curve:parabola': 'kindParabola',
    'curve:ellipse': 'kindEllipse',
    'derived:midpoint': 'kindMidpoint',
    'derived:centroid': 'kindCentroid',
    'derived:incentre': 'kindIncentre',
    'derived:orthocentre': 'kindOrthocentre',
    'derived:circumcentre': 'kindCircumcentre',
    'derived:diagonals': 'kindDiagonalMeet',
  };
  return (token && byToken[token]) || 'kindObject';
}

export function App() {
  const { t } = useTranslation();
  const { lines, seed, error, recordLine, removeLine, replaceLine, clearAll, nextConfiguration, setError, notice, setNotice } =
    useAnalyticStore();
  const [draft, setDraft] = useState('');
  const [zoom, setZoom] = useState(1);
  const [dataOpen, setDataOpen] = useState(true);
  /**
   * «הצג בנייה» — the medians, altitudes or bisectors that DEFINE a derived point (#1030).
   *
   * OFF by default, on the operator's ruling: three medians per derived point buries a real figure,
   * and a student asks for the method when they want it. One GLOBAL toggle rather than one per
   * point, matching how 02c R20 settled the equations toggle — the two controls should behave alike
   * rather than each inventing a scope.
   */
  const [showConstruction, setShowConstruction] = useState(false);

  const d = useMemo(() => derive(lines, seed), [lines, seed]);

  /**
   * The builder roster, as DATA from `products.json` — `shell/` may never import a product, so the
   * list arrives from the registry and the labels resolve through THIS product's own i18n. Dev
   * swaps in `devUrl` because `npm run dev` serves every app from one origin.
   *
   * The `devOnly` clause is this product's own readmission ticket. Operator ruling (2026-09-03):
   * the analytic tool is NOT DEPLOYED until it has decent capability, so its registry entry carries
   * `enabled: false` — which is what keeps the three shipped builders from rendering a chip that
   * would 404 in production, without any of them needing to know this tool exists. Widening the
   * filter HERE, and only here, keeps the suite bar whole while developing.
   */
  const roster = useMemo(
    () =>
      registry.products
        .filter((p) => p.enabled || (import.meta.env.DEV && 'devOnly' in p && p.devOnly))
        .map((p) => ({
          id: p.id,
          label: t(p.labelKey),
          icon: p.icon,
          url: import.meta.env.DEV ? p.devUrl : p.url,
        })),
    [t],
  );

  const submit = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    const parsed = parseLine(line);
    if (!parsed.ok) {
      setError({ key: parsed.code, detail: parsed.detail });
      return;
    }
    // Dry-run the WHOLE list with the new line appended: a statement is acceptable only if the
    // figure still folds. A refusal keeps the prior figure and names the student's own words.
    const trial = derive([...lines, line], seed);
    const fault = trial.faults.find((f) => f.index === lines.length);
    if (fault) {
      setError({ key: fault.code, detail: fault.detail, existing: fault.existing } as InputError);
      return;
    }
    /**
     * The THIRD outcome (#1045): the statement is true, and the figure already held it.
     *
     * `applyFact` has answered this since V0 and nothing read the answer, so the line was recorded
     * anyway — the student saw their sentence listed twice, the counter said «4 נתונים» for three
     * givens, and the tool said nothing at all. Silence reads as failure, so they type it again.
     *
     * A `narrowed` line is deliberately NOT here: «a הוא פרמטר» then «a<13» is also absorbed, but it
     * added information and belongs in the list like any other given.
     */
    if (trial.outcomes[lines.length] === 'known') {
      setNotice(t('noticeAlreadyKnown', { detail: line }));
      setDraft('');
      return;
    }
    /**
     * A given the figure ALREADY ENTAILS (#1063) — the operator’s B11/B12.
     *
     * #1045 catches a RESTATEMENT: the same fact twice, decided structurally in `applyFact`. This
     * is the larger notion — «שטח המשולש ABC הוא 6» on a determined triangle was never stated
     * before, it is simply *true and already settled*, and structural absorption cannot see that.
     *
     * **Two conditions, and neither alone is enough:**
     *
     *  - the given HOLDS (`unsatisfied` is empty), and
     *  - the figure’s reported freedom DID NOT DROP.
     *
     * The second is what separates *"true here"* from *"true necessarily"*. On a free triangle,
     * «AB מקביל לציר x» is satisfied at seed 0 only because the sampler put it there — the
     * constraint is real and removes a degree of freedom, and calling it "already known" would
     * silently discard a stated given, which is the defect this whole product exists to avoid.
     *
     * **And nothing new may have APPEARED.** The test is on the construction, not on the fact kinds:
     * a line that mints an object, a parameter or a selector has contributed something whatever the
     * numbers say. Comparing what the figure GAINED rather than what the sentence emitted is what
     * makes «B נמצא על ציר ה-x» work for an already-placed `B` — that sentence declares `B`, the
     * declaration is absorbed because `B` exists, and the line really does add nothing. A test on
     * fact kinds called it new, which is how it read before #1069 taught that rule to declare.
     *
     * A new SELECTOR counts as contributing even when it happens to hold, because a selector consumes
     * no freedom by design (D7 kind 2) and a DOF comparison alone cannot see it. That is the
     * conservative direction: it records a line that arguably added nothing, rather than discarding
     * one that did.
     *
     * It costs nothing extra: both derivations already exist — `d` is the current figure and `trial`
     * is the dry run the submit path has always done.
     */
    /**
     * A line that PROMOTED a carrier to a stated curve (#1076) changes no count — the object was
     * already there — and consumes no freedom, so the count test alone would call «y=x» after
     * «נקודה B על הישר y=x» a given that already follows, while the canvas visibly gained a line.
     * `applyFact` already answered this: promotion reports `created`. Reading its answer is the
     * same move #1045 made, and the reason both tests live here rather than duplicating each other.
     */
    if (trial.outcomes[lines.length] === 'created') {
      recordLine(line);
      setDraft('');
      return;
    }
    const gained =
      trial.construction.objects.length - d.construction.objects.length +
      (trial.construction.params.length - d.construction.params.length) +
      (trial.construction.selectors.length - d.construction.selectors.length);
    const freedomBefore = reportedDof(d.construction, d.figure.carrierDof);
    const freedomAfter = reportedDof(trial.construction, trial.figure.carrierDof);
    if (
      parsed.facts.length > 0 &&
      gained === 0 &&
      trial.figure.unsatisfied.length === 0 &&
      freedomAfter === freedomBefore
    ) {
      setNotice(t('noticeAlreadyFollows', { detail: line }));
      setDraft('');
      return;
    }
    recordLine(line);
    setDraft('');
  };

  const scene = useMemo(() => {
    const box = d.box;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const half = ((box.maxX - box.minX) / 2) / zoom;
    const zoomed = { minX: cx - half, maxX: cx + half, minY: cy - half, maxY: cy + half };
    return buildScene(d.figure, zoomed, CANVAS_W, CANVAS_H);
  }, [d, zoom]);

  const errorText = error
    ? t(
        {
          'not-handled': 'errNotHandled',
          'bad-equation': 'errBadEquation',
          'out-of-scope': 'errOutOfScope',
          'reserved-coordinate': 'errReservedCoordinate',
          'bad-arity': 'errBadArity',
          'repeated-vertex': 'errRepeatedVertex',
          'bad-operand': 'errBadOperand',
          'conflicting-restatement': 'errConflict',
          'name-kind-clash': 'errNameClash',
          'unknown-reference': 'errUnknownRef',
          'does-not-exist': 'errDoesNotExist',
          'ambiguous-angle': 'errAmbiguousAngle',
          'ambiguous-shape': 'errAmbiguousShape',
          'undistinguished-diagonal': 'errNoPrincipalDiagonal',
          'unsatisfiable': 'errUnsatisfiable',
        }[error.key],
        { detail: error.detail, existing: t(existingKey(error)) },
      )
    : null;

  // The DOF cue (02c P4 — an under-determined figure is drawn, and its openness is VISIBLE).
  // Counted from the register, not from the declarations, so an undeclared parameter is reported
  // as the freedom it is rather than silently absent (#1014).
  const register = paramRegister(d.construction);
  const freeCount = reportedDof(d.construction, d.figure.carrierDof);

  // NO `suiteActions`: AppFrame renders the language toggle AND the About button itself, using this
  // product's own `language` key. Passing a toggle here put two «English» buttons on the suite bar.
  return (
    <AppFrame
      title={t('title')}
      subtitle={t('subtitle')}
      roster={roster}
      activeProductId="analytic"
      switcherLabel={t('switcherLabel')}
      switcherMoreLabel={t('switcherMore')}
      buildStamp={typeof __BUILD__ === 'string' ? __BUILD__ : undefined}
      about={{
        label: t('about'),
        title: t('aboutTitle'),
        body: t('aboutBody'),
        privacy: t('privacy'),
        closeLabel: t('close'),
      }}
    >
      <Workbench
        emptyOverlay={
          lines.length === 0 ? (
            <QuickChips
              title={t('emptyTitle')}
              hint={t('emptyHint')}
              commands={QUICK_COMMANDS}
              onPick={submit}
              display={(c) => analyticBidi.isolateLtrRuns(c)}
            />
          ) : null
        }
        inputZone={
          <>
            <InputArea
              value={draft}
              onChange={setDraft}
              onSubmit={() => submit(draft)}
              placeholder={t('inputPlaceholder')}
              submitLabel={t('add')}
              symbols={SYMBOLS}
              quickCommands={lines.length > 0 ? QUICK_COMMANDS : undefined}
              onQuickCommand={submit}
              quickDir={() => 'rtl'}
            >
              {errorText && (
                <p role="alert" style={{ color: color.danger, fontSize: fs.small, margin: '8px 0 0' }}>
                  {errorText}
                </p>
              )}
              {/*
                An informational answer, never the danger colour and never `role="alert"` (#1045):
                the student restated something true, and styling that as an error would teach them
                that a correct restatement is a mistake. `role="status"` is the polite live region,
                which is also the right announcement for a screen reader.
              */}
              {notice && (
                <p role="status" style={{ color: color.muted, fontSize: fs.small, margin: '8px 0 0' }}>
                  {notice}
                </p>
              )}
            </InputArea>
            <FactList
              rows={lines.map((line, i) => ({
                id: String(i),
                content: analyticBidi.isolateLtrRuns(line),
                error: d.faults.find((f) => f.index === i)?.detail,
              }))}
              emptyHint={t('factsEmpty')}
              editValueOf={(id) => lines[Number(id)] ?? ''}
              onEditCommit={(id, next) => {
                const i = Number(id);
                const trial = derive(lines.map((l, j) => (j === i ? next : l)), seed);
                if (trial.faults.some((f) => f.index === i)) return false;
                replaceLine(i, next);
                return true;
              }}
              onDelete={(id) => removeLine(Number(id))}
              footer={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ToolButton onClick={clearAll} disabled={lines.length === 0}>
                    {t('clearAll')}
                  </ToolButton>
                  <span style={{ fontSize: fs.small, color: color.muted }}>
                    {t('factCount', { count: lines.length })}
                  </span>
                </div>
              }
              testId="analytic-facts"
            />
          </>
        }
        canvasZone={
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Figure scene={scene} showConstruction={showConstruction} />
            <div style={canvasClusterStyle}>
              <button type="button" style={canvasCtrlStyle} onClick={() => setZoom(1)} aria-label="reset">
                ↺
              </button>
              <button
                type="button"
                style={canvasCtrlStyle}
                onClick={() => setZoom((z) => clampZoom(z / CANVAS_ZOOM_STEP))}
                aria-label="zoom out"
              >
                −
              </button>
              <button
                type="button"
                style={canvasCtrlStyle}
                onClick={() => setZoom((z) => clampZoom(z * CANVAS_ZOOM_STEP))}
                aria-label="zoom in"
              >
                +
              </button>
            </div>
            <div style={{ position: 'absolute', insetInlineStart: 12, bottom: 12, display: 'flex', gap: 8 }}>
              <ToolButton onClick={nextConfiguration} disabled={freeCount === 0}>
                {t('another')}
              </ToolButton>
              {/* Offered only when there IS a construction to show, so the control never promises
                  something the figure cannot deliver. */}
              {d.figure.construction.length > 0 && (
                <ToolButton onClick={() => setShowConstruction((v) => !v)}>
                  {t(showConstruction ? 'hideConstruction' : 'showConstruction')}
                </ToolButton>
              )}
            </div>
          </div>
        }
        dataZone={
          <DataPanel
            title={t('dataTitle')}
            open={dataOpen}
            onToggle={() => setDataOpen((v) => !v)}
            showLabel={t('dataShow')}
            hideLabel={t('dataHide')}
            status={freeCount > 0 ? t('freeDof', { count: freeCount }) : t('pinned')}
            sections={[
              {
                key: 'params',
                title: t('secParams'),
                dir: 'ltr',
                rows: register.map((p) => (
                  <span key={p.sym}>{domainText(p.sym, p.domain)}</span>
                )),
              },
              {
                key: 'points',
                title: t('secPoints'),
                dir: 'ltr',
                rows: positionalOf(d.construction).map((p) => {
                  // The honesty gate (ADR-AG-003 §2): a coordinate is printed only when it is
                  // KNOWLEDGE — the same value at every seed — never one sample's number.
                  const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === p.id)?.x ?? null);
                  const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === p.id)?.y ?? null);
                  return (
                    <span key={p.id}>
                      {p.id} ={' '}
                      {kx.known && ky.known ? `(${fmt(kx.value)}, ${fmt(ky.value)})` : '—'}
                    </span>
                  );
                }),
              },
              {
                key: 'curves',
                title: t('secCurves'),
                dir: 'ltr',
                rows: d.figure.curves.map((c) => {
                  // The SAME honesty gate the point rows use: an equation prints only when every
                  // coefficient is invariant across the free DOFs. A parabola whose `a` is still
                  // free is drawn, and its row is open — never a sampled coefficient as fact.
                  const known = knownCurve(d.construction, c.id);
                  /**
                   * An UNNAMED curve prints no name — never its id (#1026).
                   *
                   * The fallback used to be `c.id`, which put `circle-anonq3c8qq` in front of a
                   * student inside an RTL Hebrew panel: internal state on screen, which the honesty
                   * invariants forbid and which #1029 had already caught in its other form. It was
                   * invisible while the ids read `parabola` and `ellipse` and would have become
                   * unmissable the moment content-derived ids landed. The row needs no name anyway:
                   * `describeCurve` prints the equation and the focus, which is what tells two
                   * anonymous parabolas apart — and it is the student's own equation, not ours.
                   */
                  const name = c.label.name;
                  return (
                    <span key={c.id}>{known ? describeCurve(name, known) : `${name ? `${name}: ` : ''}—`}</span>
                  );
                }),
              },
              {
                key: 'lengths',
                title: t('secLengths'),
                dir: 'ltr',
                /**
                 * Every drawn segment’s length (#1065).
                 *
                 * The engine had these all along — `isKnowledge` returns 10 for `|AB|` after
                 * «AB = 10» and correctly REFUSES to call `|AC|` known until «AB = AC» arrives.
                 * Nothing printed them, which is #1020’s shape for the third time in this product:
                 * a mechanism that exists, is correct, and has no caller.
                 *
                 * Gated exactly as the coordinate and equation rows are. A length that still moves
                 * with a free DOF prints `—`, never one seed’s sample.
                 */
                rows: uniqueSegments(d.figure.segments).map((s) => {
                  const [a, b] = s.ends;
                  const k = isKnowledge(d.construction, (f) => {
                    const p1 = f.points.find((q) => q.id === a);
                    const p2 = f.points.find((q) => q.id === b);
                    return p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : null;
                  });
                  return (
                    <span key={s.id}>{`${a}${b} = ${k.known ? fmt(k.value) : '—'}`}</span>
                  );
                }),
              },
            ]}
          />
        }
      />
    </AppFrame>
  );
}

/**
 * One row per PAIR of endpoints (#1065).
 *
 * A polygon emits one drawn piece per side, and a student who also states «הקטע AB» would
 * otherwise see `AB` twice. The length is a property of the two points, not of how many things
 * happen to be drawn between them.
 */
function uniqueSegments(segments: readonly { id: string; ends: [string, string] }[]) {
  const seen = new Set<string>();
  return segments.filter((s) => {
    const key = [...s.ends].sort().join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The product's symbol palette — only the glyphs this tool's grammar actually uses (#525). */
const SYMBOLS = [
  { label: '²', before: '^2' },
  { label: '√', before: '√' },
  { label: 'ℓ', before: 'ℓ' },
  { label: '≤', before: '<=' },
  { label: '≥', before: '>=' },
  { label: '≠', before: '≠' },
] as const;

/**
 * `a x + b y + c = 0`, written the way a textbook writes it: no `1x`, no `+ 0`, no `+ -3`. The raw
 * coefficients are arithmetic; this is notation, and the panel is read by a student.
 */
function lineText(a: number, b: number, c: number): string {
  const term = (k: number, sym: string): string => {
    if (Math.abs(k) < 1e-12) return '';
    const mag = Math.abs(k) === 1 ? '' : fmt(Math.abs(k));
    return `${k < 0 ? '-' : '+'} ${mag}${sym} `;
  };
  const parts = `${term(a, 'x')}${term(b, 'y')}${term(c, '')}`.trim();
  // A leading `+ ` is noise; a leading `- ` is a sign and stays attached.
  const body = parts.startsWith('+ ') ? parts.slice(2) : parts.replace(/^- /, '-');
  return `${body} = 0`;
}

/**
 * Display precision, delegated to the workspace's ONE chokepoint (#1029).
 *
 * This tree kept a private `toPrecision(10)` rounder, which is the thing `shell/format.ts` exists to
 * prevent and which broke the operator's standing two-decimal ruling (#723) the moment the tool
 * computed its first non-terminating coordinate — a centroid printed as `-1.666666667`.
 *
 * The sub-epsilon clamp stays: a derived point that lands on an axis should read `0`, not `-1e-17`
 * rounded to `-0`.
 */
function fmt(v: number): string {
  return fmtNum(Math.abs(v) < 1e-12 ? 0 : v);
}

/**
 * One line of data per curve. Deliberately DESCRIPTIVE (centre, radius, focus) rather than a
 * restatement of the equation the student just typed — the panel's job is to organise what is
 * known, and the memorised triple (`y²=2px` → focus, directrix) is exactly what the formula sheet
 * withholds.
 */
function describeCurve(name: string, c: NumCurve): string {
  const n = name ? `${name}: ` : '';
  switch (c.kind) {
    case 'line':
      return `${n}${lineText(c.a, c.b, c.c)}`;
    case 'circle':
      return `${n}O(${fmt(c.cx)}, ${fmt(c.cy)}), r = ${fmt(c.r)}`;
    case 'parabola': {
      const f = parabolaFocus(c);
      return `${n}y² = ${fmt(2 * c.p)}x, F(${fmt(f.x)}, 0), x = ${fmt(-c.p / 2)}`;
    }
    case 'ellipse': {
      const [f1, f2] = ellipseFoci(c);
      return `${n}a = ${fmt(c.a)}, b = ${fmt(c.b)}, F₁(${fmt(f1.x)}, ${fmt(f1.y)}), F₂(${fmt(f2.x)}, ${fmt(f2.y)})`;
    }
  }
}
