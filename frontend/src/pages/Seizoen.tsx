import { useEffect, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import { getSeasonStats, SeasonPlayerStats, formatDuration, POSITION_LABELS } from '../lib/api';
import './Seizoen.css';

export default function Seizoen() {
  const [stats, setStats]       = useState<SeasonPlayerStats[]>([]);
  const { teamId } = useTeam();
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView]         = useState<'players' | 'matrix'>('players');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setStats(await getSeasonStats()); } finally { setLoading(false); }
  }

  // All unique matches across all players (ordered by date)
  const allMatches = (() => {
    const seen = new Map<string, { matchId: string; opponent: string; date: string }>();
    stats.forEach(s => s.matchBreakdown.forEach(m => {
      if (!seen.has(m.matchId)) seen.set(m.matchId, m);
    }));
    return Array.from(seen.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  })();

  const totalMatchSec = stats.reduce((acc, s) => acc + s.totalSeconds, 0);
  const maxSec = stats[0]?.totalSeconds ?? 1;

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }); }
    catch { return ''; }
  }

  if (loading) return <div className="page"><div className="loading-spinner">Seizoen laden...</div></div>;

  return (
    <div className="page">
      <div className="sz-header">
        <div>
          <h1 className="page-title">Seizoensoverzicht</h1>
          <p className="page-subtitle">Speeltijden — alle wedstrijden</p>
        </div>
        <div className="sz-view-toggle">
          <button className={`sb-toggle ${view === 'players' ? 'active' : ''}`} onClick={() => setView('players')}>
            👤 Per speler
          </button>
          <button className={`sb-toggle ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>
            📊 Matrix
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="sz-stats">
        {[
          { label: 'Wedstrijden', value: allMatches.length },
          { label: 'Spelers',     value: stats.length },
          { label: 'Doelpunten',  value: stats.reduce((a,s) => a + s.totalGoals, 0) },
          { label: 'Totale tijd', value: formatDuration(totalMatchSec), wide: true },
        ].map(s => (
          <div key={s.label} className={`sz-stat ${s.wide ? 'wide' : ''}`}>
            <span className="sz-stat-val">{s.value}</span>
            <span className="sz-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {stats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          Nog geen afgelopen wedstrijden met speeltijddata
        </div>
      ) : view === 'players' ? (

        // ── PER PLAYER VIEW ──────────────────────────────────────────────────
        <div className="sz-player-list">
          {stats.map((s, i) => {
            const isOpen = expanded === s.player.id;
            const pct = (s.totalSeconds / maxSec) * 100;
            return (
              <div key={s.player.id} className="sz-player-card card">
                {/* Header row */}
                <button className="sz-player-header" onClick={() => setExpanded(isOpen ? null : s.player.id)}>
                  <span className="sz-rank">#{i + 1}</span>
                  <span className="sz-pnum">{s.player.number ? `#${s.player.number}` : '—'}</span>
                  <div className="sz-player-name-block">
                    <span className="sz-player-name">{s.player.name}</span>
                    {s.player.position && (
                      <span className={`sz-pos-pill sz-pos-${s.player.position}`}>{POSITION_LABELS[s.player.position]}</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="sz-bar-wrap">
                    <div className="sz-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="sz-total-time">{formatDuration(s.totalSeconds)}</span>
                  <span className="sz-match-count">{s.matchCount} wedstr.</span>
                  {s.totalGoals > 0 && (
                    <span className="sz-goal-badge">{'⚽'.repeat(Math.min(s.totalGoals,5))}{s.totalGoals > 5 ? ` ×${s.totalGoals}` : ''}</span>
                  )}
                  <span className="sz-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Period breakdown */}
                <div className="sz-period-strip">
                  {[1,2,3,4].map(n => (
                    <div key={n} className="sz-period-chip">
                      <span className="sz-period-chip-label">K{n}</span>
                      <span className="sz-period-chip-val">{formatDuration(s.periodBreakdown[n] || 0)}</span>
                    </div>
                  ))}
                </div>

                {/* Expanded: per-match breakdown */}
                {isOpen && (
                  <div className="sz-match-breakdown">
                    <div className="sz-breakdown-title">Speeltijd per wedstrijd</div>
                    {s.matchBreakdown.map(mb => (
                      <div key={mb.matchId} className="sz-match-row">
                        <span className="sz-match-date">{fmtDate(mb.date)}</span>
                        <span className="sz-match-opp">vs. {mb.opponent}</span>
                        <div className="sz-match-periods">
                          {[1,2,3,4].map(n => (
                            <span key={n} className={`sz-match-period ${(mb.periods[n] || 0) > 0 ? 'played' : ''}`}>
                              K{n}: {(mb.periods[n] || 0) > 0 ? formatDuration(mb.periods[n]) : '—'}
                            </span>
                          ))}
                        </div>
                        {mb.goals > 0 && <span className="sz-match-goals">{'⚽'.repeat(Math.min(mb.goals,4))}{mb.goals > 4 ? ` ×${mb.goals}` : ''}</span>}
                        <span className="sz-match-total">{formatDuration(mb.totalSeconds)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (

        // ── MATRIX VIEW ─────────────────────────────────────────────────────
        <div className="sz-matrix-wrap card">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table sz-matrix-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Speler</th>
                  {allMatches.map(m => (
                    <th key={m.matchId} style={{ textAlign: 'center', minWidth: 72 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>{fmtDate(m.date)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 }}>{m.opponent}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', minWidth: 80 }}>Totaal</th>
                  <th style={{ textAlign: 'center', minWidth: 52 }}>⚽</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.player.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--red)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                          {s.player.number ? `#${s.player.number}` : '—'}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{s.player.name}</span>
                      </div>
                    </td>
                    {allMatches.map(m => {
                      const mb = s.matchBreakdown.find(b => b.matchId === m.matchId);
                      const sec = mb?.totalSeconds ?? 0;
                      const intensity = sec > 0 ? Math.min(1, sec / (60 * 60)) : 0; // cap at 60min
                      return (
                        <td key={m.matchId} style={{ textAlign: 'center', padding: '8px 6px' }}>
                          <div className="sz-matrix-cell" style={{ '--intensity': intensity } as React.CSSProperties}>
                            {sec > 0 ? (
                              <span className="sz-matrix-time">{formatDuration(sec)}</span>
                            ) : (
                              <span className="sz-matrix-absent">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--white)' }}>
                        {formatDuration(s.totalSeconds)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {s.totalGoals > 0
                        ? <span className="sz-goal-badge-sm">{'⚽'.repeat(Math.min(s.totalGoals,4))}{s.totalGoals > 4 ? ` ×${s.totalGoals}` : ''}</span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      )}
    </div>
  );
}
