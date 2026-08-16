import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getMatches, getPlayers, getAttendancesForMatch, setAttendance,
  getPlayTimeSessionsForMatch, startPlayTimeSession, stopPlayTimeSession,
  updateMatch, getMatchOfTheWeek,
  getPeriodsForMatch, createPeriod, updatePeriod,
  getGoalsForMatch, addGoal, removeGoal,
  getPeriodLineup, setPeriodLineup,
  getFieldAssignment, setFieldAssignment,
  getTeamPlaytimeMap,
  updateSessionFieldPosition,
  Match, Player, Attendance, PlayTimeSession, Period, Goal,
  formatDuration, POSITION_LABELS, TOTAL_PERIODS,
} from '../lib/api';
import './Matchday.css';
import FieldView, { PositionTimeStats } from './FieldView';
import { getPositionsForCategory, getPeriodDuration } from '../lib/teamConfig';
import { useTeam } from '../lib/TeamContext';
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

export default function Matchday() {
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

  const [fieldAssignments, setFieldAssignments] = useState<Record<number, Record<string, string>>>(() => {
    // Will be populated from localStorage once matchId is known
    return { 1: {}, 2: {}, 3: {}, 4: {} };
  });
  const [tick, setTick]                 = useState(0);
  const [subModal, setSubModal]         = useState<PlayerState | null>(null);
  const [matchPicker, setMatchPicker]   = useState(false);
  const [scoreModal, setScoreModal]     = useState(false);
  // De opstelling-planner (kwart 1-4) blijft na de aftrap enkel INklapbaar
  // bereikbaar i.p.v. volledig te verdwijnen — de opgeslagen opstellingen voor
  // kwart 2-4 blijven altijd intact (localStorage), maar zonder dit paneel was
  // er tijdens de match geen enkele manier meer om ze te bekijken of te wijzigen.
  const [showLineupPlanner, setShowLineupPlanner] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Boot ────────────────────────────────────────────────────────────────────

  useEffect(() => { boot(); return stopTimer; }, []);

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

  async function boot() {
    setLoading(true);
    try {
      const tid = teamId ?? undefined;
      const [matches, players] = await Promise.all([getMatches(tid), getPlayers(tid)]);
      setAllMatches(matches);
      setAllPlayers(players.filter(p => p.active === 'true'));
      const motw = getMatchOfTheWeek(matches);
      if (motw) await loadMatch(motw, players.filter(p => p.active === 'true'));
      else { setMatch(null); setLoading(false); }
    } catch (e) { console.error(e); setLoading(false); }
  }

  async function loadMatch(m: Match, players?: Player[]) {
    setMatch(m);
    const [att, sess, per, gls] = await Promise.all([
      getAttendancesForMatch(m.id),
      getPlayTimeSessionsForMatch(m.id),
      getPeriodsForMatch(m.id),
      getGoalsForMatch(m.id),
    ]);
    setAttendances(att);
    setSessions(sess);
    setPeriods(per);
    setGoals(gls);
    if (players) setAllPlayers(players);
    // Load per-period field assignments from localStorage
    const fas: Record<number, Record<string, string>> = {};
    for (let p = 1; p <= 4; p++) fas[p] = getFieldAssignment(m.id, p);
    setFieldAssignments(fas);
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
      const savedLineup = getPeriodLineup(match.id, periodNumber);

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

  /** Pause: stop all active sessions, mark period as paused */
  async function pausePeriod() {
    if (!match) return;
    setBusy(true);
    try {
      const activeSess = sessions.filter(s => s.active === 'true');
      for (const s of activeSess) await stopPlayTimeSession(s.id, s.startTime);

      // Mark period end time
      const period = periods.find(p => p.periodNumber === match.currentPeriod);
      if (period) await updatePeriod(period.id, { endTime: new Date().toISOString() });

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

  // ── Player time ────────────────────────────────────────────────────────────

  // Only count the live (ticking) portion when the session is truly active.
  // A player on the bench has no active session — their timer shows completed seconds only.
  function getLiveSeconds(attId: string): number {
    void tick;
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
      const fieldAssign = fieldAssignments[periodNum] || getFieldAssignment(match.id, periodNum);

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
      teamName: trainer?.team?.name ?? 'KFC Lennik',
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

  function handlePreAssign(period: number, posKey: string, playerId: string | null) {
    setFieldAssignments(prev => {
      const next = { ...prev, [period]: { ...prev[period] } };
      if (playerId === null) {
        delete next[period][posKey];
      } else {
        // Remove player from any other position in this period
        Object.keys(next[period]).forEach(k => { if (next[period][k] === playerId) delete next[period][k]; });
        next[period][posKey] = playerId;
      }
      setFieldAssignment(m!.id, period, next[period]);
      return next;
    });
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  async function handleAddGoal(ps: PlayerState) {
    if (!match) return;
    setBusyPlayer(ps.player.id);
    try {
      await addGoal(match.id, ps.player.id, match.currentPeriod || 1, match.location);
      // Refresh both sessions/periods (score changed) and match totals
      await refresh();
      await refreshMatch();
    } finally { setBusyPlayer(null); }
  }

  async function handleRemoveGoal(goalId: string, periodNumber: number) {
    if (!match) return;
    await removeGoal(goalId, match.id, periodNumber, match.location);
    await refresh();
    await refreshMatch();
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
      <div className="md-empty-title">Geen wedstrijd</div>
      <p className="md-empty-sub">Geen geplande wedstrijd gevonden.</p>
      <button className="btn btn-outline" onClick={() => setMatchPicker(true)}>Kies een wedstrijd</button>
      {matchPicker && <MatchPicker matches={allMatches} onPick={async m => { setMatchPicker(false); setLoading(true); await loadMatch(m); }} onClose={() => setMatchPicker(false)} />}
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
  // addGoal ze ook weg, o.b.v. match.location) — voor weergave naast "KFC Lennik"
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
            KFC Lennik <span className="md-vs-sep">vs</span> {m!.opponent}
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
            <button className="btn btn-outline btn-sm" onClick={() => setMatchPicker(true)}>📋</button>
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
        <PeriodLineupSelector
          matchId={m!.id}
          allPlayers={squadPlayers}
          attendances={attendances}
          fieldAssignments={fieldAssignments}
          onPreAssign={handlePreAssign}
          teamCategory={matchCategory}
          teamId={teamId}
          onToggleAttendance={async (playerId, sel) => {
            await setAttendance(m!.id, playerId, true, sel);
            await refresh();
          }}
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
            <PeriodLineupSelector
              matchId={m!.id}
              allPlayers={squadPlayers}
              attendances={attendances}
              fieldAssignments={fieldAssignments}
              onPreAssign={handlePreAssign}
              teamCategory={matchCategory}
              teamId={teamId}
              initialPeriod={Math.min(curPeriod + 1, TOTAL_PERIODS)}
              onToggleAttendance={async (playerId, sel) => {
                await setAttendance(m!.id, playerId, true, sel);
                await refresh();
              }}
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
        <MatchSummary playerStates={playerStates} sessions={sessions} periods={periods} goals={goals} location={m!.location} />
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
            <p style={{ color: 'var(--text-dim)', marginBottom: 20, fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
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
        <ScoreModal match={m!} periods={periods} onSave={savePeriodScore} onClose={() => setScoreModal(false)} />
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
          <span className="md-score-team-label">KFC Lennik</span>
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
                      title="KFC Lennik" />
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

function MatchSummary({ playerStates, sessions, periods, goals, location }: {
  playerStates: PlayerState[]; sessions: PlayTimeSession[]; periods: Period[]; goals: Goal[]; location: string;
}) {
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
          <span className="md-summary-final">{totalOwn} – {totalOpp}</span>
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
                <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, letterSpacing: 1, whiteSpace: 'nowrap' }}>KFC Lennik</td>
                {periods.map(p => <td key={p.id} style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--red)', textAlign: 'center' }}>{p[ownField]}</td>)}
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--red)', textAlign: 'center' }}>{totalOwn}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, letterSpacing: 1, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Tegenstander</td>
                {periods.map(p => <td key={p.id} style={{ fontFamily: 'var(--font-display)', fontSize: 22, textAlign: 'center' }}>{p[oppField]}</td>)}
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 26, textAlign: 'center' }}>{totalOpp}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <PlayerSummaryTable playerStates={playerStates} sessions={sessions} periods={periods} goals={goals} title="Speeltijden per speler" />
    </div>
  );
}

// ── PlayerSummaryTable ────────────────────────────────────────────────────────

function PlayerSummaryTable({ playerStates, sessions, periods, goals = [], title = "Speeltijden selectie" }: {
  playerStates: PlayerState[]; sessions: PlayTimeSession[]; periods: Period[];
  goals?: Goal[]; title?: string;
}) {
  if (playerStates.length === 0) return null;
  const sorted = [...playerStates].sort((a, b) => b.totalSeconds - a.totalSeconds);

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
                  <td style={{ color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 16, textAlign: 'right' }}>
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
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--white)', letterSpacing: 1 }}>
                      {formatDuration(ps.totalSeconds)}
                    </span>
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
  onSave: (id: string, h: number, a: number) => void; onClose: () => void;
}) {
  const [scores, setScores] = useState<Record<string, { home: number; away: number }>>(
    Object.fromEntries(periods.map(p => [p.id, { home: p.scoreHome, away: p.scoreAway }]))
  );
  // scoreHome/scoreAway in de data zijn de letterlijke thuis-/uitploeg-kolommen —
  // toon "KFC Lennik" hier altijd links, ongeacht welk letterlijk veld dat is,
  // zodat de volgorde overeenkomt met de banner erboven (zie ownScore/oppScore).
  const ownIsHome = match.location === 'home';
  const ownKey: 'home' | 'away' = ownIsHome ? 'home' : 'away';
  const oppKey: 'home' | 'away' = ownIsHome ? 'away' : 'home';

  async function handleSave() {
    for (const [id, sc] of Object.entries(scores)) {
      onSave(id, sc.home, sc.away);
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Score per kwart</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          <span style={{ width: 60, textAlign: 'center' }}>KFC Lennik</span>
          <span style={{ width: 16 }} />
          <span style={{ width: 60, textAlign: 'center' }}>{match.opponent}</span>
        </div>
        {periods.map(p => (
          <div key={p.id} className="form-group">
            <label className="input-label">Kwart {p.periodNumber}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 22 }}
                value={scores[p.id]?.[ownKey] ?? 0}
                onChange={e => setScores(s => ({ ...s, [p.id]: { ...s[p.id], [ownKey]: +e.target.value } }))} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-dim)' }}>–</span>
              <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 22 }}
                value={scores[p.id]?.[oppKey] ?? 0}
                onChange={e => setScores(s => ({ ...s, [p.id]: { ...s[p.id], [oppKey]: +e.target.value } }))} />
            </div>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Annuleer</button>
          <button className="btn btn-primary" onClick={handleSave}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ── PeriodLineupSelector ─────────────────────────────────────────────────────

function PeriodLineupSelector({ matchId, allPlayers, attendances, fieldAssignments, onPreAssign, onToggleAttendance, teamCategory, teamId, initialPeriod }: {
  matchId: string;
  allPlayers: Player[];
  attendances: Attendance[];
  fieldAssignments: Record<number, Record<string, string>>;
  onPreAssign: (period: number, posKey: string, playerId: string | null) => void;
  onToggleAttendance: (playerId: string, selected: boolean) => Promise<void>;
  teamCategory?: string;
  teamId: string | null;
  initialPeriod?: number;
}) {
  const [activePeriod, setActivePeriod] = useState(initialPeriod ?? 1);
  const [lineups, setLineups] = useState<Record<number, Set<string>>>(() => {
    const init: Record<number, Set<string>> = {};
    for (let p = 1; p <= 4; p++) {
      init[p] = new Set(getPeriodLineup(matchId, p));
    }
    // If no lineups saved yet, pre-fill period 1 from current selected attendances
    if ([1,2,3,4].every(p => init[p].size === 0)) {
      const sel = attendances.filter(a => a.selected === 'true').map(a => a.player.id);
      sel.forEach(id => { for(let p=1;p<=4;p++) init[p].add(id); });
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [lineupView, setLineupView] = useState<'list' | 'field'>('field');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  function togglePlayer(playerId: string) {
    setLineups(prev => {
      const next = { ...prev, [activePeriod]: new Set(prev[activePeriod]) };
      if (next[activePeriod].has(playerId)) next[activePeriod].delete(playerId);
      else next[activePeriod].add(playerId);
      setPeriodLineup(matchId, activePeriod, Array.from(next[activePeriod]));
      return next;
    });
  }

  function copyFromPrev() {
    if (activePeriod <= 1) return;
    setLineups(prev => {
      const src = new Set(prev[activePeriod - 1]);
      const next = { ...prev, [activePeriod]: src };
      setPeriodLineup(matchId, activePeriod, Array.from(src));
      return next;
    });
  }

  function selectAll() {
    const ids = allPlayers.map(p => p.id);
    setLineups(prev => {
      const next = { ...prev, [activePeriod]: new Set(ids) };
      setPeriodLineup(matchId, activePeriod, ids);
      return next;
    });
  }

  function clearAll() {
    setLineups(prev => {
      const next = { ...prev, [activePeriod]: new Set<string>() };
      setPeriodLineup(matchId, activePeriod, []);
      return next;
    });
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

      // 7. Update lineups state so tab counters are correct
      const assignedIds = Object.values(newAssignment);
      setLineups(prev => {
        const next = { ...prev };
        for (let p = 1; p <= 4; p++) {
          next[p] = new Set(assignedIds);
          setPeriodLineup(matchId, p, assignedIds);
        }
        return next;
      });
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

      // Also sync lineups state so the tab counters reflect field assignments
      setLineups(prev => {
        const next = { ...prev };
        for (let p = 1; p <= 4; p++) {
          const fieldIds = Object.values(fieldAssignments[p] || {});
          if (fieldIds.length > 0) {
            const merged = new Set([...prev[p], ...fieldIds]);
            next[p] = merged;
            setPeriodLineup(matchId, p, Array.from(merged));
          }
        }
        return next;
      });
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
              // Sync the lineups state so tab counter updates immediately
              setLineups(prev => {
                const next = { ...prev, [activePeriod]: new Set(prev[activePeriod]) };
                if (playerId) {
                  // Remove from any other position first (already handled by onPreAssign)
                  next[activePeriod].add(playerId);
                } else {
                  // Find which player was at this position and remove them
                  const removedId = fieldAssignments[activePeriod]?.[posKey];
                  if (removedId) {
                    // Only remove if they're not at another position
                    const otherPositions = Object.entries(fieldAssignments[activePeriod] || {})
                      .filter(([k, v]) => k !== posKey && v === removedId);
                    if (otherPositions.length === 0) next[activePeriod].delete(removedId);
                  }
                }
                setPeriodLineup(matchId, activePeriod, Array.from(next[activePeriod]));
                return next;
              });
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
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
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
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--red)', letterSpacing: 1 }}>{m.scoreHome}–{m.scoreAway}</span>
            </button>
          ))}</>
        )}
        <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Sluiten</button></div>
      </div>
    </div>
  );
}
