// ── Slimme uitlijnhulplijnen voor de tekentool ───────────────────────────────────
// Pure functies (geen React/DOM) die bepalen waar een versleept of nieuw
// geplaatst object magnetisch "vastklikt", en welke hulplijnen daarbij getoond
// worden. Alle coördinaten in scene-% (0-100); de vangafstand wordt in
// schermpixels gerekend via W/H, zodat ze niet afhangt van het veldformaat.
//
// Twee soorten hulp:
//   • Uitlijnen — een rand of het midden van het object valt samen met een rand
//     of het midden van een ander object (of het veldmidden).
//   • Gelijke afstand — het object komt precies midden tussen twee buren, of op
//     dezelfde afstand als twee andere objecten in dezelfde rij/kolom.

export interface SnapShape {
  x: number; y: number;
  x2?: number; y2?: number;   // aanwezig bij lijnen/pijlen/zones (twee punten)
}

/** Verticale (axis 'x') of horizontale (axis 'y') hulplijn. */
export interface AlignGuide {
  axis: 'x' | 'y';
  at: number;                 // x (verticale lijn) of y (horizontale lijn)
  from: number; to: number;   // bereik op de andere as
  marks: { x: number; y: number }[];  // uitgelijnde punten (kruisjes)
}

/** Gelijke-afstand-hulp: gelijke segmenten op één rij (axis 'x') of kolom (axis 'y'). */
export interface SpacingGuide {
  axis: 'x' | 'y';
  at: number;                 // y van de rij (axis 'x') of x van de kolom (axis 'y')
  segments: [number, number][];
}

export interface SnapResult {
  dx: number; dy: number;     // toe te passen verschuiving (scene-%)
  align: AlignGuide[];
  spacing: SpacingGuide[];
}

export const NO_SNAP: SnapResult = { dx: 0, dy: 0, align: [], spacing: [] };

/** Punten waarop uitgelijnd wordt: midden, plus begin/eind of randen bij twee-punt-objecten. */
function axisPoints(s: SnapShape, axis: 'x' | 'y'): number[] {
  const a = axis === 'x' ? s.x : s.y;
  const b = axis === 'x' ? s.x2 : s.y2;
  if (b === undefined) return [a];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return Math.abs(hi - lo) < 1e-6 ? [lo] : [lo, (lo + hi) / 2, hi];
}

const center = (s: SnapShape, axis: 'x' | 'y') => {
  const pts = axisPoints(s, axis);
  return pts.length === 1 ? pts[0] : pts[1];
};
const shift = (s: SnapShape, dx: number, dy: number): SnapShape => ({
  x: s.x + dx, y: s.y + dy,
  x2: s.x2 !== undefined ? s.x2 + dx : undefined,
  y2: s.y2 !== undefined ? s.y2 + dy : undefined,
});

interface Options {
  W: number; H: number;
  snapPx?: number;            // vangafstand in schermpixels
  rowPx?: number;             // hoe dicht centra moeten liggen om als "zelfde rij" te tellen
  extraX?: number[];          // extra hulplijnen (bv. veldmidden, beginpunt van een pijl)
  extraY?: number[];
}

/**
 * Berekent de magnetische verschuiving voor `moving` t.o.v. `others`.
 * Eerst de y-as (zodat de rij voor gelijke afstanden op x vaststaat), dan x.
 */
export function computeSnap(moving: SnapShape, others: SnapShape[], opt: Options): SnapResult {
  const snapPx = opt.snapPx ?? 6;
  const rowPx = opt.rowPx ?? 10;
  const dy = snapAxis('y', moving, others, opt.extraY ?? [], opt.H, opt.W, snapPx, rowPx);
  const movedY = shift(moving, 0, dy.d);
  const dx = snapAxis('x', movedY, others, opt.extraX ?? [], opt.W, opt.H, snapPx, rowPx);
  const final = shift(moving, dx.d, dy.d);

  // Hulplijnen pas na beide verschuivingen opbouwen, zodat ze op de eindpositie kloppen.
  return {
    dx: dx.d, dy: dy.d,
    align: [
      ...alignGuides('x', final, others, opt.extraX ?? []),
      ...alignGuides('y', final, others, opt.extraY ?? []),
    ],
    spacing: [dx.spacing, dy.spacing].filter((g): g is SpacingGuide => g !== null),
  };
}

