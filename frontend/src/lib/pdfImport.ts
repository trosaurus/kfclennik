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
    pages.push({ segs: reconstructPageSegments(items), page });
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
  const ROW_BAND = 10;
  const buckets = new Map<K, PosSeg[]>();
  for (const v of values) {
    const candidates = anchors
      .filter(a => a.y >= v.y - Y_TOL) // anker moet op- of naast de waarde staan, nooit eronder
      .map(a => ({
        a,
        yGap: Math.max(0, a.y - v.y), // nooit "beter dan dezelfde rij" belonen
        xGap: Math.max(a.xStart - v.xEnd, v.xStart - a.xEnd, 0),
      }));
    if (candidates.length === 0) continue;
    const minYGap = Math.min(...candidates.map(c => c.yGap));
    const nearRow = candidates.filter(c => c.yGap <= minYGap + ROW_BAND);
    const best = nearRow.reduce((b, c) => (c.xGap < b.xGap ? c : b), nearRow[0]).a;
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

/** De fase én de naam staan samen in de grote groene bannertitel bovenaan de
 * pagina — het scheidingsteken verschilt per sjabloon-versie: een dubbele punt
 * ("OPWARMING: MULTISKILLZ - POORTJES & TIKKERS") of een liggend streepje
 * ("Opwarming – Kriskras coördinatie met bal"). Soms staat er ook nog een
 * volgnummer en/of "/ Slotvorm"-kwalificatie tussen de fase en het echte
 * scheidingsteken ("Wedstrijdvorm 2 / Slotvorm – 8 tegen 8, ..."). Om dat
 * betrouwbaar te knippen zoeken we het LAATSTE ":" of "–" op de regel op —
 * nooit een gewoon koppelteken "-", want dat komt ook vaak gewoon in de naam
 * zelf voor (bv. "1-2", "B- coachen") en zou de knip verkeerd laten vallen.
 *
 * De vaste instructietekst bovenaan elke oefeningpagina ("KIES JE TEKENFIGUUR
 * EN VUL HIER HET TRAININGSONDERDEEL IN (OPWARMING, WEDSTRIJDVORM,
 * TUSSENVORM, COOLING DOWN)") staat in sommige PDF-exports (bv. via
 * PowerPoint's eigen "Opslaan als PDF") zo dicht bij de echte banner dat ze
 * tot één tekstfragment worden samengevoegd, mét alle vier fasewoorden erin.
 * Daarom nemen we niet het EERSTE fasewoord in de (samengevoegde) regel, maar
 * het LAATSTE — dat is altijd het echte banner-fasewoord, want de
 * instructietekst met haar opsomming komt er altijd vóór. */
function detectFaseAndNaamFromBanner(segs: PosSeg[]): { fase: ExerciseFase | null; naam: string | null } {
  const FASE_WORD = /(OPWARMING|TUSSENVORM|WEDSTRIJDVORM|COOLING\s*DOWN)/gi;
  const candidates = segs.filter(s => FASE_WORD.test(s.text));
  FASE_WORD.lastIndex = 0;
  if (candidates.length === 0) return { fase: null, naam: null };
  const anchor = candidates.reduce((a, b) => (b.y > a.y ? b : a));

  // Het lettertype/de opmaak van de banner (bv. vet "OPWARMING:" gevolgd door
  // niet-vette naam) kan ervoor zorgen dat pdf.js dit als twee aparte
  // tekstfragmenten teruggeeft i.p.v. één samengevoegd fragment — dus herbouwen
  // we de volledige regel uit alle fragmenten op dezelfde rij (y-hoogte),
  // ongeacht hoe reconstructPageSegments ze al dan niet had samengevoegd.
  const Y_TOL = 2;
  const fullLine = segs
    .filter(s => Math.abs(s.y - anchor.y) <= Y_TOL)
    .sort((a, b) => a.xStart - b.xStart)
    .map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();

  const faseMatches = [...fullLine.matchAll(FASE_WORD)];
  if (faseMatches.length === 0) return { fase: null, naam: null };
  const lastMatch = faseMatches[faseMatches.length - 1];
  const bannerPart = fullLine.slice(lastMatch.index!);

  let fase: ExerciseFase | null = null;
  if (/^opwarming/i.test(lastMatch[0])) fase = 'opwarming';
  else if (/^tussenvorm/i.test(lastMatch[0])) fase = 'tussenvorm';
  else if (/^wedstrijdvorm/i.test(lastMatch[0])) fase = 'wedstrijdvorm';
  else if (/^cooling/i.test(lastMatch[0])) fase = 'cooling_down';

  let naam: string | null = null;
  const lastSepIdx = Math.max(bannerPart.lastIndexOf(':'), bannerPart.lastIndexOf('–'));
  if (lastSepIdx !== -1) {
    naam = bannerPart.slice(lastSepIdx + 1).trim() || null;
  } else {
    // Geen scheidingsteken teruggevonden (bv. gewoon "Cooling down" zonder
    // extra titel) — dan is er geen aparte naam, de aanroeper valt terug op
    // de fase zelf.
    naam = null;
  }
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
function parseOrganisatieGrid(segs: PosSeg[]): { spelers: string; duurMinuten: number; afmetingen: string; materiaal: string } {
  const fallback = { spelers: '', duurMinuten: 10, afmetingen: '', materiaal: '' };
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
  const durMatch = duurText.match(/\d+/);
  const duurMinuten = durMatch ? parseInt(durMatch[0], 10) : 10;

  return { spelers, duurMinuten, afmetingen, materiaal };
}

async function parseExercisePage(segs: PosSeg[], page: any): Promise<ParsedExercise> {
  const fields = assignFieldsSpatial(segs, EXERCISE_LABELS);
  const {
    spelers: organisatieSpelers, duurMinuten, afmetingen: organisatieAfmetingen, materiaal: organisatieMateriaal,
  } = parseOrganisatieGrid(segs);

  const beschrijving = (fields.beschrijving ?? '')
    .split('\n').map(l => l.trim().replace(/^[•\-]\s*/, '')).filter(Boolean).join('\n').trim();

  const { fase: bannerFase, naam: bannerNaam } = detectFaseAndNaamFromBanner(segs);
  const fase: ExerciseFase = bannerFase ?? 'tussenvorm';
  // Zonder aparte naam (bv. banner is gewoon "Cooling down") valt terug op de
  // fase zelf i.p.v. een nietszeggende placeholder — enkel als zelfs de fase
  // niet herkend werd, is er echt niets bruikbaars en blijft de placeholder over.
  const naam = bannerNaam ?? (bannerFase ? EXERCISE_FASE_LABELS[bannerFase] : 'Geïmporteerde oefening');
  const drawingImage = await extractExerciseDrawingImage(page);

  return {
    fase, naam, duurMinuten,
    organisatieSpelers, organisatieAfmetingen, organisatieMateriaal,
    beschrijving,
    coachingPunten: fields.coachingPunten ?? '',
    maximaalActief: fields.maximaalActief ?? '',
    fun: fields.fun ?? '',
    drawingImage,
  };
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
      exercises.push(await parseExercisePage(segs, page));
    }
  }

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
