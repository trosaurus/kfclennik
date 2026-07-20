const GQL_URL = (import.meta.env.VITE_API_URL ?? '') + '/api/graphql';

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    const msg = data.errors.map((e: { message: string }) => e.message).join('; ');
    console.error('GraphQL errors:', data.errors);
    throw new Error(msg);
  }
  return data.data;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  category: string;
  club: string;
  active: string;
}

export interface Player {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  active: string;
  team?: { id: string };
}

export interface Match {
  id: string;
  opponent: string;
  date: string;
  location: string;
  status: string;          // planned | active | finished
  currentPeriod: number;   // 0 = not started, 1-4
  periodStatus: string;    // idle | playing | paused | finished
  scoreHome: number;
  scoreAway: number;
  matchStartTime: string | null;
  team: { id: string; category: string } | null;
}

export interface Period {
  id: string;
  match: { id: string };
  periodNumber: number;
  scoreHome: number;
  scoreAway: number;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number;
}

export interface Attendance {
  id: string;
  player: Player;
  match: { id: string };
  present: string;
  selected: string;
}

export interface PlayTimeSession {
  id: string;
  attendance: { id: string };
  period: number;
  fieldPosition: string | null;  // 'K','2','3','5','6','7','9','11'
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  active: string;
}

export interface Goal {
  id: string;
  player: { id: string; name: string; number: number | null };
  match: { id: string };
  periodNumber: number;
  scoredAt: string;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  const data = await gql(`query {
    teams(take: 100, orderBy: { name: asc }) { id name category club active }
  }`);
  return data.teams;
}

export async function createTeam(input: { name: string; category: string; club?: string; trainerId?: string }): Promise<Team> {
  const teamData: Record<string, unknown> = { name: input.name, category: input.category, club: input.club ?? '', active: 'true' };
  if (input.trainerId) teamData.trainers = { connect: { id: input.trainerId } };
  const data = await gql(
    `mutation CreateTeam($data: TeamCreateInput!) { createTeam(data: $data) { id name category club active } }`,
    { data: teamData }
  );
  return data.createTeam;
}

export async function updateTeam(id: string, input: Record<string, unknown>): Promise<Team> {
  const data = await gql(
    `mutation UpdateTeam($id: ID!, $data: TeamUpdateInput!) { updateTeam(where: { id: $id }, data: $data) { id name category club active } }`,
    { id, data: input }
  );
  return data.updateTeam;
}

export async function deleteTeam(id: string): Promise<void> {
  await gql(`mutation { deleteTeam(where: { id: "${id}" }) { id } }`);
}

// ── Trainers ───────────────────────────────────────────────────────────────────

export interface TrainerRecord {
  id: string; name: string; email: string; role: string;
  team: { id: string; name: string; category: string } | null;
}

export async function getTrainers(): Promise<TrainerRecord[]> {
  const data = await gql(`query {
    trainers(take: 100, orderBy: { name: asc }) {
      id name email role team { id name category }
    }
  }`);
  return data.trainers;
}

export async function createTrainer(input: { name: string; email: string; password: string; role?: string; teamId?: string }): Promise<TrainerRecord> {
  const trainerData: Record<string, unknown> = { name: input.name, email: input.email, password: input.password, role: input.role ?? 'trainer' };
  if (input.teamId) trainerData.team = { connect: { id: input.teamId } };
  const data = await gql(
    `mutation CreateTrainer($data: TrainerCreateInput!) { createTrainer(data: $data) { id name email role team { id name category } } }`,
    { data: trainerData }
  );
  return data.createTrainer;
}

export async function updateTrainer(id: string, input: Record<string, unknown>): Promise<TrainerRecord> {
  const data = await gql(
    `mutation UpdateTrainer($id: ID!, $data: TrainerUpdateInput!) { updateTrainer(where: { id: $id }, data: $data) { id name email role team { id name category } } }`,
    { id, data: input }
  );
  return data.updateTrainer;
}

