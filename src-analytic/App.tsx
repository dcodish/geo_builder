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
import { color, fs } from '../shell/theme';
import { derive } from './engine/derive';
import { domainText, type NumCurve } from './engine/types';
import { isKnowledge } from './engine/evaluate';
import { ellipseFoci, parabolaFocus } from './engine/curves';
import { analyticBidi } from './i18n';
import { Figure } from './render/Figure';
import { buildScene } from './render/scene';
import { useAnalyticStore } from './store/useAnalyticStore';
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

export function App() {
  const { t } = useTranslation();
  const { lines, seed, error, recordLine, removeLine, replaceLine, clearAll, nextConfiguration, setError } =
    useAnalyticStore();
  const [draft, setDraft] = useState('');
  const [zoom, setZoom] = useState(1);
  const [dataOpen, setDataOpen] = useState(true);

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
      setError({ key: fault.code, detail: fault.detail });
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
          'conflicting-restatement': 'errConflict',
          'conic-slot-taken': 'errConicTaken',
          'name-kind-clash': 'errNameClash',
        }[error.key],
        { detail: error.detail },
      )
    : null;

  const freeCount = d.construction.params.length;

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
            <Figure scene={scene} />
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
            <div style={{ position: 'absolute', insetInlineStart: 12, bottom: 12 }}>
              <ToolButton onClick={nextConfiguration} disabled={freeCount === 0}>
                {t('another')}
              </ToolButton>
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
                rows: d.construction.params.map((p) => (
                  <span key={p.sym}>{domainText(p.sym, p.domain)}</span>
                )),
              },
              {
                key: 'points',
                title: t('secPoints'),
                dir: 'ltr',
                rows: d.construction.points.map((p) => {
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
                rows: d.figure.curves.map((c) => (
                  <span key={c.id}>{describeCurve(c.label.name || c.id, c.curve)}</span>
                )),
              },
            ]}
          />
        }
      />
    </AppFrame>
  );
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

function fmt(v: number): string {
  const r = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(10));
  return String(r);
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
