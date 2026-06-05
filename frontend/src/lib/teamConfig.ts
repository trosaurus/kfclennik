// ── Team format config per category ────────────────────────────────────────────

export type TeamFormat = '2v2' | '3v3' | '5v5' | '8v8' | '11v11';

export const CATEGORY_FORMAT: Record<string, TeamFormat> = {
  U6:  '2v2',
  U7:  '3v3',
  U8:  '5v5',
  U9:  '5v5',
  U10: '8v8',
  U11: '8v8',
  U12: '8v8',
  U13: '11v11',
  U15: '11v11',
  U17: '11v11',
};

export const FORMAT_LABEL: Record<TeamFormat, string> = {
  '2v2':   '2 tegen 2',
  '3v3':   '3 tegen 3',
  '5v5':   '5 tegen 5',
  '8v8':   '8 tegen 8',
  '11v11': '11 tegen 11',
};

export const FORMAT_PERIOD_DURATION: Record<TeamFormat, number> = {
  '2v2':   10 * 60,
  '3v3':   10 * 60,
  '5v5':   15 * 60,
  '8v8':   20 * 60,
  '11v11': 25 * 60,
};

export const FORMAT_PERIODS: Record<TeamFormat, number> = {
  '2v2': 4, '3v3': 4, '5v5': 4, '8v8': 4, '11v11': 4,
};

// ── Field positions per format ──────────────────────────────────────────────────
// x/y as percent of the 370×480 SVG viewBox
// y=100 = bottom (our goal), y=0 = top (opponent goal)
// Positions derived from the uploaded reference images.

export interface FieldPos {
  key: string;
  label: string;
  role: 'keeper' | 'defender' | 'midfielder' | 'forward';
  x: number;   // 0–100 %
  y: number;   // 0–100 %
}

const POSITIONS: Record<TeamFormat, FieldPos[]> = {

  // ── 2v2: keeper + 1 aanvaller ───────────────────────────────────────────────
  '2v2': [
    { key: 'K', label: 'K', role: 'keeper',  x: 50, y: 87 },
    { key: '9', label: '9', role: 'forward', x: 50, y: 20 },
  ],

  // ── 3v3: keeper + 1 verdediger + 1 aanvaller ────────────────────────────────
  '3v3': [
    { key: 'K', label: 'K', role: 'keeper',   x: 50, y: 87 },
    { key: '3', label: '3', role: 'defender', x: 50, y: 65 },
    { key: '9', label: '9', role: 'forward',  x: 50, y: 20 },
  ],

  // ── 5v5: based on image 2 ────────────────────────────────────────────────────
  '5v5': [
    { key: 'K',  label: 'K',  role: 'keeper',   x: 50,  y: 87 },
    { key: '3',  label: '3',  role: 'defender', x: 50,  y: 60 },
    { key: '11', label: '11', role: 'forward',  x: 8,   y: 40 },
    { key: '7',  label: '7',  role: 'forward',  x: 92,  y: 40 },
    { key: '9',  label: '9',  role: 'forward',  x: 50,  y: 22 },
  ],

  // ── 8v8: keeper + 3 def + 3 mid + 1 fwd ─────────────────────────────────────
  '8v8': [
    { key: 'K',  label: 'K',  role: 'keeper',    x: 50,  y: 88 },
    { key: '5',  label: '5',  role: 'defender',  x: 16,  y: 74 },
    { key: '3',  label: '3',  role: 'defender',  x: 50,  y: 72 },
    { key: '2',  label: '2',  role: 'defender',  x: 84,  y: 74 },
    { key: '6',  label: '6',  role: 'midfielder', x: 18,  y: 53 },
    { key: '8',  label: '8',  role: 'midfielder', x: 50,  y: 51 },
    { key: '10', label: '10', role: 'midfielder', x: 82,  y: 53 },
    { key: '9',  label: '9',  role: 'forward',   x: 50,  y: 25 },
  ],

  // ── 11v11: based on image 1 (4-3-3) ─────────────────────────────────────────
  '11v11': [
    { key: 'K',  label: 'K',  role: 'keeper',    x: 50,  y: 88 },
    { key: '5',  label: '5',  role: 'defender',  x: 16,  y: 76 },
    { key: '4',  label: '4',  role: 'defender',  x: 38,  y: 74 },
    { key: '3',  label: '3',  role: 'defender',  x: 62,  y: 74 },
    { key: '2',  label: '2',  role: 'defender',  x: 84,  y: 76 },
    { key: '6',  label: '6',  role: 'midfielder', x: 40,  y: 58 },
    { key: '8',  label: '8',  role: 'midfielder', x: 62,  y: 56 },
    { key: '10', label: '10', role: 'midfielder', x: 50,  y: 43 },
    { key: '11', label: '11', role: 'forward',   x: 22,  y: 22 },
    { key: '9',  label: '9',  role: 'forward',   x: 50,  y: 13 },
    { key: '7',  label: '7',  role: 'forward',   x: 78,  y: 22 },
  ],
};

export function getPositionsForFormat(format: TeamFormat): FieldPos[] {
  return POSITIONS[format];
}

export function getPositionsForCategory(category: string): FieldPos[] {
  const format = CATEGORY_FORMAT[category] ?? '11v11';
  return getPositionsForFormat(format);
}

export function getFormatForCategory(category: string): TeamFormat {
  return CATEGORY_FORMAT[category] ?? '11v11';
}

export function getPeriodDuration(category: string): number {
  const format = CATEGORY_FORMAT[category] ?? '11v11';
  return FORMAT_PERIOD_DURATION[format];
}
