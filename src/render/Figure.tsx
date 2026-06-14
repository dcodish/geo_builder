/**
 * Figure (Phase 2) — declarative SVG view of the engine's output.
 *
 * The engine is the single source of truth; this component renders its computed
 * figure with no imperative reconciler (JSXGraph is gone — docs/04-design.md
 * §Rendering). Fit-to-view is recomputed from the data; an additional
 * pan/zoom layer (a `<g transform>`) lets the user explore without touching the
 * world→screen fit. The whole renderer is swappable behind this props shape.
 */

import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Construction, Id, Vec } from '@/engine/types';
import { buildScene, scenePositions } from './scene';
import type { MeasureLabels } from './scene';
import { findSegmentCrossings } from './intersections';
import type { Crossing } from './intersections';
import { fitTransform, orient } from './transform';

export interface FigureProps {
  construction: Construction;
  positions: Map<Id, Vec>;
  width?: number;
  height?: number;
  padding?: number;
  /** Object ids to accent (e.g. those introduced by the selected fact). */
  highlight?: Set<Id>;
  /**
   * When provided, unmarked crossings of declared segments are offered as
   * hollow dots; clicking one calls this with the crossing so the host can
   * create a named intersection point. Omit to disable the affordance.
   */
  onPickIntersection?: (crossing: Crossing) => void;
  /** Tooltip for the crossing dots (host supplies the localized string). */
  intersectionLabel?: string;
  /** Measure labels to print on the figure (ADR-031) — lengths along segments, angles at vertices. */
  labels?: MeasureLabels;
  /** Angle marks the student asserted — right-angle squares / angle arcs. */
  angleMarks?: { vertex: Id; ray1: Id; ray2: Id; right: boolean }[];
  /** Show the measure labels + angle marks (default true); the host's "show measures" toggle drives this. */
  showMeasures?: boolean;
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
  /** Figure orientation: rotation (radians) + mirror flags. Labels stay upright. */
  rot: number;
  flipX: boolean;
  flipY: boolean;
}

const IDENTITY: View = { zoom: 1, panX: 0, panY: 0, rot: 0, flipX: false, flipY: false };
const TWO_PI = 2 * Math.PI;
const normRot = (r: number): number => ((r % TWO_PI) + TWO_PI) % TWO_PI;

const ACCENT = '#f59e0b';

