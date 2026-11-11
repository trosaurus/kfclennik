import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getMatches, getPlayers, getAttendancesForMatch, setAttendance, setManualPlaytime,
  getPlayTimeSessionsForMatch, startPlayTimeSession, stopPlayTimeSession,
  updateMatch, getMatchOfTheWeek, getSameDayMatchCandidates,
  getPeriodsForMatch, createPeriod, updatePeriod,
  getGoalsForMatch, addGoal, removeGoal,
  getMatchLineups, upsertMatchLineup,
  getTeamPlaytimeMap,
  updateSessionFieldPosition,
  getTrainers, TrainerRecord,
  Match, Player, Attendance, PlayTimeSession, Period, Goal,
  formatDuration, POSITION_LABELS, TOTAL_PERIODS,
} from '../lib/api';
import './Matchday.css';
import FieldView, { PositionTimeStats } from './FieldView';
import VoorkeurOpstellingPanel from './VoorkeurOpstellingPanel';
import { getPositionsForCategory, getPeriodDuration } from '../lib/teamConfig';
import { useTeam, useHomeLabel } from '../lib/TeamContext';
import { generateLineupPDF } from '../lib/generateLineupPDF';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerState {
  player: Player;
  attendance: Attendance;
  activeSession: PlayTimeSession | null;
  totalSeconds: number;
  onField: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Matchday({ matchId }: { matchId?: string } = {}) {
  const homeLabel = useHomeLabel();
  const { teamId, category, trainer } = useTeam();
  const [allMatches, setAllMatches]     = useState<Match[]>([]);
  const [match, setMatch]               = useState<Match | null>(null);
  const [allPlayers, setAllPlayers]     = useState<Player[]>([]);
  const [attendances, setAttendances]   = useState<Attendance[]>([]);
  const [sessions, setSessions]         = useState<PlayTimeSession[]>([]);
  const [periods, setPeriods]           = useState<Period[]>([]);
  const [goals, setGoals]               = useState<Goal[]>([]);
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState(false);
  const [busyPlayer, setBusyPlayer]     = useState<string | null>(null);

  // fieldAssignments (posities per kwart) en periodLineups (geselecteerde
  // spelers per kwart) leven UITSLUITEND in React-state, geladen vanuit de
  // backend (MatchLineup) bij het openen van de match — er is geen lokale
  // (localStorage) kopie meer die kan verouderen of per toestel kan verschillen.
  const [fieldAssignments, setFieldAssignments] = useState<Record<number, Record<string, string>>>({ 1: {}, 2: {}, 3: {}, 4: {} });
  const [periodLineups, setPeriodLineups] = useState<Record<number, string[]>>({ 1: [], 2: [], 3: [], 4: [] });
  // Refs die synchroon met fieldAssignments/periodLineups meelopen: React-state
  // wordt pas na afloop van de huidige functie gecommit, maar persistMatchLineup
  // (zie verderop) combineert bij élke wijziging de opstelling MET de kwart-
  // lineup in één MatchLineup-rij. Bij een snelle opeenvolging van aanroepen
  // binnen dezelfde tick (bv. autoAssignLeastPlayed dat tientallen posities
  // ná elkaar zet) zou lezen uit de React-state-closure dan een verouderde
  // waarde van het ANDERE veld meesturen en zo net-geschreven data overschrijven
  // — de refs geven hier altijd de meest recente waarde, ongeacht batching.
  const fieldAssignmentsRef = useRef<Record<number, Record<string, string>>>({ 1: {}, 2: {}, 3: {}, 4: {} });
  const periodLineupsRef = useRef<Record<number, string[]>>({ 1: [], 2: [], 3: [], 4: [] });
  const [tick, setTick]                 = useState(0);
  const [subModal, setSubModal]         = useState<PlayerState | null>(null);
  const [matchPicker, setMatchPicker]   = useState(false);
  // Wanneer boot() meerdere wedstrijden op dezelfde dag vindt, wordt de
  // matchPicker meteen geopend i.p.v. stilzwijgend de eerste te kiezen — dit
  // stuurt dan enkel de tekst op het lege-staat scherm erachter, zodat
  // duidelijk is WAAROM er om een keuze gevraagd wordt.
  const [needsMatchChoice, setNeedsMatchChoice] = useState(false);
  const [scoreModal, setScoreModal]     = useState(false);
  // De opstelling-planner (kwart 1-4) blijft na de aftrap enkel INklapbaar
  // bereikbaar i.p.v. volledig te verdwijnen — de opgeslagen opstellingen voor
  // kwart 2-4 blijven altijd intact (in de backend), maar zonder dit paneel was
  // er tijdens de match geen enkele manier meer om ze te bekijken of te wijzigen.
  const [showLineupPlanner, setShowLineupPlanner] = useState(false);
  // Andere trainers van dezelfde ploeg — enkel gebruikt om de "Voorkeur
  // trainers"-tab (zie LineupPlanningSection/VoorkeurOpstellingPanel) te tonen
  // wanneer de ploeg effectief 2+ trainers heeft.
  const [teammates, setTeammates] = useState<TrainerRecord[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Boot ────────────────────────────────────────────────────────────────────

  useEffect(() => { boot(); return stopTimer; }, [matchId]);

  // Ploeggenoten ophalen om te bepalen of de "Voorkeur"-knop relevant is
  // (enkel zinvol bij 2+ trainers op dezelfde ploeg).
  useEffect(() => {
    if (!teamId || !trainer) { setTeammates([]); return; }
    getTrainers().then(all => setTeammates(all.filter(t => t.team?.id === teamId && t.id !== trainer.id))).catch(() => setTeammates([]));
  }, [teamId, trainer]);

  useEffect(() => {
    const playing = match?.periodStatus === 'playing' && sessions.some(s => s.active === 'true');
    if (playing) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [sessions, match?.periodStatus]);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // Toon de "opstelling per kwart" automatisch zodra een kwart net beëindigd
  // is (i.p.v. enkel op handmatig verzoek), zodat de trainer de opstelling
  // van het volgende kwart altijd eerst ziet — en nog kan aanpassen — vóórdat
  // die effectief gestart wordt. Ook nuttig na een pagina-herlaad terwijl de
  // match al gepauzeerd stond.
  useEffect(() => {
    if (match?.periodStatus === 'paused') setShowLineupPlanner(true);
  }, [match?.periodStatus, match?.currentPeriod]);

  async function boot() {
    setLoading(true);
    try {
      const tid = teamId ?? undefined;
      const [matches, players] = await Promise.all([getMatches(tid), getPlayers(tid)]);
      setAllMatches(matches);
      setAllPlayers(players.filter(p => p.active === 'true'));
      // Ingebed in de wedstrijdflow: altijd de wedstrijd van de flow openen.
      if (matchId) {
        const fixed = matches.find(x => x.id === matchId);
        setNeedsMatchChoice(false);
        if (fixed) await loadMatch(fixed, players.filter(p => p.active === 'true'));
        else { setMatch(null); setLoading(false); }
        return;
      }
      // Staan er meerdere wedstrijden op dezelfde dag (bv. twee jeugdploegen die
      // samen op verplaatsing gaan)? Dan NIET stilzwijgend de eerste openen —
      // laat de trainer expliciet kiezen welke hij in Matchday wil opstarten.
      if (getSameDayMatchCandidates(matches)) {
        setMatch(null);
        setNeedsMatchChoice(true);
        setMatchPicker(true);
        setLoading(false);
        return;
      }
      setNeedsMatchChoice(false);
      const motw = getMatchOfTheWeek(matches);
      if (motw) await loadMatch(motw, players.filter(p => p.active === 'true'));
      else { setMatch(null); setLoading(false); }
    } catch (e) { console.error(e); setLoading(false); }
  }

  async function loadMatch(m: Match, players?: Player[]) {
    setMatch(m);
    const [att, sess, per, gls, lineupRows] = await Promise.all([
      getAttendancesForMatch(m.id),
      getPlayTimeSessionsForMatch(m.id),
      getPeriodsForMatch(m.id),
      getGoalsForMatch(m.id),
      getMatchLineups(m.id),
    ]);
    setAttendances(att);
    setSessions(sess);
    setPeriods(per);
    setGoals(gls);
    if (players) setAllPlayers(players);
    // Opstelling per kwart rechtstreeks uit de backend — dit ís de enige bron
    // van waarheid, dus wat een andere trainer op een ander toestel eerder al
    // instelde/bevestigde komt hier gewoon mee binnen.
    const fas: Record<number, Record<string, string>> = { 1: {}, 2: {}, 3: {}, 4: {} };
    const lus: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const row of lineupRows) {
      try { fas[row.period] = JSON.parse(row.assignment) || {}; } catch { /* ongeldige data — leeg blijft */ }
      try { lus[row.period] = JSON.parse(row.selectedPlayerIds) || []; } catch { /* ongeldige data — leeg blijft */ }
    }
    setFieldAssignments(fas);
    setPeriodLineups(lus);
    fieldAssignmentsRef.current = fas;
    periodLineupsRef.current = lus;
    setLoading(false);
  }

  const refresh = useCallback(async () => {
    if (!match) return;
    const [att, sess, per, gls] = await Promise.all([
      getAttendancesForMatch(match.id),
      getPlayTimeSessionsForMatch(match.id),
      getPeriodsForMatch(match.id),
      getGoalsForMatch(match.id),
    ]);
    setAttendances(att);
    setSessions(sess);
    setPeriods(per);
    setGoals(gls);
  }, [match]);

  async function refreshMatch() {
    if (!match) return;
    const fresh = await getMatches();
    setAllMatches(fresh);
    const updated = fresh.find(m => m.id === match.id);
    if (updated) setMatch(updated);
    return updated;
  }

  // ── Period management ──────────────────────────────────────────────────────

  /** Start period N: create Period record, start sessions for all selected players on field */
  async function startPeriod(periodNumber: number) {
    if (!match) return;
    setBusy(true);
    try {
      // Create or find period record
      let period = periods.find(p => p.periodNumber === periodNumber);
      if (!period) {
        period = await createPeriod(match.id, periodNumber);
      } else {
        // Update startTime if restarting (shouldn't normally happen)
        await updatePeriod(period.id, { startTime: new Date().toISOString() });
      }

      // Determine which players to put on field for this period.
      // Use saved per-period lineup if available, otherwise fall back to prev period sessions.
      const selectedAtts = attendances.filter(a => a.selected === 'true');
      const savedLineup = periodLineups[periodNumber] || [];

      let onFieldAtts: Attendance[];
      if (savedLineup.length > 0) {
        // Use the pre-configured lineup for this period
        const lineupSet = new Set(savedLineup);
        onFieldAtts = attendances.filter(a => lineupSet.has(a.player.id));
        if (onFieldAtts.length === 0) onFieldAtts = selectedAtts; // fallback
      } else if (periodNumber === 1) {
        onFieldAtts = selectedAtts;
      } else {
        // Players who were on field at end of last period
        const prevPeriodSessions = sessions.filter(s => s.period === periodNumber - 1);
        const prevAttIds = new Set(prevPeriodSessions.map(s => s.attendance.id));
        onFieldAtts = selectedAtts.filter(a => prevAttIds.has(a.id));
        if (onFieldAtts.length === 0) onFieldAtts = selectedAtts;
      }

      // Start sessions ONLY for players with an assigned field position.
      // Players without a position = bench → no session → timer doesn't run.
      const assignment = fieldAssignments[periodNumber] || {};
      const playerToPos: Record<string, string> = {};
      Object.entries(assignment).forEach(([pos, pid]) => { playerToPos[pid] = pos; });

      // Fallback: if this period has no explicit pre-assigned positions (common —
      // the pre-match planner is only shown before kickoff), reuse each player's
      // position from the previous period so they don't silently vanish from the
      // field diagram when a new quarter starts.
      if (periodNumber > 1) {
        const prevPositionedSessions = sessions.filter(s => s.period === periodNumber - 1 && s.fieldPosition);
        for (const s of prevPositionedSessions) {
          const att = attendances.find(a => a.id === s.attendance.id);
          if (att && !playerToPos[att.player.id]) playerToPos[att.player.id] = s.fieldPosition!;
        }
      }

      for (const att of onFieldAtts) {
        const posKey = playerToPos[att.player.id];
        // Only start a session if the player has a field position assigned
        if (posKey) {
          await startPlayTimeSession(att.id, periodNumber, posKey);
        }
        // Players without a posKey sit on the bench — no session started,
        // their timer stays at 0 until they're dragged onto the field.
      }

      // Update match
      const isFirstPeriod = periodNumber === 1;
      await updateMatch(match.id, {
        status: 'active',
        currentPeriod: periodNumber,
        periodStatus: 'playing',
        ...(isFirstPeriod ? { matchStartTime: new Date().toISOString() } : {}),
      });

      const updated = await refreshMatch();
      if (updated) setMatch(updated);
      await refresh();
    } finally { setBusy(false); }
  }

  /** Pause: stop all active sessions, mark period as paused.
   * Zaait daarna meteen de opstelling van het VOLGENDE kwart, zodat de
   * trainer die na het beëindigen van een kwart direct te zien krijgt (i.p.v.
   * pas bij het effectief starten) — zonder dit leek het volgende kwart met
   * een lege opstelling te beginnen, terwijl startPeriod() achter de schermen
   * gewoon terugviel op de posities van het voorbije kwart. Enkel zaaien als
   * er voor dat kwart nog niets vooraf ingesteld werd, zodat een reeds
   * geplande opstelling nooit overschreven wordt. */
  async function pausePeriod() {
    if (!match) return;
    setBusy(true);
    try {
      const activeSess = sessions.filter(s => s.active === 'true');
      for (const s of activeSess) await stopPlayTimeSession(s.id, s.startTime);

      // Mark period end time
      const period = periods.find(p => p.periodNumber === match.currentPeriod);
      if (period) await updatePeriod(period.id, { endTime: new Date().toISOString() });

      const nextPeriod = match.currentPeriod + 1;
      if (nextPeriod <= TOTAL_PERIODS) {
        const hasSavedLineup = (periodLineupsRef.current[nextPeriod] || []).length > 0;
        const hasSavedAssignment = Object.keys(fieldAssignmentsRef.current[nextPeriod] || {}).length > 0;
        if (!hasSavedLineup && !hasSavedAssignment) {
          const endingPeriodSessions = sessions.filter(s => s.period === match.currentPeriod && s.fieldPosition);
          const seededAssignment: Record<string, string> = {};
          const seededPlayerIds: string[] = [];
          for (const s of endingPeriodSessions) {
            const att = attendances.find(a => a.id === s.attendance.id);
            if (att && s.fieldPosition) {
              seededAssignment[s.fieldPosition] = att.player.id;
              seededPlayerIds.push(att.player.id);
            }
          }
          if (seededPlayerIds.length > 0) {
            const nextFas = { ...fieldAssignmentsRef.current, [nextPeriod]: seededAssignment };
            fieldAssignmentsRef.current = nextFas;
            setFieldAssignments(nextFas);
            const nextLus = { ...periodLineupsRef.current, [nextPeriod]: seededPlayerIds };
            periodLineupsRef.current = nextLus;
            setPeriodLineups(nextLus);
            persistMatchLineup(nextPeriod, seededAssignment, seededPlayerIds);
          }
        }
      }

      await updateMatch(match.id, { periodStatus: 'paused' });
      const updated = await refreshMatch();
      if (updated) setMatch(updated);
      await refresh();
    } finally { setBusy(false); }
  }

  /** End match: stop everything, mark finished */
  async function endMatch() {
    if (!match || !confirm('Match beëindigen? Alle lopende speeltijden worden gestopt.')) return;
    setBusy(true);
    try {
      const activeSess = sessions.filter(s => s.active === 'true');
      for (const s of activeSess) await stopPlayTimeSession(s.id, s.startTime);

      // Final period end
      const period = periods.find(p => p.periodNumber === match.currentPeriod);
      if (period) await updatePeriod(period.id, { endTime: new Date().toISOString() });

      // Compute total score from all periods
      const allPer = await getPeriodsForMatch(match.id);
      const totalHome = allPer.reduce((s, p) => s + (p.scoreHome || 0), 0);
      const totalAway = allPer.reduce((s, p) => s + (p.scoreAway || 0), 0);

      await updateMatch(match.id, { status: 'finished', periodStatus: 'finished', scoreHome: totalHome, scoreAway: totalAway });
      const updated = await refreshMatch();
      if (updated) setMatch(updated);
      await refresh();
    } finally { setBusy(false); }
  }

  // ── Score per period ───────────────────────────────────────────────────────

  async function savePeriodScore(periodId: string, home: number, away: number) {
    await updatePeriod(periodId, { scoreHome: home, scoreAway: away });
    // Recompute totals across all periods
    const allPer = await getPeriodsForMatch(match!.id);
    const totalHome = allPer.reduce((s, p) => s + (p.scoreHome || 0), 0);
    const totalAway = allPer.reduce((s, p) => s + (p.scoreAway || 0), 0);
    await updateMatch(match!.id, { scoreHome: totalHome, scoreAway: totalAway });
    await refresh();
    const updated = await refreshMatch();
    if (updated) setMatch(updated);
  }

  /** Zoals savePeriodScore, maar geadresseerd via kwartnummer — maakt de
   * Period-rij aan als die nog niet bestaat. Nodig om achteraf de stand van
   * een kwart aan te passen dat tijdens de wedstrijd nooit apart gestart is. */
  async function savePeriodScoreByNumber(periodNumber: number, home: number, away: number) {
    if (!match) return;
    let period = periods.find(p => p.periodNumber === periodNumber);
    if (!period) period = await createPeriod(match.id, periodNumber);
    await savePeriodScore(period.id, home, away);
  }

  // ── Player time ────────────────────────────────────────────────────────────

  // Only count the live (ticking) portion when the session is truly active.
  // A player on the bench has no active session — their timer shows completed seconds only.
  function getLiveSeconds(attId: string): number {
    void tick;
    // Een handmatige override (zie manualSeconds op Attendance) vervangt de
    // automatisch opgetelde speeltijd volledig — bedoeld voor wedstrijden waar
    // de live-timer niet (volledig) gebruikt werd, of om achteraf te corrigeren.
    const manual = attendances.find(a => a.id === attId)?.manualSeconds;
    if (manual != null) return manual;
    const attSess = sessions.filter(s => s.attendance.id === attId);
    // Sum all completed sessions
    let total = attSess
      .filter(s => s.active !== 'true')
      .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    // Add live elapsed for the single active session (only exists when on field)
    const active = attSess.find(s => s.active === 'true');
    if (active) total += Math.max(0, Math.floor((Date.now() - new Date(active.startTime).getTime()) / 1000));
    return total;
  }

  function getLiveSecondsByPeriod(attId: string, period: number): number {
    void tick;
    const attSess = sessions.filter(s => s.attendance.id === attId && s.period === period);
    // Sum completed sessions for this period
    let total = attSess
      .filter(s => s.active !== 'true')
      .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    // Add live elapsed only if active (= on field)
    const active = attSess.find(s => s.active === 'true');
    if (active) total += Math.max(0, Math.floor((Date.now() - new Date(active.startTime).getTime()) / 1000));
    return total;
  }

  function buildPlayerStates(): PlayerState[] {
    return attendances
      .filter(a => a.selected === 'true')
      .map(a => {
        const activeSession = sessions.find(s => s.attendance.id === a.id && s.active === 'true') ?? null;
        return { player: a.player, attendance: a, activeSession, totalSeconds: getLiveSeconds(a.id), onField: !!activeSession };
      })
      .sort((a, b) => (a.player.number ?? 99) - (b.player.number ?? 99));
  }

  // ── PDF generation ───────────────────────────────────────────────────────

  function handleGeneratePDF() {
    if (!match) return;
    const cat = matchCategory;

    // Build quarter data from fieldAssignments + sessions + periods
    const quarterData = [1, 2, 3, 4].map(periodNum => {
      // Get field assignment for this quarter
      const assignment: Record<string, import('../lib/api').Player | null> = {};
      const fieldAssign = fieldAssignments[periodNum] || {};

      Object.entries(fieldAssign).forEach(([posKey, playerId]) => {
        const player = allPlayers.find(p => p.id === playerId) ?? null;
        assignment[posKey] = player;
      });

      // If no pre-assignment, try to get from sessions data
      if (Object.keys(assignment).length === 0) {
        const periodSessions = sessions.filter(s => s.period === periodNum && s.fieldPosition);
        for (const sess of periodSessions) {
          if (sess.fieldPosition && !assignment[sess.fieldPosition]) {
            const att = attendances.find(a => a.id === sess.attendance.id);
            if (att) assignment[sess.fieldPosition] = att.player;
          }
        }
      }

      // Score for this quarter
      const period = periods.find(p => p.periodNumber === periodNum);
      return {
        periodNumber: periodNum,
        assignment,
        periodSeconds: {},
        scoreHome: period?.scoreHome ?? 0,
        scoreAway: period?.scoreAway ?? 0,
      };
    });

    generateLineupPDF({
      match,
      category: cat,
      teamName: trainer?.team?.name ?? homeLabel,
      clubTitle: [trainer?.team?.club?.name, trainer?.team?.club?.stamnummer].filter(Boolean).join(' '),
      quarters: quarterData,
      allPlayers,
      sessions,
      attendances,
    });
  }

  // ── Optimistic session stop — immediately update local state ─────────────
  function optimisticStopSession(sessionId: string, startTime: string) {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, active: 'false', durationSeconds: elapsed, endTime: new Date().toISOString() }
        : s
    ));
  }

  // ── Field assignment ──────────────────────────────────────────────────────

  /** Stuurt de huidige opstelling voor dit kwart naar de backend (MatchLineup)
   * — de enige plek waar dit heen gaat; er is geen lokale cache meer om uit
   * de pas te lopen met wat er echt is opgeslagen. "Fire and forget" qua UI
   * (niet awaited door de aanroepers): de React-state is al bijgewerkt vóór
   * dit aangeroepen wordt, dus de gebruiker hoeft niet op het netwerk te
   * wachten. De backend zelf serialiseert gelijktijdige upserts per match+
   * kwart (zie upsertMatchLineup in customSchema.ts), dus snel na elkaar
   * posities zetten kan hier niet meer tot dubbele/verouderde rijen leiden. */
  function persistMatchLineup(period: number, assignment: Record<string, string>, selectedPlayerIds: string[]) {
    if (!match) return;
    upsertMatchLineup(match.id, period, assignment, selectedPlayerIds)
      .catch(err => console.error('Kon opstelling niet opslaan:', err));
  }

  function handleSetPeriodLineup(period: number, playerIds: string[]) {
    const next = { ...periodLineupsRef.current, [period]: playerIds };
    periodLineupsRef.current = next;
    setPeriodLineups(next);
    persistMatchLineup(period, fieldAssignmentsRef.current[period] || {}, playerIds);
  }

  function handlePreAssign(period: number, posKey: string, playerId: string | null) {
    const nextForPeriod = { ...fieldAssignmentsRef.current[period] };
    if (playerId === null) {
      delete nextForPeriod[posKey];
    } else {
      // Remove player from any other position in this period
      Object.keys(nextForPeriod).forEach(k => { if (nextForPeriod[k] === playerId) delete nextForPeriod[k]; });
      nextForPeriod[posKey] = playerId;
    }
    const next = { ...fieldAssignmentsRef.current, [period]: nextForPeriod };
    fieldAssignmentsRef.current = next;
    setFieldAssignments(next);
    persistMatchLineup(period, nextForPeriod, periodLineupsRef.current[period] || []);
  }

  /** Past een gekozen voorkeursopstelling (van VoorkeurOpstellingPanel) toe op
   * dit kwart — vervangt de volledige toewijzing i.p.v. samen te voegen, zodat
   * het gekozen voorstel exact overeenkomt met wat de trainer te zien kreeg. */
  function applyLineupProposal(period: number, assignment: Record<string, string>) {
    const next = { ...fieldAssignmentsRef.current, [period]: { ...assignment } };
    fieldAssignmentsRef.current = next;
    setFieldAssignments(next);
    persistMatchLineup(period, next[period], periodLineupsRef.current[period] || []);
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  /** Doelpunt registreren voor een speler in een bepaald kwart. Zonder
   * kwartnummer valt het terug op het lopende kwart (live gebruik); met
   * kwartnummer bruikbaar om achteraf een doelpuntenmaker te corrigeren. */
  async function addGoalForPlayer(playerId: string, periodNumber: number) {
    if (!match) return;
    setBusyPlayer(playerId);
    try {
      await addGoal(match.id, playerId, periodNumber, match.location);
      // Refresh both sessions/periods (score changed) and match totals
      await refresh();
      await refreshMatch();
    } finally { setBusyPlayer(null); }
  }

  async function handleAddGoal(ps: PlayerState) {
    await addGoalForPlayer(ps.player.id, match?.currentPeriod || 1);
  }

  async function handleRemoveGoal(goalId: string, periodNumber: number) {
    if (!match) return;
    await removeGoal(goalId, match.id, periodNumber, match.location);
    await refresh();
    await refreshMatch();
  }

  /** Handmatige speeltijd-override instellen (minutes) of wissen (null, om
   * terug te schakelen naar de automatisch bijgehouden speeltijd). */
  async function handleSetManualPlaytime(attendanceId: string, minutes: number | null) {
    await setManualPlaytime(attendanceId, minutes == null ? null : Math.round(minutes * 60));
    await refresh();
  }

  // Find a free field-position slot for the current period, preferring the
  // player's own position role. Without this, sessions started outside of
  // FieldView's drag-and-drop have no fieldPosition and never appear on the
  // field diagram, even though they count as "on field" everywhere else.
  function pickFreePosition(period: number, preferredPlayer?: Player): string | undefined {
    const cat = match?.team?.category ?? category ?? 'U13';
    const positions = getPositionsForCategory(cat);
    const occupied = new Set(
      sessions.filter(s => s.period === period && s.active === 'true' && s.fieldPosition).map(s => s.fieldPosition)
    );
    const free = positions.filter(p => !occupied.has(p.key));
    if (free.length === 0) return undefined;
    const roleMatch = preferredPlayer?.position ? free.find(p => p.role === preferredPlayer.position) : undefined;
    return (roleMatch ?? free[0]).key;
  }

  async function togglePlayerTime(ps: PlayerState) {
    if (match?.periodStatus !== 'playing') return;
    setBusyPlayer(ps.player.id);
    try {
      if (ps.onField && ps.activeSession) {
        // Optimistic: immediately stop timer in UI before DB roundtrip
        optimisticStopSession(ps.activeSession.id, ps.activeSession.startTime);
        await stopPlayTimeSession(ps.activeSession.id, ps.activeSession.startTime);
      } else {
        const posKey = pickFreePosition(match.currentPeriod, ps.player);
        await startPlayTimeSession(ps.attendance.id, match.currentPeriod, posKey);
      }
      await refresh();
    } finally { setBusyPlayer(null); }
  }

  // ── Substitution ───────────────────────────────────────────────────────────

  async function handleSubstitution(outState: PlayerState, inPlayer: Player) {
    if (!match || !outState.activeSession) return;
    setBusyPlayer(outState.player.id);
    try {
      // Incoming sub takes over the outgoing player's exact field position.
      const posKey = outState.activeSession.fieldPosition ?? undefined;
      optimisticStopSession(outState.activeSession.id, outState.activeSession.startTime);
      await stopPlayTimeSession(outState.activeSession.id, outState.activeSession.startTime);
      let inAtt = attendances.find(a => a.player.id === inPlayer.id);
      if (!inAtt || inAtt.selected !== 'true') {
        await setAttendance(match.id, inPlayer.id, true, true);
        const freshAtt = await getAttendancesForMatch(match.id);
        setAttendances(freshAtt);
        inAtt = freshAtt.find(a => a.player.id === inPlayer.id)!;
      }
      // In paused state: don't start session yet — will be started when next period begins
      if (match.periodStatus === 'playing') {
        await startPlayTimeSession(inAtt.id, match.currentPeriod, posKey ?? pickFreePosition(match.currentPeriod, inPlayer));
      }
      setSubModal(null);
      await refresh();
    } finally { setBusyPlayer(null); }
  }

  function getBench(): Player[] {
    const onFieldIds = new Set(
      sessions.filter(s => s.active === 'true')
        .map(s => attendances.find(a => a.id === s.attendance.id)?.player.id)
        .filter(Boolean) as string[]
    );
    // Alleen spelers die voor deze wedstrijd geselecteerd zijn komen in aanmerking
    // als invaller — niet de volledige ploegkern.
    return attendances
      .filter(a => a.selected === 'true' && !onFieldIds.has(a.player.id))
      .map(a => a.player);
  }

  // ── Period countdown ───────────────────────────────────────────────────────

  function periodElapsedSeconds(): number {
    void tick;
    if (!match || match.periodStatus !== 'playing') return 0;
    const period = periods.find(p => p.periodNumber === match.currentPeriod);
    if (!period?.startTime) return 0;
    return Math.floor((Date.now() - new Date(period.startTime).getTime()) / 1000);
  }

  function periodRemainingSeconds(): number {
    return Math.max(0, getPeriodDuration(matchCategory) - periodElapsedSeconds());
  }

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const playerStates = buildPlayerStates();
  const onField = playerStates.filter(ps => ps.onField);
  const onBench = playerStates.filter(ps => !ps.onField);
  // De kwart-opstelling mag enkel kiezen uit spelers die al voor deze wedstrijd
  // geselecteerd zijn (Wedstrijden → Selectie) — niet de volledige ploegkern.
  const squadPlayers = allPlayers.filter(p => attendances.some(a => a.player.id === p.id && a.selected === 'true'));
  const m = match;
  // Format must follow the match's OWN team (relevant for admins viewing matches
  // across teams) — not the logged-in trainer's team, which may differ or be absent.
  const matchCategory = match?.team?.category ?? category ?? 'U13';

  if (!loading && !m) return (
    <div className="page md-empty">
      <div className="md-empty-icon">⚽</div>
      <div className="md-empty-title">{needsMatchChoice ? 'Meerdere wedstrijden vandaag' : 'Geen wedstrijd'}</div>
      <p className="md-empty-sub">
        {needsMatchChoice
          ? 'Er staan meerdere wedstrijden op dezelfde dag gepland — kies hieronder welke je wilt opstarten.'
          : 'Geen geplande wedstrijd gevonden.'}
      </p>
      <button className="btn btn-outline" onClick={() => setMatchPicker(true)}>Kies een wedstrijd</button>
      {matchPicker && <MatchPicker matches={allMatches} onPick={async m => { setMatchPicker(false); setNeedsMatchChoice(false); setLoading(true); await loadMatch(m); }} onClose={() => setMatchPicker(false)} />}
    </div>
  );

  if (loading) return <div className="page"><div className="loading-spinner">Matchday laden...</div></div>;

  const isPlaying = m!.periodStatus === 'playing';
  const isPaused  = m!.periodStatus === 'paused';
  const isFinished = m!.status === 'finished';
  const isPlanned  = m!.status === 'planned';
  const curPeriod  = m!.currentPeriod;
  const remaining  = periodRemainingSeconds();
  const elapsed    = periodElapsedSeconds();
  // scoreHome/scoreAway zijn de letterlijke thuis-/uitploeg-kolommen (zo schrijft
  // addGoal ze ook weg, o.b.v. match.location) — voor weergave naast de eigen clubnaam
  // moeten we altijd ONS cijfer tonen, niet zomaar scoreHome.
  const ownScore = m!.location === 'home' ? m!.scoreHome : m!.scoreAway;
  const oppScore = m!.location === 'home' ? m!.scoreAway : m!.scoreHome;

  return (
    <div className="page md-page">

      {/* ── TOP BANNER ── */}
      <div className="md-banner">
        <div className="md-banner-left">
          <div className="md-banner-label">
            {isPlaying  ? <><span className="md-live-dot">●</span> KWART {curPeriod} LOOPT</> :
             isPaused   ? `⏸ PAUZE — KWART ${curPeriod} KLAAR` :
             isFinished ? 'AFGELOPEN' :
             'VOLGENDE WEDSTRIJD'}
          </div>
          <div className="md-banner-vs">
            {homeLabel} <span className="md-vs-sep">vs</span> {m!.opponent}
          </div>
          <div className="md-banner-meta">
            {new Date(m!.date).toLocaleDateString('nl-BE', { weekday:'long', day:'numeric', month:'long' })}
            &nbsp;·&nbsp;
            {m!.location === 'home' ? 'Thuis' : 'Uit'}
          </div>
        </div>

        <div className="md-banner-right">
          {/* Total score */}
          <div className="md-total-score" onClick={() => !isPlanned && setScoreModal(true)}>
            <span className="md-score-num">{ownScore}</span>
            <span className="md-score-dash">–</span>
            <span className="md-score-num">{oppScore}</span>
          </div>

          {/* Period controls */}
          <div className="md-actions">
            {isPlanned && (
              <button className="btn btn-primary md-btn-start" disabled={busy || (playerStates.length === 0 && Object.keys(fieldAssignments[1] || {}).length === 0)} onClick={() => startPeriod(1)}>
                ▶ Start kwart 1
              </button>
            )}
            {isPlaying && curPeriod < TOTAL_PERIODS && (
              <button className="btn btn-outline" disabled={busy} onClick={pausePeriod}>
                ⏸ Einde kwart {curPeriod}
              </button>
            )}
            {isPlaying && curPeriod === TOTAL_PERIODS && (
              <button className="btn btn-danger" disabled={busy} onClick={endMatch}>
                ■ Eindig match
              </button>
            )}
            {isPaused && curPeriod < TOTAL_PERIODS && (
              <button className="btn btn-primary md-btn-start" disabled={busy} onClick={() => startPeriod(curPeriod + 1)}>
                ▶ Start kwart {curPeriod + 1}
              </button>
            )}
            {isPaused && curPeriod === TOTAL_PERIODS && (
              <button className="btn btn-danger" disabled={busy} onClick={endMatch}>
                ■ Eindig match
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={handleGeneratePDF} title="Opstelling PDF downloaden">📄 PDF</button>
            {!matchId && <button className="btn btn-outline btn-sm" onClick={() => setMatchPicker(true)}>📋</button>}
          </div>
        </div>
      </div>

      {/* ── Waarschuwing: geen ploeg gekoppeld ── */}
      {!m!.team && (
        <div className="md-team-warning">
          ⚠ Deze wedstrijd heeft geen ploeg gekoppeld — het veldformaat valt terug op {matchCategory}. Koppel de juiste ploeg via Wedstrijden → bewerken voor het correcte aantal veldposities.
        </div>
      )}

      {/* ── PERIOD TRACKER ── */}
      {!isPlanned && (
        <PeriodTracker
          currentPeriod={curPeriod}
          periodStatus={m!.periodStatus}
          periods={periods}
          elapsed={elapsed}
          remaining={remaining}
          fmtTime={fmtTime}
          onScoreEdit={savePeriodScore}
          isFinished={isFinished}
          location={m!.location}
          opponent={m!.opponent}
        />
      )}

      {/* ── PLANNED: per-period lineup selector, altijd zichtbaar vóór de aftrap ── */}
      {isPlanned && (
        <LineupPlanningSection
          matchId={m!.id}
          squadPlayers={squadPlayers}
          attendances={attendances}
          fieldAssignments={fieldAssignments}
          periodLineups={periodLineups}
          onPreAssign={handlePreAssign}
          onSetPeriodLineup={handleSetPeriodLineup}
          teamCategory={matchCategory}
          teamId={teamId}
          onToggleAttendance={async (playerId, sel) => {
            await setAttendance(m!.id, playerId, true, sel);
            await refresh();
          }}
          teammates={teammates}
          trainer={trainer}
          onApplyProposal={applyLineupProposal}
        />
      )}

      {/* ── ACTIEF/PAUZE: opstelling per kwart blijft inklapbaar bereikbaar, zodat
          de vooraf ingestelde opstellingen voor kwart 2-4 zichtbaar/wijzigbaar
          blijven i.p.v. te verdwijnen zodra kwart 1 gestart is ── */}
      {!isPlanned && !isFinished && (
        <div className="md-lineup-toggle-row">
          <button className="btn btn-outline btn-sm" onClick={() => setShowLineupPlanner(v => !v)}>
            {showLineupPlanner ? '▲ Verberg opstelling per kwart' : '▼ Opstelling per kwart bekijken/wijzigen'}
          </button>
          {showLineupPlanner && (
            <LineupPlanningSection
              matchId={m!.id}
              squadPlayers={squadPlayers}
              attendances={attendances}
              fieldAssignments={fieldAssignments}
              periodLineups={periodLineups}
              onPreAssign={handlePreAssign}
              onSetPeriodLineup={handleSetPeriodLineup}
              teamCategory={matchCategory}
              teamId={teamId}
              initialPeriod={Math.min(curPeriod + 1, TOTAL_PERIODS)}
              onToggleAttendance={async (playerId, sel) => {
                await setAttendance(m!.id, playerId, true, sel);
                await refresh();
              }}
              teammates={teammates}
              trainer={trainer}
              onApplyProposal={applyLineupProposal}
            />
          )}
        </div>
      )}

      {/* ── ACTIVE / PAUSED: veld + lijst altijd zichtbaar ── */}
      {(isPlaying || isPaused) && (
        <div className="md-active-layout">

          {/* Linkerkolom: veld */}
          <div className="md-active-left">
            <FieldView
              matchId={m!.id}
              period={curPeriod}
              periodStatus={m!.periodStatus}
              sessions={sessions}
              attendances={attendances}
              allPlayers={playerStates.map(ps => ps.player)}
              tick={tick}
              category={matchCategory}
              onRefresh={refresh}
              onSessionStop={(sessionId) => {
                const sess = sessions.find(s => s.id === sessionId);
                if (sess) optimisticStopSession(sessionId, sess.startTime);
              }}
            />
          </div>

          {/* Rechterkolom: spelerslijst met doelpuntknoppen */}
          <div className="md-active-right">
            <section className="md-section">
              <div className="md-section-header">
                <span className="md-section-title">
                  {isPlaying ? <>● Speelt — kwart {curPeriod}</> : `⏸ Pauze — na kwart ${curPeriod}`}
                </span>
                <span className="md-section-count">{onField.length}</span>
              </div>
              {onField.length === 0
                ? <div className="md-section-empty">Niemand op het veld</div>
                : onField.map(ps => (
                  <PlayerRow key={ps.player.id} ps={ps} isPlaying={isPlaying} busy={busyPlayer === ps.player.id}
                    onToggle={() => togglePlayerTime(ps)} onSub={() => setSubModal(ps)}
                    periodSec={getLiveSecondsByPeriod(ps.attendance.id, curPeriod)}
                    playerGoals={goals.filter(g => g.player.id === ps.player.id)}
                    onGoal={() => handleAddGoal(ps)}
                    onUndoGoal={(id, p) => handleRemoveGoal(id, p)} />
                ))
              }
            </section>

            {(onBench.length > 0 || isPaused) && (
              <section className="md-section" style={{ marginTop: 12 }}>
                <div className="md-section-header">
                  <span className="md-section-title">Wisselbank</span>
                  <span className="md-section-count">{onBench.length}</span>
                </div>
                {onBench.length === 0
                  ? <div className="md-section-empty">Geen wisselspelers</div>
                  : onBench.map(ps => (
                    <PlayerRow key={ps.player.id} ps={ps} isPlaying={isPlaying} busy={busyPlayer === ps.player.id}
                      onToggle={() => togglePlayerTime(ps)} onSub={() => setSubModal(ps)}
                      periodSec={getLiveSecondsByPeriod(ps.attendance.id, curPeriod)}
                      playerGoals={goals.filter(g => g.player.id === ps.player.id)}
                      onGoal={() => handleAddGoal(ps)}
                      onUndoGoal={(id, p) => handleRemoveGoal(id, p)} />
                  ))
                }
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── LIVE SPEELTIJDEN: always visible once match started ── */}
      {(isPlaying || isPaused) && playerStates.length > 0 && (
        <PlayerSummaryTable
          playerStates={playerStates}
          sessions={sessions}
          periods={periods}
          goals={goals}
          title="Speeltijden selectie"
          onSetManualPlaytime={handleSetManualPlaytime}
        />
      )}

      {/* ── POSITIE SPEELTIJDEN: helemaal onderaan ── */}
      {(isPlaying || isPaused) && sessions.length > 0 && (
        <PositionTimeStats
          sessions={sessions}
          attendances={attendances}
          allPlayers={playerStates.map(ps => ps.player)}
          tick={tick}
          category={matchCategory}
        />
      )}

      {/* ── FINISHED: summary ── */}
      {isFinished && (
        <MatchSummary
          playerStates={playerStates} sessions={sessions} periods={periods} goals={goals}
          location={m!.location}
          onSetManualPlaytime={handleSetManualPlaytime}
          onAddGoal={addGoalForPlayer}
          onRemoveGoal={handleRemoveGoal}
          onEditScores={() => setScoreModal(true)}
        />
      )}

      {/* ── POSITIE SPEELTIJDEN (afgelopen wedstrijd) ── */}
      {isFinished && sessions.length > 0 && (
        <PositionTimeStats
          sessions={sessions}
          attendances={attendances}
          allPlayers={playerStates.map(ps => ps.player)}
          tick={0}
          category={matchCategory}
        />
      )}

      {/* ── Sub modal ── */}
      {subModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSubModal(null)}>
          <div className="modal">
            <div className="modal-title">Wissel</div>
            <p style={{ color: 'var(--text-dim)', marginBottom: 20, fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 0 }}>
              Vervang <strong style={{ color: 'var(--white)' }}>{subModal.player.name}</strong>
              {isPaused && <span style={{ color: 'var(--yellow)', display: 'block', marginTop: 6, fontSize: 11 }}>⚠ Pauze — invaller start bij volgende kwart</span>}
            </p>
            <div className="input-label" style={{ marginBottom: 8 }}>Kies invaller:</div>
            <div className="sub-player-list">
              {getBench().map(p => (
                <button key={p.id} className="sub-player-btn" disabled={busyPlayer !== null}
                  onClick={() => handleSubstitution(subModal, p)}>
                  <span className="sub-num">{p.number ? `#${p.number}` : '—'}</span>
                  <span className="sub-name">{p.name}</span>
                  {p.position && <span className="tag tag-black" style={{ marginLeft: 'auto', fontSize: 10 }}>{POSITION_LABELS[p.position]}</span>}
                </button>
              ))}
              {getBench().length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-heading)', fontSize: 13 }}>Geen wisselspelers beschikbaar</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSubModal(null)}>Annuleer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Score edit modal (for finished) ── */}
      {scoreModal && (
        <ScoreModal match={m!} periods={periods} onSave={savePeriodScoreByNumber} onClose={() => setScoreModal(false)} />
      )}

      {matchPicker && (
        <MatchPicker matches={allMatches} current={m!} onPick={async picked => { setMatchPicker(false); setLoading(true); await loadMatch(picked); }} onClose={() => setMatchPicker(false)} />
      )}

    </div>
  );
}

// ── PeriodTracker ─────────────────────────────────────────────────────────────

function PeriodTracker({ currentPeriod, periodStatus, periods, elapsed, remaining, fmtTime, onScoreEdit, isFinished, location, opponent }: {
  currentPeriod: number; periodStatus: string; periods: Period[];
  elapsed: number; remaining: number; fmtTime: (s: number) => string;
  onScoreEdit: (id: string, h: number, a: number) => void; isFinished: boolean;
  location: string; opponent: string;
}) {
  const homeLabel = useHomeLabel();
  const [editId, setEditId]     = useState<string | null>(null);
  const [editHome, setEditHome] = useState(0);
  const [editAway, setEditAway] = useState(0);
  // scoreHome/scoreAway blijven de letterlijke thuis-/uitploeg-kolommen — welke
  // daarvan "ons" is hangt af van match.location (zie ook addGoal in lib/api.ts
  // en ownScore/oppScore in het bovenliggende component).
  const ownIsHome = location === 'home';

  function openEdit(p: Period) { setEditId(p.id); setEditHome(p.scoreHome); setEditAway(p.scoreAway); }

  function ScoreBtns({ p, home, away }: { p: Period; home: number; away: number }) {
    const ownVal = ownIsHome ? home : away;
    const oppVal = ownIsHome ? away : home;
    const bumpOwn = (delta: number) => ownIsHome
      ? onScoreEdit(p.id, Math.max(0, home + delta), away)
      : onScoreEdit(p.id, home, Math.max(0, away + delta));
    const bumpOpp = (delta: number) => ownIsHome
      ? onScoreEdit(p.id, home, Math.max(0, away + delta))
      : onScoreEdit(p.id, Math.max(0, home + delta), away);
    return (
      <div className="md-score-btns">
        <div className="md-score-team">
          <span className="md-score-team-label">{homeLabel}</span>
          <div className="md-score-ctrl">
            <button className="md-score-btn md-score-minus" onClick={() => bumpOwn(-1)}>−</button>
            <span className="md-score-val">{ownVal}</span>
            <button className="md-score-btn md-score-plus" onClick={() => bumpOwn(1)}>+</button>
          </div>
        </div>
        <span className="md-score-vsep">–</span>
        <div className="md-score-team">
          <span className="md-score-team-label">{opponent}</span>
          <div className="md-score-ctrl">
            <button className="md-score-btn md-score-minus" onClick={() => bumpOpp(-1)}>−</button>
            <span className="md-score-val">{oppVal}</span>
            <button className="md-score-btn md-score-plus" onClick={() => bumpOpp(1)}>+</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md-period-tracker">
      <div className="md-periods-row">
        {[1, 2, 3, 4].map(n => {
          const p = periods.find(pr => pr.periodNumber === n);
          const isDone = p && (n < currentPeriod || isFinished || (n === currentPeriod && periodStatus === 'paused'));
          const isActive = n === currentPeriod && periodStatus === 'playing';
          const isPending = n > currentPeriod || (n === currentPeriod && periodStatus === 'idle');

          return (
            <div key={n} className={`md-period-card ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isPending ? 'pending' : ''}`}>
              <div className="md-period-label">Kwart {n}</div>

              {isActive && (
                <div className="md-period-clock">
                  <div className="md-period-elapsed">{fmtTime(elapsed)}</div>
                  <div className="md-period-remaining">nog {fmtTime(remaining)}</div>
                </div>
              )}

              {(isDone || isActive) && p ? (
                editId === p.id ? (
                  <div className="md-period-score-edit">
                    <input type="number" min={0} className="input-field md-score-inp"
                      value={ownIsHome ? editHome : editAway}
                      onChange={e => (ownIsHome ? setEditHome : setEditAway)(+e.target.value)}
                      title={homeLabel} />
                    <span className="md-score-sep">–</span>
                    <input type="number" min={0} className="input-field md-score-inp"
                      value={ownIsHome ? editAway : editHome}
                      onChange={e => (ownIsHome ? setEditAway : setEditHome)(+e.target.value)}
                      title={opponent} />
                    <button className="btn btn-primary btn-sm" onClick={() => { onScoreEdit(p.id, editHome, editAway); setEditId(null); }}>✓</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <ScoreBtns p={p} home={p.scoreHome} away={p.scoreAway} />
                    <button className="md-period-manual-edit" onClick={() => openEdit(p)} title="Handmatig invoeren">✏️ handmatig</button>
                  </>
                )
              ) : (
                <div className="md-period-score-placeholder">— — —</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

function PlayerRow({ ps, isPlaying, busy, onToggle, onSub, periodSec, playerGoals, onGoal, onUndoGoal }: {
  ps: PlayerState; isPlaying: boolean; busy: boolean;
  onToggle: () => void; onSub: () => void; periodSec: number;
  playerGoals: Goal[]; onGoal: () => void; onUndoGoal: (id: string, period: number) => void;
}) {
  const goalCount = playerGoals.length;
  const lastGoal  = playerGoals[playerGoals.length - 1];

  return (
    <div className={`md-player-row ${ps.onField ? 'on-field' : 'on-bench'}`}>
      <div className="md-pr-top">
        <span className="md-pr-num">{ps.player.number ? `#${ps.player.number}` : '—'}</span>
        <span className="md-pr-name" title={ps.player.name}>{ps.player.name}</span>
        {ps.player.position && <span className="md-pr-pos">{POSITION_LABELS[ps.player.position]}</span>}
        {goalCount > 0 && (
          <span className="md-goal-badge">
            {'⚽'.repeat(Math.min(goalCount, 4))}{goalCount > 4 ? ` ×${goalCount}` : ''}
          </span>
        )}
      </div>
      <div className="md-pr-bottom">
        <div className="md-pr-times">
          <span className={`md-timer ${ps.onField ? 'running' : ''}`}>{formatDuration(ps.totalSeconds)}</span>
          {ps.onField && <span className="md-timer-dot">●</span>}
          {periodSec > 0 && (
            <span className="md-pr-period-time">kwart: {formatDuration(periodSec)}</span>
          )}
        </div>
        <div className="md-pr-btns">
          {/* Goal button — always visible during active/paused */}
          {(isPlaying || ps.onField) && (
            <button
              className="btn btn-sm md-goal-btn"
              disabled={busy}
              onClick={onGoal}
              title="Doelpunt registreren"
            >
              ⚽
            </button>
          )}
          {goalCount > 0 && lastGoal && (
            <button
              className="btn btn-ghost btn-sm md-undo-btn"
              disabled={busy}
              onClick={() => onUndoGoal(lastGoal.id, lastGoal.periodNumber)}
              title="Laatste doelpunt ongedaan maken"
            >
              ↩
            </button>
          )}
          {(isPlaying || !ps.onField) && (
            <>
              <button className={`btn btn-sm ${ps.onField ? 'btn-danger' : 'btn-ghost'}`}
                disabled={busy} onClick={onToggle}
                title={ps.onField ? 'Haal van veld' : 'Breng op veld'}>
                {busy ? '…' : ps.onField ? '⏸' : '▶'}
              </button>
              {ps.onField && (
                <button className="btn btn-outline btn-sm" onClick={onSub} disabled={busy} title="Vervangen">↔</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MatchSummary ──────────────────────────────────────────────────────────────

function MatchSummary({ playerStates, sessions, periods, goals, location, onSetManualPlaytime, onAddGoal, onRemoveGoal, onEditScores }: {
  playerStates: PlayerState[]; sessions: PlayTimeSession[]; periods: Period[]; goals: Goal[]; location: string;
  onSetManualPlaytime: (attendanceId: string, minutes: number | null) => Promise<void>;
  onAddGoal: (playerId: string, periodNumber: number) => Promise<void>;
  onRemoveGoal: (goalId: string, periodNumber: number) => Promise<void>;
  onEditScores: () => void;
}) {
  const homeLabel = useHomeLabel();
  // p.scoreHome/scoreAway zijn de letterlijke thuis-/uitploeg-kolommen — welke
  // daarvan "ons" is hangt af van match.location (zie ook addGoal in lib/api.ts).
  const ownField = location === 'home' ? 'scoreHome' : 'scoreAway';
  const oppField = location === 'home' ? 'scoreAway' : 'scoreHome';
  const totalOwn = periods.reduce((s, p) => s + (p[ownField] || 0), 0);
  const totalOpp = periods.reduce((s, p) => s + (p[oppField] || 0), 0);

  return (
    <div className="md-finished">
      {/* Score table per period */}
      <div className="md-summary-score-card card" style={{ marginBottom: 20 }}>
        <div className="md-summary-score-header">
          <span>Eindstand</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="md-summary-final">{totalOwn} – {totalOpp}</span>
            <button className="btn btn-outline btn-sm" onClick={onEditScores} title="Kwart- en eindstand handmatig aanpassen">✏️ Standen aanpassen</button>
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                {periods.map(p => <th key={p.id} style={{ textAlign: 'center' }}>Kwart {p.periodNumber}</th>)}
                <th style={{ textAlign: 'center' }}>Totaal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, letterSpacing: 0, whiteSpace: 'nowrap' }}>{homeLabel}</td>
                {periods.map(p => <td key={p.id} style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)', textAlign: 'center' }}>{p[ownField]}</td>)}
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--accent)', textAlign: 'center' }}>{totalOwn}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, letterSpacing: 0, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Tegenstander</td>
                {periods.map(p => <td key={p.id} style={{ fontFamily: 'var(--font-display)', fontSize: 22, textAlign: 'center' }}>{p[oppField]}</td>)}
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 26, textAlign: 'center' }}>{totalOpp}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <GoalsEditor playerStates={playerStates} goals={goals} onAddGoal={onAddGoal} onRemoveGoal={onRemoveGoal} />

      <PlayerSummaryTable playerStates={playerStates} sessions={sessions} periods={periods} goals={goals} title="Speeltijden per speler" onSetManualPlaytime={onSetManualPlaytime} />
    </div>
  );
}

// ── GoalsEditor (afgelopen wedstrijd — doelpuntenmakers per kwart corrigeren) ──

function GoalsEditor({ playerStates, goals, onAddGoal, onRemoveGoal }: {
  playerStates: PlayerState[]; goals: Goal[];
  onAddGoal: (playerId: string, periodNumber: number) => Promise<void>;
  onRemoveGoal: (goalId: string, periodNumber: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const quarters = [1, 2, 3, 4];

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  // Rijen: alle geselecteerde spelers + eventuele doelpuntenmakers die (niet
  // meer) in de selectie zitten, zodat hun doelpunten nooit onzichtbaar worden.
  const known = new Map<string, { id: string; name: string; number: number | null }>(
    playerStates.map(ps => [ps.player.id, ps.player])
  );
  for (const g of goals) if (!known.has(g.player.id)) known.set(g.player.id, g.player);
  const players = Array.from(known.values());
  const goalCount = (pid: string) => goals.filter(g => g.player.id === pid).length;
  const sorted = [...players].sort((a, b) => {
    const d = goalCount(b.id) - goalCount(a.id);
    if (d !== 0) return d;
    return (a.number ?? 99) - (b.number ?? 99);
  });

  return (
    <div className="md-playtime-summary">
      <div className="md-section-header" style={{ marginBottom: 12 }}>
        <span className="md-section-title">Doelpuntenmakers</span>
        <span className="md-section-count">{goals.length}</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Speler</th>
              {quarters.map(n => <th key={n} style={{ textAlign: 'center' }}>K{n}</th>)}
              <th style={{ textAlign: 'center' }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const total = goalCount(p.id);
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {p.number ? `#${p.number} ` : ''}{p.name}
                  </td>
                  {quarters.map(n => {
                    const qGoals = goals.filter(g => g.player.id === p.id && g.periodNumber === n);
                    return (
                      <td key={n} style={{ textAlign: 'center' }}>
                        <div className="md-goal-step">
                          <button className="md-score-btn md-score-minus" disabled={busy || qGoals.length === 0}
                            title="Doelpunt verwijderen"
                            onClick={() => run(() => onRemoveGoal(qGoals[qGoals.length - 1].id, n))}>−</button>
                          <span className="md-goal-step-val">{qGoals.length}</span>
                          <button className="md-score-btn md-score-plus" disabled={busy}
                            title="Doelpunt toevoegen"
                            onClick={() => run(() => onAddGoal(p.id, n))}>+</button>
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 20, color: total > 0 ? 'var(--accent)' : 'var(--text-dim)' }}>{total}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={quarters.length + 2} style={{ color: 'var(--text-dim)', fontSize: 13, padding: 16 }}>Geen spelers in de selectie.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="md-lineup-info" style={{ marginTop: 8 }}>
        ⓘ Elk doelpunt telt automatisch mee in de kwart- en eindstand. Tegendoelpunten pas je aan via "Standen aanpassen".
      </div>
    </div>
  );
}

// ── PlayerSummaryTable ────────────────────────────────────────────────────────

function PlayerSummaryTable({ playerStates, sessions, periods, goals = [], title = "Speeltijden selectie", onSetManualPlaytime }: {
  playerStates: PlayerState[]; sessions: PlayTimeSession[]; periods: Period[];
  goals?: Goal[]; title?: string;
  onSetManualPlaytime: (attendanceId: string, minutes: number | null) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (playerStates.length === 0) return null;
  const sorted = [...playerStates].sort((a, b) => b.totalSeconds - a.totalSeconds);

  function startEdit(ps: PlayerState) {
    setEditingId(ps.attendance.id);
    setEditValue(String(Math.round(ps.totalSeconds / 60)));
  }

  async function saveEdit(attendanceId: string) {
    const minutes = Number(editValue.trim());
    if (!Number.isFinite(minutes) || minutes < 0) return;
    setEditingId(null);
    await onSetManualPlaytime(attendanceId, minutes);
  }

  return (
    <div className="md-playtime-summary">
      <div className="md-section-header" style={{ marginBottom: 12 }}>
        <span className="md-section-title">{title}</span>
        <span className="md-section-count">{sorted.length}</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Speler</th>
              <th className="hide-mobile">Pos.</th>
              {periods.map(p => <th key={p.id} className="hide-mobile" style={{ textAlign: 'right' }}>K{p.periodNumber}</th>)}
              <th style={{ textAlign: 'center' }}>⚽</th>
              <th style={{ textAlign: 'right' }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(ps => {
              const pctOfMax = sorted[0].totalSeconds > 0
                ? (ps.totalSeconds / sorted[0].totalSeconds) * 100
                : 0;
              return (
                <tr key={ps.player.id}>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 16, textAlign: 'right' }}>
                    {ps.player.number ? `#${ps.player.number}` : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{ps.player.name}</span>
                      <div className="md-playtime-bar">
                        <div className="md-playtime-bar-fill" style={{ width: `${pctOfMax}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="hide-mobile">
                    {ps.player.position && <span className="tag tag-black">{POSITION_LABELS[ps.player.position]}</span>}
                  </td>
                  {periods.map(p => {
                    const sec = sessions
                      .filter(s => s.attendance.id === ps.attendance.id && s.period === p.periodNumber)
                      .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
                    return (
                      <td key={p.id} className="hide-mobile" style={{ textAlign: 'right', fontFamily: 'var(--font-heading)', fontSize: 12, color: sec > 0 ? 'var(--text-mid)' : 'var(--text-dim)' }}>
                        {sec > 0 ? formatDuration(sec) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center' }}>
                    {(() => {
                      const cnt = goals.filter(g => g.player.id === ps.player.id).length;
                      return cnt > 0
                        ? <span className="md-summary-goals">{'⚽'.repeat(Math.min(cnt,4))}{cnt > 4 ? ` ×${cnt}` : ''}</span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>;
                    })()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {editingId === ps.attendance.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        <input
                          type="number" min={0} autoFocus
                          className="input-field md-score-inp" style={{ width: 56 }}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(ps.attendance.id); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>min</span>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(ps.attendance.id)}>✓</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        {ps.attendance.manualSeconds != null && (
                          <button className="btn btn-ghost btn-sm" title="Terug naar automatisch bijgehouden speeltijd"
                            onClick={() => onSetManualPlaytime(ps.attendance.id, null)} style={{ fontSize: 11 }}>↺</button>
                        )}
                        <span
                          style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 0, color: ps.attendance.manualSeconds != null ? 'var(--yellow)' : 'var(--white)' }}
                          title={ps.attendance.manualSeconds != null ? 'Handmatig ingegeven speeltijd' : undefined}
                        >
                          {formatDuration(ps.totalSeconds)}
                        </span>
                        <button className="btn btn-ghost btn-sm" title="Speeltijd handmatig ingeven" onClick={() => startEdit(ps)}>✏️</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ScoreModal ────────────────────────────────────────────────────────────────

function ScoreModal({ match, periods, onSave, onClose }: {
  match: Match; periods: Period[];
  onSave: (periodNumber: number, h: number, a: number) => void | Promise<void>; onClose: () => void;
}) {
  const homeLabel = useHomeLabel();
  // Toon altijd alle kwarten (ook die zonder Period-rij) — die worden bij het
  // opslaan aangemaakt. Geïndexeerd op kwartnummer i.p.v. Period-id.
  const quarters = Array.from({ length: TOTAL_PERIODS }, (_, i) => i + 1);
  const [scores, setScores] = useState<Record<number, { home: number; away: number }>>(
    Object.fromEntries(quarters.map(n => {
      const p = periods.find(pr => pr.periodNumber === n);
      return [n, { home: p?.scoreHome ?? 0, away: p?.scoreAway ?? 0 }];
    }))
  );
  const [saving, setSaving] = useState(false);
  // scoreHome/scoreAway in de data zijn de letterlijke thuis-/uitploeg-kolommen —
  // toon de eigen club hier altijd links, ongeacht welk letterlijk veld dat is,
  // zodat de volgorde overeenkomt met de banner erboven (zie ownScore/oppScore).
  const ownIsHome = match.location === 'home';
  const ownKey: 'home' | 'away' = ownIsHome ? 'home' : 'away';
  const oppKey: 'home' | 'away' = ownIsHome ? 'away' : 'home';

  const totalOwn = quarters.reduce((s, n) => s + (scores[n]?.[ownKey] ?? 0), 0);
  const totalOpp = quarters.reduce((s, n) => s + (scores[n]?.[oppKey] ?? 0), 0);

  async function handleSave() {
    setSaving(true);
    try {
      // Sequentieel: elke oproep herberekent de eindstand uit alle kwarten.
      for (const n of quarters) {
        const p = periods.find(pr => pr.periodNumber === n);
        const sc = scores[n];
        if (p && p.scoreHome === sc.home && p.scoreAway === sc.away) continue; // ongewijzigd
        await onSave(n, sc.home, sc.away);
      }
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Standen per kwart</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 700, letterSpacing: 0, color: 'var(--text-dim)' }}>
          <span style={{ width: 60, textAlign: 'center' }}>{homeLabel}</span>
          <span style={{ width: 16 }} />
          <span style={{ width: 60, textAlign: 'center' }}>{match.opponent}</span>
        </div>
        {quarters.map(n => (
          <div key={n} className="form-group">
            <label className="input-label">Kwart {n}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 22 }}
                value={scores[n]?.[ownKey] ?? 0}
                onChange={e => setScores(s => ({ ...s, [n]: { ...s[n], [ownKey]: Math.max(0, +e.target.value) } }))} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-dim)' }}>–</span>
              <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 22 }}
                value={scores[n]?.[oppKey] ?? 0}
                onChange={e => setScores(s => ({ ...s, [n]: { ...s[n], [oppKey]: Math.max(0, +e.target.value) } }))} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 700, letterSpacing: 0, color: 'var(--text-dim)' }}>
          <span>Eindstand</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)', letterSpacing: 0 }}>{totalOwn} – {totalOpp}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          ⓘ Doelpuntenmakers van KFC pas je aan in de tabel "Doelpuntenmakers" — dat past de stand mee aan.
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Annuleer</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── LineupPlanningSection ────────────────────────────────────────────────────

/** Splitst de opstelling-planning in twee tabs: de DEFINITIEVE opstelling
 * (PeriodLineupSelector — dit ís wat effectief gebruikt wordt bij het starten
 * van een kwart) en de VOORKEURSOPSTELLINGEN van de trainers (VoorkeurOpstellingPanel
 * — elke trainer zet onafhankelijk een voorstel klaar; "Toepassen" op een
 * voorstel maakt het meteen de definitieve opstelling voor dat kwart, waarna
 * automatisch teruggeschakeld wordt naar de "Definitief"-tab zodat het
 * resultaat meteen zichtbaar is). De voorkeur-tab verschijnt enkel wanneer de
 * ploeg effectief 2+ trainers heeft — bij een ploeg met 1 trainer is er niets
 * om te vergelijken en blijft enkel de definitieve opstelling zichtbaar,
 * exact zoals voorheen. */
function LineupPlanningSection({
  matchId, squadPlayers, attendances, fieldAssignments, periodLineups, onPreAssign, onSetPeriodLineup,
  onToggleAttendance, teamCategory, teamId, initialPeriod, teammates, trainer, onApplyProposal,
}: {
  matchId: string;
  squadPlayers: Player[];
  attendances: Attendance[];
  fieldAssignments: Record<number, Record<string, string>>;
  periodLineups: Record<number, string[]>;
  onPreAssign: (period: number, posKey: string, playerId: string | null) => void;
  onSetPeriodLineup: (period: number, playerIds: string[]) => void;
  onToggleAttendance: (playerId: string, selected: boolean) => Promise<void>;
  teamCategory?: string;
  teamId: string | null;
  initialPeriod?: number;
  teammates: { id: string; name: string }[];
  trainer: { id: string; name: string } | null;
  onApplyProposal: (period: number, assignment: Record<string, string>) => void;
}) {
  const [tab, setTab] = useState<'definitief' | 'voorkeur'>('definitief');
  const showTabs = !!trainer && teammates.length > 0 && squadPlayers.length > 0;

  return (
    <div>
      {showTabs && (
        <div className="md-plan-tabs">
          <button className={`md-plan-tab ${tab === 'definitief' ? 'active' : ''}`} onClick={() => setTab('definitief')}>
            📋 Definitieve opstelling
          </button>
          <button className={`md-plan-tab ${tab === 'voorkeur' ? 'active' : ''}`} onClick={() => setTab('voorkeur')}>
            👥 Voorkeur trainers
          </button>
        </div>
      )}
      {tab === 'voorkeur' && showTabs && trainer ? (
        <VoorkeurOpstellingPanel
          matchId={matchId}
          teamCategory={teamCategory ?? 'U13'}
          squadPlayers={squadPlayers}
          attendances={attendances}
          currentTrainerId={trainer.id}
          currentTrainerName={trainer.name}
          teammates={teammates}
          onApply={(period, assignment) => { onApplyProposal(period, assignment); setTab('definitief'); }}
        />
      ) : (
        <PeriodLineupSelector
          matchId={matchId}
          allPlayers={squadPlayers}
          attendances={attendances}
          fieldAssignments={fieldAssignments}
          periodLineups={periodLineups}
          onPreAssign={onPreAssign}
          onSetPeriodLineup={onSetPeriodLineup}
          teamCategory={teamCategory}
          teamId={teamId}
          initialPeriod={initialPeriod}
          onToggleAttendance={onToggleAttendance}
        />
      )}
    </div>
  );
}

// ── PeriodLineupSelector ─────────────────────────────────────────────────────

function PeriodLineupSelector({ matchId, allPlayers, attendances, fieldAssignments, periodLineups, onPreAssign, onSetPeriodLineup, onToggleAttendance, teamCategory, teamId, initialPeriod }: {
  matchId: string;
  allPlayers: Player[];
  attendances: Attendance[];
  fieldAssignments: Record<number, Record<string, string>>;
  periodLineups: Record<number, string[]>;
  onPreAssign: (period: number, posKey: string, playerId: string | null) => void;
  onSetPeriodLineup: (period: number, playerIds: string[]) => void;
  onToggleAttendance: (playerId: string, selected: boolean) => Promise<void>;
  teamCategory?: string;
  teamId: string | null;
  initialPeriod?: number;
}) {
  const [activePeriod, setActivePeriod] = useState(initialPeriod ?? 1);
  // Springt mee naar het volgende kwart wanneer dat wijzigt (bv. na "Einde
  // kwart") — zonder dit bleef het paneel, als het al open stond, op het
  // net-afgelopen kwart staan i.p.v. automatisch door te schakelen.
  useEffect(() => {
    if (initialPeriod != null) setActivePeriod(initialPeriod);
  }, [initialPeriod]);
  const [saving, setSaving] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [lineupView, setLineupView] = useState<'list' | 'field'>('field');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  // periodLineups komt rechtstreeks van de backend (via Matchday's state) —
  // zolang er voor GEEN enkel kwart al iets opgeslagen is, tonen we bij wijze
  // van startpunt alvast alle voor deze wedstrijd geselecteerde spelers (maar
  // dat wordt pas echt opgeslagen zodra de trainer effectief iets aanpast).
  const lineups: Record<number, Set<string>> = (() => {
    const allEmpty = [1, 2, 3, 4].every(p => (periodLineups[p]?.length ?? 0) === 0);
    const fallback = allEmpty ? attendances.filter(a => a.selected === 'true').map(a => a.player.id) : null;
    const result: Record<number, Set<string>> = {};
    for (let p = 1; p <= 4; p++) result[p] = new Set(fallback ?? periodLineups[p] ?? []);
    return result;
  })();

  function togglePlayer(playerId: string) {
    const next = new Set(lineups[activePeriod]);
    if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
    onSetPeriodLineup(activePeriod, Array.from(next));
  }

  function copyFromPrev() {
    if (activePeriod <= 1) return;
    onSetPeriodLineup(activePeriod, Array.from(lineups[activePeriod - 1]));
  }

  function selectAll() {
    onSetPeriodLineup(activePeriod, allPlayers.map(p => p.id));
  }

  function clearAll() {
    onSetPeriodLineup(activePeriod, []);
  }

  async function autoAssignLeastPlayed() {
    if (!teamId) return;
    setAutoAssigning(true);
    try {
      // 1. Fetch season playtime map (playerId → total seconds)
      const playtimeMap = await getTeamPlaytimeMap(teamId);

      // 2. Sort players by least playtime (ascending), keeper always first candidate for K slot
      const sorted = [...allPlayers].sort((a: Player, b: Player) =>
        (playtimeMap[a.id] ?? 0) - (playtimeMap[b.id] ?? 0)
      );

      // 3. Get field positions for this team's format
      const positions = getPositionsForCategory(teamCategory ?? 'U13');

      // 4. Assign players to positions by role match
      const newAssignment: Record<string, string> = {};
      const usedPlayerIds = new Set<string>();

      // Priority: first fill by role match, then fill remaining with any player
      const roleOrder: Array<'keeper' | 'defender' | 'midfielder' | 'forward'> =
        ['keeper', 'defender', 'midfielder', 'forward'];

      for (const role of roleOrder) {
        const positionsForRole = positions.filter(p => p.role === role);
        const playersForRole = sorted.filter(
          p => p.position === role && !usedPlayerIds.has(p.id)
        );
        // Assign best matching players
        for (let i = 0; i < positionsForRole.length; i++) {
          const player = playersForRole[i];
          if (player) {
            newAssignment[positionsForRole[i].key] = player.id;
            usedPlayerIds.add(player.id);
          }
        }
      }

      // 5. Fill any still-empty positions with least-played remaining players
      const remaining = sorted.filter(p => !usedPlayerIds.has(p.id));
      let ri = 0;
      for (const pos of positions) {
        if (!newAssignment[pos.key] && remaining[ri]) {
          newAssignment[pos.key] = remaining[ri].id;
          usedPlayerIds.add(remaining[ri].id);
          ri++;
        }
      }

      // 6. Apply assignment for ALL 4 periods
      for (let period = 1; period <= 4; period++) {
        Object.entries(newAssignment).forEach(([posKey, playerId]) => {
          onPreAssign(period, posKey, playerId);
        });
      }

      // 7. Update lineups so tab counters are correct
      const assignedIds = Object.values(newAssignment);
      for (let p = 1; p <= 4; p++) onSetPeriodLineup(p, assignedIds);
    } finally { setAutoAssigning(false); }
  }

  async function applyLineup() {
    setSaving(true);
    try {
      // Collect ALL selected player IDs from:
      //   a) the list-view lineups[1] set
      //   b) ALL players placed on the field for ANY period via fieldAssignments
      const selectedIds = new Set<string>(lineups[1]);

      // Also include anyone placed in any period's field assignment
      for (let p = 1; p <= 4; p++) {
        Object.values(fieldAssignments[p] || {}).forEach(pid => selectedIds.add(pid));
      }

      for (const p of allPlayers) {
        await onToggleAttendance(p.id, selectedIds.has(p.id));
      }

      // Also sync lineups so the tab counters reflect field assignments
      for (let p = 1; p <= 4; p++) {
        const fieldIds = Object.values(fieldAssignments[p] || {});
        if (fieldIds.length > 0) {
          const merged = new Set([...lineups[p], ...fieldIds]);
          onSetPeriodLineup(p, Array.from(merged));
        }
      }
    } finally { setSaving(false); }
  }

  const posOrder = ['keeper', 'defender', 'midfielder', 'forward'];
  const byPos: Record<string, Player[]> = {};
  allPlayers
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !filter || p.position === filter)
    .forEach(p => { const k = p.position || 'unknown'; (byPos[k] = byPos[k]||[]).push(p); });

  const curSet = lineups[activePeriod];
  const curCount = curSet.size;

  return (
    <div className="md-lineup-selector">
      <div className="md-lineup-header">
        <div>
          <div className="md-lineup-title">Opstelling per kwart</div>
          <div className="md-lineup-sub">Stel per kwart in welke spelers op het veld staan bij de aftrap</div>
        </div>
        <div className="md-lineup-header-btns">
          <button
            className="btn btn-outline btn-sm md-auto-btn"
            disabled={autoAssigning || saving}
            onClick={autoAssignLeastPlayed}
            title="Vult automatisch het veld met spelers die deze week het minst gespeeld hebben"
          >
            {autoAssigning ? '⏳ Laden...' : '⚡ Auto (minste speeltijd)'}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={applyLineup}>
            {saving ? 'Opslaan...' : '✓ Bevestig'}
          </button>
        </div>
      </div>

      {/* Period tabs + view toggle */}
      <div className="md-lineup-tabs-row">
        <div className="md-lineup-tabs">
          {[1,2,3,4].map(n => (
            <button
              key={n}
              className={`md-lineup-tab ${activePeriod === n ? 'active' : ''}`}
              onClick={() => setActivePeriod(n)}
            >
              <span>Kwart {n}</span>
              <span className="md-lineup-tab-count">{lineups[n].size}</span>
            </button>
          ))}
        </div>
        <div className="md-lineup-view-btns">
          <button className={`sb-toggle ${lineupView === 'list' ? 'active' : ''}`} onClick={() => setLineupView('list')}>📋 Lijst</button>
          <button className={`sb-toggle ${lineupView === 'field' ? 'active' : ''}`} onClick={() => setLineupView('field')}>⚽ Veld</button>
        </div>
      </div>

      {/* Field view */}
      {lineupView === 'field' && (
        <div style={{ padding: '12px' }}>
          <FieldView
            matchId={matchId}
            period={activePeriod}
            periodStatus="idle"
            sessions={[]}
            attendances={attendances}
            allPlayers={allPlayers}
            tick={0}
            category={teamCategory ?? 'U13'}
            onRefresh={async () => {}}
            preAssignment={fieldAssignments[activePeriod] || {}}
            onPreAssign={(posKey, playerId) => {
              onPreAssign(activePeriod, posKey, playerId);
              // Sync de lineup zodat de tab-teller meteen bijwerkt
              const next = new Set(lineups[activePeriod]);
              if (playerId) {
                // Remove from any other position first (already handled by onPreAssign)
                next.add(playerId);
              } else {
                // Find which player was at this position and remove them
                const removedId = fieldAssignments[activePeriod]?.[posKey];
                if (removedId) {
                  // Only remove if they're not at another position
                  const otherPositions = Object.entries(fieldAssignments[activePeriod] || {})
                    .filter(([k, v]) => k !== posKey && v === removedId);
                  if (otherPositions.length === 0) next.delete(removedId);
                }
              }
              onSetPeriodLineup(activePeriod, Array.from(next));
            }}
          />
          <div className="md-lineup-info" style={{ marginTop: 8 }}>
            Sleep spelers naar posities of klik op een positie. Sla op met "Bevestig opstelling".
          </div>
        </div>
      )}

      {/* Toolbar (list view only) */}
      {lineupView === 'list' && <div className="md-lineup-toolbar">
        <input className="input-field md-lineup-search" placeholder="Zoek speler..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input-field md-lineup-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Alle posities</option>
          <option value="keeper">Doelman</option>
          <option value="defender">Verdediger</option>
          <option value="midfielder">Middenvelder</option>
          <option value="forward">Aanvaller</option>
        </select>
        <div className="md-lineup-quick">
          {activePeriod > 1 && <button className="btn btn-ghost btn-sm" onClick={copyFromPrev}>⬆ Kopieer kwart {activePeriod-1}</button>}
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>Alle</button>
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>Geen</button>
        </div>
      </div>} {/* end toolbar list-view */}

      {/* Player grid (list view only) */}
      {lineupView === 'list' && (
        <div className="md-lineup-body">
          <div className="md-lineup-left">
            {posOrder.filter(pos => byPos[pos]?.length).map(pos => (
              <div key={pos}>
                <div className="md-lineup-pos-header">
                  <span className="wb-pos-tag">{POSITION_LABELS[pos] || '??'}</span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: 0, color: 'var(--text-dim)' }}>
                    {pos === 'keeper' ? 'Doelman' : pos === 'defender' ? 'Verdediger' : pos === 'midfielder' ? 'Middenvelder' : 'Aanvaller'}
                  </span>
                </div>
                {byPos[pos].map(p => {
                  const sel = curSet.has(p.id);
                  return (
                    <button key={p.id} className={`md-lineup-player ${sel ? 'selected' : ''}`} onClick={() => togglePlayer(p.id)}>
                      <span className="md-lineup-player-num">{p.number ? `#${p.number}` : '—'}</span>
                      <span className="md-lineup-player-name">{p.name}</span>
                      <span className={`md-lineup-check ${sel ? 'on' : ''}`}>{sel ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {allPlayers.length === 0 && (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div className="empty-icon">👥</div>
                Nog geen spelers geselecteerd voor deze wedstrijd.<br />
                Ga naar Wedstrijden → Selectie om spelers toe te voegen.
              </div>
            )}
          </div>

          {/* Right panel: current lineup summary for all 4 periods */}
          <div className="md-lineup-right">
            {[1,2,3,4].map(n => (
              <div key={n} className={`md-lineup-summary-card ${n === activePeriod ? 'active' : ''}`}>
                <div className="md-lineup-summary-title">Kwart {n} <span className="md-lineup-summary-count">{lineups[n].size}</span></div>
                <div className="md-lineup-summary-names">
                  {allPlayers
                    .filter(p => lineups[n].has(p.id))
                    .sort((a,b) => (a.number??99)-(b.number??99))
                    .map(p => (
                      <span key={p.id} className="md-lineup-summary-pill">
                        {p.number ? `#${p.number}` : ''} {p.name}
                      </span>
                    ))
                  }
                  {lineups[n].size === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Geen spelers</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lineupView === 'list' && (
        <div className="md-lineup-info">
          ⓘ Druk op "Bevestig opstelling" om kwart 1 als startopstelling in te stellen. Gebruik het veldoverzicht om posities te bepalen.
        </div>
      )}
    </div>
  );
}


// ── MatchPicker ───────────────────────────────────────────────────────────────

function MatchPicker({ matches, current, onPick, onClose }: {
  matches: Match[]; current?: Match;
  onPick: (m: Match) => void; onClose: () => void;
}) {
  const upcoming = matches.filter(m => m.status !== 'finished').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const finished = matches.filter(m => m.status === 'finished').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-title">Kies wedstrijd</div>
        {upcoming.length > 0 && (
          <><div className="input-label" style={{ marginBottom: 8 }}>Gepland / Live</div>
          {upcoming.map(m => (
            <button key={m.id} className={`sub-player-btn ${current?.id === m.id ? 'selected' : ''}`} onClick={() => onPick(m)}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--text-dim)', width: 70 }}>{fmt(m.date)}</span>
              <span className="sub-name">vs. {m.opponent}</span>
              <span className={`tag ${m.location === 'home' ? 'tag-red' : 'tag-black'}`} style={{ fontSize: 10 }}>{m.location === 'home' ? 'T' : 'U'}</span>
              {m.status === 'active' && <span className="tag tag-green" style={{ fontSize: 10 }}>LIVE</span>}
            </button>
          ))}</>
        )}
        {finished.length > 0 && (
          <><div className="input-label" style={{ marginTop: 16, marginBottom: 8 }}>Recente wedstrijden</div>
          {finished.map(m => (
            <button key={m.id} className={`sub-player-btn ${current?.id === m.id ? 'selected' : ''}`} onClick={() => onPick(m)}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--text-dim)', width: 70 }}>{fmt(m.date)}</span>
              <span className="sub-name">vs. {m.opponent}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--accent)', letterSpacing: 0 }}>{m.scoreHome}–{m.scoreAway}</span>
            </button>
          ))}</>
        )}
        <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Sluiten</button></div>
      </div>
    </div>
  );
}
