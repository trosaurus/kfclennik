// Server-side port of frontend/src/components/DrawingCanvas.tsx's rendering
// logic (plain string templates instead of JSX/React) — used only to turn a
// saved DrawingScene into a flat PNG for the "Tekening oefening" spot in the
// PowerPoint export. Keep in sync with DrawingCanvas.tsx's renderers by hand;
// there is no shared package between frontend and backend in this repo.

export type DrawingElementType =
  | 'player' | 'cone' | 'joker' | 'goal' | 'ball' | 'ladder' | 'flag'
  | 'hoop' | 'wall' | 'marker' | 'coach' | 'image'
  | 'arrow-pass' | 'arrow-dribble' | 'arrow-run' | 'text';

export interface DrawingElement {
  id: string;
  type: DrawingElementType;
  x: number; y: number;
  x2?: number; y2?: number;
  label?: string;
  color?: string;
  rotation?: number;
  scale?: number;
  src?: string;
  width?: number;
  height?: number;
}

export type DrawingBackground = 'grid' | 'half' | 'full';

export interface DrawingScene {
  background: DrawingBackground;
  elements: DrawingElement[];
  backgroundImage?: string;
}

const PLAYER_HEX: Record<string, string> = {
  red: '#CC1A1A', blue: '#2563eb', white: '#f5f5f5', grey: '#6b7280',
};
const CONE_HEX: Record<string, string> = {
  orange: '#F5A623', red: '#CC1A1A', green: '#22c55e', blue: '#2563eb',
};

