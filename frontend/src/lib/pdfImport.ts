// ── PDF-import: haalt een ingevulde trainingsvoorbereiding (PowerPoint-template
// geëxporteerd naar PDF) terug op in een volledige Training + Exercises.
// Werkt volledig lokaal in de browser (pdfjs-dist) — geen server-upload, geen API-call.
//
// Aanpak: elk veld in de template is een label-"pil" met een waardevak ernaast
// (zelfde rij) of eronder (rij(en) eronder), telkens op een vaste, voorspelbare
// positie. We lezen alle tekstfragmenten per pagina uit met hun (x,y)-positie,
// herkennen daartussen de bekende template-labels, en wijzen elk ander
// tekstfragment toe aan het DICHTSTBIJZIJNDE label erboven (in x eerst als er
// echte overlap is — voor labels die een rij delen zoals COACHINGSWOORDEN/
// MATERIAAL — anders in y). Dit is best-effort: de gebruiker controleert het
// resultaat nadien gewoon in de trainingseditor, net zoals bij de andere
// generator-features.

import { ExerciseFase, EXERCISE_FASE_LABELS } from './api';

// pdfjs-dist is large and only needed when a trainer actually imports a PDF,
// so it's loaded on demand instead of bundled into the main chunk.
// @ts-ignore - Vite '?url' asset import, typed via vite/client
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  return pdfjsLib;
}

// ── Laag 1: ruwe tekst → tekstfragmenten met positie, per pagina ──────────────

interface RawItem { str: string; x: number; y: number; w: number; }
interface PosSeg { text: string; xStart: number; xEnd: number; y: number; }

/** Groepeert ruwe tekst-items in fragmenten: enkel items die duidelijk tot
 * dezelfde vorm (label of tekstvak) behoren worden samengevoegd. De echte
 * afstand tussen twee verschillende vormen in deze template is ±5-8pt, dus
 * een kleine, vaste marge houdt aparte vormen ook echt apart. */
function reconstructPageSegments(items: RawItem[]): PosSeg[] {
  if (items.length === 0) return [];
  const Y_TOL = 2;
  const GAP = 2.5;

  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: RawItem[][] = [];
  for (const it of sorted) {
    const row = rows.find(r => Math.abs(r[0].y - it.y) <= Y_TOL);
    if (row) row.push(it); else rows.push([it]);
  }
  rows.forEach(r => r.sort((a, b) => a.x - b.x));

  const segs: PosSeg[] = [];
  for (const row of rows) {
    // Alle items van deze rij delen exact dezelfde canonieke y — anders kan
    // sub-punt jitter tussen twee labels op "dezelfde rij" (bv. een 0,8pt
    // verschil door onnauwkeurige PPT-plaatsing) de score-vergelijking
    // verderop laten kantelen naar het verkeerde label.
    const rowY = row[0].y;
    let cur: PosSeg | null = null;
    for (const it of row) {
      const xStart = it.x, xEnd = it.x + it.w;
      if (cur && xStart - cur.xEnd <= GAP) {
        cur.text += (xStart - cur.xEnd > 0.5 ? ' ' : '') + it.str;
        cur.xEnd = Math.max(cur.xEnd, xEnd);
      } else {
        cur = { text: it.str, xStart, xEnd, y: rowY };
        segs.push(cur);
      }
    }
  }
  return segs
    .map(s => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter(s => s.text);
}

/** Rendert een oefeningpagina en snijdt het "Tekening oefening"-vak eruit als
 * afbeelding, zodat de originele veldtekening meteen zichtbaar is in de
 * tekentool. De tekening in dit template is zelf één vaste afbeelding (geen
 * losse speler-/pionvormen die we individueel kunnen terugvinden), dus we
 * nemen ze integraal over als achtergrond i.p.v. ze te reconstrueren.
 * De zone is gekalibreerd op de vaste, officiële KFC-template. */
async function extractExerciseDrawingImage(page: any): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  try {
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const [x0, x1] = [0.04, 0.68];
    const [y0, y1] = [0.35, 0.985];
    const sx = x0 * canvas.width, sy = y0 * canvas.height;
    const sw = (x1 - x0) * canvas.width, sh = (y1 - y0) * canvas.height;
    if (sw < 10 || sh < 10) return undefined;

    const out = document.createElement('canvas');
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const octx = out.getContext('2d');
    if (!octx) return undefined;
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined; // best-effort: trainer kan zelf tekenen als dit faalt
  }
}