export async function deleteTrainer(id: string): Promise<void> {
  await gql(`mutation { deleteTrainer(where: { id: "${id}" }) { id } }`);
}

// ── Players ───────────────────────────────────────────────────────────────────

export interface PlayerWithTeam {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  active: string;
  team: { id: string; name: string; category: string } | null;
}

export async function getAllPlayersWithTeam(): Promise<PlayerWithTeam[]> {
  const data = await gql(`query {
    players(take: 2000, orderBy: { name: asc }) { id name number position active team { id name category } }
  }`);
  return data.players;
}

export async function assignPlayerToTeam(playerId: string, teamId: string | null): Promise<void> {
  if (teamId) {
    await gql(
      `mutation AssignPlayer($id: ID!, $data: PlayerUpdateInput!) { updatePlayer(where: { id: $id }, data: $data) { id } }`,
      { id: playerId, data: { team: { connect: { id: teamId } } } }
    );
  } else {
    await gql(
      `mutation UnassignPlayer($id: ID!, $data: PlayerUpdateInput!) { updatePlayer(where: { id: $id }, data: $data) { id } }`,
      { id: playerId, data: { team: { disconnect: true } } }
    );
  }
}

export async function bulkAssignPlayersToTeam(playerIds: string[], teamId: string): Promise<void> {
  for (const pid of playerIds) {
    await assignPlayerToTeam(pid, teamId);
  }
}

export async function getPlayers(teamId?: string): Promise<Player[]> {
  const where = teamId ? `, where: { team: { id: { equals: "${teamId}" } } }` : '';
  const data = await gql(`query {
    players(take: 1000, orderBy: { name: asc }${where}) { id name number position active }
  }`);
  return data.players;
}

export async function createPlayer(input: { name: string; number?: number; position?: string; active?: string; teamId?: string }) {
  const { active = 'true', teamId, ...rest } = input;
  const clean: Record<string, unknown> = { ...rest, active };
  if (teamId) clean.team = { connect: { id: teamId } };
  Object.keys(clean).forEach(k => { if (clean[k] === undefined || clean[k] === '') delete clean[k]; });
  const data = await gql(
    `mutation CreatePlayer($data: PlayerCreateInput!) {
       createPlayer(data: $data) { id name number position active }
     }`,
    { data: clean }
  );
  return data.createPlayer;
}

export async function updatePlayer(id: string, input: Partial<Player> | Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== '' && v !== undefined) clean[k] = v;
  }
  const data = await gql(
    `mutation UpdatePlayer($id: ID!, $data: PlayerUpdateInput!) {
       updatePlayer(where: { id: $id }, data: $data) { id name number position active }
     }`,
    { id, data: clean }
  );
  return data.updatePlayer;
}

export async function deletePlayer(id: string) {
  await gql(`mutation { deletePlayer(where: { id: "${id}" }) { id } }`);
}

// ── Matches ───────────────────────────────────────────────────────────────────

export async function getMatches(teamId?: string): Promise<Match[]> {
  const where = teamId ? `, where: { team: { id: { equals: "${teamId}" } } }` : '';
  const data = await gql(`query {
    matches(take: 1000, orderBy: { date: asc }${where}) {
      id opponent date location status currentPeriod periodStatus
      scoreHome scoreAway matchStartTime
      team { id category }
    }
  }`);
  return data.matches;
}

export async function createMatch(input: { opponent: string; date: string; location: string; teamId?: string }) {
  const { teamId, ...rest } = input;
  const matchData: Record<string, unknown> = { ...rest, status: 'planned', currentPeriod: 0, periodStatus: 'idle', scoreHome: 0, scoreAway: 0 };
  if (teamId) matchData.team = { connect: { id: teamId } };
  const data = await gql(
    `mutation CreateMatch($data: MatchCreateInput!) {
       createMatch(data: $data) { id opponent date location status currentPeriod periodStatus scoreHome scoreAway matchStartTime }
     }`,
    { data: matchData }
  );
  return data.createMatch;
}

