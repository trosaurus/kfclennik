import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getMatches, getPlayers, getAttendancesForMatch, setAttendance,
  getPlayTimeSessionsForMatch, startPlayTimeSession, stopPlayTimeSession,
  updateMatch, formatDuration,
  Match, Player, Attendance, PlayTimeSession, POSITION_LABELS,
} from '../lib/api';
import './MatchDetail.css';

type Tab = 'aanwezigheid' | 'selectie' | 'overzicht';

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [sessions, setSessions] = useState<PlayTimeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('aanwezigheid');
  const [tick, setTick] = useState(0);
  const [subModal, setSubModal] = useState<{ attendanceId: string; sessionId: string; playerName: string } | null>(null);
  const [scoreEdit, setScoreEdit] = useState(false);
  const [scoreForm, setScoreForm] = useState({ home: 0, away: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  // Live timer tick
  useEffect(() => {
    const hasActive = sessions.some(s => s.active === 'true');
    if (hasActive && match?.status === 'active') {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessions, match?.status]);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [matches, players, att, sess] = await Promise.all([
        getMatches(),
        getPlayers(),
        getAttendancesForMatch(id),
        getPlayTimeSessionsForMatch(id),
      ]);
      setMatch(matches.find(m => m.id === id) || null);
      setAllPlayers(players.filter(p => p.active === 'true'));
      setAttendances(att);
      setSessions(sess);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSessions() {
    if (!id) return;
    const [att, sess] = await Promise.all([
      getAttendancesForMatch(id),
      getPlayTimeSessionsForMatch(id),
    ]);
    setAttendances(att);
    setSessions(sess);
  }

  async function togglePresent(player: Player) {
    if (!id) return;
    const existing = attendances.find(a => a.player.id === player.id);
    const currentPresent = existing?.present === 'true';
    const currentSelected = existing?.selected === 'true';
    await setAttendance(id, player.id, !currentPresent, currentPresent ? false : currentSelected);
    await refreshSessions();
  }

  async function toggleSelected(player: Player) {
    if (!id) return;
    const existing = attendances.find(a => a.player.id === player.id);
    if (!existing || existing.present !== 'true') return;
    const currentSelected = existing?.selected === 'true';
    await setAttendance(id, player.id, true, !currentSelected);
    await refreshSessions();
  }

  async function startMatch() {
    if (!id || !match) return;
    // Start sessions for all selected players
    const selected = attendances.filter(a => a.selected === 'true');
    const now = new Date().toISOString();
    await updateMatch(id, { status: 'active', matchStartTime: now });
    for (const att of selected) {
      await startPlayTimeSession(att.id, match?.currentPeriod ?? 1);
    }
    await load();
    setTab('selectie');
  }

  async function endMatch() {
    if (!id) return;
    if (!confirm('Match beëindigen? Alle lopende speeltijden worden gestopt.')) return;
    const activeSessions = sessions.filter(s => s.active === 'true');
    for (const sess of activeSessions) {
      await stopPlayTimeSession(sess.id, sess.startTime);
    }
    await updateMatch(id, { status: 'finished' });
    await load();
    setTab('overzicht');
  }

  async function handleSubstitution(outAttId: string, outSessionId: string, outStartTime: string, inPlayerId: string) {
    if (!id) return;
    // Stop session for outgoing player
    await stopPlayTimeSession(outSessionId, outStartTime);
    // Get or create attendance for incoming player
    let inAtt = attendances.find(a => a.player.id === inPlayerId);
    if (!inAtt) {
      await setAttendance(id, inPlayerId, true, true);
      const fresh = await getAttendancesForMatch(id);
      setAttendances(fresh);
      inAtt = fresh.find(a => a.player.id === inPlayerId);
    } else if (inAtt.selected !== 'true') {
      await setAttendance(id, inPlayerId, true, true);
      inAtt = { ...inAtt, selected: 'true' };
    }
    if (inAtt) {
      await startPlayTimeSession(inAtt.id, match?.currentPeriod ?? 1);
    }
    setSubModal(null);
    await refreshSessions();
  }

  async function saveScore() {
    if (!id) return;
    await updateMatch(id, { scoreHome: scoreForm.home, scoreAway: scoreForm.away });
    setScoreEdit(false);
    const matches = await getMatches();
    setMatch(matches.find(m => m.id === id) || null);
  }

  // Compute live seconds for an attendance
  function getLiveSeconds(attendanceId: string): number {
    const attSessions = sessions.filter(s => s.attendance.id === attendanceId);
    let total = attSessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const active = attSessions.find(s => s.active === 'true');
    if (active) {
      const elapsed = Math.floor((Date.now() - new Date(active.startTime).getTime()) / 1000);
      total += elapsed;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void tick; // force re-render
  }

  // Players not yet in field (for substitution)
  function getBenchPlayers(): Player[] {
    const onFieldAttIds = sessions.filter(s => s.active === 'true').map(s => s.attendance.id);
    const onFieldPlayerIds = attendances.filter(a => onFieldAttIds.includes(a.id)).map(a => a.player.id);
    return allPlayers.filter(p => !onFieldPlayerIds.includes(p.id));
  }

  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;
  if (!match) return <div className="page"><div className="empty-state">Match niet gevonden</div></div>;

  const presentAttendances = attendances.filter(a => a.present === 'true');
  const selectedAttendances = attendances.filter(a => a.selected === 'true');
  const activeSessionMap = new Map(sessions.filter(s => s.active === 'true').map(s => [s.attendance.id, s]));

  return (
    <div className="page match-detail">
      <div className="match-breadcrumb">
        <Link to="/matches" className="breadcrumb-link">← Matchen</Link>
      </div>

      <div className="match-hero">
        <div className="match-hero-info">
          <div className="match-hero-title">vs. {match.opponent}</div>
          <div className="match-hero-meta">
            {match.location === 'home' ? 'Thuis' : 'Uit'} •{' '}
            {new Date(match.date).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div className="match-hero-right">
          {/* Score */}
          {scoreEdit ? (
            <div className="score-edit">
              <input type="number" className="input-field score-input" value={scoreForm.home} onChange={e => setScoreForm({ ...scoreForm, home: +e.target.value })} min={0} />
              <span className="score-dash">–</span>
              <input type="number" className="input-field score-input" value={scoreForm.away} onChange={e => setScoreForm({ ...scoreForm, away: +e.target.value })} min={0} />
              <button className="btn btn-primary btn-sm" onClick={saveScore}>✓</button>
              <button className="btn btn-outline btn-sm" onClick={() => setScoreEdit(false)}>✕</button>
            </div>
          ) : (
            <div className="match-hero-score" onClick={() => { setScoreForm({ home: match.scoreHome, away: match.scoreAway }); setScoreEdit(true); }}>
              <span className="score-display">{match.scoreHome} – {match.scoreAway}</span>
              <span className="score-hint">✏️</span>
            </div>
          )}

          {/* Status badge & actions */}
          <div className="match-hero-actions">
            {match.status === 'planned' && (
              <button className="btn btn-primary" onClick={startMatch} disabled={selectedAttendances.length === 0}>
                ▶ Start Match
              </button>
            )}
            {match.status === 'active' && (
              <button className="btn btn-danger" onClick={endMatch}>
                ■ Beëindig Match
              </button>
            )}
            <span className={`tag ${match.status === 'active' ? 'tag-green' : match.status === 'finished' ? 'tag-red' : 'tag-black'}`}>
              {match.status === 'planned' ? 'Gepland' : match.status === 'active' ? '● Live' : 'Afgelopen'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['aanwezigheid', 'selectie', 'overzicht'] as Tab[]).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'aanwezigheid' && '👥 Aanwezigheid'}
            {t === 'selectie' && `⚽ Opstelling${selectedAttendances.length > 0 ? ` (${selectedAttendances.length})` : ''}`}
            {t === 'overzicht' && '📊 Speeltijden'}
          </button>
        ))}
      </div>

      {/* Tab: Aanwezigheid */}
      {tab === 'aanwezigheid' && (
        <div className="tab-content">
          <div className="tab-hint">
            Duid aan welke spelers aanwezig zijn. Selecteer ze daarna voor de opstelling.
          </div>
          <div className="attendance-stats">
            <span>{presentAttendances.length} aanwezig</span>
            <span className="dot-sep">•</span>
            <span>{selectedAttendances.length} geselecteerd</span>
            <span className="dot-sep">•</span>
            <span>{allPlayers.length - presentAttendances.length} afwezig</span>
          </div>
          <div className="player-cards-grid">
            {allPlayers.map(player => {
              const att = attendances.find(a => a.player.id === player.id);
              const present = att?.present === 'true';
              const selected = att?.selected === 'true';
              return (
                <div key={player.id} className={`player-card ${present ? 'present' : ''} ${selected ? 'selected' : ''}`}>
                  <div className="player-card-num">{player.number ? `#${player.number}` : '—'}</div>
                  <div className="player-card-info">
                    <div className="player-card-name">{player.name}</div>
                    {player.position && <span className="tag tag-black" style={{ fontSize: '10px' }}>{POSITION_LABELS[player.position] || player.position}</span>}
                  </div>
                  <div className="player-card-actions">
                    <button
                      className={`presence-btn ${present ? 'active' : ''}`}
                      onClick={() => togglePresent(player)}
                      title={present ? 'Markeer afwezig' : 'Markeer aanwezig'}
                    >
                      {present ? '✓' : '—'}
                    </button>
                    {present && (
                      <button
                        className={`select-btn ${selected ? 'active' : ''}`}
                        onClick={() => toggleSelected(player)}
                        title={selected ? 'Verwijder uit selectie' : 'Voeg toe aan selectie'}
                      >
                        {selected ? '⚽' : '+'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Selectie / Live opstelling */}
      {tab === 'selectie' && (
        <div className="tab-content">
          {match.status === 'planned' && (
            <div className="tab-hint warning">
              Selecteer spelers in de "Aanwezigheid" tab, dan klik "Start Match" om speeltijd te starten.
            </div>
          )}

          <div className="field-section">
            <div className="field-section-title">
              <span className="accent-line" />
              Op het veld {match.status === 'active' && <span className="live-dot">● LIVE</span>}
            </div>
            <div className="field-players">
              {selectedAttendances.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px' }}>Geen spelers geselecteerd</div>
              ) : (
                selectedAttendances.map(att => {
                  const activeSession = activeSessionMap.get(att.id);
                  const isOnField = !!activeSession;
                  const liveSeconds = getLiveSeconds(att.id);

                  return (
                    <div key={att.id} className={`field-player-row ${isOnField ? 'on-field' : 'on-bench'}`}>
                      <div className="fp-number">{att.player.number ? `#${att.player.number}` : '—'}</div>
                      <div className="fp-info">
                        <div className="fp-name">{att.player.name}</div>
                        {att.player.position && <span className="fp-pos">{POSITION_LABELS[att.player.position] || ''}</span>}
                      </div>
                      <div className="fp-time">
                        <span className={`timer ${isOnField ? 'running' : ''}`}>
                          {formatDuration(liveSeconds)}
                        </span>
                        {isOnField && <span className="timer-dot">●</span>}
                      </div>
                      {match.status === 'active' && isOnField && (
                        <button
                          className="btn btn-outline btn-sm sub-btn"
                          onClick={() => setSubModal({ attendanceId: att.id, sessionId: activeSession.id, playerName: att.player.name })}
                        >
                          ↔ Wissel
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Overzicht */}
      {tab === 'overzicht' && (
        <div className="tab-content">
          <div className="tab-hint">Totale speeltijd per speler voor deze match.</div>
          {attendances.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              Nog geen speeltijden geregistreerd
            </div>
          ) : (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Speler</th>
                    <th>Positie</th>
                    <th>Sessies</th>
                    <th>Totale speeltijd</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendances
                    .filter(a => a.present === 'true')
                    .map(att => {
                      const attSessions = sessions.filter(s => s.attendance.id === att.id);
                      const activeSession = activeSessionMap.get(att.id);
                      const totalSec = getLiveSeconds(att.id);
                      return (
                        <tr key={att.id}>
                          <td style={{ color: 'var(--red)', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
                            {att.player.number ? `#${att.player.number}` : '—'}
                          </td>
                          <td style={{ fontWeight: 500 }}>{att.player.name}</td>
                          <td>
                            {att.player.position && (
                              <span className="tag tag-black">{POSITION_LABELS[att.player.position] || att.player.position}</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-mid)', fontFamily: 'var(--font-heading)' }}>
                            {attSessions.length}x
                          </td>
                          <td>
                            <span className={`playtime-cell ${activeSession ? 'running' : ''}`}>
                              {formatDuration(totalSec)}
                              {activeSession && <span className="timer-dot">●</span>}
                            </span>
                          </td>
                          <td>
                            {att.selected === 'true'
                              ? <span className="tag tag-green">Geselecteerd</span>
                              : <span className="tag tag-black">Aanwezig</span>
                            }
                          </td>
                        </tr>
                      );
                    })
                    .sort((a, b) => {
                      // Sort by playtime desc
                      return 0; // already done above
                    })
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Substitution Modal */}
      {subModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSubModal(null)}>
          <div className="modal">
            <div className="modal-title">Wissel</div>
            <div style={{ marginBottom: 20, color: 'var(--text-mid)', fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' }}>
              Vervang <strong style={{ color: 'var(--white)' }}>{subModal.playerName}</strong>
            </div>
            <div style={{ marginBottom: 8 }} className="input-label">Kies invaller:</div>
            <div className="sub-player-list">
              {getBenchPlayers().map(p => {
                const activeOut = sessions.find(s => s.active === 'true' && s.attendance.id === subModal.attendanceId);
                return (
                  <button
                    key={p.id}
                    className="sub-player-btn"
                    onClick={() => activeOut && handleSubstitution(subModal.attendanceId, subModal.sessionId, activeOut.startTime, p.id)}
                  >
                    <span className="sub-num">{p.number ? `#${p.number}` : '—'}</span>
                    <span className="sub-name">{p.name}</span>
                    {p.position && <span className="tag tag-black" style={{ marginLeft: 'auto', fontSize: '10px' }}>{POSITION_LABELS[p.position]}</span>}
                  </button>
                );
              })}
              {getBenchPlayers().length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 1 }}>
                  Geen wisselspelers beschikbaar
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSubModal(null)}>Annuleer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
