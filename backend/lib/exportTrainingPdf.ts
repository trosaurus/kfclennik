// Genereert een eenvoudig, zelfstandig PDF-verslag van een Training + Exercises
// (geen sjabloonbestand nodig, in tegenstelling tot de PowerPoint-export) —
// handig om snel te delen/printen zonder PowerPoint. Hergebruikt dezelfde
// tekening-rasterisatie (parseDrawingScene + renderDrawingPng) als de
// PowerPoint-export, en dezelfde ExportTraining/ExportExercise data-vorm.

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

export async function exportTrainingPdf(training: ExportTraining): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const dateLabel = training.date ? new Date(training.date).toLocaleDateString('nl-BE') : '';

  // ── Titelpagina ──
  doc.fontSize(24).fillColor(RED).font('Helvetica-Bold').text('KFC Lennik 4157', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor(DARK).font('Helvetica').text(
    [dateLabel, training.titel, training.jaarplanLabel].filter(Boolean).join(' · ') || 'Trainingsvoorbereiding',
    { align: 'center' }
  );

  // ── Trainingsvoorbereiding / Leren / Actief-Fun-Individuele aandacht ──
  doc.addPage();
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
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold').text('EVALUATIE NA TRAINING', { align: 'center' });

  doc.addPage();
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
