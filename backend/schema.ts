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
      trainers: relationship({ ref: 'Trainer.team', many: true }),
      players: relationship({ ref: 'Player.team', many: true }),
      matches: relationship({ ref: 'Match.team', many: true }),
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
};
