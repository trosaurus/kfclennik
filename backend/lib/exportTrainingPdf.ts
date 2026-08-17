// Genereert een eenvoudig, zelfstandig PDF-verslag van een Training + Exercises
// (geen sjabloonbestand nodig, in tegenstelling tot de PowerPoint-export) —
// handig om snel te delen/printen zonder PowerPoint. Hergebruikt dezelfde
// tekening-rasterisatie (parseDrawingScene + renderDrawingPng) als de
// PowerPoint-export, en dezelfde ExportTraining/ExportExercise data-vorm.

import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { parseDrawingScene } from './drawingSvg';
import { renderDrawingPng } from './renderDrawingPng';
import { ExportTraining, ExportExercise } from './exportTrainingPptx';

const FASE_LABELS: Record<string, string> = {
  opwarming: 'OPWARMING', tussenvorm: 'TUSSENVORM', wedstrijdvorm: 'WEDSTRIJDVORM', cooling_down: 'COOLING DOWN',
};

const RED = '#CC1A1A';
const DARK = '#16161D';
const DIM = '#6b7280';
const MARGIN = 44;

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'images', 'logo-kfc-lennik.png');
const LOGO_ASPECT = 455 / 491; // breedte/hoogte van het bronbestand
const LOGO_BUFFER: Buffer | null = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;

/** Klein clublogo linksboven op elke pagina — puur decoratief, staat los van
 * de tekst-flow (vaste positie) zodat de strakke een-pagina-per-oefening
 * budgettering in addExercisePage() er niet door verschuift. */
function addHeaderLogo(doc: PDFKit.PDFDocument) {
  if (!LOGO_BUFFER) return;
  const h = 24, w = h * LOGO_ASPECT;
  doc.image(LOGO_BUFFER, doc.page.margins.left, 14, { width: w, height: h });
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.6);
  doc.fontSize(14).fillColor(RED).font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
}

function field(doc: PDFKit.PDFDocument, labelText: string, val: string) {
  doc.fontSize(9).fillColor(DIM).font('Helvetica-Bold').text(labelText.toUpperCase(), { characterSpacing: 0.4 });
  doc.fontSize(11).fillColor(DARK).font('Helvetica').text(val.trim() || '—');
  doc.moveDown(0.6);
}

/** Eén rij van een tabel: gelijke kolombreedtes, een label boven een waarde
 * per cel, met een vaste celhoogte (tekst die niet past wordt afgekapt met
 * "…" i.p.v. de tabel — en dus de pagina — te laten uitdijen). */
function drawTableRow(doc: PDFKit.PDFDocument, x: number, y: number, width: number, cells: { label: string; value: string }[], rowHeight: number) {
  const colWidth = width / cells.length;
  doc.lineWidth(0.75).strokeColor('#d0d0d0');
  doc.rect(x, y, width, rowHeight).stroke();
  for (let i = 1; i < cells.length; i++) {
    doc.moveTo(x + colWidth * i, y).lineTo(x + colWidth * i, y + rowHeight).stroke();
  }
  cells.forEach((cell, i) => {
    const cx = x + colWidth * i + 8;
    const cw = colWidth - 16;
    doc.fontSize(8).fillColor(DIM).font('Helvetica-Bold')
      .text(cell.label.toUpperCase(), cx, y + 6, { width: cw, characterSpacing: 0.3 });
    doc.fontSize(10).fillColor(DARK).font('Helvetica')
      .text(cell.value.trim() || '—', cx, y + 18, { width: cw, height: rowHeight - 24, ellipsis: true });
  });
}

/** Bouwt exact één pagina voor deze oefening — elk tekstblok krijgt een vaste
 * hoogte (met "…" bij overflow) zodat de lay-out altijd op precies één A4-
 * pagina past, ongeacht hoe lang de trainer de velden invulde. */