export function Figure({
  construction,
  positions,
  width = 600,
  height = 600,
  padding = 48,
  highlight,
  onPickIntersection,
  intersectionLabel,
  labels,
  angleMarks,
  showMeasures = true,
}: FigureProps) {
  const lit = (id: string): boolean => !!highlight && highlight.has(id);
  const [view, setView] = useState<View>(IDENTITY);
  const [hotCross, setHotCross] = useState<number | null>(null);
  const [exportFlash, setExportFlash] = useState<'' | 'ok' | 'err'>('');
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  async function saveImage() {
    if (!svgRef.current) return;
    try {
      const blob = await svgToPng(svgRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'figure.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportFlash('err');
      window.setTimeout(() => setExportFlash(''), 1400);
    }
  }
  async function copyImage() {
    if (!svgRef.current) return;
    try {
      const blob = await svgToPng(svgRef.current);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setExportFlash('ok');
    } catch {
      setExportFlash('err');
    }
    window.setTimeout(() => setExportFlash(''), 1400);
  }

  const { scene, transform, crossings, labelDirs } = useMemo(() => {
    // Rotate/flip the figure in world space, then fit — so it stays centred and
    // labels (computed here, drawn upright) follow the new orientation.
    const o = { rot: view.rot, flipX: view.flipX, flipY: view.flipY };
    const oriented =
      o.rot === 0 && !o.flipX && !o.flipY
        ? positions
        : new Map<Id, Vec>([...positions].map(([id, v]) => [id, orient(v, o)]));
    const s = buildScene(construction, oriented, labels, angleMarks);
    const t = fitTransform(scenePositions(s), { width, height, padding });
    const x = onPickIntersection ? findSegmentCrossings(construction, oriented) : [];

    // Nudge each label off the lines, in screen space at a reference scale (zoom
    // is applied later by the pan/zoom <g>, so this stays stable across zooming).
    const REF_OFF = 12; // pointR(2)*2 + fontSize(16)*0.5 at zoom 1
    const REF_CLEAR = 9; // ~ half a glyph
    const obstacles: [Vec, Vec][] = s.segments.map((sg) => [t.toScreen(sg.a), t.toScreen(sg.b)]);
    for (const ln of s.lines) {
      const a0 = t.toScreen(ln.anchor);
      const a1 = t.toScreen({ x: ln.anchor.x + ln.dir.x, y: ln.anchor.y + ln.dir.y });
      const d = unitVec({ x: a1.x - a0.x, y: a1.y - a0.y });
      obstacles.push([{ x: a0.x - d.x * 4000, y: a0.y - d.y * 4000 }, { x: a0.x + d.x * 4000, y: a0.y + d.y * 4000 }]);
    }
    const circScreen = s.circles.map((c) => ({ c: t.toScreen(c.center), r: c.r * t.scale }));
    const ptScreen = s.points.map((p) => ({ id: p.id, screen: t.toScreen(p.pos), seed: unitVec({ x: p.labelDir.x, y: -p.labelDir.y }) }));
    const labelDirs = chooseLabelDirs(ptScreen, obstacles, circScreen, REF_OFF, REF_CLEAR);

    return { scene: s, transform: t, crossings: x, labelDirs };
  }, [construction, positions, labels, angleMarks, width, height, padding, onPickIntersection, view.rot, view.flipX, view.flipY]);

  // Point radius in px, kept visually constant by dividing out the pan/zoom scale.
  // `r` sizes the marks/crossings/measure offsets; `pointR` is the small textbook-
  // style vertex marker (a big disc around each letter reads as "computer-drawn").
  const r = 4 / view.zoom;
  const pointR = 2 / view.zoom;
  const stroke = 1.5 / view.zoom;
  const fontSize = 16 / view.zoom;

  // Rotate the view so segment XY reads horizontal — pick a reference segment
  // instead of nudging the rotation slider. (rot = −angle(X→Y) lays X→Y along +x.)
  function alignHorizontal(seg: string) {
    const a = positions.get(seg[0]?.toUpperCase());
    const b = positions.get(seg[1]?.toUpperCase());
    if (a && b && (a.x !== b.x || a.y !== b.y)) setView((v) => ({ ...v, rot: normRot(-Math.atan2(b.y - a.y, b.x - a.x)) }));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, zoom: clamp(v.zoom * factor, 0.2, 8) }));
  }
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.x), panY: d.panY + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="geometry figure"
        style={{ touchAction: 'none', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          {/* Circles are drawn first (outline only) so chords/segments sit on top.
              The world→screen fit is isotropic, so a world radius scales by
              `transform.scale`. */}
          {scene.circles.map((circ) => {
            const c = transform.toScreen(circ.center);
            return (
              <circle
                key={circ.id}
                data-id={circ.id}
                cx={c.x}
                cy={c.y}
                r={circ.r * transform.scale}
                fill="none"
                stroke={lit(circ.id) ? ACCENT : '#334155'}
                strokeWidth={lit(circ.id) ? stroke * 2 : stroke}
              />
            );
          })}

          {/* Visible lines (a tangent / bisector / perpendicular / parallel) — drawn
              as a regular SOLID line. An infinite line is rendered as a long segment
              through its anchor along its (screen-space) direction; the SVG viewport
              clips it. */}
          {scene.lines.map((ln) => {
            const a = transform.toScreen(ln.anchor);
            const a2 = transform.toScreen({ x: ln.anchor.x + ln.dir.x, y: ln.anchor.y + ln.dir.y });
            const dx = a2.x - a.x;
            const dy = a2.y - a.y;
            const m = Math.hypot(dx, dy) || 1;
            const ux = (dx / m) * 6000;
            const uy = (dy / m) * 6000;
            return (
              <line
                key={ln.id}
                data-id={ln.id}
                x1={a.x - ux}
                y1={a.y - uy}
                x2={a.x + ux}
                y2={a.y + uy}
                stroke={lit(ln.id) ? ACCENT : '#334155'}
                strokeWidth={lit(ln.id) ? stroke * 2 : stroke}
              />
            );
          })}

          {/* Shapes are drawn as outlines only: every edge is a `segment`, so the
              figure is just its lines. Polygons stay in the scene (for future
              hit-testing) but are not filled or stroked. A selected fact is shown
              by accenting its segments and points, not by a fill. */}
          {scene.segments.map((seg) => {
            const a = transform.toScreen(seg.a);
            const b = transform.toScreen(seg.b);
            return (
              <line
                key={seg.id}
                data-id={seg.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit(seg.id) ? ACCENT : '#334155'}
                strokeWidth={lit(seg.id) ? stroke * 2 : stroke}
                strokeLinecap="round"
              />
            );
          })}

          {/* Unmarked crossings of declared segments: faint hollow dots, brighter
              on hover; clicking promotes one to a real named intersection point. */}
          {onPickIntersection &&
            crossings.map((x, i) => {
              const s = transform.toScreen(x.pos);
              const hot = hotCross === i;
              return (
                <circle
                  key={`x-${x.a}${x.b}-${x.c}${x.d}`}
                  data-crossing={`${x.a}${x.b}x${x.c}${x.d}`}
                  cx={s.x}
                  cy={s.y}
                  r={hot ? r * 1.5 : r * 1.1}
                  fill="#fff"
                  stroke={hot ? '#2563eb' : '#93c5fd'}
                  strokeWidth={hot ? stroke * 1.5 : stroke}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHotCross(i)}
                  onMouseLeave={() => setHotCross((h) => (h === i ? null : h))}
                  onClick={() => onPickIntersection(x)}
                >
                  {intersectionLabel && <title>{intersectionLabel}</title>}
                </circle>
              );
            })}

          {scene.points.map((pt) => {
            const s = transform.toScreen(pt.pos);
            // The label direction is chosen (zoom-independent) to clear the figure's
            // lines; fall back to the seed outward dir (Y-flipped to screen) if absent.
            const sd = labelDirs.get(pt.id) ?? unitVec({ x: pt.labelDir.x, y: -pt.labelDir.y });
            const off = pointR * 2 + fontSize * 0.5; // clear the (small) dot + a gap so the label is readable
            const anchor = sd.x > 0.3 ? 'start' : sd.x < -0.3 ? 'end' : 'middle';
            const baseline = sd.y > 0.3 ? 'hanging' : sd.y < -0.3 ? 'auto' : 'middle';
            return (
              <g key={pt.id} data-id={pt.id}>
                <circle cx={s.x} cy={s.y} r={lit(pt.id) ? pointR * 2 : pointR} fill={lit(pt.id) ? ACCENT : '#0f172a'} />
                <text
                  x={s.x + sd.x * off}
                  y={s.y + sd.y * off}
                  textAnchor={anchor}
                  dominantBaseline={baseline}
                  fontSize={fontSize}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={lit(pt.id) ? 700 : 400}
                  fill={lit(pt.id) ? '#b45309' : '#0f172a'}
                  // A white halo painted UNDER the glyph keeps the label readable even when
                  // it lands on a line (paint-order: stroke ⇒ the stroke draws first).
                  stroke="#fff"
                  strokeWidth={fontSize * 0.22}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                >
                  {pt.label}
                </text>
              </g>
            );
          })}

          {/* Measure labels (ADR-031): a length at its segment's midpoint nudged
              outward, an angle at its vertex nudged into the angle. Drawn upright
              (only world coordinates were oriented), in blue to set them apart from
              point names. Hidden when the host turns measures off. */}
          {showMeasures &&
            scene.measures.map((m, i) => {
              const s = transform.toScreen(m.pos);
              const sd = unitVec({ x: m.dir.x, y: -m.dir.y }); // world→screen Y-flip
              const off = m.kind === 'angle' ? r * 2.4 + fontSize * 0.7 : r * 1.4 + fontSize * 0.55;
              return (
                <text
                  key={`m-${i}`}
                  x={s.x + sd.x * off}
                  y={s.y + sd.y * off}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize * 0.85}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={500}
                  fill="#1d4ed8"
                  stroke="#fff"
                  strokeWidth={fontSize * 0.2}
                  strokeLinejoin="round"
                  // A measure is a math expression (12√2, 7k/5, 2α) — force LTR so the RTL (Hebrew)
                  // page context doesn't bidi-reorder its runs (12√2 was rendering as "2√12").
                  direction="ltr"
                  // A white halo (paint-order: stroke) keeps it legible over a line it sits on.
                  style={{ pointerEvents: 'none', direction: 'ltr', unicodeBidi: 'bidi-override', paintOrder: 'stroke' }}
                >
                  {m.text}
                </text>
              );
            })}

          {/* Angle marks the student asserted (only — never a computed 90°): a right-angle square,
              or an angle arc sampled the short (interior) way. Same blue as the measures. */}
          {showMeasures &&
            scene.angleMarks.map((m, i) => {
              const V = transform.toScreen(m.vertex);
              const P1 = transform.toScreen(m.p1);
              const P2 = transform.toScreen(m.p2);
              const u1 = unitVec({ x: P1.x - V.x, y: P1.y - V.y });
              const u2 = unitVec({ x: P2.x - V.x, y: P2.y - V.y });
              if (m.right) {
                const s = 3.2 * r; // right-angle square, sized like the point markers
                const c1 = `${V.x + u1.x * s},${V.y + u1.y * s}`;
                const c2 = `${V.x + (u1.x + u2.x) * s},${V.y + (u1.y + u2.y) * s}`;
                const c3 = `${V.x + u2.x * s},${V.y + u2.y * s}`;
                return <polyline key={`am-${i}`} points={`${c1} ${c2} ${c3}`} fill="none" stroke="#1d4ed8" strokeWidth={stroke} style={{ pointerEvents: 'none' }} />;
              }
              // arc: sample the SHORT signed angle from ray1 to ray2 (the interior angle)
              const ar = 4.2 * r;
              const th1 = Math.atan2(u1.y, u1.x);
              let dth = Math.atan2(u2.y, u2.x) - th1;
              while (dth > Math.PI) dth -= 2 * Math.PI;
              while (dth < -Math.PI) dth += 2 * Math.PI;
              const N = 14;
              const pts = Array.from({ length: N + 1 }, (_, k) => {
                const th = th1 + (dth * k) / N;
                return `${V.x + ar * Math.cos(th)},${V.y + ar * Math.sin(th)}`;
              }).join(' ');
              return <polyline key={`am-${i}`} points={pts} fill="none" stroke="#1d4ed8" strokeWidth={stroke} style={{ pointerEvents: 'none' }} />;
            })}
        </g>
      </svg>

      {/* Orientation controls — rotate / flip the whole figure; labels stay upright
          (only the world coordinates are oriented, never the label glyphs). */}
      <div style={{ position: 'absolute', top: 8, insetInlineStart: 8, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={ctrlBtn} title="Rotate 90°" aria-label="rotate 90 degrees" onClick={() => setView((v) => ({ ...v, rot: normRot(v.rot - Math.PI / 2) }))}>
          ⟳
        </button>
        <button type="button" style={ctrlBtn} title="Rotate 180°" aria-label="rotate 180 degrees" onClick={() => setView((v) => ({ ...v, rot: normRot(v.rot + Math.PI) }))}>
          180°
        </button>
        <button type="button" style={ctrlBtn} title="Flip horizontal" aria-label="flip horizontal" onClick={() => setView((v) => ({ ...v, flipX: !v.flipX }))}>
          ⇄
        </button>
        <button type="button" style={ctrlBtn} title="Flip vertical" aria-label="flip vertical" onClick={() => setView((v) => ({ ...v, flipY: !v.flipY }))}>
          ⇅
        </button>
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round((normRot(view.rot) * 180) / Math.PI)}
          title="Rotate"
          aria-label="rotate"
          onChange={(e) => setView((v) => ({ ...v, rot: normRot((Number(e.target.value) * Math.PI) / 180) }))}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ width: 90, cursor: 'pointer' }}
        />
        {/* Make a chosen segment horizontal — type its two points, e.g. "AB". */}
        <input
          type="text"
          maxLength={2}
          placeholder="⎯ AB"
          title="Make a segment horizontal — type its two endpoints (e.g. AB) and press Enter"
          aria-label="align segment horizontal"
          onKeyDown={(e) => {
            if (e.key === 'Enter') alignHorizontal((e.target as HTMLInputElement).value);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ width: 48, padding: '3px 6px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', textTransform: 'uppercase' }}
        />
      </div>

      <div style={{ position: 'absolute', top: 8, insetInlineEnd: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          type="button"
          style={{ ...ctrlBtn, ...(exportFlash === 'ok' ? { background: '#dcfce7', borderColor: '#86efac' } : exportFlash === 'err' ? { background: '#fee2e2', borderColor: '#fca5a5' } : null) }}
          title="Copy image to clipboard"
          aria-label="copy image to clipboard"
          onClick={copyImage}
        >
          {exportFlash === 'ok' ? '✓' : exportFlash === 'err' ? '✕' : '⧉'}
        </button>
        <button type="button" style={ctrlBtn} title="Save image (PNG)" aria-label="save image as PNG" onClick={saveImage}>
          ⤓
        </button>
        <button type="button" onClick={() => setView(IDENTITY)} style={ctrlBtn}>
          Reset view
        </button>
      </div>
    </div>
  );
}

