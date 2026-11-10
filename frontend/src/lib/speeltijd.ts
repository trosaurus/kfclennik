// ── Speeltijdplanner ────────────────────────────────────────────────────────────
// Maakt vooraf een wisselschema waarin de speeltijd zo gelijk mogelijk verdeeld
// wordt. Pure functie zonder DOM/React, zodat het algoritme los testbaar is.
//
// Per blok (periode / blokken per periode):
//   1. doelman kiezen (begin periode, of elk blok in modus 'block')
//   2. veldspelers kiezen: minste (gewogen) speeltijd → langst op de bank → tie-break-hash
//   3. posities toewijzen: eigen linie zolang er plaats is, rest vult V → M → A.
//      Binnen een periode blijft wie op het veld blijft op zijn plek staan; enkel
//      de vrijgekomen plaatsen worden opnieuw ingevuld. Spelers van de centrale as
//      krijgen altijd een middelste plaats (3, 6 of 9) en gaan daarin voor.
//   4. bijwerken: veld → t += blokduur, sat = 0; bank → sat++
//
// Last-minute aanpassen: de eerste `fixed.length` blokken liggen vast (al
// gespeeld) en worden enkel nagespeeld om de speeltijd op te bouwen; spelers in
// `unavailable` doen pas vanaf het eerste vrije blok niet meer mee.
// Handmatig aanpassen: `overrides` legt losse blokken vast (versleept in Match
// live); de blokken errond worden gewoon berekend, dus wie door een aanpassing
// meer of minder speelde wordt in de latere blokken weer rechtgetrokken.
// Voorrang: spelers met `priority` krijgen gewicht `priorityWeight`; er wordt
// gekozen op t / gewicht, zodat hun speeltijd evenredig met dat gewicht groeit.

import { getPositionsForCategory, getPeriodDuration } from './teamConfig';

export type FieldLinie = 'def' | 'mid' | 'fwd';
export type Linie = 'gk' | FieldLinie;
export const FIELD_LINIES: FieldLinie[] = ['def', 'mid', 'fwd'];
export const ALL_LINIES: Linie[] = ['gk', ...FIELD_LINIES];

export const LINIE_SHORT: Record<Linie, string> = { gk: 'DM', def: 'V', mid: 'M', fwd: 'A' };
export const LINIE_FULL: Record<Linie, string> = {
  gk: 'Doelmannen', def: 'Verdedigers', mid: 'Middenvelders', fwd: 'Aanvallers',
};

/** Player.position (keeper/defender/…) → linie; null = geen vaste linie (vult vrije plaatsen). */
export function linieFromPosition(position: string | null | undefined): Linie | null {
  switch (position) {
    case 'keeper':     return 'gk';
    case 'defender':   return 'def';
    case 'midfielder': return 'mid';
    case 'forward':    return 'fwd';
    default:           return null;
  }
}

export type Formation = Record<Linie, number>;

/** Plaats van de as-positie in een linie (3, 6 of 9): de middelste; bij een even
 *  aantal de rechtse van de twee, zoals de 3 in een viermansverdediging. */
export function centerSlot(count: number): number {
  return Math.floor(count / 2);
}

/** Opstelling afgeleid uit de bestaande veldposities van de categorie (U6–U17). */
export function formationForCategory(category: string): Formation {
  const f: Formation = { gk: 0, def: 0, mid: 0, fwd: 0 };
  for (const p of getPositionsForCategory(category)) {
    const l = linieFromPosition(p.role);
    if (l) f[l]++;
  }
  return f;
}

export function periodMinutesForCategory(category: string): number {
  return getPeriodDuration(category) / 60;
}

export function formationLabel(f: Formation): string {
  return ALL_LINIES.map(l => f[l]).join('-');
}

export interface PlanPlayer {
  id: string;
  name: string;
  linie: Linie | null;
  linie2?: Linie | null;      // tweede positie — gebruikt als de hoofdpositie bezet is
  priority?: boolean;         // ★ moet het meeste spelen
  central?: boolean;          // ◆ speelt in de centrale as (3, 6 of 9)
}

/** Vastgezet (al gespeeld) blok — wordt ongewijzigd overgenomen. */
export interface FixedBlock {
  gk: string | null;
  lines: Record<FieldLinie, string[]>;
  bench: string[];
}

