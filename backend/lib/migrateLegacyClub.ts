// Eenmalige migratie van de single-club-versie naar het Club-model.
//
// Vroeger stond de clubnaam ("KFC Lennik 4157") en het logo hardgecodeerd in de
// app, en had Team enkel een vrij tekstveld `club`. Nu hoort elke ploeg bij een
// Club-record. Bestaan er bij het opstarten nog géén clubs maar wél ploegen,
// dan is dit een bestaande (pre-Club) database: maak dan één club aan met de
// oorspronkelijke gegevens en hang alle ploegen zonder club eraan.
//
// Draait enkel zolang er nul clubs zijn — zodra er één club bestaat (ook een
// die een admin zelf aanmaakte) doet dit niets meer. Nieuwe klanten maak je aan
// als nieuwe Club in het admin-scherm, niet via deze migratie.

import path from 'path';
import fs from 'fs';

const LEGACY_CLUB_NAME = process.env.LEGACY_CLUB_NAME ?? 'KFC Lennik';
const LEGACY_CLUB_STAMNUMMER = process.env.LEGACY_CLUB_STAMNUMMER ?? '4157';
const LEGACY_LOGO_PATH = path.join(__dirname, '..', 'assets', 'images', 'logo-kfc-lennik.png');

export async function migrateLegacyClub(context: any): Promise<void> {
  const sudo = context.sudo();
  const clubCount = await sudo.db.Club.count();
  if (clubCount > 0) return;

  const orphanTeams = await sudo.db.Team.findMany({ where: { club: null } });
  if (orphanTeams.length === 0) return;

  let logo = '';
  try {
    if (fs.existsSync(LEGACY_LOGO_PATH)) {
      const buf = fs.readFileSync(LEGACY_LOGO_PATH);
      // Het bestand heet .png maar kan ook een JPEG zijn — kijk naar de inhoud.
      const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png';
      logo = `data:${mime};base64,` + buf.toString('base64');
    }
  } catch { /* logo is optioneel */ }

  await sudo.db.Club.createOne({
    data: {
      name: LEGACY_CLUB_NAME,
      stamnummer: LEGACY_CLUB_STAMNUMMER,
      logo,
      teams: { connect: orphanTeams.map((t: { id: string }) => ({ id: t.id })) },
    },
  });
  console.log(`[migrateLegacyClub] Club "${LEGACY_CLUB_NAME}" aangemaakt en gekoppeld aan ${orphanTeams.length} ploeg(en).`);
}
