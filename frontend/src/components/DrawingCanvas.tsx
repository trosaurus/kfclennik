import { useEffect, useRef, useState } from 'react';
import {
  DrawingScene, DrawingElement, DrawingElementType, DrawingBackground,
  PlayerColor, ConeColor, PLAYER_COLORS, CONE_COLORS,
} from '../lib/api';
import './DrawingCanvas.css';

// Standaard-veld is staand (mobielvriendelijk). Een geïmporteerde tekening kan
// liggend zijn (bv. een volledig veld met meerdere zones) — in dat geval past
// het canvas zich aan i.p.v. de afbeelding in de staande vorm te persen en
// zo de zijkanten weg te snijden.
const PORTRAIT_W = 350, PORTRAIT_H = 460;
const LANDSCAPE_W = 460, LANDSCAPE_H = 350;

interface Props {
  scene: DrawingScene;
  onChange?: (scene: DrawingScene) => void;
  readOnly?: boolean;
}

type Tool = 'select' | DrawingElementType;

const POINT_TOOLS: { tool: DrawingElementType; icon: string; title: string }[] = [
  { tool: 'player', icon: '●',  title: 'Speler' },
  { tool: 'cone',   icon: '▲',  title: 'Pion' },
  { tool: 'joker',  icon: '◆',  title: 'Joker' },
  { tool: 'goal',   icon: '🥅', title: 'Doeltje' },
  { tool: 'ball',   icon: '⚽', title: 'Bal' },
  { tool: 'ladder', icon: '☰',  title: 'Ladder' },
  { tool: 'flag',   icon: '🚩', title: 'Vlag' },
  { tool: 'text',   icon: 'T',  title: 'Tekst' },
];

const ARROW_TOOLS: { tool: DrawingElementType; icon: string; title: string }[] = [
  { tool: 'arrow-pass',    icon: '→', title: 'Pijl: pass' },
  { tool: 'arrow-dribble', icon: '⇝', title: 'Pijl: dribbel' },
  { tool: 'arrow-run',     icon: '⤍', title: 'Pijl: loop zonder bal' },
];

