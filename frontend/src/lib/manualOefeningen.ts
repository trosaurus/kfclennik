// ── Suggesties uit de eigen, geüploade trainersmanual (ruwe PDF-tekst) ────────
// Zelfde idee als de matching-engine in oefeningenbibliotheek.ts (lokale
// trefwoord-overlap, geen API-call), maar dan op ongestructureerde tekst:
// er zijn geen vaste velden, dus we knippen de tekst in alinea's en laten de
// trainer zelf de gekozen alinea beoordelen/aanpassen in de oefeningseditor.

import { ExerciseFase } from './api';
import { SuggestionContext } from './oefeningenbibliotheek';

const FASE_HEADING = /^(opwarming|tussenvorm|wedstrijdvorm|cooling[\s-]?down)\b/i;

function detectFase(line: string): ExerciseFase | null {
  const m = line.match(FASE_HEADING);
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (w === 'opwarming') return 'opwarming';
  if (w === 'tussenvorm') return 'tussenvorm';
  if (w === 'wedstrijdvorm') return 'wedstrijdvorm';
  return 'cooling_down';
}

interface ManualBlock { fase: ExerciseFase | null; text: string }

/** Knipt de ruwe manual-tekst in alinea's, en tagt elke alinea met de laatst
 * gevonden fase-koptekst erboven (indien de manual zulke kopjes gebruikt —
 * best-effort, blijft null als de manual geen herkenbare structuur heeft). */
function splitIntoBlocks(manualText: string): ManualBlock[] {
  const lines = manualText.split(/\r?\n/);
  const blocks: ManualBlock[] = [];
  let currentFase: ExerciseFase | null = null;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 30) blocks.push({ fase: currentFase, text });
    buf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const fase = line.length <= 40 ? detectFase(line) : null;
    if (fase) { flush(); currentFase = fase; continue; }
    buf.push(line);
  }
  flush();
  return blocks;
}

export interface ManualSuggestion { text: string }

/** Lokale, deterministische match — geen API-call. Scoort alinea's uit de
 * geüploade manual op trefwoord-overlap met de huidige trainingscontext,
 * net als suggestExercises(), maar dan over vrije tekst i.p.v. de bibliotheek. */
export function extractManualSuggestions(
  manualText: string,
  fase: ExerciseFase,
  context: SuggestionContext,
  offset = 0,
  count = 3
): ManualSuggestion[] {
  if (!manualText.trim()) return [];

  const haystack = [context.hoofdmoment, context.spelfase, context.teamprincipe, context.spelprincipe, context.basisvaardigheid]
    .filter(Boolean).join(' ').toLowerCase();
  const keywords = Array.from(new Set(haystack.split(/\W+/).filter(w => w.length >= 4)));

  const candidates = splitIntoBlocks(manualText).filter(b => b.fase === null || b.fase === fase);
  const scored = candidates.map(b => {
    const lower = b.text.toLowerCase();
    const score = keywords.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0) + (b.fase === fase ? 0.5 : 0);
    return { b, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const ordered = scored.map(s => ({ text: s.b.text.length > 600 ? s.b.text.slice(0, 600) + '…' : s.b.text }));

  if (ordered.length === 0) return [];
  const start = offset % ordered.length;
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
  return rotated.slice(0, count);
}