/** Labels die niet in hun pil passen breekt PowerPoint af ("HOOFDMOME" / "NT",
 * "TRAININGSVOORB" / "EREIDING"), en een label met een gekleurd woord erin
 * ("WAT ZOU JIJ" "BEHOUDEN" "VAN DEZE" / "TRAINING?") komt als losse stukken
 * terug. Zonder samenvoegen herkent de import zo'n label niet en blijft het veld
 * leeg; bij de kop "Trainingsvoorbereiding" werd zelfs de hele pagina overgeslagen.
 * Stukken worden enkel samengevoegd als ze vlak naast of onder elkaar staan én
 * samen exact een bekend label vormen, zodat gewone invultekst nooit meegaat. */
function mergeSplitLabels(segs: PosSeg[], labels: string[]): PosSeg[] {
  const norm = (t: string) => t.toUpperCase().replace(/\s+/g, '');
  const targets = labels.map(l => ({ label: l, key: norm(l) }));
  const isPrefix = (t: string) => targets.some(x => x.key.startsWith(t));
  const ROW_TOL = 2;      // zelfde regel
  const ROW_GAP = 12;     // max. horizontale afstand tussen stukken op één regel
  const LINE_GAP = 40;    // max. regelafstand (groot lettertype van de kop ≈ 34pt)
  const X_SLACK = 45;     // een afgebroken regel staat gecentreerd onder de eerste

  const ordered = [...segs].sort((a, b) => (b.y - a.y) || (a.xStart - b.xStart));
  const used = new Set<PosSeg>();
  const merged: PosSeg[] = [];
  for (const first of ordered) {
    if (used.has(first)) continue;
    const firstKey = norm(first.text);
    if (targets.some(x => x.key === firstKey) || !isPrefix(firstKey)) continue;

    const group = [first];
    let key = firstKey;
    let xEnd = first.xEnd;
    for (;;) {
      const last = group[group.length - 1];
      const fits = (c: PosSeg) => !used.has(c) && !group.includes(c) && isPrefix(key + norm(c.text));
      const sameRow = ordered.find(c => fits(c) && Math.abs(c.y - last.y) <= ROW_TOL
        && c.xStart >= last.xEnd - 1 && c.xStart - last.xEnd <= ROW_GAP);
      const nextLine = ordered
        .filter(c => fits(c) && last.y - c.y > ROW_TOL && last.y - c.y <= LINE_GAP
          && c.xStart >= first.xStart - X_SLACK && c.xStart <= xEnd)
        .sort((a, b) => b.y - a.y)[0];
      const next = sameRow ?? nextLine;
      if (!next) break;
      group.push(next);
      key += norm(next.text);
      xEnd = Math.max(xEnd, next.xEnd);
    }
    const target = targets.find(x => x.key === key);
    if (!target || group.length < 2) continue;
    group.forEach(g => used.add(g));
    const ys = group.map(g => g.y);
    merged.push({
      text: target.label,
      xStart: Math.min(...group.map(g => g.xStart)),
      xEnd,
      // Midden van het label: zo staat het even hoog als een waarde ernaast,
      // net zoals een label dat op één regel past.
      y: (Math.max(...ys) + Math.min(...ys)) / 2,
    });
  }
  return [...segs.filter(x => !used.has(x)), ...merged];
}

interface PdfPage { segs: PosSeg[]; page: any; }

async function extractPdfPages(file: File): Promise<PdfPage[]> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: RawItem[] = (content.items as any[])
      .filter(it => typeof it.str === 'string' && it.str.trim() !== '')
      .map(it => ({ str: it.str as string, x: it.transform[4], y: it.transform[5], w: it.width as number }));
    pages.push({ segs: mergeSplitLabels(reconstructPageSegments(items), ALL_LABELS), page });
  }
  return pages;
}

// Kale sectiekoppen/dividers uit het template die geen eigen invulveld hebben.
const NON_FIELD_HEADERS = new Set([
  'TRAININGSVOORBEREIDING', 'DATUM', 'LEREN', 'SPELUITDAGING',
  'ACTIEF, FUN & INDIVIDUELE AANDACHT', 'TEKENING OEFENING',
]);

function isNonFieldHeader(text: string): boolean {
  const up = text.trim().toUpperCase();
  if (NON_FIELD_HEADERS.has(up)) return true;
  if (/^REFLECTIE\b/.test(up) || /^EVALUATIE NA TRAINING/.test(up)) return true;
  return false;
}