export async function updateMatch(id: string, input: Record<string, unknown>) {
  const data = await gql(
    `mutation UpdateMatch($id: ID!, $data: MatchUpdateInput!) {
       updateMatch(where: { id: $id }, data: $data) { id opponent date location status currentPeriod periodStatus scoreHome scoreAway matchStartTime }
     }`,
    { id, data: input }
  );
  return data.updateMatch;
}

export async function deleteMatch(id: string) {
  await gql(`mutation { deleteMatch(where: { id: "${id}" }) { id } }`);
}

export function getMatchOfTheWeek(matches: Match[]): Match | null {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const active = matches.filter(m => m.status === 'active');
  if (active.length) return active[0];
  const upcoming = matches.filter(m => {
    const d = new Date(m.date);
    return m.status === 'planned' && d >= now && d <= in7;
  });
  if (upcoming.length) return upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const planned = matches.filter(m => m.status === 'planned' && new Date(m.date) >= now);
  if (planned.length) return planned.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  return null;
}

// ── Periods ───────────────────────────────────────────────────────────────────

export async function getPeriodsForMatch(matchId: string): Promise<Period[]> {
  const data = await gql(
    `query GetPeriods($matchId: ID!) {
       periods(where: { match: { id: { equals: $matchId } } }, take: 10, orderBy: { periodNumber: asc }) {
         id match { id } periodNumber scoreHome scoreAway startTime endTime durationSeconds
       }
     }`,
    { matchId }
  );
  return data.periods;
}

export async function createPeriod(matchId: string, periodNumber: number): Promise<Period> {
  const data = await gql(
    `mutation CreatePeriod($data: PeriodCreateInput!) {
       createPeriod(data: $data) { id match { id } periodNumber scoreHome scoreAway startTime endTime durationSeconds }
     }`,
    { data: { match: { connect: { id: matchId } }, periodNumber, scoreHome: 0, scoreAway: 0, startTime: new Date().toISOString(), durationSeconds: 900 } }
  );
  return data.createPeriod;
}

