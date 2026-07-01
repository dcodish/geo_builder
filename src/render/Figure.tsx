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
import type { CSSProperties, ReactNode } from 'react';
import type { Construction, Id, Vec } from '@/engine/types';
import { buildScene, relationMarks, relationAt, relationsForPick, scenePositions } from './scene';
import type { MeasureLabels, RelationPick } from './scene';
import type { RelationsResult } from '@/engine';
import { findSegmentCrossings } from './intersections';
import type { Crossing } from './intersections';
import { alignRotation, fitTransform, orient } from './transform';

export interface FigureProps {
  construction: Construction;
  positions: Map<Id, Vec>;
  width?: number;
  height?: number;
  padding?: number;
  /** Object ids to accent (e.g. those introduced by the selected fact). */
  highlight?: Set<Id>;
  /** Point-PAIRS to accent as strokes between their positions — a shape's boundary edges, INCLUDING a
   *  sub-segment that is only a portion of a longer drawn segment (e.g. `G–C`, a slice of `EC`) and so has
   *  no object id of its own. Drawn on top of the base segments; used by the shape-badge highlight (ADR-167 Am.). */
  highlightEdges?: [Id, Id][];
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
  /** The "view relations" ground-truth layer (ADR-134): equal-segment ticks + equal-angle arcs. When set,
   *  it's drawn on the current figure; omit/undefined = layer off. */
  relations?: RelationsResult | null;
  /** Show the measure labels + angle marks (default true); the host's "show measures" toggle drives this. */
  showMeasures?: boolean;
  /** Reveal every circle's centre + label (ADR-059); driven by the host's "show centres" toggle. */
  showCenters?: boolean;
  /** Point ids whose label + dot are hidden — drawn instead as a faint clickable ghost (FR-RN-10). */
  hidden?: Set<Id>;
  /** Relabel a point (clicked on the canvas) — the host wires the store's `rename`; the result drives an
   *  inline note (e.g. the new letter is already taken). When provided (with `onToggleHidden`), points
   *  become clickable and open the edit menu. */
  onRename?: (from: Id, to: Id) => { ok: boolean; reason?: string };
  /** Hide/show a point's label + dot (clicked on the canvas) — the host wires the store's `toggleHidden`. */
  onToggleHidden?: (id: Id) => void;
  /** Localised strings for the on-canvas point-edit menu (rename / hide / show / the no-op reasons). */
  pointMenuText?: { rename: string; hide: string; show: string; apply: string; taken: string; bad: string };
  /** Per-segment display style (keyed by seg id) — hidden and/or dashed (FR-RN-10). */
  segStyle?: Record<Id, { hidden?: boolean; dashed?: boolean }>;
  /** Hide/show a segment (clicked on the canvas) — the host wires the store's `toggleSegHidden`. */
  onToggleSegHidden?: (id: Id) => void;
  /** Make a segment dashed/solid (clicked on the canvas) — the host wires the store's `toggleSegDashed`. */
  onToggleSegDashed?: (id: Id) => void;
  /** Swap a segment's two endpoint labels (A ↔ B) — the host wires the store's `swap`. Lets the student
   *  flip which end is which (e.g. a chord's C/D) without the rename "target taken" dead-end (ADR-122). */
  onSwap?: (a: Id, b: Id) => { ok: boolean; reason?: string };
  /** Localised strings for the on-canvas segment menu. */
  segMenuText?: { hide: string; show: string; dashed: string; solid: string; swap: string };
  /** Circle ids hidden on the figure (a display preference, like {@link segStyle}'s hidden). */
  hiddenCircles?: Set<Id>;
  /** Hide/show a circle (clicked on the canvas) — the host wires the store's `toggleCircleHidden`. */
  onToggleCircleHidden?: (id: Id) => void;
  /** Localised strings for the on-canvas circle menu. */
  circleMenuText?: { hide: string; show: string };
  /** Localised strings for the figure's own toolbar (rotate/flip/centres/export/reset).
   *  Optional — falls back to English so the renderer stays usable standalone (tests). */
  toolbarText?: {
    rotate90: string;
    rotate180: string;
    flipH: string;
    flipV: string;
    rotate: string;
    transform: string;
    alignSeg: string;
    copyImage: string;
    saveImage: string;
    copied: string;
    reset: string;
  };
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
  /** Figure orientation: rotation (radians) + mirror flags. Labels stay upright. */
  rot: number;
  flipX: boolean;
  flipY: boolean;
  /**
   * A standing "lay this segment horizontal" request (two point ids). It is re-applied on
   * every render from the CURRENT positions, so the chosen segment stays horizontal as the
   * figure reshapes under new constraints. `rot` is then an extra manual offset on top.
   */
  alignSeg?: [string, string];
}