// ── Laag 2: label → waarde herkenning (positioneel) ────────────────────────────
// Elk erkend label-fragment wordt een "anker". Elk ander fragment wordt
// toegewezen aan het dichtstbijzijnde anker dat op- of naast dat fragment
// staat: eerst een anker waarvan de x-breedte echt overlapt (voor labels die
// een rij delen, bv. "COACHINGSWOORDEN" / "MATERIAAL"), anders het anker met
// de kleinste afstand (y telt het zwaarst — een rij hoger weegt voor dan een
// paar punten opzij).

function assignFieldsSpatial<K extends string>(
  rawSegs: PosSeg[], labels: Record<string, K>
): Partial<Record<K, string>> {
  const upperLabels: Record<string, K> = {};
  for (const [k, v] of Object.entries(labels)) upperLabels[k.toUpperCase()] = v;

  const usable = rawSegs.filter(s => !isNonFieldHeader(s.text));
  const anchors: { key: K; xStart: number; xEnd: number; y: number }[] = [];
  const values: PosSeg[] = [];
  for (const s of usable) {
    const key = upperLabels[s.text.toUpperCase()];
    if (key) anchors.push({ key, xStart: s.xStart, xEnd: s.xEnd, y: s.y });
    else values.push(s);
  }
  if (anchors.length === 0) return {};

  // Twee fasen per waarde-fragment: eerst de rij bepalen (kleinste y-afstand),
  // dan — onder alle ankers die ongeveer even ver staan als die dichtstbijzijnde
  // rij ("band" van één regelhoogte) — het anker kiezen met de beste x-overlap.
  // Puur optellen van y- en x-afstand faalt hier: een alinea in de rechterkolom
  // kan toevallig op de y-hoogte van een ánder label in de linkerkolom vallen,
  // een paar punten dichter dan zijn eigen label verderop — dan moet x, niet y,
  // de doorslag geven zolang beide ankers "ongeveer dezelfde rij" zijn.
  //
  // Bij korte "pil"-velden die naast elkaar op dezelfde rij staan (label ernaast,
  // niet erboven) meet PowerPoint's eigen PDF-export het label soms een fractie
  // (tot ~3pt) lager dan zijn eigen waarde, door een klein baseline-verschil
  // tussen het vette labellettertype en het gewone waardelettertype — vandaar
  // een iets ruimere marge dan de louter positionele afronding zou vereisen.
  const Y_TOL = 4;
  // Een label naast zijn waarde kan tot ±5pt lager uitkomen (gemeten in de
  // export van 19/10); de afstand tot een volgend veld is altijd ruim groter.
  const LABEL_BELOW_TOL = 6;
  const SIDE_GAP = 150; // label-pil links, waarde-pil rechts ernaast (±90-130pt)
  const buckets = new Map<K, PosSeg[]>();
  for (const v of values) {
    const candidates = anchors
      .filter(a => a.y >= v.y - LABEL_BELOW_TOL) // anker moet op- of naast de waarde staan, nooit eronder
      .map(a => ({
        a,
        yGap: Math.max(0, a.y - v.y), // nooit "beter dan dezelfde rij" belonen
        xGap: Math.max(a.xStart - v.xEnd, v.xStart - a.xEnd, 0),
      }));
    if (candidates.length === 0) continue;
    // Horizontale afstand telt pas mee voorbij de normale afstand tussen een label
    // en de waarde ernaast; daarna weegt elk punt even zwaar als een punt hoger.
    // Zo springt de laatste regel van een vak in de rechterkolom niet naar een
    // label in de linkerkolom dat toevallig op dezelfde hoogte staat.
    const score = (c: typeof candidates[number]) => c.yGap + Math.max(0, c.xGap - SIDE_GAP);
    const best = candidates.reduce((b, c) =>
      score(c) < score(b) || (score(c) === score(b) && c.xGap < b.xGap) ? c : b, candidates[0]).a;
    if (!buckets.has(best.key)) buckets.set(best.key, []);
    buckets.get(best.key)!.push(v);
  }

  const result: Partial<Record<K, string>> = {};
  for (const [key, list] of buckets) {
    const ordered = [...list].sort((a, b) => (b.y - a.y) || (a.xStart - b.xStart));
    const lines: string[] = [];
    let curY: number | null = null;
    let curLine: string[] = [];
    for (const s of ordered) {
      if (curY === null || Math.abs(curY - s.y) > Y_TOL) {
        if (curLine.length) lines.push(curLine.join(' '));
        curLine = [s.text];
        curY = s.y;
      } else {
        curLine.push(s.text);
      }
    }
    if (curLine.length) lines.push(curLine.join(' '));
    const text = lines.join('\n').trim();
    if (text) result[key as K] = text;
  }
  return result;
}