async function addExercisePage(doc: PDFKit.PDFDocument, ex: ExportExercise) {
  doc.addPage();
  addHeaderLogo(doc);
  const left = doc.page.margins.left;
  const cw = contentWidth(doc);
  let y = doc.page.margins.top;

  // Banner: "<FASE>: <naam>"
  const faseLabel = FASE_LABELS[ex.fase] ?? ex.fase.toUpperCase();
  const banner = `${faseLabel}: ${ex.naam || 'Oefening'}`;
  doc.rect(left, y, cw, 28).fill(RED);
  doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
    .text(banner, left + 10, y + 8, { width: cw - 20, height: 16, ellipsis: true });
  y += 28 + 12;

  // Organisatie oefening — 2x2-tabel (zelfde indeling als op het KFC-sjabloon).
  const orgRowH = 40;
  drawTableRow(doc, left, y, cw, [
    { label: 'Duur', value: `${ex.duurMinuten} min` },
    { label: 'Spelers', value: ex.organisatieSpelers },
  ], orgRowH);
  y += orgRowH;
  drawTableRow(doc, left, y, cw, [
    { label: 'Afmetingen', value: ex.organisatieAfmetingen },
    { label: 'Materiaal', value: ex.organisatieMateriaal },
  ], orgRowH);
  y += orgRowH + 12;

  // Beschrijving — vast begrensd blok.
  doc.fontSize(9).fillColor(DIM).font('Helvetica-Bold').text('BESCHRIJVING', left, y, { characterSpacing: 0.4 });
  y += 12;
  const beschrijvingH = 48;
  doc.fontSize(10).fillColor(DARK).font('Helvetica')
    .text(ex.beschrijving.trim() || '—', left, y, { width: cw, height: beschrijvingH, ellipsis: true });
  y += beschrijvingH + 12;

  // Tekening — krijgt de rest van de beschikbare hoogte tot aan de vaste
  // onderste tabel, zodat het geheel altijd exact op deze ene pagina past.
  const bottomRowH = 56;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const imgBoxH = pageBottom - bottomRowH - 12 - y;
  const imgBoxW = Math.min(320, cw);
  const imgX = left + (cw - imgBoxW) / 2;
  const scene = parseDrawingScene(ex.drawingData);
  const pngBuffer = await renderDrawingPng(scene);
  doc.image(pngBuffer, imgX, y, { fit: [imgBoxW, imgBoxH], align: 'center', valign: 'center' });
  y = pageBottom - bottomRowH;

  // Coaching / Maximaal actief / Fun — vaste onderste tabelrij.
  drawTableRow(doc, left, y, cw, [
    { label: 'Coaching', value: ex.coachingPunten },
    { label: 'Maximaal actief', value: ex.maximaalActief },
    { label: 'Fun', value: ex.fun },
  ], bottomRowH);
}

/** Titelpagina met het clublogo in een rode kopbalk (zelfde stijl als de
 * officiële KFC-documenten: rode banner met logo + clubnaam bovenaan, een
 * dunne rode balk onderaan), i.p.v. gewoon losse gecentreerde tekstregels. */