export interface PlanInput {
  players: PlanPlayer[];      // aanwezigen + afwezigen die in een vastgezet blok speelden
  unavailable?: string[];     // niet beschikbaar in de niet-vastgezette blokken
  fixed?: FixedBlock[];       // eerste N blokken liggen vast
  overrides?: Record<number, FixedBlock>; // blokindex → handmatige opstelling
  priorityWeight?: number;    // gewicht voor ★-spelers (1 = geen voorrang)
  formation: Formation;       // gk is 0 of 1
  periods: number;
  minutesPerPeriod: number;
  blocksPerPeriod: number;    // 1 = geen wissels binnen periode, 2 = wissel halverwege, …
  gkMode: 'period' | 'block'; // wanneer de doelman mag wisselen
  seed: number;               // tie-break; "Andere verdeling" verhoogt dit
}

export interface PlanBlock {
  period: number;             // 1-based
  block: number;              // 0-based binnen de periode
  startMin: number;
  endMin: number;
  gk: string | null;
  lines: Record<FieldLinie, string[]>;
  bench: string[];
  in: string[];               // t.o.v. vorig blok (leeg bij eerste blok)
  out: string[];
  fixed: boolean;
  edited: boolean;            // handmatig aangepast (override)
}

/** Per blok: gespeelde linie, null (bank) of 'absent' (niet beschikbaar). */
export type PlanCell = Linie | null | 'absent';

export interface PlanPlayerResult extends PlanPlayer {
  minutes: number;
  gkBlocks: number;
  cells: PlanCell[];
}

export interface PlanResult {
  blocks: PlanBlock[];
  players: PlanPlayerResult[];
  blockMinutes: number;
  matchMinutes: number;
  onField: number;
  idealMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  warnings: string[];
}

// FNV-1a op de naam, gemengd met de seed — deterministisch maar per seed anders.
function tieBreak(name: string, seed: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
}

const EPS = 1e-9;