type TrainingFieldKey =
  | 'coachNaam' | 'tijdstip' | 'leeftijdscategorie' | 'niveau'
  | 'hoofdmoment' | 'spelfase' | 'basisvaardigheid'
  | 'speluitdagingWie' | 'speluitdagingWat' | 'speluitdagingWaar' | 'speluitdagingWanneer'
  | 'coachingswoorden' | 'materiaal'
  | 'actiefAanpak' | 'funAanpak' | 'individueleAandacht'
  | 'evalBehouden' | 'evalWijzigen' | 'evalWarenActief' | 'evalHaddenFun' | 'evalBijgeleerd' | 'evalIndividueleAandacht';

const TRAINING_LABELS: Record<string, TrainingFieldKey> = {
  'NAAM COACH': 'coachNaam',
  'TIJDSTIP': 'tijdstip',
  'LEEFTIJDSCATEGORIE': 'leeftijdscategorie',
  'NIVEAU': 'niveau',
  'HOOFDMOMENT': 'hoofdmoment',
  'SPELFASE': 'spelfase',
  'BASISVAARDIGHEID': 'basisvaardigheid',
  'WIE': 'speluitdagingWie',
  'WAT': 'speluitdagingWat',
  'WAAR': 'speluitdagingWaar',
  'WANNEER': 'speluitdagingWanneer',
  'COACHINGSWOORDEN': 'coachingswoorden',
  'MATERIAAL': 'materiaal',
  'HOE ZORG IK DAT DE SPELERS MAXIMAAL ACTIEF ZIJN?': 'actiefAanpak',
  'HOE INTEGREER IK FUN?': 'funAanpak',
  'HOE GEEF IK INDIVIDUELE AANDACHT AAN ELKE SPELER?': 'individueleAandacht',
  'WAT ZOU JIJ BEHOUDEN VAN DEZE TRAINING?': 'evalBehouden',
  'WAT ZOU JIJ WIJZIGEN AAN DEZE TRAINING?': 'evalWijzigen',
  'WAREN DE SPELERS ACTIEF?': 'evalWarenActief',
  'HADDEN DE SPELERS FUN?': 'evalHaddenFun',
  'HEBBEN DE SPELERS BIJGELEERD?': 'evalBijgeleerd',
  'GAF JE INDIVIDUELE AANDACHT AAN ELKE SPELER?': 'evalIndividueleAandacht',
};

type ExerciseFieldKey = 'organisatie' | 'beschrijving' | 'coachingPunten' | 'maximaalActief' | 'fun';
const EXERCISE_LABELS: Record<string, ExerciseFieldKey> = {
  'ORGANISATIE OEFENING': 'organisatie',
  'BESCHRIJVING OEFENING': 'beschrijving',
  'COACHING': 'coachingPunten',
  'MAXIMAAL ACTIEF': 'maximaalActief',
  'FUN': 'fun',
};

/** Alle vaste labels en koppen uit het sjabloon (voor mergeSplitLabels). */
const ALL_LABELS = [
  ...Object.keys(TRAINING_LABELS), ...Object.keys(EXERCISE_LABELS), ...NON_FIELD_HEADERS, 'TEKENING OEFENING',
];

export interface ParsedExercise {
  fase: ExerciseFase;
  naam: string;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
  /** Data-URI van de originele "Tekening oefening"-afbeelding uit de PDF, indien gelukt. */
  drawingImage?: string;
}

/** Vaste instructietekst die in het sjabloon achter de titelbanner zit: "KIES JE
 * TEKENFIGUUR EN VUL HIER HET TRAININGSONDERDEEL IN (OPWARMING, WEDSTRIJDVORM,
 * TUSSENVORM, COOLING DOWN)". In de PDF staat ze over twee regels, net boven en
 * net onder de echte titel, en bij sommige exports zelfs in hetzelfde fragment. */