export async function updatePeriod(id: string, input: Record<string, unknown>): Promise<Period> {
  const data = await gql(
    `mutation UpdatePeriod($id: ID!, $data: PeriodUpdateInput!) {
       updatePeriod(where: { id: $id }, data: $data) { id match { id } periodNumber scoreHome scoreAway startTime endTime durationSeconds }
     }`,
    { id, data: input }
  );
  return data.updatePeriod;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export async function getAttendancesForMatch(matchId: string): Promise<Attendance[]> {
  const data = await gql(
    `query GetAttendances($matchId: ID!) {
       attendances(where: { match: { id: { equals: $matchId } } }, take: 1000) {
         id player { id name number position active } match { id } present selected
       }
     }`,
    { matchId }
  );
  return data.attendances;
}

export async function setAttendance(matchId: string, playerId: string, present: boolean, selected: boolean) {
  const existingData = await gql(
    `query { attendances(where: { match: { id: { equals: "${matchId}" } }, player: { id: { equals: "${playerId}" } } }, take: 1) { id } }`
  );
  const existing = existingData.attendances[0];
  if (existing) {
    const data = await gql(
      `mutation UpdateAttendance($id: ID!, $data: AttendanceUpdateInput!) { updateAttendance(where: { id: $id }, data: $data) { id present selected } }`,
      { id: existing.id, data: { present: present ? 'true' : 'false', selected: selected ? 'true' : 'false' } }
    );
    return data.updateAttendance;
  } else {
    const data = await gql(
      `mutation CreateAttendance($data: AttendanceCreateInput!) { createAttendance(data: $data) { id present selected } }`,
      { data: { match: { connect: { id: matchId } }, player: { connect: { id: playerId } }, present: present ? 'true' : 'false', selected: selected ? 'true' : 'false' } }
    );
    return data.createAttendance;
  }
}

// ── PlayTime Sessions ─────────────────────────────────────────────────────────

export async function getPlayTimeSessionsForMatch(matchId: string): Promise<PlayTimeSession[]> {
  const data = await gql(
    `query GetSessions($matchId: ID!) {
       playTimeSessions(
         where: { attendance: { match: { id: { equals: $matchId } } } },
         take: 1000, orderBy: { startTime: asc }
       ) { id attendance { id } period fieldPosition startTime endTime durationSeconds active }
     }`,
    { matchId }
  );
  return data.playTimeSessions;
}

export async function startPlayTimeSession(
  attendanceId: string, period: number, fieldPosition?: string
): Promise<PlayTimeSession> {
  const sessionData: Record<string, unknown> = {
    attendance: { connect: { id: attendanceId } },
    period,
    startTime: new Date().toISOString(),
    active: 'true',
    durationSeconds: 0,
  };
  if (fieldPosition) sessionData.fieldPosition = fieldPosition;
  const data = await gql(
    `mutation CreateSession($data: PlayTimeSessionCreateInput!) {
       createPlayTimeSession(data: $data) { id attendance { id } period fieldPosition startTime endTime durationSeconds active }
     }`,
    { data: sessionData }
  );
  return data.createPlayTimeSession;
}

export async function stopPlayTimeSession(sessionId: string, startTime: string): Promise<PlayTimeSession> {
  const now = new Date();
  const durationSeconds = Math.floor((now.getTime() - new Date(startTime).getTime()) / 1000);
  const data = await gql(
    `mutation UpdateSession($id: ID!, $data: PlayTimeSessionUpdateInput!) {
       updatePlayTimeSession(where: { id: $id }, data: $data) { id attendance { id } period fieldPosition startTime endTime durationSeconds active }
     }`,
    { id: sessionId, data: { endTime: now.toISOString(), durationSeconds, active: 'false' } }
  );
  return data.updatePlayTimeSession;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}u ${m.toString().padStart(2, '0')}m`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const TOTAL_PERIODS = 4;

export const POSITIONS = [
  { value: 'keeper',     label: 'Doelman' },
  { value: 'defender',   label: 'Verdediger' },
  { value: 'midfielder', label: 'Middenvelder' },
  { value: 'forward',    label: 'Aanvaller' },
] as const;

export const POSITION_LABELS: Record<string, string> = {
  keeper: 'DM', defender: 'VD', midfielder: 'MV', forward: 'AV',
};

export const POSITION_FULL: Record<string, string> = {
  keeper: 'Doelman', defender: 'Verdediger', midfielder: 'Middenvelder', forward: 'Aanvaller',
};


// ── Goals ─────────────────────────────────────────────────────────────────────

export async function getGoalsForMatch(matchId: string): Promise<Goal[]> {
  const data = await gql(
    `query GetGoals($matchId: ID!) {
       goals(where: { match: { id: { equals: $matchId } } }, take: 200, orderBy: { scoredAt: asc }) {
         id player { id name number } match { id } periodNumber scoredAt
       }
     }`,
    { matchId }
  );
  return data.goals;
}

export async function addGoal(
  matchId: string, playerId: string, periodNumber: number,
  matchLocation: string  // 'home' | 'away' — determines which score column to increment
): Promise<Goal> {
  const data = await gql(
    `mutation CreateGoal($data: GoalCreateInput!) {
       createGoal(data: $data) { id player { id name number } match { id } periodNumber scoredAt }
     }`,
    { data: {
        match:  { connect: { id: matchId } },
        player: { connect: { id: playerId } },
        periodNumber,
        scoredAt: new Date().toISOString(),
    }}
  );
  const goal = data.createGoal as Goal;

  // Auto-increment the period score for KFC Lennik
  const periods = await getPeriodsForMatch(matchId);
  const period = periods.find(p => p.periodNumber === periodNumber);
  if (period) {
    // If KFC plays at home, their goals go to scoreHome; away → scoreAway
    const field = matchLocation === 'home' ? 'scoreHome' : 'scoreAway';
    await updatePeriod(period.id, { [field]: (period[field as 'scoreHome' | 'scoreAway'] || 0) + 1 });
    // Recompute match totals
    const fresh = await getPeriodsForMatch(matchId);
    const totalHome = fresh.reduce((s, p) => s + (p.scoreHome || 0), 0);
    const totalAway = fresh.reduce((s, p) => s + (p.scoreAway || 0), 0);
    await gql(
      `mutation { updateMatch(where: { id: "${matchId}" }, data: { scoreHome: ${totalHome}, scoreAway: ${totalAway} }) { id } }`
    );
  }
  return goal;
}

export async function removeGoal(
  goalId: string, matchId: string, periodNumber: number, matchLocation: string
): Promise<void> {
  await gql(`mutation { deleteGoal(where: { id: "${goalId}" }) { id } }`);
  // Decrement period score
  const periods = await getPeriodsForMatch(matchId);
  const period = periods.find(p => p.periodNumber === periodNumber);
  if (period) {
    const field = matchLocation === 'home' ? 'scoreHome' : 'scoreAway';
    const cur = period[field as 'scoreHome' | 'scoreAway'] || 0;
    await updatePeriod(period.id, { [field]: Math.max(0, cur - 1) });
    const fresh = await getPeriodsForMatch(matchId);
    const totalHome = fresh.reduce((s, p) => s + (p.scoreHome || 0), 0);
    const totalAway = fresh.reduce((s, p) => s + (p.scoreAway || 0), 0);
    await gql(
      `mutation { updateMatch(where: { id: "${matchId}" }, data: { scoreHome: ${totalHome}, scoreAway: ${totalAway} }) { id } }`
    );
  }
}


// ── Field positions ───────────────────────────────────────────────────────────
// Note: position definitions have moved to teamConfig.ts
// buildFieldState now accepts dynamic posKeys from the active format

export function updateSessionFieldPosition(sessionId: string, fieldPosition: string | null): Promise<PlayTimeSession> {
  return gql(
    `mutation UpdateSession($id: ID!, $data: PlayTimeSessionUpdateInput!) {
       updatePlayTimeSession(where: { id: $id }, data: $data) { id attendance { id } period fieldPosition startTime endTime durationSeconds active }
     }`,
    { id: sessionId, data: { fieldPosition } }
  ).then(d => d.updatePlayTimeSession);
}

// buildFieldState is now handled inline in FieldView using format-specific positions
// Keeping this as a compatibility shim (no longer uses static FIELD_POSITION_KEYS)
export function buildFieldState(
  sessions: PlayTimeSession[],
  attendances: Array<{ id: string; player: { id: string; name: string; number: number | null } }>,
  period: number,
  posKeys: string[] = []
): Record<string, { session: PlayTimeSession; player: { id: string; name: string; number: number | null } } | null> {
  const state: Record<string, { session: PlayTimeSession; player: { id: string; name: string; number: number | null } } | null> = {};
  for (const key of posKeys) state[key] = null;
  const active = sessions.filter(s => s.period === period && s.active === 'true' && s.fieldPosition);
  for (const s of active) {
    const att = attendances.find(a => a.id === s.attendance.id);
    if (att && s.fieldPosition && posKeys.includes(s.fieldPosition)) {
      state[s.fieldPosition] = { session: s, player: att.player };
    }
  }
  return state;
}

// Seconds a player spent at a specific field position (all periods)
export function getPositionSeconds(
  sessions: PlayTimeSession[],
  attendanceId: string,
  fieldPosition: string,
  liveNow = false
): number {
  const relevant = sessions.filter(s => s.attendance.id === attendanceId && s.fieldPosition === fieldPosition);
  let total = relevant.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  if (liveNow) {
    const active = relevant.find(s => s.active === 'true');
    if (active) total += Math.floor((Date.now() - new Date(active.startTime).getTime()) / 1000);
  }
  return total;
}

// Store field assignments per period in localStorage (before match starts)
export function getFieldAssignment(matchId: string, period: number): Record<string, string> {
  try {
    const raw = localStorage.getItem(`field:${matchId}:${period}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function setFieldAssignment(matchId: string, period: number, assignment: Record<string, string>): void {
  try { localStorage.setItem(`field:${matchId}:${period}`, JSON.stringify(assignment)); } catch { /**/ }
}


// ── Playtime per player (for auto-selection) ──────────────────────────────────

/** Returns a map of playerId → total seconds played across ALL finished matches for a team. */
export async function getTeamPlaytimeMap(teamId: string): Promise<Record<string, number>> {
  // Fetch all completed sessions for this team's matches
  const data = await gql(`query {
    playTimeSessions(
      take: 5000,
      where: {
        attendance: { match: { team: { id: { equals: "${teamId}" } }, status: { equals: "finished" } } }
      }
    ) {
      durationSeconds
      attendance { player { id } }
    }
  }`);
  const map: Record<string, number> = {};
  for (const s of data.playTimeSessions as Array<{ durationSeconds: number; attendance: { player: { id: string } } }>) {
    const pid = s.attendance.player.id;
    map[pid] = (map[pid] || 0) + (s.durationSeconds || 0);
  }
  return map;
}

// ── Season overview ───────────────────────────────────────────────────────────

export interface SeasonPlayerStats {
  player: Player;
  totalSeconds: number;
  matchCount: number;        // wedstrijden gespeeld (minstens 1 sec speeltijd)
  totalGoals: number;        // doelpunten heel seizoen
  periodBreakdown: Record<number, number>; // period 1-4 → seconds
  goalsByPeriod: Record<number, number>;   // period 1-4 → goals
  matchBreakdown: Array<{
    matchId: string;
    opponent: string;
    date: string;
    totalSeconds: number;
    goals: number;
    periods: Record<number, number>;
  }>;
}

export async function getSeasonStats(teamId?: string): Promise<SeasonPlayerStats[]> {
  const where = teamId
    ? `where: { status: { equals: "finished" }, team: { id: { equals: "${teamId}" } } }`
    : `where: { status: { equals: "finished" } }`;
  const matchData = await gql(`query {
    matches(${where}, take: 1000, orderBy: { date: asc }) {
      id opponent date scoreHome scoreAway
    }
  }`);
  const matches: Array<{ id: string; opponent: string; date: string; scoreHome: number; scoreAway: number }> = matchData.matches;

  if (matches.length === 0) return [];

  const playersWhere = teamId ? `, where: { team: { id: { equals: "${teamId}" } } }` : '';
  const players = await gql(`query {
    players(take: 1000, orderBy: { name: asc }${playersWhere}) { id name number position active }
  }`);

  const allSessions: Array<PlayTimeSession & { matchId: string }> = [];
  const allAttendances: Array<Attendance & { matchId: string }> = [];
  const allGoals: Array<Goal & { matchId: string }> = [];

  for (const m of matches) {
    const [att, sess, goals] = await Promise.all([
      getAttendancesForMatch(m.id),
      getPlayTimeSessionsForMatch(m.id),
      getGoalsForMatch(m.id),
    ]);
    att.forEach(a => allAttendances.push({ ...a, matchId: m.id }));
    sess.forEach(s => allSessions.push({ ...s, matchId: m.id }));
    goals.forEach(g => allGoals.push({ ...g, matchId: m.id }));
  }

  const statsMap = new Map<string, SeasonPlayerStats>();

  for (const player of players.players as Player[]) {
    const playerAtts = allAttendances.filter(a => a.player.id === player.id);
    const playerGoals = allGoals.filter(g => g.player.id === player.id);

    let totalSeconds = 0;
    let totalGoals = 0;
    let matchCount = 0;
    const periodBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const goalsByPeriod: Record<number, number>   = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const matchBreakdown: SeasonPlayerStats['matchBreakdown'] = [];

    for (const m of matches) {
      const att = playerAtts.find(a => a.matchId === m.id);
      const matchSessions = att
        ? allSessions.filter(s => s.attendance.id === att.id && s.matchId === m.id)
        : [];
      const matchSec = matchSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
      const matchGoalsList = playerGoals.filter(g => g.matchId === m.id);
      const matchGoals = matchGoalsList.length;

      // Include in breakdown if played OR scored
      if (matchSec === 0 && matchGoals === 0) continue;

      if (matchSec > 0) matchCount++;
      totalSeconds += matchSec;
      totalGoals += matchGoals;

      const periods: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const s of matchSessions) {
        const p = s.period ?? 1;
        periods[p] = (periods[p] || 0) + (s.durationSeconds || 0);
        periodBreakdown[p] = (periodBreakdown[p] || 0) + (s.durationSeconds || 0);
      }
      for (const g of matchGoalsList) {
        const p = g.periodNumber ?? 1;
        goalsByPeriod[p] = (goalsByPeriod[p] || 0) + 1;
      }

      matchBreakdown.push({ matchId: m.id, opponent: m.opponent, date: m.date, totalSeconds: matchSec, goals: matchGoals, periods });
    }

    if (totalSeconds > 0 || totalGoals > 0) {
      statsMap.set(player.id, { player, totalSeconds, matchCount, totalGoals, periodBreakdown, goalsByPeriod, matchBreakdown });
    }
  }

  return Array.from(statsMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

export function exportPlayersCSV(players: Player[]): void {
  const rows = [
    ['naam', 'rugnummer', 'positie', 'actief'],
    ...players.map(p => [
      p.name,
      p.number?.toString() ?? '',
      p.position ?? '',
      p.active === 'true' ? 'ja' : 'nee',
    ]),
  ];
  downloadCSV(rows, 'spelers.csv');
}

export function exportMatchesCSV(matches: Match[]): void {
  const rows = [
    ['tegenstander', 'datum', 'locatie', 'status', 'score_thuis', 'score_uit'],
    ...matches.map(m => [
      m.opponent,
      m.date ? new Date(m.date).toLocaleDateString('nl-BE') : '',
      m.location === 'home' ? 'thuis' : 'uit',
      m.status,
      m.scoreHome.toString(),
      m.scoreAway.toString(),
    ]),
  ];
  downloadCSV(rows, 'wedstrijden.csv');
}

function downloadCSV(rows: string[][], filename: string): void {
  const content = rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface CSVImportResult<T> { rows: T[]; errors: string[]; }

export async function importPlayersCSV(
  file: File,
  onCreate: (p: { name: string; number?: number; position?: string }) => Promise<unknown>
): Promise<CSVImportResult<Player>> {
  const text = await file.text();
  const lines = parseCSV(text);
  if (lines.length < 2) return { rows: [], errors: ['Bestand lijkt leeg of heeft geen header'] };

  const header = lines[0].map(h => h.toLowerCase().trim());
  const nameIdx   = header.findIndex(h => h.includes('naam'));
  const numIdx    = header.findIndex(h => h.includes('rug') || h === 'nummer' || h === '#');
  const posIdx    = header.findIndex(h => h.includes('pos'));

  if (nameIdx === -1) return { rows: [], errors: ['Kolom "naam" niet gevonden in CSV header'] };

  const POSITION_MAP: Record<string, string> = {
    doelman: 'keeper', keeper: 'keeper', dm: 'keeper',
    verdediger: 'defender', defender: 'defender', vd: 'defender',
    middenvelder: 'midfielder', midfielder: 'midfielder', mv: 'midfielder',
    aanvaller: 'forward', forward: 'forward', av: 'forward',
  };

  const errors: string[] = [];
  const created: Player[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.every(c => !c.trim())) continue; // skip empty rows
    const name = row[nameIdx]?.trim();
    if (!name) { errors.push(`Rij ${i + 1}: naam ontbreekt`); continue; }

    const numRaw = numIdx >= 0 ? row[numIdx]?.trim() : '';
    const posRaw = (posIdx >= 0 ? row[posIdx]?.trim() : '').toLowerCase();
    const number = numRaw ? parseInt(numRaw) : undefined;
    const position = POSITION_MAP[posRaw] ?? undefined;

    try {
      const p = await onCreate({ name, ...(number ? { number } : {}), ...(position ? { position } : {}) });
      created.push(p as Player);
    } catch (e) {
      errors.push(`Rij ${i + 1} (${name}): ${e instanceof Error ? e.message : 'onbekende fout'}`);
    }
  }
  return { rows: created, errors };
}

export async function importMatchesCSV(
  file: File,
  onCreate: (m: { opponent: string; date: string; location: string }) => Promise<unknown>
): Promise<CSVImportResult<Match>> {
  const text = await file.text();
  const lines = parseCSV(text);
  if (lines.length < 2) return { rows: [], errors: ['Bestand lijkt leeg of heeft geen header'] };

  const header = lines[0].map(h => h.toLowerCase().trim());
  const oppIdx  = header.findIndex(h => h.includes('teg') || h.includes('opp'));
  const dateIdx = header.findIndex(h => h.includes('dat'));
  const locIdx  = header.findIndex(h => h.includes('loc'));

  if (oppIdx === -1 || dateIdx === -1) return { rows: [], errors: ['Kolommen "tegenstander" en "datum" zijn verplicht'] };

  const errors: string[] = [];
  const created: Match[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.every(c => !c.trim())) continue;
    const opponent = row[oppIdx]?.trim();
    const dateRaw  = row[dateIdx]?.trim();
    const locRaw   = (locIdx >= 0 ? row[locIdx]?.trim() : 'thuis').toLowerCase();

    if (!opponent) { errors.push(`Rij ${i + 1}: tegenstander ontbreekt`); continue; }
    if (!dateRaw)  { errors.push(`Rij ${i + 1}: datum ontbreekt`); continue; }

    // Try parse d/m/yy or d/m/yyyy or ISO
    let date: Date | null = null;
    const parts = dateRaw.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [d, mo, y] = parts.map(Number);
      const year = y < 100 ? 2000 + y : y;
      date = new Date(year, mo - 1, d);
    } else {
      date = new Date(dateRaw);
    }
    if (!date || isNaN(date.getTime())) { errors.push(`Rij ${i + 1}: ongeldige datum "${dateRaw}"`); continue; }

    const location = locRaw.includes('uit') || locRaw === 'away' ? 'away' : 'home';

    try {
      const m = await onCreate({ opponent, date: date.toISOString(), location });
      created.push(m as Match);
    } catch (e) {
      errors.push(`Rij ${i + 1} (${opponent}): ${e instanceof Error ? e.message : 'onbekende fout'}`);
    }
  }
  return { rows: created, errors };
}

function parseCSV(text: string): string[][] {
  // Handles quoted fields with semicolon or comma delimiter
  const lines = text.replace(/\r/g, '').split('\n');
  const sep = lines[0]?.includes(';') ? ';' : ',';
  return lines.map(line => {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        result.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }).filter(r => r.length > 0);
}

// ── Per-period lineup (stored in localStorage) ────────────────────────────────

export function getPeriodLineup(matchId: string, period: number): string[] {
  try {
    const key = `lineup:${matchId}:${period}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setPeriodLineup(matchId: string, period: number, playerIds: string[]): void {
  try {
    localStorage.setItem(`lineup:${matchId}:${period}`, JSON.stringify(playerIds));
  } catch { /* ignore */ }
}

export function clearPeriodLineup(matchId: string, period: number): void {
  try { localStorage.removeItem(`lineup:${matchId}:${period}`); } catch { /* ignore */ }
}
