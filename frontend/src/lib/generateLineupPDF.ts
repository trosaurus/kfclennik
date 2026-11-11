import { APP_NAME } from './brand';
import jsPDF from 'jspdf';
import { Match, PlayTimeSession, Attendance, Player, formatDuration } from './api';
import { FieldPos, getPositionsForCategory, getFormatForCategory, FORMAT_LABEL } from './teamConfig';

interface QuarterData {
  periodNumber: number;
  assignment: Record<string, Player | null>;
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
  /** Clubnaam + stamnummer voor de kop (bv. "KFC Lennik 4157"); leeg → appnaam. */
  clubTitle?: string;
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  red:      [180, 20,  20 ] as [number,number,number],
  redDark:  [130, 10,  10 ] as [number,number,number],
  white:    [255, 255, 255] as [number,number,number],
  black:    [25,  25,  25 ] as [number,number,number],
  gray:     [120, 120, 120] as [number,number,number],
  grayLt:   [200, 200, 200] as [number,number,number],
  green:    [42,  120, 42 ] as [number,number,number],
  greenDk:  [32,  95,  32 ] as [number,number,number],
  keeperBg: [28,  28,  36 ] as [number,number,number],
  yellow:   [255, 210, 40 ] as [number,number,number],
  bg:       [245, 245, 248] as [number,number,number],
};

