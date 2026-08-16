// Statische inhoud van het officiële KFC Lennik-gamemodel (aanvallen/omschakelen/
// verdedigen) — zelfde patroon als jaarplan.ts/trainingsschema.ts: hardcoded
// clubinhoud, geen backend-lijst nodig. De veld-diagrammen zijn exacte
// afbeeldingen uit het originele gamemodel-document (niet nagetekend), zodat
// ze 1-op-1 overeenkomen met wat trainers al kennen van het PDF.

import aanvalZones from '../assets/tactiek/aanval-zones.png';
import aanvalFase1_1 from '../assets/tactiek/aanval-fase1-1.png';
import aanvalFase1_2 from '../assets/tactiek/aanval-fase1-2.png';
import aanvalFase1_3 from '../assets/tactiek/aanval-fase1-3.png';
import aanvalFase1_4 from '../assets/tactiek/aanval-fase1-4.png';
import aanvalFase1_5 from '../assets/tactiek/aanval-fase1-5.png';
import aanvalFase1_6 from '../assets/tactiek/aanval-fase1-6.png';
import aanvalFase2_1 from '../assets/tactiek/aanval-fase2-1.png';
import aanvalFase2_2 from '../assets/tactiek/aanval-fase2-2.png';
import aanvalFase2_3 from '../assets/tactiek/aanval-fase2-3.png';
import aanvalFase2_4 from '../assets/tactiek/aanval-fase2-4.png';
import aanvalFase2_5 from '../assets/tactiek/aanval-fase2-5.png';
import aanvalFase2_6 from '../assets/tactiek/aanval-fase2-6.png';
import aanvalFase3_1 from '../assets/tactiek/aanval-fase3-1.png';
import aanvalFase3_2 from '../assets/tactiek/aanval-fase3-2.png';
import aanvalFase3_3 from '../assets/tactiek/aanval-fase3-3.png';
import aanvalFase3_4 from '../assets/tactiek/aanval-fase3-4.png';
import aanvalVoorzet1 from '../assets/tactiek/aanval-voorzet-1.png';
import aanvalVoorzet2 from '../assets/tactiek/aanval-voorzet-2.png';
import aanvalVoorzet3 from '../assets/tactiek/aanval-voorzet-3.png';
import verdedigZones from '../assets/tactiek/verdedig-zones.png';
import verdedigFase1_1 from '../assets/tactiek/verdedig-fase1-1.png';
import verdedigFase1_2 from '../assets/tactiek/verdedig-fase1-2.png';
import verdedigFase1_3 from '../assets/tactiek/verdedig-fase1-3.png';
import verdedigFase2_1 from '../assets/tactiek/verdedig-fase2-1.png';
import verdedigFase2_2 from '../assets/tactiek/verdedig-fase2-2.png';
import verdedigFase2_3 from '../assets/tactiek/verdedig-fase2-3.png';
import verdedigFase2_4 from '../assets/tactiek/verdedig-fase2-4.png';
import verdedigFase2_5 from '../assets/tactiek/verdedig-fase2-5.png';
import verdedigFase3_1 from '../assets/tactiek/verdedig-fase3-1.png';
import verdedigFase3_2 from '../assets/tactiek/verdedig-fase3-2.png';
import verdedigFase3_3 from '../assets/tactiek/verdedig-fase3-3.png';
import verdedigFase3_4 from '../assets/tactiek/verdedig-fase3-4.png';
import verdedigFase3_5 from '../assets/tactiek/verdedig-fase3-5.png';

export interface TactiekPrincipe {
  nr: string;
  titel: string;
  beschrijving: string;
}

export interface TactiekFase {
  titel: string;
  ondertitel?: string;
  principes: TactiekPrincipe[];
  diagrammen: string[];
}

export interface TactiekIntroPunt {
  titel: string;
  beschrijving: string;
}

export interface TactiekHoofdstuk {
  key: string;
  titel: string;
  intro?: TactiekIntroPunt[];
  introDiagram?: string;
  principes?: TactiekPrincipe[];
  fases: TactiekFase[];
}

