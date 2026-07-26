// Custom GraphQL mutation to export a Training + its Exercises to the club's
// official PowerPoint template. Binary output travels over GraphQL as a
// base64 string (there is no native binary/file transport here), decoded and
// downloaded client-side.

import { GraphQLSchema } from 'graphql';
import { mergeSchemas } from '@graphql-tools/schema';
import { exportTrainingPptx, ExportTraining } from './lib/exportTrainingPptx';

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
      }
    `,
    resolvers: {
      Mutation: {
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
      },
    },
  });
}
