// Vult het officiële KFC-trainingssjabloon (assets/templates/training-kfc-template.pptx)
// in met de gegevens van een Training + Exercises, en levert de resulterende
// .pptx terug als Buffer. Posities/shape-namen hieronder zijn rechtstreeks
// gemeten op dat bestand (zie de "Google Shape;NNN;pX"-namen in de XML) —
// dit moet in sync blijven als het sjabloonbestand ooit vervangen wordt.

import path from 'path';
import { Automizer, ModifyTextHelper } from 'pptx-automizer';
import { ISlide } from 'pptx-automizer/dist/interfaces/islide';
import { parseDrawingScene } from './drawingSvg';
import { renderDrawingPng } from './renderDrawingPng';

const TEMPLATE_DIR = path.join(__dirname, '..', 'assets', 'templates');
const TEMPLATE_FILE = 'training-kfc-template.pptx';

const FASE_LABELS: Record<string, string> = {
  opwarming: 'OPWARMING', tussenvorm: 'TUSSENVORM', wedstrijdvorm: 'WEDSTRIJDVORM', cooling_down: 'COOLING DOWN',
};

function emuToIn(emu: number): number { return emu / 914400; }

function multiText(value: string | null | undefined) {
  const lines = (value ?? '').split('\n');
  return lines.map(text => ({ paragraph: {}, textRuns: [{ text }] }));
}

// ── Slide 2: Trainingsvoorbereiding · Leren · Actief/Fun/Individuele aandacht ──
const KOP_SHAPES = {
  coachNaam: 'Google Shape;451;p3',
  datum: 'Google Shape;452;p3',
  tijdstip: 'Google Shape;453;p3',
  leeftijdscategorie: 'Google Shape;454;p3',
  niveau: 'Google Shape;455;p3',
  hoofdmoment: 'Google Shape;448;p3',
  spelfase: 'Google Shape;449;p3',
  basisvaardigheid: 'Google Shape;450;p3',
  speluitdagingWie: 'Google Shape;439;p3',
  speluitdagingWat: 'Google Shape;445;p3',
  speluitdagingWaar: 'Google Shape;446;p3',
  speluitdagingWanneer: 'Google Shape;447;p3',
  coachingswoorden: 'Google Shape;456;p3',
  materiaal: 'Google Shape;459;p3',
  actiefAanpak: 'Google Shape;457;p3',
  funAanpak: 'Google Shape;458;p3',
  individueleAandacht: 'Google Shape;438;p3',
} as const;

// ── Slide 5: Reflectie · 360° evaluatie ─────────────────────────────────────────
const REFLECTIE_SHAPES = {
  evalBehouden: 'Google Shape;643;p20',
  evalWijzigen: 'Google Shape;648;p20',
  evalWarenActief: 'Google Shape;644;p20',
  evalHaddenFun: 'Google Shape;645;p20',
  evalBijgeleerd: 'Google Shape;646;p20',
  evalIndividueleAandacht: 'Google Shape;647;p20',
} as const;

// ── Slide 3: oefening-template (hergebruikt per oefening) ─────────────────────
const EXERCISE_SHAPES = {
  beschrijving: 'Google Shape;469;p5',
  duur: 'Google Shape;470;p5',
  materiaalGrid: 'Google Shape;471;p5',
  spelers: 'Google Shape;472;p5',
  ruimte: 'Google Shape;473;p5',
  coaching: 'Google Shape;475;p5',
  maximaalActief: 'Google Shape;476;p5',
  fun: 'Google Shape;477;p5',
} as const;

// Groene banner bovenaan de oefeningpagina ("Titel oefening" in het lege
// sjabloon) — bestaat als eigen shape op de slide (geen layout-placeholder),
// vandaar rechtstreeks via naam aan te spreken i.p.v. via idx.
const EXERCISE_BANNER_SHAPE = 'Google Shape;433;p2';

const TITLE_SHAPE = 'Google Shape;433;p2';

// Exacte EMU-positie van de "Tekening oefening"-afbeeldingsplaats op de
// oefeningpagina (gemeten op het sjabloon).
const DRAWING_BOX = { x: 532636, y: 2521768, w: 6697723, h: 4336232 };

export interface ExportExercise {
  fase: string;
  naam: string;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
  drawingData: string;
}

export interface ExportTraining {
  titel: string;
  date: string;
  jaarplanLabel: string;
  coachNaam: string;
  tijdstip: string;
  leeftijdscategorie: string;
  niveau: string;
  hoofdmoment: string;
  spelfase: string;
  basisvaardigheid: string;
  speluitdagingWie: string;
  speluitdagingWat: string;
  speluitdagingWaar: string;
  speluitdagingWanneer: string;
  coachingswoorden: string;
  materiaal: string;
  actiefAanpak: string;
  funAanpak: string;
  individueleAandacht: string;
  evalBehouden: string;
  evalWijzigen: string;
  evalWarenActief: string;
  evalHaddenFun: string;
  evalBijgeleerd: string;
  evalIndividueleAandacht: string;
  exercises: ExportExercise[];
}

