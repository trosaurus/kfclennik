// ── Trainingsschema — vaste combinaties opwarming → tussenvorm → wedstrijdvorm,
// gegroepeerd per teamprincipe-fase (Balbezit / Balverlies). Trainers kiezen er
// bij het opstellen van een training één uit als basis voor de trainingsopbouw.

export type TrainingsschemaGroep = 'BALBEZIT' | 'BALVERLIES';

export interface TrainingsschemaTemplate {
  id: string;
  groep: TrainingsschemaGroep;
  opwarming: string;
  tussenvorm: string;
  wedstrijdvorm: string;
}

export const TRAININGSSCHEMA_GROEP_LABELS: Record<TrainingsschemaGroep, string> = {
  BALBEZIT:   'Training in Balbezit',
  BALVERLIES: 'Training in Balverlies',
};

export const TRAININGSSCHEMAS: TrainingsschemaTemplate[] = [
  // ── Training in Balbezit ──
  { id: 'balbezit-1',   groep: 'BALBEZIT',   opwarming: 'Technische Vaardigheden',        tussenvorm: 'Pasvormen (Opstelling)',              wedstrijdvorm: 'Vrij Te Kiezen' },
  { id: 'balbezit-2',   groep: 'BALBEZIT',   opwarming: 'MultiSkillZ',                    tussenvorm: 'Pasvormen (Bewegen Zonder Bal)',       wedstrijdvorm: '1v1, 2v2 (veel duels)' },
  { id: 'balbezit-3',   groep: 'BALBEZIT',   opwarming: 'Fysieke Prikkel (Multimove)',     tussenvorm: 'Afwerkvorm Onder Druk',                wedstrijdvorm: 'Overtal (B+ coachen)' },
  { id: 'balbezit-4',   groep: 'BALBEZIT',   opwarming: 'Vrij Te Kiezen',                  tussenvorm: 'Dribbelvorm',                          wedstrijdvorm: 'Ondertal (B+ coachen)' },
  // ── Training in Balverlies ──
  { id: 'balverlies-1', groep: 'BALVERLIES', opwarming: 'MultiSkillZ',                     tussenvorm: 'Vrij Te Kiezen',                       wedstrijdvorm: 'Ondertal (B- coachen)' },
  { id: 'balverlies-2', groep: 'BALVERLIES', opwarming: 'Fysieke Prikkel (Multimove)',      tussenvorm: '(Onverwachte) Schakelvormen',          wedstrijdvorm: '1v1, 2v2 (veel duels)' },
  { id: 'balverlies-3', groep: 'BALVERLIES', opwarming: 'Technische Vaardigheden',          tussenvorm: 'Zonespecifiek (vanuit opstelling)',    wedstrijdvorm: 'Vrij Te Kiezen' },
  { id: 'balverlies-4', groep: 'BALVERLIES', opwarming: 'Vrij Te Kiezen',                   tussenvorm: 'Pasvorm (Spelen Onder Druk)',          wedstrijdvorm: 'Overtal (B- coachen)' },
];

export function getTrainingsschema(id: string): TrainingsschemaTemplate | undefined {
  return TRAININGSSCHEMAS.find(s => s.id === id);
}