function uid(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function playerHex(color?: string): string {
  return PLAYER_COLORS.find(c => c.value === color)?.hex ?? PLAYER_COLORS[0].hex;
}
function coneHex(color?: string): string {
  return CONE_COLORS.find(c => c.value === color)?.hex ?? CONE_COLORS[0].hex;
}

export default function DrawingCanvas({ scene, onChange, readOnly }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H;

  useEffect(() => {
    const src = scene.backgroundImage;
    if (!src) { setIsLandscape(false); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setIsLandscape(img.naturalWidth > img.naturalHeight); };
    img.src = src;
    return () => { cancelled = true; };
  }, [scene.backgroundImage]);

  const [tool, setTool] = useState<Tool>('select');
  const [playerColor, setPlayerColor] = useState<PlayerColor>('red');
  const [coneColor, setConeColor] = useState<ConeColor>('orange');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawingScene[]>([]);
  const [future, setFuture] = useState<DrawingScene[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const dragStartSceneRef = useRef<DrawingScene | null>(null);
  const draftArrowRef = useRef<{ x: number; y: number } | null>(null);
  const [draftArrow, setDraftArrow] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);

  function toSvgCoords(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: (loc.x / W) * 100, y: (loc.y / H) * 100 };
  }

  function commit(next: DrawingScene) {
    setHistory(h => [...h, scene]);
    setFuture([]);
    onChange?.(next);
  }

  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setFuture(f => [scene, ...f]);
    onChange?.(prev);
  }
  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setHistory(h => [...h, scene]);
    onChange?.(next);
  }

  function addElement(el: DrawingElement) {
    commit({ ...scene, elements: [...scene.elements, el] });
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit({ ...scene, elements: scene.elements.filter(el => el.id !== selectedId) });
    setSelectedId(null);
  }

  function clearAll() {
    if (scene.elements.length === 0) return;
    if (!confirm('Volledige tekening wissen?')) return;
    commit({ ...scene, elements: [] });
    setSelectedId(null);
  }

  function setBackground(bg: DrawingBackground) {
    // Een preset kiezen vervangt de geïmporteerde veldtekening (indien aanwezig)
    // door het vector-veld — bewuste, onomkeerbare keuze zoals "opnieuw beginnen".
    commit({ ...scene, background: bg, backgroundImage: undefined });
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────
  function onCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (tool === 'text') {
      const label = prompt('Tekst:');
      if (label && label.trim()) addElement({ id: uid(), type: 'text', x, y, label: label.trim() });
      return;
    }
    if (tool === 'arrow-pass' || tool === 'arrow-dribble' || tool === 'arrow-run') {
      draftArrowRef.current = { x, y };
      setDraftArrow({ x, y, x2: x, y2: y });
      return;
    }
    // point-type tools
    let label: string | undefined;
    let color: string | undefined;
    if (tool === 'player') {
      const count = scene.elements.filter(el => el.type === 'player' && el.color === playerColor).length + 1;
      label = String(count);
      color = playerColor;
    } else if (tool === 'cone') {
      color = coneColor;
    }
    addElement({ id: uid(), type: tool, x, y, label, color });
  }

  function onCanvasPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return;
    const { x, y } = toSvgCoords(e);

    if (draftArrowRef.current) {
      setDraftArrow({ x: draftArrowRef.current.x, y: draftArrowRef.current.y, x2: x, y2: y });
      return;
    }
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current;
      const el = scene.elements.find(el => el.id === id);
      if (!el) return;
      const nx = x - dx, ny = y - dy;
      const shiftX = nx - el.x, shiftY = ny - el.y;
      const updated = scene.elements.map(item => item.id === id
        ? { ...item, x: nx, y: ny, x2: item.x2 !== undefined ? item.x2 + shiftX : undefined, y2: item.y2 !== undefined ? item.y2 + shiftY : undefined }
        : item
      );
      onChange?.({ ...scene, elements: updated });
    }
  }

  function onCanvasPointerUp() {
    if (readOnly) return;
    if (draftArrowRef.current && draftArrow) {
      const dist = Math.hypot(draftArrow.x2 - draftArrow.x, draftArrow.y2 - draftArrow.y);
      if (dist > 3) {
        addElement({
          id: uid(), type: tool as DrawingElementType,
          x: draftArrow.x, y: draftArrow.y, x2: draftArrow.x2, y2: draftArrow.y2,
        });
      }
      draftArrowRef.current = null;
      setDraftArrow(null);
      return;
    }
    if (dragRef.current) {
      // Live position was already pushed to the parent via onChange during the drag —
      // here we only need to record the pre-drag snapshot for undo (captured at pointerdown,
      // since `scene` in this closure is the already-moved position by the time pointerup fires).
      const before = dragStartSceneRef.current;
      if (before) {
        setHistory(h => [...h, before]);
        setFuture([]);
      }
      dragRef.current = null;
      dragStartSceneRef.current = null;
    }
  }

  function onElementPointerDown(e: React.PointerEvent, el: DrawingElement) {
    if (readOnly) return;
    e.stopPropagation();
    if (tool !== 'select') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);
    dragRef.current = { id: el.id, dx: x - el.x, dy: y - el.y };
    dragStartSceneRef.current = scene;
    setSelectedId(el.id);
  }

  return (
    <div className="dc-wrap">
      {!readOnly && (
        <div className="dc-toolbar">
          <button className={`dc-tool ${tool === 'select' ? 'active' : ''}`} title="Verplaatsen" onClick={() => setTool('select')}>↖</button>
          {POINT_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          {ARROW_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          <span className="dc-sep" />
          <button className="dc-tool" title="Verwijder geselecteerd" disabled={!selectedId} onClick={deleteSelected}>🗑️</button>
          <button className="dc-tool" title="Ongedaan maken" disabled={history.length === 0} onClick={undo}>↩</button>
          <button className="dc-tool" title="Opnieuw" disabled={future.length === 0} onClick={redo}>↪</button>
          <button className="dc-tool" title="Alles wissen" onClick={clearAll}>✕</button>
        </div>
      )}

      {!readOnly && tool === 'player' && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Kleur:</span>
          {PLAYER_COLORS.map(c => (
            <button key={c.value} className={`dc-swatch ${playerColor === c.value ? 'active' : ''}`}
              style={{ background: c.hex }} title={c.label} onClick={() => setPlayerColor(c.value)} />
          ))}
        </div>
      )}
      {!readOnly && tool === 'cone' && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Kleur:</span>
          {CONE_COLORS.map(c => (
            <button key={c.value} className={`dc-swatch ${coneColor === c.value ? 'active' : ''}`}
              style={{ background: c.hex }} title={c.label} onClick={() => setConeColor(c.value)} />
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="dc-bg-toolbar">
          {scene.backgroundImage && <span className="dc-bg-imported">Geïmporteerde tekening</span>}
          {(['grid', 'half', 'full'] as DrawingBackground[]).map(bg => (
            <button key={bg} className={`dc-bg-btn ${!scene.backgroundImage && scene.background === bg ? 'active' : ''}`} onClick={() => setBackground(bg)}>
              {bg === 'grid' ? 'Grid' : bg === 'half' ? 'Half veld' : 'Vol veld'}
            </button>
          ))}
        </div>
      )}

      <div className="dc-canvas-container">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          xmlns="http://www.w3.org/2000/svg"
          className="dc-svg"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        >
          <defs>
            <marker id="dc-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="white" />
            </marker>
          </defs>

          {scene.backgroundImage
            ? <image href={scene.backgroundImage} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
            : renderBackground(scene.background, W, H)}

          {scene.elements.map(el => renderElement(el, el.id === selectedId, e => onElementPointerDown(e, el), W, H))}

          {draftArrow && renderArrow({ id: 'draft', type: tool as DrawingElementType, x: draftArrow.x, y: draftArrow.y, x2: draftArrow.x2, y2: draftArrow.y2 }, false, W, H)}
        </svg>
      </div>
    </div>
  );
}

// ── Background renderers ──────────────────────────────────────────────────────

function renderBackground(bg: DrawingBackground, W: number, H: number) {
  const grass = <rect x="0" y="0" width={W} height={H} fill="#3a8a3a" rx="4" />;
  const stripes = [0,1,2,3,4,5,6].map(i => (
    <rect key={i} x={i*(W/7)} y="0" width={W/7} height={H} fill={i%2===0 ? "rgba(0,0,0,0.06)" : "transparent"} />
  ));
  const wl = 'rgba(255,255,255,0.7)';
  const sw = 2;

  if (bg === 'grid') {
    const lines = [];
    for (let i = 1; i < 4; i++) {
      lines.push(<line key={`h${i}`} x1="10" y1={(H/4)*i} x2={W-10} y2={(H/4)*i} stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4 4" />);
    }
    for (let i = 1; i < 3; i++) {
      lines.push(<line key={`v${i}`} x1={(W/3)*i} y1="10" x2={(W/3)*i} y2={H-10} stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4 4" />);
    }
    return <>{grass}{stripes}<rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} strokeDasharray="6 4" />{lines}</>;
  }

  if (bg === 'half') {
    return <>{grass}{stripes}
      <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
      <rect x={W/2-40} y="4" width="80" height="14" fill="none" stroke={wl} strokeWidth={sw} />
      <rect x={W/2-90} y="10" width="180" height="90" fill="none" stroke={wl} strokeWidth={1.5} />
      <rect x={W/2-50} y="10" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <circle cx={W/2} cy="70" r="3" fill="rgba(255,255,255,0.45)" />
      <path d={`M ${W/2-46} 100 A 52 52 0 0 0 ${W/2+46} 100`} fill="none" stroke={wl} strokeWidth={1.5} />
    </>;
  }

  // full
  return <>{grass}{stripes}
    <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
    <rect x={W/2-38} y="4" width="76" height="14" fill="none" stroke={wl} strokeWidth={sw} />
    <rect x={W/2-38} y={H-18} width="76" height="14" fill="none" stroke={wl} strokeWidth={sw} />
    <line x1="10" y1={H/2} x2={W-10} y2={H/2} stroke={wl} strokeWidth={1.5} />
    <circle cx={W/2} cy={H/2} r="46" fill="none" stroke={wl} strokeWidth={1.5} />
    <circle cx={W/2} cy={H/2} r="3" fill={wl} />
    <rect x={W/2-85} y="10" width="170" height="80" fill="none" stroke={wl} strokeWidth={1.5} />
    <rect x={W/2-85} y={H-90} width="170" height="80" fill="none" stroke={wl} strokeWidth={1.5} />
  </>;
}

// ── Element renderers ──────────────────────────────────────────────────────────

function renderElement(el: DrawingElement, selected: boolean, onPointerDown: (e: React.PointerEvent) => void, W: number, H: number) {
  const cx = (el.x / 100) * W;
  const cy = (el.y / 100) * H;

  if (el.type === 'arrow-pass' || el.type === 'arrow-dribble' || el.type === 'arrow-run') {
    return <g key={el.id} onPointerDown={onPointerDown}>{renderArrow(el, selected, W, H)}</g>;
  }

  const ring = selected ? <circle cx={cx} cy={cy} r="18" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="3 2" /> : null;

  if (el.type === 'player') {
    const fill = playerHex(el.color);
    const textFill = el.color === 'white' ? '#16161D' : 'white';
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <circle cx={cx} cy={cy} r="12" fill={fill} stroke="white" strokeWidth="1.5" />
        {el.label && <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontFamily="'Bebas Neue',sans-serif" fill={textFill}>{el.label}</text>}
      </g>
    );
  }
  if (el.type === 'cone') {
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <path d={`M ${cx} ${cy-9} L ${cx+8} ${cy+7} L ${cx-8} ${cy+7} Z`} fill={coneHex(el.color)} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
      </g>
    );
  }
  if (el.type === 'joker') {
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <path d={`M ${cx} ${cy-10} L ${cx+9} ${cy} L ${cx} ${cy+10} L ${cx-9} ${cy} Z`} fill="#F5C518" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
      </g>
    );
  }
  if (el.type === 'goal') {
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <rect x={cx-14} y={cy-6} width="28" height="12" fill="none" stroke="white" strokeWidth="2" />
      </g>
    );
  }
  if (el.type === 'ball') {
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <circle cx={cx} cy={cy} r="6" fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      </g>
    );
  }
  if (el.type === 'ladder') {
    const rungs = [-10, -5, 0, 5, 10];
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <line x1={cx-7} y1={cy-12} x2={cx-7} y2={cy+12} stroke="#F5C518" strokeWidth="2" />
        <line x1={cx+7} y1={cy-12} x2={cx+7} y2={cy+12} stroke="#F5C518" strokeWidth="2" />
        {rungs.map(r => <line key={r} x1={cx-7} y1={cy+r} x2={cx+7} y2={cy+r} stroke="#F5C518" strokeWidth="1.5" />)}
      </g>
    );
  }
  if (el.type === 'flag') {
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        {ring}
        <line x1={cx} y1={cy-12} x2={cx} y2={cy+12} stroke="white" strokeWidth="1.5" />
        <path d={`M ${cx} ${cy-12} L ${cx+12} ${cy-8} L ${cx} ${cy-4} Z`} fill="var(--red, #CC1A1A)" />
      </g>
    );
  }
  // text
  return (
    <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
      {ring}
      <text x={cx} y={cy} textAnchor="middle" fontSize="13" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700}
        fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="3" paintOrder="stroke">
        {el.label}
      </text>
    </g>
  );
}

function renderArrow(el: { id: string; type: DrawingElementType; x: number; y: number; x2?: number; y2?: number }, selected: boolean, W: number, H: number) {
  const x1 = (el.x / 100) * W, y1 = (el.y / 100) * H;
  const x2 = ((el.x2 ?? el.x) / 100) * W, y2 = ((el.y2 ?? el.y) / 100) * H;
  const dash = el.type === 'arrow-dribble' ? '6 5' : el.type === 'arrow-run' ? '2 3' : undefined;
  return (
    <g key={el.id}>
      {selected && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="6" strokeOpacity="0.25" />}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="2.5"
        strokeDasharray={dash} markerEnd="url(#dc-arrowhead)" />
    </g>
  );
}