const AANVAL_PRINCIPES: TactiekPrincipe[] = [
  { nr: '01', titel: 'Numeriek overtal creëren', beschrijving: 'Overtal uitspelen OF spel verleggen (flankwissel) – Positiewissels – Infiltraties met / zonder bal' },
  { nr: '02', titel: 'Linies doorbreken', beschrijving: 'Aanspeelbaarheid tussen de linies – Diagonale & verticale passing - Roterende spelers – Linie overslaan – Rond het blok' },
  { nr: '03', titel: '3e man aanspeelbaar', beschrijving: 'Aanspeelbaarheid onder de bal – Diepgang zonder bal (speel & ga) – Overlappen (Binnen-& buitenkant)' },
  { nr: '04', titel: 'Tegengestelde bewegingen', beschrijving: 'Ruimte creëren in rug tegenstander – Loopacties in de bal & weg van de bal' },
  { nr: '05', titel: 'Bezetting waarheidszone', beschrijving: 'Positiekeuze voor doel – Assistzone bereiken (doellijn halen) – 2e bal winnen – Met een individuele actie een tegenstander uitschakelen.' },
];

const VERDEDIG_PRINCIPES: TactiekPrincipe[] = [
  { nr: '01', titel: 'Tegenstander markeren', beschrijving: 'Hoge intensiteit – Hoog blok – 1 op 1 doordekken (durf & lef) – Negatieve pressing - Timing' },
  { nr: '02', titel: 'Hoog compact blok', beschrijving: 'Schuiven & kantelen – Centrum sluiten – Tegenstander naar gewenste zone dwingen – Zonedekking' },
  { nr: '03', titel: 'Restverdediging', beschrijving: 'Offensief markeren – Overtal +1 – Ver weg van eigen doel – Remmend wijken - Terugvallen' },
  { nr: '04', titel: 'Duels winnen', beschrijving: '1ste & 2e bal – 1 vs 1 duel (contact) – In ondertal – Verdedigend koppen' },
  { nr: '05', titel: 'Verdedigen van voorzetten', beschrijving: 'Defensieve T (bezetting) – Infiltraties worden gevolgd in defensieve waarheidszone - Scannen – 1 tijd gericht wegwerken' },
];