export async function exportTrainingPptx(training: ExportTraining): Promise<Buffer> {
  const automizer = new Automizer({
    templateDir: TEMPLATE_DIR,
    removeExistingSlides: true,
    verbosity: 0,
  });

  const pres = automizer.loadRoot(TEMPLATE_FILE).load(TEMPLATE_FILE, 'tpl');

  const set = (slide: ISlide, shape: string, value: string) =>
    slide.modifyElement(shape, [ModifyTextHelper.setMultiText(multiText(value))]);

  // Slide 1 — titel
  pres.addSlide('tpl', 1, slide => {
    const dateLabel = training.date ? new Date(training.date).toLocaleDateString('nl-BE') : '';
    const titleText = [dateLabel, training.titel, training.jaarplanLabel].filter(Boolean).join(' · ') || 'Trainingsvoorbereiding';
    set(slide, TITLE_SHAPE, titleText);
  });

  // Slide 2 — kop / leren / actief-fun-individuele aandacht
  pres.addSlide('tpl', 2, slide => {
    const dateLabel = training.date ? new Date(training.date).toLocaleDateString('nl-BE') : '';
    set(slide, KOP_SHAPES.coachNaam, training.coachNaam);
    set(slide, KOP_SHAPES.datum, dateLabel);
    set(slide, KOP_SHAPES.tijdstip, training.tijdstip);
    set(slide, KOP_SHAPES.leeftijdscategorie, training.leeftijdscategorie);
    set(slide, KOP_SHAPES.niveau, training.niveau);
    set(slide, KOP_SHAPES.hoofdmoment, training.hoofdmoment);
    set(slide, KOP_SHAPES.spelfase, training.spelfase);
    set(slide, KOP_SHAPES.basisvaardigheid, training.basisvaardigheid);
    set(slide, KOP_SHAPES.speluitdagingWie, training.speluitdagingWie);
    set(slide, KOP_SHAPES.speluitdagingWat, training.speluitdagingWat);
    set(slide, KOP_SHAPES.speluitdagingWaar, training.speluitdagingWaar);
    set(slide, KOP_SHAPES.speluitdagingWanneer, training.speluitdagingWanneer);
    set(slide, KOP_SHAPES.coachingswoorden, training.coachingswoorden);
    set(slide, KOP_SHAPES.materiaal, training.materiaal);
    set(slide, KOP_SHAPES.actiefAanpak, training.actiefAanpak);
    set(slide, KOP_SHAPES.funAanpak, training.funAanpak);
    set(slide, KOP_SHAPES.individueleAandacht, training.individueleAandacht);
  });

  // Eén slide per oefening, telkens gekloond van de sjabloon-oefeningpagina.
  for (const ex of training.exercises) {
    const scene = parseDrawingScene(ex.drawingData);
    const pngBuffer = await renderDrawingPng(scene);
    const pngDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    const faseLabel = FASE_LABELS[ex.fase] ?? ex.fase.toUpperCase();
    // Banner-formaat "<FASE>: <naam>" — zelfde formaat als de echte KFC-template
    // (zie ook detectFaseAndNaamFromBanner in frontend/src/lib/pdfImport.ts).
    const banner = `${faseLabel}: ${ex.naam || 'Oefening'}`;

    pres.addSlide('tpl', 3, slide => {
      set(slide, EXERCISE_SHAPES.beschrijving, ex.beschrijving);
      set(slide, EXERCISE_SHAPES.duur, `${ex.duurMinuten} min`);
      set(slide, EXERCISE_SHAPES.materiaalGrid, ex.organisatieMateriaal);
      set(slide, EXERCISE_SHAPES.spelers, ex.organisatieSpelers);
      set(slide, EXERCISE_SHAPES.ruimte, ex.organisatieAfmetingen);
      set(slide, EXERCISE_SHAPES.coaching, ex.coachingPunten);
      set(slide, EXERCISE_SHAPES.maximaalActief, ex.maximaalActief);
      set(slide, EXERCISE_SHAPES.fun, ex.fun);
      set(slide, EXERCISE_BANNER_SHAPE, banner);

      // De tekening zelf bestaat niet als los invulveld in het lege sjabloon
      // (die wordt pas toegevoegd zodra een trainer ze manueel intekent) —
      // dus voegen we ze hier toe als nieuw beeld-element, op exact dezelfde
      // plek als in een echt ingevulde training.
      slide.generate(pSlide => {
        pSlide.addImage({
          data: pngDataUri,
          x: emuToIn(DRAWING_BOX.x), y: emuToIn(DRAWING_BOX.y),
          w: emuToIn(DRAWING_BOX.w), h: emuToIn(DRAWING_BOX.h),
        });
      });
    });
  }

  // Statische tussenslide "EVALUATIE NA TRAINING" — geen dynamische inhoud nodig.
  pres.addSlide('tpl', 4);

  // Slide 5 — reflectie · 360° evaluatie
  pres.addSlide('tpl', 5, slide => {
    set(slide, REFLECTIE_SHAPES.evalBehouden, training.evalBehouden);
    set(slide, REFLECTIE_SHAPES.evalWijzigen, training.evalWijzigen);
    set(slide, REFLECTIE_SHAPES.evalWarenActief, training.evalWarenActief);
    set(slide, REFLECTIE_SHAPES.evalHaddenFun, training.evalHaddenFun);
    set(slide, REFLECTIE_SHAPES.evalBijgeleerd, training.evalBijgeleerd);
    set(slide, REFLECTIE_SHAPES.evalIndividueleAandacht, training.evalIndividueleAandacht);
  });

  const zip = await pres.getJSZip();
  return zip.generateAsync({ type: 'nodebuffer' });
}
