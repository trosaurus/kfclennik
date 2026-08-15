import { useEffect, useRef, useState } from 'react';
import {
  DrawingScene, DrawingElement, DrawingElementType, DrawingBackground, AnimationFrame,
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

const LINE_TOOLS: { tool: DrawingElementType; icon: string; title: string }[] = [
  { tool: 'line',        icon: '—', title: 'Lijn' },
  { tool: 'line-dashed', icon: '┄', title: 'Stippellijn' },
];

const SHAPE_TOOLS: { tool: DrawingElementType; icon: string; title: string }[] = [
  { tool: 'rect',     icon: '▭', title: 'Rechthoek (zone)' },
  { tool: 'ellipse',  icon: '⬭', title: 'Ovaal / cirkel (zone)' },
  { tool: 'triangle', icon: '△', title: 'Driehoek (zone)' },
];

// Pijlen, lijnen en zone-vormen worden allemaal op dezelfde manier getekend:
// ingedrukt houden op het startpunt en slepen naar het eindpunt (x2/y2) —
// i.p.v. één klik zoals bij de punt-gebonden tools (speler, pion, ...).
const TWO_POINT_TYPES = new Set<DrawingElementType>([
  'arrow-pass', 'arrow-dribble', 'arrow-run', 'line', 'line-dashed', 'rect', 'ellipse', 'triangle',
]);

const MIN_SCALE = 0.4, MAX_SCALE = 3.5;

// Vastgelegde groottes per objecttype (i.p.v. enkel vrij verslepen aan de
// resize-handle) — elk type heeft zijn eigen reeks, afgestemd op hoe groot dat
// object normaal t.o.v. het veld getekend wordt. `scale` vermenigvuldigt de
// vaste basisafmeting van dat type (zie renderShape/renderElement). "S" is
// telkens de standaardgrootte (scale 1) — dus ook wat je krijgt als je geen
// grootte kiest — met "XS" een stap kleiner en "M"/"L" een stap groter.
type SizePreset = { label: string; scale: number };
const SIZE_PRESETS: Partial<Record<DrawingElementType, SizePreset[]>> = {
  player: [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  cone:   [{ label: 'XS', scale: 0.75 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.4 }, { label: 'L', scale: 1.8 }],
  marker: [{ label: 'XS', scale: 0.75 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  joker:  [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  coach:  [{ label: 'XS', scale: 0.85 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.25 }, { label: 'L', scale: 1.5 }],
  goal:   [{ label: 'XS', scale: 0.7 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.6 }, { label: 'L', scale: 2 }],
  ball:   [{ label: 'XS', scale: 0.75 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.5 }, { label: 'L', scale: 1.9 }],
  hoop:   [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.4 }, { label: 'L', scale: 1.8 }],
  wall:   [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  ladder: [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  flag:   [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.3 }, { label: 'L', scale: 1.6 }],
  text:   [{ label: 'XS', scale: 0.8 }, { label: 'S', scale: 1 }, { label: 'M', scale: 1.6 }, { label: 'L', scale: 2 }],
};

function uid(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Middelpunt (in scene-%) waarrond een element draait/schaalt: voor
 * punt-gebonden elementen gewoon (x,y), voor twee-punts-elementen (pijlen,
 * lijnen, zone-vormen) het midden tussen (x,y) en (x2,y2), zodat draaien en
 * vergroten/verkleinen symmetrisch rond het centrum van de vorm gebeurt. */
function centerOf(type: DrawingElementType, pos: { x: number; y: number; x2?: number; y2?: number }): { x: number; y: number } {
  if (TWO_POINT_TYPES.has(type)) {
    return { x: (pos.x + (pos.x2 ?? pos.x)) / 2, y: (pos.y + (pos.y2 ?? pos.y)) / 2 };
  }
  return { x: pos.x, y: pos.y };
}

function playerHex(color?: string): string {
  return PLAYER_COLORS.find(c => c.value === color)?.hex ?? PLAYER_COLORS[0].hex;
}
function coneHex(color?: string): string {
  return CONE_COLORS.find(c => c.value === color)?.hex ?? CONE_COLORS[0].hex;
}

export default function DrawingCanvas({ scene, onChange, readOnly }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Bij een geïmporteerde achtergrond (PDF) bepaalt de afbeelding zelf staand/liggend
  // (async, want we moeten de afbeelding laden om de verhouding te kennen). Zonder
  // achtergrond kiest de trainer dit zelf via de "Draai veld"-knop, bewaard in scene.orientation.
  const [autoLandscapeFromImage, setAutoLandscapeFromImage] = useState<boolean | null>(null);
  const isLandscape = scene.backgroundImage ? (autoLandscapeFromImage ?? false) : scene.orientation === 'landscape';
  const W = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const H = isLandscape ? LANDSCAPE_H : PORTRAIT_H;

  useEffect(() => {
    const src = scene.backgroundImage;
    if (!src) { setAutoLandscapeFromImage(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setAutoLandscapeFromImage(img.naturalWidth > img.naturalHeight); };
    img.src = src;
    return () => { cancelled = true; };
  }, [scene.backgroundImage]);

  const [tool, setTool] = useState<Tool>('select');
  const [playerColor, setPlayerColor] = useState<PlayerColor>('red');
  const [coneColor, setConeColor] = useState<ConeColor>('orange');
  // Gekozen grootte-preset per objecttype (voor nieuw geplaatste objecten van
  // dat type) — onthouden per type zodat bv. "L" voor pionnen niet ook "L" voor
  // spelers instelt wanneer je van tool wisselt.
  const [scaleByType, setScaleByType] = useState<Partial<Record<DrawingElementType, number>>>({});
  // Meerdere elementen selecteren (shift-klik) is enkel bedoeld om ze samen uit
  // te lijnen — verslepen, roteren, schalen, kopiëren en nummer wijzigen blijven
  // beperkt tot een enkelvoudige selectie (selectedId hieronder).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedPlayer = selectedId ? scene.elements.find(el => el.id === selectedId && el.type === 'player') ?? null : null;
  const selectedElement = selectedId ? scene.elements.find(el => el.id === selectedId) ?? null : null;
  const [history, setHistory] = useState<DrawingScene[]>([]);
  const [future, setFuture] = useState<DrawingScene[]>([]);
  // Uitlijnhulplijnen tijdens het verslepen (in scene-%): getoond zodra het
  // versleepte element op dezelfde x en/of y valt als een ander element (of het
  // veldmidden), zodat spelers makkelijk t.o.v. elkaar uitgelijnd kunnen worden.
  const [dragGuides, setDragGuides] = useState<{ x?: number; y?: number }>({});
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

  // ── Animatie (stappen tonen waar spelers/bal naartoe bewegen) ──────────────
  const frames = scene.animation?.frames ?? [];
  const [animMode, setAnimMode] = useState(false);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playPositions, setPlayPositions] = useState<Record<string, { x: number; y: number; x2?: number; y2?: number }> | null>(null);
  const stopRequestedRef = useRef(false);

  // Geeft de "zichtbare" positie van een element terug: tijdens het afspelen de
  // geïnterpoleerde positie, tijdens het bewerken van een animatiestap de positie
  // die voor díe stap is opgeslagen, anders gewoon de basisplaatsing van het element.
  function effectivePosition(el: DrawingElement): { x: number; y: number; x2?: number; y2?: number } {
    if (playing && playPositions?.[el.id]) {
      const p = playPositions[el.id];
      return { x: p.x, y: p.y, x2: p.x2 ?? el.x2, y2: p.y2 ?? el.y2 };
    }
    if (animMode && !playing) {
      const p = frames[activeFrameIdx]?.positions[el.id];
      if (p) return { x: p.x, y: p.y, x2: p.x2, y2: p.y2 };
    }
    return { x: el.x, y: el.y, x2: el.x2, y2: el.y2 };
  }

  function snapshotCurrentPositions(): AnimationFrame['positions'] {
    const result: AnimationFrame['positions'] = {};
    for (const el of scene.elements) {
      const pos = effectivePosition(el);
      result[el.id] = { x: pos.x, y: pos.y, x2: pos.x2, y2: pos.y2 };
    }
    return result;
  }

  function startAnimating() {
    if (frames.length === 0) {
      const frame: AnimationFrame = { id: uid(), label: 'Start', positions: snapshotCurrentPositions() };
      commit({ ...scene, animation: { frames: [frame] } });
    }
    setAnimMode(true);
    setActiveFrameIdx(0);
  }

  function addFrame() {
    const newFrame: AnimationFrame = { id: uid(), label: `Stap ${frames.length + 1}`, positions: snapshotCurrentPositions() };
    const newFrames = [...frames, newFrame];
    commit({ ...scene, animation: { frames: newFrames } });
    setActiveFrameIdx(newFrames.length - 1);
  }

  function deleteFrame(idx: number) {
    if (frames.length <= 1) {
      if (!confirm('Animatie volledig verwijderen?')) return;
      commit({ ...scene, animation: undefined });
      setAnimMode(false);
      setActiveFrameIdx(0);
      return;
    }
    const newFrames = frames.filter((_, i) => i !== idx);
    commit({ ...scene, animation: { frames: newFrames } });
    setActiveFrameIdx(i => Math.max(0, Math.min(i, newFrames.length - 1)));
  }

  function stopAnimation() {
    stopRequestedRef.current = true;
  }

  async function playAnimation() {
    if (frames.length < 2 || playing) return;
    stopRequestedRef.current = false;
    setPlaying(true);
    const allIds = scene.elements.map(el => el.id);
    function fullPositions(frame: AnimationFrame): Record<string, { x: number; y: number; x2?: number; y2?: number }> {
      const result: Record<string, { x: number; y: number; x2?: number; y2?: number }> = {};
      for (const el of scene.elements) {
        result[el.id] = frame.positions[el.id] ?? { x: el.x, y: el.y, x2: el.x2, y2: el.y2 };
      }
      return result;
    }
    for (let i = 0; i < frames.length - 1 && !stopRequestedRef.current; i++) {
      const from = fullPositions(frames[i]);
      const to = fullPositions(frames[i + 1]);
      const duration = 900;
      const start = performance.now();
      await new Promise<void>(resolve => {
        function tick(now: number) {
          if (stopRequestedRef.current) { resolve(); return; }
          const t = Math.min(1, (now - start) / duration);
          const positions: Record<string, { x: number; y: number; x2?: number; y2?: number }> = {};
          for (const id of allIds) {
            const f = from[id], tt = to[id];
            positions[id] = {
              x: f.x + (tt.x - f.x) * t, y: f.y + (tt.y - f.y) * t,
              x2: f.x2 !== undefined && tt.x2 !== undefined ? f.x2 + (tt.x2 - f.x2) * t : tt.x2 ?? f.x2,
              y2: f.y2 !== undefined && tt.y2 !== undefined ? f.y2 + (tt.y2 - f.y2) * t : tt.y2 ?? f.y2,
            };
          }
          setPlayPositions(positions);
          if (t < 1) requestAnimationFrame(tick); else resolve();
        }
        requestAnimationFrame(tick);
      });
      if (stopRequestedRef.current) break;
      await new Promise(r => setTimeout(r, 450)); // even "hold" aan elke stap
    }
    stopRequestedRef.current = false;
    setPlaying(false);
    setPlayPositions(null);
  }

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
    if (selectedIds.length === 0) return;
    commit({ ...scene, elements: scene.elements.filter(el => !selectedIds.includes(el.id)) });
    setSelectedIds([]);
  }

  function clearAll() {
    if (scene.elements.length === 0) return;
    if (!confirm('Volledige tekening wissen?')) return;
    commit({ ...scene, elements: [] });
    setSelectedIds([]);
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
    setSelectedIds([newEl.id]);
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
    setSelectedIds([id]);
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

  function toggleOrientation() {
    // Elementposities zijn % van de viewBox (0-100), dus die blijven overal correct
    // staan bij het draaien — enkel W/H (en dus de vorm van het veld) verandert.
    commit({ ...scene, orientation: isLandscape ? 'portrait' : 'landscape' });
  }

  function removeImportedBackground() {
    if (!scene.backgroundImage) return;
    if (!confirm('Geïmporteerde tekening verwijderen en vervangen door de tekentool? Dit kan niet ongedaan gemaakt worden — de PDF-afbeelding gaat verloren, je geplaatste objecten blijven behouden.')) return;
    commit({ ...scene, backgroundImage: undefined });
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────
  function onCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly || playing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);

    if (tool === 'select') {
      setSelectedIds([]);
      return;
    }
    if (tool === 'text') {
      const label = prompt('Tekst:');
      if (label && label.trim()) addElement({ id: uid(), type: 'text', x, y, label: label.trim(), scale: scaleByType.text });
      return;
    }
    if (TWO_POINT_TYPES.has(tool as DrawingElementType)) {
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
    addElement({ id: uid(), type: tool, x, y, label, color, scale: scaleByType[tool] });
  }

  const SNAP_PX = 6; // vangafstand in schermpixels, onafhankelijk van veldformaat

  // Zoekt of (nx,ny) — in scene-% — dicht genoeg bij de x en/of y van een ander
  // element (of het veldmidden) ligt om op te vangen, zodat spelers vlot exact
  // naast/onder elkaar of gecentreerd op het veld gezet kunnen worden.
  function computeDragSnap(nx: number, ny: number, excludeId: string): { x: number; y: number; guideX?: number; guideY?: number } {
    const candX = [50], candY = [50]; // veldmidden als extra hulplijn
    for (const other of scene.elements) {
      if (other.id === excludeId) continue;
      const pos = effectivePosition(other);
      candX.push(pos.x);
      if (pos.x2 !== undefined) candX.push(pos.x2);
      candY.push(pos.y);
      if (pos.y2 !== undefined) candY.push(pos.y2);
    }
    let snappedX = nx, guideX: number | undefined, bestDx = SNAP_PX;
    for (const cx of candX) {
      const dPx = Math.abs((nx - cx) / 100) * W;
      if (dPx < bestDx) { bestDx = dPx; snappedX = cx; guideX = cx; }
    }
    let snappedY = ny, guideY: number | undefined, bestDy = SNAP_PX;
    for (const cy of candY) {
      const dPx = Math.abs((ny - cy) / 100) * H;
      if (dPx < bestDy) { bestDy = dPx; snappedY = cy; guideY = cy; }
    }
    return { x: snappedX, y: snappedY, guideX, guideY };
  }

  function onCanvasPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return;
    const { x, y } = toSvgCoords(e);

    if (!dragRef.current && (dragGuides.x !== undefined || dragGuides.y !== undefined)) setDragGuides({});

    if (draftArrowRef.current) {
      setDraftArrow({ x: draftArrowRef.current.x, y: draftArrowRef.current.y, x2: x, y2: y });
      return;
    }
    if (rotateDragRef.current) {
      const { id } = rotateDragRef.current;
      const el = scene.elements.find(el => el.id === id);
      if (!el) return;
      const centerPos = centerOf(el.type, effectivePosition(el));
      // Hoek in pixel-ruimte berekenen (i.p.v. de 0-100 percentage-ruimte) zodat
      // de rotatie visueel klopt, ook als het veld niet vierkant is (W !== H).
      const px = (x / 100) * W, py = (y / 100) * H;
      const ecx = (centerPos.x / 100) * W, ecy = (centerPos.y / 100) * H;
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
      const centerPos = centerOf(el.type, effectivePosition(el));
      const px = (x / 100) * W, py = (y / 100) * H;
      const ecx = (centerPos.x / 100) * W, ecy = (centerPos.y / 100) * H;
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
      const snap = computeDragSnap(x - dx, y - dy, id);
      const nx = snap.x, ny = snap.y;
      setDragGuides({ x: snap.guideX, y: snap.guideY });
      if (animMode) {
        // In animatiemodus verplaatst slepen enkel de positie binnen de actieve
        // stap — de basisplaatsing van het element blijft ongewijzigd.
        const curPos = effectivePosition(el);
        const shiftX = nx - curPos.x, shiftY = ny - curPos.y;
        const newPos = {
          x: nx, y: ny,
          x2: curPos.x2 !== undefined ? curPos.x2 + shiftX : undefined,
          y2: curPos.y2 !== undefined ? curPos.y2 + shiftY : undefined,
        };
        const newFrames = frames.map((f, i) => i === activeFrameIdx ? { ...f, positions: { ...f.positions, [id]: newPos } } : f);
        onChange?.({ ...scene, animation: { frames: newFrames } });
      } else {
        const shiftX = nx - el.x, shiftY = ny - el.y;
        const updated = scene.elements.map(item => item.id === id
          ? { ...item, x: nx, y: ny, x2: item.x2 !== undefined ? item.x2 + shiftX : undefined, y2: item.y2 !== undefined ? item.y2 + shiftY : undefined }
          : item
        );
        onChange?.({ ...scene, elements: updated });
      }
    }
  }

  function onCanvasPointerUp() {
    if (readOnly) return;
    setDragGuides({});
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
    if (readOnly || playing) return;
    e.stopPropagation();
    if (tool !== 'select') return;
    // Shift-klik voegt toe/verwijdert uit de selectie, om later samen uit te
    // lijnen — dit sleept niets, zo blijft een gewone klik het enige dat verplaatst.
    if (e.shiftKey) {
      setSelectedIds(ids => ids.includes(el.id) ? ids.filter(id => id !== el.id) : [...ids, el.id]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);
    dragRef.current = { id: el.id, dx: x - el.x, dy: y - el.y };
    dragStartSceneRef.current = scene;
    setSelectedIds([el.id]);
  }

  function onRotateHandlePointerDown(e: React.PointerEvent, el: DrawingElement) {
    if (readOnly || playing || tool !== 'select') return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    rotateDragRef.current = { id: el.id };
    dragStartSceneRef.current = scene;
    setSelectedIds([el.id]);
  }

  function onResizeHandlePointerDown(e: React.PointerEvent, el: DrawingElement) {
    if (readOnly || playing || tool !== 'select') return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = toSvgCoords(e);
    const center = centerOf(el.type, el);
    const px = (x / 100) * W, py = (y / 100) * H;
    const ecx = (center.x / 100) * W, ecy = (center.y / 100) * H;
    resizeDragRef.current = { id: el.id, startScale: el.scale ?? 1, startDist: Math.hypot(px - ecx, py - ecy) };
    dragStartSceneRef.current = scene;
    setSelectedIds([el.id]);
  }

  // ── Spelernummer wijzigen ────────────────────────────────────────────────
  function updatePlayerLabel(id: string, label: string) {
    const trimmed = label.trim() || undefined;
    const updated = scene.elements.map(item => item.id === id ? { ...item, label: trimmed } : item);
    commit({ ...scene, elements: updated });
  }

  // ── Grootte-preset toepassen op een al geplaatst element ────────────────
  function setElementScale(id: string, scale: number) {
    const updated = scene.elements.map(item => item.id === id ? { ...item, scale } : item);
    commit({ ...scene, elements: updated });
  }

  // ── Uitlijnen (2 of meer geselecteerde elementen) ───────────────────────
  function applyAlignedPositions(newPos: Map<string, { x: number; y: number }>) {
    if (animMode) {
      const newFrames = frames.map((f, i) => {
        if (i !== activeFrameIdx) return f;
        const positions = { ...f.positions };
        newPos.forEach((pos, id) => {
          const el = scene.elements.find(e => e.id === id);
          if (!el) return;
          const cur = effectivePosition(el);
          const shiftX = pos.x - cur.x, shiftY = pos.y - cur.y;
          positions[id] = { x: pos.x, y: pos.y, x2: cur.x2 !== undefined ? cur.x2 + shiftX : undefined, y2: cur.y2 !== undefined ? cur.y2 + shiftY : undefined };
        });
        return { ...f, positions };
      });
      commit({ ...scene, animation: { frames: newFrames } });
      return;
    }
    const updated = scene.elements.map(el => {
      const pos = newPos.get(el.id);
      if (!pos) return el;
      const shiftX = pos.x - el.x, shiftY = pos.y - el.y;
      return { ...el, x: pos.x, y: pos.y, x2: el.x2 !== undefined ? el.x2 + shiftX : undefined, y2: el.y2 !== undefined ? el.y2 + shiftY : undefined };
    });
    commit({ ...scene, elements: updated });
  }

  // Zet de geselecteerde elementen op één rij (horizontaal) of kolom (verticaal):
  // gelijke Y (resp. X), en gelijk verdeeld over hun huidige spreiding — handig om
  // bv. een verdedigingslinie of middenveld netjes op te stellen.
  function alignSelected(axis: 'horizontal' | 'vertical') {
    if (selectedIds.length < 2) return;
    const els = scene.elements.filter(el => selectedIds.includes(el.id));
    if (els.length < 2) return;
    const newPos = new Map<string, { x: number; y: number }>();
    if (axis === 'horizontal') {
      const avgY = els.reduce((s, el) => s + effectivePosition(el).y, 0) / els.length;
      const sorted = [...els].sort((a, b) => effectivePosition(a).x - effectivePosition(b).x);
      const xs = sorted.map(el => effectivePosition(el).x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const step = sorted.length > 1 ? (maxX - minX) / (sorted.length - 1) : 0;
      sorted.forEach((el, i) => newPos.set(el.id, { x: minX + step * i, y: avgY }));
    } else {
      const avgX = els.reduce((s, el) => s + effectivePosition(el).x, 0) / els.length;
      const sorted = [...els].sort((a, b) => effectivePosition(a).y - effectivePosition(b).y);
      const ys = sorted.map(el => effectivePosition(el).y);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const step = sorted.length > 1 ? (maxY - minY) / (sorted.length - 1) : 0;
      sorted.forEach((el, i) => newPos.set(el.id, { x: avgX, y: minY + step * i }));
    }
    applyAlignedPositions(newPos);
  }

  return (
    <div className="dc-wrap">
      {!readOnly && (
        <div className="dc-toolbar">
          <button className={`dc-tool ${tool === 'select' ? 'active' : ''}`} title="Verplaatsen (shift-klik om meerdere te selecteren en uit te lijnen)" onClick={() => setTool('select')}>↖</button>
          {POINT_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          {ARROW_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          <span className="dc-sep" />
          {LINE_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          {SHAPE_TOOLS.map(t => (
            <button key={t.tool} className={`dc-tool ${tool === t.tool ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.tool)}>{t.icon}</button>
          ))}
          <button className="dc-tool" title="Afbeelding invoegen (of plak met Ctrl+V)" onClick={() => imageInputRef.current?.click()}>🖼️</button>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePicked} />
          <span className="dc-sep" />
          <button className="dc-tool" title="Kopieer geselecteerd (Ctrl+C)" disabled={!selectedId} onClick={copySelected}>⧉</button>
          <button className="dc-tool" title="Plak (Ctrl+V)" disabled={!hasClipboard} onClick={pasteClipboard}>📋</button>
          <button className="dc-tool" title="Verwijder geselecteerd" disabled={selectedIds.length === 0} onClick={deleteSelected}>🗑️</button>
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
      {!readOnly && tool !== 'select' && SIZE_PRESETS[tool] && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Grootte:</span>
          {SIZE_PRESETS[tool]!.map(p => (
            <button key={p.label} className={`dc-bg-btn ${(scaleByType[tool] ?? 1) === p.scale ? 'active' : ''}`}
              onClick={() => setScaleByType(s => ({ ...s, [tool]: p.scale }))}>{p.label}</button>
          ))}
        </div>
      )}

      {!readOnly && tool === 'select' && selectedElement && SIZE_PRESETS[selectedElement.type] && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Grootte:</span>
          {SIZE_PRESETS[selectedElement.type]!.map(p => (
            <button key={p.label} className={`dc-bg-btn ${(selectedElement.scale ?? 1) === p.scale ? 'active' : ''}`}
              onClick={() => setElementScale(selectedElement.id, p.scale)}>{p.label}</button>
          ))}
        </div>
      )}

      {!readOnly && tool === 'select' && selectedPlayer && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Nummer:</span>
          <input
            key={selectedPlayer.id}
            className="dc-number-input"
            type="text"
            inputMode="numeric"
            maxLength={3}
            defaultValue={selectedPlayer.label ?? ''}
            autoFocus
            onBlur={e => updatePlayerLabel(selectedPlayer.id, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
      )}

      {!readOnly && tool === 'select' && selectedIds.length >= 2 && (
        <div className="dc-color-toolbar">
          <span className="dc-color-label">Uitlijnen:</span>
          <button className="dc-bg-btn" title="Zet de geselecteerde elementen op één rij" onClick={() => alignSelected('horizontal')}>— Rij</button>
          <button className="dc-bg-btn" title="Zet de geselecteerde elementen op één kolom" onClick={() => alignSelected('vertical')}>| Kolom</button>
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
          {(['grid', 'half', 'full', 'phases'] as DrawingBackground[]).map(bg => (
            <button key={bg} className={`dc-bg-btn ${!scene.backgroundImage && scene.background === bg ? 'active' : ''}`} onClick={() => setBackground(bg)}>
              {bg === 'grid' ? 'Grid' : bg === 'half' ? 'Half veld' : bg === 'full' ? 'Vol veld' : 'Fases'}
            </button>
          ))}
          {!scene.backgroundImage && (
            <button className="dc-bg-btn" onClick={toggleOrientation} title="Wissel het veld tussen staand en liggend formaat">
              ↺ {isLandscape ? 'Zet staand' : 'Zet liggend'}
            </button>
          )}
        </div>
      )}

      {/* Animatie: opbouwen (enkel bewerkbaar) en afspelen (ook in read-only preview) */}
      {!readOnly && (
        <div className="dc-anim-toolbar">
          {!animMode ? (
            <button className="btn btn-outline btn-sm" onClick={startAnimating}>
              🎬 {frames.length > 1 ? `Animatie bewerken (${frames.length} stappen)` : 'Animatie maken'}
            </button>
          ) : (
            <>
              <button className="dc-tool" title="Animatie sluiten" onClick={() => setAnimMode(false)}>✕</button>
              <div className="dc-anim-frames">
                {frames.map((f, i) => (
                  <button key={f.id} className={`dc-anim-frame ${i === activeFrameIdx ? 'active' : ''}`}
                    title={f.label} onClick={() => setActiveFrameIdx(i)}>
                    {i + 1}
                  </button>
                ))}
                <button className="dc-tool" title="Nieuwe stap toevoegen" onClick={addFrame}>+</button>
              </div>
              <button className="dc-tool" title="Deze stap verwijderen" onClick={() => deleteFrame(activeFrameIdx)}>🗑</button>
              <span className="dc-sep" />
              {!playing ? (
                <button className="btn btn-primary btn-sm" onClick={playAnimation} disabled={frames.length < 2}>▶ Afspelen</button>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={stopAnimation}>⏹ Stop</button>
              )}
            </>
          )}
        </div>
      )}
      {!readOnly && animMode && (
        <div className="dc-anim-hint">Sleep spelers/bal naar hun positie voor deze stap. Elke stap = een moment in de oefening.</div>
      )}
      {readOnly && frames.length >= 2 && (
        <div className="dc-anim-toolbar">
          {!playing ? (
            <button className="btn btn-primary btn-sm" onClick={playAnimation}>▶ Animatie afspelen</button>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={stopAnimation}>⏹ Stop</button>
          )}
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

          {scene.elements.map(el => {
            const pos = effectivePosition(el);
            const displayEl = (pos.x === el.x && pos.y === el.y && pos.x2 === el.x2 && pos.y2 === el.y2)
              ? el : { ...el, x: pos.x, y: pos.y, x2: pos.x2, y2: pos.y2 };
            return renderElement(
              displayEl, selectedIds.includes(el.id), e => onElementPointerDown(e, displayEl), W, H,
              tool === 'select' && !playing && selectedIds.length === 1, e => onRotateHandlePointerDown(e, displayEl), e => onResizeHandlePointerDown(e, displayEl),
            );
          })}

          {draftArrow && renderLineOrShape({ id: 'draft', type: tool as DrawingElementType, x: draftArrow.x, y: draftArrow.y, x2: draftArrow.x2, y2: draftArrow.y2 }, false, W, H)}

          {dragGuides.x !== undefined && (
            <line x1={(dragGuides.x / 100) * W} y1={0} x2={(dragGuides.x / 100) * W} y2={H}
              stroke="#00E5FF" strokeWidth="1" strokeDasharray="4 3" pointerEvents="none" />
          )}
          {dragGuides.y !== undefined && (
            <line x1={0} y1={(dragGuides.y / 100) * H} x2={W} y2={(dragGuides.y / 100) * H}
              stroke="#00E5FF" strokeWidth="1" strokeDasharray="4 3" pointerEvents="none" />
          )}
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

  const isLandscape = W > H;

  if (bg === 'phases') {
    return renderPhasesField(W, H, isLandscape);
  }

  if (bg === 'half') {
    // Liggend: doel/zestien/D-boog draaien 90° mee (doel links, uitlopend naar rechts)
    // i.p.v. het staande veld te vervormen door de boven/onder-indeling te behouden.
    return isLandscape ? (
      <>{grass}{stripes}
        <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
        <rect x="4" y={H/2-40} width="14" height="80" fill="none" stroke={wl} strokeWidth={sw} />
        <rect x="10" y={H/2-90} width="90" height="180" fill="none" stroke={wl} strokeWidth={1.5} />
        <rect x="10" y={H/2-50} width="40" height="100" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
        <circle cx="70" cy={H/2} r="3" fill="rgba(255,255,255,0.45)" />
        <path d={`M 100 ${H/2-46} A 52 52 0 0 1 100 ${H/2+46}`} fill="none" stroke={wl} strokeWidth={1.5} />
      </>
    ) : (
      <>{grass}{stripes}
        <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
        <rect x={W/2-40} y="4" width="80" height="14" fill="none" stroke={wl} strokeWidth={sw} />
        <rect x={W/2-90} y="10" width="180" height="90" fill="none" stroke={wl} strokeWidth={1.5} />
        <rect x={W/2-50} y="10" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
        <circle cx={W/2} cy="70" r="3" fill="rgba(255,255,255,0.45)" />
        <path d={`M ${W/2-46} 100 A 52 52 0 0 0 ${W/2+46} 100`} fill="none" stroke={wl} strokeWidth={1.5} />
      </>
    );
  }

  // full
  return isLandscape ? (
    <>{grass}{stripes}
      <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
      <rect x="4" y={H/2-38} width="14" height="76" fill="none" stroke={wl} strokeWidth={sw} />
      <rect x={W-18} y={H/2-38} width="14" height="76" fill="none" stroke={wl} strokeWidth={sw} />
      <line x1={W/2} y1="10" x2={W/2} y2={H-10} stroke={wl} strokeWidth={1.5} />
      <circle cx={W/2} cy={H/2} r="46" fill="none" stroke={wl} strokeWidth={1.5} />
      <circle cx={W/2} cy={H/2} r="3" fill={wl} />
      <rect x="10" y={H/2-85} width="80" height="170" fill="none" stroke={wl} strokeWidth={1.5} />
      <rect x={W-90} y={H/2-85} width="80" height="170" fill="none" stroke={wl} strokeWidth={1.5} />
    </>
  ) : (
    <>{grass}{stripes}
      <rect x="10" y="10" width={W-20} height={H-20} fill="none" stroke={wl} strokeWidth={sw} />
      <rect x={W/2-38} y="4" width="76" height="14" fill="none" stroke={wl} strokeWidth={sw} />
      <rect x={W/2-38} y={H-18} width="76" height="14" fill="none" stroke={wl} strokeWidth={sw} />
      <line x1="10" y1={H/2} x2={W-10} y2={H/2} stroke={wl} strokeWidth={1.5} />
      <circle cx={W/2} cy={H/2} r="46" fill="none" stroke={wl} strokeWidth={1.5} />
      <circle cx={W/2} cy={H/2} r="3" fill={wl} />
      <rect x={W/2-85} y="10" width="170" height="80" fill="none" stroke={wl} strokeWidth={1.5} />
      <rect x={W/2-85} y={H-90} width="170" height="80" fill="none" stroke={wl} strokeWidth={1.5} />
    </>
  );
}

// Veld opgedeeld in 3 horizontale "fases" (opbouw van eigen doel naar voor) met
// telkens 5 verticale kleurzones (buiten groen, middenbaan bruin) en langs de
// zijlijnen om de 25% een kegel (rood/blauw/geel/blauw/rood) als vaste
// oriëntatiepunten — puur een gekleurde ondergrond, geen plaatsbare objecten.
function renderPhasesField(W: number, H: number, isLandscape: boolean) {
  const PAD = 10;
  const green = '#3f8f3f', olive = '#9c9a52', brown = '#6b4a30', wl = 'rgba(255,255,255,0.7)';
  const RED = '#CC1A1A', BLUE = '#2563eb', YELLOW = '#F5C518';
  const zoneFracs = [0, 0.22, 0.40, 0.60, 0.78, 1]; // buiten/midden/binnen/midden/buiten

  function cone(cx: number, cy: number, hex: string, key: string) {
    return <path key={key} d={`M ${cx} ${cy-7} L ${cx+6} ${cy+5} L ${cx-6} ${cy+5} Z`} fill={hex} stroke="rgba(0,0,0,0.4)" strokeWidth="0.75" />;
  }
  // Doelen en boxen zijn open rechthoeken: de kant die tegen de achterlijn van
  // het veld ligt (openEdge) wordt niet apart getekend — de volledige, doorlopende
  // achterlijn van het veld doet al dienst als die kant, i.p.v. er een kort lijntje
  // bovenop te tekenen (wat een dubbele lijn zou geven).
  function openRect(x: number, y: number, w: number, h: number, openEdge: 'top' | 'bottom' | 'left' | 'right', color: string) {
    const lines: React.ReactNode[] = [];
    if (openEdge !== 'top') lines.push(<line key="t" x1={x} y1={y} x2={x+w} y2={y} stroke={color} strokeWidth="2" />);
    if (openEdge !== 'bottom') lines.push(<line key="b" x1={x} y1={y+h} x2={x+w} y2={y+h} stroke={color} strokeWidth="2" />);
    if (openEdge !== 'left') lines.push(<line key="l" x1={x} y1={y} x2={x} y2={y+h} stroke={color} strokeWidth="2" />);
    if (openEdge !== 'right') lines.push(<line key="r" x1={x+w} y1={y} x2={x+w} y2={y+h} stroke={color} strokeWidth="2" />);
    return <g>{lines}</g>;
  }
  function goal(x: number, y: number, w: number, h: number, openEdge: 'top' | 'bottom' | 'left' | 'right') {
    return openRect(x, y, w, h, openEdge, '#1a1a1a');
  }

  if (!isLandscape) {
    const x0 = PAD, x1 = W - PAD, y0 = PAD, y1 = H - PAD;
    const zw = x1 - x0;
    const zx = zoneFracs.map(f => x0 + zw * f);
    const yFase3 = y0 + (y1 - y0) * 0.34, yFase2 = y0 + (y1 - y0) * 0.62;
    const cx = W / 2;
    // Boxlijnen (en de blauwe kegels erop) precies op het midden van fase 3
    // (bovenste zone) resp. fase 1 (onderste zone), i.p.v. een vaste afstand.
    const boxTopY = (y0 + yFase3) / 2, boxBottomY = (yFase2 + y1) / 2;
    const yMid = y0 + (y1 - y0) * 0.5;
    return (
      <>
        <rect x="0" y="0" width={W} height={H} fill={green} rx="4" />
        <rect x={zx[1]} y={y0} width={zx[2]-zx[1]} height={y1-y0} fill={olive} />
        <rect x={zx[2]} y={y0} width={zx[3]-zx[2]} height={y1-y0} fill={brown} />
        <rect x={zx[3]} y={y0} width={zx[4]-zx[3]} height={y1-y0} fill={olive} />
        {openRect(zx[1], y0, zx[4]-zx[1], boxTopY-y0, 'top', 'white')}
        {openRect(zx[1], boxBottomY, zx[4]-zx[1], y1-boxBottomY, 'bottom', 'white')}
        <rect x={x0} y={y0} width={zw} height={y1-y0} fill="none" stroke={wl} strokeWidth="2" />
        <line x1={x0} y1={yMid} x2={x1} y2={yMid} stroke={wl} strokeWidth="2" />
        <circle cx={cx} cy={yMid} r="46" fill="none" stroke={wl} strokeWidth="1.5" />
        <line x1={x0} y1={yFase3} x2={x1} y2={yFase3} stroke={wl} strokeWidth="1.5" strokeDasharray="7 5" />
        <line x1={x0} y1={yFase2} x2={x1} y2={yFase2} stroke={wl} strokeWidth="1.5" strokeDasharray="7 5" />
        <text x={x0+4} y={yFase3-6} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 3</text>
        <text x={x0+4} y={yFase2-6} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 2</text>
        <text x={x0+4} y={y1-6} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 1</text>
        {cone(x0, y0, RED, 'red-tl')}{cone(x1, y0, RED, 'red-tr')}
        {cone(x0+8, boxTopY, BLUE, 'blue-tl')}{cone(x1-8, boxTopY, BLUE, 'blue-tr')}
        {cone(x0+8, yMid, YELLOW, 'yellow-l')}{cone(x1-8, yMid, YELLOW, 'yellow-r')}
        {cone(x0+8, boxBottomY, BLUE, 'blue-bl')}{cone(x1-8, boxBottomY, BLUE, 'blue-br')}
        {cone(x0, y1, RED, 'red-bl')}{cone(x1, y1, RED, 'red-br')}
        {goal(cx-20, y0, 40, 16, 'top')}
        {goal(cx-20, y1-16, 40, 16, 'bottom')}
      </>
    );
  }

  const x0 = PAD, x1 = W - PAD, y0 = PAD, y1 = H - PAD;
  const zh = y1 - y0;
  const zy = zoneFracs.map(f => y0 + zh * f);
  const xFase3 = x0 + (x1 - x0) * 0.34, xFase2 = x0 + (x1 - x0) * 0.62;
  const cy = H / 2;
  const boxLeftX = (x0 + xFase3) / 2, boxRightX = (xFase2 + x1) / 2;
  const xMid = x0 + (x1 - x0) * 0.5;
  return (
    <>
      <rect x="0" y="0" width={W} height={H} fill={green} rx="4" />
      <rect x={x0} y={zy[1]} width={x1-x0} height={zy[2]-zy[1]} fill={olive} />
      <rect x={x0} y={zy[2]} width={x1-x0} height={zy[3]-zy[2]} fill={brown} />
      <rect x={x0} y={zy[3]} width={x1-x0} height={zy[4]-zy[3]} fill={olive} />
      {openRect(x0, zy[1], boxLeftX-x0, zy[4]-zy[1], 'left', 'white')}
      {openRect(boxRightX, zy[1], x1-boxRightX, zy[4]-zy[1], 'right', 'white')}
      <rect x={x0} y={y0} width={x1-x0} height={zh} fill="none" stroke={wl} strokeWidth="2" />
      <line x1={xMid} y1={y0} x2={xMid} y2={y1} stroke={wl} strokeWidth="2" />
      <circle cx={xMid} cy={cy} r="46" fill="none" stroke={wl} strokeWidth="1.5" />
      <line x1={xFase3} y1={y0} x2={xFase3} y2={y1} stroke={wl} strokeWidth="1.5" strokeDasharray="7 5" />
      <line x1={xFase2} y1={y0} x2={xFase2} y2={y1} stroke={wl} strokeWidth="1.5" strokeDasharray="7 5" />
      <text x={xFase3+4} y={y0+12} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 3</text>
      <text x={xFase2+4} y={y0+12} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 2</text>
      <text x={x1-32} y={y0+12} fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} fill="rgba(255,255,255,0.9)">Fase 1</text>
      {cone(x0, y0, RED, 'red-tl')}{cone(x0, y1, RED, 'red-bl')}
      {cone(boxLeftX, y0+8, BLUE, 'blue-tl')}{cone(boxLeftX, y1-8, BLUE, 'blue-bl')}
      {cone(xMid, y0+8, YELLOW, 'yellow-t')}{cone(xMid, y1-8, YELLOW, 'yellow-b')}
      {cone(boxRightX, y0+8, BLUE, 'blue-tr')}{cone(boxRightX, y1-8, BLUE, 'blue-br')}
      {cone(x1, y0, RED, 'red-tr')}{cone(x1, y1, RED, 'red-br')}
      {goal(x0, cy-20, 16, 40, 'left')}
      {goal(x1-16, cy-20, 16, 40, 'right')}
    </>
  );
}

// ── Element renderers ──────────────────────────────────────────────────────────

function renderElement(
  el: DrawingElement, selected: boolean, onPointerDown: (e: React.PointerEvent) => void, W: number, H: number,
  showHandles?: boolean, onRotateStart?: (e: React.PointerEvent) => void, onResizeStart?: (e: React.PointerEvent) => void,
) {
  const center = centerOf(el.type, el);
  const cx = (center.x / 100) * W;
  const cy = (center.y / 100) * H;

  const rotation = el.rotation ?? 0;
  const scale = el.scale ?? 1;

  if (TWO_POINT_TYPES.has(el.type)) {
    // Draaien/vergroten-verkleinen gebeurt rond het midden van de twee punten
    // (cx,cy hierboven) — dezelfde transform-opbouw als voor punt-gebonden
    // elementen, enkel toegepast op de hele lijn/pijl/zone-vorm i.p.v. één icoon.
    const transform = (rotation || scale !== 1)
      ? `translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})`
      : undefined;
    // Handle-afstand volgt de halve diagonaal van de (ongetransformeerde) vorm,
    // met een minimum zodat ook een klein lijntje nog vlot te pakken is.
    const dxPix = (((el.x2 ?? el.x) - el.x) / 100) * W;
    const dyPix = (((el.y2 ?? el.y) - el.y) / 100) * H;
    const handleBaseR = Math.max(20, Math.hypot(dxPix, dyPix) / 2 + 10);
    const rotateHandle = (selected && showHandles && onRotateStart) ? renderRotateHandle(cx, cy, rotation, scale, handleBaseR, onRotateStart) : null;
    const resizeHandle = (selected && showHandles && onResizeStart) ? renderResizeHandle(cx, cy, rotation, scale, handleBaseR, onResizeStart) : null;
    return (
      <g key={el.id} onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
        <g transform={transform}>{renderLineOrShape(el, selected, W, H)}</g>
        {rotateHandle}
        {resizeHandle}
      </g>
    );
  }
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
    return renderBallShape(cx, cy);
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

// Herkenbaar voetbal-icoontje: witte bal met een klassiek zwart pentagon/hexagon-
// patroon (centrale pentagon + 5 naar buiten wijzende hexagon-"punten" die bijna
// tot de rand reiken) — zelfde stijl als het klassieke platte voetbal-icoon.
function renderBallShape(cx: number, cy: number) {
  const r = 6;
  const toXY = (angleDeg: number, radius: number) => {
    const a = angleDeg * Math.PI / 180;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  };
  const Rc = r * 0.34;    // centrale pentagon
  const Rout = r * 0.62;  // "schouders" van elke zwarte punt
  const Rtip = r * 0.97;  // reikt bijna tot de rand
  const centerAngles = [0, 1, 2, 3, 4].map(i => -90 + i * 72);
  const centerPts = centerAngles.map(a => toXY(a, Rc));
  const petals = [0, 1, 2, 3, 4].map(i => {
    const bis = centerAngles[i] + 36; // bissectrice van deze pentagon-rand, naar buiten
    const pts = [
      centerPts[i],
      toXY(bis - 23, Rout),
      toXY(bis - 11, Rtip),
      toXY(bis + 11, Rtip),
      toXY(bis + 23, Rout),
      centerPts[(i + 1) % 5],
    ];
    return pts.map(p => `${p.x},${p.y}`).join(' ');
  });
  const seam = '#eaeaea';
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#fefefe" stroke="#141414" strokeWidth={r * 0.16} />
      {petals.map((pts, i) => (
        <polygon key={i} points={pts} fill="#141414" stroke={seam} strokeWidth={r * 0.05} strokeLinejoin="round" />
      ))}
      <polygon points={centerPts.map(p => `${p.x},${p.y}`).join(' ')} fill="#141414" stroke={seam} strokeWidth={r * 0.05} strokeLinejoin="round" />
    </>
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

// Tekent alles wat via slepen van startpunt naar eindpunt ontstaat: de 3
// pijltypes, gewone/stippellijnen, en de zone-vormen (rechthoek/ovaal/driehoek,
// opgebouwd uit de omvattende box tussen (x,y) en (x2,y2)).
function renderLineOrShape(el: { id: string; type: DrawingElementType; x: number; y: number; x2?: number; y2?: number }, selected: boolean, W: number, H: number) {
  const x1 = (el.x / 100) * W, y1 = (el.y / 100) * H;
  const x2 = ((el.x2 ?? el.x) / 100) * W, y2 = ((el.y2 ?? el.y) / 100) * H;

  if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'triangle') {
    const bx = Math.min(x1, x2), by = Math.min(y1, y2);
    const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
    const fill = 'rgba(255,255,255,0.08)';
    let shape;
    if (el.type === 'rect') {
      shape = <rect x={bx} y={by} width={bw} height={bh} fill={fill} stroke="white" strokeWidth="2" />;
    } else if (el.type === 'ellipse') {
      shape = <ellipse cx={bx + bw / 2} cy={by + bh / 2} rx={bw / 2} ry={bh / 2} fill={fill} stroke="white" strokeWidth="2" />;
    } else {
      const pts = `${bx + bw / 2},${by} ${bx},${by + bh} ${bx + bw},${by + bh}`;
      shape = <polygon points={pts} fill={fill} stroke="white" strokeWidth="2" />;
    }
    return (
      <g key={el.id}>
        {selected && (
          <rect x={bx - 3} y={by - 3} width={bw + 6} height={bh + 6} fill="none"
            stroke="white" strokeWidth="1.5" strokeDasharray="3 2" />
        )}
        {shape}
      </g>
    );
  }

  const isArrow = el.type === 'arrow-pass' || el.type === 'arrow-dribble' || el.type === 'arrow-run';
  const dash = el.type === 'arrow-dribble' ? '6 5' : el.type === 'arrow-run' ? '2 3' : el.type === 'line-dashed' ? '8 5' : undefined;
  return (
    <g key={el.id}>
      {selected && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="6" strokeOpacity="0.25" />}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="2.5"
        strokeDasharray={dash} markerEnd={isArrow ? 'url(#dc-arrowhead)' : undefined} />
    </g>
  );
}