export function planSpeeltijd(input: PlanInput): PlanResult {
  const { players, formation, periods, gkMode, seed } = input;
  const blocksPerPeriod = Math.max(1, Math.floor(input.blocksPerPeriod));
  const blockMinutes = input.minutesPerPeriod / blocksPerPeriod;
  const totalBlocks = periods * blocksPerPeriod;
  const matchMinutes = periods * input.minutesPerPeriod;
  const useGk = formation.gk > 0;
  const fieldSlots = FIELD_LINIES.reduce((s, l) => s + formation[l], 0);
  const totalSlots = fieldSlots + (useGk ? 1 : 0);

  const weight = Math.max(1, input.priorityWeight ?? 1);
  const unavailable = new Set(input.unavailable ?? []);
  const fixed = (input.fixed ?? []).slice(0, totalBlocks);
  const known = new Set(players.map(p => p.id));
  const isKnown = (id: string) => known.has(id);
  const available = players.filter(p => !unavailable.has(p.id));

  const state = new Map(players.map(p => [p.id, {
    t: 0, sat: 0, gkCount: 0, w: p.priority ? weight : 1, tb: tieBreak(p.name, seed), cells: [] as PlanCell[],
  }]));
  const st = (id: string) => state.get(id)!;
  const norm = (id: string) => st(id).t / st(id).w;
  const byTimeThen = (secondary: (a: string, b: string) => number) => (a: string, b: string) =>
    (norm(a) - norm(b)) || secondary(a, b) || (st(a).tb - st(b).tb);

  const warnings: string[] = [];
  // Doelmannen: eerst wie keeper als hoofdpositie heeft, anders wie het als tweede positie heeft.
  const mainKeepers = available.filter(p => p.linie === 'gk');
  const keepers = mainKeepers.length > 0 ? mainKeepers : available.filter(p => p.linie2 === 'gk');
  const hasFreeBlocks = fixed.length < totalBlocks;
  if (hasFreeBlocks && available.length < totalSlots) {
    warnings.push(`Te weinig spelers: ${available.length} beschikbaar voor ${totalSlots} plaatsen — iedereen speelt alles.`);
  }
  if (hasFreeBlocks && useGk && available.length > 0 && keepers.length === 0) {
    warnings.push('Geen doelman beschikbaar — de veldspeler met de minste speeltijd gaat in doel.');
  }

  // Een override die niet meer past (speler afwezig gezet, kleinere opstelling)
  // vervalt, zodat een blok nooit met een leeg plekje of een afwezige start.
  const usableOverride = (i: number): FixedBlock | null => {
    const o = input.overrides?.[i];
    if (!o) return null;
    const isAvailable = (id: string) => isKnown(id) && !unavailable.has(id);
    const field = FIELD_LINIES.flatMap(l => o.lines[l]);
    const fits = (!o.gk || (useGk && isAvailable(o.gk)))
      && field.every(isAvailable)
      && FIELD_LINIES.every(l => o.lines[l].length <= formation[l]);
    if (!fits) return null;
    const onField = new Set(o.gk ? [...field, o.gk] : field);
    return { gk: o.gk, lines: o.lines, bench: available.map(x => x.id).filter(id => !onField.has(id)) };
  };

  const axisShort: string[] = []; // blokken met meer as-spelers dan as-plaatsen
  const axisIds = new Set(players.filter(x => x.central).map(x => x.id));
  const axisLinies = FIELD_LINIES.filter(l => formation[l] > 0);

  const blocks: PlanBlock[] = [];
  let currentGk: string | null = null;
  let prevOnField = new Set<string>();
  const linieOf = new Map(players.map(x => [x.id, x.linie]));
  const linie2Of = new Map(players.map(x => [x.id, x.linie2 ?? null]));

  for (let p = 0; p < periods; p++) {
    for (let b = 0; b < blocksPerPeriod; b++) {
      const isFixed = blocks.length < fixed.length;
      const f = isFixed ? fixed[blocks.length] : usableOverride(blocks.length);
      let gk: string | null;
      let lines: PlanBlock['lines'];
      let bench: string[];

      if (f) {
        // Vastgezet of aangepast blok: overnemen zoals het is
        gk = useGk && f.gk && isKnown(f.gk) ? f.gk : null;
        lines = { def: f.lines.def.filter(isKnown), mid: f.lines.mid.filter(isKnown), fwd: f.lines.fwd.filter(isKnown) };
        bench = f.bench.filter(isKnown);
        currentGk = gk;
        if (gk) st(gk).gkCount++;
      } else {
        // 1. Doelman (ook midden in een periode opnieuw kiezen als de huidige wegvalt)
        const gkGone = !currentGk || unavailable.has(currentGk);
        if (useGk && available.length > 0 && (b === 0 || gkMode === 'block' || gkGone)) {
          const pool = (keepers.length > 0 ? keepers : available).map(x => x.id);
          pool.sort(byTimeThen((x, y) => st(x).gkCount - st(y).gkCount));
          currentGk = pool[0];
          st(currentGk).gkCount++;
        }
        gk = useGk && currentGk && !unavailable.has(currentGk) ? currentGk : null;

        // 2. Veldspelers
        const candidates = available.map(x => x.id).filter(id => id !== gk);
        candidates.sort(byTimeThen((x, y) => st(y).sat - st(x).sat));
        const chosen = candidates.slice(0, fieldSlots);
        bench = candidates.slice(fieldSlots);

        // 3. Posities. Later in een periode blijft wie op het veld blijft op dezelfde
        //    plaats staan (ook na een handmatige aanpassing) en vullen de invallers
        //    enkel de vrijgekomen plaatsen, plaats voor plaats.
        const staying = new Set(chosen);
        const before = b > 0 ? blocks[blocks.length - 1].lines : null;
        const slotsFor = (l: FieldLinie) => Array.from({ length: formation[l] }, (_, i) => {
          const id = before?.[l][i];
          return id && staying.has(id) ? id : null;
        });
        const slots = { def: slotsFor('def'), mid: slotsFor('mid'), fwd: slotsFor('fwd') };
        const placed = new Set(FIELD_LINIES.flatMap(l => slots[l]));
        const place = (l: FieldLinie, id: string) => { slots[l][slots[l].indexOf(null)] = id; };

        // Hoofdpositie → tweede positie → vrije plaats (V → M → A). Spelers zónder
        // tweede positie krijgen eerst hun hoofdpositie, zodat de flexibele spelers
        // uitwijken i.p.v. hen te verdringen.
        const fits = (l: Linie | null | undefined): l is FieldLinie =>
          !!l && l !== 'gk' && slots[l].includes(null);
        let newcomers = chosen.filter(id => !placed.has(id));

        // Centrale as eerst: eigen linie → tweede positie → de andere as-plaatsen.
        // Is alles bezet, dan schuift een gewone speler die daar stond door.
        const axisSlot = (l: FieldLinie) => centerSlot(formation[l]);
        const axisOrder = (id: string) => {
          const own = [linieOf.get(id), linie2Of.get(id)].filter((l): l is FieldLinie => axisLinies.includes(l as FieldLinie));
          return [...new Set([...own, ...axisLinies])];
        };
        const displaced: string[] = [];
        for (const id of newcomers.filter(x => axisIds.has(x))) {
          const order = axisOrder(id);
          const free = order.find(l => slots[l][axisSlot(l)] === null);
          const taken = order.find(l => !axisIds.has(slots[l][axisSlot(l)]!));
          const target = free ?? taken;
          if (!target) continue;
          const holder = slots[target][axisSlot(target)];
          if (holder) displaced.push(holder);
          slots[target][axisSlot(target)] = id;
        }
        const onAxis = new Set(FIELD_LINIES.flatMap(l => slots[l]));
        const axisLeft = newcomers.filter(id => axisIds.has(id) && !onAxis.has(id));
        if (axisLeft.length > 0) axisShort.push(blocksPerPeriod > 1 ? `P${p + 1}.${b + 1}` : `P${p + 1}`);
        newcomers = [...newcomers.filter(id => !onAxis.has(id)), ...displaced];

        const ordered = [...newcomers.filter(id => !linie2Of.get(id)), ...newcomers.filter(id => linie2Of.get(id))];
        const rest: string[] = [];
        for (const id of ordered) {
          const l = linieOf.get(id);
          if (fits(l)) place(l, id); else rest.push(id);
        }
        const leftover: string[] = [];
        for (const id of rest) {
          const l = linie2Of.get(id);
          if (fits(l)) place(l, id); else leftover.push(id);
        }
        for (const l of FIELD_LINIES) {
          while (slots[l].includes(null) && leftover.length > 0) place(l, leftover.shift()!);
        }
        const filled = (l: FieldLinie) => slots[l].filter((id): id is string => id !== null);
        lines = { def: filled('def'), mid: filled('mid'), fwd: filled('fwd') };
      }

      // 4. Bijwerken
      const onField = new Set<string>(FIELD_LINIES.flatMap(l => lines[l]));
      if (gk) onField.add(gk);
      const benchSet = new Set(bench);
      for (const x of players) {
        const s = st(x.id);
        if (onField.has(x.id)) {
          s.t += blockMinutes;
          s.sat = 0;
          s.cells.push(x.id === gk ? 'gk' : (FIELD_LINIES.find(l => lines[l].includes(x.id)) ?? null));
        } else {
          s.sat++;
          s.cells.push(benchSet.has(x.id) ? null : 'absent');
        }
      }

      const isFirst = blocks.length === 0;
      blocks.push({
        period: p + 1,
        block: b,
        startMin: p * input.minutesPerPeriod + b * blockMinutes,
        endMin: p * input.minutesPerPeriod + (b + 1) * blockMinutes,
        gk,
        lines,
        bench,
        in: isFirst ? [] : [...onField].filter(id => !prevOnField.has(id)),
        out: isFirst ? [] : [...prevOnField].filter(id => !onField.has(id)),
        fixed: isFixed,
        edited: !isFixed && f !== null,
      });
      prevOnField = onField;
    }
  }

  if (axisShort.length > 0) {
    warnings.push(`Centrale as: te veel as-spelers tegelijk op het veld voor de ${axisLinies.length} as-plaatsen in ${axisShort.join(', ')} — duid er minder aan of versleep ze in Match live.`);
  }

  const resultPlayers: PlanPlayerResult[] = players.map(x => {
    const s = st(x.id);
    return { ...x, minutes: s.t, gkBlocks: s.cells.filter(c => c === 'gk').length, cells: s.cells };
  });

  const mins = resultPlayers.map(x => x.minutes);
  const minMinutes = mins.length ? Math.min(...mins) : 0;
  const maxMinutes = mins.length ? Math.max(...mins) : 0;
  const onField = Math.min(totalSlots, players.length);

  // Spreiding enkel bij gewone veldspelers die de hele wedstrijd beschikbaar
  // waren: doelmannen en ★-spelers spelen bewust meer, laatkomers minder.
  const fieldMins = resultPlayers
    .filter(x => x.gkBlocks === 0 && !(x.priority && weight > 1) && !x.cells.includes('absent'))
    .map(x => x.minutes);
  if (fieldMins.length > 1 && totalBlocks > 0) {
    const spread = Math.max(...fieldMins) - Math.min(...fieldMins);
    if (spread > blockMinutes + EPS) {
      warnings.push(`Spreiding bij veldspelers is ${fmtMin(spread)} (meer dan één blok van ${fmtMin(blockMinutes)}) — overweeg meer wissels per periode.`);
    }
  }

  return {
    blocks,
    players: resultPlayers,
    blockMinutes,
    matchMinutes,
    onField,
    idealMinutes: players.length ? (matchMinutes * onField) / players.length : 0,
    minMinutes,
    maxMinutes,
    warnings,
  };
}