function playerHex(color?: string): string { return PLAYER_HEX[color ?? ''] ?? PLAYER_HEX.red; }
function coneHex(color?: string): string { return CONE_HEX[color ?? ''] ?? CONE_HEX.orange; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderBackground(bg: DrawingBackground, W: number, H: number): string {
  const grass = `<rect x="0" y="0" width="${W}" height="${H}" fill="#3a8a3a" rx="4"/>`;
  const stripes = [0, 1, 2, 3, 4, 5, 6]
    .map(i => `<rect x="${i * (W / 7)}" y="0" width="${W / 7}" height="${H}" fill="${i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'transparent'}"/>`)
    .join('');
  const wl = 'rgba(255,255,255,0.7)';
  const sw = 2;

  if (bg === 'grid') {
    let lines = '';
    for (let i = 1; i < 4; i++) lines += `<line x1="10" y1="${(H / 4) * i}" x2="${W - 10}" y2="${(H / 4) * i}" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="4 4"/>`;
    for (let i = 1; i < 3; i++) lines += `<line x1="${(W / 3) * i}" y1="10" x2="${(W / 3) * i}" y2="${H - 10}" stroke="rgba(255,255,255,0.25)" stroke-width="1" stroke-dasharray="4 4"/>`;
    return `${grass}${stripes}<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${wl}" stroke-width="${sw}" stroke-dasharray="6 4"/>${lines}`;
  }

  if (bg === 'half') {
    return `${grass}${stripes}
      <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${wl}" stroke-width="${sw}"/>
      <rect x="${W / 2 - 40}" y="4" width="80" height="14" fill="none" stroke="${wl}" stroke-width="${sw}"/>
      <rect x="${W / 2 - 90}" y="10" width="180" height="90" fill="none" stroke="${wl}" stroke-width="1.5"/>
      <rect x="${W / 2 - 50}" y="10" width="100" height="40" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
      <circle cx="${W / 2}" cy="70" r="3" fill="rgba(255,255,255,0.45)"/>
      <path d="M ${W / 2 - 46} 100 A 52 52 0 0 0 ${W / 2 + 46} 100" fill="none" stroke="${wl}" stroke-width="1.5"/>`;
  }

  return `${grass}${stripes}
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${wl}" stroke-width="${sw}"/>
    <rect x="${W / 2 - 38}" y="4" width="76" height="14" fill="none" stroke="${wl}" stroke-width="${sw}"/>
    <rect x="${W / 2 - 38}" y="${H - 18}" width="76" height="14" fill="none" stroke="${wl}" stroke-width="${sw}"/>
    <line x1="10" y1="${H / 2}" x2="${W - 10}" y2="${H / 2}" stroke="${wl}" stroke-width="1.5"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="46" fill="none" stroke="${wl}" stroke-width="1.5"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="3" fill="${wl}"/>
    <rect x="${W / 2 - 85}" y="10" width="170" height="80" fill="none" stroke="${wl}" stroke-width="1.5"/>
    <rect x="${W / 2 - 85}" y="${H - 90}" width="170" height="80" fill="none" stroke="${wl}" stroke-width="1.5"/>`;
}

function renderArrow(el: DrawingElement, W: number, H: number): string {
  const x1 = (el.x / 100) * W, y1 = (el.y / 100) * H;
  const x2 = ((el.x2 ?? el.x) / 100) * W, y2 = ((el.y2 ?? el.y) / 100) * H;
  const dash = el.type === 'arrow-dribble' ? '6 5' : el.type === 'arrow-run' ? '2 3' : undefined;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="2.5"
    ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#dc-arrowhead)"/>`;
}

function renderElement(el: DrawingElement, W: number, H: number): string {
  if (el.type === 'arrow-pass' || el.type === 'arrow-dribble' || el.type === 'arrow-run') {
    return renderArrow(el, W, H);
  }
  const cx = (el.x / 100) * W, cy = (el.y / 100) * H;
  const shape = renderShape(el, cx, cy);
  const rotation = el.rotation ?? 0;
  const scale = el.scale ?? 1;
  if (!rotation && scale === 1) return shape;
  return `<g transform="translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})">${shape}</g>`;
}

function renderShape(el: DrawingElement, cx: number, cy: number): string {
  switch (el.type) {
    case 'player': {
      const fill = playerHex(el.color);
      const textFill = el.color === 'white' ? '#16161D' : 'white';
      return `<circle cx="${cx}" cy="${cy}" r="12" fill="${fill}" stroke="white" stroke-width="1.5"/>` +
        (el.label ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="${textFill}">${esc(el.label)}</text>` : '');
    }
    case 'cone':
      return `<path d="M ${cx} ${cy - 9} L ${cx + 8} ${cy + 7} L ${cx - 8} ${cy + 7} Z" fill="${coneHex(el.color)}" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>`;
    case 'marker':
      return `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" rx="2" fill="#F5C518" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>`;
    case 'joker':
      return `<path d="M ${cx} ${cy - 10} L ${cx + 9} ${cy} L ${cx} ${cy + 10} L ${cx - 9} ${cy} Z" fill="#F5C518" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>`;
    case 'coach':
      return `<rect x="${cx - 10}" y="${cy - 10}" width="20" height="20" rx="4" fill="#16161D" stroke="white" stroke-width="1.5"/>` +
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" font-family="sans-serif" fill="white">T</text>`;
    case 'goal':
      return `<rect x="${cx - 14}" y="${cy - 6}" width="28" height="12" fill="none" stroke="white" stroke-width="2"/>`;
    case 'ball':
      return `<circle cx="${cx}" cy="${cy}" r="6" fill="white" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>`;
    case 'hoop':
      return `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="6" fill="none" stroke="#F5C518" stroke-width="3"/>`;
    case 'wall': {
      let out = '';
      for (const dx of [-10, 0, 10]) out += `<rect x="${cx + dx - 3}" y="${cy - 11}" width="6" height="22" rx="2" fill="#9333ea" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>`;
      return out;
    }
    case 'ladder': {
      let out = `<line x1="${cx - 7}" y1="${cy - 12}" x2="${cx - 7}" y2="${cy + 12}" stroke="#F5C518" stroke-width="2"/>` +
        `<line x1="${cx + 7}" y1="${cy - 12}" x2="${cx + 7}" y2="${cy + 12}" stroke="#F5C518" stroke-width="2"/>`;
      for (const r of [-10, -5, 0, 5, 10]) out += `<line x1="${cx - 7}" y1="${cy + r}" x2="${cx + 7}" y2="${cy + r}" stroke="#F5C518" stroke-width="1.5"/>`;
      return out;
    }
    case 'flag':
      return `<line x1="${cx}" y1="${cy - 12}" x2="${cx}" y2="${cy + 12}" stroke="white" stroke-width="1.5"/>` +
        `<path d="M ${cx} ${cy - 12} L ${cx + 12} ${cy - 8} L ${cx} ${cy - 4} Z" fill="#CC1A1A"/>`;
    case 'image': {
      const w = el.width ?? 80, h = el.height ?? 80;
      return el.src ? `<image href="${el.src}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : '';
    }
    default: // text
      return `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" font-family="sans-serif" font-weight="700"
        fill="white" stroke="rgba(0,0,0,0.6)" stroke-width="3" paint-order="stroke">${esc(el.label ?? '')}</text>`;
  }
}

export const DRAWING_PORTRAIT = { w: 350, h: 460 };
export const DRAWING_LANDSCAPE = { w: 460, h: 350 };

/** Bouwt de volledige SVG-markup voor een DrawingScene, klaar om te rasteren. */
export function buildDrawingSvg(scene: DrawingScene, landscape: boolean, pixelScale = 4): string {
  const { w: W, h: H } = landscape ? DRAWING_LANDSCAPE : DRAWING_PORTRAIT;
  const pxW = W * pixelScale, pxH = H * pixelScale;

  const background = scene.backgroundImage
    ? `<image href="${scene.backgroundImage}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
    : renderBackground(scene.background, W, H);

  const elements = scene.elements.map(el => renderElement(el, W, H)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${W} ${H}">
    <defs>
      <marker id="dc-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="white"/>
      </marker>
    </defs>
    ${background}
    ${elements}
  </svg>`;
}

export function parseDrawingScene(raw: string | null | undefined): DrawingScene {
  if (!raw) return { background: 'grid', elements: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.elements)) return parsed as DrawingScene;
  } catch { /* fall through */ }
  return { background: 'grid', elements: [] };
}
