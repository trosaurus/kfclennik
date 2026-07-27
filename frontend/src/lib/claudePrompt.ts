// ── Prompt-generator voor "Genereer met Claude" ────────────────────────────────
// Bouwt een kant-en-klare, kopieerbare prompt met de huidige trainingscontext,
// zodat een trainer die in een eigen Claude-project (met evt. de trainersmanual
// als projectkennis) kan laten beantwoorden, en het resultaat vervolgens
// handmatig overneemt in de oefendatabank. Geen API-call vanuit de app zelf.

import { ExerciseFase, EXERCISE_FASE_LABELS } from './api';

export interface ClaudePromptContext {
  fase: ExerciseFase;
  doelgroep?: string;
  hoofdmoment?: string;
  spelfase?: string;
  teamprincipe?: string;
  spelprincipe?: string;
  basisvaardigheid?: string;
  hasManual?: boolean;
}

export function buildOefeningPrompt(ctx: ClaudePromptContext): string {
  const contextLines = [
    ctx.doelgroep && `Leeftijdscategorie: ${ctx.doelgroep}`,
    ctx.hoofdmoment && `Hoofdmoment: ${ctx.hoofdmoment}`,
    ctx.spelfase && `Spelfase: ${ctx.spelfase}`,
    ctx.teamprincipe && `Teamprincipe: ${ctx.teamprincipe}`,
    ctx.spelprincipe && `Spelprincipe: ${ctx.spelprincipe}`,
    ctx.basisvaardigheid && `Basisvaardigheid: ${ctx.basisvaardigheid}`,
  ].filter(Boolean).join('\n');

  return [
    `Ontwerp een voetbaloefening voor het onderdeel "${EXERCISE_FASE_LABELS[ctx.fase]}" van een jeugdtraining.`,
    contextLines ? `\nContext van deze training:\n${contextLines}` : '',
    ctx.hasManual ? '\nBaseer je op de trainersmanual die je als projectkennis hebt.' : '',
    '\nGeef het resultaat exact in dit formaat, zodat ik het rechtstreeks kan overnemen in de oefendatabank:\n',
    'Naam: ...',
    'Duur (minuten): ...',
    'Aantal spelers: ...',
    'Afmetingen terrein: ...',
    'Materiaal: ...',
    'Beschrijving: ...',
    'Coaching (aandachtspunten): ...',
    'Maximaal actief (hoe zorg je dat iedereen actief blijft): ...',
    'Fun (hoe maak je het leuk): ...',
  ].filter(Boolean).join('\n');
}

export interface ParsedClaudeExercise {
  naam: string;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
}

type RawFieldKey =
  | 'naam' | 'duur' | 'organisatieSpelers' | 'organisatieAfmetingen' | 'organisatieMateriaal'
  | 'beschrijving' | 'coachingPunten' | 'maximaalActief' | 'fun';

const FIELD_PATTERNS: [RawFieldKey, RegExp][] = [
  ['naam', /^naam\s*:/i],
  ['duur', /^duur\b[^:]*:/i],
  ['organisatieSpelers', /^(aantal\s+)?spelers\s*:/i],
  ['organisatieAfmetingen', /^afmetingen[^:]*:/i],
  ['organisatieMateriaal', /^materiaal\s*:/i],
  ['beschrijving', /^beschrijving\s*:/i],
  ['coachingPunten', /^coaching[^:]*:/i],
  ['maximaalActief', /^maximaal\s+actief[^:]*:/i],
  ['fun', /^fun[^:]*:/i],
];

/** Parseert het geplakte antwoord van Claude (in het "Label: waarde"-formaat dat
 * buildOefeningPrompt aanvraagt) terug naar oefeningvelden — best-effort en
 * tolerant voor kleine afwijkingen in de labels. Als geen enkel label herkend
 * wordt (vrije tekst zonder structuur), komt de volledige tekst in de
 * beschrijving terecht zodat er niets verloren gaat; de trainer kan de rest
 * nadien gewoon corrigeren in de oefeningseditor. */
export function parseClaudeResponse(text: string): ParsedClaudeExercise {
  const raw: Record<RawFieldKey, string> = {
    naam: '', duur: '', organisatieSpelers: '', organisatieAfmetingen: '',
    organisatieMateriaal: '', beschrijving: '', coachingPunten: '', maximaalActief: '', fun: '',
  };

  let current: RawFieldKey | null = null;
  let matchedAny = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = FIELD_PATTERNS.find(([, re]) => re.test(line));
    if (match) {
      matchedAny = true;
      current = match[0];
      raw[current] = line.slice(line.indexOf(':') + 1).trim();
    } else if (current) {
      raw[current] = raw[current] ? `${raw[current]}\n${line}` : line;
    }
  }

  if (!matchedAny && text.trim()) raw.beschrijving = text.trim();

  const durMatch = raw.duur.match(/\d+/);
  return {
    naam: raw.naam,
    duurMinuten: durMatch ? parseInt(durMatch[0], 10) : 10,
    organisatieSpelers: raw.organisatieSpelers,
    organisatieAfmetingen: raw.organisatieAfmetingen,
    organisatieMateriaal: raw.organisatieMateriaal,
    beschrijving: raw.beschrijving,
    coachingPunten: raw.coachingPunten,
    maximaalActief: raw.maximaalActief,
    fun: raw.fun,
  };
}