export const TACTIEK: TactiekHoofdstuk[] = [
  {
    key: 'aanvallen',
    titel: 'Aanvallen (Balbezit / B+)',
    intro: [
      { titel: 'Kwalitatieve opbouw = Voorbereiden aanval (FASE 1)', beschrijving: 'Bedoeling is om in deze zone kwalitatief op te bouwen van achteruit. We willen door onze principes omstandigheden creëren waardoor we het spel kunnen versnellen. Door een snelle balcirculatie willen we de zwakke zones van de tegenstander blootleggen, herkennen en uitspelen.' },
      { titel: 'Progressie- & infiltratiezone = Spel versnellen (FASE 2)', beschrijving: 'Als we in deze zone de vrije speler (met genoeg tijd & ruimte) kunnen vinden is het de bedoeling om deze zo snel mogelijk aan te spelen. Hier moeten we het spel (voorwaarts) versnellen en de zwakke zones van de tegenstander uitspelen door te infiltreren of te passen. Indien dit niet lukt kunnen we opnieuw terugvallen op FASE 1 van ons spel om een nieuwe aanval voor te bereiden.' },
      { titel: 'Waarheidszone = Kansen creëren & afwerken (FASE 3)', beschrijving: 'D.m.v. aanvallende loopacties met en zonder bal, individuele acties, gerichte voorzetten, voldoende volk en creativiteit in deze beslissende zone moeten we tot een scoringskans / doelpunt komen. In deze zone moeten we steeds gevaarlijk en efficiënt zijn.' },
    ],
    introDiagram: aanvalZones,
    principes: AANVAL_PRINCIPES,
    fases: [
      {
        titel: 'Fase 1 (Balbezit)',
        ondertitel: 'Opstart K - Startposities',
        principes: [AANVAL_PRINCIPES[0], AANVAL_PRINCIPES[1]],
        diagrammen: [aanvalFase1_1, aanvalFase1_2, aanvalFase1_3, aanvalFase1_4, aanvalFase1_5, aanvalFase1_6],
      },
      {
        titel: 'Fase 2 (Balbezit)',
        principes: [AANVAL_PRINCIPES[0], AANVAL_PRINCIPES[1], AANVAL_PRINCIPES[2], AANVAL_PRINCIPES[3]],
        diagrammen: [aanvalFase2_1, aanvalFase2_2, aanvalFase2_3, aanvalFase2_4, aanvalFase2_5, aanvalFase2_6],
      },
      {
        titel: 'Fase 3 (Balbezit)',
        principes: AANVAL_PRINCIPES,
        diagrammen: [aanvalFase3_1, aanvalFase3_2, aanvalFase3_3, aanvalFase3_4],
      },
      {
        titel: 'Fase 3 (Balbezit)',
        ondertitel: 'Voorzetten',
        principes: [
          { nr: '01', titel: 'Vroege voorzet - Uitdraaiend', beschrijving: 'Tussen K en verdediging' },
          { nr: '02', titel: 'Vroege voorzet - Indraaiend', beschrijving: 'Richting 2e zone' },
          { nr: '03', titel: 'Teruggetrokken voorzet (45°)', beschrijving: 'Strak over de grond richting infiltrerende spelers' },
        ],
        diagrammen: [aanvalVoorzet1, aanvalVoorzet2, aanvalVoorzet3],
      },
    ],
  },
  {
    key: 'omschakelen',
    titel: 'Omschakelen',
    fases: [
      {
        titel: 'Omschakelen (Balverlies naar balbezit / B- naar B+)',
        principes: [
          { nr: '01', titel: 'Dieplopende spelers', beschrijving: 'Loopacties 100% sprint – Ook diepgang aan contrakant – Probeer in de rug van de tegenstander te komen' },
          { nr: '02', titel: 'Tegengestelde bewegingen', beschrijving: 'In de bal >< Diepte' },
          { nr: '03', titel: 'Voorwaarts voetballen', beschrijving: 'Verticaal spelen - Met 1 bal zoveel mogelijk tegenstanders uitschakelen' },
          { nr: '04', titel: 'Overtal uitspelen', beschrijving: 'Ruimteherkenning – Timing van passing / loopacties – Infiltraties met en zonder bal - Tegenstander dwingen tot keuzes maken' },
        ],
        diagrammen: [],
      },
      {
        titel: 'Omschakelen (Balbezit naar balverlies / B+ naar B-)',
        principes: [
          { nr: '01', titel: 'Zo snel mogelijk de bal heroveren (counterpressing)', beschrijving: 'Mentaliteit (instelling) – 100% sprint – Speler kortstbij de bal zet meteen druk – Negatieve pressing' },
          { nr: '02', titel: 'Voorwaarts verdedigen', beschrijving: '' },
          { nr: '03', titel: 'Terugvallen in organisatie', beschrijving: 'Na mislukt drukmoment - Fout maken' },
        ],
        diagrammen: [],
      },
    ],
  },
  {
    key: 'verdedigen',
    titel: 'Verdedigen (Balverlies / B-)',
    intro: [
      { titel: 'Opbouwzone tegenstander beheersen (FASE 1)', beschrijving: 'Bedoeling is om makkelijke opbouw van achteren door de tegenstander (doelman & verdedigers) te voorkomen en de bal zo snel en hoog mogelijk te veroveren. We beginnen vanuit zonedekking en schakelen bij start van de opbouw over naar 1 op 1 druk zetten. Druk zetten op doelman hangt af van de kwaliteiten van de keeper.' },
      { titel: 'Progressie- en infiltratiezone tegenstander beheersen (FASE 2)', beschrijving: 'Hoge druk. Dezelfde intenties als bij fase 1. Enkel zullen we onze verdedigende opstelling / animaties moeten aanpassen rekening houdend met de zone en op het veld (open spel).' },
      { titel: 'Defensieve waarheidszone beheersen (FASE 3)', beschrijving: 'Laag / diep verdedigen. We proberen om de tegenstander weg te houden uit het centrum (zoneverdediging) en dus naar de zijlijn te drukken / lokken. Hoe lager op het veld hoe korter we bij onze directe tegenstander moeten staan. We zorgen ervoor dat we in deze fase altijd 1 speler extra hebben dan de tegenstander.' },
    ],
    introDiagram: verdedigZones,
    principes: VERDEDIG_PRINCIPES,
    fases: [
      {
        titel: 'Fase 1 (Balverlies)',
        principes: VERDEDIG_PRINCIPES.slice(0, 4),
        diagrammen: [verdedigFase1_1, verdedigFase1_2, verdedigFase1_3],
      },
      {
        titel: 'Fase 2 (Balverlies)',
        ondertitel: 'Naar buiten duwen',
        principes: VERDEDIG_PRINCIPES.slice(0, 4),
        diagrammen: [verdedigFase2_1, verdedigFase2_2, verdedigFase2_3, verdedigFase2_4, verdedigFase2_5],
      },
      {
        titel: 'Fase 3 (Balverlies)',
        ondertitel: 'Verhinderen van voorzet',
        principes: VERDEDIG_PRINCIPES,
        diagrammen: [verdedigFase3_1, verdedigFase3_2, verdedigFase3_3, verdedigFase3_4, verdedigFase3_5],
      },
    ],
  },
];
