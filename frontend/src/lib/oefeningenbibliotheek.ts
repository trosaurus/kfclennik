// ── Lokale oefeningenbibliotheek (offline generator — geen externe API) ────────
// Bron: KFC Lennik Trainersmanual U10/U11 (trainingsopbouw, krachtige
// leeromgeving, opleidingsplan-basics per spelfase) + het jaarplan-vocabularium
// (teamprincipes/spelprincipes). Alle inhoud is hier statisch vastgelegd zodat
// "genereren" een deterministische lokale match is, zonder netwerk- of API-call.
// Elke oefening heeft ook een kant-en-klare veldtekening (spelers, pionnen,
// doeltjes, bal, pijlen) die mee gegenereerd wordt in de tekentool.

import {
  ExerciseFase, DrawingScene, DrawingElement, DrawingBackground, PlayerColor, ConeColor,
} from './api';

export interface LibraryExercise {
  id: string;
  fase: ExerciseFase;
  themaTags: string[];   // lowercase trefwoorden, gematcht tegen spelfase/teamprincipe/spelprincipe/hoofdmoment/basisvaardigheid
  naam: string;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
  scene: DrawingScene;
}

// Krachtige leeromgeving (manual 4.6) — checklist die de generator zelf toepast
// op elke wedstrijdvorm: wedstrijdrichting, echte posities, tegenstanders die
// kunnen scoren, echte afstanden, kunnen scoren + beletten, echte spelregels,
// spelers laten zelf kiezen.
export const KRACHTIGE_LEEROMGEVING_PRINCIPES = [
  'Train in de wedstrijdrichting',
  'Gebruik echte posities',
  'Tegenstanders die kunnen scoren',
  'Gebruik de echte afstanden (terrein steeds afbakenen)',
  'Zorg dat spelers veel/altijd kunnen scoren + beletten (omschakelingsmoment)',
  'Echte spelregels',
  'Laat de spelers zelf keuzes maken',
];

// ── Veldtekening-helpers ────────────────────────────────────────────────────

let _sceneUid = 0;
function eid(): string { return `lib-el-${_sceneUid++}`; }

function pl(x: number, y: number, color: PlayerColor, label?: string): DrawingElement {
  return { id: eid(), type: 'player', x, y, color, label };
}
function cn(x: number, y: number, color: ConeColor = 'orange'): DrawingElement {
  return { id: eid(), type: 'cone', x, y, color };
}
function jk(x: number, y: number): DrawingElement { return { id: eid(), type: 'joker', x, y }; }
function gl(x: number, y: number): DrawingElement { return { id: eid(), type: 'goal', x, y }; }
function bl(x: number, y: number): DrawingElement { return { id: eid(), type: 'ball', x, y }; }
function tx(x: number, y: number, label: string): DrawingElement { return { id: eid(), type: 'text', x, y, label }; }
function pass(x1: number, y1: number, x2: number, y2: number): DrawingElement { return { id: eid(), type: 'arrow-pass', x: x1, y: y1, x2, y2 }; }
function dribble(x1: number, y1: number, x2: number, y2: number): DrawingElement { return { id: eid(), type: 'arrow-dribble', x: x1, y: y1, x2, y2 }; }
function run(x1: number, y1: number, x2: number, y2: number): DrawingElement { return { id: eid(), type: 'arrow-run', x: x1, y: y1, x2, y2 }; }
function scn(background: DrawingBackground, elements: DrawingElement[]): DrawingScene { return { background, elements }; }

/** Even verdeelde rij spelers op hoogte y, tussen xMin en xMax. */
function row(y: number, count: number, color: PlayerColor, xMin = 15, xMax = 85, startLabel = 1): DrawingElement[] {
  if (count <= 0) return [];
  const out: DrawingElement[] = [];
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? (xMin + xMax) / 2 : xMin + (xMax - xMin) * (i / (count - 1));
    out.push(pl(x, y, color, String(startLabel + i)));
  }
  return out;
}