export function generateLineupPDF(input: LineupPDFInput): void {
  const clubTitle = input.clubTitle?.trim() || APP_NAME;
  const { match, category, teamName, quarters, allPlayers } = input;
  const positions: FieldPos[] = getPositionsForCategory(category);
  const format = getFormatForCategory(category);
  const formatLabel = FORMAT_LABEL[format];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210; // page width mm
  const PH = 297; // page height mm
  const M  = 12;  // margin

  // ── Helpers ────────────────────────────────────────────────────────────────

  function rgb(c: [number,number,number]) { return c; }

  function drawPageFrame(quarter: QuarterData, pageNum: number, totalPages: number) {
    // Top red bar
    doc.setFillColor(...C.red);
    doc.rect(0, 0, PW, 4, 'F');

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...C.black);
    doc.text(clubTitle.toUpperCase(), M, 14);

    doc.setFontSize(10);
    doc.setTextColor(...C.gray);
    doc.text(`${teamName}  ·  ${category} (${formatLabel})`, M, 20);

    // Match info
    doc.setFontSize(13);
    doc.setTextColor(...C.black);
    doc.text(`vs. ${match.opponent}`, M, 27);

    doc.setFontSize(9);
    doc.setTextColor(...C.gray);
    try {
      const d = new Date(match.date).toLocaleDateString('nl-BE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      doc.text(`${d}  ·  ${match.location === 'home' ? 'Thuis' : 'Uit'}`, M, 33);
    } catch { /**/ }

    // Quarter badge (right side)
    doc.setFillColor(...C.red);
    doc.roundedRect(PW - M - 36, 6, 36, 20, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    doc.text('KWART', PW - M - 18, 13, { align: 'center' });
    doc.setFontSize(22);
    doc.text(String(quarter.periodNumber), PW - M - 18, 23, { align: 'center' });

    // Score for this quarter
    doc.setFontSize(26);
    doc.setTextColor(...C.red);
    doc.text(`${quarter.scoreHome} – ${quarter.scoreAway}`, PW - M, 13, { align: 'right' });
    doc.setFontSize(9);
    doc.setTextColor(...C.gray);
    doc.text('score dit kwart', PW - M, 19, { align: 'right' });

    // Divider line
    doc.setDrawColor(...C.grayLt);
    doc.setLineWidth(0.3);
    doc.line(M, 37, PW - M, 37);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`${clubTitle}  ·  Pagina ${pageNum}/${totalPages}`, PW / 2, PH - 5, { align: 'center' });
  }

  // ── Draw the SVG-like field ────────────────────────────────────────────────
  function drawField(x: number, y: number, fw: number, fh: number, quarter: QuarterData) {
    // Grass
    doc.setFillColor(...C.green);
    doc.roundedRect(x, y, fw, fh, 2, 2, 'F');

    // Alternating stripes
    const sw = fw / 6;
    for (let i = 0; i < 6; i++) {
      if (i % 2 === 0) {
        doc.setFillColor(...C.greenDk);
        const sx = x + i * sw;
        // clip to field bounds
        doc.rect(sx, y, sw, fh, 'F');
      }
    }

    // Field lines
    const pad = 2.5;
    doc.setDrawColor(...C.white);
    doc.setLineWidth(0.5);

    // Outer boundary
    doc.rect(x + pad, y + pad, fw - pad*2, fh - pad*2);

    // Center line
    doc.line(x + pad, y + fh/2, x + fw - pad, y + fh/2);

    // Center circle
    const cr = Math.min(fw, fh) * 0.08;
    doc.circle(x + fw/2, y + fh/2, cr);
    doc.setFillColor(...C.white);
    doc.circle(x + fw/2, y + fh/2, 0.8, 'F');

    // Penalty areas
    const paW = fw * 0.52;
    const paH = fh * 0.16;
    doc.setLineWidth(0.4);
    doc.rect(x + (fw - paW)/2, y + pad, paW, paH);         // top
    doc.rect(x + (fw - paW)/2, y + fh - pad - paH, paW, paH); // bottom

    // Goals
    const gW = fw * 0.22;
    const gH = 3;
    doc.setLineWidth(0.7);
    doc.rect(x + (fw - gW)/2, y + pad - gH, gW, gH);
    doc.rect(x + (fw - gW)/2, y + fh - pad, gW, gH);
    doc.setLineWidth(0.4);

    // ── Position slots ─────────────────────────────────────────────────────
    for (const pos of positions) {
      const cx = x + (pos.x / 100) * fw;
      const cy = y + (pos.y / 100) * fh;
      const player = quarter.assignment[pos.key];
      const r = player ? 9 : 6;  // bigger discs

      if (player) {
        const isKeeper = pos.role === 'keeper';

        // Shadow for depth
        doc.setFillColor(0, 0, 0);
        doc.circle(cx + 0.6, cy + 0.6, r, 'F');

        // Disc fill
        doc.setFillColor(...(isKeeper ? C.keeperBg : C.red));
        doc.circle(cx, cy, r, 'F');

        // White border
        doc.setDrawColor(...C.white);
        doc.setLineWidth(0.8);
        doc.circle(cx, cy, r);

        // Player number — large, centered in disc
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...C.white);
        const numStr = player.number !== null ? String(player.number) : pos.key;
        doc.text(numStr, cx, cy + 2, { align: 'center' });

        // Name tag below disc — white pill with dark text
        const nameStr = player.name.length > 13
          ? player.name.split(' ').slice(-1)[0].substring(0, 12)
          : player.name;
        doc.setFontSize(8);
        const nameW = doc.getTextWidth(nameStr) + 3;
        // White pill background
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx - nameW / 2, cy + r + 0.5, nameW, 5, 1, 1, 'F');
        // Dark text on white
        doc.setTextColor(...C.black);
        doc.setFont('helvetica', 'bold');
        doc.text(nameStr, cx, cy + r + 4.2, { align: 'center' });
      } else {
        // Empty slot — dashed circle
        doc.setFillColor(0, 0, 0);
        doc.circle(cx, cy, r, 'F');
        doc.setDrawColor(...C.white);
        doc.setLineWidth(0.5);
        doc.circle(cx, cy, r);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...C.white);
        doc.text(pos.key, cx, cy + 2, { align: 'center' });
      }
    }
  }

  // ── Draw player list table ─────────────────────────────────────────────────
  function drawPlayerTable(x: number, y: number, w: number, quarter: QuarterData): number {
    const POSITION_LABELS: Record<string, string> = {
      keeper: 'DM', defender: 'VD', midfielder: 'MV', forward: 'AV',
    };

    const rows = Object.entries(quarter.assignment)
      .filter(([, p]) => p !== null)
      .sort(([ka], [kb]) => {
        const ia = positions.findIndex(p => p.key === ka);
        const ib = positions.findIndex(p => p.key === kb);
        return ia - ib;
      }) as [string, Player][];

    if (rows.length === 0) return y;

    const rowH = 6.5;
    let curY = y;

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.gray);
    doc.text('SPELERS IN OPSTELLING', x, curY);
    curY += 5;

    // Header row
    doc.setFillColor(238, 238, 242);
    doc.rect(x, curY - 4, w, rowH, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text('POS', x + 3, curY);
    doc.text('#', x + 12, curY);
    doc.text('NAAM', x + 21, curY);
    curY += rowH;

    doc.setDrawColor(...C.grayLt);
    doc.setLineWidth(0.2);
    doc.line(x, curY - 4.5, x + w, curY - 4.5);

    // Data rows
    doc.setFontSize(8.5);
    for (let i = 0; i < rows.length; i++) {
      const [posKey, player] = rows[i];
      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 251);
        doc.rect(x, curY - 4, w, rowH, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.red);
      doc.text(posKey, x + 5, curY, { align: 'center' });

      doc.setTextColor(...C.gray);
      doc.text(player.number ? `#${player.number}` : '—', x + 14, curY, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.black);
      doc.text(player.name.substring(0, 28), x + 21, curY);

      if (player.position) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        doc.text(POSITION_LABELS[player.position] ?? '', x + w - 2, curY, { align: 'right' });
        doc.setFontSize(8.5);
      }

      curY += rowH;
    }

    return curY;
  }

  // ── Build pages: 1 quarter per page ────────────────────────────────────────

  // Count total pages: 4 quarter pages + 1 summary page
  const totalPages = quarters.length + 1;

  for (let qi = 0; qi < quarters.length; qi++) {
    if (qi > 0) doc.addPage();
    const quarter = quarters[qi];

    drawPageFrame(quarter, qi + 1, totalPages);

    // Field dimensions — large, centered
    const fieldTop  = 42;
    const fieldBot  = PH - 55;          // leave room for player list below
    const fh = fieldBot - fieldTop;
    const fw = Math.min(fh * 0.77, PW - M * 2 - 70); // aspect ratio ~0.77 (portrait field)
    const fx = M + (PW - M * 2 - 70 - fw) / 2;       // center in left portion

    drawField(fx, fieldTop, fw, fh, quarter);

    // Player list — to the right of the field
    const listX = fx + fw + 8;
    const listW = PW - M - listX;
    drawPlayerTable(listX, fieldTop + 2, listW, quarter);

    // Quarter totals strip at the bottom
    const stripY = fieldBot + 6;
    doc.setFillColor(...C.red);
    doc.roundedRect(M, stripY, PW - M * 2, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    doc.text(`Kwart ${quarter.periodNumber}  ·  Score: ${quarter.scoreHome} – ${quarter.scoreAway}`, PW / 2, stripY + 6.5, { align: 'center' });
  }

  // ── Summary page ───────────────────────────────────────────────────────────
  doc.addPage();

  // Header
  doc.setFillColor(...C.red);
  doc.rect(0, 0, PW, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...C.black);
  doc.text('SPEELTIJDEN OVERZICHT', M, 14);
  doc.setFontSize(9);
  doc.setTextColor(...C.gray);
  doc.text(`${teamName}  ·  vs. ${match.opponent}  ·  ${category}`, M, 20);

  // Total score
  const totalHome = quarters.reduce((s, q) => s + q.scoreHome, 0);
  const totalAway = quarters.reduce((s, q) => s + q.scoreAway, 0);
  doc.setFontSize(22);
  doc.setTextColor(...C.red);
  doc.text(`${totalHome} – ${totalAway}`, PW - M, 14, { align: 'right' });

  // Per-quarter scores strip
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  const qStr = quarters.map(q => `K${q.periodNumber}: ${q.scoreHome}-${q.scoreAway}`).join('   ');
  doc.text(qStr, PW - M, 21, { align: 'right' });

  doc.setDrawColor(...C.grayLt);
  doc.setLineWidth(0.3);
  doc.line(M, 25, PW - M, 25);

  // Player table
  let tblY = 31;
  const POSITION_LABELS: Record<string, string> = { keeper: 'DM', defender: 'VD', midfielder: 'MV', forward: 'AV' };
  const colW = { num: 10, name: 48, pos: 12, q: 18, total: 22 };
  const rowH = 6;

  // Table header
  doc.setFillColor(238, 238, 242);
  doc.rect(M, tblY - 4, PW - M * 2, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  let cx = M;
  doc.text('#',       cx + 2, tblY); cx += colW.num;
  doc.text('SPELER',  cx, tblY);     cx += colW.name;
  doc.text('POS',     cx, tblY);     cx += colW.pos;
  quarters.forEach(q => { doc.text(`K${q.periodNumber}`, cx, tblY); cx += colW.q; });
  doc.text('TOTAAL',  cx, tblY);
  tblY += rowH;

  doc.setDrawColor(...C.grayLt);
  doc.setLineWidth(0.2);
  doc.line(M, tblY - 4.5, PW - M, tblY - 4.5);

  const playerRows = allPlayers.map(p => {
    const att = input.attendances.find(a => a.player.id === p.id);
    if (!att) return null;
    const qSecs = quarters.map(q =>
      input.sessions
        .filter(s => s.attendance.id === att.id && s.period === q.periodNumber)
        .reduce((acc, s) => acc + (s.durationSeconds || 0), 0)
    );
    const total = qSecs.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return { player: p, qSecs, total };
  }).filter(Boolean) as Array<{ player: Player; qSecs: number[]; total: number }>;

  playerRows.sort((a, b) => b.total - a.total);

  doc.setFontSize(8);
  for (let i = 0; i < playerRows.length; i++) {
    if (tblY > PH - 15) { doc.addPage(); tblY = 14; }
    const row = playerRows[i];

    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 251);
      doc.rect(M, tblY - 4, PW - M * 2, rowH, 'F');
    }

    cx = M;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.red);
    doc.text(row.player.number ? `#${row.player.number}` : '—', cx + 2, tblY); cx += colW.num;

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.black);
    doc.text(row.player.name.substring(0, 24), cx, tblY); cx += colW.name;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text(POSITION_LABELS[row.player.position ?? ''] ?? '—', cx, tblY); cx += colW.pos;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    for (const sec of row.qSecs) {
      doc.setTextColor(sec > 0 ? C.black[0] : 180, sec > 0 ? C.black[1] : 180, sec > 0 ? C.black[2] : 180);
      doc.text(sec > 0 ? formatDuration(sec) : '—', cx, tblY); cx += colW.q;
    }

    doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.red);
    doc.text(formatDuration(row.total), cx, tblY);

    tblY += rowH;
  }

  // Footer on every page
  const np = doc.getNumberOfPages();
  for (let i = 1; i <= np; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`${clubTitle}  ·  ${APP_NAME}  ·  Pagina ${i}/${np}`, PW / 2, PH - 5, { align: 'center' });
  }

  // Save
  const dateSlug = (() => { try { return new Date(match.date).toISOString().slice(0, 10); } catch { return 'match'; } })();
  doc.save(`Opstelling_${match.opponent.replace(/\s+/g, '_')}_${dateSlug}.pdf`);
}
