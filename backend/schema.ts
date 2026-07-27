import { list } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import { text, integer, relationship, timestamp, select, password } from '@keystone-6/core/fields';
import type { Lists } from '.keystone/types';

// ── Lists ──────────────────────────────────────────────────────────────────────

export const lists: Lists = {

  // ── Trainer (user account) ──────────────────────────────────────────────────
  Trainer: list({
    access: allowAll,
    fields: {
      name:  text({ validation: { isRequired: true } }),
      email: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
      password: password({ validation: { isRequired: true } }),
      role: select({
        options: [
          { label: 'Admin',   value: 'admin' },
          { label: 'Trainer', value: 'trainer' },
        ],
        defaultValue: 'trainer',
      }),
      team: relationship({ ref: 'Team.trainers', many: false }),
      trainings: relationship({ ref: 'Training.trainer', many: true }),
    },
    ui: { labelField: 'name' },
  }),

  // ── Team ────────────────────────────────────────────────────────────────────
  Team: list({
    access: allowAll,
    fields: {
      name: text({ validation: { isRequired: true } }),
      category: select({
        validation: { isRequired: true },
        options: [
          { label: 'U6  (2v2)',  value: 'U6' },
          { label: 'U7  (3v3)',  value: 'U7' },
          { label: 'U8  (5v5)',  value: 'U8' },
          { label: 'U9  (5v5)',  value: 'U9' },
          { label: 'U10 (8v8)', value: 'U10' },
          { label: 'U11 (8v8)', value: 'U11' },
          { label: 'U12 (8v8)', value: 'U12' },
          { label: 'U13 (11v11)', value: 'U13' },
          { label: 'U15 (11v11)', value: 'U15' },
          { label: 'U17 (11v11)', value: 'U17' },
        ],
      }),
      club:    text({ defaultValue: '' }),
      active: select({
        defaultValue: 'true',
        options: [
          { label: 'Actief',   value: 'true' },
          { label: 'Inactief', value: 'false' },
        ],
      }),

      // ── Trainersmanual (PDF, per ploeg) — bestand op lokale schijf, tekst hier
      // geëxtraheerd zodat oefeningen-generatie op maat van deze ploeg kan matchen ──
      manualFileName:   text({ defaultValue: '' }),
      manualUploadedAt: timestamp({}),
      manualText:       text({ ui: { displayMode: 'textarea' } }),

      trainers: relationship({ ref: 'Trainer.team', many: true }),
      players: relationship({ ref: 'Player.team', many: true }),
      matches: relationship({ ref: 'Match.team', many: true }),
      trainings: relationship({ ref: 'Training.team', many: true }),
    },
    ui: { labelField: 'name' },
  }),

  // ── Player ──────────────────────────────────────────────────────────────────
  Player: list({
    access: allowAll,
    fields: {
      name:     text({ validation: { isRequired: true } }),
      number:   integer({}),
      position: select({
        options: [
          { label: 'Doelman',      value: 'keeper' },
          { label: 'Verdediger',   value: 'defender' },
          { label: 'Middenvelder', value: 'midfielder' },
          { label: 'Aanvaller',    value: 'forward' },
        ],
      }),
      active: select({
        defaultValue: 'true',
        options: [
          { label: 'Actief',   value: 'true' },
          { label: 'Inactief', value: 'false' },
        ],
      }),
      team:        relationship({ ref: 'Team.players',     many: false }),
      attendances: relationship({ ref: 'Attendance.player', many: true }),
      goals:       relationship({ ref: 'Goal.player',       many: true }),
      evaluations: relationship({ ref: 'Evaluation.player', many: true }),
    },
    ui: { labelField: 'name' },
  }),

  // ── Match ───────────────────────────────────────────────────────────────────
  Match: list({
    access: allowAll,
    fields: {
      opponent:      text({ validation: { isRequired: true } }),
      date:          timestamp({ validation: { isRequired: true } }),
      location: select({
        options: [
          { label: 'Thuis', value: 'home' },
          { label: 'Uit',   value: 'away' },
        ],
        defaultValue: 'home',
      }),
      status: select({
        options: [
          { label: 'Gepland',   value: 'planned' },
          { label: 'Bezig',     value: 'active' },
          { label: 'Afgelopen', value: 'finished' },
        ],
        defaultValue: 'planned',
      }),
      currentPeriod: integer({ defaultValue: 0 }),
      periodStatus: select({
        options: [
          { label: 'Niet gestart', value: 'idle' },
          { label: 'Loopt',        value: 'playing' },
          { label: 'Pauze',        value: 'paused' },
          { label: 'Klaar',        value: 'finished' },
        ],
        defaultValue: 'idle',
      }),
      scoreHome:      integer({ defaultValue: 0 }),
      scoreAway:      integer({ defaultValue: 0 }),
      matchStartTime: timestamp({}),
      team:        relationship({ ref: 'Team.matches',     many: false }),
      attendances: relationship({ ref: 'Attendance.match', many: true }),
      periods:     relationship({ ref: 'Period.match',     many: true }),
      goals:       relationship({ ref: 'Goal.match',       many: true }),
      weekTheme:   relationship({ ref: 'WeekTheme.matches', many: false }),
      evaluations: relationship({ ref: 'Evaluation.match',  many: true }),
    },
    ui: { labelField: 'opponent' },
  }),

  // ── Period ──────────────────────────────────────────────────────────────────
  Period: list({
    access: allowAll,
    fields: {
      match:           relationship({ ref: 'Match.periods', many: false }),
      periodNumber:    integer({ validation: { isRequired: true } }),
      scoreHome:       integer({ defaultValue: 0 }),
      scoreAway:       integer({ defaultValue: 0 }),
      startTime:       timestamp({}),
      endTime:         timestamp({}),
      durationSeconds: integer({ defaultValue: 900 }),
    },
    ui: { labelField: 'periodNumber' },
  }),

  // ── Goal ────────────────────────────────────────────────────────────────────
  Goal: list({
    access: allowAll,
    fields: {
      player:       relationship({ ref: 'Player.goals', many: false }),
      match:        relationship({ ref: 'Match.goals',  many: false }),
      periodNumber: integer({ defaultValue: 1 }),
      scoredAt:     timestamp({}),
    },
    ui: { labelField: 'scoredAt' },
  }),

  // ── Attendance ──────────────────────────────────────────────────────────────
  Attendance: list({
    access: allowAll,
    fields: {
      player:  relationship({ ref: 'Player.attendances', many: false }),
      match:   relationship({ ref: 'Match.attendances',  many: false }),
      present: select({
        defaultValue: 'false',
        options: [
          { label: 'Aanwezig', value: 'true' },
          { label: 'Afwezig',  value: 'false' },
        ],
      }),
      selected: select({
        defaultValue: 'false',
        options: [
          { label: 'Geselecteerd',      value: 'true' },
          { label: 'Niet geselecteerd', value: 'false' },
        ],
      }),
      playTimeSessions: relationship({ ref: 'PlayTimeSession.attendance', many: true }),
    },
  }),

  // ── PlayTimeSession ─────────────────────────────────────────────────────────
  PlayTimeSession: list({
    access: allowAll,
    fields: {
      attendance:      relationship({ ref: 'Attendance.playTimeSessions', many: false }),
      period:          integer({ defaultValue: 1 }),
      fieldPosition:   text({}),
      startTime:       timestamp({}),
      endTime:         timestamp({}),
      durationSeconds: integer({ defaultValue: 0 }),
      active: select({
        defaultValue: 'false',
        options: [
          { label: 'Actief',  value: 'true' },
          { label: 'Gestopt', value: 'false' },
        ],
      }),
    },
  }),

  // ── WeekTheme ───────────────────────────────────────────────────────────────
  WeekTheme: list({
    access: allowAll,
    fields: {
      title: text({ validation: { isRequired: true } }),
      category: select({
        validation: { isRequired: true },
        options: [
          { label: 'Bal+ (aanvallend)',  value: 'B+' },
          { label: 'Bal- (verdedigend)', value: 'B-' },
        ],
      }),
      description: text({ ui: { displayMode: 'textarea' } }),
      active: select({
        defaultValue: 'true',
        options: [
          { label: 'Actief',   value: 'true' },
          { label: 'Inactief', value: 'false' },
        ],
      }),
      createdAt:   timestamp({ defaultValue: { kind: 'now' } }),
      matches:     relationship({ ref: 'Match.weekTheme',      many: true }),
      evaluations: relationship({ ref: 'Evaluation.theme',     many: true }),
    },
    ui: { labelField: 'title' },
  }),

  // ── Evaluation ──────────────────────────────────────────────────────────────
  Evaluation: list({
    access: allowAll,
    fields: {
      player:    relationship({ ref: 'Player.evaluations',    many: false }),
      match:     relationship({ ref: 'Match.evaluations',     many: false }),
      theme:     relationship({ ref: 'WeekTheme.evaluations', many: false }),
      score:     integer({ validation: { isRequired: true, min: 1, max: 5 } }),
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),
    },
    ui: { labelField: 'score' },
  }),

  // ── Training (voorbereide trainingssessie — velden volgen Template_training_KFC) ──
  Training: list({
    access: allowAll,
    fields: {
      trainer:  relationship({ ref: 'Trainer.trainings', many: false }),   // maker, voor attributie
      team:     relationship({ ref: 'Team.trainings',    many: false }),
      date:     timestamp({ validation: { isRequired: true } }),
      titel:    text({ defaultValue: '' }),
      duurMinuten:   integer({ defaultValue: 90 }),
      aantalSpelers: text({ defaultValue: '' }),                // vrije tekst, bv. "10-14"
      status: select({
        defaultValue: 'concept',
        options: [
          { label: 'Concept',    value: 'concept' },
          { label: 'Klaar',      value: 'klaar' },
          { label: 'Afgewerkt',  value: 'afgewerkt' },
        ],
      }),
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),

      // ── Kop (template pagina 2 — bewust leeg standaard) ──
      coachNaam:            text({ defaultValue: '' }),
      tijdstip:             text({ defaultValue: '' }),
      leeftijdscategorie:   text({ defaultValue: '' }),
      niveau:               text({ defaultValue: '' }),

      // ── "LEREN" (template pagina 2) ──
      hoofdmoment:          text({ defaultValue: '' }),
      spelfase:             text({ defaultValue: '' }),
      basisvaardigheid:     text({ defaultValue: '' }),
      speluitdagingWie:      text({ defaultValue: '' }),
      speluitdagingWat:      text({ defaultValue: '' }),
      speluitdagingWaar:     text({ defaultValue: '' }),
      speluitdagingWanneer:  text({ defaultValue: '' }),
      coachingswoorden:     text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      materiaal:            text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),

      // ── "ACTIEF, FUN & INDIVIDUELE AANDACHT" (template pagina 2) ──
      actiefAanpak:          text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      funAanpak:             text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      individueleAandacht:   text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),

      // ── Jaarplan-koppeling (extra t.o.v. het template — automatische weekthema-invulling) ──
      teamprincipe:  text({ defaultValue: '' }),
      spelprincipe:  text({ defaultValue: '' }),
      focusPunten:   text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      jaarplanLabel: text({ defaultValue: '' }),                // bv. "Cyclus 3 · Week 2 · Balbezit"

      // ── "REFLECTIE • 360° EVALUATIE NA ELKE TRAINING" (template pagina 6) ──
      evalBehouden:            text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      evalWijzigen:            text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      evalWarenActief:         text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      evalHaddenFun:           text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      evalBijgeleerd:          text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      evalIndividueleAandacht: text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),

      exercises: relationship({ ref: 'Exercise.training', many: true }),
    },
    ui: { labelField: 'titel' },
  }),

  // ── OefeningDatabank (herbruikbare oefeningenbibliotheek, club-breed gedeeld) ──
  OefeningDatabank: list({
    access: allowAll,
    fields: {
      naam: text({ validation: { isRequired: true } }),
      fase: select({
        validation: { isRequired: true },
        options: [
          { label: 'Opwarming',     value: 'opwarming' },
          { label: 'Tussenvorm',    value: 'tussenvorm' },
          { label: 'Wedstrijdvorm', value: 'wedstrijdvorm' },
          { label: 'Cooling down',  value: 'cooling_down' },
        ],
      }),
      categorie: select({
        options: [
          { label: 'Bal+ (aanvallend)',  value: 'B+' },
          { label: 'Bal- (verdedigend)', value: 'B-' },
        ],
      }),
      doelgroep: select({
        options: [
          { label: 'U6',  value: 'U6' },
          { label: 'U7',  value: 'U7' },
          { label: 'U8',  value: 'U8' },
          { label: 'U9',  value: 'U9' },
          { label: 'U10', value: 'U10' },
          { label: 'U11', value: 'U11' },
          { label: 'U12', value: 'U12' },
          { label: 'U13', value: 'U13' },
          { label: 'U15', value: 'U15' },
          { label: 'U17', value: 'U17' },
        ],
      }),
      teamprincipe: text({ defaultValue: '' }),          // vrije tekst, matcht jaarplan-vocabularium
      duurMinuten:  integer({ defaultValue: 10 }),

      organisatieSpelers:    text({ defaultValue: '' }),
      organisatieAfmetingen: text({ defaultValue: '' }),
      organisatieMateriaal:  text({ defaultValue: '' }),

      beschrijving:    text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      drawingData:     text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // JSON-string (DrawingScene)
      coachingPunten:  text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      maximaalActief:  text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
      fun:             text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),

      createdBy: relationship({ ref: 'Trainer', many: false }),   // attributie, geen back-reference nodig
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),
    },
    ui: { labelField: 'naam' },
  }),

  // ── Exercise (oefening binnen een training — velden volgen template pagina 3-4) ──
  Exercise: list({
    access: allowAll,
    fields: {
      training: relationship({ ref: 'Training.exercises', many: false }),
      order:    integer({ defaultValue: 0 }),
      fase: select({
        validation: { isRequired: true },
        options: [
          { label: 'Opwarming',     value: 'opwarming' },
          { label: 'Tussenvorm',    value: 'tussenvorm' },
          { label: 'Wedstrijdvorm', value: 'wedstrijdvorm' },
          { label: 'Cooling down',  value: 'cooling_down' },
        ],
      }),
      naam:        text({ validation: { isRequired: true } }),
      duurMinuten: integer({ defaultValue: 10 }),               // "Organisatie oefening" — duur

      // ── "Organisatie oefening" (2x2-grid op het template) ──
      organisatieSpelers:     text({ defaultValue: '' }),
      organisatieAfmetingen:  text({ defaultValue: '' }),
      organisatieMateriaal:   text({ defaultValue: '' }),

      beschrijving:    text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // "Beschrijving oefening"
      drawingData:     text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // "Tekening oefening" — JSON-string (DrawingScene)
      coachingPunten:  text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // "Coaching"
      maximaalActief:  text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // "Maximaal actief"
      fun:             text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),  // "Fun"
    },
    ui: { labelField: 'naam' },
  }),
};