const INSTRUCTION_PARTS = [
  /KIES JE TEKENFIGUUR EN VUL HIER HET TRAININGSONDERDEEL IN\s*\(?\s*(OPWARMING\s*,?)?/gi,
  /(OPWARMING\s*,\s*)?WEDSTRIJDVORM\s*,\s*TUSSENVORM\s*,\s*COOLING\s*DOWN\s*\)/gi,
];
const FASE_WORD = /(OPWARMING|TUSSENVORM|WEDSTRIJDVORM|COOLING\s*DOWN)/i;

/** De titel bovenaan de oefeningpagina, letterlijk zoals op de slide (bv.
 * "OPWARMING – MULTIMOVE: TIKSPEL & REACTIEDUEL" of "STATION 1 – SCHAKELVORM
 * 3v3"): alle tekst boven het label "Organisatie oefening", min de verborgen
 * instructietekst. De fase komt uit het eerste fasewoord in die titel; zonder
 * fasewoord (bv. "STATION 2 – …") is er geen fase en kiest de aanroeper zelf.
 *
 * Vroeger werd de bovenste regel met een fasewoord genomen, maar dat is de
 * instructietekst — elke oefening werd daardoor "Opwarming". */
function detectBanner(segs: PosSeg[]): { fase: ExerciseFase | null; naam: string | null } {
  const orgAnchor = segs.find(s => s.text.trim().toUpperCase() === 'ORGANISATIE OEFENING');
  if (!orgAnchor) return { fase: null, naam: null };

  const Y_TOL = 2;
  const above = segs.filter(s => s.y > orgAnchor.y + Y_TOL).sort((a, b) => (b.y - a.y) || (a.xStart - b.xStart));
  const rows: PosSeg[][] = [];
  for (const seg of above) {
    const row = rows.find(r => Math.abs(r[0].y - seg.y) <= Y_TOL);
    if (row) row.push(seg); else rows.push([seg]);
  }
  const naam = rows
    .map(r => INSTRUCTION_PARTS.reduce(
      (t, re) => t.replace(re, ' '),
      [...r].sort((a, b) => a.xStart - b.xStart).map(x => x.text).join(' '),
    ))
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[•·▪◦\-–\s]+/, '') // opsommingsteken vóór de titel
    || null;

  const word = naam?.match(FASE_WORD)?.[0].toUpperCase().replace(/\s+/g, ' ');
  const fase: ExerciseFase | null =
    word === 'OPWARMING' ? 'opwarming'
    : word === 'TUSSENVORM' ? 'tussenvorm'
    : word === 'WEDSTRIJDVORM' ? 'wedstrijdvorm'
    : word === 'COOLING DOWN' ? 'cooling_down'
    : null;
  return { fase, naam };
}

/** "Organisatie oefening" is een 2x2-rooster van ongelabelde pillen (spelers |
 * duur — afmetingen | materiaal). Er is geen betrouwbaar tekstpatroon om op te
 * knippen: afmetingen is niet altijd "XmxYm" (soms "Vrij vak" of "Volledig
 * U10-veld, wedstrijdrichting"), en spelers/materiaal kunnen over meerdere
 * regels wrappen. Daarom werken we rechtstreeks op de posities: de kolom
 * (links/rechts) is de grootste horizontale kloof tussen waardefragmenten, de
 * rij (boven/onder) is de grootste verticale kloof — dat blijft correct
 * ongeacht hoeveel regels een veld inneemt of wat de tekst zelf zegt. */
/** Duur-pil → minuten. "15'" = 15, "3×15' + 2'" = 47 (blokken × minuten plus de
 * rest). De blokken worden apart teruggegeven: volgen die stations nadien als
 * eigen oefeningen, dan telt parseTrainingPdf ze niet dubbel. */
interface Duur { minuten: number; blokken: { aantal: number; minuten: number }[]; rest: number }
function parseDuur(text: string): Duur {
  const blokken: Duur['blokken'] = [];
  let rest = 0;
  for (const term of text.split('+')) {
    const blok = term.match(/(\d+)\s*[×x*]\s*(\d+)/i);
    if (blok) { blokken.push({ aantal: parseInt(blok[1], 10), minuten: parseInt(blok[2], 10) }); continue; }
    const getal = term.match(/\d+/);
    if (getal) rest += parseInt(getal[0], 10);
  }
  const minuten = blokken.reduce((sum, b) => sum + b.aantal * b.minuten, 0) + rest;
  return { minuten: minuten || 10, blokken, rest };
}