/** Op welke linie staat deze speler in dit blok? null = bank of afwezig. */
export function blockLinie(b: Pick<FixedBlock, 'gk' | 'lines'>, id: string): Linie | null {
  if (b.gk === id) return 'gk';
  return FIELD_LINIES.find(l => b.lines[l].includes(id)) ?? null;
}

/** Twee spelers van plaats wisselen binnen een blok (veld ↔ veld of veld ↔ bank). */
export function swapInBlock(b: FixedBlock, a: string, c: string): FixedBlock {
  const sw = (id: string) => id === a ? c : id === c ? a : id;
  return {
    gk: b.gk && sw(b.gk),
    lines: { def: b.lines.def.map(sw), mid: b.lines.mid.map(sw), fwd: b.lines.fwd.map(sw) },
    bench: b.bench.map(sw),
  };
}

export interface BlockSwap { out: string | null; in: string | null; linie: Linie | null }
export interface BlockMove { id: string; from: Linie; to: Linie }

/** Wat verandert er van `cur` naar `next`: wie vervangt wie, en wie schuift door. */
export function blockChanges(cur: PlanBlock, next: PlanBlock): { swaps: BlockSwap[]; moved: BlockMove[] } {
  const swaps: BlockSwap[] = [];
  const insLeft = [...next.in];
  let outsLeft = [...next.out];
  const slotOf = (b: PlanBlock, id: string, l: Linie | null) =>
    l === 'gk' ? 0 : l ? b.lines[l].indexOf(id) : -1;
  const pair = (matches: (out: string, inn: string, linie: Linie | null) => boolean) => {
    outsLeft = outsLeft.filter(out => {
      const linie = blockLinie(cur, out);
      const i = insLeft.findIndex(id => matches(out, id, linie));
      if (i < 0) return true;
      swaps.push({ out, in: insLeft.splice(i, 1)[0], linie });
      return false;
    });
  };
  // Eerst wie exact de plaats overneemt, dan wie op dezelfde linie invalt.
  pair((out, inn, l) => blockLinie(next, inn) === l && slotOf(next, inn, l) === slotOf(cur, out, l));
  pair((_out, inn, l) => blockLinie(next, inn) === l);
  for (let i = 0; i < Math.max(outsLeft.length, insLeft.length); i++) {
    const out = outsLeft[i] ?? null;
    const inn = insLeft[i] ?? null;
    swaps.push({ out, in: inn, linie: inn ? blockLinie(next, inn) : out ? blockLinie(cur, out) : null });
  }
  swaps.sort((a, b) => (a.linie ? ALL_LINIES.indexOf(a.linie) : 9) - (b.linie ? ALL_LINIES.indexOf(b.linie) : 9));

  const moved: BlockMove[] = [];
  for (const id of [...(cur.gk ? [cur.gk] : []), ...FIELD_LINIES.flatMap(l => cur.lines[l])]) {
    const from = blockLinie(cur, id);
    const to = blockLinie(next, id);
    if (from && to && from !== to) moved.push({ id, from, to });
  }
  return { swaps, moved };
}