export const OEFENINGEN_BIBLIOTHEEK: LibraryExercise[] = [

  // ═══════════════════════ OPWARMING ═══════════════════════
  {
    id: 'opw-multiskills-parcours', fase: 'opwarming', themaTags: [],
    naam: 'Coördinatieparcours met bal', duurMinuten: 10,
    organisatieSpelers: 'Alle spelers, individueel', organisatieAfmetingen: '20m x 15m, 4 stations', organisatieMateriaal: '1 bal per speler, 16 kegels, 4 hoedjes',
    beschrijving: '4 stations: (1) slalom dribbelen tussen kegels, (2) balanceren op een lijn met balcontrole, (3) korte sprint met bal + stop op signaal, (4) jongleren of tikkies tegen de muur/met partner. Spelers roteren om de 90 seconden.',
    coachingPunten: 'Multiskills for foot-element verplicht in elke U10/U11-opwarming volgens het opleidingsplan — leg de nadruk op coördinatie, niet op snelheid.',
    maximaalActief: 'Iedereen heeft een eigen bal en is continu in beweging, geen wachtrijen aan de start.',
    fun: "Laat spelers zelf een 'moeilijkheidsgraad' kiezen op elk station (bv. andere voet).",
    scene: scn('grid', [
      cn(15, 35), cn(15, 65), cn(38, 35), cn(38, 65), cn(62, 35), cn(62, 65), cn(85, 35), cn(85, 65),
      tx(15, 20, '1'), tx(38, 20, '2'), tx(62, 20, '3'), tx(85, 20, '4'),
      pl(15, 50, 'red', '1'), bl(15, 55),
      run(15, 50, 38, 50), run(38, 50, 62, 50), run(62, 50, 85, 50),
    ]),
  },
  {
    id: 'opw-baltikkertje', fase: 'opwarming', themaTags: ['1 op 1', 'doordekken', 'druk'],
    naam: 'Baltikkertje', duurMinuten: 8,
    organisatieSpelers: '10-14, allen tegelijk', organisatieAfmetingen: '20m x 20m vak', organisatieMateriaal: '1 bal per speler, 4 hoedjes voor begrenzing',
    beschrijving: 'Iedere speler dribbelt vrij met een bal in het vak. Op fluitsignaal proberen spelers elkaars bal uit het vak te tikken terwijl ze hun eigen bal beschermen. Wie zijn bal kwijt is, doet 5 jongleerpogingen en doet opnieuw mee.',
    coachingPunten: 'Laag zwaartepunt, bal dicht bij de voet houden bij het beschermen — link met 1v1 doordekken later in de training.',
    maximaalActief: 'Doorlopend spel, geen elimineren — verliezers komen meteen terug via de mini-opdracht.',
    fun: "Speel in golven van 45 sec, kondig een 'winnaar' aan die op het einde nog een bal heeft.",
    scene: scn('grid', [
      cn(15, 15), cn(85, 15), cn(15, 85), cn(85, 85),
      pl(30, 30, 'red', '1'), pl(55, 25, 'red', '2'), pl(75, 40, 'red', '3'),
      pl(35, 60, 'red', '4'), pl(60, 70, 'red', '5'), pl(50, 50, 'red', '6'),
    ]),
  },
  {
    id: 'opw-passing-carrousel', fase: 'opwarming', themaTags: ['linies', 'diagonale', 'verticale', 'passing', 'opbouw', 'aanspeelbaar'],
    naam: 'Passing-carrousel in vak', duurMinuten: 10,
    organisatieSpelers: '8-12 in groepjes van 4', organisatieAfmetingen: '12m x 12m per vak', organisatieMateriaal: '1 bal per groep, 4 hoedjes per vak',
    beschrijving: '4 spelers op de hoeken van een vierkant, 1 extra speler centraal. Bal wordt rond gespeeld met steeds een pass naar de centrale speler en terug (give & go); om de 2 minuten wisselt de centrale speler.',
    coachingPunten: 'Beweeg na je pass (aanspeelbaar blijven), kies bewust voor de diagonale in plaats van de veilige rechte pas.',
    maximaalActief: 'Kleine groepjes = veel balcontacten per speler per minuut.',
    fun: 'Tel het aantal geslaagde passes na elkaar zonder onderbreking als groepsuitdaging.',
    scene: scn('grid', [
      cn(30, 30), cn(70, 30), cn(30, 70), cn(70, 70),
      pl(30, 30, 'red', '1'), pl(70, 30, 'red', '2'), pl(30, 70, 'red', '3'), pl(70, 70, 'red', '4'),
      pl(50, 50, 'red', '5'), bl(28, 32),
      pass(30, 30, 50, 50), pass(50, 50, 70, 30),
    ]),
  },
  {
    id: 'opw-schaduwdribbel', fase: 'opwarming', themaTags: ['1 op 1', 'doordekken', 'hoge intensiteit', 'druk'],
    naam: 'Schaduwdribbelen 1v1', duurMinuten: 8,
    organisatieSpelers: "10-14 in duo's", organisatieAfmetingen: '10m x 10m per duo', organisatieMateriaal: '1 bal per duo, hoedjes ter afbakening',
    beschrijving: 'Speler A dribbelt vrij in het vak, speler B volgt op 1-2m afstand zonder te tackelen (schaduwen). Na 30 sec: rol omkeren. Nadien mag B wel actief de bal proberen afpakken.',
    coachingPunten: 'Zijwaartse tussenpasjes, blijf tussen de bal en het doel — voorbereidend op strikte dekking.',
    maximaalActief: 'Continue actie voor beide spelers, geen stilstand.',
    fun: "Wie de bal 30 sec kan beschermen tegen een actieve verdediger 'wint' de ronde.",
    scene: scn('grid', [
      cn(30, 30), cn(70, 30), cn(30, 70), cn(70, 70),
      pl(40, 50, 'red', 'A'), pl(48, 58, 'red', 'B'), bl(40, 53),
      dribble(40, 50, 60, 40),
    ]),
  },
  {
    id: 'opw-kegelvoetbal-opbouw', fase: 'opwarming', themaTags: ['opbouw', 'aanspeelbaar', 'steunen', 'circulatie'],
    naam: 'Kegelvoetbal — pass & beweeg', duurMinuten: 10,
    organisatieSpelers: '8-10 in 2 teams van 4-5', organisatieAfmetingen: '25m x 15m', organisatieMateriaal: '2 kegels per team als doeltje, 2 ballen, hesjes',
    beschrijving: 'Elk team probeert de bal via passes naar de eigen kegel te spelen en die om te tikken met een pass (geen trap van dichtbij). Verdedigend team probeert te onderscheppen.',
    coachingPunten: 'Speel niet blind vooruit — zoek eerst de vrije medespeler, kies bewust tussen kort en diep.',
    maximaalActief: 'Kleine teams zorgen voor veel balcontact per speler.',
    fun: 'Elke omgetikte kegel = punt, team met meeste punten na 4 minuten wint.',
    scene: scn('grid', [
      cn(10, 20), cn(90, 20), cn(10, 80), cn(90, 80),
      gl(20, 50), gl(80, 50),
      pl(30, 30, 'red', '1'), pl(35, 50, 'red', '2'), pl(30, 70, 'red', '3'), pl(45, 50, 'red', '4'),
      pl(70, 30, 'blue', '1'), pl(65, 50, 'blue', '2'), pl(70, 70, 'blue', '3'), pl(55, 50, 'blue', '4'),
      bl(45, 48), pass(45, 50, 25, 50),
    ]),
  },
  {
    id: 'opw-rondo-4v1', fase: 'opwarming', themaTags: ['circulatie', 'druk', 'opbouw verstoren', 'pressing'],
    naam: 'Rondo 4 tegen 1', duurMinuten: 8,
    organisatieSpelers: '5 per groep (meerdere groepen parallel)', organisatieAfmetingen: '8m x 8m vak', organisatieMateriaal: '1 bal per groep, hoedjes',
    beschrijving: '4 aanvallers op de rand van het vak spelen de bal rond, 1 verdediger in het midden probeert te onderscheppen. Bij balverlies wisselt de speler die de fout maakte met de verdediger.',
    coachingPunten: 'Eerste-tijds spel aanmoedigen waar mogelijk, hoofd omhoog voor het ontvangen.',
    maximaalActief: 'Kleine groep = hoge balfrequentie, geen wachttijd.',
    fun: 'Tel het aantal passes voor balverlies, groepen dagen elkaar uit op hun record.',
    scene: scn('grid', [
      cn(35, 35), cn(65, 35), cn(35, 65), cn(65, 65),
      pl(35, 35, 'red', '1'), pl(65, 35, 'red', '2'), pl(35, 65, 'red', '3'), pl(65, 65, 'red', '4'),
      pl(50, 50, 'blue', 'V'), bl(33, 33),
      pass(35, 35, 65, 35), pass(65, 35, 65, 65),
    ]),
  },
  {
    id: 'opw-reactiespel-bal-veroveren', fase: 'opwarming', themaTags: ['negatieve pressing', 'opbouw verstoren', 'interceptie'],
    naam: 'Bal veroveren — reactiespel', duurMinuten: 8,
    organisatieSpelers: '10-14, 2 teams', organisatieAfmetingen: '20m x 15m', organisatieMateriaal: 'ballen per duo, hesjes',
    beschrijving: "Duo's krijgen elk een bal en dribbelen vrij. Op een geroepen kleur/signaal moet iedereen de bal van een tegenstander (ander duo) proberen af te pakken en zelf 5 sec beschermen.",
    coachingPunten: 'Snel herkennen wanneer je bal kwijt bent = snel omschakelen naar verdedigen.',
    maximaalActief: 'Iedereen speelt mee, geen bank.',
    fun: 'Random signalen houden het spel verrassend en speels.',
    scene: scn('grid', [
      cn(10, 15), cn(90, 15), cn(10, 85), cn(90, 85),
      pl(25, 30, 'red', '1'), pl(45, 25, 'red', '2'), pl(65, 35, 'blue', '1'), pl(80, 55, 'blue', '2'),
      pl(30, 65, 'red', '3'), pl(60, 70, 'blue', '3'),
      bl(25, 33), bl(65, 38),
    ]),
  },
  {
    id: 'opw-doelschieten-warm', fase: 'opwarming', themaTags: ['doelkans', 'scoren', 'afwerken'],
    naam: 'Kort en scherp — inschieten', duurMinuten: 8,
    organisatieSpelers: '10-14, rijen van 3-4 aan 2 goals', organisatieAfmetingen: 'halve terreinbreedte, 16m van doel', organisatieMateriaal: '4-6 ballen, 2 goals, kegels',
    beschrijving: 'Korte reeks: dribbelen richting doel, korte 1-2 met kegel, afwerken op doel. Wissel van kant na elke poging.',
    coachingPunten: 'Laatste stap voor het schot kort houden, kijk op voor het schot.',
    maximaalActief: 'Korte wachttijd door 2 goals parallel te gebruiken.',
    fun: 'Noteer luid wie scoort, korte competitie tussen de rijen.',
    scene: scn('half', [
      pl(50, 8, 'blue', 'K'),
      pl(25, 78, 'red', '1'), pl(28, 82, 'red', '2'), pl(75, 78, 'red', '3'), pl(72, 82, 'red', '4'),
      cn(40, 45), cn(60, 45), bl(25, 75),
      dribble(25, 75, 40, 45), pass(40, 45, 50, 15),
    ]),
  },

  // ═══════════════════════ TUSSENVORM ═══════════════════════
  {
    id: 'tus-linies-doorbreken-4v2', fase: 'tussenvorm', themaTags: ['linies', 'doorbreken', 'diagonale', 'verticale', 'passing'],
    naam: '4v2 met doorsteekpass', duurMinuten: 12,
    organisatieSpelers: '6-8 (4 aanvallers + 2 verdedigers, rotatie)', organisatieAfmetingen: '20m x 15m + doelzone van 5m', organisatieMateriaal: 'hoedjes, hesjes, 1 bal',
    beschrijving: '4 aanvallers rond het vak, 2 verdedigers in het midden. Doel: een lijn (de 2 verdedigers) doorbreken met een diagonale of verticale pass naar een aanvaller die in de doelzone achter de verdedigers loopt. Bij balverlies of onderschepping: rotatie.',
    coachingPunten: 'Kijk eerst of de korte pas mogelijk is, durf dan de lijn te overslaan met een scherpe passing 2de graad.',
    maximaalActief: 'Korte rondes van 90 sec met snelle rotatie houden iedereen betrokken.',
    fun: "Tel het aantal geslaagde 'linies-doorbraken' per groep in 5 minuten.",
    scene: scn('grid', [
      cn(20, 20), cn(80, 20), cn(20, 65), cn(80, 65), cn(35, 80), cn(65, 80),
      pl(20, 20, 'red', '1'), pl(80, 20, 'red', '2'), pl(20, 65, 'red', '3'), pl(80, 65, 'red', '4'),
      pl(38, 42, 'blue', '1'), pl(62, 42, 'blue', '2'),
      bl(20, 23), pass(20, 20, 65, 78), run(65, 78, 65, 80),
    ]),
  },
  {
    id: 'tus-tegenstander-markeren-1v1zone', fase: 'tussenvorm', themaTags: ['tegenstander markeren', '1 op 1', 'doordekken', 'hoge intensiteit', 'durf', 'lef'],
    naam: '1v1 in doelzone — strikte dekking', duurMinuten: 12,
    organisatieSpelers: "8-10 in duo's, 2 vakken parallel", organisatieAfmetingen: '15m x 10m per vak, met minidoeltje', organisatieMateriaal: '2 minidoelen, hesjes, ballen',
    beschrijving: '1v1 met aanvaller die vanaf de zijlijn wordt aangespeeld en moet proberen te scoren; verdediger start op de doellijn en moet direct agressief dekken zodra de bal is aangespeeld.',
    coachingPunten: 'Kies de juiste lichaamshouding, sluit de dichtste voet af, durf het duel aan te gaan (lef).',
    maximaalActief: 'Om de beurt aanvaller/verdediger, korte herhalingen, geen wachtrij bij 2 vakken.',
    fun: 'Verdediger die wint krijgt een punt — bijhouden wie na 10 duels de meeste wint.',
    scene: scn('grid', [
      gl(30, 15), gl(70, 15),
      pl(20, 60, 'red', '1'), pl(30, 35, 'blue', '1'), bl(20, 63), pass(20, 60, 30, 35),
      pl(70, 60, 'red', '2'), pl(70, 35, 'blue', '2'),
      cn(10, 25), cn(50, 25), cn(50, 75), cn(90, 25),
    ]),
  },
  {
    id: 'tus-numeriek-overtal-3v2', fase: 'tussenvorm', themaTags: ['numeriek overtal', 'infiltratie', 'overtal uitspelen'],
    naam: '3v2 overtal uitspelen', duurMinuten: 12,
    organisatieSpelers: '5-6 (3 aanvallers + 2 verdedigers, rotatie)', organisatieAfmetingen: '25m x 15m met klein doel', organisatieMateriaal: 'hoedjes, 1 minidoel, ballen, hesjes',
    beschrijving: '3 aanvallers proberen met behulp van hun overtal (3v2) te scoren op een klein doel. Focus op wie er vrijloopt (infiltratie) om het overtal effectief te benutten, niet enkel breed spelen.',
    coachingPunten: 'Trek de verdediger weg om ruimte te maken voor een medespeler, kies het juiste moment om te infiltreren.',
    maximaalActief: 'Kleine groepen, snelle rotatie na doelpoging of balverlies.',
    fun: "Team dat scoort blijft aanvallen, anders wissel — 'koning van de heuvel'-gevoel.",
    scene: scn('grid', [
      gl(50, 12), cn(15, 25), cn(85, 25),
      pl(25, 70, 'red', '1'), pl(50, 65, 'red', '2'), pl(75, 70, 'red', '3'),
      pl(38, 45, 'blue', '1'), pl(62, 45, 'blue', '2'),
      bl(25, 73), run(50, 65, 30, 40), pass(25, 70, 30, 40),
    ]),
  },
  {
    id: 'tus-compact-blok-schuiven', fase: 'tussenvorm', themaTags: ['compact blok', 'schuiven', 'kantelen', 'centrum sluiten'],
    naam: 'Blok schuiven — 4v4 zone-verdediging', duurMinuten: 12,
    organisatieSpelers: '8 (4v4)', organisatieAfmetingen: '25m x 18m, verdeeld in 3 zones', organisatieMateriaal: 'hoedjes ter markering van zones, hesjes, ballen',
    beschrijving: '4 verdedigers moeten als blok mee opschuiven met de bal (links-midden-rechts) terwijl 4 aanvallers via passing het blok proberen te verplaatsen en een gat te vinden.',
    coachingPunten: 'Verdedigend blok: iedereen kantelt mee bij een zijverplaatsing van de bal, centrum blijft steeds dicht.',
    maximaalActief: 'Doorlopend spel van 90 sec per ronde, wissel aanvallers/verdedigers.',
    fun: 'Verdedigers winnen als ze 90 sec standhouden zonder doorbraak.',
    scene: scn('grid', [
      cn(20, 15), cn(50, 15), cn(80, 15), cn(20, 85), cn(50, 85), cn(80, 85),
      ...row(45, 4, 'blue', 25, 75, 1),
      ...row(75, 4, 'red', 15, 85, 1),
      bl(15, 78), pass(15, 78, 85, 78),
    ]),
  },
  {
    id: 'tus-doelkans-waarheidszone', fase: 'tussenvorm', themaTags: ['doelkans', 'scoren', 'waarheidszone', 'positiekeuze', 'assistzone'],
    naam: 'Afwerken in de waarheidszone', duurMinuten: 12,
    organisatieSpelers: '8-10, rotatie aanval/verdediging', organisatieAfmetingen: 'halve terreinbreedte tot aan 16m', organisatieMateriaal: '1 goal met keeper, ballen, hoedjes',
    beschrijving: 'Aanvaller wordt vanaf de zijkant of het midden aangespeeld op de rand van de waarheidszone (16m) en moet in 1 of 2 tijden afwerken, met een verdediger die van achter meekomt.',
    coachingPunten: 'Kies de juiste positie voor het doel vóór de bal aankomt, snel beslissen tussen schieten en nog 1 balcontact.',
    maximaalActief: 'Korte, intensieve reeksen — elke speler om de beurt aan de bal.',
    fun: 'Bijhouden hoeveel doelpogingen op doel zijn (niet enkel goals) als teamuitdaging.',
    scene: scn('half', [
      pl(50, 8, 'blue', 'K'),
      pl(50, 32, 'red', '1'), pl(56, 40, 'blue', '1'),
      pl(15, 55, 'red', '2'), bl(15, 58),
      pass(15, 55, 50, 32),
    ]),
  },
  {
    id: 'tus-omschakeling-4doelen', fase: 'tussenvorm', themaTags: ['omschakeling', 'balverlies', 'balbezit', 'pressing'],
    naam: '4-doelenspel — snel omschakelen', duurMinuten: 15,
    organisatieSpelers: '8-10, 2 teams', organisatieAfmetingen: '30m x 20m, 4 kleine doeltjes (2 per team, tegenoverliggend)', organisatieMateriaal: '4 minidoeltjes of kegelparen, hesjes, ballen',
    beschrijving: 'Elk team verdedigt 2 doeltjes en mag scoren op de 2 doeltjes van de tegenstander (om het even welk). Bij balverlies onmiddellijk druk zetten om snel te heroveren.',
    coachingPunten: 'Onmiddellijk na balverlies: dichtstbijzijnde speler zet direct druk, anderen sluiten de ruimte af.',
    maximaalActief: 'Doorlopend spel, alle 8-10 spelers steeds betrokken.',
    fun: 'Vrije keuze van doel te bespelen zorgt voor veel variatie en verrassingsmomenten.',
    scene: scn('grid', [
      gl(15, 25), gl(15, 75), gl(85, 25), gl(85, 75),
      pl(35, 30, 'red', '1'), pl(35, 70, 'red', '2'), pl(50, 50, 'red', '3'), pl(30, 50, 'red', '4'),
      pl(65, 30, 'blue', '1'), pl(65, 70, 'blue', '2'), pl(55, 50, 'blue', '3'),
      bl(50, 48), run(50, 50, 30, 30),
    ]),
  },
  {
    id: 'tus-restverdediging-2v2plus1', fase: 'tussenvorm', themaTags: ['restverdediging', 'offensief markeren'],
    naam: 'Restverdediging 2v2+1', duurMinuten: 12,
    organisatieSpelers: '5 (2v2 + 1 vrije man achterin)', organisatieAfmetingen: '20m x 15m met klein doel', organisatieMateriaal: 'hoedjes, hesjes, minidoel',
    beschrijving: "2v2 in het vak, met bij het verdedigende team 1 extra 'restverdediger' die nooit meespeelt in de aanval maar de ruimte achter de laatste lijn moet bewaken bij balverlies.",
    coachingPunten: 'Positioneer je preventief zodat een tegenaanval bij balverlies meteen kan worden afgeremd.',
    maximaalActief: 'Kleine spelvorm, snelle rotatie van de restverdediger-rol.',
    fun: 'Wissel de restverdediger elke 2 minuten zodat iedereen de rol ervaart.',
    scene: scn('grid', [
      gl(50, 85), cn(20, 30), cn(80, 30),
      pl(35, 45, 'red', '1'), pl(65, 45, 'red', '2'),
      pl(35, 65, 'blue', '1'), pl(65, 65, 'blue', '2'),
      pl(50, 20, 'blue', 'RV'), bl(35, 48),
    ]),
  },
  {
    id: 'tus-voorzet-bezetting', fase: 'tussenvorm', themaTags: ['voorzet', 'bezetting', 'waarheidszone', 'doelkans'],
    naam: 'Voorzetten en bezetten', duurMinuten: 12,
    organisatieSpelers: '8-10', organisatieAfmetingen: 'halve terreinbreedte, flank tot 16m', organisatieMateriaal: '1 goal met keeper, ballen, hoedjes',
    beschrijving: 'Speler brengt de bal naar de flank en trapt een voorzet, 2-3 aanvallers lopen op het juiste moment in (1ste paal, 2de paal, rand 16m) om af te werken.',
    coachingPunten: 'Timing van de inloop is cruciaal — niet te vroeg, blijf in beweging tot de voorzet vertrekt.',
    maximaalActief: 'Rotatie van voorzetgever en inlopers na elke poging.',
    fun: 'Punten voor wie scoort op 1ste paal / 2de paal / rand 16m — variatie belonen.',
    scene: scn('half', [
      pl(50, 8, 'blue', 'K'),
      pl(90, 55, 'red', 'C'), bl(90, 58),
      pl(35, 20, 'red', '1'), pl(50, 15, 'red', '2'), pl(65, 22, 'red', '3'),
      pl(45, 30, 'blue', '1'),
      pass(90, 55, 50, 16), run(35, 45, 35, 20), run(65, 45, 65, 22),
    ]),
  },
  {
    id: 'tus-diagonale-passing-vakken', fase: 'tussenvorm', themaTags: ['linies', 'diagonale', 'verticale', 'passing', 'spel verleggen'],
    naam: 'Diagonale pas tussen 3 vakken', duurMinuten: 12,
    organisatieSpelers: '9-12 in 3 groepjes van 3-4', organisatieAfmetingen: '30m x 12m, verdeeld in 3 vakken', organisatieMateriaal: 'hoedjes voor vakken, hesjes, 1 bal',
    beschrijving: 'Bal moet van vak 1 naar vak 3 met een diagonale pass (niet enkel recht doorspelen). Een neutrale speler per vak helpt de baldrager.',
    coachingPunten: 'Zoek bewust de diagonale hoek, niet automatisch de rechte lijn — spel verleggen wanneer de diagonaal niet open is.',
    maximaalActief: 'Kleine vakken, hoge balfrequentie voor iedereen.',
    fun: 'Team-uitdaging: hoeveel keer lukt de volledige overgang vak 1 → vak 3 in 4 minuten?',
    scene: scn('grid', [
      cn(10, 20), cn(35, 20), cn(10, 80), cn(35, 80),
      cn(35, 20), cn(65, 20), cn(35, 80), cn(65, 80),
      cn(65, 20), cn(90, 20), cn(65, 80), cn(90, 80),
      tx(22, 50, 'Vak 1'), tx(50, 50, 'Vak 2'), tx(78, 50, 'Vak 3'),
      pl(22, 65, 'red', '1'), pl(50, 35, 'red', '2'), pl(78, 65, 'red', '3'),
      bl(22, 68), pass(22, 65, 50, 35), pass(50, 35, 78, 65),
    ]),
  },
  {
    id: 'tus-hoog-blok-pressing', fase: 'tussenvorm', themaTags: ['hoog compact blok', 'centrum sluiten', 'pressing', 'opbouw verstoren'],
    naam: 'Hoog blok — collectief druk zetten', duurMinuten: 12,
    organisatieSpelers: '8 (4v4)', organisatieAfmetingen: '20m x 20m', organisatieMateriaal: 'hoedjes, hesjes, ballen',
    beschrijving: 'Verdedigend team start hoog en probeert bij elke pas van de tegenstander collectief op te schuiven en het centrum af te sluiten, aanvallend team moet via de zijkanten proberen te ontsnappen.',
    coachingPunten: 'Iedereen schuift gelijktijdig mee op — niemand blijft alleen achter.',
    maximaalActief: '90 sec-blokken met snelle rotatie tussen de teams.',
    fun: 'Bonus-punt voor het verdedigend team als ze de bal binnen 10 sec heroveren.',
    scene: scn('grid', [
      cn(15, 15), cn(85, 15), cn(15, 85), cn(85, 85),
      ...row(35, 4, 'blue', 25, 75, 1),
      ...row(70, 4, 'red', 15, 85, 1),
      bl(50, 73), run(15, 85, 15, 40),
    ]),
  },

  // ═══════════════════════ WEDSTRIJDVORM (altijd met goals) ═══════════════════════
  {
    id: 'wed-4v4-goals', fase: 'wedstrijdvorm', themaTags: [],
    naam: '4v4 met keepers — vrij spel', duurMinuten: 15,
    organisatieSpelers: '8-10 (4v4 + wissels)', organisatieAfmetingen: '30m x 20m (helft van het 8v8-veld)', organisatieMateriaal: '2 kleine goals, hesjes, ballen',
    beschrijving: 'Klassiek 4v4 in wedstrijdrichting met 2 kleine doelen. Laat spelers zoveel mogelijk zelf kiezen, minimale sturing van de coach.',
    coachingPunten: 'Coach enkel op het themawoord van vandaag, laat de rest vrij.',
    maximaalActief: 'Wissels om de 3 minuten zodat iedereen evenveel speelt.',
    fun: 'Laat de spelers zelf de opstelling/teams kiezen voor extra betrokkenheid.',
    scene: scn('full', [
      ...row(78, 4, 'red', 25, 75, 1),
      ...row(22, 4, 'blue', 25, 75, 1),
      bl(50, 50),
    ]),
  },
  {
    id: 'wed-linies-doorbreken-5v5plusjoker', fase: 'wedstrijdvorm', themaTags: ['linies', 'doorbreken', 'diagonale', 'verticale', 'passing', 'opbouw'],
    naam: '5v5 + joker — linies doorbreken', duurMinuten: 15,
    organisatieSpelers: '10-12 (5v5 + 1-2 jokers)', organisatieAfmetingen: '35m x 22m met 2 goals', organisatieMateriaal: '2 goals, hesjes, jokerhesje, ballen',
    beschrijving: '5v5 met keeper, 1-2 neutrale jokers spelen steeds mee met de ploeg aan de bal om overtal te creëren voor het doorbreken van linies. Score telt enkel na een pass die minstens 1 linie overslaat.',
    coachingPunten: 'Beloon in je coaching elke poging tot een lijn-overslaande pass, ook als hij mislukt.',
    maximaalActief: 'Iedereen speelt, jokers rouleren om de 3 minuten.',
    fun: 'Extra punt voor een doelpunt dat direct uit een linie-doorbrekende pass komt.',
    scene: scn('full', [
      ...row(78, 5, 'red', 15, 85, 1),
      ...row(22, 5, 'blue', 15, 85, 1),
      jk(5, 50), jk(95, 50), bl(58, 78),
      pass(58, 78, 35, 35),
    ]),
  },
  {
    id: 'wed-tegenstander-markeren-manmanning', fase: 'wedstrijdvorm', themaTags: ['tegenstander markeren', '1 op 1', 'doordekken', 'hoge intensiteit'],
    naam: '5v5 met man-dekking', duurMinuten: 15,
    organisatieSpelers: '10 (5v5)', organisatieAfmetingen: '30m x 20m met 2 goals', organisatieMateriaal: '2 goals, hesjes, ballen',
    beschrijving: 'Elke speler krijgt een vaste directe tegenstander toegewezen (man-verdediging) i.p.v. zone. Doel: strikte 1v1-dekking door het hele veld ervaren in wedstrijdcontext.',
    coachingPunten: 'Blijf bij je man, ook als de bal ver weg is — nooit loslaten.',
    maximaalActief: 'Volledige ploeg speelt, wissel de koppels na elk doelpunt.',
    fun: 'Noteer welk duo het meest duels wint — kleine competitie binnen de wedstrijdvorm.',
    scene: scn('full', [
      ...row(75, 5, 'red', 18, 82, 1),
      ...row(25, 5, 'blue', 18, 82, 1),
      bl(50, 50),
    ]),
  },
  {
    id: 'wed-numeriek-overtal-6v4', fase: 'wedstrijdvorm', themaTags: ['numeriek overtal', 'infiltratie', 'overtal uitspelen', 'spel verleggen'],
    naam: '6v4 — overtal benutten', duurMinuten: 15,
    organisatieSpelers: '10 (6 aanvallend team v 4 verdedigend team)', organisatieAfmetingen: '30m x 20m met 2 goals', organisatieMateriaal: '2 goals, hesjes, ballen',
    beschrijving: 'Team met numeriek overtal (6 spelers) speelt tegen een kleiner team (4 spelers) en moet dat overtal bewust benutten via breedte, diepte en infiltratie. Na elke 4 minuten wisselen van rol.',
    coachingPunten: 'Gebruik de volledige breedte van het veld om het overtal zichtbaar te maken.',
    maximaalActief: 'Iedereen actief door de kleine groepsgrootte.',
    fun: 'Team met minst spelers dat toch scoort krijgt dubbele punten.',
    scene: scn('full', [
      ...row(75, 6, 'red', 12, 88, 1),
      ...row(25, 4, 'blue', 25, 75, 1),
      bl(50, 55), run(72, 75, 60, 40),
    ]),
  },
  {
    id: 'wed-doelkansen-kortegoals', fase: 'wedstrijdvorm', themaTags: ['doelkans', 'scoren', 'waarheidszone', 'positiekeuze', 'assistzone'],
    naam: '5v5 — veel korte doelpogingen', duurMinuten: 15,
    organisatieSpelers: '10 (5v5)', organisatieAfmetingen: '25m x 18m met 2 kleine goals, dicht bij elkaar', organisatieMateriaal: '2 goals, hesjes, ballen',
    beschrijving: 'Kleiner veld met dichter bij elkaar staande doelen zorgt voor veel doelpogingen per minuut. Focus in coaching op snelle beslissingen in de waarheidszone.',
    coachingPunten: 'Kies snel: schieten of nog 1 actie? Beloon initiatief boven aarzelen.',
    maximaalActief: 'Klein veld = veel balcontacten en kansen voor iedereen.',
    fun: 'Tel samen hardop het totaal aantal doelpogingen van beide teams.',
    scene: scn('full', [
      ...row(72, 5, 'red', 18, 82, 1),
      ...row(28, 5, 'blue', 18, 82, 1),
      bl(50, 40), pass(50, 40, 50, 12),
    ]),
  },
  {
    id: 'wed-omschakeling-directgoals', fase: 'wedstrijdvorm', themaTags: ['omschakeling', 'balverlies', 'balbezit'],
    naam: '5v5 met directe omschakeling', duurMinuten: 15,
    organisatieSpelers: '10 (5v5)', organisatieAfmetingen: '30m x 20m met 2 goals', organisatieMateriaal: '2 goals, hesjes, ballen',
    beschrijving: 'Normale 5v5-wedstrijdvorm, maar de coach fluit bewust vaak voor kleine overtredingen/uit-ballen om extra omschakelmomenten te forceren en te coachen op het eerste moment na balverlies/-winst.',
    coachingPunten: 'Wat doe je in de eerste 3 seconden na balverlies? Wat doe je in de eerste 3 seconden na balwinst?',
    maximaalActief: 'Doorlopend spel met korte onderbrekingen enkel voor coaching.',
    fun: "Beloon de 'snelste omschakeling' van de sessie met een applaus-moment.",
    scene: scn('full', [
      ...row(75, 5, 'red', 18, 82, 1),
      ...row(25, 5, 'blue', 18, 82, 1),
      bl(50, 55), run(50, 60, 50, 25), tx(58, 45, 'Omschakeling!'),
    ]),
  },
  {
    id: 'wed-restverdediging-6v6', fase: 'wedstrijdvorm', themaTags: ['restverdediging', 'offensief markeren', 'compact blok'],
    naam: '6v6 — veilig bij balverlies', duurMinuten: 15,
    organisatieSpelers: '12 (6v6)', organisatieAfmetingen: '40m x 25m met 2 goals (bijna volledig 8v8-veld)', organisatieMateriaal: '2 goals, hesjes, ballen',
    beschrijving: 'Volledige wedstrijdvorm dicht bij het echte 8v8-format, met specifieke coaching op restverdediging: wie blijft er achter bij een aanval om een tegenaanval op te vangen?',
    coachingPunten: 'Niet iedereen mee naar voren bij een aanval — bewaak steeds de ruimte achterin.',
    maximaalActief: 'Grotere groep, wissel regelmatig om iedereen voldoende speelminuten te geven.',
    fun: 'Beloon een team dat een tegenaanval succesvol afstopt met een punt, ook zonder doelpunt.',
    scene: scn('full', [
      ...row(70, 5, 'red', 10, 90, 1), pl(50, 88, 'red', 'RV'),
      ...row(30, 5, 'blue', 10, 90, 1), pl(50, 12, 'blue', 'RV'),
      bl(50, 50),
    ]),
  },
  {
    id: 'wed-voorzet-bezetting-wedstrijd', fase: 'wedstrijdvorm', themaTags: ['voorzet', 'bezetting', 'assistzone'],
    naam: '5v5 — scoren via de flank', duurMinuten: 15,
    organisatieSpelers: '10 (5v5)', organisatieAfmetingen: '30m x 20m met 2 goals, brede zones langs de zijlijn gemarkeerd', organisatieMateriaal: '2 goals, hoedjes voor flankzones, hesjes, ballen',
    beschrijving: "Gewone 5v5-wedstrijdvorm, maar een doelpunt telt dubbel als het voorafgegaan wordt door een voorzet of pass vanuit de gemarkeerde flankzone.",
    coachingPunten: 'Zoek bewust de zijkant op om vanuit de assistzone een voorzet of pass te geven.',
    maximaalActief: 'Iedereen speelt mee, geen aparte oefenrol.',
    fun: "Dubbele punten voor 'flank-goals' zorgt voor duidelijke, zichtbare uitdaging.",
    scene: scn('full', [
      cn(5, 10), cn(5, 40), cn(95, 10), cn(95, 40),
      ...row(75, 5, 'red', 18, 82, 1),
      ...row(25, 5, 'blue', 18, 82, 1),
      bl(85, 30), pass(85, 30, 50, 12),
    ]),
  },

  // ═══════════════════════ COOLING DOWN ═══════════════════════
  {
    id: 'cd-jongleer-uitdaging', fase: 'cooling_down', themaTags: [],
    naam: 'Jongleer-uitdaging', duurMinuten: 5,
    organisatieSpelers: "alle, individueel of in duo's", organisatieAfmetingen: 'vrij, klein vak', organisatieMateriaal: '1 bal per speler',
    beschrijving: "Rustig aflopend spel: hoeveel keer kan je de bal jongleren zonder dat hij de grond raakt? Laat spelers in duo's om de beurt tellen.",
    coachingPunten: 'Rustige afsluiter, focus op plezier en lichte inspanning.',
    maximaalActief: 'Iedereen doet mee op eigen niveau.',
    fun: 'Vier elk persoonlijk record hardop.',
    scene: scn('grid', [
      pl(30, 35, 'red', '1'), bl(30, 40), pl(60, 35, 'red', '2'), bl(60, 40),
      pl(30, 65, 'red', '3'), bl(30, 70), pl(60, 65, 'red', '4'), bl(60, 70),
    ]),
  },
  {
    id: 'cd-korte-partij-kleinevakken', fase: 'cooling_down', themaTags: [],
    naam: 'Mini-partijtje 2v2 zonder druk', duurMinuten: 6,
    organisatieSpelers: '10-14 in groepjes van 4', organisatieAfmetingen: '10m x 8m per vakje', organisatieMateriaal: 'kleine goals of kegels, ballen',
    beschrijving: 'Kort, laagdrempelig 2v2-partijtje zonder coaching-thema, gewoon voor de lol en om af te sluiten met een balletje.',
    coachingPunten: 'Geen inhoudelijke coaching meer — enkel aanmoedigen.',
    maximaalActief: 'Kleine groepjes, iedereen speelt gelijktijdig.',
    fun: 'Laat de spelers zelf de teams kiezen.',
    scene: scn('grid', [
      gl(50, 15), gl(50, 85),
      pl(35, 40, 'red', '1'), pl(65, 40, 'red', '2'),
      pl(35, 60, 'blue', '1'), pl(65, 60, 'blue', '2'),
      bl(50, 50),
    ]),
  },
  {
    id: 'cd-stretching-spel', fase: 'cooling_down', themaTags: [],
    naam: 'Stretchen met bal-spelletje', duurMinuten: 5,
    organisatieSpelers: 'alle, kring', organisatieAfmetingen: 'grote kring', organisatieMateriaal: '1-2 ballen',
    beschrijving: 'In een kring: bal doorgeven terwijl iedereen lichte stretching-bewegingen doet (kuiten, hamstrings, heupen). Bal aangeven = beurt om een stretch-oefening te tonen.',
    coachingPunten: 'Rustig tempo, ademhaling laten zakken na de intensieve kern.',
    maximaalActief: 'Iedereen in de kring betrokken.',
    fun: 'Laat spelers zelf een grappige stretch-pose verzinnen.',
    scene: scn('grid', [
      pl(50, 20, 'red', '1'), pl(75, 32, 'red', '2'), pl(85, 55, 'red', '3'), pl(75, 78, 'red', '4'),
      pl(50, 88, 'red', '5'), pl(25, 78, 'red', '6'), pl(15, 55, 'red', '7'), pl(25, 32, 'red', '8'),
      bl(50, 45),
    ]),
  },
  {
    id: 'cd-schattenjacht', fase: 'cooling_down', themaTags: [],
    naam: 'Bal-schattenjacht', duurMinuten: 6,
    organisatieSpelers: 'alle, 2 teams', organisatieAfmetingen: 'vrij vak', organisatieMateriaal: 'kegels, enkele ballen',
    beschrijving: 'Verstop enkele kegels/balletjes verspreid over het vak, teams verzamelen er zoveel mogelijk binnen de tijd — laagdrempelig en speels als afsluiter.',
    coachingPunten: 'Puur voor de fun, geen technische focus meer.',
    maximaalActief: 'Iedereen rent en zoekt mee.',
    fun: 'Competitief maar laagdrempelig, ideaal om positief af te sluiten.',
    scene: scn('grid', [
      cn(20, 25), cn(45, 15), cn(70, 30), cn(30, 60), cn(60, 70), cn(80, 55), cn(15, 80), cn(85, 20),
      pl(30, 45, 'red', '1'), pl(50, 55, 'red', '2'), pl(65, 45, 'blue', '1'), pl(45, 30, 'blue', '2'),
    ]),
  },
  {
    id: 'cd-vrije-trappen', fase: 'cooling_down', themaTags: [],
    naam: 'Vrije trappen op doel', duurMinuten: 5,
    organisatieSpelers: 'alle, rij aan het doel', organisatieAfmetingen: 'rand 16m', organisatieMateriaal: '1 goal, enkele ballen',
    beschrijving: 'Elke speler mag om de beurt 1-2 keer vrij een balletje op doel trappen, zonder druk of coaching — leuke afsluiter waar iedereen wil scoren.',
    coachingPunten: 'Geen technische correcties meer, enkel aanmoedigen en vieren.',
    maximaalActief: 'Korte wachttijd door snel te wisselen.',
    fun: 'Vier elk doelpunt luid, ook de mislukte pogingen krijgen applaus.',
    scene: scn('half', [
      pl(50, 8, 'blue', 'K'),
      pl(45, 85, 'red', '1'), pl(50, 88, 'red', '2'), pl(55, 91, 'red', '3'),
      bl(50, 80), pass(50, 78, 50, 15),
    ]),
  },
];