function parseOrganisatieGrid(segs: PosSeg[]): { spelers: string; duur: Duur; afmetingen: string; materiaal: string } {
  const fallback = { spelers: '', duur: parseDuur(''), afmetingen: '', materiaal: '' };
  const up = (s: string) => s.trim().toUpperCase();
  const orgAnchor = segs.find(s => up(s.text) === 'ORGANISATIE OEFENING');
  if (!orgAnchor) return fallback;

  const tekeningAnchor = segs.find(s => up(s.text) === 'TEKENING OEFENING');
  const yTop = orgAnchor.y;
  const yBottom = tekeningAnchor ? tekeningAnchor.y : -Infinity;

  const KNOWN_LABELS = new Set(['ORGANISATIE OEFENING', 'BESCHRIJVING OEFENING', 'TEKENING OEFENING', 'COACHING', 'MAXIMAAL ACTIEF', 'FUN']);
  const candidates = segs.filter(s => s.y < yTop && s.y > yBottom && !KNOWN_LABELS.has(up(s.text)));
  if (candidates.length === 0) return fallback;

  // Groepeer overlappende/aaneensluitende x-intervallen tot kolomblokken,
  // ongeacht rij (y) — dat isoleert betrouwbaar de 2 rooster-kolommen van al
  // wat verder naar rechts staat (bv. de "Beschrijving oefening"-alinea, die
  // soms zelfs links van haar eigen label start en dus geen vaste x-grens
  // toelaat). Organisatie is altijd de linkerkant van de pagina, dus we nemen
  // gewoon de twee meest linkse blokken.
  const byXStart = [...candidates].sort((a, b) => a.xStart - b.xStart);
  const blocks: { xEnd: number; segs: PosSeg[] }[] = [];
  for (const s of byXStart) {
    const last = blocks[blocks.length - 1];
    if (last && s.xStart <= last.xEnd) {
      last.xEnd = Math.max(last.xEnd, s.xEnd);
      last.segs.push(s);
    } else {
      blocks.push({ xEnd: s.xEnd, segs: [s] });
    }
  }
  const leftCol = blocks[0]?.segs ?? [];
  const rightCol = blocks[1]?.segs ?? [];

  function joinReadingOrder(list: PosSeg[]): string {
    return [...list].sort((a, b) => (b.y - a.y) || (a.xStart - b.xStart)).map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  function splitRows(colSegs: PosSeg[]): { top: PosSeg[]; bottom: PosSeg[] } {
    if (colSegs.length <= 1) return { top: colSegs, bottom: [] };
    const ys = [...new Set(colSegs.map(s => s.y))].sort((a, b) => a - b);
    let splitY = -Infinity, maxGap = -1;
    for (let i = 1; i < ys.length; i++) {
      const gap = ys[i] - ys[i - 1];
      if (gap > maxGap) { maxGap = gap; splitY = (ys[i] + ys[i - 1]) / 2; }
    }
    return { top: colSegs.filter(s => s.y >= splitY), bottom: colSegs.filter(s => s.y < splitY) };
  }

  const leftRows = splitRows(leftCol);
  const rightRows = splitRows(rightCol);

  const spelers = joinReadingOrder(leftRows.top);
  const afmetingen = joinReadingOrder(leftRows.bottom);
  const duurText = joinReadingOrder(rightRows.top);
  const materiaal = joinReadingOrder(rightRows.bottom);
  return { spelers, duur: parseDuur(duurText), afmetingen, materiaal };
}

async function parseExercisePage(segs: PosSeg[], page: any): Promise<{ exercise: ParsedExercise; duur: Duur }> {
  const fields = assignFieldsSpatial(segs, EXERCISE_LABELS);
  const {
    spelers: organisatieSpelers, duur, afmetingen: organisatieAfmetingen, materiaal: organisatieMateriaal,
  } = parseOrganisatieGrid(segs);
  const duurMinuten = duur.minuten;

  const beschrijving = (fields.beschrijving ?? '')
    .split('\n').map(l => l.trim().replace(/^[•\-]\s*/, '')).filter(Boolean).join('\n').trim();

  const { fase: bannerFase, naam: bannerNaam } = detectBanner(segs);
  const fase: ExerciseFase = bannerFase ?? 'tussenvorm';
  // De naam is de volledige titel van de slide. Enkel zonder leesbare titel valt
  // hij terug op de fase, of op een placeholder als zelfs die ontbreekt.
  const naam = bannerNaam ?? (bannerFase ? EXERCISE_FASE_LABELS[bannerFase] : 'Geïmporteerde oefening');
  const drawingImage = await extractExerciseDrawingImage(page);

  return { duur, exercise: {
    fase, naam, duurMinuten,
    organisatieSpelers, organisatieAfmetingen, organisatieMateriaal,
    beschrijving,
    coachingPunten: fields.coachingPunten ?? '',
    maximaalActief: fields.maximaalActief ?? '',
    fun: fields.fun ?? '',
    drawingImage,
  } };
}

export interface ParsedTrainingPdf {
  titel: string;
  fields: Partial<Record<TrainingFieldKey, string>>;
  exercises: ParsedExercise[];
}

const NL_WEEKDAGEN = 'maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag';
const NL_MAANDEN = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december';

/** "Wanneer" hoort een speluitdaging-trigger te zijn (bv. "zodra de tegenstander
 * in opbouw is"), maar trainers vullen hier soms per ongeluk de trainingsdatum
 * in — dat overschrijft dan zinloos het echte "wanneer"-veld, dus laten we het
 * in dat geval gewoon leeg i.p.v. een datum te importeren als speluitdaging. */
function looksLikeDate(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (new RegExp(`^(${NL_WEEKDAGEN})?\\s*\\d{1,2}\\s+(${NL_MAANDEN})\\s+\\d{4}$`, 'i').test(t)) return true;
  if (/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(t)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return true;
  return false;
}

/** Best-effort extractie van een ingevulde KFC-trainingstemplate (PDF) naar Training + Exercises. */
export async function parseTrainingPdf(file: File): Promise<ParsedTrainingPdf> {
  const pages = await extractPdfPages(file);
  let fields: Partial<Record<TrainingFieldKey, string>> = {};
  const exercises: ParsedExercise[] = [];
  const durations: Duur[] = [];

  for (let idx = 0; idx < pages.length; idx++) {
    const { segs, page } = pages[idx];
    const upper = segs.map(s => s.text.toUpperCase());
    const hasKop = upper.includes('TRAININGSVOORBEREIDING');
    const hasOrganisatie = upper.includes('ORGANISATIE OEFENING');
    const hasReflectie = upper.some(s => /^REFLECTIE\b/.test(s));

    if (hasKop || hasReflectie) {
      // Per pagina verwerkt, zodat een veld van de ene pagina nooit doorloopt
      // in het eerste veld van de volgende pagina.
      fields = { ...fields, ...assignFieldsSpatial(segs, TRAINING_LABELS) };
    } else if (hasOrganisatie) {
      const { exercise, duur } = await parseExercisePage(segs, page);
      exercises.push(exercise);
      durations.push(duur);
    }
  }

  // Overzichtsslide ("3 stations van 15'", duur "3×15' + 2'") gevolgd door die
  // stations als eigen oefeningen: de stationstijd zit dan al in die oefeningen,
  // dus houdt het overzicht enkel de rest (de wisseltijd) — anders telt de
  // trainingsduur de stations dubbel.
  durations.forEach((d, i) => {
    if (d.blokken.length !== 1) return;
    const { aantal, minuten } = d.blokken[0];
    const volgende = exercises.slice(i + 1, i + 1 + aantal);
    if (volgende.length === aantal && volgende.every(e => e.duurMinuten === minuten)) {
      exercises[i].duurMinuten = d.rest;
    }
  });

  if (fields.speluitdagingWanneer && looksLikeDate(fields.speluitdagingWanneer)) {
    delete fields.speluitdagingWanneer;
  }

  // Materiaal = optelsom van het materiaal van alle oefeningen, i.p.v. het
  // eigen "materiaal"-veld uit de PDF (dat gaat over algemeen trainingsmateriaal
  // en is voor de trainer overbodig om nog eens apart te controleren).
  const alleMateriaal = [...new Set(exercises.map(e => e.organisatieMateriaal.trim()).filter(Boolean))];
  if (alleMateriaal.length > 0) fields.materiaal = alleMateriaal.join('\n');

  // Titel van een geïmporteerde training is altijd "Training - <hoofdmoment>",
  // i.p.v. te proberen een titel te lezen uit de openingsslide (die vaak enkel
  // datum + jaarplanthema bevat, geen bruikbare "titel").
  const titel = fields.hoofdmoment ? `Training - ${fields.hoofdmoment}` : '';

  return { titel, fields, exercises };
}