/**
 * Rasterise the live SVG figure to a PNG blob — for "save image" / "copy image".
 * Browser-only (uses Image/canvas/DOM); never called during the SSR render tests.
 * A white rect is painted first so the PNG isn't transparent; `scale` over-samples
 * for a crisp result. `encodeURIComponent` (not btoa) carries Hebrew labels safely.
 */
async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const w = Number(svg.getAttribute('width')) || svg.clientWidth || 600;
  const h = Number(svg.getAttribute('height')) || svg.clientHeight || 600;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const data = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

const ctrlBtn: CSSProperties = {
  padding: '4px 9px',
  fontSize: 13,
  lineHeight: 1,
  minWidth: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  cursor: 'pointer',
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const unitVec = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

/** Distance from point p to segment a→b (screen space). */
function distToSeg(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/**
 * Choose each vertex label's direction so it clears the figure's lines. The
 * largest-empty-wedge seed (scene `labelDir`) only knows the segments meeting at
 * that vertex; here we score the candidate label box against EVERY segment, line,
 * and circle in screen space and rotate to the clearest spot — but bias toward the
 * seed so a label only moves when it would otherwise sit on a line. Computed at a
 * reference scale (zoom-independent) so labels don't jump when zooming.
 */
export function chooseLabelDirs(
  pts: { id: Id; screen: Vec; seed: Vec }[],
  obstacles: [Vec, Vec][],
  circles: { c: Vec; r: number }[],
  off: number,
  clearR: number,
): Map<Id, Vec> {
  const N = 24;
  const out = new Map<Id, Vec>();
  for (const pt of pts) {
    const seedAng = Math.atan2(pt.seed.y, pt.seed.x);
    let best = pt.seed;
    let bestScore = -Infinity;
    for (let k = 0; k < N; k++) {
      const ang = seedAng + (2 * Math.PI * k) / N;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const L = { x: pt.screen.x + dir.x * off, y: pt.screen.y + dir.y * off };
      let clr = Infinity;
      for (const [a, b] of obstacles) clr = Math.min(clr, distToSeg(L, a, b));
      for (const c of circles) clr = Math.min(clr, Math.abs(Math.hypot(L.x - c.c.x, L.y - c.c.y) - c.r));
      for (const q of pts) if (q !== pt) clr = Math.min(clr, Math.hypot(L.x - q.screen.x, L.y - q.screen.y));
      // Reward clearance up to a cap; penalise rotating away from the seed so we keep
      // the natural (outward) placement unless a line forces a move.
      const turn = Math.min(k, N - k) / N; // 0 (at seed) … 0.5 (opposite)
      const score = Math.min(clr, clearR * 1.6) - turn * clearR * 1.3;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    out.set(pt.id, best);
  }
  return out;
}
