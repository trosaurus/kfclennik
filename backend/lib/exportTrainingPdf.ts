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

/** Clublogo (per club ingesteld als data-URL in de database), gedecodeerd per
 * export en expliciet doorgegeven — geen module-globale toestand, want
 * meerdere exports van verschillende clubs kunnen tegelijk lopen. */
type Logo = { buffer: Buffer; aspect: number } | null;

function decodeLogo(dataUrl: string | undefined): Logo {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    // openImage() valideert het bestand en geeft de afmetingen.
    const img = (new PDFDocument() as any).openImage(buffer);
    return { buffer, aspect: img.width / img.height };
  } catch {
    return null;
  }
}

/** Klein clublogo linksboven op elke pagina — puur decoratief, staat los van
 * de tekst-flow (vaste positie) zodat de strakke een-pagina-per-oefening
 * budgettering in addExercisePage() er niet door verschuift. */
function addHeaderLogo(doc: PDFKit.PDFDocument, logo: Logo) {
  if (!logo) return;
  const h = 24, w = h * logo.aspect;
  doc.image(logo.buffer, doc.page.margins.left, 14, { width: w, height: h });
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
 * per cel. De aanroeper bepaalt rowHeight — geef die ruim genoeg (bv. via
 * heightOfString) mee als de tekst nooit afgekapt mag worden; bij een krappe
 * vaste hoogte (zoals de bovenste organisatie-tabel) knipt "…" wél nog af. */
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

/** Bouwt de pagina('s) voor deze oefening. Beschrijving en Coaching/Maximaal
 * actief/Fun tonen altijd de VOLLEDIGE tekst (geen "…"-afkapping meer) — hun
 * hoogte wordt vooraf gemeten (heightOfString) en de tekening krijgt wat
 * daarna overblijft. Dit past meestal nog op één pagina, maar bij een erg
 * lange tekst verhuist de tekening + onderste rij bewust mee naar een nieuwe
 * pagina i.p.v. tekst te laten verdwijnen. */
async function addExercisePage(doc: PDFKit.PDFDocument, ex: ExportExercise, logo: Logo) {
  doc.addPage();
  addHeaderLogo(doc, logo);
  const left = doc.page.margins.left;
  const cw = contentWidth(doc);
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
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

  // Beschrijving — volledige tekst, hoogte volgt de effectieve inhoud.
  const beschrijvingText = ex.beschrijving.trim() || '—';
  doc.fontSize(9).fillColor(DIM).font('Helvetica-Bold').text('BESCHRIJVING', left, y, { characterSpacing: 0.4 });
  y += 12;
  doc.fontSize(10).font('Helvetica');
  const beschrijvingH = doc.heightOfString(beschrijvingText, { width: cw });
  // Past de beschrijving zelf al niet meer op deze pagina: eerst een nieuwe
  // pagina beginnen i.p.v. ze halverwege af te snijden.
  if (y + beschrijvingH > pageBottom()) {
    doc.addPage();
    addHeaderLogo(doc, logo);
    y = doc.page.margins.top;
  }
  doc.fillColor(DARK).text(beschrijvingText, left, y, { width: cw });
  y += beschrijvingH + 14;

  // Coaching / Maximaal actief / Fun — rijhoogte volgt de langste van de drie
  // kolommen, zodat ook hier nooit tekst wordt afgekapt.
  const bottomCells = [
    { label: 'Coaching', value: ex.coachingPunten.trim() || '—' },
    { label: 'Maximaal actief', value: ex.maximaalActief.trim() || '—' },
    { label: 'Fun', value: ex.fun.trim() || '—' },
  ];
  const bottomColW = cw / bottomCells.length - 16;
  doc.fontSize(10).font('Helvetica');
  const bottomTextH = Math.max(...bottomCells.map(c => doc.heightOfString(c.value, { width: bottomColW })));
  // +4pt marge t.o.v. de gemeten hoogte, tegen afrondingsverschillen tussen
  // heightOfString() en de effectieve rendering (anders net-net afgekapt).
  const bottomRowH = 24 + bottomTextH + 4;

  // Tekening — krijgt de resterende ruimte tot aan de onderste rij. Is die
  // ruimte te krap, dan verhuizen tekening + onderste rij samen naar een
  // nieuwe pagina i.p.v. de tekening onbruikbaar klein te maken.
  const MIN_IMG_H = 140;
  let imgBoxH = pageBottom() - bottomRowH - 12 - y;
  if (imgBoxH < MIN_IMG_H) {
    doc.addPage();
    addHeaderLogo(doc, logo);
    y = doc.page.margins.top;
    imgBoxH = pageBottom() - bottomRowH - 12 - y;
  }
  const imgBoxW = Math.min(320, cw);
  const imgX = left + (cw - imgBoxW) / 2;
  const scene = parseDrawingScene(ex.drawingData);
  const pngBuffer = await renderDrawingPng(scene);
  doc.image(pngBuffer, imgX, y, { fit: [imgBoxW, imgBoxH], align: 'center', valign: 'center' });
  y += imgBoxH + 12;

  drawTableRow(doc, left, y, cw, bottomCells, bottomRowH);
}

/** Titelpagina met het clublogo in een rode kopbalk (zelfde stijl als de
 * officiële KFC-documenten: rode banner met logo + clubnaam bovenaan, een
 * dunne rode balk onderaan), i.p.v. gewoon losse gecentreerde tekstregels. */
function addTitlePage(doc: PDFKit.PDFDocument, training: ExportTraining, dateLabel: string, logo: Logo) {
  const pageW = doc.page.width;
  const cw = contentWidth(doc);
  const bannerH = 110;
  const footerH = 14;

  doc.rect(0, 0, pageW, bannerH).fill(RED);
  const logoH = 66;
  const logoW = logo ? logoH * logo.aspect : 0;
  if (logo) doc.image(logo.buffer, MARGIN, (bannerH - logoH) / 2, { width: logoW, height: logoH });
  const textX = MARGIN + (logoW ? logoW + 20 : 0);
  const clubTitle = training.club?.name
    ? [training.club.name, training.club.stamnummer].filter(Boolean).join(' ').toUpperCase()
    : 'VOETBALTRAINING.APP';
  doc.fillColor('white').font('Helvetica-Bold').fontSize(27).text(clubTitle, textX, 34, { characterSpacing: 0.5, width: doc.page.width - textX - MARGIN, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Oblique').fontSize(13).text(training.club?.name ? 'Onze club, onze trots!' : 'Trainen, coachen, speeltijd eerlijk verdelen.', textX, 68);

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

  const logo = decodeLogo(training.club?.logo);
  addTitlePage(doc, training, dateLabel, logo);

  // ── Trainingsvoorbereiding / Leren / Actief-Fun-Individuele aandacht ──
  doc.addPage();
  addHeaderLogo(doc, logo);
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
  for (const ex of training.exercises) await addExercisePage(doc, ex, logo);

  // ── Evaluatie ──
  doc.addPage();
  addHeaderLogo(doc, logo);
  doc.fontSize(20).fillColor(RED).font('Helvetica-Bold').text('EVALUATIE NA TRAINING', { align: 'center' });

  doc.addPage();
  addHeaderLogo(doc, logo);
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