/** 7.5 → "7,5′", 15 → "15′" */
export function fmtMin(m: number): string {
  const r = Math.round(m * 10) / 10;
  return `${String(r).replace('.', ',')}′`;
}

/** Platte tekst per blok + speeltijd per speler, om te plakken in WhatsApp. */
export function planToText(plan: PlanResult, title?: string): string {
  const name = new Map(plan.players.map(p => [p.id, p.name]));
  const names = (ids: string[]) => ids.map(id => name.get(id) ?? '?').join(', ') || '—';
  const multiBlock = plan.blocks.some(b => b.block > 0);
  const out: string[] = [];
  if (title) out.push(`*${title}*`, '');
  for (const b of plan.blocks) {
    const label = multiBlock ? `Periode ${b.period}.${b.block + 1}` : `Periode ${b.period}`;
    out.push(`*${label}* (${fmtMin(b.startMin)}–${fmtMin(b.endMin)})`);
    if (b.gk) out.push(`DM: ${names([b.gk])}`);
    for (const l of FIELD_LINIES) if (b.lines[l].length) out.push(`${LINIE_SHORT[l]}: ${names(b.lines[l])}`);
    if (b.bench.length) out.push(`Bank: ${names(b.bench)}`);
    if (b.in.length) out.push(`In: ${names(b.in)} / Uit: ${names(b.out)}`);
    out.push('');
  }
  out.push('*Speeltijd*');
  for (const p of [...plan.players].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))) {
    out.push(`${p.name}: ${fmtMin(p.minutes)}`);
  }
  return out.join('\n');
}