function addTitlePage(doc: PDFKit.PDFDocument, training: ExportTraining, dateLabel: string) {
  const pageW = doc.page.width;
  const cw = contentWidth(doc);
  const bannerH = 110;
  const footerH = 14;

  doc.rect(0, 0, pageW, bannerH).fill(RED);
  const logoH = 66;
  const logoW = LOGO_BUFFER ? logoH * LOGO_ASPECT : 0;
  if (LOGO_BUFFER) doc.image(LOGO_BUFFER, MARGIN, (bannerH - logoH) / 2, { width: logoW, height: logoH });
  const textX = MARGIN + (logoW ? logoW + 20 : 0);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(27).text('KFC LENNIK 4157', textX, 34, { characterSpacing: 0.5 });
  doc.font('Helvetica-Oblique').fontSize(13).text('Onze club, onze trots!', textX, 68);

  // Samenvattingsregel ("3 oefeningen · 90 min") — extra houvast, en vult de
  // ruimte tussen kop en balk zinvoller op dan enkel witruimte.
  const totalMin = training.exercises.reduce((a, e) => a + (e.duurMinuten || 0), 0);
  const summary = training.exercises.length > 0
    ? `${training.exercises.length} oefening${training.exercises.length === 1 ? '' : 'en'} · ${totalMin} min`
    : '';

  // Het hele inhoudsblok (balk + titel + samenvatting) verticaal centreren in
  // de ruimte tussen kopbanner en voetbalk, i.p.v. het bovenaan te proppen.
  const blockH = 30 + 44 + 30 + (training.jaarplanLabel ? 22 : 0) + (dateLabel ? 20 : 0) + (summary ? 26 : 0);
  let y = bannerH + (doc.page.height - footerH - bannerH - blockH) / 2;

  doc.rect(MARGIN, y, cw, 30).fill(RED);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(13)
    .text('TRAININGSVOORBEREIDING', MARGIN, y + 9, { width: cw, align: 'center', characterSpacing: 1.5 });
  y += 30 + 44;

  doc.font('Helvetica-Bold').fontSize(21).fillColor(DARK)
    .text(training.titel || 'Training', MARGIN, y, { width: cw, align: 'center' });
  y += 30;
  if (training.jaarplanLabel) {
    doc.font('Helvetica').fontSize(13).fillColor(RED).text(training.jaarplanLabel, MARGIN, y, { width: cw, align: 'center' });
    y += 22;
  }
  if (dateLabel) {
    const capitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    doc.font('Helvetica').fontSize(12).fillColor(DIM).text(capitalized, MARGIN, y, { width: cw, align: 'center' });
    y += 20;
  }
  if (summary) {
    y += 6;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DIM)
      .text(summary.toUpperCase(), MARGIN, y, { width: cw, align: 'center', characterSpacing: 1 });
  }

  doc.rect(0, doc.page.height - footerH, pageW, footerH).fill(RED);
}

export async function exportTrainingPdf(training: ExportTraining): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const dateLabel = training.date
    ? new Date(training.date).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  addTitlePage(doc, training, dateLabel);

  // ── Trainingsvoorbereiding / Leren / Actief-Fun-Individuele aandacht ──
  doc.addPage();
  addHeaderLogo(doc);
  sectionTitle(doc, 'Trainingsvoorbereiding');
  field(doc, 'Coach', training.coachNaam);
  field(doc, 'Datum', dateLabel);
  field(doc, 'Tijdstip', training.tijdstip);
  field(doc, 'Leeftijdscategorie', training.leeftijdscategorie);
  field(doc, 'Niveau', training.niveau);

  sectionTitle(doc, 'Leren');
  field(doc, 'Hoofdmoment', training.hoofdmoment);
  field(doc, 'Spelfase', training.spelfase);
  field(doc, 'Basisvaardigheid', training.basisvaardigheid);
  field(doc, 'Speluitdaging — Wie', training.speluitdagingWie);
  field(doc, 'Speluitdaging — Wat', training.speluitdagingWat);
  field(doc, 'Speluitdaging — Waar', training.speluitdagingWaar);
  field(doc, 'Speluitdaging — Wanneer', training.speluitdagingWanneer);
  field(doc, 'Coachingswoorden', training.coachingswoorden);
  field(doc, 'Materiaal', training.materiaal);

  sectionTitle(doc, 'Actief / Fun / Individuele aandacht');
  field(doc, 'Actief', training.actiefAanpak);
  field(doc, 'Fun', training.funAanpak);
  field(doc, 'Individuele aandacht', training.individueleAandacht);

  // ── Eén pagina per oefening ──
  for (const ex of training.exercises) await addExercisePage(doc, ex);

  // ── Evaluatie ──
  doc.addPage();
  addHeaderLogo(doc);
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold').text('EVALUATIE NA TRAINING', { align: 'center' });

  doc.addPage();
  addHeaderLogo(doc);
  sectionTitle(doc, 'Reflectie · 360° evaluatie');
  field(doc, 'Behouden', training.evalBehouden);
  field(doc, 'Wijzigen', training.evalWijzigen);
  field(doc, 'Waren ze actief?', training.evalWarenActief);
  field(doc, 'Hadden ze fun?', training.evalHaddenFun);
  field(doc, 'Bijgeleerd', training.evalBijgeleerd);
  field(doc, 'Individuele aandacht', training.evalIndividueleAandacht);

  doc.end();
  return bufferPromise;
}
