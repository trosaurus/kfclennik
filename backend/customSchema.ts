// Custom GraphQL mutation to export a Training + its Exercises to the club's
// official PowerPoint template. Binary output travels over GraphQL as a
// base64 string (there is no native binary/file transport here), decoded and
// downloaded client-side.

import { GraphQLSchema } from 'graphql';
import { mergeSchemas } from '@graphql-tools/schema';
import { exportTrainingPptx, exportExercisePptx, ExportTraining, ExportExercise } from './lib/exportTrainingPptx';
import { saveTeamManual, deleteTeamManual } from './lib/manualUpload';

const EXERCISE_QUERY = `
  id fase naam duurMinuten
  organisatieSpelers organisatieAfmetingen organisatieMateriaal
  beschrijving coachingPunten maximaalActief fun drawingData
`;

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

export function extendGraphqlSchema(schema: GraphQLSchema): GraphQLSchema {
  return mergeSchemas({
    schemas: [schema],
    typeDefs: `
      type Mutation {
        exportTrainingPptx(id: ID!): String
        exportExercisePptx(id: ID!): String
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
          const { text, uploadedAt } = await saveTeamManual(teamId, contentBase64);
          // context.db (i.s.o. context.query) geeft de rauwe Prisma-waarden terug
          // (een echt Date-object voor manualUploadedAt) i.p.v. via een interne
          // GraphQL-uitvoering te gaan, waar de DateTime-scalar een Date-instantie
          // verwacht bij het serialiseren van de respons.
          return context.db.Team.updateOne({
            where: { id: teamId },
            data: { manualFileName: filename, manualUploadedAt: uploadedAt, manualText: text },
          });
        },
        removeTeamManual: async (_root: unknown, { teamId }: { teamId: string }, context: any) => {
          deleteTeamManual(teamId);
          return context.db.Team.updateOne({
            where: { id: teamId },
            data: { manualFileName: '', manualUploadedAt: null, manualText: '' },
          });
        },
        exportTrainingPptx: async (_root: unknown, { id }: { id: string }, context: any) => {
          const training = await context.query.Training.findOne({ where: { id }, query: TRAINING_QUERY });
          if (!training) throw new Error('Training niet gevonden');

          const data: ExportTraining = {
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

          const buffer = await exportTrainingPptx(data);
          return buffer.toString('base64');
        },
        exportExercisePptx: async (_root: unknown, { id }: { id: string }, context: any) => {
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