// ── Matching-engine ──────────────────────────────────────────────────────────

export interface SuggestionContext {
  hoofdmoment?: string;
  spelfase?: string;
  teamprincipe?: string;
  spelprincipe?: string;
  basisvaardigheid?: string;
}

/** Deterministische lokale match — geen API-call. Scoort elke bibliotheek-oefening
 * op basis van trefwoord-overlap met de huidige trainingscontext (jaarplan-velden). */
export function suggestExercises(
  fase: ExerciseFase,
  context: SuggestionContext,
  offset = 0,
  count = 3
): LibraryExercise[] {
  const haystack = [context.hoofdmoment, context.spelfase, context.teamprincipe, context.spelprincipe, context.basisvaardigheid]
    .filter(Boolean).join(' ').toLowerCase();

  const candidates = OEFENINGEN_BIBLIOTHEEK.filter(e => e.fase === fase);
  const scored = candidates.map(e => ({
    e,
    score: e.themaTags.length === 0
      ? 0.5
      : e.themaTags.reduce((s, tag) => s + (haystack.includes(tag) ? 1 : 0), 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.e.naam.localeCompare(b.e.naam));
  const ordered = scored.map(s => s.e);

  if (ordered.length === 0) return [];
  const start = offset % ordered.length;
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
  return rotated.slice(0, count);
}
