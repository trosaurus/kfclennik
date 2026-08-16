// Custom GraphQL mutation to export a Training + its Exercises to the club's
// official PowerPoint template. Binary output travels over GraphQL as a
// base64 string (there is no native binary/file transport here), decoded and
// downloaded client-side.

import { GraphQLSchema } from 'graphql';
import { mergeSchemas } from '@graphql-tools/schema';
import { exportTrainingPptx, exportExercisePptx, ExportTraining, ExportExercise } from './lib/exportTrainingPptx';
import { exportTrainingPdf } from './lib/exportTrainingPdf';
import { saveTeamManual, deleteTeamManual } from './lib/manualUpload';

const EXERCISE_QUERY = `
  id fase naam duurMinuten
  organisatieSpelers organisatieAfmetingen organisatieMateriaal
  beschrijving coachingPunten maximaalActief fun drawingData
`;

function requireSignedIn(context: any): void {
  if (!context.session) throw new Error('Niet ingelogd.');
}

function requireOwnTeamOrAdmin(context: any, teamId: string): void {
  const session = context.session;
  if (!session) throw new Error('Niet ingelogd.');
  if (session.data.role !== 'admin' && session.data.team?.id !== teamId) {
    throw new Error('Geen toegang tot deze ploeg.');
  }
}

const TRAINING_QUERY = `
  id titel date jaarplanLabel
  coachNaam tijdstip leeftijdscategorie niveau
  hoofdmoment spelfase basisvaardigheid
  speluitdagingWie speluitdagingWat speluitdagingWaar speluitdagingWanneer
  coachingswoorden materiaal
  actiefAanpak funAanpak individueleAandacht
  evalBehouden evalWijzigen evalWarenActief evalHaddenFun evalBijgeleerd evalIndividueleAandacht
  exercises(orderBy: { order: asc }) {
    fase naam duurMinuten
    organisatieSpelers organisatieAfmetingen organisatieMateriaal
    beschrijving coachingPunten maximaalActief fun drawingData
  }
`;

/** Zet de ruwe GraphQL-respons van TRAINING_QUERY om naar de platte ExportTraining-
 * vorm — gedeeld tussen de PowerPoint- en PDF-export zodat beide exact dezelfde
 * data zien. */
function buildExportTrainingData(training: any): ExportTraining {
  return {
    titel: training.titel ?? '',
    date: training.date ?? '',
    jaarplanLabel: training.jaarplanLabel ?? '',
    coachNaam: training.coachNaam ?? '',
    tijdstip: training.tijdstip ?? '',
    leeftijdscategorie: training.leeftijdscategorie ?? '',
    niveau: training.niveau ?? '',
    hoofdmoment: training.hoofdmoment ?? '',
    spelfase: training.spelfase ?? '',
    basisvaardigheid: training.basisvaardigheid ?? '',
    speluitdagingWie: training.speluitdagingWie ?? '',
    speluitdagingWat: training.speluitdagingWat ?? '',
    speluitdagingWaar: training.speluitdagingWaar ?? '',
    speluitdagingWanneer: training.speluitdagingWanneer ?? '',
    coachingswoorden: training.coachingswoorden ?? '',
    materiaal: training.materiaal ?? '',
    actiefAanpak: training.actiefAanpak ?? '',
    funAanpak: training.funAanpak ?? '',
    individueleAandacht: training.individueleAandacht ?? '',
    evalBehouden: training.evalBehouden ?? '',
    evalWijzigen: training.evalWijzigen ?? '',
    evalWarenActief: training.evalWarenActief ?? '',
    evalHaddenFun: training.evalHaddenFun ?? '',
    evalBijgeleerd: training.evalBijgeleerd ?? '',
    evalIndividueleAandacht: training.evalIndividueleAandacht ?? '',
    exercises: (training.exercises ?? []).map((ex: any) => ({
      fase: ex.fase ?? 'tussenvorm',
      naam: ex.naam ?? '',
      duurMinuten: ex.duurMinuten ?? 0,
      organisatieSpelers: ex.organisatieSpelers ?? '',
      organisatieAfmetingen: ex.organisatieAfmetingen ?? '',
      organisatieMateriaal: ex.organisatieMateriaal ?? '',
      beschrijving: ex.beschrijving ?? '',
      coachingPunten: ex.coachingPunten ?? '',
      maximaalActief: ex.maximaalActief ?? '',
      fun: ex.fun ?? '',
      drawingData: ex.drawingData ?? '',
    })),
  };
}

