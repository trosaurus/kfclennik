import { getPositionsForCategory } from './teamConfig';

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
  weekTheme?: { id: string; title: string; category: string } | null;
}

export interface WeekTheme {
  id: string;
  title: string;
  category: string;       // 'B+' | 'B-'
  description: string | null;
  active: string;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  player: { id: string; name: string; number: number | null };
  match: { id: string };
  theme: { id: string; title: string; category: string };
  score: number;
  createdAt: string;
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

// ── Trainersmanual (per ploeg) ──────────────────────────────────────────────────

export interface TeamManual {
  id: string;
  manualFileName: string;
  manualUploadedAt: string | null;
  manualText: string;
}

export async function getTeamManual(teamId: string): Promise<TeamManual> {
  const data = await gql(
    `query GetTeamManual($id: ID!) { team(where: { id: $id }) { id manualFileName manualUploadedAt manualText } }`,
    { id: teamId }
  );
  return data.team;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000; // voorkomt stack-overflow bij apply() op grote bestanden
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function uploadTeamManual(teamId: string, file: File): Promise<void> {
  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  await gql(
    `mutation UploadTeamManual($teamId: ID!, $filename: String!, $contentBase64: String!) {
       uploadTeamManual(teamId: $teamId, filename: $filename, contentBase64: $contentBase64) { id }
     }`,
    { teamId, filename: file.name, contentBase64 }
  );
}

export async function removeTeamManual(teamId: string): Promise<void> {
  await gql(`mutation RemoveTeamManual($teamId: ID!) { removeTeamManual(teamId: $teamId) { id } }`, { teamId });
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
      weekTheme { id title category }
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


// ── Week themes ───────────────────────────────────────────────────────────────

export const THEME_CATEGORY_LABELS: Record<string, string> = {
  'B+': 'Bal+',
  'B-': 'Bal-',
};

export async function getWeekThemes(activeOnly = false): Promise<WeekTheme[]> {
  const where = activeOnly ? `, where: { active: { equals: "true" } }` : '';
  const data = await gql(`query {
    weekThemes(take: 500, orderBy: { createdAt: desc }${where}) {
      id title category description active createdAt
    }
  }`);
  return data.weekThemes;
}

export async function createWeekTheme(input: { title: string; category: string; description?: string }): Promise<WeekTheme> {
  const data = await gql(
    `mutation CreateWeekTheme($data: WeekThemeCreateInput!) {
       createWeekTheme(data: $data) { id title category description active createdAt }
     }`,
    { data: { title: input.title, category: input.category, description: input.description ?? '', active: 'true' } }
  );
  return data.createWeekTheme;
}

export async function updateWeekTheme(id: string, input: Record<string, unknown>): Promise<WeekTheme> {
  const data = await gql(
    `mutation UpdateWeekTheme($id: ID!, $data: WeekThemeUpdateInput!) {
       updateWeekTheme(where: { id: $id }, data: $data) { id title category description active createdAt }
     }`,
    { id, data: input }
  );
  return data.updateWeekTheme;
}

export async function deleteWeekTheme(id: string): Promise<void> {
  await gql(`mutation { deleteWeekTheme(where: { id: "${id}" }) { id } }`);
}

// ── Evaluations ───────────────────────────────────────────────────────────────

export async function getEvaluationsForMatch(matchId: string): Promise<Evaluation[]> {
  const data = await gql(
    `query GetEvaluations($matchId: ID!) {
       evaluations(where: { match: { id: { equals: $matchId } } }, take: 200) {
         id player { id name number } match { id } theme { id title category } score createdAt
       }
     }`,
    { matchId }
  );
  return data.evaluations;
}

export async function setEvaluation(matchId: string, playerId: string, themeId: string, score: number): Promise<Evaluation> {
  const existingData = await gql(
    `query { evaluations(where: { match: { id: { equals: "${matchId}" } }, player: { id: { equals: "${playerId}" } } }, take: 1) { id } }`
  );
  const existing = existingData.evaluations[0];
  if (existing) {
    const data = await gql(
      `mutation UpdateEvaluation($id: ID!, $data: EvaluationUpdateInput!) {
         updateEvaluation(where: { id: $id }, data: $data) { id player { id name number } match { id } theme { id title category } score createdAt }
       }`,
      { id: existing.id, data: { theme: { connect: { id: themeId } }, score } }
    );
    return data.updateEvaluation;
  } else {
    const data = await gql(
      `mutation CreateEvaluation($data: EvaluationCreateInput!) {
         createEvaluation(data: $data) { id player { id name number } match { id } theme { id title category } score createdAt }
       }`,
      { data: {
          match: { connect: { id: matchId } },
          player: { connect: { id: playerId } },
          theme: { connect: { id: themeId } },
          score,
          createdAt: new Date().toISOString(),
      }}
    );
    return data.createEvaluation;
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
  positionBreakdown: Record<string, number>; // fieldPosition key ('K','9',...) → seconds
  roleBreakdown: Record<string, number>;     // rol ('keeper'|'defender'|'midfielder'|'forward') → seconds,
                                              // vertaald per wedstrijd via het team-formaat van díe match
  matchBreakdown: Array<{
    matchId: string;
    opponent: string;
    date: string;
    totalSeconds: number;
    goals: number;
    periods: Record<number, number>;
  }>;
  evaluations: Array<{
    matchId: string;
    opponent: string;
    date: string;
    themeId: string;
    themeTitle: string;
    themeCategory: string;
    score: number;
  }>;
}

export async function getSeasonStats(teamId?: string): Promise<SeasonPlayerStats[]> {
  const where = teamId
    ? `where: { status: { equals: "finished" }, team: { id: { equals: "${teamId}" } } }`
    : `where: { status: { equals: "finished" } }`;
  const matchData = await gql(`query {
    matches(${where}, take: 1000, orderBy: { date: asc }) {
      id opponent date scoreHome scoreAway team { category }
    }
  }`);
  const matches: Array<{ id: string; opponent: string; date: string; scoreHome: number; scoreAway: number; team: { category: string } | null }> = matchData.matches;

  if (matches.length === 0) return [];

  // Elke wedstrijd vertaalt fieldPosition-sleutels ('9','11',...) naar een rol via het
  // team-formaat van díe specifieke match — dezelfde sleutel betekent iets anders per
  // formaat (bv. '11' is aanvaller in 11v11 maar middenvelder in 8v8), dus dit mag nooit
  // op één ambient categorie voor het hele seizoen worden gebaseerd.
  const posRoleCache = new Map<string, Record<string, string>>();
  function posRoleForCategory(category: string): Record<string, string> {
    let map = posRoleCache.get(category);
    if (!map) {
      map = {};
      getPositionsForCategory(category).forEach(p => { map![p.key] = p.role; });
      posRoleCache.set(category, map);
    }
    return map;
  }
  const matchPosRole = new Map<string, Record<string, string>>();
  matches.forEach(m => matchPosRole.set(m.id, posRoleForCategory(m.team?.category ?? '')));

  const playersWhere = teamId ? `, where: { team: { id: { equals: "${teamId}" } } }` : '';
  const players = await gql(`query {
    players(take: 1000, orderBy: { name: asc }${playersWhere}) { id name number position active }
  }`);

  const allSessions: Array<PlayTimeSession & { matchId: string }> = [];
  const allAttendances: Array<Attendance & { matchId: string }> = [];
  const allGoals: Array<Goal & { matchId: string }> = [];
  const allEvaluations: Array<Evaluation & { matchId: string }> = [];

  for (const m of matches) {
    const [att, sess, goals, evals] = await Promise.all([
      getAttendancesForMatch(m.id),
      getPlayTimeSessionsForMatch(m.id),
      getGoalsForMatch(m.id),
      getEvaluationsForMatch(m.id),
    ]);
    att.forEach(a => allAttendances.push({ ...a, matchId: m.id }));
    sess.forEach(s => allSessions.push({ ...s, matchId: m.id }));
    goals.forEach(g => allGoals.push({ ...g, matchId: m.id }));
    evals.forEach(e => allEvaluations.push({ ...e, matchId: m.id }));
  }

  const statsMap = new Map<string, SeasonPlayerStats>();

  for (const player of players.players as Player[]) {
    const playerAtts = allAttendances.filter(a => a.player.id === player.id);
    const playerGoals = allGoals.filter(g => g.player.id === player.id);
    const playerEvals = allEvaluations.filter(e => e.player.id === player.id);

    let totalSeconds = 0;
    let totalGoals = 0;
    let matchCount = 0;
    const periodBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const goalsByPeriod: Record<number, number>   = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const positionBreakdown: Record<string, number> = {};
    const roleBreakdown: Record<string, number> = {};
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

      const posRole = matchPosRole.get(m.id) ?? {};
      const periods: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const s of matchSessions) {
        const p = s.period ?? 1;
        periods[p] = (periods[p] || 0) + (s.durationSeconds || 0);
        periodBreakdown[p] = (periodBreakdown[p] || 0) + (s.durationSeconds || 0);
        if (s.fieldPosition) {
          positionBreakdown[s.fieldPosition] = (positionBreakdown[s.fieldPosition] || 0) + (s.durationSeconds || 0);
          const role = posRole[s.fieldPosition];
          if (role) roleBreakdown[role] = (roleBreakdown[role] || 0) + (s.durationSeconds || 0);
        }
      }
      for (const g of matchGoalsList) {
        const p = g.periodNumber ?? 1;
        goalsByPeriod[p] = (goalsByPeriod[p] || 0) + 1;
      }

      matchBreakdown.push({ matchId: m.id, opponent: m.opponent, date: m.date, totalSeconds: matchSec, goals: matchGoals, periods });
    }

    const evaluations: SeasonPlayerStats['evaluations'] = playerEvals.map(e => {
      const m = matches.find(mm => mm.id === e.matchId);
      return {
        matchId: e.matchId,
        opponent: m?.opponent ?? '',
        date: m?.date ?? '',
        themeId: e.theme.id,
        themeTitle: e.theme.title,
        themeCategory: e.theme.category,
        score: e.score,
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (totalSeconds > 0 || totalGoals > 0 || evaluations.length > 0) {
      statsMap.set(player.id, { player, totalSeconds, matchCount, totalGoals, periodBreakdown, goalsByPeriod, positionBreakdown, roleBreakdown, matchBreakdown, evaluations });
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

// ── Volledige data-export / import (backup & restore) ─────────────────────────

const FULL_TAKE = 20000;

export interface FullDataExport {
  version: 1;
  exportedAt: string;
  teams: Array<{ id: string; name: string; category: string; club: string; active: string }>;
  weekThemes: Array<{ id: string; title: string; category: string; description: string; active: string; createdAt: string | null }>;
  trainers: Array<{ id: string; name: string; email: string; role: string; teamId: string | null }>;
  players: Array<{ id: string; name: string; number: number | null; position: string | null; active: string; teamId: string | null }>;
  matches: Array<{
    id: string; opponent: string; date: string; location: string; status: string;
    currentPeriod: number; periodStatus: string; scoreHome: number; scoreAway: number;
    matchStartTime: string | null; teamId: string | null; weekThemeId: string | null;
  }>;
  periods: Array<{ id: string; matchId: string | null; periodNumber: number; scoreHome: number; scoreAway: number; startTime: string | null; endTime: string | null; durationSeconds: number }>;
  goals: Array<{ id: string; playerId: string | null; matchId: string | null; periodNumber: number; scoredAt: string | null }>;
  attendances: Array<{ id: string; playerId: string | null; matchId: string | null; present: string; selected: string }>;
  playTimeSessions: Array<{ id: string; attendanceId: string | null; period: number; fieldPosition: string | null; startTime: string | null; endTime: string | null; durationSeconds: number; active: string }>;
  evaluations: Array<{ id: string; playerId: string | null; matchId: string | null; themeId: string | null; score: number; createdAt: string | null }>;
  trainings: Array<{
    id: string; trainerId: string | null; teamId: string | null; date: string; titel: string;
    duurMinuten: number; aantalSpelers: string; status: string; createdAt: string | null;
    coachNaam: string; tijdstip: string; leeftijdscategorie: string; niveau: string;
    hoofdmoment: string; spelfase: string; basisvaardigheid: string;
    speluitdagingWie: string; speluitdagingWat: string; speluitdagingWaar: string; speluitdagingWanneer: string;
    coachingswoorden: string; materiaal: string;
    actiefAanpak: string; funAanpak: string; individueleAandacht: string;
    teamprincipe: string; spelprincipe: string; focusPunten: string; jaarplanLabel: string; trainingsschema: string;
    evalBehouden: string; evalWijzigen: string; evalWarenActief: string; evalHaddenFun: string; evalBijgeleerd: string; evalIndividueleAandacht: string;
  }>;
  exercises: Array<{
    id: string; trainingId: string | null; order: number; fase: string; naam: string; duurMinuten: number;
    organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
  }>;
  oefeningDatabank: Array<{
    id: string; naam: string; fase: string; categorie: string | null; doelgroep: string | null; teamprincipe: string;
    duurMinuten: number; organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
    createdById: string | null; createdAt: string | null;
  }>;
}

export async function exportAllData(): Promise<FullDataExport> {
  const data = await gql(`query {
    teams(take: ${FULL_TAKE}) { id name category club active }
    weekThemes(take: ${FULL_TAKE}) { id title category description active createdAt }
    trainers(take: ${FULL_TAKE}) { id name email role team { id } }
    players(take: ${FULL_TAKE}) { id name number position active team { id } }
    matches(take: ${FULL_TAKE}) {
      id opponent date location status currentPeriod periodStatus scoreHome scoreAway matchStartTime
      team { id } weekTheme { id }
    }
    periods(take: ${FULL_TAKE}) { id periodNumber scoreHome scoreAway startTime endTime durationSeconds match { id } }
    goals(take: ${FULL_TAKE}) { id periodNumber scoredAt player { id } match { id } }
    attendances(take: ${FULL_TAKE}) { id present selected player { id } match { id } }
    playTimeSessions(take: ${FULL_TAKE}) { id period fieldPosition startTime endTime durationSeconds active attendance { id } }
    evaluations(take: ${FULL_TAKE}) { id score createdAt player { id } match { id } theme { id } }
    trainings(take: ${FULL_TAKE}) {
      id date titel duurMinuten aantalSpelers status createdAt
      coachNaam tijdstip leeftijdscategorie niveau
      hoofdmoment spelfase basisvaardigheid
      speluitdagingWie speluitdagingWat speluitdagingWaar speluitdagingWanneer
      coachingswoorden materiaal
      actiefAanpak funAanpak individueleAandacht
      teamprincipe spelprincipe focusPunten jaarplanLabel trainingsschema
      evalBehouden evalWijzigen evalWarenActief evalHaddenFun evalBijgeleerd evalIndividueleAandacht
      trainer { id } team { id }
    }
    exercises(take: ${FULL_TAKE}) {
      id order fase naam duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun
      training { id }
    }
    oefeningDatabanks(take: ${FULL_TAKE}) {
      id naam fase categorie doelgroep teamprincipe duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun
      createdBy { id } createdAt
    }
  }`);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    teams: data.teams,
    weekThemes: data.weekThemes,
    trainers: data.trainers.map((t: any) => ({ id: t.id, name: t.name, email: t.email, role: t.role, teamId: t.team?.id ?? null })),
    players: data.players.map((p: any) => ({ id: p.id, name: p.name, number: p.number, position: p.position, active: p.active, teamId: p.team?.id ?? null })),
    matches: data.matches.map((m: any) => ({
      id: m.id, opponent: m.opponent, date: m.date, location: m.location, status: m.status,
      currentPeriod: m.currentPeriod, periodStatus: m.periodStatus, scoreHome: m.scoreHome, scoreAway: m.scoreAway,
      matchStartTime: m.matchStartTime, teamId: m.team?.id ?? null, weekThemeId: m.weekTheme?.id ?? null,
    })),
    periods: data.periods.map((p: any) => ({
      id: p.id, matchId: p.match?.id ?? null, periodNumber: p.periodNumber, scoreHome: p.scoreHome, scoreAway: p.scoreAway,
      startTime: p.startTime, endTime: p.endTime, durationSeconds: p.durationSeconds,
    })),
    goals: data.goals.map((g: any) => ({ id: g.id, playerId: g.player?.id ?? null, matchId: g.match?.id ?? null, periodNumber: g.periodNumber, scoredAt: g.scoredAt })),
    attendances: data.attendances.map((a: any) => ({ id: a.id, playerId: a.player?.id ?? null, matchId: a.match?.id ?? null, present: a.present, selected: a.selected })),
    playTimeSessions: data.playTimeSessions.map((s: any) => ({
      id: s.id, attendanceId: s.attendance?.id ?? null, period: s.period, fieldPosition: s.fieldPosition,
      startTime: s.startTime, endTime: s.endTime, durationSeconds: s.durationSeconds, active: s.active,
    })),
    evaluations: data.evaluations.map((e: any) => ({
      id: e.id, playerId: e.player?.id ?? null, matchId: e.match?.id ?? null, themeId: e.theme?.id ?? null,
      score: e.score, createdAt: e.createdAt,
    })),
    trainings: data.trainings.map((t: any) => ({
      id: t.id, trainerId: t.trainer?.id ?? null, teamId: t.team?.id ?? null, date: t.date, titel: t.titel,
      duurMinuten: t.duurMinuten, aantalSpelers: t.aantalSpelers, status: t.status, createdAt: t.createdAt,
      coachNaam: t.coachNaam, tijdstip: t.tijdstip, leeftijdscategorie: t.leeftijdscategorie, niveau: t.niveau,
      hoofdmoment: t.hoofdmoment, spelfase: t.spelfase, basisvaardigheid: t.basisvaardigheid,
      speluitdagingWie: t.speluitdagingWie, speluitdagingWat: t.speluitdagingWat, speluitdagingWaar: t.speluitdagingWaar, speluitdagingWanneer: t.speluitdagingWanneer,
      coachingswoorden: t.coachingswoorden, materiaal: t.materiaal,
      actiefAanpak: t.actiefAanpak, funAanpak: t.funAanpak, individueleAandacht: t.individueleAandacht,
      teamprincipe: t.teamprincipe, spelprincipe: t.spelprincipe, focusPunten: t.focusPunten, jaarplanLabel: t.jaarplanLabel, trainingsschema: t.trainingsschema,
      evalBehouden: t.evalBehouden, evalWijzigen: t.evalWijzigen, evalWarenActief: t.evalWarenActief,
      evalHaddenFun: t.evalHaddenFun, evalBijgeleerd: t.evalBijgeleerd, evalIndividueleAandacht: t.evalIndividueleAandacht,
    })),
    exercises: data.exercises.map((ex: any) => ({
      id: ex.id, trainingId: ex.training?.id ?? null, order: ex.order, fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten,
      organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen, organisatieMateriaal: ex.organisatieMateriaal,
      beschrijving: ex.beschrijving, drawingData: ex.drawingData, coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
    })),
    oefeningDatabank: data.oefeningDatabanks.map((o: any) => ({
      id: o.id, naam: o.naam, fase: o.fase, categorie: o.categorie ?? null, doelgroep: o.doelgroep ?? null, teamprincipe: o.teamprincipe,
      duurMinuten: o.duurMinuten, organisatieSpelers: o.organisatieSpelers, organisatieAfmetingen: o.organisatieAfmetingen, organisatieMateriaal: o.organisatieMateriaal,
      beschrijving: o.beschrijving, drawingData: o.drawingData, coachingPunten: o.coachingPunten, maximaalActief: o.maximaalActief, fun: o.fun,
      createdById: o.createdBy?.id ?? null, createdAt: o.createdAt,
    })),
  };
}

export function downloadJSON(data: unknown, filename: string): void {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function countFullDataExport(data: FullDataExport): Record<string, number> {
  return {
    teams: data.teams.length, weekThemes: data.weekThemes.length, trainers: data.trainers.length,
    players: data.players.length, matches: data.matches.length, periods: data.periods.length,
    goals: data.goals.length, attendances: data.attendances.length,
    playTimeSessions: data.playTimeSessions.length, evaluations: data.evaluations.length,
    trainings: data.trainings.length, exercises: data.exercises.length, oefeningDatabank: data.oefeningDatabank.length,
  };
}

export async function parseFullDataExportFile(file: File): Promise<FullDataExport> {
  const text = await file.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('Ongeldig JSON-bestand'); }
  const requiredArrays = ['teams', 'weekThemes', 'trainers', 'players', 'matches', 'periods', 'goals', 'attendances', 'playTimeSessions', 'evaluations'];
  for (const key of requiredArrays) {
    if (!Array.isArray(json[key])) throw new Error(`Ontbrekend of ongeldig veld "${key}" in het bestand`);
  }
  // Later toegevoegd — oudere exports hebben deze velden nog niet, dus optioneel met lege lijst als fallback.
  for (const key of ['trainings', 'exercises', 'oefeningDatabank']) {
    if (!Array.isArray(json[key])) json[key] = [];
  }
  return json as FullDataExport;
}

// Deletes all sport data (teams, players, matches and everything linked to a match/player).
// Trainer accounts are never touched here, so nobody gets locked out of the app.
async function deleteAllOf(listQueryField: string, deleteManyMutation: string): Promise<number> {
  const data = await gql(`query { ${listQueryField}(take: ${FULL_TAKE}) { id } }`);
  const items: Array<{ id: string }> = data[listQueryField];
  if (items.length === 0) return 0;
  const where = items.map(i => `{ id: "${i.id}" }`).join(', ');
  await gql(`mutation { ${deleteManyMutation}(where: [${where}]) { id } }`);
  return items.length;
}

export async function wipeAllSportData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  counts.evaluations      = await deleteAllOf('evaluations', 'deleteEvaluations');
  counts.playTimeSessions = await deleteAllOf('playTimeSessions', 'deletePlayTimeSessions');
  counts.goals            = await deleteAllOf('goals', 'deleteGoals');
  counts.attendances      = await deleteAllOf('attendances', 'deleteAttendances');
  counts.periods          = await deleteAllOf('periods', 'deletePeriods');
  counts.matches          = await deleteAllOf('matches', 'deleteMatches');
  counts.exercises        = await deleteAllOf('exercises', 'deleteExercises');
  counts.trainings        = await deleteAllOf('trainings', 'deleteTrainings');
  counts.oefeningDatabank = await deleteAllOf('oefeningDatabanks', 'deleteOefeningDatabanks');
  counts.players          = await deleteAllOf('players', 'deletePlayers');
  counts.weekThemes       = await deleteAllOf('weekThemes', 'deleteWeekThemes');
  counts.teams            = await deleteAllOf('teams', 'deleteTeams');
  return counts;
}

export interface ImportProgress { label: string; done: number; total: number; }

export interface ImportResult {
  counts: Record<string, number>;
  errors: string[];
  trainerCredentials: Array<{ email: string; tempPassword: string }>;
}

function randomTempPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

export async function importAllData(
  data: FullDataExport,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const errors: string[] = [];
  const trainerCredentials: Array<{ email: string; tempPassword: string }> = [];

  const teamMap       = new Map<string, string>();
  const themeMap       = new Map<string, string>();
  const trainerMap     = new Map<string, string>();
  const playerMap      = new Map<string, string>();
  const matchMap       = new Map<string, string>();
  const attendanceMap  = new Map<string, string>();
  const trainingMap    = new Map<string, string>();

  async function step<T>(label: string, items: T[], fn: (item: T) => Promise<void>): Promise<number> {
    let success = 0;
    for (let i = 0; i < items.length; i++) {
      try { await fn(items[i]); success++; }
      catch (e) { errors.push(`${label} #${i + 1}: ${e instanceof Error ? e.message : 'onbekende fout'}`); }
      onProgress?.({ label, done: i + 1, total: items.length });
    }
    return success;
  }

  const counts: Record<string, number> = {};

  counts.teams = await step('Ploegen', data.teams, async t => {
    const created = await gql(
      `mutation($data: TeamCreateInput!) { createTeam(data: $data) { id } }`,
      { data: { name: t.name, category: t.category, club: t.club, active: t.active } }
    );
    teamMap.set(t.id, created.createTeam.id);
  });

  counts.weekThemes = await step("Weekthema's", data.weekThemes, async wt => {
    const input: Record<string, unknown> = { title: wt.title, category: wt.category, description: wt.description, active: wt.active };
    if (wt.createdAt) input.createdAt = wt.createdAt;
    const created = await gql(`mutation($data: WeekThemeCreateInput!) { createWeekTheme(data: $data) { id } }`, { data: input });
    themeMap.set(wt.id, created.createWeekTheme.id);
  });

  counts.trainers = await step('Trainers', data.trainers, async tr => {
    const tempPassword = randomTempPassword();
    const teamId = tr.teamId ? teamMap.get(tr.teamId) : undefined;
    const input: Record<string, unknown> = { name: tr.name, email: tr.email, password: tempPassword, role: tr.role };
    if (teamId) input.team = { connect: { id: teamId } };
    const created = await gql(`mutation($data: TrainerCreateInput!) { createTrainer(data: $data) { id } }`, { data: input });
    trainerMap.set(tr.id, created.createTrainer.id);
    trainerCredentials.push({ email: tr.email, tempPassword });
  });

  counts.trainings = await step('Trainingen', data.trainings, async t => {
    const teamId = t.teamId ? teamMap.get(t.teamId) : undefined;
    const trainerId = t.trainerId ? trainerMap.get(t.trainerId) : undefined;
    const input: Record<string, unknown> = {
      date: t.date, titel: t.titel, duurMinuten: t.duurMinuten, aantalSpelers: t.aantalSpelers, status: t.status,
      coachNaam: t.coachNaam, tijdstip: t.tijdstip, leeftijdscategorie: t.leeftijdscategorie, niveau: t.niveau,
      hoofdmoment: t.hoofdmoment, spelfase: t.spelfase, basisvaardigheid: t.basisvaardigheid,
      speluitdagingWie: t.speluitdagingWie, speluitdagingWat: t.speluitdagingWat, speluitdagingWaar: t.speluitdagingWaar, speluitdagingWanneer: t.speluitdagingWanneer,
      coachingswoorden: t.coachingswoorden, materiaal: t.materiaal,
      actiefAanpak: t.actiefAanpak, funAanpak: t.funAanpak, individueleAandacht: t.individueleAandacht,
      teamprincipe: t.teamprincipe, spelprincipe: t.spelprincipe, focusPunten: t.focusPunten, jaarplanLabel: t.jaarplanLabel, trainingsschema: t.trainingsschema ?? '',
      evalBehouden: t.evalBehouden, evalWijzigen: t.evalWijzigen, evalWarenActief: t.evalWarenActief,
      evalHaddenFun: t.evalHaddenFun, evalBijgeleerd: t.evalBijgeleerd, evalIndividueleAandacht: t.evalIndividueleAandacht,
    };
    if (t.createdAt) input.createdAt = t.createdAt;
    if (teamId) input.team = { connect: { id: teamId } };
    if (trainerId) input.trainer = { connect: { id: trainerId } };
    const created = await gql(`mutation($data: TrainingCreateInput!) { createTraining(data: $data) { id } }`, { data: input });
    trainingMap.set(t.id, created.createTraining.id);
  });

  counts.exercises = await step('Oefeningen (in trainingen)', data.exercises, async ex => {
    const trainingId = ex.trainingId ? trainingMap.get(ex.trainingId) : undefined;
    if (!trainingId) throw new Error('bijhorende training ontbreekt');
    const input: Record<string, unknown> = {
      training: { connect: { id: trainingId } }, order: ex.order, fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten,
      organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen, organisatieMateriaal: ex.organisatieMateriaal,
      beschrijving: ex.beschrijving, drawingData: ex.drawingData, coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
    };
    await gql(`mutation($data: ExerciseCreateInput!) { createExercise(data: $data) { id } }`, { data: input });
  });

  counts.oefeningDatabank = await step('Oefendatabank', data.oefeningDatabank, async o => {
    const trainerId = o.createdById ? trainerMap.get(o.createdById) : undefined;
    const input: Record<string, unknown> = {
      naam: o.naam, fase: o.fase, teamprincipe: o.teamprincipe, duurMinuten: o.duurMinuten,
      organisatieSpelers: o.organisatieSpelers, organisatieAfmetingen: o.organisatieAfmetingen, organisatieMateriaal: o.organisatieMateriaal,
      beschrijving: o.beschrijving, drawingData: o.drawingData, coachingPunten: o.coachingPunten, maximaalActief: o.maximaalActief, fun: o.fun,
    };
    if (o.categorie) input.categorie = o.categorie;
    if (o.doelgroep) input.doelgroep = o.doelgroep;
    if (o.createdAt) input.createdAt = o.createdAt;
    if (trainerId) input.createdBy = { connect: { id: trainerId } };
    await gql(`mutation($data: OefeningDatabankCreateInput!) { createOefeningDatabank(data: $data) { id } }`, { data: input });
  });

  counts.players = await step('Spelers', data.players, async p => {
    const teamId = p.teamId ? teamMap.get(p.teamId) : undefined;
    const input: Record<string, unknown> = { name: p.name, active: p.active };
    if (p.number != null) input.number = p.number;
    if (p.position) input.position = p.position;
    if (teamId) input.team = { connect: { id: teamId } };
    const created = await gql(`mutation($data: PlayerCreateInput!) { createPlayer(data: $data) { id } }`, { data: input });
    playerMap.set(p.id, created.createPlayer.id);
  });

  counts.matches = await step('Wedstrijden', data.matches, async m => {
    const teamId = m.teamId ? teamMap.get(m.teamId) : undefined;
    const themeId = m.weekThemeId ? themeMap.get(m.weekThemeId) : undefined;
    const input: Record<string, unknown> = {
      opponent: m.opponent, date: m.date, location: m.location, status: m.status,
      currentPeriod: m.currentPeriod, periodStatus: m.periodStatus, scoreHome: m.scoreHome, scoreAway: m.scoreAway,
    };
    if (m.matchStartTime) input.matchStartTime = m.matchStartTime;
    if (teamId) input.team = { connect: { id: teamId } };
    if (themeId) input.weekTheme = { connect: { id: themeId } };
    const created = await gql(`mutation($data: MatchCreateInput!) { createMatch(data: $data) { id } }`, { data: input });
    matchMap.set(m.id, created.createMatch.id);
  });

  counts.periods = await step('Periodes', data.periods, async p => {
    const matchId = p.matchId ? matchMap.get(p.matchId) : undefined;
    if (!matchId) throw new Error('bijhorende wedstrijd ontbreekt');
    const input: Record<string, unknown> = {
      match: { connect: { id: matchId } }, periodNumber: p.periodNumber,
      scoreHome: p.scoreHome, scoreAway: p.scoreAway, durationSeconds: p.durationSeconds,
    };
    if (p.startTime) input.startTime = p.startTime;
    if (p.endTime) input.endTime = p.endTime;
    await gql(`mutation($data: PeriodCreateInput!) { createPeriod(data: $data) { id } }`, { data: input });
  });

  counts.goals = await step('Doelpunten', data.goals, async g => {
    const matchId = g.matchId ? matchMap.get(g.matchId) : undefined;
    if (!matchId) throw new Error('bijhorende wedstrijd ontbreekt');
    const input: Record<string, unknown> = { match: { connect: { id: matchId } }, periodNumber: g.periodNumber };
    if (g.scoredAt) input.scoredAt = g.scoredAt;
    const playerId = g.playerId ? playerMap.get(g.playerId) : undefined;
    if (playerId) input.player = { connect: { id: playerId } };
    await gql(`mutation($data: GoalCreateInput!) { createGoal(data: $data) { id } }`, { data: input });
  });

  counts.attendances = await step('Aanwezigheden', data.attendances, async a => {
    const matchId = a.matchId ? matchMap.get(a.matchId) : undefined;
    if (!matchId) throw new Error('bijhorende wedstrijd ontbreekt');
    const input: Record<string, unknown> = { match: { connect: { id: matchId } }, present: a.present, selected: a.selected };
    const playerId = a.playerId ? playerMap.get(a.playerId) : undefined;
    if (playerId) input.player = { connect: { id: playerId } };
    const created = await gql(`mutation($data: AttendanceCreateInput!) { createAttendance(data: $data) { id } }`, { data: input });
    attendanceMap.set(a.id, created.createAttendance.id);
  });

  counts.playTimeSessions = await step('Speeltijdsessies', data.playTimeSessions, async s => {
    const attendanceId = s.attendanceId ? attendanceMap.get(s.attendanceId) : undefined;
    if (!attendanceId) throw new Error('bijhorende aanwezigheid ontbreekt');
    const input: Record<string, unknown> = {
      attendance: { connect: { id: attendanceId } }, period: s.period, durationSeconds: s.durationSeconds, active: s.active,
    };
    if (s.fieldPosition) input.fieldPosition = s.fieldPosition;
    if (s.startTime) input.startTime = s.startTime;
    if (s.endTime) input.endTime = s.endTime;
    await gql(`mutation($data: PlayTimeSessionCreateInput!) { createPlayTimeSession(data: $data) { id } }`, { data: input });
  });

  counts.evaluations = await step('Evaluaties', data.evaluations, async e => {
    const matchId = e.matchId ? matchMap.get(e.matchId) : undefined;
    const themeId = e.themeId ? themeMap.get(e.themeId) : undefined;
    if (!matchId || !themeId) throw new Error('bijhorende wedstrijd of thema ontbreekt');
    const input: Record<string, unknown> = { match: { connect: { id: matchId } }, theme: { connect: { id: themeId } }, score: e.score };
    if (e.createdAt) input.createdAt = e.createdAt;
    const playerId = e.playerId ? playerMap.get(e.playerId) : undefined;
    if (playerId) input.player = { connect: { id: playerId } };
    await gql(`mutation($data: EvaluationCreateInput!) { createEvaluation(data: $data) { id } }`, { data: input });
  });

  return { counts, errors, trainerCredentials };
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

// ── Trainingen (voorbereiding — velden volgen Template_training_KFC) ──────────

export type ExerciseFase = 'opwarming' | 'tussenvorm' | 'wedstrijdvorm' | 'cooling_down';

export const EXERCISE_FASE_LABELS: Record<ExerciseFase, string> = {
  opwarming: 'Opwarming', tussenvorm: 'Tussenvorm', wedstrijdvorm: 'Wedstrijdvorm', cooling_down: 'Cooling down',
};

export interface Exercise {
  id: string;
  order: number;
  fase: ExerciseFase;
  naam: string;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  drawingData: string;   // JSON-serialized DrawingScene, or ''
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
}

export interface Training {
  id: string;
  trainer: { id: string; name: string } | null;
  team: { id: string } | null;
  date: string;
  titel: string;
  duurMinuten: number;
  aantalSpelers: string;
  status: string;   // concept | klaar | afgewerkt
  createdAt: string;

  // Kop
  coachNaam: string;
  tijdstip: string;
  leeftijdscategorie: string;
  niveau: string;

  // "Leren"
  hoofdmoment: string;
  spelfase: string;
  basisvaardigheid: string;
  speluitdagingWie: string;
  speluitdagingWat: string;
  speluitdagingWaar: string;
  speluitdagingWanneer: string;
  coachingswoorden: string;
  materiaal: string;

  // "Actief, fun & individuele aandacht"
  actiefAanpak: string;
  funAanpak: string;
  individueleAandacht: string;

  // Jaarplan-koppeling (extra t.o.v. het template)
  teamprincipe: string;
  spelprincipe: string;
  focusPunten: string;
  jaarplanLabel: string;
  trainingsschema: string;

  // "Reflectie · 360° evaluatie"
  evalBehouden: string;
  evalWijzigen: string;
  evalWarenActief: string;
  evalHaddenFun: string;
  evalBijgeleerd: string;
  evalIndividueleAandacht: string;

  exercises: Exercise[];
}

const TRAINING_FIELDS = `
  id trainer { id name } team { id } date titel duurMinuten aantalSpelers status createdAt
  coachNaam tijdstip leeftijdscategorie niveau
  hoofdmoment spelfase basisvaardigheid
  speluitdagingWie speluitdagingWat speluitdagingWaar speluitdagingWanneer
  coachingswoorden materiaal
  actiefAanpak funAanpak individueleAandacht
  teamprincipe spelprincipe focusPunten jaarplanLabel trainingsschema
  evalBehouden evalWijzigen evalWarenActief evalHaddenFun evalBijgeleerd evalIndividueleAandacht
`;
const EXERCISE_FIELDS = `
  id order fase naam duurMinuten
  organisatieSpelers organisatieAfmetingen organisatieMateriaal
  beschrijving drawingData coachingPunten maximaalActief fun
`;

export async function getTrainings(teamId?: string): Promise<Training[]> {
  const where = teamId ? `, where: { team: { id: { equals: "${teamId}" } } }` : '';
  const data = await gql(`query {
    trainings(take: 500, orderBy: { date: desc }${where}) { ${TRAINING_FIELDS} exercises { ${EXERCISE_FIELDS} } }
  }`);
  return (data.trainings as Training[]).map(t => ({
    ...t, exercises: [...t.exercises].sort((a, b) => a.order - b.order),
  }));
}

export async function getTraining(id: string): Promise<Training | null> {
  const data = await gql(
    `query GetTraining($id: ID!) { training(where: { id: $id }) { ${TRAINING_FIELDS} exercises { ${EXERCISE_FIELDS} } } }`,
    { id }
  );
  const t = data.training as Training | null;
  if (!t) return null;
  return { ...t, exercises: [...t.exercises].sort((a, b) => a.order - b.order) };
}

export async function createTraining(input: {
  date: string; trainerId?: string; teamId?: string; titel?: string;
}): Promise<Training> {
  const trainingData: Record<string, unknown> = { date: input.date, titel: input.titel ?? '' };
  if (input.trainerId) trainingData.trainer = { connect: { id: input.trainerId } };
  if (input.teamId) trainingData.team = { connect: { id: input.teamId } };
  const data = await gql(
    `mutation CreateTraining($data: TrainingCreateInput!) { createTraining(data: $data) { ${TRAINING_FIELDS} } }`,
    { data: trainingData }
  );
  return { ...data.createTraining, exercises: [] };
}

export async function updateTraining(id: string, input: Record<string, unknown>): Promise<Training> {
  const data = await gql(
    `mutation UpdateTraining($id: ID!, $data: TrainingUpdateInput!) { updateTraining(where: { id: $id }, data: $data) { ${TRAINING_FIELDS} } }`,
    { id, data: input }
  );
  return data.updateTraining;
}

export async function deleteTraining(id: string): Promise<void> {
  await gql(`mutation { deleteTraining(where: { id: "${id}" }) { id } }`);
}

export async function createExercise(trainingId: string, input: {
  fase: ExerciseFase; naam: string; duurMinuten: number; order: number;
  organisatieSpelers?: string; organisatieAfmetingen?: string; organisatieMateriaal?: string;
  beschrijving?: string; coachingPunten?: string; maximaalActief?: string; fun?: string; drawingData?: string;
}): Promise<Exercise> {
  const data = await gql(
    `mutation CreateExercise($data: ExerciseCreateInput!) { createExercise(data: $data) { ${EXERCISE_FIELDS} } }`,
    { data: {
        training: { connect: { id: trainingId } },
        fase: input.fase, naam: input.naam, duurMinuten: input.duurMinuten, order: input.order,
        organisatieSpelers: input.organisatieSpelers ?? '', organisatieAfmetingen: input.organisatieAfmetingen ?? '',
        organisatieMateriaal: input.organisatieMateriaal ?? '', beschrijving: input.beschrijving ?? '',
        coachingPunten: input.coachingPunten ?? '', maximaalActief: input.maximaalActief ?? '', fun: input.fun ?? '',
        drawingData: input.drawingData ?? '',
    }}
  );
  return data.createExercise;
}

export async function updateExercise(id: string, input: Record<string, unknown>): Promise<Exercise> {
  const data = await gql(
    `mutation UpdateExercise($id: ID!, $data: ExerciseUpdateInput!) { updateExercise(where: { id: $id }, data: $data) { ${EXERCISE_FIELDS} } }`,
    { id, data: input }
  );
  return data.updateExercise;
}

export async function deleteExercise(id: string): Promise<void> {
  await gql(`mutation { deleteExercise(where: { id: "${id}" }) { id } }`);
}

export async function reorderExercises(updates: Array<{ id: string; order: number }>): Promise<void> {
  if (updates.length === 0) return;
  await gql(
    `mutation ReorderExercises($data: [ExerciseUpdateArgs!]!) { updateExercises(data: $data) { id } }`,
    { data: updates.map(u => ({ where: { id: u.id }, data: { order: u.order } })) }
  );
}

/** Percentage van de totale trainingstijd dat wedstrijdvorm is (Voetbal Vlaanderen: minimum 50%). */
export function wedstrijdvormPercentage(exercises: Exercise[]): number {
  const total = exercises.reduce((a, e) => a + (e.duurMinuten || 0), 0);
  if (total === 0) return 0;
  const wedstrijdvorm = exercises.filter(e => e.fase === 'wedstrijdvorm').reduce((a, e) => a + (e.duurMinuten || 0), 0);
  return (wedstrijdvorm / total) * 100;
}

/** Vult het officiële KFC-trainingssjabloon (PowerPoint) in met deze training
 * en download het resultaat — gegenereerd server-side, geen externe API. */
export async function exportTrainingToPptx(trainingId: string, filename: string): Promise<void> {
  const data = await gql(
    `mutation ExportTrainingPptx($id: ID!) { exportTrainingPptx(id: $id) }`,
    { id: trainingId }
  );
  const base64: string | null = data.exportTrainingPptx;
  if (!base64) throw new Error('PowerPoint-export mislukt');
  const res = await fetch(
    `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`
  );
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Oefendatabank (club-brede, herbruikbare oefeningenbibliotheek) ─────────────

export type OefeningCategorie = 'B+' | 'B-';

// Zelfde volgorde/waarden als Team.category in het backend-schema.
export const DOELGROEP_LEEFTIJDEN = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U15', 'U17'] as const;
export type Doelgroep = typeof DOELGROEP_LEEFTIJDEN[number];

// Zelfde waarden/volgorde als het select-veld OefeningDatabank.spelprincipe in backend/schema.ts.
export const SPELPRINCIPE_OPTIONS = [
  { value: 'diagonale_verticale_passing',          label: 'Diagonale en verticale passing' },
  { value: 'hoge_intensiteit_1v1_doordekken',       label: 'Hoge intensiteit / 1 op 1 doordekken (durf/lef)' },
  { value: 'centrum_sluiten',                       label: 'Centrum sluiten' },
  { value: 'infiltraties_met_zonder_bal',           label: 'Infiltraties met/zonder bal' },
  { value: 'overtal_uitspelen_zelfde_kant',         label: 'Overtal uitspelen (zelfde kant)' },
  { value: 'spel_verleggen_andere_kant',             label: 'Spel verleggen (richting andere kant)' },
  { value: 'assistzone_bereiken',                   label: 'Assistzone bereiken (doellijn halen)' },
  { value: 'positiekeuze_voor_doel',                label: 'Positiekeuze voor doel' },
  { value: '1v1_duel_winnen_voorzet_verhinderen',   label: '1 vs 1 duel winnen (contact) om voorzet te verhinderen' },
  { value: 'defensieve_t_bezetting_voor_doel',      label: 'Defensieve (T) bezetting voor doel' },
] as const;
export type Spelprincipe = typeof SPELPRINCIPE_OPTIONS[number]['value'];
export const SPELPRINCIPE_LABELS: Record<string, string> = Object.fromEntries(SPELPRINCIPE_OPTIONS.map(o => [o.value, o.label]));

export interface OefeningDatabankItem {
  id: string;
  naam: string;
  fase: ExerciseFase;
  categorie: OefeningCategorie | null;
  doelgroep: Doelgroep | null;
  teamprincipe: string;
  spelprincipe: Spelprincipe | null;
  duurMinuten: number;
  organisatieSpelers: string;
  organisatieAfmetingen: string;
  organisatieMateriaal: string;
  beschrijving: string;
  drawingData: string;
  coachingPunten: string;
  maximaalActief: string;
  fun: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

const OEFENING_FIELDS = `
  id naam fase categorie doelgroep teamprincipe spelprincipe duurMinuten
  organisatieSpelers organisatieAfmetingen organisatieMateriaal
  beschrijving drawingData coachingPunten maximaalActief fun
  createdBy { id name } createdAt
`;

export async function getOefeningDatabank(): Promise<OefeningDatabankItem[]> {
  const data = await gql(`query {
    oefeningDatabanks(take: 2000, orderBy: { createdAt: desc }) { ${OEFENING_FIELDS} }
  }`);
  return data.oefeningDatabanks;
}

export async function createOefeningDatabankItem(input: {
  naam: string; fase: ExerciseFase; categorie?: OefeningCategorie; doelgroep?: Doelgroep; teamprincipe?: string; spelprincipe?: Spelprincipe; duurMinuten: number;
  organisatieSpelers?: string; organisatieAfmetingen?: string; organisatieMateriaal?: string;
  beschrijving?: string; drawingData?: string; coachingPunten?: string; maximaalActief?: string; fun?: string;
  trainerId?: string;
}): Promise<OefeningDatabankItem> {
  const itemData: Record<string, unknown> = {
    naam: input.naam, fase: input.fase, teamprincipe: input.teamprincipe ?? '', duurMinuten: input.duurMinuten,
    organisatieSpelers: input.organisatieSpelers ?? '', organisatieAfmetingen: input.organisatieAfmetingen ?? '',
    organisatieMateriaal: input.organisatieMateriaal ?? '', beschrijving: input.beschrijving ?? '',
    drawingData: input.drawingData ?? '', coachingPunten: input.coachingPunten ?? '',
    maximaalActief: input.maximaalActief ?? '', fun: input.fun ?? '',
  };
  if (input.categorie) itemData.categorie = input.categorie;
  if (input.doelgroep) itemData.doelgroep = input.doelgroep;
  if (input.spelprincipe) itemData.spelprincipe = input.spelprincipe;
  if (input.trainerId) itemData.createdBy = { connect: { id: input.trainerId } };
  const data = await gql(
    `mutation CreateOefening($data: OefeningDatabankCreateInput!) { createOefeningDatabank(data: $data) { ${OEFENING_FIELDS} } }`,
    { data: itemData }
  );
  return data.createOefeningDatabank;
}

export async function updateOefeningDatabankItem(id: string, input: Record<string, unknown>): Promise<OefeningDatabankItem> {
  const data = await gql(
    `mutation UpdateOefening($id: ID!, $data: OefeningDatabankUpdateInput!) { updateOefeningDatabank(where: { id: $id }, data: $data) { ${OEFENING_FIELDS} } }`,
    { id, data: input }
  );
  return data.updateOefeningDatabank;
}

export async function deleteOefeningDatabankItem(id: string): Promise<void> {
  await gql(`mutation { deleteOefeningDatabank(where: { id: "${id}" }) { id } }`);
}

// ── Tekentool: scene-model voor veldoefeningen ─────────────────────────────────
// "Kies je tekenfiguur" (template pagina 7): spelers/pionnen in meerdere kleuren,
// jokers, ladder, vlag, en 3 pijltypes (pass/dribbel/loop zonder bal).

export type DrawingElementType =
  | 'player' | 'cone' | 'joker' | 'goal' | 'ball' | 'ladder' | 'flag'
  | 'hoop' | 'wall' | 'marker' | 'coach' | 'image'
  | 'arrow-pass' | 'arrow-dribble' | 'arrow-run' | 'text';

export type PlayerColor = 'red' | 'blue' | 'white' | 'grey';
export type ConeColor = 'orange' | 'red' | 'green' | 'blue';

export interface DrawingElement {
  id: string;
  type: DrawingElementType;
  x: number; y: number;     // % van viewBox (0-100)
  x2?: number; y2?: number; // eindpunt, enkel voor pijlen
  label?: string;           // spelernummer of tekstinhoud
  color?: string;           // PlayerColor voor 'player', ConeColor voor 'cone'
  rotation?: number;        // graden, rond het eigen middelpunt (niet gebruikt bij pijlen)
  scale?: number;           // schaalfactor rond het eigen middelpunt, standaard 1 (niet gebruikt bij pijlen)
  src?: string;             // data-URI, enkel voor 'image'
  width?: number;           // basisbreedte in viewBox-eenheden bij scale 1, enkel voor 'image'
  height?: number;          // basishoogte in viewBox-eenheden bij scale 1, enkel voor 'image'
}

export const PLAYER_COLORS: { value: PlayerColor; label: string; hex: string }[] = [
  { value: 'red',   label: 'Rood',  hex: '#CC1A1A' },
  { value: 'blue',  label: 'Blauw', hex: '#2563eb' },
  { value: 'white', label: 'Wit',   hex: '#f5f5f5' },
  { value: 'grey',  label: 'Grijs', hex: '#6b7280' },
];
export const CONE_COLORS: { value: ConeColor; label: string; hex: string }[] = [
  { value: 'orange', label: 'Oranje', hex: '#F5A623' },
  { value: 'red',    label: 'Rood',   hex: '#CC1A1A' },
  { value: 'green',  label: 'Groen',  hex: '#22c55e' },
  { value: 'blue',   label: 'Blauw',  hex: '#2563eb' },
];

export type DrawingBackground = 'grid' | 'half' | 'full';

/** Eén stap in een bewegingsanimatie — enkel posities die afwijken van de
 * basisplaatsing van het element zijn nodig; ontbrekende elementen vallen
 * terug op hun basis-positie (bv. net toegevoegd na deze stap). */
export interface AnimationFrame {
  id: string;
  label?: string;
  positions: Record<string, { x: number; y: number; x2?: number; y2?: number }>;
}

export interface DrawingScene {
  background: DrawingBackground;
  elements: DrawingElement[];
  /** Data-URI van de originele veldtekening (bv. bij PDF-import) — getoond als
   * achtergrond i.p.v. het vector-veld, tot de trainer een preset-achtergrond kiest. */
  backgroundImage?: string;
  /** Optionele bewegingsanimatie (wie loopt waarheen, waar gaat de bal naartoe) — afwezig/leeg = statische tekening. */
  animation?: { frames: AnimationFrame[] };
}

export function parseDrawingScene(raw: string): DrawingScene {
  if (!raw) return { background: 'grid', elements: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.elements)) return parsed as DrawingScene;
  } catch { /* fall through to default */ }
  return { background: 'grid', elements: [] };
}
