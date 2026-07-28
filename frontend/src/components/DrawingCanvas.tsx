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
  { tool: 'player', icon: '●',    title: 'Speler' },
  { tool: 'cone',   icon: '▲',    title: 'Pion' },
  { tool: 'marker', icon: '◼',    title: 'Marker (plat schijfje)' },
  { tool: 'joker',  icon: '◆',    title: 'Joker' },
  { tool: 'coach',  icon: '🧑‍🏫', title: 'Trainer' },
  { tool: 'goal',   icon: '🥅',   title: 'Doeltje' },
  { tool: 'ball',   icon: '⚽',   title: 'Bal' },
  { tool: 'hoop',   icon: '◯',    title: 'Hoepel / poortje' },
  { tool: 'wall',   icon: '🧱',   title: 'Muur' },
  { tool: 'ladder', icon: '☰',    title: 'Ladder' },
  { tool: 'flag',   icon: '🚩',   title: 'Vlag' },
  { tool: 'text',   icon: 'T',    title: 'Tekst' },
];

const ARROW_TOOLS: { tool: DrawingElementType; icon: string; title: string }[] = [
  { tool: 'arrow-pass',    icon: '→', title: 'Pijl: pass' },
  { tool: 'arrow-dribble', icon: '⇝', title: 'Pijl: dribbel' },
  { tool: 'arrow-run',     icon: '⤍', title: 'Pijl: loop zonder bal' },
];