const IDENTITY: View = { zoom: 1, panX: 0, panY: 0, rot: 0, flipX: false, flipY: false };
const TWO_PI = 2 * Math.PI;
const normRot = (r: number): number => ((r % TWO_PI) + TWO_PI) % TWO_PI;

const ACCENT = '#f59e0b';

/**
 * Render a point label with a subscripted digit suffix: a canonical ASCII id like
 * "O1" draws as "O₁" (base + a smaller, lowered `<tspan>`). Presentation only — the
 * id stays "O1" everywhere else. A plain label (no trailing digits) renders as-is.
 */
function subscriptLabel(label: string, fontSize: number): ReactNode {
  const m = /^(.*?)(\d+)$/.exec(label);
  if (!m || !m[1]) return label; // no trailing digits (or all digits) → render verbatim
  return (
    <>
      {m[1]}
      <tspan fontSize={fontSize * 0.7} dy={fontSize * 0.16}>
        {m[2]}
      </tspan>
    </>
  );
}

export function Figure({
  construction,
  positions,
  width = 600,
  height = 600,
  padding = 48,
  highlight,
  highlightEdges,
  onPickIntersection,
  intersectionLabel,
  labels,
  angleMarks,
  relations,
  showMeasures = true,
  hidden,
  showCenters = false,
  onRename,
  onToggleHidden,
  pointMenuText,
  segStyle,
  onToggleSegHidden,
  onToggleSegDashed,
  onSwap,
  segMenuText,
  hiddenCircles,
  onToggleCircleHidden,
  circleMenuText,
  toolbarText,
}: FigureProps) {
  // English fallbacks so the renderer works standalone (e.g. the SSR render tests, which
  // pass no toolbarText); the host (App) supplies localized Hebrew strings.
  const tt = {
    rotate90: 'Rotate 90°',
    rotate180: 'Rotate 180°',
    flipH: 'Flip horizontal',
    flipV: 'Flip vertical',
    rotate: 'Rotate',
    transform: 'Rotate & align',
    alignSeg: 'Make a segment horizontal — type its two endpoints (e.g. AB) and press Enter',
    copyImage: 'Copy image',
    saveImage: 'Save image',
    copied: 'Copied',
    reset: 'Reset view',
    ...toolbarText,
  };
  const lit = (id: string): boolean => !!highlight && highlight.has(id);
  const isHidden = (id: string): boolean => !!hidden && hidden.has(id);
  const segOf = (id: string) => segStyle?.[id] ?? {};
  const circHidden = (id: string): boolean => !!hiddenCircles && hiddenCircles.has(id);
  const editable = !!onToggleHidden || !!onRename; // points are clickable only when the host wires the edit menu
  const segEditable = !!onToggleSegHidden || !!onToggleSegDashed; // ditto for segments
  const circEditable = !!onToggleCircleHidden; // ditto for circles
  const [view, setView] = useState<View>(IDENTITY);
  const [hotCross, setHotCross] = useState<number | null>(null);
  const [exportFlash, setExportFlash] = useState<'' | 'ok' | 'err'>('');
  const [showOrient, setShowOrient] = useState(false); // the rotate/flip/align cluster — collapsed by default (declutter)
  // The on-canvas edit menu: a point (rename / hide) or a segment (hide / dashed), where (container px),
  // and a transient note (e.g. "taken").
  const [menu, setMenu] = useState<{ kind: 'point' | 'segment' | 'circle'; id: string; x: number; y: number } | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuNote, setMenuNote] = useState('');
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function openMenu(kind: 'point' | 'segment' | 'circle', id: string, screen: Vec) {
    setMenu({ kind, id, x: view.panX + screen.x * view.zoom, y: view.panY + screen.y * view.zoom });
    setRenameVal('');
    setMenuNote('');
  }
  function applyRename(id: string) {
    const to = renameVal.trim().toUpperCase();
    if (!to || !onRename) return;
    const res = onRename(id, to);
    if (res.ok) setMenu(null);
    else setMenuNote(res.reason === 'target-taken' ? (pointMenuText?.taken ?? 'taken') : (pointMenuText?.bad ?? ''));
  }

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

  const { scene, transform, crossings, labelDirs, oriented } = useMemo(() => {
    // Rotate/flip the figure in world space, then fit — so it stays centred and
    // labels (computed here, drawn upright) follow the new orientation. A standing
    // "align segment horizontal" request is recomputed from the CURRENT positions each
    // render, so the segment stays horizontal as the figure reshapes; view.rot adds on top.
    const base = view.alignSeg ? alignRotation(positions.get(view.alignSeg[0]), positions.get(view.alignSeg[1])) : 0;
    const o = { rot: normRot(base + view.rot), flipX: view.flipX, flipY: view.flipY };
    const oriented =
      o.rot === 0 && !o.flipX && !o.flipY
        ? positions
        : new Map<Id, Vec>([...positions].map(([id, v]) => [id, orient(v, o)]));
    const s = buildScene(construction, oriented, labels, angleMarks, { showCenters });
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

    return { scene: s, transform: t, crossings: x, labelDirs, oriented };
  }, [construction, positions, labels, angleMarks, width, height, padding, onPickIntersection, view.rot, view.flipX, view.flipY, view.alignSeg, showCenters]);

  // "View relations" is now HOVER-DRIVEN to fight clutter (ADR-167 Am.): the resting figure is clean, and
  // pointing at a side/angle reveals ONLY its equality class. `hoverRel` is the class under the cursor;
  // `relMarks` draws just that class, and a hovered length class also gets accent strokes on its members.
  const [hoverRel, setHoverRel] = useState<RelationPick | null>(null);
  const activeHover = relations ? hoverRel : null; // ignore a stale pick once the layer is off
  const relMarks = relations && activeHover ? relationMarks(relationsForPick(relations, activeHover), oriented) : null;
  const relAccentEdges: [Id, Id][] =
    relations && activeHover?.kind === 'segment' && relations.equalSegments[activeHover.classIndex]
      ? (relations.equalSegments[activeHover.classIndex] as [Id, Id][])
      : [];
  const overlayEdges: [Id, Id][] = [...(highlightEdges ?? []), ...relAccentEdges];

  // Point radius in px, kept visually constant by dividing out the pan/zoom scale.
  // `r` sizes the marks/crossings/measure offsets; `pointR` is the small textbook-
  // style vertex marker (a big disc around each letter reads as "computer-drawn").
  const r = 4 / view.zoom;
  const pointR = 2 / view.zoom;
  const stroke = 1.5 / view.zoom;
  const fontSize = 16 / view.zoom;
  const REL = '#0d9488'; // the "view relations" layer colour (teal) — distinct from the blue stated-angle marks
  // One colour PER equality class, so equal segments / equal angles that share a colour are read as equal at
  // a glance even where their marks overlap (operator request). Avoids the stated-angle blue (#1d4ed8). The
  // class index is `count − 1` (class 0 → 1 tick/arc, class 1 → 2, …).
  const REL_PALETTE = ['#0d9488', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#0891b2', '#65a30d', '#be123c'];
  const relColor = (count: number) => REL_PALETTE[(count - 1) % REL_PALETTE.length];

  // Lay segment XY horizontal — pick a reference segment instead of nudging the slider.
  // Store the SEGMENT (not a fixed angle) as a standing request, recomputed each render
  // (above), so it stays horizontal as the figure reshapes; reset the manual offset to 0.
  function alignHorizontal(seg: string) {
    const a0 = seg[0]?.toUpperCase();
    const b0 = seg[1]?.toUpperCase();
    if (!a0 || !b0) return;
    const a = positions.get(a0);
    const b = positions.get(b0);
    if (a && b && (a.x !== b.x || a.y !== b.y)) setView((v) => ({ ...v, alignSeg: [a0, b0], rot: 0 }));
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
    if (d) {
      setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.x), panY: d.panY + (e.clientY - d.y) }));
      return;
    }
    // Not dragging: while the relations layer is on, pick the equality class under the cursor (hover-to-focus).
    if (!relations || !svgRef.current) {
      if (hoverRel) setHoverRel(null);
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (width / (rect.width || width));
    const sy = (e.clientY - rect.top) * (height / (rect.height || height));
    const world = transform.toWorld({ x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom });
    const pxToWorld = 1 / (transform.scale * view.zoom);
    const pick = relationAt(relations, oriented, world, 10 * pxToWorld, 44 * pxToWorld);
    setHoverRel((prev) => (prev?.kind === pick?.kind && prev?.classIndex === pick?.classIndex ? prev : pick));
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onPointerLeave() {
    if (hoverRel) setHoverRel(null);
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
        onPointerLeave={onPointerLeave}
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          {/* Circles are drawn first (outline only) so chords/segments sit on top.
              The world→screen fit is isotropic, so a world radius scales by
              `transform.scale`. */}
          {scene.circles.map((circ) => {
            const c = transform.toScreen(circ.center);
            const r = circ.r * transform.scale;
            return (
              <g key={circ.id} data-id={circ.id}>
                {circHidden(circ.id) ? (
                  // A HIDDEN circle draws NOTHING — truly invisible (operator: "hide should hide"). It stays
                  // reversible because the always-present transparent hit-ring below remains clickable on the
                  // circle's former outline → the menu's "show". Its points still constrain the figure.
                  null
                ) : (
                  <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={lit(circ.id) ? ACCENT : '#334155'} strokeWidth={lit(circ.id) ? stroke * 2 : stroke} />
                )}
                {circEditable && (
                  // A wide transparent hit-ring so the thin outline is easy to click → the circle menu.
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={r}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(stroke * 6, 10 / view.zoom)}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu('circle', circ.id, { x: c.x, y: c.y - r });
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* Arcs (a semicircle / quarter circle) — an SVG elliptical-arc path between the
              two endpoints; the radius scales isotropically like a circle. */}
          {scene.arcs.map((arc) => {
            const a = transform.toScreen(arc.from);
            const b = transform.toScreen(arc.to);
            const rs = arc.r * transform.scale;
            return (
              <path
                key={arc.id}
                data-id={arc.id}
                d={`M ${a.x} ${a.y} A ${rs} ${rs} 0 ${arc.largeArc} ${arc.sweep} ${b.x} ${b.y}`}
                fill="none"
                stroke={lit(arc.id) ? ACCENT : '#334155'}
                strokeWidth={lit(arc.id) ? stroke * 2 : stroke}
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
            const st = segOf(seg.id);
            const dash = st.dashed ? `${6 / view.zoom} ${5 / view.zoom}` : undefined;
            return (
              <g key={seg.id} data-id={seg.id}>
                {st.hidden ? (
                  // A HIDDEN segment: a very faint dashed ghost — invisible-ish but clickable, so the
                  // toggle is reversible right on the line (FR-RN-10). The endpoints (points) are unaffected.
                  segEditable && (
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e2e8f0" strokeWidth={stroke} strokeDasharray={`${stroke * 1.5} ${stroke * 3}`} />
                  )
                ) : (
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={lit(seg.id) ? ACCENT : '#334155'}
                    strokeWidth={lit(seg.id) ? stroke * 2 : stroke}
                    strokeLinecap="round"
                    strokeDasharray={dash}
                  />
                )}
                {segEditable && (
                  // A wide transparent hit-line so the thin segment is easy to click → the segment menu.
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={Math.max(stroke * 6, 10 / view.zoom)}
                    strokeLinecap="round"
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu('segment', seg.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* Shape-badge highlight: accent each boundary edge as a stroke between its endpoints' positions,
              so a sub-segment that is only part of a longer drawn segment (G–C ⊂ EC, with no object of its
              own) lights up too (ADR-167 Am.). Non-interactive; sits on top of the base segments. */}
          {overlayEdges.map(([ea, eb], i) => {
            const pa = oriented.get(ea);
            const pb = oriented.get(eb);
            if (!pa || !pb) return null;
            const a = transform.toScreen(pa);
            const b = transform.toScreen(pb);
            return (
              <line
                key={`he-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={ACCENT}
                strokeWidth={stroke * 2.5}
                strokeLinecap="round"
                opacity={0.9}
                style={{ pointerEvents: 'none' }}
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
            const hide = isHidden(pt.id);
            // The label direction is chosen (zoom-independent) to clear the figure's
            // lines; fall back to the seed outward dir (Y-flipped to screen) if absent.
            const sd = labelDirs.get(pt.id) ?? unitVec({ x: pt.labelDir.x, y: -pt.labelDir.y });
            const off = pointR * 2 + fontSize * 0.5; // clear the (small) dot + a gap so the label is readable
            const anchor = sd.x > 0.3 ? 'start' : sd.x < -0.3 ? 'end' : 'middle';
            const baseline = sd.y > 0.3 ? 'hanging' : sd.y < -0.3 ? 'auto' : 'middle';
            // A generous transparent hit-target so the (tiny) dot/ghost is easy to click.
            const hitR = Math.max(r * 2.5, 9 / view.zoom);
            return (
              <g key={pt.id} data-id={pt.id}>
                {hide ? (
                  // A HIDDEN point: a faint dashed ghost ring (no label, no solid dot) — unobtrusive but
                  // clickable, so "click there again" brings the label + dot back (FR-RN-10).
                  <circle cx={s.x} cy={s.y} r={pointR * 1.8} fill="none" stroke="#cbd5e1" strokeWidth={stroke} strokeDasharray={`${stroke * 1.5} ${stroke * 1.5}`} />
                ) : (
                  <>
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
                      {subscriptLabel(pt.label, fontSize)}
                    </text>
                  </>
                )}
                {editable && (
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={hitR}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu('point', pt.id, s);
                    }}
                  >
                    <title>{pt.label}</title>
                  </circle>
                )}
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
              // An angle value sits FURTHER into the wedge (just inside its bigger arc, below) and is drawn a
              // bit LARGER than a length, so it's clear WHICH angle it labels and легible (operator request).
              // An AREA label sits AT the polygon's centroid (no offset).
              const off = m.kind === 'area' ? 0 : m.kind === 'angle' ? r * 4.2 + fontSize * 0.7 : r * 1.4 + fontSize * 0.55;
              return (
                <text
                  key={`m-${i}`}
                  x={s.x + sd.x * off}
                  y={s.y + sd.y * off}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize * (m.kind === 'angle' ? 1.05 : 0.85)}
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
                const s = 4 * r; // right-angle square — a touch larger so it reads clearly (operator request)
                const c1 = `${V.x + u1.x * s},${V.y + u1.y * s}`;
                const c2 = `${V.x + (u1.x + u2.x) * s},${V.y + (u1.y + u2.y) * s}`;
                const c3 = `${V.x + u2.x * s},${V.y + u2.y * s}`;
                return <polyline key={`am-${i}`} points={`${c1} ${c2} ${c3}`} fill="none" stroke="#1d4ed8" strokeWidth={stroke} style={{ pointerEvents: 'none' }} />;
              }
              // arc: sample the SHORT signed angle from ray1 to ray2 (the interior angle). Drawn well clear
              // of the vertex so it's obvious WHICH angle is marked, not a tiny nick at the corner (operator).
              const ar = 6.5 * r;
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

          {/* "view relations" ground-truth layer (ADR-134): equal-segment ticks + equal-angle arcs. The
              equality-class count (1/2/3 ticks-or-arcs) distinguishes one equal-group from another. */}
          {relMarks && (
            <g style={{ pointerEvents: 'none' }}>
              {relMarks.ticks.flatMap((tk, i) => {
                const A = transform.toScreen(tk.a);
                const B = transform.toScreen(tk.b);
                const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
                const ux = (B.x - A.x) / L;
                const uy = (B.y - A.y) / L;
                const nx = -uy; // perpendicular to the segment (the hatch direction)
                const ny = ux;
                const mx = (A.x + B.x) / 2;
                const my = (A.y + B.y) / 2;
                const half = 1.8 * r; // hatch half-length
                const spacing = 1.7 * r; // gap between the ticks of one group, centred on the midpoint
                return Array.from({ length: tk.count }, (_, k) => {
                  const off = (k - (tk.count - 1) / 2) * spacing;
                  const cx = mx + ux * off;
                  const cy = my + uy * off;
                  return (
                    <line
                      key={`rt-${i}-${k}`}
                      x1={cx - nx * half}
                      y1={cy - ny * half}
                      x2={cx + nx * half}
                      y2={cy + ny * half}
                      stroke={relColor(tk.count)}
                      strokeWidth={stroke * 1.4}
                      strokeLinecap="round"
                    />
                  );
                });
              })}
              {relMarks.angles.flatMap((an, i) => {
                const V = transform.toScreen(an.vertex);
                const P1 = transform.toScreen(an.p1);
                const P2 = transform.toScreen(an.p2);
                const u1 = unitVec({ x: P1.x - V.x, y: P1.y - V.y });
                const u2 = unitVec({ x: P2.x - V.x, y: P2.y - V.y });
                const th1 = Math.atan2(u1.y, u1.x);
                let dth = Math.atan2(u2.y, u2.x) - th1; // the short signed (interior) angle
                while (dth > Math.PI) dth -= 2 * Math.PI;
                while (dth < -Math.PI) dth += 2 * Math.PI;
                const N = 14;
                return Array.from({ length: an.count }, (_, k) => {
                  const ar = 4.5 * r + (an.startArc + k) * 1.5 * r; // concentric arcs, staggered past other marks at this vertex
                  const pts = Array.from({ length: N + 1 }, (_, j) => {
                    const th = th1 + (dth * j) / N;
                    return `${V.x + ar * Math.cos(th)},${V.y + ar * Math.sin(th)}`;
                  }).join(' ');
                  return <polyline key={`ra-${i}-${k}`} points={pts} fill="none" stroke={relColor(an.count)} strokeWidth={stroke * 1.4} />;
                });
              })}
              {/* Definitive angle VALUES (e.g. "60°") — printed inside the angle along its bisector, with a
                  white halo so the number reads over the figure's lines. */}
              {relMarks.values.map((vl, i) => {
                const V = transform.toScreen(vl.vertex);
                const P1 = transform.toScreen(vl.p1);
                const P2 = transform.toScreen(vl.p2);
                const u1 = unitVec({ x: P1.x - V.x, y: P1.y - V.y });
                const u2 = unitVec({ x: P2.x - V.x, y: P2.y - V.y });
                const bl = Math.hypot(u1.x + u2.x, u1.y + u2.y) || 1;
                // Beyond the equal-angle arcs, into the angle's interior; each successive value at the SAME
                // vertex (rank 1, 2, …) is pushed further out along its bisector so they don't overlap.
                const off = (8.5 + vl.rank * 4.2) * r;
                const lx = V.x + ((u1.x + u2.x) / bl) * off;
                const ly = V.y + ((u1.y + u2.y) / bl) * off;
                return (
                  <text
                    key={`rv-${i}`}
                    x={lx}
                    y={ly}
                    fontSize={fontSize * 0.78}
                    fill={REL}
                    textAnchor="middle"
                    dominantBaseline="central"
                    stroke="#fff"
                    strokeWidth={stroke * 2.2}
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none', fontWeight: 600 }}
                  >
                    {vl.text}
                  </text>
                );
              })}
              {/* Forced RIGHT angles (≈90°) drawn as the textbook right-angle SQUARE (the "knee"), not a
                  "90°" number (operator request) — same square as a stated mark, in the relations colour. */}
              {relMarks.rightAngles.map((m, i) => {
                const V = transform.toScreen(m.vertex);
                const P1 = transform.toScreen(m.p1);
                const P2 = transform.toScreen(m.p2);
                const u1 = unitVec({ x: P1.x - V.x, y: P1.y - V.y });
                const u2 = unitVec({ x: P2.x - V.x, y: P2.y - V.y });
                const s = 4 * r;
                const c1 = `${V.x + u1.x * s},${V.y + u1.y * s}`;
                const c2 = `${V.x + (u1.x + u2.x) * s},${V.y + (u1.y + u2.y) * s}`;
                const c3 = `${V.x + u2.x * s},${V.y + u2.y * s}`;
                return <polyline key={`rr-${i}`} points={`${c1} ${c2} ${c3}`} fill="none" stroke={REL} strokeWidth={stroke} style={{ pointerEvents: 'none' }} />;
              })}
            </g>
          )}
        </g>
      </svg>

      {/* On-canvas edit menu (FR-RN-10): click a POINT to rename it or hide/show its label+dot, or a
          SEGMENT to hide/show it or make it dashed/solid. A transparent backdrop closes it on outside click. */}
      {menu && (menu.kind === 'point' ? editable : menu.kind === 'segment' ? segEditable : circEditable) && (
        <>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setMenu(null)} />
          <div
            style={{
              position: 'absolute',
              insetInlineStart: clamp(menu.x + 8, 0, width - 150),
              top: clamp(menu.y + 8, 0, height - 80),
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              zIndex: 10,
              minWidth: 132,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{menu.kind === 'point' ? menu.id : menu.kind === 'segment' ? menu.id.replace(/^seg-/, '') : menu.id.replace(/^circle-/, '⊙ ')}</div>
            {menu.kind === 'point' ? (
              <>
                {onRename && !isHidden(menu.id) && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      autoFocus
                      value={renameVal}
                      maxLength={3}
                      placeholder={pointMenuText?.rename ?? 'rename'}
                      onChange={(e) => {
                        setRenameVal(e.target.value);
                        if (menuNote) setMenuNote('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyRename(menu.id);
                        if (e.key === 'Escape') setMenu(null);
                      }}
                      style={{ width: 64, padding: '3px 6px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1', textTransform: 'uppercase' }}
                    />
                    <button type="button" style={ctrlBtn} title={pointMenuText?.apply ?? 'apply'} onClick={() => applyRename(menu.id)}>
                      ✓
                    </button>
                  </div>
                )}
                {menuNote && <div style={{ fontSize: 11, color: '#dc2626' }}>{menuNote}</div>}
                {onToggleHidden && (
                  <button type="button" style={{ ...ctrlBtn, textAlign: 'start' }} onClick={() => { onToggleHidden(menu.id); setMenu(null); }}>
                    {isHidden(menu.id) ? (pointMenuText?.show ?? 'show') : (pointMenuText?.hide ?? 'hide')}
                  </button>
                )}
              </>
            ) : menu.kind === 'segment' ? (
              <>
                {onToggleSegHidden && (
                  <button type="button" style={{ ...ctrlBtn, textAlign: 'start' }} onClick={() => { onToggleSegHidden(menu.id); setMenu(null); }}>
                    {segOf(menu.id).hidden ? (segMenuText?.show ?? 'show') : (segMenuText?.hide ?? 'hide')}
                  </button>
                )}
                {onToggleSegDashed && !segOf(menu.id).hidden && (
                  <button type="button" style={{ ...ctrlBtn, textAlign: 'start' }} onClick={() => { onToggleSegDashed(menu.id); setMenu(null); }}>
                    {segOf(menu.id).dashed ? (segMenuText?.solid ?? 'solid') : (segMenuText?.dashed ?? 'dashed')}
                  </button>
                )}
                {onSwap && (() => {
                  // Swap the segment's two endpoint LABELS (e.g. a chord's C ↔ D) — the menu header already
                  // shows which segment. Only a named segment carries its endpoint ids (a line-derived one doesn't).
                  const seg = scene.segments.find((sg) => sg.id === menu.id);
                  if (!seg?.aId || !seg.bId) return null;
                  const { aId, bId } = seg;
                  return (
                    <button type="button" style={{ ...ctrlBtn, textAlign: 'start' }} onClick={() => { onSwap(aId, bId); setMenu(null); }}>
                      {segMenuText?.swap ?? 'swap'}
                    </button>
                  );
                })()}
              </>
            ) : (
              <>
                {onToggleCircleHidden && (
                  <button type="button" style={{ ...ctrlBtn, textAlign: 'start' }} onClick={() => { onToggleCircleHidden(menu.id); setMenu(null); }}>
                    {circHidden(menu.id) ? (circleMenuText?.show ?? 'show') : (circleMenuText?.hide ?? 'hide')}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Orientation controls — rotate / flip / align the whole figure (labels stay upright). These are
          secondary, so they're collapsed behind a single labeled toggle to keep the canvas uncluttered. */}
      <div style={{ position: 'absolute', top: 8, insetInlineStart: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <button
          type="button"
          style={{ ...ctrlBtn, ...(showOrient ? { background: '#dbeafe', borderColor: '#93c5fd' } : null) }}
          title={tt.transform}
          aria-label={tt.transform}
          aria-expanded={showOrient}
          onClick={() => setShowOrient((v) => !v)}
        >
          ⟳ {tt.transform} {showOrient ? '▴' : '▾'}
        </button>
        {showOrient && (
          <div style={orientPopover}>
            <button type="button" style={ctrlBtn} title={tt.rotate90} aria-label={tt.rotate90} onClick={() => setView((v) => ({ ...v, rot: normRot(v.rot - Math.PI / 2) }))}>
              ⟳
            </button>
            <button type="button" style={ctrlBtn} title={tt.rotate180} aria-label={tt.rotate180} onClick={() => setView((v) => ({ ...v, rot: normRot(v.rot + Math.PI) }))}>
              180°
            </button>
            <button type="button" style={ctrlBtn} title={tt.flipH} aria-label={tt.flipH} onClick={() => setView((v) => ({ ...v, flipX: !v.flipX }))}>
              ⇄
            </button>
            <button type="button" style={ctrlBtn} title={tt.flipV} aria-label={tt.flipV} onClick={() => setView((v) => ({ ...v, flipY: !v.flipY }))}>
              ⇅
            </button>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round((normRot(view.rot) * 180) / Math.PI)}
              title={tt.rotate}
              aria-label={tt.rotate}
              onChange={(e) => setView((v) => ({ ...v, rot: normRot((Number(e.target.value) * Math.PI) / 180) }))}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ width: 90, cursor: 'pointer' }}
            />
            {/* Make a chosen segment horizontal — type its two points, e.g. "AB". */}
            <input
              type="text"
              maxLength={2}
              placeholder="⎯ AB"
              title={tt.alignSeg}
              aria-label={tt.alignSeg}
              onKeyDown={(e) => {
                if (e.key === 'Enter') alignHorizontal((e.target as HTMLInputElement).value);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ width: 48, padding: '3px 6px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', textTransform: 'uppercase' }}
            />
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', top: 8, insetInlineEnd: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Export — most-used by teachers, so these are prominent labeled buttons. */}
        <button
          type="button"
          style={{ ...exportBtn, ...(exportFlash === 'ok' ? { background: '#dcfce7', borderColor: '#86efac', color: '#166534' } : exportFlash === 'err' ? { background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' } : null) }}
          title={tt.copyImage}
          aria-label={tt.copyImage}
          onClick={copyImage}
        >
          {exportFlash === 'ok' ? `✓ ${tt.copied}` : exportFlash === 'err' ? '✕' : `⧉ ${tt.copyImage}`}
        </button>
        <button type="button" style={exportBtn} title={tt.saveImage} aria-label={tt.saveImage} onClick={saveImage}>
          ⤓ {tt.saveImage}
        </button>
        <button type="button" onClick={() => setView(IDENTITY)} style={ctrlBtn} title={tt.reset} aria-label={tt.reset}>
          ↺
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
// The collapsible rotate/flip/align cluster.
const orientPopover: CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  flexWrap: 'wrap',
  maxWidth: 250,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 6,
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
};
// The export (copy / download) buttons — prominent + labeled, since teachers rely on them most.
const exportBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  borderRadius: 8,
  border: '1px solid #2563eb',
  background: '#eff6ff',
  color: '#1e40af',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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
