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
  club: { id: string; name: string } | null;
  active: string;
}

export interface ClubRecord {
  id: string;
  name: string;
  stamnummer: string;
  /** Data-URL (PNG/JPEG) of lege string. */
  logo: string;
  teamsCount: number;
}

export interface Player {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  position2?: string | null;   // tweede (alternatieve) positie
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
  rotation?: string;            // 'true' = niet geselecteerd omwille van een beurtrol
  manualSeconds: number | null; // handmatige speeltijd-override voor deze wedstrijd, null = automatisch (playTimeSessions)
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
    teams(take: 100, orderBy: { name: asc }) { id name category club { id name } active }
  }`);
  return data.teams;
}

export async function createTeam(input: { name: string; category: string; clubId?: string; trainerId?: string }): Promise<Team> {
  const teamData: Record<string, unknown> = { name: input.name, category: input.category, active: 'true' };
  if (input.clubId) teamData.club = { connect: { id: input.clubId } };
  if (input.trainerId) teamData.trainers = { connect: { id: input.trainerId } };
  const data = await gql(
    `mutation CreateTeam($data: TeamCreateInput!) { createTeam(data: $data) { id name category club { id name } active } }`,
    { data: teamData }
  );
  return data.createTeam;
}

export async function updateTeam(id: string, input: Record<string, unknown>): Promise<Team> {
  const data = await gql(
    `mutation UpdateTeam($id: ID!, $data: TeamUpdateInput!) { updateTeam(where: { id: $id }, data: $data) { id name category club { id name } active } }`,
    { id, data: input }
  );
  return data.updateTeam;
}

/** Relatie-input om de club van een ploeg te zetten of los te koppelen. */
export function teamClubInput(clubId: string): Record<string, unknown> {
  return clubId ? { connect: { id: clubId } } : { disconnect: true };
}

// ── Clubs (admin) ─────────────────────────────────────────────────────────────

const CLUB_FIELDS = 'id name stamnummer logo teamsCount';

export async function getClubs(): Promise<ClubRecord[]> {
  const data = await gql(`query { clubs(take: 500, orderBy: { name: asc }) { ${CLUB_FIELDS} } }`);
  return data.clubs;
}

export async function createClub(input: { name: string; stamnummer: string; logo: string }): Promise<ClubRecord> {
  const data = await gql(
    `mutation($data: ClubCreateInput!) { createClub(data: $data) { ${CLUB_FIELDS} } }`,
    { data: input }
  );
  return data.createClub;
}

export async function updateClub(id: string, input: { name?: string; stamnummer?: string; logo?: string }): Promise<ClubRecord> {
  const data = await gql(
    `mutation($id: ID!, $data: ClubUpdateInput!) { updateClub(where: { id: $id }, data: $data) { ${CLUB_FIELDS} } }`,
    { id, data: input }
  );
  return data.updateClub;
}

export async function deleteClub(id: string): Promise<void> {
  await gql(`mutation($id: ID!) { deleteClub(where: { id: $id }) { id } }`, { id });
}

/** Leest een afbeeldingsbestand in, verkleint het tot max. `maxSize` px (lange
 * zijde) en geeft een PNG-data-URL terug — houdt het in de database bewaarde
 * logo klein, ongeacht hoe groot het geüploade bestand is. */
export function imageFileToLogoDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('Kies een afbeelding (PNG, JPEG, SVG…).')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || maxSize, img.naturalHeight || maxSize));
      const w = Math.max(1, Math.round((img.naturalWidth || maxSize) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || maxSize) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error('Afbeelding kon niet verwerkt worden.')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Afbeelding kon niet gelezen worden.')); };
    img.src = url;
  });
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
  position2?: string | null;
  active: string;
  team: { id: string; name: string; category: string } | null;
}

export async function getAllPlayersWithTeam(): Promise<PlayerWithTeam[]> {
  const data = await gql(`query {
    players(take: 2000, orderBy: { name: asc }) { id name number position position2 active team { id name category } }
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
    players(take: 1000, orderBy: { name: asc }${where}) { id name number position position2 active }
  }`);
  return data.players;
}

export async function createPlayer(input: { name: string; number?: number; position?: string; position2?: string; active?: string; teamId?: string }) {
  const { active = 'true', teamId, ...rest } = input;
  const clean: Record<string, unknown> = { ...rest, active };
  if (teamId) clean.team = { connect: { id: teamId } };
  Object.keys(clean).forEach(k => { if (clean[k] === undefined || clean[k] === '') delete clean[k]; });
  const data = await gql(
    `mutation CreatePlayer($data: PlayerCreateInput!) {
       createPlayer(data: $data) { id name number position position2 active }
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
       updatePlayer(where: { id: $id }, data: $data) { id name number position position2 active }
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

/** Naam van de eigen club — gezet door TeamContext zodra de trainer gekend is. */
let homeClubName = '';
export function setHomeClubName(name: string): void { homeClubName = name.trim(); }

/** Trainers plakken het tegenstander-veld soms over uit een officiële
 * kalender die de volledige "Thuis - Uit"-titel toont (bv. "<Eigen club> - FC
 * Negenmanneke") i.p.v. enkel de bezoekende ploeg — dat verdubbelt de eigen
 * clubnaam overal waar de UI het thuisteam er zelf al vóór zet (bv. de
 * Matchday-banner "<club> vs {opponent}"). Knip een leidende eigen clubnaam
 * (met evt. een stamnummer en een scheidingsteken) er dus weg, maar enkel als
 * er nog een echte tegenstandernaam overblijft. */
function sanitizeOpponentName(raw: string): string {
  const trimmed = raw.trim();
  if (!homeClubName) return trimmed;
  const namePattern = homeClubName.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const re = new RegExp(`^${namePattern}\\s*(?:\\d+)?\\s*[-–:]\\s*`, 'i');
  const stripped = trimmed.replace(re, '').trim();
  return stripped || trimmed;
}

export async function createMatch(input: { opponent: string; date: string; location: string; teamId?: string }) {
  const { teamId, ...rest } = input;
  const matchData: Record<string, unknown> = {
    ...rest, opponent: sanitizeOpponentName(input.opponent),
    status: 'planned', currentPeriod: 0, periodStatus: 'idle', scoreHome: 0, scoreAway: 0,
  };
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
  const data0 = typeof input.opponent === 'string' ? { ...input, opponent: sanitizeOpponentName(input.opponent) } : input;
  const data = await gql(
    `mutation UpdateMatch($id: ID!, $data: MatchUpdateInput!) {
       updateMatch(where: { id: $id }, data: $data) { id opponent date location status currentPeriod periodStatus scoreHome scoreAway matchStartTime }
     }`,
    { id, data: data0 }
  );
  return data.updateMatch;
}

/** Stand en status van één wedstrijd — licht genoeg om geregeld op te vragen. */
export async function getMatchScore(matchId: string): Promise<Pick<Match, 'status' | 'periodStatus' | 'scoreHome' | 'scoreAway'> | null> {
  const data = await gql(
    `query GetMatchScore($id: ID!) { match(where: { id: $id }) { status periodStatus scoreHome scoreAway } }`,
    { id: matchId }
  );
  return data.match;
}

/** Wisselschema van een wedstrijd als JSON-tekst; leeg = nog niets opgeslagen. */
export async function getPlannerSettings(matchId: string): Promise<string> {
  const data = await gql(
    `query GetPlannerSettings($id: ID!) { match(where: { id: $id }) { id plannerSettings } }`,
    { id: matchId }
  );
  return data.match?.plannerSettings ?? '';
}

/** Bewaart het schema als de database nog `expected` bevat; false = iemand anders was eerst. */
export async function savePlannerSettings(matchId: string, expected: string, value: string): Promise<boolean> {
  const data = await gql(
    `mutation SavePlannerSettings($matchId: ID!, $expected: String!, $value: String!) {
       savePlannerSettings(matchId: $matchId, expected: $expected, value: $value)
     }`,
    { matchId, expected, value }
  );
  return data.savePlannerSettings;
}

export async function deleteMatch(id: string) {
  await gql(`mutation { deleteMatch(where: { id: "${id}" }) { id } }`);
}

/** De drie prioriteits-lagen waaruit de "wedstrijd van de week" gekozen wordt:
 * actief lopende wedstrijden, dan wedstrijden binnen 7 dagen, dan eender welke
 * geplande wedstrijd in de toekomst — telkens gesorteerd op datum. Gedeeld
 * door getMatchOfTheWeek() (kiest gewoon de eerste van de eerste niet-lege
 * laag) en getSameDayMatchCandidates() (checkt of die keuze wel uniek is). */
function matchOfWeekTiers(matches: Match[]): Match[][] {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const active = matches.filter(m => m.status === 'active');
  const upcoming = matches
    .filter(m => {
      const d = new Date(m.date);
      return m.status === 'planned' && d >= now && d <= in7;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const planned = matches
    .filter(m => m.status === 'planned' && new Date(m.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return [active, upcoming, planned];
}

export function getMatchOfTheWeek(matches: Match[]): Match | null {
  for (const tier of matchOfWeekTiers(matches)) {
    if (tier.length) return tier[0];
  }
  return null;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Wanneer de wedstrijd die getMatchOfTheWeek() zou kiezen niet uniek is —
 * bv. twee wedstrijden gepland op dezelfde dag — geeft dit alle
 * gelijk-gerangschikte kandidaten terug, zodat de trainer expliciet kan
 * kiezen welke hij in Matchday wil opstarten i.p.v. dat stilzwijgend de
 * eerste (bv. alfabetisch/insertie-volgorde) gekozen wordt. Retourneert null
 * wanneer er geen ambiguïteit is (0 of 1 kandidaat) — de normale
 * auto-selectie volstaat dan. */
export function getSameDayMatchCandidates(matches: Match[]): Match[] | null {
  for (const tier of matchOfWeekTiers(matches)) {
    if (tier.length === 0) continue;
    if (tier.length === 1) return null;
    const first = tier[0];
    const sameDay = tier.filter(m => isSameCalendarDay(new Date(m.date), new Date(first.date)));
    return sameDay.length > 1 ? sameDay : null;
  }
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
         id player { id name number position position2 active } match { id } present selected rotation manualSeconds
       }
     }`,
    { matchId }
  );
  return data.attendances;
}

/** Zet (of wist, bij null) de handmatige speeltijd-override voor deze speler
 * in deze wedstrijd — zie Attendance.manualSeconds in schema.ts. */
export async function setManualPlaytime(attendanceId: string, seconds: number | null): Promise<Attendance> {
  const data = await gql(
    `mutation SetManualPlaytime($id: ID!, $manualSeconds: Int) {
       updateAttendance(where: { id: $id }, data: { manualSeconds: $manualSeconds }) {
         id player { id name number position position2 active } match { id } present selected rotation manualSeconds
       }
     }`,
    { id: attendanceId, manualSeconds: seconds }
  );
  return data.updateAttendance;
}

/** Zet aanwezigheid/selectie van een speler voor een wedstrijd. `rotation` =
 * bewust niet geselecteerd omwille van een beurtrol; selecteren wist de beurtrol
 * altijd, zonder `rotation` blijft een bestaande beurtrol verder ongemoeid. */
export async function setAttendance(matchId: string, playerId: string, present: boolean, selected: boolean, rotation?: boolean) {
  const fields: Record<string, string> = {
    present: present ? 'true' : 'false',
    selected: selected ? 'true' : 'false',
  };
  if (selected) fields.rotation = 'false';
  else if (rotation !== undefined) fields.rotation = rotation ? 'true' : 'false';
  const existingData = await gql(
    `query { attendances(where: { match: { id: { equals: "${matchId}" } }, player: { id: { equals: "${playerId}" } } }, take: 1) { id } }`
  );
  const existing = existingData.attendances[0];
  if (existing) {
    const data = await gql(
      `mutation UpdateAttendance($id: ID!, $data: AttendanceUpdateInput!) { updateAttendance(where: { id: $id }, data: $data) { id present selected rotation } }`,
      { id: existing.id, data: fields }
    );
    return data.updateAttendance;
  } else {
    const data = await gql(
      `mutation CreateAttendance($data: AttendanceCreateInput!) { createAttendance(data: $data) { id present selected rotation } }`,
      { data: { match: { connect: { id: matchId } }, player: { connect: { id: playerId } }, ...fields } }
    );
    return data.createAttendance;
  }
}

export interface RotationEntry {
  playerId: string;
  match: { id: string; opponent: string; date: string };
}

/** Alle beurtrollen van een ploeg (alle ploegen zonder teamId), oudste eerst. */
export async function getRotations(teamId?: string): Promise<RotationEntry[]> {
  const data = await gql(
    `query GetRotations($where: AttendanceWhereInput!) {
       attendances(where: $where, take: 5000) { player { id } match { id opponent date } }
     }`,
    { where: { rotation: { equals: 'true' }, ...(teamId ? { match: { team: { id: { equals: teamId } } } } : {}) } }
  );
  return (data.attendances as Array<{ player: { id: string } | null; match: RotationEntry['match'] | null }>)
    .filter(a => a.player && a.match)
    .map(a => ({ playerId: a.player!.id, match: a.match! }))
    .sort((a, b) => new Date(a.match.date).getTime() - new Date(b.match.date).getTime());
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


/** Wedstrijd opnieuw beginnen: alle doelpunten weg, stand per periode en
 * totaal op 0, status terug naar gepland. Selectie, opstellingen en
 * speeltijd-sessies blijven ongemoeid. */
export async function resetMatchScore(matchId: string): Promise<void> {
  const [goals, periods] = await Promise.all([getGoalsForMatch(matchId), getPeriodsForMatch(matchId)]);
  if (goals.length) {
    await gql(
      `mutation DeleteGoals($where: [GoalWhereUniqueInput!]!) { deleteGoals(where: $where) { id } }`,
      { where: goals.map(g => ({ id: g.id })) }
    );
  }
  if (periods.length) {
    await gql(
      `mutation ResetPeriods($data: [PeriodUpdateArgs!]!) { updatePeriods(data: $data) { id } }`,
      { data: periods.map(p => ({ where: { id: p.id }, data: { scoreHome: 0, scoreAway: 0 } })) }
    );
  }
  await updateMatch(matchId, { scoreHome: 0, scoreAway: 0, status: 'planned', currentPeriod: 0, periodStatus: 'idle' });
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

// ── Opstelling per match+kwart (MatchLineup) — de backend-rij ís de opstelling,
// er is geen lokale (localStorage) kopie meer. Een eerdere opzet hield de
// opstelling bij in localStorage en spiegelde wijzigingen "fire and forget"
// naar de backend via een apart find-dan-create/update upsert-stap; dat bleek
// niet race-vrij te maken vanaf de client (elk toestel/tabblad heeft zijn eigen
// geheugen, dus twee trainers die na elkaar opslaan kunnen elkaars "bestaat er
// al een rij"-check nog steeds voor zijn), en liet bovendien elk toestel zijn
// eigen — mogelijk verouderde — cache tonen. upsertMatchLineup hieronder roept
// één server-side mutatie aan (zie backend/customSchema.ts) die het
// find-dan-create/update wél atomisch per match+kwart serialiseert (voor ÁLLE
// toestellen tegelijk, niet enkel het eigen tabblad) — de backend is nu de
// enige bron van waarheid, gelezen bij het laden van de match (getMatchLineups)
// en bijgewerkt bij elke wijziging (upsertMatchLineup).
export interface MatchLineup {
  id: string;
  period: number;
  assignment: string;         // JSON: Record<posKey, playerId>
  selectedPlayerIds: string;  // JSON: string[]
}

const MATCH_LINEUP_FIELDS = `id period assignment selectedPlayerIds`;

export async function getMatchLineups(matchId: string): Promise<MatchLineup[]> {
  const data = await gql(
    `query GetMatchLineups($matchId: ID!) {
      matchLineups(where: { match: { id: { equals: $matchId } } }, take: 10) { ${MATCH_LINEUP_FIELDS} }
    }`,
    { matchId }
  );
  return data.matchLineups;
}

export async function upsertMatchLineup(
  matchId: string, period: number, assignment: Record<string, string>, selectedPlayerIds: string[]
): Promise<MatchLineup> {
  const data = await gql(
    `mutation UpsertMatchLineup($matchId: ID!, $period: Int!, $assignment: String!, $selectedPlayerIds: String!) {
      upsertMatchLineup(matchId: $matchId, period: $period, assignment: $assignment, selectedPlayerIds: $selectedPlayerIds) { ${MATCH_LINEUP_FIELDS} }
    }`,
    { matchId, period, assignment: JSON.stringify(assignment), selectedPlayerIds: JSON.stringify(selectedPlayerIds) }
  );
  return data.upsertMatchLineup;
}

// ── Voorkeursopstelling per trainer (LineupProposal) — bij een ploeg met 2+
// trainers kan elke trainer onafhankelijk een voorstel per kwart klaarzetten;
// nadien wordt op Matchday gekozen welk voorstel via upsertMatchLineup
// effectief toegepast wordt. Zelfde upsert-aanpak als MatchLineup hierboven:
// één server-side mutatie i.p.v. een client-side find-dan-create/update.
export interface LineupProposal {
  id: string;
  match: { id: string };
  trainer: { id: string; name: string };
  period: number;
  assignment: string; // JSON: Record<posKey, playerId>
}

const LINEUP_PROPOSAL_FIELDS = `id period assignment trainer { id name } match { id }`;

export async function getLineupProposals(matchId: string): Promise<LineupProposal[]> {
  const data = await gql(
    `query GetLineupProposals($matchId: ID!) {
      lineupProposals(where: { match: { id: { equals: $matchId } } }, take: 200) { ${LINEUP_PROPOSAL_FIELDS} }
    }`,
    { matchId }
  );
  return data.lineupProposals;
}

/** Slaat het voorstel van de ingelogde trainer voor dit kwart op — welke
 * trainer het is, bepaalt de backend zelf op basis van de sessie (zie
 * upsertLineupProposal in customSchema.ts), dus die kan hier niet vervalst
 * worden door een client-aangeleverd trainerId. */
export async function saveLineupProposal(
  matchId: string, period: number, assignment: Record<string, string>
): Promise<LineupProposal> {
  const data = await gql(
    `mutation UpsertLineupProposal($matchId: ID!, $period: Int!, $assignment: String!) {
      upsertLineupProposal(matchId: $matchId, period: $period, assignment: $assignment) {
        id period assignment trainerId trainerName
      }
    }`,
    { matchId, period, assignment: JSON.stringify(assignment) }
  );
  const r = data.upsertLineupProposal;
  return { id: r.id, period: r.period, assignment: r.assignment, match: { id: matchId }, trainer: { id: r.trainerId, name: r.trainerName } };
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
    players(take: 1000, orderBy: { name: asc }${playersWhere}) { id name number position position2 active }
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
// Export en import gebruiken dezelfde kolommen, zodat een geëxporteerd bestand
// (eventueel aangepast in Excel) rechtstreeks terug geïmporteerd kan worden.
// Import werkt bestaande rijen bij i.p.v. dubbels aan te maken: spelers op naam,
// wedstrijden op tegenstander + dag.

const POSITION_CSV_LABEL: Record<string, string> = {
  keeper: 'doelman', defender: 'verdediger', midfielder: 'middenvelder', forward: 'aanvaller',
};
const POSITION_CSV_MAP: Record<string, string> = {
  doelman: 'keeper', keeper: 'keeper', dm: 'keeper', k: 'keeper',
  verdediger: 'defender', defender: 'defender', vd: 'defender', v: 'defender',
  middenvelder: 'midfielder', midfielder: 'midfielder', mv: 'midfielder', m: 'midfielder',
  aanvaller: 'forward', forward: 'forward', av: 'forward', a: 'forward', spits: 'forward',
};
const STATUS_CSV_LABEL: Record<string, string> = { planned: 'gepland', active: 'bezig', finished: 'afgelopen' };
const STATUS_CSV_MAP: Record<string, string> = {
  gepland: 'planned', planned: 'planned', bezig: 'active', live: 'active', active: 'active',
  afgelopen: 'finished', gespeeld: 'finished', finished: 'finished',
};
const YES = new Set(['ja', 'j', 'yes', 'y', 'true', '1', 'actief', 'x']);
const NO  = new Set(['nee', 'n', 'no', 'false', '0', 'inactief']);

const pad2 = (n: number) => String(n).padStart(2, '0');

export function exportPlayersCSV(players: Player[]): void {
  const rows = [
    ['naam', 'rugnummer', 'positie', 'tweede_positie', 'actief'],
    ...[...players]
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name))
      .map(p => [
        p.name,
        p.number?.toString() ?? '',
        POSITION_CSV_LABEL[p.position ?? ''] ?? '',
        POSITION_CSV_LABEL[p.position2 ?? ''] ?? '',
        p.active === 'true' ? 'ja' : 'nee',
      ]),
  ];
  downloadCSV(rows, `spelers-${todayStamp()}.csv`);
}

export function exportMatchesCSV(matches: Match[]): void {
  const rows = [
    ['tegenstander', 'datum', 'tijd', 'locatie', 'status', 'score_thuis', 'score_uit'],
    ...[...matches]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(m => {
        const d = m.date ? new Date(m.date) : null;
        return [
          m.opponent,
          d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '',
          d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '',
          m.location === 'home' ? 'thuis' : 'uit',
          STATUS_CSV_LABEL[m.status] ?? m.status,
          m.scoreHome.toString(),
          m.scoreAway.toString(),
        ];
      }),
  ];
  downloadCSV(rows, `wedstrijden-${todayStamp()}.csv`);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function downloadCSV(rows: string[][], filename: string): void {
  const content = rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  // BOM zodat Excel de UTF-8 (é, ë, ...) correct toont.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface CSVImportResult<T> {
  rows: T[];        // nieuw aangemaakt
  updated: T[];     // bestaande rij bijgewerkt
  errors: string[];
}

/** Kolomindex op basis van de header; `exclude` sluit kolommen uit die ook matchen (bv. "tweede positie"). */
function findCol(header: string[], match: (h: string) => boolean, exclude?: (h: string) => boolean): number {
  return header.findIndex(h => match(h) && !(exclude?.(h)));
}

function normHeader(h: string): string {
  return h.replace(/^﻿/, '').toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export async function importPlayersCSV(
  file: File,
  opts: {
    existing: Player[];
    create: (p: { name: string; number?: number; position?: string; position2?: string; active?: string }) => Promise<unknown>;
    update: (id: string, p: Record<string, unknown>) => Promise<unknown>;
  },
): Promise<CSVImportResult<Player>> {
  const lines = parseCSV(await file.text());
  if (lines.length < 2) return { rows: [], updated: [], errors: ['Bestand lijkt leeg of heeft geen header'] };

  const header = lines[0].map(normHeader);
  const isPos2 = (h: string) => h.includes('tweede') || h.includes('2') || h.includes('alt');
  const nameIdx = findCol(header, h => h.includes('naam') || h === 'name');
  const numIdx  = findCol(header, h => h.includes('rug') || h === 'nummer' || h === 'nr' || h === '#' || h === 'number');
  const posIdx  = findCol(header, h => h.includes('pos'), isPos2);
  const pos2Idx = findCol(header, h => h.includes('pos') && isPos2(h));
  const actIdx  = findCol(header, h => h.includes('actief') || h === 'active' || h === 'status');

  if (nameIdx === -1) return { rows: [], updated: [], errors: ['Kolom "naam" niet gevonden in de CSV-header'] };

  const byName = new Map(opts.existing.map(p => [normName(p.name), p]));
  const errors: string[] = [];
  const created: Player[] = [];
  const updated: Player[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.every(c => !c.trim())) continue;
    const cell = (idx: number) => (idx >= 0 ? row[idx]?.trim() ?? '' : '');
    const name = cell(nameIdx);
    if (!name) { errors.push(`Rij ${i + 1}: naam ontbreekt`); continue; }
    if (seen.has(normName(name))) { errors.push(`Rij ${i + 1} (${name}): staat meerdere keren in het bestand — enkel de eerste is gebruikt`); continue; }
    seen.add(normName(name));

    const numRaw = cell(numIdx);
    const number = numRaw ? parseInt(numRaw.replace(/^#/, ''), 10) : undefined;
    if (numRaw && (number === undefined || isNaN(number))) { errors.push(`Rij ${i + 1} (${name}): ongeldig rugnummer "${numRaw}"`); continue; }

    const posRaw = cell(posIdx).toLowerCase(), pos2Raw = cell(pos2Idx).toLowerCase();
    const position = POSITION_CSV_MAP[posRaw];
    const position2Mapped = POSITION_CSV_MAP[pos2Raw];
    const position2 = position2Mapped && position2Mapped !== position ? position2Mapped : undefined;
    if (posRaw && !position) errors.push(`Rij ${i + 1} (${name}): onbekende positie "${posRaw}" — genegeerd`);
    if (pos2Raw && !position2Mapped) errors.push(`Rij ${i + 1} (${name}): onbekende tweede positie "${pos2Raw}" — genegeerd`);

    const actRaw = cell(actIdx).toLowerCase();
    const active = YES.has(actRaw) ? 'true' : NO.has(actRaw) ? 'false' : undefined;

    try {
      const existing = byName.get(normName(name));
      if (existing) {
        // Enkel kolommen die in het bestand staan overschrijven; lege cel = wissen.
        const input: Record<string, unknown> = {};
        if (numIdx >= 0) input.number = number ?? null;
        if (posIdx >= 0 && (position || !posRaw)) input.position = position ?? null;
        if (pos2Idx >= 0 && (position2Mapped || !pos2Raw)) input.position2 = position2 ?? null;
        if (active) input.active = active;
        if (Object.keys(input).length) await opts.update(existing.id, input);
        updated.push(existing);
      } else {
        const p = await opts.create({
          name,
          ...(number !== undefined ? { number } : {}),
          ...(position ? { position } : {}),
          ...(position2 ? { position2 } : {}),
          ...(active ? { active } : {}),
        });
        created.push(p as Player);
      }
    } catch (e) {
      errors.push(`Rij ${i + 1} (${name}): ${e instanceof Error ? e.message : 'onbekende fout'}`);
    }
  }
  return { rows: created, updated, errors };
}

/** "12/10/2026", "12-10-26", "2026-10-12" (+ optioneel "14:30", ook in dezelfde cel). */
function parseCSVDate(dateRaw: string, timeRaw: string): Date | null {
  const [datePart, inlineTime] = dateRaw.trim().split(/\s+/);
  let y: number, mo: number, d: number;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(datePart);
  const eu  = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(datePart);
  if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (eu) { d = +eu[1]; mo = +eu[2]; y = +eu[3]; if (y < 100) y += 2000; }
  else {
    const fallback = new Date(dateRaw);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  const t = /^(\d{1,2})[:.hu](\d{2})/.exec((timeRaw || inlineTime || '').trim());
  const date = new Date(y, mo - 1, d, t ? +t[1] : 0, t ? +t[2] : 0);
  return isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export async function importMatchesCSV(
  file: File,
  opts: {
    existing: Match[];
    create: (m: { opponent: string; date: string; location: string }) => Promise<unknown>;
    update: (id: string, m: Record<string, unknown>) => Promise<unknown>;
  },
): Promise<CSVImportResult<Match>> {
  const lines = parseCSV(await file.text());
  if (lines.length < 2) return { rows: [], updated: [], errors: ['Bestand lijkt leeg of heeft geen header'] };

  const header = lines[0].map(normHeader);
  const oppIdx   = findCol(header, h => h.includes('teg') || h.includes('opp'));
  const dateIdx  = findCol(header, h => h.includes('dat') || h === 'date');
  const timeIdx  = findCol(header, h => h.includes('tijd') || h.includes('uur') || h === 'time' || h.includes('aftrap'));
  const locIdx   = findCol(header, h => h.includes('loc') || h.includes('thuis/uit') || h === 'thuis of uit');
  const statIdx  = findCol(header, h => h.includes('status'));
  const homeIdx  = findCol(header, h => h.includes('score') && h.includes('thuis'));
  const awayIdx  = findCol(header, h => h.includes('score') && h.includes('uit'));

  if (oppIdx === -1 || dateIdx === -1) return { rows: [], updated: [], errors: ['Kolommen "tegenstander" en "datum" zijn verplicht'] };

  const errors: string[] = [];
  const created: Match[] = [];
  const updated: Match[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.every(c => !c.trim())) continue;
    const cell = (idx: number) => (idx >= 0 ? row[idx]?.trim() ?? '' : '');
    const opponent = cell(oppIdx);
    const dateRaw = cell(dateIdx);
    if (!opponent) { errors.push(`Rij ${i + 1}: tegenstander ontbreekt`); continue; }
    if (!dateRaw)  { errors.push(`Rij ${i + 1}: datum ontbreekt`); continue; }

    const date = parseCSVDate(dateRaw, cell(timeIdx));
    if (!date) { errors.push(`Rij ${i + 1}: ongeldige datum "${dateRaw}"`); continue; }

    const locRaw = cell(locIdx).toLowerCase();
    const location = locRaw.includes('uit') || locRaw === 'away' || locRaw === 'u' ? 'away' : 'home';

    // Optioneel: status en score (zoals de export ze wegschrijft).
    const extra: Record<string, unknown> = {};
    const statRaw = cell(statIdx).toLowerCase();
    if (statRaw) {
      const status = STATUS_CSV_MAP[statRaw];
      if (status) extra.status = status;
      else errors.push(`Rij ${i + 1} (${opponent}): onbekende status "${statRaw}" — genegeerd`);
    }
    for (const [idx, field] of [[homeIdx, 'scoreHome'], [awayIdx, 'scoreAway']] as const) {
      const raw = cell(idx);
      if (!raw) continue;
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 0) errors.push(`Rij ${i + 1} (${opponent}): ongeldige score "${raw}" — genegeerd`);
      else extra[field] = n;
    }

    try {
      const existing = opts.existing.find(m =>
        normName(m.opponent) === normName(opponent) && m.date && sameDay(new Date(m.date), date));
      if (existing) {
        await opts.update(existing.id, { date: date.toISOString(), location, ...extra });
        updated.push(existing);
      } else {
        const m = await opts.create({ opponent, date: date.toISOString(), location }) as Match;
        if (Object.keys(extra).length) await opts.update(m.id, extra);
        created.push(m);
      }
    } catch (e) {
      errors.push(`Rij ${i + 1} (${opponent}): ${e instanceof Error ? e.message : 'onbekende fout'}`);
    }
  }
  return { rows: created, updated, errors };
}

// ── Volledige data-export / import (backup & restore) ─────────────────────────

const FULL_TAKE = 20000;

export interface FullDataExport {
  version: 1;
  exportedAt: string;
  /** Ontbreekt in exportbestanden van vóór het Club-model. */
  clubs?: Array<{ id: string; name: string; stamnummer: string; logo: string }>;
  /** `club` = clubnaam (oudere bestanden hebben enkel dit), `clubId` verwijst naar `clubs`. */
  teams: Array<{ id: string; name: string; category: string; club: string; clubId?: string | null; active: string }>;
  weekThemes: Array<{ id: string; title: string; category: string; description: string; active: string; createdAt: string | null }>;
  trainers: Array<{ id: string; name: string; email: string; role: string; teamId: string | null }>;
  players: Array<{ id: string; name: string; number: number | null; position: string | null; position2?: string | null; active: string; teamId: string | null }>;
  matches: Array<{
    id: string; opponent: string; date: string; location: string; status: string;
    currentPeriod: number; periodStatus: string; scoreHome: number; scoreAway: number;
    matchStartTime: string | null; teamId: string | null; weekThemeId: string | null;
    plannerSettings?: string;
  }>;
  periods: Array<{ id: string; matchId: string | null; periodNumber: number; scoreHome: number; scoreAway: number; startTime: string | null; endTime: string | null; durationSeconds: number }>;
  goals: Array<{ id: string; playerId: string | null; matchId: string | null; periodNumber: number; scoredAt: string | null }>;
  attendances: Array<{ id: string; playerId: string | null; matchId: string | null; present: string; selected: string; rotation?: string; manualSeconds?: number | null }>;
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
    sharedWithIds?: string[];   // trainers met leesrechten (zie Training.sharedWith)
  }>;
  exercises: Array<{
    id: string; trainingId: string | null; order: number; fase: string; naam: string; duurMinuten: number;
    organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
  }>;
  oefeningDatabank: Array<{
    id: string; naam: string; fase: string; categorie: string | null; doelgroep: string | null; teamprincipe: string;
    spelprincipe?: string | null; duurMinuten: number; organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
    createdById: string | null; createdAt: string | null;
  }>;
  // Later toegevoegd — ontbreken in oudere exportbestanden (dan lege lijst).
  matchLineups: Array<{ id: string; matchId: string | null; period: number; assignment: string; selectedPlayerIds: string }>;
  lineupProposals: Array<{ id: string; matchId: string | null; trainerId: string | null; period: number; assignment: string }>;
  whiteboards: Array<{ id: string; naam: string; drawingData: string; trainerId: string | null; teamId: string | null; createdAt: string | null }>;
}

export async function exportAllData(): Promise<FullDataExport> {
  const data = await gql(`query {
    clubs(take: ${FULL_TAKE}) { id name stamnummer logo }
    teams(take: ${FULL_TAKE}) { id name category club { id name } active }
    weekThemes(take: ${FULL_TAKE}) { id title category description active createdAt }
    trainers(take: ${FULL_TAKE}) { id name email role team { id } }
    players(take: ${FULL_TAKE}) { id name number position position2 active team { id } }
    matches(take: ${FULL_TAKE}) {
      id opponent date location status currentPeriod periodStatus scoreHome scoreAway matchStartTime plannerSettings
      team { id } weekTheme { id }
    }
    periods(take: ${FULL_TAKE}) { id periodNumber scoreHome scoreAway startTime endTime durationSeconds match { id } }
    goals(take: ${FULL_TAKE}) { id periodNumber scoredAt player { id } match { id } }
    attendances(take: ${FULL_TAKE}) { id present selected rotation manualSeconds player { id } match { id } }
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
      trainer { id } team { id } sharedWith { id }
    }
    exercises(take: ${FULL_TAKE}) {
      id order fase naam duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun
      training { id }
    }
    oefeningDatabanks(take: ${FULL_TAKE}) {
      id naam fase categorie doelgroep teamprincipe spelprincipe duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun
      createdBy { id } createdAt
    }
    matchLineups(take: ${FULL_TAKE}) { id period assignment selectedPlayerIds match { id } }
    lineupProposals(take: ${FULL_TAKE}) { id period assignment match { id } trainer { id } }
    whiteboards(take: ${FULL_TAKE}) { id naam drawingData createdAt trainer { id } team { id } }
  }`);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs: data.clubs,
    teams: data.teams.map((t: any) => ({
      id: t.id, name: t.name, category: t.category, active: t.active,
      club: t.club?.name ?? '', clubId: t.club?.id ?? null,
    })),
    weekThemes: data.weekThemes,
    trainers: data.trainers.map((t: any) => ({ id: t.id, name: t.name, email: t.email, role: t.role, teamId: t.team?.id ?? null })),
    players: data.players.map((p: any) => ({ id: p.id, name: p.name, number: p.number, position: p.position, position2: p.position2 ?? null, active: p.active, teamId: p.team?.id ?? null })),
    matches: data.matches.map((m: any) => ({
      id: m.id, opponent: m.opponent, date: m.date, location: m.location, status: m.status,
      currentPeriod: m.currentPeriod, periodStatus: m.periodStatus, scoreHome: m.scoreHome, scoreAway: m.scoreAway,
      matchStartTime: m.matchStartTime, teamId: m.team?.id ?? null, weekThemeId: m.weekTheme?.id ?? null, plannerSettings: m.plannerSettings ?? '',
    })),
    periods: data.periods.map((p: any) => ({
      id: p.id, matchId: p.match?.id ?? null, periodNumber: p.periodNumber, scoreHome: p.scoreHome, scoreAway: p.scoreAway,
      startTime: p.startTime, endTime: p.endTime, durationSeconds: p.durationSeconds,
    })),
    goals: data.goals.map((g: any) => ({ id: g.id, playerId: g.player?.id ?? null, matchId: g.match?.id ?? null, periodNumber: g.periodNumber, scoredAt: g.scoredAt })),
    attendances: data.attendances.map((a: any) => ({ id: a.id, playerId: a.player?.id ?? null, matchId: a.match?.id ?? null, present: a.present, selected: a.selected, rotation: a.rotation ?? 'false', manualSeconds: a.manualSeconds ?? null })),
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
      sharedWithIds: (t.sharedWith ?? []).map((tr: any) => tr.id),
    })),
    exercises: data.exercises.map((ex: any) => ({
      id: ex.id, trainingId: ex.training?.id ?? null, order: ex.order, fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten,
      organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen, organisatieMateriaal: ex.organisatieMateriaal,
      beschrijving: ex.beschrijving, drawingData: ex.drawingData, coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
    })),
    oefeningDatabank: data.oefeningDatabanks.map((o: any) => ({
      id: o.id, naam: o.naam, fase: o.fase, categorie: o.categorie ?? null, doelgroep: o.doelgroep ?? null, teamprincipe: o.teamprincipe,
      spelprincipe: o.spelprincipe ?? null, duurMinuten: o.duurMinuten, organisatieSpelers: o.organisatieSpelers, organisatieAfmetingen: o.organisatieAfmetingen, organisatieMateriaal: o.organisatieMateriaal,
      beschrijving: o.beschrijving, drawingData: o.drawingData, coachingPunten: o.coachingPunten, maximaalActief: o.maximaalActief, fun: o.fun,
      createdById: o.createdBy?.id ?? null, createdAt: o.createdAt,
    })),
    matchLineups: data.matchLineups.map((l: any) => ({
      id: l.id, matchId: l.match?.id ?? null, period: l.period, assignment: l.assignment, selectedPlayerIds: l.selectedPlayerIds,
    })),
    lineupProposals: data.lineupProposals.map((l: any) => ({
      id: l.id, matchId: l.match?.id ?? null, trainerId: l.trainer?.id ?? null, period: l.period, assignment: l.assignment,
    })),
    whiteboards: data.whiteboards.map((w: any) => ({
      id: w.id, naam: w.naam, drawingData: w.drawingData, trainerId: w.trainer?.id ?? null, teamId: w.team?.id ?? null, createdAt: w.createdAt,
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
    clubs: data.clubs?.length ?? 0,
    teams: data.teams.length, weekThemes: data.weekThemes.length, trainers: data.trainers.length,
    players: data.players.length, matches: data.matches.length, periods: data.periods.length,
    goals: data.goals.length, attendances: data.attendances.length,
    playTimeSessions: data.playTimeSessions.length, evaluations: data.evaluations.length,
    trainings: data.trainings.length, exercises: data.exercises.length, oefeningDatabank: data.oefeningDatabank.length,
    matchLineups: data.matchLineups.length, lineupProposals: data.lineupProposals.length, whiteboards: data.whiteboards.length,
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
  for (const key of ['trainings', 'exercises', 'oefeningDatabank', 'matchLineups', 'lineupProposals', 'whiteboards']) {
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
  counts.matchLineups     = await deleteAllOf('matchLineups', 'deleteMatchLineups');
  counts.lineupProposals  = await deleteAllOf('lineupProposals', 'deleteLineupProposals');
  counts.whiteboards      = await deleteAllOf('whiteboards', 'deleteWhiteboards');
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

  // Clubs worden niet gewist (zie wipeAllSportData) — hergebruik dus een
  // bestaande club met dezelfde naam i.p.v. een dubbele aan te maken.
  const clubMap = new Map<string, string>();
  const clubIdByName = new Map<string, string>();
  for (const c of await getClubs()) clubIdByName.set(c.name.trim().toLowerCase(), c.id);
  async function ensureClub(name: string, extra: { stamnummer?: string; logo?: string } = {}): Promise<string> {
    const key = name.trim().toLowerCase();
    const existing = clubIdByName.get(key);
    if (existing) return existing;
    const created = await createClub({ name: name.trim(), stamnummer: extra.stamnummer ?? '', logo: extra.logo ?? '' });
    clubIdByName.set(key, created.id);
    return created.id;
  }

  counts.clubs = await step('Clubs', data.clubs ?? [], async c => {
    clubMap.set(c.id, await ensureClub(c.name, { stamnummer: c.stamnummer, logo: c.logo }));
  });

  counts.teams = await step('Ploegen', data.teams, async t => {
    const teamData: Record<string, unknown> = { name: t.name, category: t.category, active: t.active };
    const clubId = (t.clubId && clubMap.get(t.clubId))
      || (typeof t.club === 'string' && t.club.trim() ? await ensureClub(t.club) : '');
    if (clubId) teamData.club = { connect: { id: clubId } };
    const created = await gql(
      `mutation($data: TeamCreateInput!) { createTeam(data: $data) { id } }`,
      { data: teamData }
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
    const shared = (t.sharedWithIds ?? []).map(id => trainerMap.get(id)).filter((id): id is string => !!id);
    if (shared.length) input.sharedWith = { connect: shared.map(id => ({ id })) };
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
    if (o.spelprincipe) input.spelprincipe = o.spelprincipe;
    if (o.createdAt) input.createdAt = o.createdAt;
    if (trainerId) input.createdBy = { connect: { id: trainerId } };
    await gql(`mutation($data: OefeningDatabankCreateInput!) { createOefeningDatabank(data: $data) { id } }`, { data: input });
  });

  counts.players = await step('Spelers', data.players, async p => {
    const teamId = p.teamId ? teamMap.get(p.teamId) : undefined;
    const input: Record<string, unknown> = { name: p.name, active: p.active };
    if (p.number != null) input.number = p.number;
    if (p.position) input.position = p.position;
    if (p.position2) input.position2 = p.position2;
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
    // Het schema verwijst naar spelers: oude id's vervangen door de nieuw aangemaakte.
    if (m.plannerSettings) input.plannerSettings = m.plannerSettings.replace(/"([^"]+)"/g, (q, id) => {
      const mapped = playerMap.get(id);
      return mapped ? JSON.stringify(mapped) : q;
    });
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
    const input: Record<string, unknown> = { match: { connect: { id: matchId } }, present: a.present, selected: a.selected, ...(a.rotation ? { rotation: a.rotation } : {}) };
    if (a.manualSeconds != null) input.manualSeconds = a.manualSeconds;
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

  // Opstellingen bevatten speler-id's in JSON — omzetten naar de nieuwe id's.
  const remapAssignment = (json: string) => {
    try {
      const obj = JSON.parse(json || '{}') as Record<string, string>;
      return JSON.stringify(Object.fromEntries(
        Object.entries(obj).map(([pos, pid]) => [pos, playerMap.get(pid)]).filter(([, pid]) => pid)));
    } catch { return '{}'; }
  };
  const remapIds = (json: string) => {
    try { return JSON.stringify((JSON.parse(json || '[]') as string[]).map(id => playerMap.get(id)).filter(Boolean)); }
    catch { return '[]'; }
  };

  counts.matchLineups = await step('Opstellingen', data.matchLineups, async l => {
    const matchId = l.matchId ? matchMap.get(l.matchId) : undefined;
    if (!matchId) throw new Error('bijhorende wedstrijd ontbreekt');
    await gql(`mutation($data: MatchLineupCreateInput!) { createMatchLineup(data: $data) { id } }`, { data: {
      match: { connect: { id: matchId } }, period: l.period,
      assignment: remapAssignment(l.assignment), selectedPlayerIds: remapIds(l.selectedPlayerIds),
    } });
  });

  counts.lineupProposals = await step('Opstellingsvoorstellen', data.lineupProposals, async l => {
    const matchId = l.matchId ? matchMap.get(l.matchId) : undefined;
    if (!matchId) throw new Error('bijhorende wedstrijd ontbreekt');
    const input: Record<string, unknown> = { match: { connect: { id: matchId } }, period: l.period, assignment: remapAssignment(l.assignment) };
    const trainerId = l.trainerId ? trainerMap.get(l.trainerId) : undefined;
    if (trainerId) input.trainer = { connect: { id: trainerId } };
    await gql(`mutation($data: LineupProposalCreateInput!) { createLineupProposal(data: $data) { id } }`, { data: input });
  });

  counts.whiteboards = await step('Whiteboards', data.whiteboards, async w => {
    const input: Record<string, unknown> = { naam: w.naam, drawingData: w.drawingData };
    if (w.createdAt) input.createdAt = w.createdAt;
    const teamId = w.teamId ? teamMap.get(w.teamId) : undefined;
    const trainerId = w.trainerId ? trainerMap.get(w.trainerId) : undefined;
    if (teamId) input.team = { connect: { id: teamId } };
    if (trainerId) input.trainer = { connect: { id: trainerId } };
    await gql(`mutation($data: WhiteboardCreateInput!) { createWhiteboard(data: $data) { id } }`, { data: input });
  });

  return { counts, errors, trainerCredentials };
}

// ── Losse export/import: Trainingen (afzonderlijk van de volledige data-export) ──
// Voor admins die enkel trainingen + hun oefeningen willen backuppen/delen,
// zonder de rest van de clubdata (ploegen, spelers, wedstrijden, ...) erbij.

export interface TrainingenExport {
  version: 1;
  exportedAt: string;
  trainings: Array<{
    id: string; date: string; titel: string;
    duurMinuten: number; aantalSpelers: string; status: string; createdAt: string | null;
    coachNaam: string; tijdstip: string; leeftijdscategorie: string; niveau: string;
    hoofdmoment: string; spelfase: string; basisvaardigheid: string;
    speluitdagingWie: string; speluitdagingWat: string; speluitdagingWaar: string; speluitdagingWanneer: string;
    coachingswoorden: string; materiaal: string;
    actiefAanpak: string; funAanpak: string; individueleAandacht: string;
    teamprincipe: string; spelprincipe: string; focusPunten: string; jaarplanLabel: string; trainingsschema: string;
    evalBehouden: string; evalWijzigen: string; evalWarenActief: string; evalHaddenFun: string; evalBijgeleerd: string; evalIndividueleAandacht: string;
    /** Louter informatief (ploegnaam op moment van export) — wordt bij import niet gekoppeld. */
    teamNaam: string | null;
  }>;
  exercises: Array<{
    id: string; trainingId: string | null; order: number; fase: string; naam: string; duurMinuten: number;
    organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
  }>;
}

export async function exportTrainingenData(): Promise<TrainingenExport> {
  const data = await gql(`query {
    trainings(take: ${FULL_TAKE}) {
      id date titel duurMinuten aantalSpelers status createdAt
      coachNaam tijdstip leeftijdscategorie niveau
      hoofdmoment spelfase basisvaardigheid
      speluitdagingWie speluitdagingWat speluitdagingWaar speluitdagingWanneer
      coachingswoorden materiaal
      actiefAanpak funAanpak individueleAandacht
      teamprincipe spelprincipe focusPunten jaarplanLabel trainingsschema
      evalBehouden evalWijzigen evalWarenActief evalHaddenFun evalBijgeleerd evalIndividueleAandacht
      team { name }
    }
    exercises(take: ${FULL_TAKE}) {
      id order fase naam duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun
      training { id }
    }
  }`);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    trainings: data.trainings.map((t: any) => ({
      id: t.id, date: t.date, titel: t.titel,
      duurMinuten: t.duurMinuten, aantalSpelers: t.aantalSpelers, status: t.status, createdAt: t.createdAt,
      coachNaam: t.coachNaam, tijdstip: t.tijdstip, leeftijdscategorie: t.leeftijdscategorie, niveau: t.niveau,
      hoofdmoment: t.hoofdmoment, spelfase: t.spelfase, basisvaardigheid: t.basisvaardigheid,
      speluitdagingWie: t.speluitdagingWie, speluitdagingWat: t.speluitdagingWat, speluitdagingWaar: t.speluitdagingWaar, speluitdagingWanneer: t.speluitdagingWanneer,
      coachingswoorden: t.coachingswoorden, materiaal: t.materiaal,
      actiefAanpak: t.actiefAanpak, funAanpak: t.funAanpak, individueleAandacht: t.individueleAandacht,
      teamprincipe: t.teamprincipe, spelprincipe: t.spelprincipe, focusPunten: t.focusPunten, jaarplanLabel: t.jaarplanLabel, trainingsschema: t.trainingsschema,
      evalBehouden: t.evalBehouden, evalWijzigen: t.evalWijzigen, evalWarenActief: t.evalWarenActief,
      evalHaddenFun: t.evalHaddenFun, evalBijgeleerd: t.evalBijgeleerd, evalIndividueleAandacht: t.evalIndividueleAandacht,
      teamNaam: t.team?.name ?? null,
    })),
    exercises: data.exercises.map((ex: any) => ({
      id: ex.id, trainingId: ex.training?.id ?? null, order: ex.order, fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten,
      organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen, organisatieMateriaal: ex.organisatieMateriaal,
      beschrijving: ex.beschrijving, drawingData: ex.drawingData, coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
    })),
  };
}

export function countTrainingenExport(data: TrainingenExport): Record<string, number> {
  return { trainingen: data.trainings.length, exercises: data.exercises.length };
}

export async function parseTrainingenExportFile(file: File): Promise<TrainingenExport> {
  const text = await file.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('Ongeldig JSON-bestand'); }
  if (!Array.isArray(json.trainings) || !Array.isArray(json.exercises)) {
    throw new Error('Dit lijkt geen trainingen-exportbestand te zijn');
  }
  return json as TrainingenExport;
}

/** Importeert trainingen + hun oefeningen. `teamId` (optioneel) koppelt alle
 * geïmporteerde trainingen aan één gekozen ploeg — zonder dit blijven ze
 * ongekoppeld (en dus onzichtbaar in het team-gefilterde trainingenoverzicht,
 * tot een trainer/admin ze achteraf koppelt). */
export async function importTrainingenData(
  data: TrainingenExport, teamId: string | undefined, onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const errors: string[] = [];
  const trainingMap = new Map<string, string>();

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

  counts.trainingen = await step('Trainingen', data.trainings, async t => {
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

  return { counts, errors, trainerCredentials: [] };
}

// ── Losse export/import: Oefendatabank (afzonderlijk van de volledige data-export) ──

export interface OefendatabankExport {
  version: 1;
  exportedAt: string;
  oefeningDatabank: Array<{
    id: string; naam: string; fase: string; categorie: string | null; doelgroep: string | null;
    teamprincipe: string; spelprincipe: string | null; duurMinuten: number;
    organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
    beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
    createdAt: string | null;
  }>;
}

export async function exportOefendatabankData(): Promise<OefendatabankExport> {
  const data = await gql(`query {
    oefeningDatabanks(take: ${FULL_TAKE}) {
      id naam fase categorie doelgroep teamprincipe spelprincipe duurMinuten
      organisatieSpelers organisatieAfmetingen organisatieMateriaal
      beschrijving drawingData coachingPunten maximaalActief fun createdAt
    }
  }`);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    oefeningDatabank: data.oefeningDatabanks,
  };
}

export function countOefendatabankExport(data: OefendatabankExport): Record<string, number> {
  return { oefeningen: data.oefeningDatabank.length };
}

export async function parseOefendatabankExportFile(file: File): Promise<OefendatabankExport> {
  const text = await file.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('Ongeldig JSON-bestand'); }
  if (!Array.isArray(json.oefeningDatabank)) {
    throw new Error('Dit lijkt geen oefendatabank-exportbestand te zijn');
  }
  return json as OefendatabankExport;
}

export async function importOefendatabankData(
  data: OefendatabankExport, onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const errors: string[] = [];

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
  counts.oefeningen = await step('Oefendatabank', data.oefeningDatabank, async o => {
    const input: Record<string, unknown> = {
      naam: o.naam, fase: o.fase, teamprincipe: o.teamprincipe, duurMinuten: o.duurMinuten,
      organisatieSpelers: o.organisatieSpelers, organisatieAfmetingen: o.organisatieAfmetingen, organisatieMateriaal: o.organisatieMateriaal,
      beschrijving: o.beschrijving, drawingData: o.drawingData, coachingPunten: o.coachingPunten, maximaalActief: o.maximaalActief, fun: o.fun,
    };
    if (o.categorie) input.categorie = o.categorie;
    if (o.doelgroep) input.doelgroep = o.doelgroep;
    if (o.spelprincipe) input.spelprincipe = o.spelprincipe;
    if (o.createdAt) input.createdAt = o.createdAt;
    await gql(`mutation($data: OefeningDatabankCreateInput!) { createOefeningDatabank(data: $data) { id } }`, { data: input });
  });

  return { counts, errors, trainerCredentials: [] };
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
  sharedWith: Array<{ id: string; name: string; team: { id: string; name: string } | null }>;
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
  id trainer { id name } team { id } sharedWith { id name team { id name } } date titel duurMinuten aantalSpelers status createdAt
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

/** Trainingen die andere trainers expliciet met deze trainer gedeeld hebben
 * (via TrainingEditor "Delen"), ongeacht ploeg — enkel leesrecht op de
 * achterliggende data, zie backend/access.ts trainingVisibleFilter. */
export async function getSharedTrainings(trainerId: string): Promise<Training[]> {
  const data = await gql(
    `query GetSharedTrainings($trainerId: ID!) {
       trainings(
         where: { sharedWith: { some: { id: { equals: $trainerId } } } },
         take: 500, orderBy: { date: desc }
       ) { ${TRAINING_FIELDS} exercises { ${EXERCISE_FIELDS} } }
     }`,
    { trainerId }
  );
  return (data.trainings as Training[]).map(t => ({
    ...t, exercises: [...t.exercises].sort((a, b) => a.order - b.order),
  }));
}

/** Vervangt de volledige deel-lijst van een training. Enkel de maker (of een
 * admin) mag dit — zie trainingOwnedFilter op Training.update in schema.ts. */
export async function setTrainingShare(id: string, trainerIds: string[]): Promise<void> {
  await gql(
    `mutation SetTrainingShare($id: ID!, $ids: [TrainerWhereUniqueInput!]!) {
       updateTraining(where: { id: $id }, data: { sharedWith: { set: $ids } }) { id }
     }`,
    { id, ids: trainerIds.map(tid => ({ id: tid })) }
  );
}

/** Maakt een eigen, volledig bewerkbare kopie van een (met mij gedeelde)
 * training — inclusief oefeningen. De kopie hoort bij de eigen ploeg/trainer,
 * niet bij het origineel, en staat dus los van eventuele latere wijzigingen
 * of het intrekken van de share door de maker. */
export async function duplicateTraining(source: Training, trainerId: string, teamId?: string): Promise<Training> {
  const copy = await createTraining({
    date: source.date, trainerId, teamId,
    titel: source.titel ? `${source.titel} (kopie)` : '',
  });
  const { titel: _titel, ...rest } = source;
  const fieldUpdate: Record<string, unknown> = {
    duurMinuten: rest.duurMinuten, aantalSpelers: rest.aantalSpelers, status: 'concept',
    coachNaam: rest.coachNaam, tijdstip: rest.tijdstip, leeftijdscategorie: rest.leeftijdscategorie, niveau: rest.niveau,
    hoofdmoment: rest.hoofdmoment, spelfase: rest.spelfase, basisvaardigheid: rest.basisvaardigheid,
    speluitdagingWie: rest.speluitdagingWie, speluitdagingWat: rest.speluitdagingWat,
    speluitdagingWaar: rest.speluitdagingWaar, speluitdagingWanneer: rest.speluitdagingWanneer,
    coachingswoorden: rest.coachingswoorden, materiaal: rest.materiaal,
    actiefAanpak: rest.actiefAanpak, funAanpak: rest.funAanpak, individueleAandacht: rest.individueleAandacht,
    teamprincipe: rest.teamprincipe, spelprincipe: rest.spelprincipe, focusPunten: rest.focusPunten,
    jaarplanLabel: rest.jaarplanLabel, trainingsschema: rest.trainingsschema,
  };
  await updateTraining(copy.id, fieldUpdate);

  for (let i = 0; i < source.exercises.length; i++) {
    const ex = source.exercises[i];
    await createExercise(copy.id, {
      fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten, order: i,
      organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen,
      organisatieMateriaal: ex.organisatieMateriaal, beschrijving: ex.beschrijving,
      coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
      drawingData: ex.drawingData,
    });
  }
  return getTraining(copy.id) as Promise<Training>;
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

async function downloadBase64File(base64: string, filename: string, mimeType: string): Promise<void> {
  const res = await fetch(`data:${mimeType};base64,${base64}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
async function downloadPptxBase64(base64: string, filename: string): Promise<void> {
  await downloadBase64File(base64, filename, PPTX_MIME);
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
  await downloadPptxBase64(base64, filename);
}

/** Exporteert één losse, al-bewaarde oefening naar PowerPoint (zelfde
 * sjabloon-slide als in de volledige trainingsexport). */
export async function exportExerciseToPptx(exerciseId: string, filename: string): Promise<void> {
  const data = await gql(
    `mutation ExportExercisePptx($id: ID!) { exportExercisePptx(id: $id) }`,
    { id: exerciseId }
  );
  const base64: string | null = data.exportExercisePptx;
  if (!base64) throw new Error('Oefening-export mislukt');
  await downloadPptxBase64(base64, filename);
}

/** Genereert een eenvoudig PDF-verslag van deze training (geen sjabloon nodig,
 * server-side gegenereerd) en download het resultaat. */
export async function exportTrainingToPdf(trainingId: string, filename: string): Promise<void> {
  const data = await gql(
    `mutation ExportTrainingPdf($id: ID!) { exportTrainingPdf(id: $id) }`,
    { id: trainingId }
  );
  const base64: string | null = data.exportTrainingPdf;
  if (!base64) throw new Error('PDF-export mislukt');
  await downloadBase64File(base64, filename, 'application/pdf');
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
  | 'arrow-pass' | 'arrow-dribble' | 'arrow-run' | 'text'
  | 'line' | 'line-dashed' | 'rect' | 'ellipse' | 'triangle'
  | 'line-curve' | 'arrow-pass-curve';

export type PlayerColor = 'red' | 'blue' | 'yellow' | 'white' | 'grey';
export type ConeColor = 'orange' | 'red' | 'green' | 'blue';

export interface DrawingElement {
  id: string;
  type: DrawingElementType;
  x: number; y: number;     // % van viewBox (0-100)
  x2?: number; y2?: number; // eindpunt (pijlen/lijnen) of tegenoverliggende hoek van de omvattende box (zones)
  label?: string;           // spelernummer of tekstinhoud
  color?: string;           // PlayerColor voor 'player', ConeColor voor 'cone'
  rotation?: number;        // graden, rond het eigen middelpunt (niet gebruikt bij pijlen)
  scale?: number;           // schaalfactor rond het eigen middelpunt, standaard 1 (niet gebruikt bij pijlen)
  src?: string;             // data-URI, enkel voor 'image'
  width?: number;           // basisbreedte in viewBox-eenheden bij scale 1, enkel voor 'image'
  height?: number;          // basishoogte in viewBox-eenheden bij scale 1, enkel voor 'image'
  bend?: number;            // kromming (% van viewBox, loodrecht op x/y-x2/y2), enkel voor 'line-curve'/'arrow-pass-curve'
}

export const PLAYER_COLORS: { value: PlayerColor; label: string; hex: string }[] = [
  { value: 'red',   label: 'Rood',  hex: '#CC1A1A' },
  { value: 'blue',  label: 'Blauw', hex: '#2563eb' },
  { value: 'yellow', label: 'Geel', hex: '#F5D020' },
  { value: 'white', label: 'Wit',   hex: '#f5f5f5' },
  { value: 'grey',  label: 'Grijs', hex: '#6b7280' },
];
export const CONE_COLORS: { value: ConeColor; label: string; hex: string }[] = [
  { value: 'orange', label: 'Oranje', hex: '#F5A623' },
  { value: 'red',    label: 'Rood',   hex: '#CC1A1A' },
  { value: 'green',  label: 'Groen',  hex: '#22c55e' },
  { value: 'blue',   label: 'Blauw',  hex: '#2563eb' },
];

export type DrawingBackground = 'grid' | 'half' | 'full' | 'phases';

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
  /** Handmatig gekozen vorm van het vector-veld — genegeerd zolang backgroundImage
   * aanwezig is, want dan bepaalt de afbeelding zelf staand/liggend. Default 'portrait'. */
  orientation?: 'portrait' | 'landscape';
}

export function parseDrawingScene(raw: string): DrawingScene {
  if (!raw) return { background: 'grid', elements: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.elements)) return parsed as DrawingScene;
  } catch { /* fall through to default */ }
  return { background: 'grid', elements: [] };
}

// ── Whiteboard: losse, snelle tekeningen (geen training/oefening nodig) ────────

export interface WhiteboardItem {
  id: string;
  naam: string;
  drawingData: string;
  createdAt: string;
}

const WHITEBOARD_FIELDS = `id naam drawingData createdAt`;

export async function getWhiteboards(): Promise<WhiteboardItem[]> {
  const data = await gql(`query {
    whiteboards(take: 500, orderBy: { createdAt: desc }) { ${WHITEBOARD_FIELDS} }
  }`);
  return data.whiteboards;
}

export async function createWhiteboard(input: {
  naam: string; drawingData?: string; trainerId?: string; teamId?: string;
}): Promise<WhiteboardItem> {
  const itemData: Record<string, unknown> = { naam: input.naam, drawingData: input.drawingData ?? '' };
  if (input.trainerId) itemData.trainer = { connect: { id: input.trainerId } };
  if (input.teamId) itemData.team = { connect: { id: input.teamId } };
  const data = await gql(
    `mutation CreateWhiteboard($data: WhiteboardCreateInput!) { createWhiteboard(data: $data) { ${WHITEBOARD_FIELDS} } }`,
    { data: itemData }
  );
  return data.createWhiteboard;
}

export async function updateWhiteboard(id: string, input: Record<string, unknown>): Promise<WhiteboardItem> {
  const data = await gql(
    `mutation UpdateWhiteboard($id: ID!, $data: WhiteboardUpdateInput!) { updateWhiteboard(where: { id: $id }, data: $data) { ${WHITEBOARD_FIELDS} } }`,
    { id, data: input }
  );
  return data.updateWhiteboard;
}

export async function deleteWhiteboard(id: string): Promise<void> {
  await gql(
    `mutation DeleteWhiteboard($id: ID!) { deleteWhiteboard(where: { id: $id }) { id } }`,
    { id }
  );
}