const MIN_SCALE = 0.4, MAX_SCALE = 3.5;

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
  const rotateDragRef = useRef<{ id: string } | null>(null);
  const resizeDragRef = useRef<{ id: string; startScale: number; startDist: number } | null>(null);
  const dragStartSceneRef = useRef<DrawingScene | null>(null);
  const draftArrowRef = useRef<{ x: number; y: number } | null>(null);
  const [draftArrow, setDraftArrow] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const clipboardRef = useRef<Omit<DrawingElement, 'id'> | null>(null);
  const pasteOffsetRef = useRef(0);
  const [hasClipboard, setHasClipboard] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  // ── Kopiëren / plakken ────────────────────────────────────────────────────
  function copySelected() {
    if (!selectedId) return;
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) return;
    const { id, ...rest } = el;
    clipboardRef.current = rest;
    pasteOffsetRef.current = 0;
    setHasClipboard(true);
  }

  function pasteClipboard() {
    const copied = clipboardRef.current;
    if (!copied) return;
    pasteOffsetRef.current += 1;
    const shift = 4 * pasteOffsetRef.current; // % van viewBox, cascadeert bij herhaald plakken
    const clamp = (v: number) => Math.min(97, Math.max(3, v));
    const newEl: DrawingElement = {
      ...copied,
      id: uid(),
      x: clamp(copied.x + shift),
      y: clamp(copied.y + shift),
      ...(copied.x2 !== undefined ? { x2: clamp(copied.x2 + shift) } : {}),
      ...(copied.y2 !== undefined ? { y2: clamp(copied.y2 + shift) } : {}),
    };
    addElement(newEl);
    setSelectedId(newEl.id);
    setTool('select'); // meteen klaar om de plakte kopie te verslepen
  }

  // Ctrl/Cmd+C en Ctrl/Cmd+V ondersteunen naast de toolbar-knoppen (desktop-gemak).
  useEffect(() => {
    if (readOnly) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copySelected(); }
      else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); pasteClipboard(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // ── Afbeelding invoegen (bestand of systeem-klembord) ──────────────────────
  async function insertImageFile(file: File) {
    if (readOnly || !file.type.startsWith('image/')) return;
    const MAX_DIM = 1000, DISPLAY_LONG_SIDE = 110;
    const dataUri: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Kon afbeelding niet laden'));
      im.src = dataUri;
    });
    // Grote foto's downschalen/hercomprimeren vóór opslag als data-URI, zoals ook
    // gebeurt bij PDF-import — anders groeit drawingData onnodig groot.
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    let src = dataUri;
    if (longest > MAX_DIM) {
      const factor = MAX_DIM / longest;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * factor);
      canvas.height = Math.round(img.naturalHeight * factor);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        src = canvas.toDataURL('image/jpeg', 0.85);
      }
    }
    const displayFactor = DISPLAY_LONG_SIDE / longest;
    const id = uid();
    addElement({ id, type: 'image', x: 50, y: 50, src, width: img.naturalWidth * displayFactor, height: img.naturalHeight * displayFactor });
    setSelectedId(id);
    setTool('select');
  }

  function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) insertImageFile(file).catch(() => alert('Kon deze afbeelding niet invoegen.'));
  }

  // Toestaan om een afbeelding vanuit het systeemklembord te plakken (bv. een
  // screenshot) — los van de interne Ctrl+V hierboven, die alleen gekopieerde
  // tekentool-objecten plakt.
  useEffect(() => {
    if (readOnly) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            insertImageFile(file).catch(() => alert('Kon deze afbeelding niet plakken.'));
          }
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  function setBackground(bg: DrawingBackground) {
    // Een preset kiezen vervangt de geïmporteerde veldtekening (indien aanwezig)
    // door het vector-veld — bewuste, onomkeerbare keuze zoals "opnieuw beginnen".
    if (scene.backgroundImage && !confirm('De geïmporteerde tekening vervangen door het vector-veld? De PDF-afbeelding gaat verloren, je geplaatste objecten blijven behouden.')) return;
    commit({ ...scene, background: bg, backgroundImage: undefined });
  }

  function removeImportedBackground() {
    if (!scene.backgroundImage) return;
    if (!confirm('Geïmporteerde tekening verwijderen en vervangen door de tekentool? Dit kan niet ongedaan gemaakt worden — de PDF-afbeelding gaat verloren, je geplaatste objecten blijven behouden.')) return;
    commit({ ...scene, backgroundImage: undefined });
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
      const input = prompt('Spelernummer:', String(count));
      if (input === null) return; // geannuleerd — geen speler plaatsen
      label = input.trim() || undefined;
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
    if (rotateDragRef.current) {
      const { id } = rotateDragRef.current;
      const el = scene.elements.find(el => el.id === id);
      if (!el) return;
      // Hoek in pixel-ruimte berekenen (i.p.v. de 0-100 percentage-ruimte) zodat
      // de rotatie visueel klopt, ook als het veld niet vierkant is (W !== H).
      const px = (x / 100) * W, py = (y / 100) * H;
      const ecx = (el.x / 100) * W, ecy = (el.y / 100) * H;
      let deg = Math.atan2(py - ecy, px - ecx) * 180 / Math.PI + 90;
      deg = ((deg % 360) + 360) % 360;
      // Magnetisch vastklikken rond elke 15°, zodat rechte hoeken makkelijk te raken zijn.
      const snapped = Math.round(deg / 15) * 15 % 360;
      const diff = Math.min(Math.abs(deg - snapped), 360 - Math.abs(deg - snapped));
      if (diff < 4) deg = snapped;
      const updated = scene.elements.map(item => item.id === id ? { ...item, rotation: deg } : item);
      onChange?.({ ...scene, elements: updated });
      return;
    }
    if (resizeDragRef.current) {
      const { id, startScale, startDist } = resizeDragRef.current;
      const el = scene.elements.find(el => el.id === id);
      if (!el || startDist === 0) return;
      const px = (x / 100) * W, py = (y / 100) * H;
      const ecx = (el.x / 100) * W, ecy = (el.y / 100) * H;
      const dist = Math.hypot(px - ecx, py - ecy);
      let scale = startScale * (dist / startDist);
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      // Magnetisch vastklikken rond "hele" stappen van 0.25 voor makkelijk herhaalbare maten.
      const snapped = Math.round(scale / 0.25) * 0.25;
      if (Math.abs(scale - snapped) < 0.04) scale = snapped;
      const updated = scene.elements.map(item => item.id === id ? { ...item, scale } : item);
      onChange?.({ ...scene, elements: updated });
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
    if (rotateDragRef.current) {
      const before = dragStartSceneRef.current;
      if (before) {
        setHistory(h => [...h, before]);
        setFuture([]);
      }
      rotateDragRef.current = null;
      dragStartSceneRef.current = null;
      return;
    }
    if (resizeDragRef.current) {
      const before = dragStartSceneRef.current;
      if (before) {
        setHistory(h => [...h, before]);
        setFuture([]);
      }
      resizeDragRef.current = null;
      dragStartSceneRef.current = null;
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

  function onRotateHandlePointerDown(e: React.PointerEvent, el: DrawingElement) {
    if (readOnly || tool !== 'select') return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    rotateDragRef.current = { id: el.id };
    dragStartSceneRef.current = scene;
    setSelectedId(el.id);
  }

  function onResizeHandlePointerDown(e: React.PointerEvent, el: DrawingElement) {
    if (readOnly || tool !== 'select') return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);
    const px = (x / 100) * W, py = (y / 100) * H;
    const ecx = (el.x / 100) * W, ecy = (el.y / 100) * H;
    resizeDragRef.current = { id: el.id, startScale: el.scale ?? 1, startDist: Math.hypot(px - ecx, py - ecy) };
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
          <button className="dc-tool" title="Afbeelding invoegen (of plak met Ctrl+V)" onClick={() => imageInputRef.current?.click()}>🖼️</button>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePicked} />
          <span className="dc-sep" />
          <button className="dc-tool" title="Kopieer geselecteerd (Ctrl+C)" disabled={!selectedId} onClick={copySelected}>⧉</button>
          <button className="dc-tool" title="Plak (Ctrl+V)" disabled={!hasClipboard} onClick={pasteClipboard}>📋</button>
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
          {scene.backgroundImage && (
            <div className="dc-bg-imported-group">
              <span className="dc-bg-imported">Geïmporteerde tekening (PDF)</span>
              <button className="dc-bg-remove-btn" onClick={removeImportedBackground} title="Verwijder de geïmporteerde tekening en gebruik de tekentool">
                ✕ Verwijder &amp; gebruik tekentool
              </button>
            </div>
          )}
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

          {scene.elements.map(el => renderElement(
            el, el.id === selectedId, e => onElementPointerDown(e, el), W, H,
            tool === 'select', e => onRotateHandlePointerDown(e, el), e => onResizeHandlePointerDown(e, el),
          ))}

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

function renderElement(
  el: DrawingElement, selected: boolean, onPointerDown: (e: React.PointerEvent) => void, W: number, H: number,
  showHandles?: boolean, onRotateStart?: (e: React.PointerEvent) => void, onResizeStart?: (e: React.PointerEvent) => void,
) {
  const cx = (el.x / 100) * W;
  const cy = (el.y / 100) * H;

  if (el.type === 'arrow-pass' || el.type === 'arrow-dribble' || el.type === 'arrow-run') {
    return <g key={el.id} onPointerDown={onPointerDown}>{renderArrow(el, selected, W, H)}</g>;
  }

  const rotation = el.rotation ?? 0;
  const scale = el.scale ?? 1;
  // Schaal + rotatie rond hetzelfde middelpunt (cx,cy): eerst naar de oorsprong
  // verschuiven, schalen, dan terug — en dat geheel roteren om hetzelfde punt.
  const transform = (rotation || scale !== 1)
    ? `translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})`
    : undefined;
  // Iconen zijn ~cirkelvormig (vaste straal 18); een afbeelding heeft een eigen
  // rechthoekige omvang — de handle-afstand en de selectiering volgen die omvang.
  const isImage = el.type === 'image';
  const imgW = el.width ?? 80, imgH = el.height ?? 80;
  const handleBaseR = isImage ? Math.hypot(imgW, imgH) / 2 : 18;
  const ring = selected
    ? (isImage
        ? <rect x={cx - imgW / 2} y={cy - imgH / 2} width={imgW} height={imgH} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="3 2" transform={transform} />
        : <circle cx={cx} cy={cy} r={18 * scale} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="3 2" />)
    : null;
  const rotateHandle = (selected && showHandles && onRotateStart) ? renderRotateHandle(cx, cy, rotation, scale, handleBaseR, onRotateStart) : null;
  const resizeHandle = (selected && showHandles && onResizeStart) ? renderResizeHandle(cx, cy, rotation, scale, handleBaseR, onResizeStart) : null;

  return (
    <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
      {ring}
      <g transform={transform}>
        {renderShape(el, cx, cy)}
      </g>
      {rotateHandle}
      {resizeHandle}
    </g>
  );
}

function renderShape(el: DrawingElement, cx: number, cy: number) {
  if (el.type === 'player') {
    const fill = playerHex(el.color);
    const textFill = el.color === 'white' ? '#16161D' : 'white';
    return (
      <>
        <circle cx={cx} cy={cy} r="12" fill={fill} stroke="white" strokeWidth="1.5" />
        {el.label && <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontFamily="'Bebas Neue',sans-serif" fill={textFill}>{el.label}</text>}
      </>
    );
  }
  if (el.type === 'cone') {
    return <path d={`M ${cx} ${cy-9} L ${cx+8} ${cy+7} L ${cx-8} ${cy+7} Z`} fill={coneHex(el.color)} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />;
  }
  if (el.type === 'marker') {
    return <rect x={cx-6} y={cy-6} width="12" height="12" rx="2" fill="#F5C518" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />;
  }
  if (el.type === 'joker') {
    return <path d={`M ${cx} ${cy-10} L ${cx+9} ${cy} L ${cx} ${cy+10} L ${cx-9} ${cy} Z`} fill="#F5C518" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />;
  }
  if (el.type === 'coach') {
    return (
      <>
        <rect x={cx-10} y={cy-10} width="20" height="20" rx="4" fill="#16161D" stroke="white" strokeWidth="1.5" />
        <text x={cx} y={cy+4} textAnchor="middle" fontSize="10" fontFamily="'Bebas Neue',sans-serif" fill="white">T</text>
      </>
    );
  }
  if (el.type === 'goal') {
    return <rect x={cx-14} y={cy-6} width="28" height="12" fill="none" stroke="white" strokeWidth="2" />;
  }
  if (el.type === 'ball') {
    return <circle cx={cx} cy={cy} r="6" fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />;
  }
  if (el.type === 'hoop') {
    return <ellipse cx={cx} cy={cy} rx="13" ry="6" fill="none" stroke="#F5C518" strokeWidth="3" />;
  }
  if (el.type === 'wall') {
    return (
      <>
        {[-10, 0, 10].map(dx => (
          <rect key={dx} x={cx+dx-3} y={cy-11} width="6" height="22" rx="2" fill="#9333ea" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        ))}
      </>
    );
  }
  if (el.type === 'ladder') {
    const rungs = [-10, -5, 0, 5, 10];
    return (
      <>
        <line x1={cx-7} y1={cy-12} x2={cx-7} y2={cy+12} stroke="#F5C518" strokeWidth="2" />
        <line x1={cx+7} y1={cy-12} x2={cx+7} y2={cy+12} stroke="#F5C518" strokeWidth="2" />
        {rungs.map(r => <line key={r} x1={cx-7} y1={cy+r} x2={cx+7} y2={cy+r} stroke="#F5C518" strokeWidth="1.5" />)}
      </>
    );
  }
  if (el.type === 'flag') {
    return (
      <>
        <line x1={cx} y1={cy-12} x2={cx} y2={cy+12} stroke="white" strokeWidth="1.5" />
        <path d={`M ${cx} ${cy-12} L ${cx+12} ${cy-8} L ${cx} ${cy-4} Z`} fill="var(--red, #CC1A1A)" />
      </>
    );
  }
  if (el.type === 'image') {
    const w = el.width ?? 80, h = el.height ?? 80;
    return el.src ? <image href={el.src} x={cx - w / 2} y={cy - h / 2} width={w} height={h} preserveAspectRatio="xMidYMid meet" /> : null;
  }
  // text
  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize="13" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700}
      fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="3" paintOrder="stroke">
      {el.label}
    </text>
  );
}

function renderRotateHandle(cx: number, cy: number, rotation: number, scale: number, baseR: number, onPointerDown: (e: React.PointerEvent) => void) {
  const innerR = baseR * scale, outerR = innerR + 12;
  const rad = (rotation - 90) * Math.PI / 180;
  const hx = cx + outerR * Math.cos(rad), hy = cy + outerR * Math.sin(rad);
  const ix = cx + innerR * Math.cos(rad), iy = cy + innerR * Math.sin(rad);
  return (
    <g className="dc-rotate-handle">
      <line x1={ix} y1={iy} x2={hx} y2={hy} stroke="white" strokeWidth="1.5" strokeOpacity="0.8" />
      <circle cx={hx} cy={hy} r="6" fill="white" stroke="var(--red, #CC1A1A)" strokeWidth="1.5"
        style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={onPointerDown} />
    </g>
  );
}

function renderResizeHandle(cx: number, cy: number, rotation: number, scale: number, baseR: number, onPointerDown: (e: React.PointerEvent) => void) {
  // Tegenoverliggende hoek t.o.v. de rotatie-handle, zodat ze nooit overlappen.
  const innerR = baseR * scale, outerR = innerR + 12;
  const rad = (rotation + 90) * Math.PI / 180;
  const hx = cx + outerR * Math.cos(rad), hy = cy + outerR * Math.sin(rad);
  const ix = cx + innerR * Math.cos(rad), iy = cy + innerR * Math.sin(rad);
  return (
    <g className="dc-resize-handle">
      <line x1={ix} y1={iy} x2={hx} y2={hy} stroke="white" strokeWidth="1.5" strokeOpacity="0.8" />
      <rect x={hx - 5} y={hy - 5} width="10" height="10" fill="white" stroke="var(--red, #CC1A1A)" strokeWidth="1.5"
        style={{ cursor: 'nwse-resize', touchAction: 'none' }} onPointerDown={onPointerDown} />
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
