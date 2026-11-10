// ── Wisselschema-instellingen per wedstrijd ──────────────────────────────────────
// Gedeeld door de planner (Wedstrijden → Wisselschema) en de schema-matchday
// (Wedstrijden → Match live), zodat beide exact hetzelfde schema tonen. Instellingen
// staan per wedstrijd in de database (zie usePlannerSettings) met localStorage als
// cache — het schema zelf is altijd opnieuw af te leiden uit selectie +
// instellingen + seed.

import type { Player } from './api';
import {
  planSpeeltijd, formationForCategory, periodMinutesForCategory, linieFromPosition,
  Formation, FIELD_LINIES, PlanPlayer, PlanResult, FixedBlock,
} from './speeltijd';

export const PRESETS: { key: string; label: string; formation: Formation }[] = [
  { key: '5v5',   label: '5v5 (1-2-1-1)',   formation: { gk: 1, def: 2, mid: 1, fwd: 1 } },
  { key: '8v8',   label: '8v8 (1-3-3-1)',   formation: { gk: 1, def: 3, mid: 3, fwd: 1 } },
  { key: '11v11', label: '11v11 (1-4-3-3)', formation: { gk: 1, def: 4, mid: 3, fwd: 3 } },
];

export const PRIORITY_WEIGHTS = [
  { value: 1.25, label: 'Licht (+25%)' },
  { value: 1.5,  label: 'Normaal (+50%)' },
  { value: 2,    label: 'Sterk (×2)' },
];

export interface PlannerSettings {
  preset: string;          // 'categorie' | PRESETS[].key | 'eigen'
  formation: Formation;
  periods: number;
  minutesPerPeriod: number;
  blocksPerPeriod: number;
  gkMode: 'period' | 'block';
  seed: number;
  absent: string[];        // player ids — niet beschikbaar vanaf het eerste niet-vastgezette blok
  priority: string[];      // player ids die het meeste moeten spelen (★)
  priorityWeight: number;  // 1.25 | 1.5 | 2
  central: string[];       // player ids in de centrale as (altijd op 3, 6 of 9)
  fixed: FixedBlock[];     // al gespeelde blokken, liggen vast
  overrides: Record<number, FixedBlock>; // blokindex → handmatig aangepast in Match live
}

export function defaultSettings(category: string | undefined): PlannerSettings {
  const cat = category ?? '';
  return {
    preset: category ? 'categorie' : '8v8',
    formation: category ? formationForCategory(cat) : PRESETS[1].formation,
    periods: 4,
    minutesPerPeriod: category ? periodMinutesForCategory(cat) : 15,
    blocksPerPeriod: 2,
    gkMode: 'period',
    seed: 0,
    absent: [],
    priority: [],
    priorityWeight: 1.5,
    central: [],
    fixed: [],
    overrides: {},
  };
}

const storageKey = (matchId: string) => `spt_state_${matchId}`;

/** JSON-tekst → instellingen; null bij lege of ongeldige inhoud. */
export function parsePlannerSettings(raw: string | null | undefined, category: string | undefined): PlannerSettings | null {
  if (!raw) return null;
  try {
    return { ...defaultSettings(category), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function loadPlannerSettings(matchId: string, category: string | undefined): PlannerSettings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(storageKey(matchId)); } catch { /* opslag niet beschikbaar */ }
  return parsePlannerSettings(raw, category) ?? defaultSettings(category);
}

export function savePlannerSettings(matchId: string, s: PlannerSettings): void {
  try { localStorage.setItem(storageKey(matchId), JSON.stringify(s)); } catch { /* opslag niet beschikbaar */ }
}

/** Selectie → planner-spelers (dubbele namen eruit, positie → linie). */
export function toPlanPlayers(players: (Player | null | undefined)[]): PlanPlayer[] {
  const seen = new Set<string>();
  return players
    // Een aanwezigheid kan naar een verwijderde speler wijzen (player = null).
    .filter((p): p is Player => !!p && typeof p.name === 'string')
    .filter(p => {
      const k = p.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(p => {
      const linie = linieFromPosition(p.position);
      const linie2 = linieFromPosition(p.position2);
      return { id: p.id, name: p.name, linie, linie2: linie2 !== linie ? linie2 : null };
    });
}

export function buildPlan(planPlayers: PlanPlayer[], s: PlannerSettings): PlanResult {
  const absent = new Set(s.absent);
  const priority = new Set(s.priority);
  const central = new Set(s.central);
  // Afwezigen die al in een vastgezet blok speelden blijven in het schema (met hun minuten).
  const playedInFixed = new Set(s.fixed.flatMap(f => [f.gk ?? '', ...FIELD_LINIES.flatMap(l => f.lines[l])]));
  return planSpeeltijd({
    players: planPlayers
      .filter(p => !absent.has(p.id) || playedInFixed.has(p.id))
      .map(p => ({ ...p, priority: priority.has(p.id), central: central.has(p.id) })),
    unavailable: s.absent,
    fixed: s.fixed,
    overrides: s.overrides,
    priorityWeight: s.priorityWeight,
    formation: s.formation,
    periods: s.periods,
    minutesPerPeriod: s.minutesPerPeriod,
    blocksPerPeriod: s.blocksPerPeriod,
    gkMode: s.gkMode,
    seed: s.seed,
  });
}
