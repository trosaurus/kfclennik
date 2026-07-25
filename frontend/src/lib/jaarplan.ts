// ── Jaarplan KFC Lennik 2026-2027 ────────────────────────────────────────────
// Bron: Jaarplan KFC Lennik_2026_2027.pdf — vaste seizoensdata (niet via backend
// beheerd, net als teamConfig.ts). Elke cyclus telt 5 weken: week 1-2 = Balbezit,
// week 3-4 = Balverlies, week 5 = neutrale week. Cyclus 4 heeft geen neutrale
// week (kerstvakantie-onderbreking). De slotweken (eind april-begin mei) hebben
// geen vast thema — opleiders kiezen zelf.

export type JaarplanBracket = 'U8-U9' | 'U10-U11' | 'U12-U13-U16M' | 'U14-U17';

export interface JaarplanWeek {
  cycle: number;              // 1-7, slotweken = 8
  weekInCycle: number;        // 1-4 = themaweek, 5 = neutrale week
  startDate: string;          // ISO yyyy-mm-dd (maandag)
  endDate: string;            // ISO yyyy-mm-dd (zondag)
  fase: 'BALBEZIT' | 'BALVERLIES' | 'NEUTRAAL' | 'SLOTWEKEN';
  spelfase: string;
  teamprincipe: string;
  spelprincipe: string;
  basics: Partial<Record<JaarplanBracket, string>>;
}

const NEUTRAAL_NOTE = 'Opleiders kiezen zelf i.f.v. ontwikkelpunten team / individu';

