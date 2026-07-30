// Trainersmanual-upload per ploeg (PDF). Zelfde aanpak als exportTrainingPptx:
// binair verkeer via base64 over GraphQL, hier in omgekeerde richting (upload
// i.p.v. download). Bestand wordt op lokale schijf bewaard; de tekst wordt er
// bij upload uit geëxtraheerd en in Team.manualText opgeslagen zodat de
// oefeningen-generator er lokaal doorheen kan zoeken (geen AI-oproep).

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'manuals');
const MAX_BASE64_LENGTH = 28_000_000; // ~20MB gedecodeerd

// teamId is een Keystone cuid (lowercase alfanumeriek) — expliciet valideren
// voorkomt dat een pad met "../" buiten UPLOAD_DIR terechtkomt.
const CUID_RE = /^[a-z0-9]+$/i;

function manualPath(teamId: string): string {
  if (!CUID_RE.test(teamId)) throw new Error('Ongeldig teamId.');
  return path.join(UPLOAD_DIR, `${teamId}.pdf`);
}

export async function saveTeamManual(
  teamId: string, base64Content: string
): Promise<{ text: string; uploadedAt: Date }> {
  if (base64Content.length > MAX_BASE64_LENGTH) {
    throw new Error('Bestand is te groot (max. ~20MB)');
  }
  const buffer = Buffer.from(base64Content, 'base64');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(manualPath(teamId), buffer);

  const parsed = await pdfParse(buffer);
  return { text: parsed.text ?? '', uploadedAt: new Date() };
}

export function deleteTeamManual(teamId: string): void {
  try { fs.unlinkSync(manualPath(teamId)); } catch { /* bestand bestond al niet — prima */ }
}
