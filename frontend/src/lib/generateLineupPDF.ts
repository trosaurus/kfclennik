import jsPDF from 'jspdf';
import { Player, Match, PlayTimeSession, Attendance, formatDuration } from './api';
import { FieldPos, getPositionsForCategory, getFormatForCategory, FORMAT_LABEL } from './teamConfig';

interface QuarterData {
  periodNumber: number;
  // posKey → player
  assignment: Record<string, Player | null>;
  // posKey → seconds played this period
  periodSeconds: Record<string, number>;
  scoreHome: number;
  scoreAway: number;
}

interface LineupPDFInput {
  match: Match;
  category: string;
  teamName: string;
  quarters: QuarterData[];
  allPlayers: Player[];
  sessions: PlayTimeSession[];
  attendances: Attendance[];
}

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN: [number,number,number]     = [42, 120, 42];
const GREEN_D   = [32, 95, 32];
const RED       = [180, 20, 20];
const RED_D     = [140, 15, 15];
const WHITE     = [255, 255, 255];
const BLACK     = [30, 30, 30];
const GRAY      = [120, 120, 120];
const KEEPER_BG = [30, 30, 40];
const YELLOW    = [255, 210, 40];

export function generateLineupPDF(input: LineupPDFInput): void {
  const { match, category, teamName, quarters, allPlayers } = input;
  const positions = getPositionsForCategory(category);
  const format = getFormatForCategory(category);
  const formatLabel = FORMAT_LABEL[format];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;

  // ── Page 1 header ─────────────────────────────────────────────────────────
  function drawHeader() {
    // Red accent bar
    doc.setFillColor(RED[0], RED[1], RED[2]);
    doc.rect(0, 0, pageW, 3, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.text('KFC LENNIK 4157', margin, 14);

    // Match info
    doc.setFontSize(11);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(`${teamName}  •  ${category}  •  ${formatLabel}`, margin, 20);

    doc.setFontSize(14);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    const dateStr = (() => {
      try {
        return new Date(match.date).toLocaleDateString('nl-BE', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
      } catch { return match.date; }
    })();
    doc.text(`vs. ${match.opponent}`, margin, 28);

    doc.setFontSize(10);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(`${dateStr}  •  ${match.location === 'home' ? 'Thuis' : 'Uit'}`, margin, 34);

    // Score
    const totalHome = quarters.reduce((s, q) => s + q.scoreHome, 0);
    const totalAway = quarters.reduce((s, q) => s + q.scoreAway, 0);
    doc.setFontSize(20);
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(`${totalHome} – ${totalAway}`, pageW - margin, 16, { align: 'right' });

    // Score per quarter
    doc.setFontSize(8);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    const qScores = quarters.map(q => `K${q.periodNumber}: ${q.scoreHome}-${q.scoreAway}`).join('   ');
    doc.text(qScores, pageW - margin, 23, { align: 'right' });

    return 38; // y position after header
  }

  // ── Draw a single field with positions ────────────────────────────────────
  function drawField(
    x: number, y: number, w: number, h: number,
    quarter: QuarterData,
  ) {
    // Quarter label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.text(`KWART ${quarter.periodNumber}`, x, y - 2);

    doc.setFontSize(9);
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(`${quarter.scoreHome} – ${quarter.scoreAway}`, x + w, y - 2, { align: 'right' });

    // Grass background
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');

    // Alternate grass stripes
    const stripeW = w / 6;
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        doc.setFillColor(GREEN_D[0], GREEN_D[1], GREEN_D[2]);
        doc.rect(x + i * stripeW, y, stripeW, h, 'F');
      }
    }

    // Field lines
    const pad = 2;
    const lw = 0.4;
    doc.setDrawColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.setLineWidth(lw);

    // Outer boundary
    doc.rect(x + pad, y + pad, w - pad * 2, h - pad * 2);

    // Center line
    doc.line(x + pad, y + h / 2, x + w - pad, y + h / 2);

    // Center circle
    const cr = Math.min(w, h) * 0.08;
    doc.circle(x + w / 2, y + h / 2, cr);
    doc.circle(x + w / 2, y + h / 2, 0.6, 'F');

    // Penalty areas
    const paW = w * 0.5;
    const paH = h * 0.17;
    // Top
    doc.rect(x + (w - paW) / 2, y + pad, paW, paH);
    // Bottom
    doc.rect(x + (w - paW) / 2, y + h - pad - paH, paW, paH);

    // Goals
    const gW = w * 0.2;
    const gH = 2.5;
    doc.setLineWidth(0.6);
    doc.rect(x + (w - gW) / 2, y + pad - gH, gW, gH);
    doc.rect(x + (w - gW) / 2, y + h - pad, gW, gH);
    doc.setLineWidth(lw);

    // ── Position slots ─────────────────────────────────────────────────────
    for (const pos of positions) {
      const cx = x + (pos.x / 100) * w;
      const cy = y + (pos.y / 100) * h;
      const player = quarter.assignment[pos.key];
      const r = player ? 4.5 : 3;

      if (player) {
        // Filled disc with role color
        const isKeeper = pos.role === 'keeper';
        doc.setFillColor(...(isKeeper ? KEEPER_BG : RED) as [number,number,number]);
        doc.circle(cx, cy, r, 'F');

        // White outline
        doc.setDrawColor(WHITE[0], WHITE[1], WHITE[2]);
        doc.setLineWidth(0.4);
        doc.circle(cx, cy, r);

        // Player number
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
        const numStr = player.number !== null ? String(player.number) : pos.key;
        doc.text(numStr, cx, cy - 0.5, { align: 'center' });

        // Player name (below disc)
        doc.setFontSize(5.5);
        doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
        const nameStr = player.name.length > 12
          ? player.name.split(' ').slice(-1)[0].substring(0, 10)
          : player.name;
        doc.text(nameStr, cx, cy + 3.5, { align: 'center' });
      } else {
        // Empty slot
        doc.setFillColor(180, 180, 180);
        doc.circle(cx, cy, r, 'F');

        doc.setDrawColor(WHITE[0], WHITE[1], WHITE[2]);
        doc.setLineWidth(0.3);
        doc.circle(cx, cy, r);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(pos.key, cx, cy + 1, { align: 'center' });
      }
    }
  }

  // ── Draw player list next to/below a field ────────────────────────────────
  function drawPlayerList(
    x: number, y: number, w: number,
    quarter: QuarterData,
  ): number {
    const assigned = Object.entries(quarter.assignment)
      .filter(([_, p]) => p !== null)
      .sort(([ka], [kb]) => {
        const posA = positions.findIndex(p => p.key === ka);
        const posB = positions.findIndex(p => p.key === kb);
        return posA - posB;
      }) as [string, Player][];

    if (assigned.length === 0) return y;

    const lineH = 5;
    let curY = y;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text('POS', x, curY);
    doc.text('#', x + 10, curY);
    doc.text('SPELER', x + 18, curY);
    curY += lineH;

    // Separator
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(x, curY - 3.5, x + w, curY - 3.5);

    // Rows
    doc.setFontSize(8);
    for (const [posKey, player] of assigned) {
      // Position key
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.text(posKey, x + 4, curY, { align: 'center' });

      // Player number
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text(player.number ? `#${player.number}` : '—', x + 13, curY, { align: 'center' });

      // Player name
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      doc.text(player.name, x + 18, curY);

      curY += lineH;
    }

    return curY;
  }

  // ── Build pages ────────────────────────────────────────────────────────────
  // Layout: 2 quarters per page, side by side
  let startY = drawHeader();
  const fieldW = (pageW - margin * 3) / 2;
  const fieldH = fieldW * 1.25;           // aspect ratio ~4:5
  const listOffsetY = 4;

  for (let page = 0; page < 2; page++) {
    if (page > 0) {
      doc.addPage();
      // Mini header on page 2
      doc.setFillColor(RED[0], RED[1], RED[2]);
      doc.rect(0, 0, pageW, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text(`KFC Lennik vs. ${match.opponent}  •  ${category}`, margin, 9);
      startY = 14;
    }

    for (let col = 0; col < 2; col++) {
      const qIdx = page * 2 + col;
      if (qIdx >= quarters.length) break;
      const quarter = quarters[qIdx];
      const colX = margin + col * (fieldW + margin);

      drawField(colX, startY, fieldW, fieldH, quarter);

      const listY = startY + fieldH + listOffsetY;
      drawPlayerList(colX, listY, fieldW, quarter);
    }
  }

  // ── Summary page: all players × all quarters ──────────────────────────────
  doc.addPage();

  // Header
  doc.setFillColor(RED[0], RED[1], RED[2]);
  doc.rect(0, 0, pageW, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.text('SPEELTIJDEN OVERZICHT', margin, 12);

  doc.setFontSize(9);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(`${teamName}  •  vs. ${match.opponent}  •  ${category}`, margin, 18);

  let tblY = 24;
  const colWidths = {
    num: 10, name: 45, pos: 12,
    q1: 18, q2: 18, q3: 18, q4: 18,
    total: 22,
  };
  const tblX = margin;
  const rowH = 6;

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(tblX, tblY - 4, pageW - margin * 2, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);

  let cx = tblX;
  doc.text('#', cx + 2, tblY);    cx += colWidths.num;
  doc.text('SPELER', cx, tblY);   cx += colWidths.name;
  doc.text('POS', cx, tblY);      cx += colWidths.pos;
  doc.text('KWART 1', cx, tblY);  cx += colWidths.q1;
  doc.text('KWART 2', cx, tblY);  cx += colWidths.q2;
  doc.text('KWART 3', cx, tblY);  cx += colWidths.q3;
  doc.text('KWART 4', cx, tblY);  cx += colWidths.q4;
  doc.text('TOTAAL', cx, tblY);

  tblY += rowH;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(tblX, tblY - 4, pageW - margin, tblY - 4);

  // Rows: all players who played at least 1 quarter
  const POSITION_LABELS: Record<string, string> = {
    keeper: 'DM', defender: 'VD', midfielder: 'MV', forward: 'AV',
  };

  const playerTotals = allPlayers.map(p => {
    const att = input.attendances.find(a => a.player.id === p.id);
    if (!att) return null;
    const periodSecs: number[] = [0, 0, 0, 0];
    for (let q = 0; q < 4; q++) {
      periodSecs[q] = input.sessions
        .filter(s => s.attendance.id === att.id && s.period === q + 1)
        .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    }
    const total = periodSecs.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return { player: p, periodSecs, total };
  }).filter(Boolean) as Array<{ player: Player; periodSecs: number[]; total: number }>;

  playerTotals.sort((a, b) => b.total - a.total);

  doc.setFontSize(8);
  for (const row of playerTotals) {
    if (tblY > pageH - 15) {
      doc.addPage();
      tblY = 12;
    }

    // Alternate row background
    if (playerTotals.indexOf(row) % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(tblX, tblY - 4, pageW - margin * 2, rowH, 'F');
    }

    cx = tblX;

    // Number
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(row.player.number ? `#${row.player.number}` : '—', cx + 2, tblY);
    cx += colWidths.num;

    // Name
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.text(row.player.name.substring(0, 22), cx, tblY);
    cx += colWidths.name;

    // Position
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(POSITION_LABELS[row.player.position ?? ''] ?? '—', cx, tblY);
    cx += colWidths.pos;

    // Per quarter
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (let q = 0; q < 4; q++) {
      doc.setTextColor(row.periodSecs[q] > 0 ? BLACK[0] : 180, row.periodSecs[q] > 0 ? BLACK[1] : 180, row.periodSecs[q] > 0 ? BLACK[2] : 180);
      doc.text(row.periodSecs[q] > 0 ? formatDuration(row.periodSecs[q]) : '—', cx, tblY);
      cx += colWidths.q1;
    }

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(formatDuration(row.total), cx, tblY);

    tblY += rowH;
  }

  // ── Footer on each page ────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(`KFC Lennik 4157  •  Pagina ${i}/${totalPages}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  // ── Download ───────────────────────────────────────────────────────────────
  const dateSlug = (() => {
    try { return new Date(match.date).toISOString().slice(0, 10); }
    catch { return 'match'; }
  })();
  doc.save(`Opstelling_${match.opponent.replace(/\s+/g, '_')}_${dateSlug}.pdf`);
}