export const JAARPLAN_2026_2027: JaarplanWeek[] = [
  // ── Cyclus 1 ──────────────────────────────────────────────────────────────
  {
    cycle: 1, weekInCycle: 1, startDate: '2026-08-10', endDate: '2026-08-16', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'LINIES DOORBREKEN', spelprincipe: 'DIAGONALE EN VERTICALE PASSING',
    basics: {
      'U8-U9': '00. de juiste aanvallende keuze maken met het oog op scoren of de meest gunstige vervolgactie (= leiden/dribbel OF pas).',
      'U10-U11': '07. de juiste keuze maken naar welke medespeler hij de opbouwpas geeft (= in de meest gunstige positie staat en binnen de eigen mogelijkheden) met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '07b. Efficiënte balcirculatie: zo snel mogelijk nauwkeurig doorspelen van de bal',
      'U14-U17': '03a. Driehoekspel: aanspeelbaarheid (vanuit opgelegde spelposities)',
    },
  },
  {
    cycle: 1, weekInCycle: 2, startDate: '2026-08-17', endDate: '2026-08-23', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'LINIES DOORBREKEN', spelprincipe: 'DIAGONALE EN VERTICALE PASSING',
    basics: {
      'U8-U9': '08. een korte opbouwpas spelen zodat de ontvanger in de meest gunstige omstandigheden verder kan spelen (juiste voet/snelheid/hoogte/moment)',
      'U10-U11': '09. een halflange opbouwpas spelen zodat de ontvanger in de meest gunstige omstandigheden verder kan spelen (juiste voet/snelheid/hoogte/moment)',
      'U12-U13-U16M': '10. Een lijn overslaan bij passing diep (passing 2de graad)',
      'U14-U17': '06b. Efficiënte balcirculatie: progressie nastreven (diepte voor breedte voor terug) zonder risico op dom balverlies',
    },
  },
  {
    cycle: 1, weekInCycle: 3, startDate: '2026-08-24', endDate: '2026-08-30', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 1-2', teamprincipe: 'TEGENSTANDER MARKEREN', spelprincipe: 'HOGE INTENSITEIT / 1 OP 1 DOORDEKKEN (DURF / LEF)',
    basics: {
      'U8-U9': '33. het duel (= 1v1) over de grond winnen met het oog op een gunstige vervolgactie',
      'U10-U11': '39. door strikte dekking beletten dat zijn rechtstreekse tegenstander aangespeeld wordt of in gunstige omstandigheden zijn vervolgactie kan uitvoeren',
      'U12-U13-U16M': '29. de tegenstander aan de bal in zijn zone in de juiste lichaamshouding proactief en agressief onder druk zetten (= 1v1) zodat de meest gunstige vervolgactie (opbouwpas of dribbel) belet wordt',
      'U14-U17': 'Collectieve hoge druk',
    },
  },
  {
    cycle: 1, weekInCycle: 4, startDate: '2026-08-31', endDate: '2026-09-06', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 1-2', teamprincipe: 'HOOG COMPACT BLOK', spelprincipe: 'CENTRUM SLUITEN',
    basics: {
      'U8-U9': '24. de juiste verdedigende keuze maken met het oog op scoren beletten (= afweren) of de meest gunstige vervolgactie (= remmend wijken of de bal afnemen/afweren in duel of door interceptie)',
      'U10-U11': '26. de opbouwpas, subtiele dieptepas of voorzet intercepteren met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '37. de speelhoeken naar zijn rechtstreekse tegenstander zo goed mogelijk afsluiten met het oog op het beletten van de meest gunstige opbouwpas',
      'U14-U17': '03. Zo hoog mogelijk compact blok',
    },
  },
  {
    cycle: 1, weekInCycle: 5, startDate: '2026-09-07', endDate: '2026-09-13', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Cyclus 2 ──────────────────────────────────────────────────────────────
  {
    cycle: 2, weekInCycle: 1, startDate: '2026-09-14', endDate: '2026-09-20', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'INFILTRATIES MET / ZONDER BAL',
    basics: {
      'U8-U9': '01. zich aanspeelbaar opstellen t.o.v. de speler aan de bal met het oog op de meest gunstige vervolgactie',
      'U10-U11': '02. zich zodanig verplaatsen waardoor een medespeler aanspeelbaar wordt met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '12. Efficiënte infiltratie zonder bal na een pas: Give & Go',
      'U14-U17': '05. bij kans op subtiele dieptepas op het juiste ogenblik in de rug van de laatste lijn duiken (geen buitenspel) met het oog op scoren',
    },
  },
  {
    cycle: 2, weekInCycle: 2, startDate: '2026-09-21', endDate: '2026-09-27', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'INFILTRATIES MET / ZONDER BAL',
    basics: {
      'U8-U9': '13. eerder dan de tegenstander in balbezit komen met het oog op de meest gunstige vervolgactie',
      'U10-U11': '20. de juiste keuze maken tussen 1 tijd of na een balaanname scoren',
      'U12-U13-U16M': '13. Efficiënte infiltratie zonder bal op het juiste moment: bij ruimte om overload te creëren',
      'U14-U17': '11. een subtiele dieptepas trappen/koppen waardoor vanuit de meest gunstige situatie kan afgewerkt worden',
    },
  },
  {
    cycle: 2, weekInCycle: 3, startDate: '2026-09-28', endDate: '2026-10-04', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3-2', teamprincipe: '(HOOG) COMPACT BLOK', spelprincipe: 'SCHUIVEN EN KANTELEN',
    basics: {
      'U8-U9': '24. de juiste verdedigende keuze maken met het oog op scoren beletten (= afweren) of de meest gunstige vervolgactie (= remmend wijken of de bal afnemen/afweren in duel of door interceptie)',
      'U10-U11': '25. de juiste keuze maken tussen het wel of niet intercepteren',
      'U12-U13-U16M': '40. aan de dichtste medespeler zodanig rugdekking geven waardoor hij de speler aan de bal snel onder druk kan zetten wanneer zijn medespeler uitgeschakeld is',
      'U14-U17': '38. de speelhoeken naar zijn rechtstreekse tegenstander zo goed mogelijk afsluiten met het oog op het beletten van de subtiele dieptepas',
    },
  },
  {
    cycle: 2, weekInCycle: 4, startDate: '2026-10-05', endDate: '2026-10-11', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3-2', teamprincipe: '(HOOG) COMPACT BLOK', spelprincipe: 'TEGENSTANDER NAAR GEWENSTE ZONE DWINGEN',
    basics: {
      'U8-U9': '32. het duel (= 1v1) zodanig aangaan dat hij de speler aan de bal belet om naar doel te trappen',
      'U10-U11': '35. de juiste keuze maken tussen remmend wijken of het duel aangaan',
      'U12-U13-U16M': '31. het duel (= 1v1) zodanig aangaan dat hij de speler aan de bal belet om naar doel te trappen',
      'U14-U17': '28. de juiste keuze maken tussen agressief en proactief druk zetten of defensief in het blok komen',
    },
  },
  {
    cycle: 2, weekInCycle: 5, startDate: '2026-10-12', endDate: '2026-10-18', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Cyclus 3 ──────────────────────────────────────────────────────────────
  {
    cycle: 3, weekInCycle: 1, startDate: '2026-10-19', endDate: '2026-10-25', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'OVERTAL UITSPELEN (zelfde kant)',
    basics: {
      'U8-U9': '17. bij het leiden zoveel mogelijk terreinwinst boeken met het oog op de meest gunstige vervolgactie',
      'U10-U11': '04b. Ruimte creëren voor zichzelf en het benutten ervan',
      'U12-U13-U16M': '07b. Efficiënte balcirculatie: zo snel mogelijk nauwkeurig doorspelen van de bal',
      'U14-U17': '09b. Diagonale/verticale passing: snelle pas naar de zwakke zone (= 1v0/1v1/2v1) van de tegenpartij',
    },
  },
  {
    cycle: 3, weekInCycle: 2, startDate: '2026-10-26', endDate: '2026-11-01', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'SPEL VERLEGGEN (richting andere kant)',
    basics: {
      'U8-U9': '14. de lage bal gericht aannemen met het oog op de meest gunstige vervolgactie',
      'U10-U11': '18. zich draaien met de bal aan de voet met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '08. Efficiënte balcirculatie: een zo hoog mogelijke balsnelheid ontwikkelen',
      'U14-U17': '10. een lange opbouwpas spelen zodat de ontvanger in de meest gunstige omstandigheden verder kan spelen (juiste voet/snelheid/hoogte/moment)',
    },
  },
  {
    cycle: 3, weekInCycle: 3, startDate: '2026-11-02', endDate: '2026-11-08', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 3-2', teamprincipe: 'TEGENSTANDER MARKEREN', spelprincipe: 'NEGATIEVE PRESSING',
    basics: {
      'U8-U9': '33. het duel (= 1v1) over de grond winnen met het oog op een gunstige vervolgactie',
      'U10-U11': '25. de juiste keuze maken tussen het wel of niet intercepteren',
      'U12-U13-U16M': '29. de tegenstander aan de bal in zijn zone in de juiste lichaamshouding proactief en agressief onder druk zetten (= 1v1) zodat de meest gunstige vervolgactie (opbouwpas of dribbel) belet wordt',
      'U14-U17': '34. het duel (= 1v1) in de lucht winnen met het oog op een gunstige vervolgactie',
    },
  },
  {
    cycle: 3, weekInCycle: 4, startDate: '2026-11-09', endDate: '2026-11-15', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 3-2', teamprincipe: 'RESTVERDEDIGING', spelprincipe: 'OFFENSIEF MARKEREN',
    basics: {
      'U8-U9': '24. de juiste verdedigende keuze maken met het oog op scoren beletten (= afweren) of de meest gunstige vervolgactie (= remmend wijken of de bal afnemen/afweren in duel of door interceptie)',
      'U10-U11': '26. de opbouwpas, subtiele dieptepas of voorzet intercepteren met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '02. Evenredige onderlinge afstanden',
      'U14-U17': '03. Zo hoog mogelijk compact blok',
    },
  },
  {
    cycle: 3, weekInCycle: 5, startDate: '2026-11-16', endDate: '2026-11-22', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Cyclus 4 (geen neutrale week — kerstvakantie 21/dec-3/jan) ────────────
  {
    cycle: 4, weekInCycle: 1, startDate: '2026-11-23', endDate: '2026-11-29', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'BEZETTING WAARHEIDSZONE', spelprincipe: 'ASSISTZONE BEREIKEN (doellijn halen)',
    basics: {
      'U8-U9': '19. bij het dribbelen een tegenspeler uitschakelen met het oog op de meest gunstige vervolgactie',
      'U10-U11': '16a. Een kwaliteitsvolle voorzet trappen over de grond die bruikbaar is voor doel',
      'U12-U13-U16M': '12. een voorzet trappen waardoor vanuit de meest gunstige situatie kan afgewerkt worden',
      'U14-U17': '19b. Juiste timing bij het inlopen naar de juiste zones (Assistzone om voorzet te trappen)',
    },
  },
  {
    cycle: 4, weekInCycle: 2, startDate: '2026-11-30', endDate: '2026-12-06', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'BEZETTING WAARHEIDSZONE', spelprincipe: 'POSITIEKEUZE VOOR DOEL',
    basics: {
      'U8-U9': '21. van dichtbij met de voet (tot 11m) scoren',
      'U10-U11': '22. van halfver met de voet of het hoofd (tussen 11m en 20m) scoren',
      'U12-U13-U16M': '18a. Efficiënte bezetting voor doel door twee of drie spelers',
      'U14-U17': '18b. Efficiënte bezetting voor doel bij voorzet door minstens 4 spelers: 1ste – 2de paal, 11m en 16m',
    },
  },
  {
    cycle: 4, weekInCycle: 3, startDate: '2026-12-07', endDate: '2026-12-13', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3', teamprincipe: 'VERDEDIGEN VAN VOORZETTEN', spelprincipe: '1 vs 1 DUEL WINNEN (contact) OM VOORZET TE VERHINDEREN',
    basics: {
      'U8-U9': '15. Zich niet laten uitschakelen door een individuele actie in de waarheidszone',
      'U10-U11': '16. Een voorzet beletten/afblokken',
      'U12-U13-U16M': '27. de subtiele dieptepas, voorzet of doelpoging afweren naar een voor de tegenpartij ongunstige plaats',
      'U14-U17': '19b. Agressiviteit om 1ste op de bal bij voorzet te zijn: Anticiperen op lopende speler',
    },
  },
  {
    cycle: 4, weekInCycle: 4, startDate: '2026-12-14', endDate: '2026-12-20', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3', teamprincipe: 'VERDEDIGEN VAN VOORZETTEN', spelprincipe: 'DEFENSIEVE (T) BEZETTING VOOR DOEL',
    basics: {
      'U8-U9': '32. het duel (= 1v1) zodanig aangaan dat hij de speler aan de bal belet om naar doel te trappen',
      'U10-U11': '39. door strikte dekking beletten dat zijn rechtstreekse tegenstander aangespeeld wordt of in gunstige omstandigheden zijn vervolgactie kan uitvoeren',
      'U12-U13-U16M': '18a. Efficiënte bezetting voor doel bij voorzet: defensieve T-vorm (2+1)',
      'U14-U17': '18b. Efficiënte bezetting voor doel bij voorzet: defensieve T-vorm (3+1)',
    },
  },

  // ── Cyclus 5 ──────────────────────────────────────────────────────────────
  {
    cycle: 5, weekInCycle: 1, startDate: '2027-01-04', endDate: '2027-01-10', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'LINIES DOORBREKEN', spelprincipe: 'DIAGONALE EN VERTICALE PASSING',
    basics: {
      'U8-U9': '01. Zich aanspeelbaar opstellen t.o.v. de speler aan de bal met het oog op de meest gunstige vervolgactie',
      'U10-U11': '04. Zich lager dan de baldrager aanspeelbaar opstellen (= steunen)',
      'U12-U13-U16M': '15. De halfhoge bal gericht aannemen met het oog op de meest gunstige vervolgactie',
      'U14-U17': '16. De hoge bal gericht aannemen met het oog op de meest gunstige vervolgactie',
    },
  },
  {
    cycle: 5, weekInCycle: 2, startDate: '2027-01-11', endDate: '2027-01-17', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'LINIES DOORBREKEN', spelprincipe: 'DIAGONALE EN VERTICALE PASSING',
    basics: {
      'U8-U9': '08. een korte opbouwpas spelen zodat de ontvanger in de meest gunstige omstandigheden verder kan spelen (juiste voet/snelheid/hoogte/moment)',
      'U10-U11': '07. De juiste keuze maken naar welke medespeler hij de opbouwpas geeft',
      'U12-U13-U16M': '07b. Efficiënte balcirculatie: zo snel mogelijk nauwkeurig doorspelen',
      'U14-U17': '03a. Driehoekspel: aanspeelbaarheid vanuit opgelegde spelposities',
    },
  },
  {
    cycle: 5, weekInCycle: 3, startDate: '2027-01-18', endDate: '2027-01-24', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 1-2', teamprincipe: 'TEGENSTANDER MARKEREN', spelprincipe: 'HOGE INTENSITEIT / 1 OP 1 DOORDEKKEN (DURF / LEF)',
    basics: {
      'U8-U9': '24. De juiste verdedigende keuze maken om scoren te beletten',
      'U10-U11': '25. De juiste keuze maken tussen het wel of niet intercepteren',
      'U12-U13-U16M': '29. de tegenstander aan de bal in zijn zone in de juiste lichaamshouding proactief en agressief onder druk zetten (= 1v1) zodat de meest gunstige vervolgactie (opbouwpas of dribbel) belet wordt',
      'U14-U17': '28. De juiste keuze maken tussen agressief druk zetten of defensief in het blok komen',
    },
  },
  {
    cycle: 5, weekInCycle: 4, startDate: '2027-01-25', endDate: '2027-01-31', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 1-2', teamprincipe: 'HOOG COMPACT BLOK', spelprincipe: 'CENTRUM SLUITEN',
    basics: {
      'U8-U9': '33. Het duel (1v1) over de grond winnen met het oog op een gunstige vervolgactie',
      'U10-U11': '26. De opbouwpas, subtiele dieptepas of voorzet intercepteren',
      'U12-U13-U16M': '37. De speelhoeken naar zijn rechtstreekse tegenstander zo goed mogelijk afsluiten',
      'U14-U17': '34. Het duel (1v1) in de lucht winnen met het oog op een gunstige vervolgactie',
    },
  },
  {
    cycle: 5, weekInCycle: 5, startDate: '2027-02-01', endDate: '2027-02-07', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Cyclus 6 ──────────────────────────────────────────────────────────────
  {
    cycle: 6, weekInCycle: 1, startDate: '2027-02-08', endDate: '2027-02-14', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'INFILTRATIES MET / ZONDER BAL',
    basics: {
      'U8-U9': '19. Bij het dribbelen een tegenspeler uitschakelen met het oog op de meest gunstige vervolgactie',
      'U10-U11': '20. De juiste keuze maken tussen 1 tijd of na een balaanname scoren',
      'U12-U13-U16M': '12. Efficiënte infiltratie zonder bal na een pas: give & go',
      'U14-U17': '05. bij kans op subtiele dieptepas op het juiste ogenblik in de rug van de laatste lijn duiken (geen buitenspel) met het oog op scoren',
    },
  },
  {
    cycle: 6, weekInCycle: 2, startDate: '2027-02-15', endDate: '2027-02-21', fase: 'BALBEZIT',
    spelfase: 'DOELKANSEN CREËREN EN SCOREN - FASE 2-3', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'INFILTRATIES MET / ZONDER BAL',
    basics: {
      'U8-U9': '21. Van dichtbij met de voet (tot 11 m) scoren',
      'U10-U11': '22. Van halfver (11–20 m) met de voet scoren',
      'U12-U13-U16M': '13. Efficiënte infiltratie zonder bal op het juiste moment: bij ruimte om overload te creëren',
      'U14-U17': '11. een subtiele dieptepas trappen/koppen waardoor vanuit de meest gunstige situatie kan afgewerkt worden',
    },
  },
  {
    cycle: 6, weekInCycle: 3, startDate: '2027-02-22', endDate: '2027-02-28', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3-2', teamprincipe: '(HOOG) COMPACT BLOK', spelprincipe: 'SCHUIVEN EN KANTELEN',
    basics: {
      'U8-U9': '32. Het duel zodanig aangaan dat hij de speler aan de bal belet om naar doel te trappen',
      'U10-U11': '35. De juiste keuze maken tussen remmend wijken of het duel aangaan',
      'U12-U13-U16M': '31. Het duel zodanig aangaan dat hij de speler aan de bal belet om naar doel te trappen',
      'U14-U17': '38. de speelhoeken naar zijn rechtstreekse tegenstander zo goed mogelijk afsluiten met het oog op het beletten van de subtiele dieptepas',
    },
  },
  {
    cycle: 6, weekInCycle: 4, startDate: '2027-03-01', endDate: '2027-03-07', fase: 'BALVERLIES',
    spelfase: 'DOELKANSEN VERHINDEREN EN SCOREN BELETTEN - FASE 3-2', teamprincipe: '(HOOG) COMPACT BLOK', spelprincipe: 'TEGENSTANDER NAAR GEWENSTE ZONE DWINGEN',
    basics: {
      'U8-U9': '15. Zich niet laten uitschakelen door een individuele actie in de waarheidszone',
      'U10-U11': '36. De tegenspeler aan de bal afremmen waardoor medespelers kunnen terugkeren',
      'U12-U13-U16M': '27. De subtiele dieptepas, voorzet of doelpoging afweren naar een ongunstige zone',
      'U14-U17': '19a. Anticiperen om als eerste op de bal te zijn bij een voorzet',
    },
  },
  {
    cycle: 6, weekInCycle: 5, startDate: '2027-03-08', endDate: '2027-03-14', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Cyclus 7 ──────────────────────────────────────────────────────────────
  {
    cycle: 7, weekInCycle: 1, startDate: '2027-03-15', endDate: '2027-03-21', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'OVERTAL UITSPELEN (zelfde kant)',
    basics: {
      'U8-U9': '17. bij het leiden zoveel mogelijk terreinwinst boeken met het oog op de meest gunstige vervolgactie',
      'U10-U11': '04b. Ruimte creëren voor zichzelf en het benutten ervan',
      'U12-U13-U16M': '07b. Efficiënte balcirculatie: zo snel mogelijk nauwkeurig doorspelen van de bal',
      'U14-U17': '03b. Driehoekspel: aanspeelbaarheid met aandacht voor wisselende posities',
    },
  },
  {
    cycle: 7, weekInCycle: 2, startDate: '2027-03-22', endDate: '2027-03-28', fase: 'BALBEZIT',
    spelfase: 'OPBOUW - FASE 1-2', teamprincipe: 'NUMERIEK OVERTAL CREËREN', spelprincipe: 'SPEL VERLEGGEN (richting andere kant)',
    basics: {
      'U8-U9': '14. de lage bal gericht aannemen met het oog op de meest gunstige vervolgactie',
      'U10-U11': '18. zich draaien met de bal aan de voet met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '08. Efficiënte balcirculatie: een zo hoog mogelijke balsnelheid ontwikkelen',
      'U14-U17': '09b. Diagonale/verticale passing: snelle pas naar de zwakke zone van de tegenpartij',
    },
  },
  {
    cycle: 7, weekInCycle: 3, startDate: '2027-03-29', endDate: '2027-04-04', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 3-2', teamprincipe: 'TEGENSTANDER MARKEREN', spelprincipe: 'NEGATIEVE PRESSING',
    basics: {
      'U8-U9': '33. het duel (= 1v1) over de grond winnen met het oog op een gunstige vervolgactie',
      'U10-U11': '26. De opbouwpas, subtiele dieptepas of voorzet intercepteren met het oog op de meest gunstige vervolgactie',
      'U12-U13-U16M': '29. de tegenstander aan de bal in zijn zone in de juiste lichaamshouding proactief en agressief onder druk zetten (= 1v1) zodat de meest gunstige vervolgactie (opbouwpas of dribbel) belet wordt',
      'U14-U17': '28. De juiste keuze maken tussen agressief en proactief druk zetten of defensief in het blok komen',
    },
  },
  {
    cycle: 7, weekInCycle: 4, startDate: '2027-04-05', endDate: '2027-04-11', fase: 'BALVERLIES',
    spelfase: 'OPBOUW VERSTOREN - FASE 3-2', teamprincipe: 'RESTVERDEDIGING', spelprincipe: 'OFFENSIEF MARKEREN',
    basics: {
      'U8-U9': '24. de juiste verdedigende keuze maken met het oog op scoren beletten (= afweren) of de meest gunstige vervolgactie (= remmend wijken of de bal afnemen/afweren in duel of door interceptie)',
      'U10-U11': '39. Door strikte dekking beletten dat de rechtstreekse tegenstander aangespeeld wordt of in gunstige omstandigheden zijn actie kan uitvoeren',
      'U12-U13-U16M': '40. Aan de dichtste medespeler zodanig rugdekking geven dat hij snel druk kan zetten wanneer zijn medespeler uitgeschakeld is',
      'U14-U17': '42. Onmiddellijk na balverlies van de niet-dichtste medespeler de juiste verdedigende taak uitvoeren om een gevaarlijke tegenaanval te beletten',
    },
  },
  {
    cycle: 7, weekInCycle: 5, startDate: '2027-04-12', endDate: '2027-04-18', fase: 'NEUTRAAL',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },

  // ── Slotweken ────────────────────────────────────────────────────────────
  {
    cycle: 8, weekInCycle: 1, startDate: '2027-04-19', endDate: '2027-04-25', fase: 'SLOTWEKEN',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },
  {
    cycle: 8, weekInCycle: 2, startDate: '2027-04-26', endDate: '2027-05-02', fase: 'SLOTWEKEN',
    spelfase: '', teamprincipe: '', spelprincipe: NEUTRAAL_NOTE, basics: {},
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map een team-categorie (U6..U17) naar de leeftijdsbracket die het jaarplan gebruikt. */
export function getCategoryBracket(category: string): JaarplanBracket {
  if (['U6', 'U7', 'U8', 'U9'].includes(category)) return 'U8-U9';
  if (['U10', 'U11'].includes(category)) return 'U10-U11';
  if (['U12', 'U13'].includes(category)) return 'U12-U13-U16M';
  return 'U14-U17'; // U14, U15, U17, U16M
}

/** Zoekt het jaarplan-weekblok waarin de gegeven datum valt (of null, bv. tijdens de kerstvakantie). */
export function getJaarplanWeekForDate(date: Date): JaarplanWeek | null {
  const iso = date.toISOString().slice(0, 10);
  return JAARPLAN_2026_2027.find(w => iso >= w.startDate && iso <= w.endDate) ?? null;
}

export function formatJaarplanLabel(week: JaarplanWeek): string {
  if (week.fase === 'SLOTWEKEN') return `Slotweken`;
  const faseLabel = week.fase === 'NEUTRAAL' ? 'Neutrale week' : week.fase === 'BALBEZIT' ? 'Balbezit' : 'Balverlies';
  return `Cyclus ${week.cycle} · Week ${week.weekInCycle} · ${faseLabel}`;
}
