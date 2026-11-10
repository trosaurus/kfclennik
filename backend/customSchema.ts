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

/** Ketent async werk per sleutel na elkaar i.p.v. gelijktijdig — gebruikt door
 * upsertMatchLineup/upsertLineupProposal hieronder. Zonder dit ziet elke
 * upsert-aanroep die snel na elkaar binnenkomt (bv. een speler per klik op het
 * veld zetten, of twee trainers die zowat gelijktijdig opslaan vanaf hun eigen
 * toestel) onafhankelijk "bestaat er al een rij" vóór de vorige create geland
 * is — met dubbele rijen tot gevolg, waarna een latere lezing een willekeurige
 * (mogelijk onvolledige) rij kan terugkrijgen i.p.v. de uiteindelijke volledige
 * opstelling. Dit leeft in de ene backend-procesruimte, dus — anders dan een
 * per-tabblad lock in de browser — geldt de serialisatie voor ALLE clients
 * samen, ongeacht van welk toestel de aanroep komt. */
const mutationChains = new Map<string, Promise<unknown>>();
function withKeyLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prev = mutationChains.get(key) ?? Promise.resolve();
  const result = prev.then(run, run);
  mutationChains.set(key, result.then(() => undefined, () => undefined));
  return result;
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
      # Losstaande resultaattypes i.p.v. de bestaande MatchLineup/LineupProposal
      # types hergebruiken: die laatste hebben zelf al veldresolvers (o.a. voor
      # de trainer-relatie) die Keystone er telkens overheen zou draaien zodra
      # een object van dat type ergens in de respons voorkomt — ook als het,
      # zoals hier, al een kant-en-klaar (via context.query opgehaald) resultaat
      # is. Dat botst: Keystone's resolver verwacht dan zelf nog een relatie te
      # moeten oplossen op een object dat dat al ís, wat crashte op het
      # trainer-veld ("results.map is not a function"). Platte, aparte types
      # zonder relatievelden omzeilen dat volledig.
      type MatchLineupResult {
        id: ID!
        period: Int!
        assignment: String!
        selectedPlayerIds: String!
      }
      type LineupProposalResult {
        id: ID!
        period: Int!
        assignment: String!
        trainerId: ID!
        trainerName: String!
      }
      type Mutation {
        exportTrainingPptx(id: ID!): String
        exportExercisePptx(id: ID!): String
        exportTrainingPdf(id: ID!): String
        uploadTeamManual(teamId: ID!, filename: String!, contentBase64: String!): Team
        removeTeamManual(teamId: ID!): Team
        upsertMatchLineup(matchId: ID!, period: Int!, assignment: String!, selectedPlayerIds: String!): MatchLineupResult
        upsertLineupProposal(matchId: ID!, period: Int!, assignment: String!): LineupProposalResult
        savePlannerSettings(matchId: ID!, expected: String!, value: String!): Boolean!
      }
    `,
    resolvers: {
      Mutation: {
        // Schrijft enkel als de database nog `expected` bevat, en geeft anders
        // false terug zodat de frontend zijn wijziging op de nieuwste versie kan
        // overdoen. Twee trainers die tegelijk iets aanpassen lezen allebei
        // dezelfde versie: zonder deze controle zou de tweede schrijver de
        // wijziging van de eerste stilletjes wissen. context.query houdt de
        // gewone toegangscontrole aan: een wedstrijd van een andere ploeg bestaat
        // hier gewoon niet.
        savePlannerSettings: async (
          _root: unknown,
          { matchId, expected, value }: { matchId: string; expected: string; value: string },
          context: any
        ) => {
          requireSignedIn(context);
          return withKeyLock(`plannerSettings:${matchId}`, async () => {
            const match = await context.query.Match.findOne({ where: { id: matchId }, query: 'id plannerSettings' });
            if (!match) throw new Error('Wedstrijd niet gevonden');
            if (match.plannerSettings !== expected) return false;
            await context.query.Match.updateOne({ where: { id: matchId }, data: { plannerSettings: value }, query: 'id' });
            return true;
          });
        },

        // Vervangt de vroegere aanpak waarbij de frontend zelf "bestaat er al een
        // rij" opzocht en dan create/update koos — dat is een klassieke
        // check-then-act race: bij snel na elkaar opslaan (meerdere posities
        // instellen, of twee trainers op hun eigen toestel) zagen meerdere
        // aanroepen tegelijk "nog geen rij", met dubbele MatchLineup-rijen tot
        // gevolg. Een latere lezing (bv. een ander toestel dat de match opent)
        // kreeg dan een willekeurige — mogelijk verouderde/onvolledige — rij
        // terug i.p.v. de laatst bevestigde opstelling. Hier zit diezelfde
        // find-dan-create/update-logica, maar geserialiseerd per match+kwart via
        // withKeyLock zodat ze nooit meer gelijktijdig kan lopen, ongeacht
        // hoeveel toestellen tegelijk opslaan.
        upsertMatchLineup: async (
          _root: unknown,
          { matchId, period, assignment, selectedPlayerIds }: { matchId: string; period: number; assignment: string; selectedPlayerIds: string },
          context: any
        ) => {
          requireSignedIn(context);
          const row = await withKeyLock(`matchLineup:${matchId}:${period}`, async () => {
            const existing = await context.query.MatchLineup.findMany({
              where: { match: { id: { equals: matchId } }, period: { equals: period } },
              query: 'id',
              take: 1,
            });
            if (existing[0]) {
              return context.query.MatchLineup.updateOne({
                where: { id: existing[0].id },
                data: { assignment, selectedPlayerIds },
                query: 'id period assignment selectedPlayerIds',
              });
            }
            return context.query.MatchLineup.createOne({
              data: { match: { connect: { id: matchId } }, period, assignment, selectedPlayerIds },
              query: 'id period assignment selectedPlayerIds',
            });
          });
          return { id: row.id, period: row.period, assignment: row.assignment, selectedPlayerIds: row.selectedPlayerIds };
        },
        // Zelfde upsert-race als hierboven, maar dan voor de per-trainer
        // voorkeursopstelling — geserialiseerd per match+trainer+kwart. De
        // trainer wordt altijd uit de sessie gehaald (nooit een client-
        // aangeleverd trainerId), zodat een trainer nooit onder een andere
        // naam een voorstel kan aanmaken of bijwerken.
        upsertLineupProposal: async (
          _root: unknown,
          { matchId, period, assignment }: { matchId: string; period: number; assignment: string },
          context: any
        ) => {
          requireSignedIn(context);
          const trainerId = context.session.data.id;
          const row = await withKeyLock(`lineupProposal:${matchId}:${trainerId}:${period}`, async () => {
            const existing = await context.query.LineupProposal.findMany({
              where: { match: { id: { equals: matchId } }, trainer: { id: { equals: trainerId } }, period: { equals: period } },
              query: 'id',
              take: 1,
            });
            if (existing[0]) {
              return context.query.LineupProposal.updateOne({
                where: { id: existing[0].id },
                data: { assignment },
                query: 'id period assignment trainer { id name }',
              });
            }
            return context.query.LineupProposal.createOne({
              data: { match: { connect: { id: matchId } }, trainer: { connect: { id: trainerId } }, period, assignment },
              query: 'id period assignment trainer { id name }',
            });
          });
          return { id: row.id, period: row.period, assignment: row.assignment, trainerId: row.trainer.id, trainerName: row.trainer.name };
        },
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