export function extendGraphqlSchema(schema: GraphQLSchema): GraphQLSchema {
  return mergeSchemas({
    schemas: [schema],
    typeDefs: `
      type Mutation {
        exportTrainingPptx(id: ID!): String
        exportExercisePptx(id: ID!): String
        exportTrainingPdf(id: ID!): String
        uploadTeamManual(teamId: ID!, filename: String!, contentBase64: String!): Team
        removeTeamManual(teamId: ID!): Team
      }
    `,
    resolvers: {
      Mutation: {
        uploadTeamManual: async (
          _root: unknown,
          { teamId, filename, contentBase64 }: { teamId: string; filename: string; contentBase64: string },
          context: any
        ) => {
          requireOwnTeamOrAdmin(context, teamId);
          const { text, uploadedAt } = await saveTeamManual(teamId, contentBase64);
          // context.sudo(): Team.update staat bewust op admin-only (zie schema.ts/
          // access.ts) omdat trainers de ploeg zelf niet mogen hernoemen — maar
          // ze moeten wél de manual van hun eigen ploeg kunnen uploaden. De
          // requireOwnTeamOrAdmin-check hierboven ís de autorisatie hiervoor;
          // sudo() slaat enkel de generieke Team.update-check over voor dit ene,
          // al-geautoriseerde veldenupdate.
          // context.db (i.s.o. context.query) geeft de rauwe Prisma-waarden terug
          // (een echt Date-object voor manualUploadedAt) i.p.v. via een interne
          // GraphQL-uitvoering te gaan, waar de DateTime-scalar een Date-instantie
          // verwacht bij het serialiseren van de respons.
          return context.sudo().db.Team.updateOne({
            where: { id: teamId },
            data: { manualFileName: filename, manualUploadedAt: uploadedAt, manualText: text },
          });
        },
        removeTeamManual: async (_root: unknown, { teamId }: { teamId: string }, context: any) => {
          requireOwnTeamOrAdmin(context, teamId);
          deleteTeamManual(teamId);
          return context.sudo().db.Team.updateOne({
            where: { id: teamId },
            data: { manualFileName: '', manualUploadedAt: null, manualText: '' },
          });
        },
        exportTrainingPptx: async (_root: unknown, { id }: { id: string }, context: any) => {
          requireSignedIn(context);
          // Training.query-access is al ploeg-gescoped (zie schema.ts) — een
          // training buiten de eigen ploeg komt hier gewoon als `null` terug,
          // exact zoals een training die echt niet bestaat.
          const training = await context.query.Training.findOne({ where: { id }, query: TRAINING_QUERY });
          if (!training) throw new Error('Training niet gevonden');

          const data = buildExportTrainingData(training);
          const buffer = await exportTrainingPptx(data);
          return buffer.toString('base64');
        },
        exportTrainingPdf: async (_root: unknown, { id }: { id: string }, context: any) => {
          requireSignedIn(context);
          // Zelfde ploeg-scoping als exportTrainingPptx hierboven.
          const training = await context.query.Training.findOne({ where: { id }, query: TRAINING_QUERY });
          if (!training) throw new Error('Training niet gevonden');

          const data = buildExportTrainingData(training);
          const buffer = await exportTrainingPdf(data);
          return buffer.toString('base64');
        },
        exportExercisePptx: async (_root: unknown, { id }: { id: string }, context: any) => {
          requireSignedIn(context);
          // Exercise.query-access is al ploeg-gescoped via de training (zie
          // schema.ts) — een oefening buiten de eigen ploeg komt hier gewoon als
          // `null` terug, exact zoals een oefening die echt niet bestaat.
          const ex = await context.query.Exercise.findOne({ where: { id }, query: EXERCISE_QUERY });
          if (!ex) throw new Error('Oefening niet gevonden');

          const data: ExportExercise = {
            fase: ex.fase ?? 'tussenvorm',
            naam: ex.naam ?? '',
            duurMinuten: ex.duurMinuten ?? 0,
            organisatieSpelers: ex.organisatieSpelers ?? '',
            organisatieAfmetingen: ex.organisatieAfmetingen ?? '',
            organisatieMateriaal: ex.organisatieMateriaal ?? '',
            beschrijving: ex.beschrijving ?? '',
            coachingPunten: ex.coachingPunten ?? '',
            maximaalActief: ex.maximaalActief ?? '',
            fun: ex.fun ?? '',
            drawingData: ex.drawingData ?? '',
          };

          const buffer = await exportExercisePptx(data);
          return buffer.toString('base64');
        },
      },
    },
  });
}