function snapAxis(
  axis: 'x' | 'y', moving: SnapShape, others: SnapShape[], extra: number[],
  size: number, crossSize: number, snapPx: number, rowPx: number,
): { d: number; spacing: SpacingGuide | null } {
  const cross: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
  const toPx = (v: number) => (v / 100) * size;
  let best = snapPx, d = 0, spacing: SpacingGuide | null = null, spacingPos = NaN;

  // 1. Uitlijnen op randen/middens van andere objecten en extra lijnen.
  const targets = [...extra, ...others.flatMap(o => axisPoints(o, axis))];
  for (const m of axisPoints(moving, axis)) {
    for (const t of targets) {
      const dist = Math.abs(toPx(t - m));
      if (dist < best - 1e-9) { best = dist; d = t - m; }
    }
  }

  // 2. Gelijke afstanden binnen dezelfde rij (voor x) of kolom (voor y), op middens.
  const mc = center(moving, axis), mcCross = center(moving, cross);
  const row = others
    .filter(o => Math.abs(((center(o, cross) - mcCross) / 100) * crossSize) < rowPx)
    .map(o => center(o, axis))
    .sort((a, b) => a - b);
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i], b = row[i + 1], gap = b - a;
    if (toPx(gap) < 4) continue;
    const options: { pos: number; segs: [number, number][] }[] = [
      { pos: (a + b) / 2, segs: [[a, (a + b) / 2], [(a + b) / 2, b]] },  // midden tussen a en b
      { pos: b + gap,     segs: [[a, b], [b, b + gap]] },                 // zelfde afstand rechts/onder
      { pos: a - gap,     segs: [[a - gap, a], [a, b]] },                 // zelfde afstand links/boven
    ];
    for (const o of options) {
      const dist = Math.abs(toPx(o.pos - mc));
      // Iets strenger dan uitlijnen, zodat een exacte uitlijning voorrang krijgt.
      if (dist < best - 0.5) {
        best = dist; d = o.pos - mc;
        spacing = { axis, at: mcCross, segments: o.segs };
        spacingPos = o.pos;
      }
    }
  }
  // Uitlijnen won → geen gelijke-afstand-hulp tonen.
  if (spacing && Math.abs(mc + d - spacingPos) > 1e-6) spacing = null;
  return { d, spacing };
}

function alignGuides(axis: 'x' | 'y', moving: SnapShape, others: SnapShape[], extra: number[]): AlignGuide[] {
  const cross: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
  const out: AlignGuide[] = [];
  const crossPts = (s: SnapShape) => axisPoints(s, cross);
  for (const m of new Set(axisPoints(moving, axis))) {
    const matched = others.filter(o => axisPoints(o, axis).some(v => Math.abs(v - m) < 1e-6));
    const onExtra = extra.some(v => Math.abs(v - m) < 1e-6);
    if (matched.length === 0 && !onExtra) continue;
    const all = [...crossPts(moving), ...matched.flatMap(crossPts)];
    const pt = (c: number) => axis === 'x' ? { x: m, y: c } : { x: c, y: m };
    out.push({
      axis, at: m,
      // Hulplijn van het veldmidden loopt over het hele veld; anders enkel tussen de objecten.
      from: onExtra && matched.length === 0 ? 0 : Math.min(...all),
      to:   onExtra && matched.length === 0 ? 100 : Math.max(...all),
      marks: [...crossPts(moving), ...matched.flatMap(crossPts)].map(pt),
    });
  }
  return out;
}
